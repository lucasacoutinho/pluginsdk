import { Schema } from "effect"
import { LocalClient, PackageClient } from "./Clients.ts"

export const ClientInput = Schema.Struct({ client: LocalClient })
export type ClientInput = typeof ClientInput.Type

export const BuildInput = Schema.Struct({ clients: Schema.NonEmptyArray(LocalClient) })
export type BuildInput = typeof BuildInput.Type

export const PackageClients = Schema.Union([
  Schema.Tuple([Schema.Literal("claude_code")]),
  Schema.Tuple([Schema.Literal("codex")]),
  Schema.Tuple([Schema.Literal("claude_code"), Schema.Literal("codex")])
])
export type PackageClients = typeof PackageClients.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("client_package_host"), input: ClientInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("normalize_build_clients"), input: BuildInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("client_package_host"), output: PackageClient }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("normalize_build_clients"), output: PackageClients })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
