import { Match } from "effect"
import type { Input, NodeObservation, Requirements } from "../../../contracts/LauncherRuntime.ts"

export function launcherRuntimeChecks(input: Input): Requirements {
  return Match.value(input.kind).pipe(Match.discriminatorsExhaustive("type")({
    absent: (): Requirements => [],
    posix: ({ cwdRoot }): Requirements => {
      if (input.platform !== "linux") return null
      return cwdRoot ? ["shell", "env", "pwd"] : ["shell", "env"]
    },
    portable: (): Requirements => {
      if (input.platform === "linux") return ["node", "shell", "env"]
      return input.platform === "win32" ? ["node"] : null
    }
  }))
}

export function acceptsNodeRuntime(input: NodeObservation): boolean {
  return (input.major > 24 || (input.major === 24 && input.minor >= 18)) &&
    (input.platform === "win32" || (input.platform === "linux" && input.execve))
}
