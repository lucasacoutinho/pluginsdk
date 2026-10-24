import { Match } from "effect"
import type { Destination } from "../../../contracts/Installer.ts"
import type { LockSubjects } from "../../../contracts/InstallationLocks.ts"

export const installationLockSubjects = (destination: Destination): LockSubjects =>
  Match.value(destination).pipe(Match.discriminatorsExhaustive("type")({
    user: ({ home }) => [{ type: "home", root: home }] satisfies LockSubjects,
    project: ({ home, root }) => [{ type: "home", root: home }, { type: "project", root }] satisfies LockSubjects
  }))
