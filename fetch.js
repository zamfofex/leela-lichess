export let get = (endpoint, body, token, method = "GET") =>
{
	let headers = {authorization: token, "content-type": "application/json"}
	if (body) body = JSON.stringify(body)
	return fetch(endpoint, {method, headers, body}).catch(console.trace)
}

export let post = (endpoint, body, token) => get(endpoint, body, token, "POST")
