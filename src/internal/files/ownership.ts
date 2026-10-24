import { Match, Schema } from "effect"
import { FileBasis } from "../../../contracts/ProjectConfig.ts"
import type { Decision, Input, ReviewInput } from "../../../contracts/ProjectFile.ts"

const sameBasis = Schema.toEquivalence(FileBasis)

export const admitProjectFile = ({ platform, observed }: Input): Decision => {
  if (platform !== "linux" && platform !== "win32") return { type: "blocked", reason: "platform" }
  return Match.value(observed).pipe(Match.discriminatorsExhaustive("type")({
    absent: (): Decision => ({ type: "ready", basis: { type: "absent" } }),
    file: (basis): Decision => platform === "linux"
      ? { type: "ready", basis }
      : { type: "blocked", reason: "representation" },
    windows_file: ({ digest, attributes, security, streams }): Decision => {
      if (platform !== "win32") return { type: "blocked", reason: "representation" }
      if (attributes !== 0x80 && (attributes === 0 || (attributes & ~0x2026) !== 0)) {
        return { type: "blocked", reason: "attributes" }
      }
      if (streams !== "default_only") return { type: "blocked", reason: "streams" }
      return { type: "ready", basis: { type: "windows_file", digest, attributes, security } }
    }
  }))
}

export const reviewProjectFile = ({ current, reviewed }: ReviewInput): Decision =>
  Match.value(admitProjectFile(current)).pipe(Match.discriminatorsExhaustive("type")({
    blocked: (decision) => decision,
    ready: ({ basis }): Decision => sameBasis(reviewed, basis)
      ? { type: "ready", basis }
      : { type: "blocked", reason: "changed" }
  }))
