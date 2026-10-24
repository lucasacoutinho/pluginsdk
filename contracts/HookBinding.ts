import { Schema } from "effect"
import { LauncherPath } from "./Launcher.ts"
import { ProcessInput } from "./Process.ts"
import { ProcessText } from "./Plugin.ts"

export const Ordinal = Schema.Natural.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
  .pipe(Schema.brand("pluginsdk/HookOrdinal"))
export type Ordinal = typeof Ordinal.Type

export const Input = Schema.Struct({ host: ProcessInput.fields.host, ordinal: Ordinal })
export type Input = typeof Input.Type

export const claudeRuntimeArgument = "${CLAUDE_PLUGIN_ROOT}/.psdk/runtime/process.mjs"
export const claudeRootArgument = "${CLAUDE_PLUGIN_ROOT}"

export const Output = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("direct"),
    path: LauncherPath,
    command: Schema.Literal("node"),
    args: Schema.Tuple([
      Schema.Literal(claudeRuntimeArgument),
      Schema.Literal(claudeRootArgument),
      LauncherPath
    ])
  }),
  Schema.Struct({ type: Schema.Literal("shell"), path: LauncherPath, command: ProcessText })
]).pipe(Schema.toTaggedUnion("type"))
export type Output = typeof Output.Type

export const OracleRequest = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("bind_hook"),
  input: Input
})
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Struct({
  schema: Schema.Literal(1),
  type: Schema.Literal("bind_hook"),
  output: Output
})
export type OracleResponse = typeof OracleResponse.Type

export { bindHook } from "../src/compiler/hooks/binding.ts"
