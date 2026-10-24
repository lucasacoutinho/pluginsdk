import { Match, Schema } from "effect"
import type { Bundle } from "../../../contracts/Compiler.ts"
import { HookTimeout, ProcessText } from "../../../contracts/Plugin.ts"
import type { ProcessInput } from "../../../contracts/Process.ts"
import { parseJsonBytes } from "../../internal/json.ts"
import { nativeHookCommand } from "./model.ts"

const ClaudeHandler = Schema.Struct({
  type: Schema.Literal("command"),
  command: ProcessText,
  timeout: HookTimeout,
  async: Schema.Literal(false)
})
const CodexHandler = Schema.Struct({
  ...ClaudeHandler.fields,
  additionalContextLimit: Schema.Literal(0)
})

const ClaudeGroup = Schema.Struct({ hooks: Schema.Tuple([ClaudeHandler]) })
const CodexGroup = Schema.Struct({ hooks: Schema.Tuple([CodexHandler]) })
const ClaudeHooksDocument = Schema.Struct({
  hooks: Schema.Struct({
    SessionStart: Schema.optionalKey(Schema.NonEmptyArray(ClaudeGroup)),
    UserPromptSubmit: Schema.optionalKey(Schema.NonEmptyArray(ClaudeGroup))
  })
})
const CodexHooksDocument = Schema.Struct({
  hooks: Schema.Struct({
    SessionStart: Schema.optionalKey(Schema.NonEmptyArray(CodexGroup)),
    UserPromptSubmit: Schema.optionalKey(Schema.NonEmptyArray(CodexGroup))
  })
})

type HookDocument =
  | typeof ClaudeHooksDocument.Type
  | typeof CodexHooksDocument.Type

function commandsFrom(document: HookDocument): string[] {
  const { SessionStart, UserPromptSubmit } = document.hooks
  if (SessionStart === undefined && UserPromptSubmit === undefined) {
    throw new Error("Native hooks document must define at least one supported event")
  }
  return [...(SessionStart ?? []), ...(UserPromptSubmit ?? [])].map(({ hooks: [handler] }) => handler.command)
}

function ordinalFromCommand(host: ProcessInput["host"], command: string): number {
  const ordinalText = /\.psdk\/hooks\/(0|[1-9][0-9]*)\.sh/.exec(command)?.[1]
  if (ordinalText === undefined) throw new Error("Native hook command does not name a canonical launcher ordinal")
  const ordinal = Number(ordinalText)
  if (!Number.isSafeInteger(ordinal)) throw new Error("Native hook launcher ordinal is not a safe integer")
  if (command !== nativeHookCommand(host, ordinal)) throw new Error("Native hook command differs from its canonical package reference")
  return ordinal
}

export function validateNativeHooks(
  host: ProcessInput["host"],
  files: ReadonlyMap<string, Bundle["files"][number]>
): ReadonlySet<string> {
  const hookFile = files.get("hooks/hooks.json")
  if (hookFile === undefined) return new Set<string>()
  if (hookFile.executable) throw new Error("Native hooks JSON document cannot be executable")

  const value = parseJsonBytes(hookFile.content)
  const commands = Match.value(host).pipe(
    Match.when("claude_code", () =>
      commandsFrom(Schema.decodeUnknownSync(ClaudeHooksDocument)(value, { onExcessProperty: "error" }))
    ),
    Match.when("codex", () =>
      commandsFrom(Schema.decodeUnknownSync(CodexHooksDocument)(value, { onExcessProperty: "error" }))
    ),
    Match.exhaustive
  )

  const paths = new Set<string>(["hooks/hooks.json"])
  const ordinals = new Set<number>()
  for (const command of commands) {
    const ordinal = ordinalFromCommand(host, command)
    if (ordinals.has(ordinal)) throw new Error("Native hook launcher ordinals must be unique")
    ordinals.add(ordinal)
    const path = `.psdk/hooks/${ordinal}.sh`
    const launcher = files.get(path)
    if (launcher === undefined || !launcher.executable) {
      throw new Error("Native hook launcher must name a packaged executable file")
    }
    paths.add(path)
  }

  for (let expected = 0; expected < ordinals.size; expected++) {
    if (!ordinals.has(expected)) throw new Error("Native hook launcher ordinals must be contiguous from zero")
  }
  return paths
}
