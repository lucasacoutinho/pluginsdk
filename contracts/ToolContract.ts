import { Schema } from "effect"
import { ContractDigest, OrganizationId, ServiceId, ToolName } from "./Authorization.ts"

export const ToolMetadataDigest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).pipe(Schema.brand("pluginsdk/ToolMetadataDigest"))
export type ToolMetadataDigest = typeof ToolMetadataDigest.Type
export const McpProtocol = Schema.Literals(["2025-11-25", "2026-07-28"])
export type McpProtocol = typeof McpProtocol.Type

const JsonExtras = Schema.Record(Schema.String, Schema.Json)
const InputSchema = Schema.JsonObject.check(Schema.makeFilter((value) => value.type === "object", {
  expected: "an input JSON Schema with type object"
}))
const ToolAnnotations = Schema.StructWithRest(Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  readOnlyHint: Schema.optionalKey(Schema.Boolean),
  destructiveHint: Schema.optionalKey(Schema.Boolean),
  idempotentHint: Schema.optionalKey(Schema.Boolean),
  openWorldHint: Schema.optionalKey(Schema.Boolean)
}), [JsonExtras])

export const McpTool = Schema.StructWithRest(Schema.Struct({
  name: ToolName,
  inputSchema: InputSchema,
  title: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  outputSchema: Schema.optionalKey(Schema.JsonObject),
  annotations: Schema.optionalKey(ToolAnnotations),
  icons: Schema.optionalKey(Schema.Array(Schema.JsonObject)),
  _meta: Schema.optionalKey(Schema.JsonObject)
}), [JsonExtras])
export type McpTool = typeof McpTool.Type

export const McpContract = Schema.Struct({
  schema: Schema.Literal(1),
  organization: OrganizationId,
  service: ServiceId,
  protocol: McpProtocol,
  tools: Schema.Array(McpTool)
})
export type McpContract = typeof McpContract.Type

export const ToolDescriptor = Schema.Struct({ name: ToolName, digest: ToolMetadataDigest })
export type ToolDescriptor = typeof ToolDescriptor.Type
export const NormalizeToolsInput = Schema.Struct({ tools: Schema.Array(ToolDescriptor) })
export type NormalizeToolsInput = typeof NormalizeToolsInput.Type
export const ToolListResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("accepted"), tools: Schema.Array(ToolDescriptor) }),
  Schema.Struct({ type: Schema.Literal("rejected"), tools: Schema.NonEmptyArray(ToolName) })
]).pipe(Schema.toTaggedUnion("type"))
export type ToolListResult = typeof ToolListResult.Type

export const ContractIdentity = Schema.Struct({ organization: OrganizationId, service: ServiceId, digest: ContractDigest })
export type ContractIdentity = typeof ContractIdentity.Type
export const ContractBindingInput = Schema.Struct({ expected: ContractIdentity, actual: ContractIdentity })
export type ContractBindingInput = typeof ContractBindingInput.Type
export const ContractBindingIssue = Schema.Literals(["digest_mismatch", "organization_mismatch", "service_mismatch"])
export type ContractBindingIssue = typeof ContractBindingIssue.Type
export const ContractBindingResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("accepted") }),
  Schema.Struct({ type: Schema.Literal("rejected"), issues: Schema.NonEmptyArray(ContractBindingIssue) })
]).pipe(Schema.toTaggedUnion("type"))
export type ContractBindingResult = typeof ContractBindingResult.Type

export const ContractRejection = Schema.Union([
  Schema.Struct({ type: Schema.Literal("duplicate_tools"), tools: Schema.NonEmptyArray(ToolName) }),
  Schema.Struct({ type: Schema.Literal("binding"), issues: Schema.NonEmptyArray(ContractBindingIssue) })
]).pipe(Schema.toTaggedUnion("type"))
export type ContractRejection = typeof ContractRejection.Type
export class ContractRejected extends Schema.TaggedError<ContractRejected, { readonly brand: unique symbol }>()("ContractRejected", {
  reason: ContractRejection
}) {}

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("normalize_tools"), input: NormalizeToolsInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("check_contract_binding"), input: ContractBindingInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("normalize_tools"), output: ToolListResult }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("check_contract_binding"), output: ContractBindingResult })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
