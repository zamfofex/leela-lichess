import {get, post} from "./fetch.js"
import {kv} from "./kv.js"
import {base, engineBase} from "./config.js"

let depth = 6

let encoder = new TextEncoder()

let secret
let entry = await kv.get(["lc0 secret"])
if (entry.value)
{
	secret = entry.value
}
else
{
	let bytes = new Uint8Array(64)
	crypto.getRandomValues(bytes)
	secret = [...bytes].map(byte => byte.toString(0x10).padStart(2, "0")).join("").toUpperCase()
	await kv.set(["lc0 secret"], secret)
}

export let handleToken = async token =>
{
	let update = async (endpoint, method) =>
	{
		let response = await get(endpoint,
		{
			name: "Leela Chess Zero",
			maxThreads: navigator.hardwareConcurrency,
			maxHash: 1024,
			defaultDepth: depth,
			variants: ["chess"],
			providerSecret: secret,
		}, token, method)
		
		if (!response)
		{
			console.trace("network error")
			return
		}
		
		if (!response.ok)
		{
			let value = await response.json()
			if (value.error === "No such token") await kv.delete(["lichess engine ids", token])
			else console.trace(value)
			return
		}
		
		return response
	}
	
	let entry = await kv.get(["lichess engine ids", token])
	let id = entry.value
	
	if (id)
	{
		let response = await update(`${base}/external-engine/${id}`, "PUT")
		if (!response || !response.ok)
		{
			console.trace("could not update engine")
			return
		}
	}
	else
	{
		let response = await update(`${base}/external-engine`, "POST")
		if (!response || !response.ok)
		{
			console.trace("could not register engine")
			return
		}
		let json = await response.json().catch(console.trace)
		if (!json || !json.id)
		{
			console.trace("improper JSON")
			return
		}
		id = json.id
		await kv.set(["lichess engine ids", token], id)
	}
}

let setopt = (name, value) => `setoption name ${name} value ${value}\n`

let analyse = async (fileName, {id, work}) =>
{
	console.log(`starting analysis for id '${id}'...`)
	
	let uci = ""
	uci += setopt("UCI_Chess960", "true")
	uci += setopt("Threads", work.threads)
	uci += setopt("MultiPV", work.multiPv)
	
	uci += `position fen ${work.initialFen} moves ${work.moves.join(" ")}\n`
	if (work.infinite) uci += "go infinite\n"
	else uci += `go depth ${depth}\n`
	
	uci = encoder.encode(uci)
	
	let command = new Deno.Command(fileName, {stdin: "piped", stdout: "piped", stderr: "null"})
	let process = command.spawn()
	
	let writer = process.stdin.getWriter()
	if (await writer.write(uci).catch(() => true))
	{
		console.trace(`could not analyse id '${id}': could not start engine`)
		process.kill()
		return
	}
	
	console.log(`analysis started for id '${id}'...`)
	let response = await fetch(`${engineBase}/external-engine/work/${id}`, {method: "POST", body: process.stdout}).catch(console.trace)
	
	if (!response || !response.ok)
	{
		console.trace(`could not analyse id '${id}': could not connect to Lichess`)
		process.kill()
		return
	}
	
	for await (let chunk of response.body)
	{
	}
	
	process.kill()
	console.log(`analysis completed for id '${id}'`)
}

export let listenAnalysis = async ({fileName = "lc0"} = {}) =>
{
	console.log("waiting for analysis requests...")
	while (true)
	{
		let response = await post(`${engineBase}/external-engine/work`, {providerSecret: secret})
		if (!response) continue
		if (!response.ok) continue
		if (response.status === 204) continue
		
		let json = await response.json().catch(console.trace)
		if (!json) continue
		
		if (!json.id) continue
		if (!json.work) continue
		
		analyse(fileName, json)
	}
}
