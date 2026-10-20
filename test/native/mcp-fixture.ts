import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { Match, Schema } from "effect"

const RpcRequest = Schema.Struct({
	jsonrpc: Schema.Literal("2.0"),
	id: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.String])),
	method: Schema.NonEmptyString,
	params: Schema.optionalKey(Schema.Unknown)
})

const InitializeParams = Schema.Struct({ protocolVersion: Schema.NonEmptyString })
const ToolCallParams = Schema.Struct({
	name: Schema.Literal("fixture_echo"),
	arguments: Schema.Struct({ value: Schema.String })
})

type RpcRequest = typeof RpcRequest.Type
type RpcId = RpcRequest["id"]

type FixtureResult =
	| { readonly type: "reply"; readonly id: RpcId; readonly result: unknown; readonly protocolVersion: string }
	| { readonly type: "notification"; readonly protocolVersion: string }
	| { readonly type: "error"; readonly id: RpcId; readonly protocolVersion: string }

export type McpFixture = {
	readonly url: string
	readonly events: () => ReadonlyArray<string>
	readonly toolCalls: () => ReadonlyArray<string>
	readonly close: () => Promise<void>
}

const requestBody = (request: IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
	let body = ""
	request.setEncoding("utf8")
	request.on("data", (chunk: string) => { body += chunk })
	request.once("end", () => resolve(body))
	request.once("error", reject)
})

const responseProtocolVersion = (request: IncomingMessage): string => {
	const value = request.headers["mcp-protocol-version"]
	return typeof value === "string" ? value : "2025-06-18"
}

const handleRpc = (
	request: RpcRequest,
	events: Array<string>,
	toolCalls: Array<string>,
	protocolVersion: string
): FixtureResult => Match.value(request.method).pipe(
	Match.when("initialize", () => {
		const params = Schema.decodeUnknownSync(InitializeParams)(request.params)
		events.push("initialize")
		return {
			type: "reply",
			id: request.id,
			protocolVersion: params.protocolVersion,
			result: {
				protocolVersion: params.protocolVersion,
				capabilities: { tools: {} },
				serverInfo: { name: "pluginsdk-loopback-mcp", version: "1.0.0" }
			}
		} satisfies FixtureResult
	}),
	Match.when("notifications/initialized", () => {
		events.push("notifications/initialized")
		return { type: "notification", protocolVersion } satisfies FixtureResult
	}),
	Match.when("tools/list", () => {
		events.push("tools/list")
		return {
			type: "reply",
			id: request.id,
			protocolVersion,
			result: {
				tools: [{
					name: "fixture_echo",
					description: "Return the supplied value to verify loopback MCP routing.",
					inputSchema: {
						type: "object",
						properties: { value: { type: "string" } },
						required: ["value"]
					}
				}]
			}
		} satisfies FixtureResult
	}),
	Match.when("tools/call", () => {
		const params = Schema.decodeUnknownSync(ToolCallParams)(request.params)
		events.push("tools/call")
		toolCalls.push(params.arguments.value)
		return {
			type: "reply",
			id: request.id,
			protocolVersion,
			result: {
				content: [{ type: "text", text: `loopback:${params.arguments.value}` }],
				isError: false
			}
		} satisfies FixtureResult
	}),
	Match.when("resources/list", () => {
		events.push("resources/list")
		return {
			type: "reply",
			id: request.id,
			protocolVersion,
			result: { resources: [] }
		} satisfies FixtureResult
	}),
	Match.when("resources/templates/list", () => {
		events.push("resources/templates/list")
		return {
			type: "reply",
			id: request.id,
			protocolVersion,
			result: { resourceTemplates: [] }
		} satisfies FixtureResult
	}),
	Match.when("prompts/list", () => {
		events.push("prompts/list")
		return {
			type: "reply",
			id: request.id,
			protocolVersion,
			result: { prompts: [] }
		} satisfies FixtureResult
	}),
	Match.when("ping", () => {
		events.push("ping")
		return {
			type: "reply",
			id: request.id,
			protocolVersion,
			result: {}
		} satisfies FixtureResult
	}),
	Match.orElse((): FixtureResult => {
		events.push(request.method)
		return request.id === undefined
			? { type: "notification", protocolVersion }
			: { type: "error", id: request.id, protocolVersion }
	})
)

const sendResult = (response: ServerResponse, id: RpcId, result: unknown, protocolVersion: string): void => {
	response.writeHead(200, {
		"content-type": "application/json; charset=utf-8",
		"mcp-protocol-version": protocolVersion
	})
	response.end(JSON.stringify({ jsonrpc: "2.0", id, result }))
}

const handleRequest = async (
	request: IncomingMessage,
	response: ServerResponse,
	events: Array<string>,
	toolCalls: Array<string>
): Promise<void> => {
	if (request.method !== "POST") {
		response.writeHead(405)
		response.end()
		return
	}

	try {
		const decoded = Schema.decodeUnknownSync(RpcRequest)(JSON.parse(await requestBody(request)))
		const result = handleRpc(decoded, events, toolCalls, responseProtocolVersion(request))
		Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
			reply: (value) => sendResult(response, value.id, value.result, value.protocolVersion),
			notification: () => {
				response.writeHead(202)
				response.end()
			},
			error: (value) => {
				response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
				response.end(JSON.stringify({
					jsonrpc: "2.0",
					id: value.id,
					error: { code: -32601, message: "Method not found" }
				}))
			}
		}))
	} catch {
		response.writeHead(400)
		response.end()
	}
}

const closeServer = (server: Server): Promise<void> => new Promise((resolve, reject) => {
	server.close((error) => error === undefined ? resolve() : reject(error))
})

export const startMcpFixture = async (): Promise<McpFixture> => {
	const events: Array<string> = []
	const toolCalls: Array<string> = []
	const server = createServer((request, response) => {
		void handleRequest(request, response, events, toolCalls)
	})
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject)
		server.listen(0, "127.0.0.1", resolve)
	})
	const address = server.address()
	if (address === null || typeof address === "string") {
		await closeServer(server)
		throw new Error("Loopback MCP fixture did not bind a TCP port")
	}
	return {
		url: `http://127.0.0.1:${address.port}/mcp`,
		events: () => [...events],
		toolCalls: () => [...toolCalls],
		close: () => closeServer(server)
	}
}
