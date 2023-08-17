import {post} from "./fetch.js"
import {kv} from "./kv.js"
import {handleToken} from "./engine.js"
import {base, oauthBase, helpURL, completedURL, clientID} from "./config.js"

let alphabet = ""
for (let i = 0 ; i < 26 ; i++)
	alphabet += String.fromCodePoint(0x41 + i)
for (let i = 0 ; i < 26 ; i++)
	alphabet += String.fromCodePoint(0x61 + i)
for (let i = 0 ; i < 10 ; i++)
	alphabet += String.fromCodePoint(0x30 + i)
alphabet += "-_"

let createState = () =>
{
	let bytes = new Uint8Array(128)
	crypto.getRandomValues(bytes)
	return [...bytes].map(byte => alphabet[byte % 64]).join("")
}

let base64 = bytes =>
{
	let bits = [...bytes].map(byte => byte.toString(0b10).padStart(8, "0")).join("")
	if (bits.length === 0) return ""
	return bits.match(/[01]{1,6}/g).map(bits => alphabet[Number.parseInt(bits.padEnd(6, "0"), 2)]).join("")
}

let encoder = new TextEncoder()

let decline = () => Response.redirect(helpURL, 303)

let verifiers = new Map()

export let listenAuth = async ({host = "0.0.0.0", cert, key, port = key ? 443 : 80, redirectURL} = {}) =>
{
	console.log("waiting for oauth requests...")
	
	redirectURL = new URL(redirectURL).href
	
	let options
	if (key) options = {hostname: host, port, cert, key}
	else options = {hostname: host, port}
	
	let server = Deno.serve(
		options,
		request =>
		{
			let url = new URL(request.url)
			
			if (request.method === "GET" && url.pathname === "/oauth")
				return handleAuthCode(request, redirectURL).catch(console.trace)
			
			if (request.method === "POST" && url.pathname === "/")
				return handleAuthRequest(request, redirectURL).catch(console.trace)
			
			return decline()
		},
	)
	
	await server.finished
}

let handleAuthRequest = async (request, redirectURL) =>
{
	let url = new URL(request.url)
	if (url.search) return decline()
	
	let verifier = createState()
	let state = createState()
	let challenge = base64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))))
	
	let parameters = new URLSearchParams()
	parameters.set("response_type", "code")
	parameters.set("client_id", clientID)
	parameters.set("redirect_uri", redirectURL)
	parameters.set("code_challenge_method", "S256")
	parameters.set("code_challenge", challenge)
	parameters.set("scope", "engine:write")
	parameters.set("state", state)
	
	verifiers.set(state, verifier)
	setTimeout(() => verifiers.delete(state), 500000)
	
	return Response.redirect(`${oauthBase}?${parameters}`, 303)
}

let handleAuthCode = async (request, redirectURL) =>
{
	let url = new URL(request.url)
	let parameters = url.searchParams
	
	let state = parameters.get("state")
	let verifier = verifiers.get(state)
	verifiers.delete(state)
	
	if (!verifier) return decline()
	
	let code = parameters.get("code")
	if (!code) return decline()
	
	let response = await post(`${base}/token`,
	{
		code,
		grant_type: "authorization_code",
		code_verifier: verifier,
		redirect_uri: redirectURL,
		client_id: clientID
	})
	
	if (!response) return decline()
	if (!response.ok) return decline()
	
	let json = await response.json()
	if (!json.token_type) return decline()
	if (!json.access_token) return decline()
	
	handleToken(`${json.token_type} ${json.access_token}`).catch(console.trace)
	
	return Response.redirect(completedURL, 303)
}
