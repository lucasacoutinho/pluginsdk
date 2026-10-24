import { Array as EffectArray, Match, Schema } from "effect"
import { bindHook, Ordinal } from "../../../contracts/HookBinding.ts"
import { HookName } from "../../../contracts/Hooks.ts"
import { LauncherPath } from "../../../contracts/Launcher.ts"
import { PackagePath } from "../../../contracts/Plugin.ts"
import { Issue, type Input, type Result } from "../../../contracts/PortableHooks.ts"
import type { FilePlan } from "../../../contracts/PortableProcess.ts"
import { compareUtf8 } from "../../internal/paths.ts"
import { compileLauncher } from "../process/posix.ts"
import { compilePortableLauncher, runtimePath } from "../process/portable.ts"

type Document = NonNullable<Extract<Result, { type: "rendered" }>["document"]>

export function renderPortableHooks(input: Input): Result {
  const hooks = Object.entries(input.hooks).sort(([left], [right]) => compareUtf8(left, right))
  const files: FilePlan[] = hooks.length === 0 ? [] : [{ type: "runtime", path: PackagePath.make(runtimePath) }]
  const issues: Issue[] = []
  const sessionStart: Document[] = []
  const userPromptSubmit: Document[] = []

  for (const [ordinal, [name, hook]] of hooks.entries()) {
    const hookName = HookName.make(name)
    const binding = bindHook({ host: input.host, ordinal: Ordinal.make(ordinal) })
    const posix = LauncherPath.make(`.psdk/hooks/${ordinal}.sh`)
    for (const capture of compileLauncher(hook.plan).captures) {
      issues.push({ hook: hookName, reason: { type: "environment_reference_unsupported", name: capture.source } })
    }
    Match.value(compilePortableLauncher({ host: input.host, path: binding.path, plan: hook.plan })).pipe(
      Match.discriminatorsExhaustive("type")({
        rendered: (program) => {
          const native = Match.value(binding).pipe(
            Match.discriminatorsExhaustive("type")({
              direct: ({ command, args }): Document => ({ command, args }),
              shell: ({ command }): Document => ({ command, additionalContextLimit: 0 })
            })
          )
          const handler: Document = { type: "command", ...native, timeout: hook.timeout, async: false }
          const groups = Match.value(hook.event).pipe(
            Match.when("SessionStart", () => sessionStart),
            Match.when("UserPromptSubmit", () => userPromptSubmit),
            Match.exhaustive
          )
          groups.push({ hooks: [handler] })
          files.push(
            { type: "process", path: binding.path, data: { schema: 1, posix, script: program.script } },
            { type: "posix", path: posix, content: program.posix }
          )
        },
        rejected: (result) => {
          issues.push(...result.issues.map((reason) => ({ hook: hookName, reason })))
        }
      })
    )
  }

  const [head, ...tail] = [...EffectArray.dedupeWith(issues, Schema.toEquivalence(Issue))]
    .sort((left, right) => compareUtf8(left.hook, right.hook) ||
      compareUtf8(left.reason.type, right.reason.type) || compareUtf8(left.reason.name, right.reason.name))
  if (head !== undefined) return { type: "rejected", issues: [head, ...tail] }
  const events: Document = {
    ...(sessionStart.length === 0 ? {} : { SessionStart: sessionStart }),
    ...(userPromptSubmit.length === 0 ? {} : { UserPromptSubmit: userPromptSubmit })
  }
  return { type: "rendered", document: hooks.length === 0 ? null : { hooks: events }, files }
}
