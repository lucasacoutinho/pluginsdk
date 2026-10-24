import { Match, Schema } from "effect"
import { bindHook, Ordinal, Output } from "../../../contracts/HookBinding.ts"
import { HookTimeout, ProcessText } from "../../../contracts/Plugin.ts"
import { LauncherPath } from "../../../contracts/Launcher.ts"
import type { PackageFile } from "../../../contracts/Compiler.ts"
import type { ProcessInput } from "../../../contracts/Process.ts"
import { parseJsonBytes } from "../../internal/json.ts"
import { validatePortableProcess, type PackagedProcess } from "../process/portable-native.ts"

const ClaudeHandler = Schema.Struct({
  type: Schema.Literal("command"),
  command: Output.members[0].fields.command,
  args: Output.members[0].fields.args,
  timeout: HookTimeout,
  async: Schema.Literal(false)
})
const CodexHandler = Schema.Struct({
  type: Schema.Literal("command"),
  command: ProcessText,
  additionalContextLimit: Schema.Literal(0),
  timeout: HookTimeout,
  async: Schema.Literal(false)
})

const ClaudeGroup = Schema.Struct({ hooks: Schema.Tuple([ClaudeHandler]) })
const CodexGroup = Schema.Struct({ hooks: Schema.Tuple([CodexHandler]) })
const ClaudeEvents = Schema.Struct({
  SessionStart: Schema.optionalKey(Schema.NonEmptyArray(ClaudeGroup)),
  UserPromptSubmit: Schema.optionalKey(Schema.NonEmptyArray(ClaudeGroup))
})
const CodexEvents = Schema.Struct({
  SessionStart: Schema.optionalKey(Schema.NonEmptyArray(CodexGroup)),
  UserPromptSubmit: Schema.optionalKey(Schema.NonEmptyArray(CodexGroup))
})
const ClaudeHooksDocument = Schema.Struct({ hooks: ClaudeEvents })
const CodexHooksDocument = Schema.Struct({ hooks: CodexEvents })

const sameBinding = Schema.toEquivalence(Output)

function bindingsFromClaude(value: unknown): ReadonlyArray<Output> {
  const document = Schema.decodeUnknownSync(ClaudeHooksDocument)(value, { onExcessProperty: "error" })
  const { SessionStart, UserPromptSubmit } = document.hooks
  if (SessionStart === undefined && UserPromptSubmit === undefined) {
    throw new Error("Native hooks document must define at least one supported event")
  }
  return [...(SessionStart ?? []), ...(UserPromptSubmit ?? [])].map(({ hooks: [handler] }) => ({
    type: "direct",
    path: handler.args[2],
    command: handler.command,
    args: handler.args
  }))
}

function pathFromCodexCommand(command: string): LauncherPath {
  const path = /\.psdk\/hooks\/(0|[1-9][0-9]*)\.json$/.exec(command)?.[0]
  if (path === undefined) throw new Error("Native hook command does not name a canonical launcher path")
  return LauncherPath.make(path)
}

function bindingsFromCodex(value: unknown): ReadonlyArray<Output> {
  const document = Schema.decodeUnknownSync(CodexHooksDocument)(value, { onExcessProperty: "error" })
  const { SessionStart, UserPromptSubmit } = document.hooks
  if (SessionStart === undefined && UserPromptSubmit === undefined) {
    throw new Error("Native hooks document must define at least one supported event")
  }
  return [...(SessionStart ?? []), ...(UserPromptSubmit ?? [])].map(({ hooks: [handler] }) => ({
    type: "shell",
    path: pathFromCodexCommand(handler.command),
    command: handler.command
  }))
}

function ordinalOf(path: LauncherPath): Ordinal {
  const ordinalText = /^\.psdk\/hooks\/(0|[1-9][0-9]*)\.json$/.exec(path)?.[1]
  if (ordinalText === undefined) throw new Error("Native hook binding does not name a canonical launcher ordinal")
  return Schema.decodeSync(Ordinal)(Number(ordinalText))
}

function checkedBinding(host: ProcessInput["host"], binding: Output): Ordinal {
  const ordinal = ordinalOf(binding.path)
  if (!sameBinding(binding, bindHook({ host, ordinal }))) {
    throw new Error("Native hook binding differs from its canonical package reference")
  }
  return ordinal
}

export function validatePortableHooks(
  host: ProcessInput["host"],
  files: ReadonlyMap<string, PackageFile>
): {
  readonly paths: ReadonlySet<string>
  readonly processes: ReadonlyArray<PackagedProcess>
} {
  const hookFile = files.get("hooks/hooks.json")
  if (hookFile === undefined) return { paths: new Set(), processes: [] }
  if (hookFile.executable) throw new Error("Native hooks JSON document cannot be executable")

  const value = parseJsonBytes(hookFile.content)
  const bindings = Match.value(host).pipe(
    Match.when("claude_code", () => bindingsFromClaude(value)),
    Match.when("codex", () => bindingsFromCodex(value)),
    Match.exhaustive
  ).map((binding) => ({ binding, ordinal: checkedBinding(host, binding) }))
    .toSorted((left, right) => left.ordinal - right.ordinal)
  const paths = new Set<string>(["hooks/hooks.json"])
  const processes: PackagedProcess[] = []

  for (const [expected, { binding, ordinal }] of bindings.entries()) {
    if (ordinal !== expected) throw new Error("Native hook launcher ordinals must be unique and contiguous from zero")
    const descriptor = binding.path
    const sidecar = LauncherPath.make(`.psdk/hooks/${ordinal}.sh`)
    const checked = validatePortableProcess(host, descriptor, sidecar, files)
    if (checked.program.script.captures.length > 0) {
      throw new Error("Portable hooks cannot contain captured environment references")
    }
    processes.push({ path: descriptor, script: checked.program.script })
    for (const path of checked.paths) paths.add(path)
  }

  return { paths, processes }
}
