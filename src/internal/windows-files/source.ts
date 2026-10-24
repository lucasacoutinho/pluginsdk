import { realpath } from "node:fs/promises"
import { Effect, Match, Schema } from "effect"
import { SourceUnavailable } from "../../../contracts/Compiler.ts"
import * as Files from "../../../contracts/FileRead.ts"
import { PackagePath, type Directory } from "../../../contracts/Plugin.ts"
import type * as Trees from "../../../contracts/TreeRead.ts"
import { admitRead } from "../files/file.ts"
import { admitDirectory, admitEntry } from "../files/tree.ts"
import { compareUtf8 } from "../paths.ts"
import { SourceFiles, SourceReadRejected, type NativeContent, type SourceSelectionMode } from "../source-files.ts"
import { getFileApi, type FileApi } from "./api.ts"
import { directoryAnchor, NativePathRefused, openRoot, type NativeFile, type NativeRoot } from "./owner.ts"
import type { NativeSnapshot } from "./observation.ts"

function entryAccepted(path: PackagePath, decision: Trees.EntryDecision): void {
  const refuse = (reason: SourceReadRejected["reason"]): never => { throw new SourceReadRejected({ path, reason }) }
  Match.value(decision).pipe(
    Match.when("accepted", () => undefined),
    Match.when("outside", () => refuse("outside")),
    Match.when("cycle", () => refuse("cycle")),
    Match.when("not_regular", () => refuse("not_regular")),
    Match.when("stream", () => refuse("path")),
    Match.when("name_mismatch", () => refuse("name")),
    Match.when("reparse", () => refuse("reparse")),
    Match.when("unavailable", () => { throw new Error("Native source entry observation is unavailable") }),
    Match.when("changed", () => { throw new Error("Native source entry changed during capture") }),
    Match.exhaustive
  )
}

