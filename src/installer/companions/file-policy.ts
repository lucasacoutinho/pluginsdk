import { Match, Schema } from "effect"
import type { Decision, Input, ReviewInput } from "../../../contracts/CompanionFile.ts"
import type { FileObservation } from "../../../contracts/Companions.ts"
import { FileBasis } from "../../../contracts/ProjectConfig.ts"
import { admitProjectFile } from "../../internal/files/ownership.ts"

const sameBasis = Schema.toEquivalence(FileBasis)

export const admitCompanionFile = (input: Input): Decision =>
  Match.value(admitProjectFile(input)).pipe(Match.discriminatorsExhaustive("type")({
    blocked: (decision) => decision,
    ready: ({ basis }) => Match.value(basis).pipe(Match.discriminatorsExhaustive("type")({
      absent: (basis): Decision => ({ type: "ready", basis }),
      windows_file: (basis): Decision => ({ type: "ready", basis }),
      file: ({ digest, mode }): Decision => mode === 0o600
        ? { type: "ready", basis: { type: "file", digest, mode: 0o600 } }
        : { type: "blocked", reason: "mode" }
    }))
  }))

export const reviewCompanionFile = ({ current, reviewed }: ReviewInput): Decision =>
  Match.value(admitCompanionFile(current)).pipe(Match.discriminatorsExhaustive("type")({
    blocked: (decision) => decision,
    ready: ({ basis }): Decision => sameBasis(reviewed, basis)
      ? { type: "ready", basis }
      : { type: "blocked", reason: "changed" }
  }))

export const observeCompanionFile = (input: Input): FileObservation =>
  Match.value(admitCompanionFile(input)).pipe(Match.discriminatorsExhaustive("type")({
    blocked: (): FileObservation => ({ type: "unknown" }),
    ready: ({ basis }) => Match.value(basis).pipe(Match.discriminatorsExhaustive("type")({
      absent: (): FileObservation => ({ type: "absent" }),
      file: ({ digest }): FileObservation => ({ type: "file", digest }),
      windows_file: ({ digest }): FileObservation => ({ type: "file", digest })
    }))
  }))
