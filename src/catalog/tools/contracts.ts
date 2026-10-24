import { Ajv2020 } from "ajv/dist/2020.js"
import { Match, Schema } from "effect"
import { ContractDigest } from "../../../contracts/Authorization.ts"
import { ContractRejected, McpContract, McpTool, ToolMetadataDigest } from "../../../contracts/ToolContract.ts"
import { commitment } from "../../internal/identity.ts"
import { normalizeTools } from "./model.ts"

const jsonSchema = new Ajv2020({ strict: false, validateFormats: false })
const encodeTool = Schema.encodeSync(McpTool)
const encodeContract = Schema.encodeSync(McpContract)

const validateSchema = (schema: Schema.JsonObject): void => {
  if (!jsonSchema.validateSchema(schema)) throw new TypeError("Tool JSON Schema structure is invalid")
}

export const captureContract = (input: McpContract): { readonly contract: McpContract; readonly digest: ContractDigest } => {
  const captured = Schema.decodeSync(Schema.toType(McpContract), { onExcessProperty: "error" })(structuredClone(input))
  for (const tool of captured.tools) {
    validateSchema(tool.inputSchema)
    if (tool.outputSchema !== undefined) {
      validateSchema(tool.outputSchema)
      Match.value(captured.protocol).pipe(
        Match.when("2025-11-25", () => {
          if (tool.outputSchema?.type !== "object") throw new TypeError("The declared MCP protocol requires an object output schema")
        }),
        Match.when("2026-07-28", () => undefined),
        Match.exhaustive
      )
    }
  }
  const normalized = normalizeTools({ tools: captured.tools.map((tool) => ({
    name: tool.name,
    digest: ToolMetadataDigest.make(commitment("mcp-tool", encodeTool(tool)))
  })) })
  return Match.value(normalized).pipe(Match.discriminatorsExhaustive("type")({
    rejected: ({ tools }) => { throw new ContractRejected({ reason: { type: "duplicate_tools", tools } }) },
    accepted: ({ tools }) => {
      const byName = new Map(captured.tools.map((tool) => [tool.name, tool]))
      const contract: McpContract = { ...captured, tools: tools.map(({ name }) => {
        const tool = byName.get(name)
        if (tool === undefined) throw new Error("Normalized contract lost its captured tool")
        return tool
      }) }
      return { contract, digest: ContractDigest.make(commitment("mcp-contract", encodeContract(contract))) }
    }
  }))
}