function sourceReader(owner: NativeRoot, root: Directory) {
  const cache = new Map<PackagePath, NativeContent>()
  const io = <A>(operation: () => A) => Effect.try({ try: operation, catch: (cause) =>
    cause instanceof SourceReadRejected ? cause
      : cause instanceof NativePathRefused ? new SourceReadRejected({ path: cause.path, reason: "path" })
      : new SourceUnavailable({ root, cause })
  })
  const withChild = <A>(path: PackagePath, name: Files.Component, branch: Trees.Branch,
    use: (target: NativeFile, observed: NativeSnapshot) => A): A => {
    const guard = owner.open(path)
    let target = guard
    try {
      const entry = guard.snapshot()
      target = Match.value(entry.entry).pipe(Match.discriminatorsExhaustive("type")({
        reparse: ({ info }) => {
          if (info.tag !== 0xa000_0003 && info.tag !== 0xa000_000c) throw new SourceReadRejected({ path, reason: "reparse" })
          return owner.open(path, "target")
        },
        directory: () => guard,
        file: () => guard,
        other: () => { throw new SourceReadRejected({ path, reason: "not_regular" }) },
        unavailable: () => { throw new Error("Native source entry observation is unavailable") }
      }))
      const observed = target === guard ? entry : target.snapshot()
      entryAccepted(path, admitEntry({ policy: "source", root: owner.anchor, branch, name,
        entry: entry.entry, target: observed.observation }))
      return use(target, observed)
    } finally {
      try { if (target !== guard) target.close() } finally { guard.close() }
    }
  }
  const read = (path: PackagePath, target: NativeFile, observed: NativeSnapshot): NativeContent => {
    const observation = Match.value(observed.observation).pipe(Match.discriminatorsExhaustive("type")({
      file: (observation) => observation,
      directory: () => { throw new SourceReadRejected({ path, reason: "not_regular" }) },
      other: () => { throw new SourceReadRejected({ path, reason: "not_regular" }) },
      unavailable: () => { throw new Error("Native source file observation is unavailable") }
    }))
    const cached = cache.get(path)
    if (cached !== undefined) return cached
    const before = { root: owner.file.snapshot().observation, file: observation }
    const content = target.read()
    const after = { root: owner.file.snapshot().observation, file: target.snapshot().observation }
    Match.value(admitRead({ root: owner.anchor, before, after,
      read: { type: "complete", length: Files.Quantity.make(String(content.length)) } })).pipe(
      Match.when("accepted", () => undefined),
      Match.when("outside", () => { throw new SourceReadRejected({ path, reason: "outside" }) }),
      Match.when("not_regular", () => { throw new SourceReadRejected({ path, reason: "not_regular" }) }),
      Match.when("stream", () => { throw new SourceReadRejected({ path, reason: "path" }) }),
      Match.when("changed", () => { throw new Error("Native source changed during capture") }),
      Match.when("unavailable", () => { throw new Error("Native source read observation is unavailable") }),
      Match.exhaustive
    )
    const captured: NativeContent = { path, content, mode: { type: "unrepresented" } }
    cache.set(path, captured)
    return captured
  }
  const walk = (path: PackagePath, directory: NativeFile, ancestors: ReadonlyArray<Files.Anchor>): NativeContent[] => {
    const before = { root: owner.file.snapshot().observation, directory: directory.snapshot() }
    const parent = directoryAnchor(before.directory.observation)
    const enumeratedBefore = directory.enumerate()
    const names = Match.value(enumeratedBefore).pipe(Match.discriminatorsExhaustive("type")({
      complete: ({ names }) => names,
      failed: () => { throw new Error("Native source enumeration failed") }
    }))
    const visited: Files.Component[] = []
    const files: NativeContent[] = []
    for (const name of names.toSorted(compareUtf8)) {
      const child = PackagePath.make(`${path}/${name}`)
      files.push(...withChild(child, name, { parent, ancestors }, (target, observed) =>
        Match.value(observed.observation).pipe(Match.discriminatorsExhaustive("type")({
          file: () => [read(child, target, observed)],
          directory: () => walk(child, target, [parent, ...ancestors]),
          other: () => { throw new SourceReadRejected({ path: child, reason: "not_regular" }) },
          unavailable: () => { throw new Error("Native source target observation is unavailable") }
        }))
      ))
      visited.push(name)
    }
    const enumeratedAfter = directory.enumerate()
    const after = { root: owner.file.snapshot().observation, directory: directory.snapshot().directory }
    const decision = admitDirectory({ root: owner.anchor, directory: parent,
      before: { root: before.root, directory: before.directory.directory }, after,
      enumeratedBefore, enumeratedAfter, visited })
    if (decision !== "accepted") throw new Error(`Native source directory refused: ${decision}`)
    return files
  }
  const selected = <A>(path: PackagePath, use: (target: NativeFile, observed: NativeSnapshot, branch: Trees.Branch) => A): A => {
    let components: readonly [Files.Component, ...Files.Component[]]
    const [first, ...rest] = path.split("/")
    if (first === undefined) throw new SourceReadRejected({ path, reason: "path" })
    try { components = Schema.decodeSync(Schema.NonEmptyArray(Files.Component))([first, ...rest]) }
    catch { throw new SourceReadRejected({ path, reason: "path" }) }
    const descend = (parts: readonly [Files.Component, ...Files.Component[]], prefix: PackagePath | null,
      parent: Files.Anchor, ancestors: ReadonlyArray<Files.Anchor>): A => {
      const [name, ...tail] = parts
      const logical = PackagePath.make(prefix === null ? name : `${prefix}/${name}`)
      return withChild(logical, name, { parent, ancestors }, (target, observed) => {
        const [next, ...rest] = tail
        if (next === undefined) return use(target, observed, { parent, ancestors })
        const anchor = Match.value(observed.observation).pipe(Match.discriminatorsExhaustive("type")({
          directory: ({ anchor }) => anchor,
          file: () => { throw new SourceReadRejected({ path: logical, reason: "not_directory" }) },
          other: () => { throw new SourceReadRejected({ path: logical, reason: "not_directory" }) },
          unavailable: () => { throw new Error("Native source parent observation is unavailable") }
        }))
        return descend([next, ...rest], logical, anchor, [parent, ...ancestors])
      })
    }
    return descend(components, null, owner.anchor, [])
  }
  return SourceFiles.of({
    file: Effect.fn("Compiler.windowsSourceFile")(function*(path: PackagePath) {
      return yield* io(() => selected(path, (target, observed) => read(path, target, observed)))
    }),
    select: Effect.fn("Compiler.windowsSourceSelection")(function*(path: PackagePath, mode: SourceSelectionMode) {
      return yield* io(() => selected(path, (target, observed, branch) =>
        Match.value(observed.observation).pipe(Match.discriminatorsExhaustive("type")({
          directory: () => walk(path, target, [branch.parent, ...branch.ancestors]),
          file: () => Match.value(mode).pipe(
            Match.when("either", () => [read(path, target, observed)]),
            Match.when("directory", () => { throw new SourceReadRejected({ path, reason: "not_directory" }) }),
            Match.exhaustive
          ),
          other: () => { throw new SourceReadRejected({ path, reason: "not_regular" }) },
          unavailable: () => { throw new Error("Native source target observation is unavailable") }
        }))
      ))
    })
  })
}

export const makeWindowsSourceFilesWithApi = Effect.fn("Compiler.windowsSourceFiles")(function*(root: Directory, api: FileApi) {
  const unavailable = (cause: unknown) => new SourceUnavailable({ root, cause })
  const physical = yield* Effect.tryPromise({ try: () => realpath(root), catch: unavailable })
  const owner = yield* Effect.acquireRelease(
    Effect.try({ try: () => openRoot(api, physical), catch: unavailable }),
    (owner) => Effect.sync(owner.close)
  )
  return sourceReader(owner, root)
})

export const makeWindowsSourceFiles = Effect.fn("Compiler.windowsSourceFilesLive")(function*(root: Directory) {
  const api = yield* Effect.tryPromise({ try: getFileApi, catch: (cause) => new SourceUnavailable({ root, cause }) })
  return yield* makeWindowsSourceFilesWithApi(root, api)
})
