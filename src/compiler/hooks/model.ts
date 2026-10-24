import { Match } from "effect"
import { HookName } from "../../../contracts/Hooks.ts"
import { PackagePath, ProcessText } from "../../../contracts/Plugin.ts"
import type { HookIssue, HooksInput, HooksResult } from "../../../contracts/Hooks.ts"
import type { Script } from "../../../contracts/Launcher.ts"
import { compareUtf8 } from "../../internal/paths.ts"
import { compileLauncher, serializeLauncher } from "../process/posix.ts"

type GeneratedFile = Extract<HooksResult, { type: "rendered" }>["files"][number]
type Hook = HooksInput["hooks"][keyof HooksInput["hooks"]]
type Document = NonNullable<Extract<HooksResult, { type: "rendered" }>["document"]>

type CompiledHook = {
  readonly hook: Hook
  readonly script: Script
}

export function nativeHookCommand(host: HooksInput["host"], ordinal: number): string {
  return Match.value(host).pipe(
    Match.when("claude_code", () => `/bin/sh "$CLAUDE_PLUGIN_ROOT/.psdk/hooks/${ordinal}.sh" "$CLAUDE_PLUGIN_ROOT"`),
    Match.when("codex", () => `/bin/sh "$PLUGIN_ROOT/.psdk/hooks/${ordinal}.sh" "$PLUGIN_ROOT"`),
    Match.exhaustive
  )
}

export function renderHooks(input: HooksInput): HooksResult {
  const orderedHooks = Object.entries(input.hooks)
    .map(([name, hook]) => ({ name: HookName.make(name), hook }))
    .sort((left, right) => compareUtf8(left.name, right.name))
  const compiledHooks: CompiledHook[] = []
  const issues: HookIssue[] = []

  for (const { name, hook } of orderedHooks) {
    const script = compileLauncher(hook.plan)
    compiledHooks.push({ hook, script })
    for (const capture of script.captures) {
      issues.push({ type: "environment_reference_unsupported", hook: name, name: capture.source })
    }
  }

  const [firstIssue, ...remainingIssues] = issues
  if (firstIssue !== undefined) {
    return { type: "rejected", issues: [firstIssue, ...remainingIssues] }
  }

  const sessionStart: Document[] = []
  const userPromptSubmit: Document[] = []
  const files: GeneratedFile[] = []

  for (const [ordinal, { hook, script }] of compiledHooks.entries()) {
    const path = PackagePath.make(`.psdk/hooks/${ordinal}.sh`)
    const command = nativeHookCommand(input.host, ordinal)
    const handler: Document = {
      type: "command", command, timeout: hook.timeout, async: false,
      ...Match.value(input.host).pipe(
        Match.when("claude_code", () => ({})),
        Match.when("codex", () => ({ additionalContextLimit: 0 })),
        Match.exhaustive
      )
    }
    const group: Document = { hooks: [handler] }
    const eventGroups = Match.value(hook.event).pipe(
      Match.when("SessionStart", () => sessionStart),
      Match.when("UserPromptSubmit", () => userPromptSubmit),
      Match.exhaustive
    )
    eventGroups.push(group)
    files.push({ path, content: ProcessText.make(serializeLauncher(script)), executable: true })
  }

  const hooks: Document = {
    ...(sessionStart.length === 0 ? {} : { SessionStart: sessionStart }),
    ...(userPromptSubmit.length === 0 ? {} : { UserPromptSubmit: userPromptSubmit })
  }
  const document: Document | null = compiledHooks.length === 0 ? null : { hooks }
  return { type: "rendered", document, files }
}
