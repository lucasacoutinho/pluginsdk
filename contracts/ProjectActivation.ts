import { Schema } from "effect"
import { RoleName } from "./Agents.ts"
import { AgentName, ProcessText } from "./Plugin.ts"
import { Registration } from "./ProjectConfig.ts"

export const Platform = Schema.Literals(["linux", "win32"])
export type Platform = typeof Platform.Type

export const CacheVersion = ProcessText.check(Schema.makeFilter(
  (value) => value.length > 0 && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\"),
  { expected: "one native cache version component" }
)).pipe(Schema.brand("pluginsdk/ProjectCacheVersion"))
export type CacheVersion = typeof CacheVersion.Type

export const ConfigFile = Registration.fields.root.pipe(Schema.brand("pluginsdk/ProjectAgentConfigFile"))
export type ConfigFile = typeof ConfigFile.Type

export const Binding = Schema.Struct({ name: RoleName, configFile: ConfigFile })
export type Binding = typeof Binding.Type

export const Activation = Schema.Struct({ registration: Registration, agents: Schema.Array(Binding) })
export type Activation = typeof Activation.Type

export const Cache = Schema.Struct({ directory: Registration.fields.root, payload: Registration.fields.root })
export type Cache = typeof Cache.Type

export const BuildInput = Schema.Struct({
  platform: Platform,
  home: Registration.fields.root,
  version: CacheVersion,
  registration: Registration,
  agents: Schema.Array(AgentName)
})
export type BuildInput = typeof BuildInput.Type

export const BuildResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("rendered"), cache: Cache, activation: Activation }),
  Schema.Struct({ type: Schema.Literal("rejected"), duplicates: Schema.NonEmptyArray(AgentName) })
]).pipe(Schema.toTaggedUnion("type"))
export type BuildResult = typeof BuildResult.Type

export const ObservationSource = Schema.Literals(["managed", "foreign"])
export type ObservationSource = typeof ObservationSource.Type

export const Observation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("declared"), source: ObservationSource,
    declaredName: RoleName, name: RoleName, configFile: Schema.NullOr(ConfigFile) }),
  Schema.Struct({ type: Schema.Literal("discovered"), name: RoleName, path: ConfigFile }),
  Schema.Struct({ type: Schema.Literal("unknown") })
]).pipe(Schema.toTaggedUnion("type"))
export type Observation = typeof Observation.Type

export const AuthorityInput = Schema.Struct({
  previous: Schema.Array(Binding), desired: Schema.Array(Binding), observed: Schema.Array(Observation)
})
export type AuthorityInput = typeof AuthorityInput.Type

export const Reason = Schema.Literals(["duplicate", "unknown", "unowned", "drift"])
export type Reason = typeof Reason.Type

export const AuthorityResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready") }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: Reason })
]).pipe(Schema.toTaggedUnion("type"))
export type AuthorityResult = typeof AuthorityResult.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("build_project_activation"), input: BuildInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("review_project_role_authority"), input: AuthorityInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("build_project_activation"), output: BuildResult }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("review_project_role_authority"), output: AuthorityResult })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
