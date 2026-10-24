import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Mcp from "../contracts/Mcp.ts"

const strict = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown): S["Type"] =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)

it("rejects overlapping names and malformed nested process values at the schema seam", () => {
  const app = {
    command: { type: "literal", value: "node" }, args: [], environment: [], cwd: { type: "root" }
  }
  const input = { format: "claude_code", remote: {}, local: { app } }
  expect(strict(Mcp.McpInput, input).local.app?.command).toEqual(app.command)
  for (const candidate of [
    { ...input, remote: { app: { url: "https://app.example/mcp", headers: {} } } },
    { ...input, local: { "": app } },
    { ...input, local: { "\ud800": app } },
    { ...input, local: { app: { ...app, args: [{ type: "literal", value: "a\0b" }] } } },
    { ...input, local: { app: { ...app, command: { ...app.command, unexpected: true } } } }
  ]) expect(() => strict(Mcp.McpInput, candidate)).toThrow()
})
