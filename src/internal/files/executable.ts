import { Match } from "effect"
import {
  PermissionBits, type FileIntent, type ModeObservation, type NativeFile, type NativeResolution,
  type PayloadInput, type PayloadResolution, type SourceInput, type SourceResolution, type StageInput
} from "../../../contracts/ExecutableIntent.ts"
import type { PackagePath } from "../../../contracts/Plugin.ts"

const executeBits = (bits: PermissionBits): boolean => (bits & 0o111) !== 0

const firstDuplicate = (paths: ReadonlyArray<PackagePath>): PackagePath | undefined =>
  paths.find((path, index) => paths.slice(index + 1).includes(path))

const nativeIntent = (mode: ModeObservation): NativeResolution => Match.value(mode).pipe(
  Match.discriminatorsExhaustive("type")({
    posix: ({ before, after }): NativeResolution => before === after
      ? { type: "resolved", executable: executeBits(before) }
      : { type: "refused", reason: "changed" },
    unrepresented: (): NativeResolution => ({ type: "refused", reason: "unrepresented" }),
    unavailable: (): NativeResolution => ({ type: "refused", reason: "unavailable" })
  })
)

function nativeFiles(files: ReadonlyArray<NativeFile>): SourceResolution {
  const intents: FileIntent[] = []
  for (const { path, mode } of files) {
    const refusal = Match.value(nativeIntent(mode)).pipe(
      Match.discriminatorsExhaustive("type")({
        resolved: ({ executable }) => { intents.push({ path, executable }) },
        refused: ({ reason }): SourceResolution => ({ type: "refused", reason, path })
      })
    )
    if (refusal !== undefined) return refusal
  }
  return { type: "resolved", files: intents }
}

export function resolveSourceIntent(input: SourceInput): SourceResolution {
  const paths = Match.value(input).pipe(Match.discriminatorsExhaustive("type")({
    filesystem: ({ files }) => files.map(({ path }) => path),
    declared: ({ files }) => files
  }))
  const duplicate = firstDuplicate(paths)
  if (duplicate !== undefined) return { type: "refused", reason: "duplicate_file", path: duplicate }
  return Match.value(input).pipe(Match.discriminatorsExhaustive("type")({
    filesystem: ({ files }) => nativeFiles(files),
    declared: ({ files, executables }): SourceResolution => {
      const duplicate = firstDuplicate(executables)
      if (duplicate !== undefined) return { type: "refused", reason: "duplicate_declaration", path: duplicate }
      const missing = executables.find((path) => !files.includes(path))
      if (missing !== undefined) return { type: "refused", reason: "missing_file", path: missing }
      return { type: "resolved", files: files.map((path) => ({ path, executable: executables.includes(path) })) }
    }
  }))
}

export function resolvePayloadIntent({ retained, observed }: PayloadInput): PayloadResolution {
  if (retained.path !== observed.path) return { type: "refused", reason: "path" }
  if (retained.digest !== observed.digest) return { type: "refused", reason: "content" }
  return Match.value(observed.mode).pipe(Match.discriminatorsExhaustive("type")({
    unavailable: (): PayloadResolution => ({ type: "refused", reason: "unavailable" }),
    unrepresented: (): PayloadResolution => ({ type: "resolved", executable: retained.executable }),
    posix: ({ before, after }): PayloadResolution => {
      if (before !== after) return { type: "refused", reason: "changed" }
      if (executeBits(before) !== retained.executable) return { type: "refused", reason: "intent" }
      return { type: "resolved", executable: retained.executable }
    }
  }))
}

export function stagePermissions({ current, executable }: StageInput): PermissionBits {
  if (executeBits(current) === executable) return current
  return PermissionBits.make(executable ? current | 0o100 : current & 0o666)
}
