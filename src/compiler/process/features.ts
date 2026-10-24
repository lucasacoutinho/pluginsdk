import { Array as EffectArray, Match } from "effect"
import { PackagePath } from "../../../contracts/Plugin.ts"
import type { Input, Issue, Result } from "../../../contracts/PortableFeatures.ts"
import type { FilePlan } from "../../../contracts/PortableProcess.ts"
import { renderPortableHooks } from "../hooks/portable.ts"
import { runtimePath } from "./portable.ts"
import { renderPortableMcp } from "../mcp/portable.ts"

function sharedFiles(mcp: ReadonlyArray<FilePlan>, hooks: ReadonlyArray<FilePlan>): ReadonlyArray<FilePlan> {
  const files = [...mcp, ...hooks]
  if (files.length === 0) return []
  return [{ type: "runtime", path: PackagePath.make(runtimePath) }, ...files.filter((file) => Match.value(file).pipe(
    Match.discriminatorsExhaustive("type")({ runtime: () => false, process: () => true, posix: () => true })
  ))]
}

export function renderPortableFeatures(input: Input): Result {
  const hooks = renderPortableHooks({ host: input.mcp.format, hooks: input.hooks })
  return Match.value(renderPortableMcp(input.mcp)).pipe(
    Match.discriminatorsExhaustive("type")({
      rendered: (mcp) => Match.value(hooks).pipe(
        Match.discriminatorsExhaustive("type")({
          rendered: (hooks): Result => ({
            type: "rendered", mcpDocument: mcp.document, hooksDocument: hooks.document,
            files: sharedFiles(mcp.files, hooks.files)
          }),
          rejected: ({ issues }): Result => ({
            type: "rejected", issues: EffectArray.map(issues, (issue): Issue => ({ type: "hook", issue }))
          })
        })
      ),
      rejected: (mcp) => {
        const issues = EffectArray.map(mcp.issues, (issue): Issue => ({ type: "mcp", issue }))
        return Match.value(hooks).pipe(
          Match.discriminatorsExhaustive("type")({
            rendered: (): Result => ({ type: "rejected", issues }),
            rejected: (hooks): Result => ({
              type: "rejected",
              issues: EffectArray.appendAll(issues, EffectArray.map(hooks.issues, (issue): Issue => ({ type: "hook", issue })))
            })
          })
        )
      }
    })
  )
}
