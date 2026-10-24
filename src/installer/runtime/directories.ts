import { join } from "node:path"
import { Effect, Match } from "effect"
import { DestinationUnsupported, StateUnavailable, type ReadyPlan } from "../../../contracts/Installer.ts"
import { ProcessText } from "../../../contracts/Plugin.ts"
import { validateBundle } from "../../compiler/package/native.ts"
import { admitProcessDirectory } from "./directory-policy.ts"
import { targetPaths } from "../target/resolve.ts"
import { isCodexProject, projectActivation } from "../project/layout.ts"
import { isLocalTarget, localPaths } from "../local/layout.ts"

export const checkProcessDirectories = Effect.fn("Installer.checkProcessDirectories")(function*(plan: ReadyPlan) {
  if (process.platform !== "win32" || plan.change.type === "remove") return
  const bundle = plan.change.bundle
  const metadata = yield* Effect.try({
    try: () => validateBundle(bundle),
    catch: (cause) => new StateUnavailable({ key: plan.target.key, cause })
  })
  if (metadata.processes.length === 0) return
  const paths = targetPaths(plan.target)
  const root = ProcessText.make(isLocalTarget(plan.target) ? join(plan.target.destination.home, localPaths(plan.target).live) : Match.value(bundle.format).pipe(
    Match.when("claude_code", () => join(paths.market, "payloads", plan.id)),
    Match.when("codex", () => isCodexProject(plan.target)
      ? projectActivation(plan.target, plan.id, bundle).cache.payload
      : join(plan.target.destination.home, "plugins", "cache", paths.marketName, plan.target.plugin, metadata.version)),
    Match.exhaustive
  ))
  for (const { path: dataPath, script } of metadata.processes) {
    yield* Match.value(admitProcessDirectory({ root, script })).pipe(Match.discriminatorsExhaustive("type")({
      accepted: () => Effect.void,
      unresolved: () => Effect.fail(new DestinationUnsupported({
        destination: plan.target.destination,
        detail: `${dataPath} does not declare a package-relative working directory; Windows admission requires a package root or file path`
      })),
      too_long: ({ units }) => Effect.fail(new DestinationUnsupported({
        destination: plan.target.destination,
        detail: `${dataPath} requires a ${units}-unit working directory; the qualified Windows limit is 258 UTF-16 units. Use a shorter client home`
      }))
    }))
  }
})
