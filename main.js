import {handleToken, listenAnalysis} from "./engine.js"
import {listenAuth} from "./oauth.js"
import {kv} from "./kv.js"

let argNames = ["cert", "key", "oauth-url", "host", "port", "lc0"]
let args = {}

let usage = (code = 1, log = console.error) =>
{
	let result = ""
	let line = (string = "") => result += string + "\n"
	
	line("leela-lichess usage:")
	line("   deno run --unstable -A .../main.js [options]")
	line()
	line("   --help, -h         : show this message")
	line("   --lc0=[file-name]  : file name of the Lc0 executable (default: 'lc0')")
	line("   --host=[name]      : hostname for the OAuth server (default: '0.0.0.0')")
	line("   --port=[number]    : port for the OAuth server (default: '80' or '443')")
	line("   --cert=[file-name] : PEM certificate file for TLS (if desired)")
	line("   --key=[file-name]  : PEM private key file for TLS (if desired)")
	line("   --oauth-url=[url]  : URL to the OAuth server (default: 'http://localhost/oauth')")
	
	log(result)
	Deno.exit(code)
}

outer:
for (let arg of Deno.args)
{
	if (arg === "--help" || arg === "-h")
		usage(0, console.log)
	
	for (let name of argNames)
	{
		if (arg.startsWith(`--${name}=`))
		{
			if (args[name])
			{
				console.error(`duplicate option: '--${name}'`)
				usage()
			}
			
			args[name] = arg.slice(name.length + 3)
			
			if (args[name] === "")
			{
				console.error(`empty option given: '--${name}'`)
				usage()
			}
			
			continue outer
		}
	}
	
	let name = argNames.find(name => `--${name}` === arg)
	console.error(`unknown argument: '${arg}'`)
	if (name) console.error(`hint: use '--${name}=[value]' rather than '--${name} [value]' (with an equals sign)`)
	usage()
}

let opts = {}

if (args.port)
{
	let port = Number(args.port)
	if (!Number.isInteger(port) || port <= 0 || port >= 0x10000)
	{
		console.error(`invalid port specified: ${args.port}`)
		usage()
	}
	
	opts.port = port
}

if (args.cert || args.key)
{
	if (!args.cert)
	{
		console.error("no '--cert=[file-name]' specified")
		usage()
	}

	if (!args.key)
	{
		console.error("no '--key=[file-name]' specified")
		usage()
	}
	
	opts.cert = await Deno.readTextFile(args.cert)
	opts.key = await Deno.readTextFile(args.key)
}

args.host ??= "0.0.0.0"
args["oauth-url"] ??= `${args.cert ? "https" : "http"}://localhost:${opts.port}/oauth`

args.lc0 ??= "lc0"

let forever = async action =>
{
	while (true) await action().catch(console.trace)
}

for await (let {key} of kv.list({prefix: ["lichess engine ids"]}))
{
	if (key.length !== 2) continue
	handleToken(key[1]).catch(console.trace)
}

forever(() => listenAuth({host: args.host, redirectURL: args["oauth-url"], ...opts}))
forever(() => listenAnalysis({fileName: args.lc0}))
