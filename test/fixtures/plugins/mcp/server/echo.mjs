import { createInterface } from "node:readline"

const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (frame) => process.stdout.write(`${JSON.stringify(frame)}\n`)

for await (const line of input) {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    continue
  }
  if (request === null || typeof request !== "object" || Array.isArray(request)) continue
  if (!Object.hasOwn(request, "id")) continue
  const { id } = request
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    send({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid request" } })
  } else if (request.method === "initialize") {
    const protocolVersion = request.params?.protocolVersion
    send({ jsonrpc: "2.0", id, result: {
      protocolVersion: typeof protocolVersion === "string" ? protocolVersion : "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "organization-tools", version: "1.0.0" }
    } })
  } else if (request.method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: [{
      name: "echo",
      description: "Return the supplied string value.",
      inputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false
      }
    }] } })
  } else if (request.method === "tools/call") {
    const value = request.params?.arguments?.value
    if (request.params?.name !== "echo" || typeof value !== "string") {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params" } })
    } else {
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `echo:${value}` }], isError: false } })
    }
  } else {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } })
  }
}
