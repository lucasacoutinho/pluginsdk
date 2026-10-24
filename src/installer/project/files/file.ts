import { isAbsolute, join, resolve } from "node:path"
import { Effect, Match } from "effect"
import { RuntimePlatform } from "../../../../contracts/Compatibility.ts"
import { StateUnavailable, type InstallationKey, type Target } from "../../../../contracts/Installer.ts"
import type { FileBasis } from "../../../../contracts/ProjectConfig.ts"
import type { Snapshot } from "../../../../contracts/ProjectFile.ts"
import { WindowsManagedFiles, WindowsManagedFilesLive } from "../../../internal/windows-files/managed.ts"
import { admitProjectFile } from "../../../internal/files/ownership.ts"
import { readSnapshot as readPosixSnapshot, replace as replacePosix } from "./posix.ts"
import { stateIO } from "../../storage.ts"

export type ProjectPaths = {
  readonly root: string
  readonly directory: string
  readonly file: string
}

export type FileSnapshot = Snapshot

const metadataIO = <A>(key: InstallationKey, operation: () => A) =>
  Effect.try({ try: operation, catch: (cause) => new StateUnavailable({ key, cause }) })

const isCanonicalAbsolutePath = (path: string): boolean =>
  path.length > 0 && !path.includes("\0") && isAbsolute(path) && resolve(path) === path

const projectPaths = (target: Target): ProjectPaths => Match.value(target.destination).pipe(
  Match.discriminatorsExhaustive("type")({
    user: () => {
      throw new Error("Project config requires a canonical Codex project destination")
    },
    project: ({ host, home, root }) => {
      if (host !== "codex" || !isCanonicalAbsolutePath(home) || !isCanonicalAbsolutePath(root)) {
        throw new Error("Project config requires a canonical Codex project destination")
      }
      const directory = join(root, ".codex")
      return { root, directory, file: join(directory, "config.toml") }
    }
  })
)

const readSnapshot = (key: InstallationKey, paths: ProjectPaths): Effect.Effect<FileSnapshot, StateUnavailable> => {
  if (process.platform === "linux") return stateIO(key, () => readPosixSnapshot(paths))
  if (process.platform === "win32") return Effect.flatMap(WindowsManagedFiles, (files) => files.readFile(paths.file)).pipe(
    Effect.provide(WindowsManagedFilesLive),
    Effect.mapError((cause) => new StateUnavailable({ key, cause }))
  )
  return new StateUnavailable({ key, cause: new Error("Project config filesystem is unsupported on this platform") })
}

const replace = (key: InstallationKey, paths: ProjectPaths, before: FileBasis, bytes: Uint8Array): Effect.Effect<void, StateUnavailable> => {
  if (process.platform === "linux") return stateIO(key, () => replacePosix(paths, before, bytes))
  if (process.platform === "win32") return Effect.flatMap(WindowsManagedFiles, (files) => files.writeFile(paths.file, before, bytes)).pipe(
    Effect.provide(WindowsManagedFilesLive),
    Effect.mapError((cause) => new StateUnavailable({ key, cause }))
  )
  return new StateUnavailable({ key, cause: new Error("Project config filesystem is unsupported on this platform") })
}

const admittedBasis = (snapshot: FileSnapshot): FileBasis =>
  Match.value(admitProjectFile({
    platform: RuntimePlatform.make(process.platform),
    observed: snapshot.observed
  })).pipe(Match.discriminatorsExhaustive("type")({
    blocked: ({ reason }) => { throw new Error(`Project config observation blocked: ${reason}`) },
    ready: ({ basis }) => basis
  }))

export const readProjectFile = Effect.fn("Installer.readProjectFile")(function*(target: Target) {
  const paths = yield* metadataIO(target.key, () => projectPaths(target))
  const snapshot = yield* readSnapshot(target.key, paths)
  return yield* metadataIO(target.key, () => {
    const basis = admittedBasis(snapshot)
    let text = ""
    if (snapshot.bytes !== null) {
      try {
        text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(snapshot.bytes)
      } catch {
        throw new Error("Project config is not valid UTF-8")
      }
    }
    return { basis, text }
  })
})

export const replaceProjectFile = Effect.fn("Installer.replaceProjectFile")(function*(
  target: Target,
  before: FileBasis,
  text: string
) {
  const { paths, bytes } = yield* metadataIO(target.key, () => {
    const paths = projectPaths(target)
    if (!text.isWellFormed()) throw new Error("Project config text is not well-formed Unicode")
    return { paths, bytes: Buffer.from(text, "utf8") }
  })
  yield* replace(target.key, paths, before, bytes).pipe(Effect.uninterruptible)
})
