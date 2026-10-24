import { join } from "node:path"
import { Effect, Match } from "effect"
import type { Target } from "../../../contracts/Installer.ts"
import { installationLockSubjects } from "./lock-policy.ts"
import { isCodexProject } from "../project/layout.ts"
import { ensureDirectory, installationLock } from "../storage.ts"

export const lockTarget = Effect.fn("Installer.lockTarget")(function*(target: Target) {
  const leases = yield* Effect.forEach(installationLockSubjects(target.destination), (subject) =>
    installationLock(target.key, Match.value(subject).pipe(Match.discriminatorsExhaustive("type")({
      home: ({ root }) => join(root, ".pluginsdk"),
      project: ({ root }) => join(root, ".pluginsdk", "installer")
    }))))
  if (isCodexProject(target)) yield* ensureDirectory(target.key, join(target.destination.root, ".codex"))
  return leases.map(({ fd }) => fd)
})
