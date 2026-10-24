import { dirname } from "node:path"
import { Effect, Match } from "effect"
import type { Basis } from "../../../contracts/CompanionFile.ts"
import { StateUnavailable, type InstallationKey } from "../../../contracts/Installer.ts"
import type { Snapshot } from "../../../contracts/ProjectFile.ts"
import { WindowsManagedFiles, WindowsManagedFilesLive, type ManagedFileUnavailable } from "../../internal/windows-files/managed.ts"
import * as Posix from "./posix.ts"
import { ensureDirectory, stateIO } from "../storage.ts"

export type PresentRoleBasis = Exclude<Basis, { readonly type: "absent" }>

export const roleStorage = (key: InstallationKey, maximumBytes: number) => {
  const unavailable = (message: string) => new StateUnavailable({ key, cause: new Error(message) })
  const windows = <A>(operation: Effect.Effect<A, ManagedFileUnavailable, WindowsManagedFiles>) =>
    operation.pipe(
      Effect.provide(WindowsManagedFilesLive),
      Effect.mapError((cause) => new StateUnavailable({ key, cause }))
    )

  const read = Effect.fn("Installer.readRoleFile")(function*(path: string): Effect.fn.Return<Snapshot, StateUnavailable> {
    if (process.platform === "linux") return yield* stateIO(key, () => Posix.readFile(path, maximumBytes))
    if (process.platform === "win32") return yield* windows(Effect.flatMap(WindowsManagedFiles, (files) => files.readFile(path, maximumBytes)))
    return yield* unavailable("Role file filesystem is unsupported on this platform")
  })

  const write = Effect.fn("Installer.writeRoleFile")(function*(path: string, before: Basis, bytes: Uint8Array) {
    if (bytes.byteLength > maximumBytes) return yield* unavailable("Role file exceeds the inspection limit")
    return yield* Match.value(before).pipe(Match.discriminatorsExhaustive("type")({
      absent: () => Effect.gen(function*() {
        if (process.platform !== "linux" && process.platform !== "win32") {
          return yield* unavailable("Role file filesystem is unsupported on this platform")
        }
        yield* ensureDirectory(key, dirname(path))
        if (process.platform === "linux") return yield* stateIO(key, () => Posix.createFile(path, bytes))
        return yield* windows(Effect.flatMap(WindowsManagedFiles, (files) => files.writeFile(path, before, bytes, maximumBytes)))
      }),
      file: (basis) => process.platform === "linux"
        ? stateIO(key, () => Posix.replaceFile(path, basis, bytes, maximumBytes))
        : unavailable("POSIX role metadata cannot be used on this platform"),
      windows_file: (basis) => process.platform === "win32"
        ? windows(Effect.flatMap(WindowsManagedFiles, (files) => files.writeFile(path, basis, bytes, maximumBytes)))
        : unavailable("Windows role metadata cannot be used on this platform")
    }))
  }, Effect.uninterruptible)

  const remove = Effect.fn("Installer.removeRoleFile")(function*(path: string, before: PresentRoleBasis) {
    return yield* Match.value(before).pipe(Match.discriminatorsExhaustive("type")({
      file: (basis) => process.platform === "linux"
        ? stateIO(key, () => Posix.removeFile(path, basis, maximumBytes))
        : unavailable("POSIX role metadata cannot be used on this platform"),
      windows_file: (basis) => process.platform === "win32"
        ? windows(Effect.flatMap(WindowsManagedFiles, (files) => files.removeFile(path, basis, maximumBytes)))
        : unavailable("Windows role metadata cannot be used on this platform")
    }))
  }, Effect.uninterruptible)

  return { read, write, remove }
}
