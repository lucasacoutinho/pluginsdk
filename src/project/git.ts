import { ChildProcess, ChildProcessSpawner as ProcessSpawner } from "effect/process"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import type { Scope } from "effect/Scope"
import { Effect, FileSystem, Match, Option, Schema, Stream } from "effect"
import { join } from "node:path"
import { PackagePath } from "../../contracts/Plugin.ts"
import { GitPublication, ProjectError } from "../../contracts/Project.ts"

const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024
const COMMAND_TIMEOUT = "30 seconds"
const UTF8 = () => new TextDecoder("utf-8", { fatal: true })
const projectError = (detail: string): ProjectError => new ProjectError({ detail })

export const GitObject = Schema.String.check(
  Schema.isPattern(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
).pipe(Schema.brand("pluginsdk/GitObject"))
export type GitObject = typeof GitObject.Type

export const GitMode = Schema.Literals(["100644", "100755", "120000", "160000"])
export type GitMode = typeof GitMode.Type

export const GitEntry = Schema.Struct({ mode: GitMode, object: GitObject })
export type GitEntry = typeof GitEntry.Type

export const TreeFile = Schema.Struct({
  path: PackagePath,
  content: Schema.Uint8Array,
  executable: Schema.Boolean
})
export type TreeFile = typeof TreeFile.Type

export const GitEdit = Schema.Union([
  Schema.Struct({ type: Schema.Literal("unchanged") }),
  Schema.Struct({ type: Schema.Literal("update"), files: Schema.Array(TreeFile) })
]).pipe(Schema.toTaggedUnion("type"))
export type GitEdit = typeof GitEdit.Type

export const GitPublishResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("published"), commit: GitObject }),
  Schema.Struct({ type: Schema.Literal("unchanged"), commit: Schema.NullOr(GitObject) }),
  Schema.Struct({ type: Schema.Literal("uncertain"), commit: Schema.Null })
]).pipe(Schema.toTaggedUnion("type"))
export type GitPublishResult = typeof GitPublishResult.Type

export type GitSnapshot = {
  readonly commit: GitObject | null
  readonly entries: ReadonlyMap<string, GitEntry>
  readonly read: (paths: ReadonlyArray<string>) => Effect.Effect<ReadonlyMap<string, Uint8Array>, ProjectError>
}

class GitSpawnFailed extends Schema.TaggedError<GitSpawnFailed, { readonly brand: unique symbol }>()("GitSpawnFailed", {
  cause: Schema.Defect()
}) {}

class GitProcessFailed extends Schema.TaggedError<GitProcessFailed, { readonly brand: unique symbol }>()("GitProcessFailed", {
  cause: Schema.Defect()
}) {}

type CommandResult = { readonly output: Uint8Array; readonly exitCode: number }

type ByteAccumulator = { readonly chunks: Array<Uint8Array>; length: number }

const collectOutput = <E>(output: Stream.Stream<Uint8Array, E>) =>
  Stream.runFoldEffect(
    Stream.mapError(output, (cause) => new GitProcessFailed({ cause })),
    (): ByteAccumulator => ({ chunks: [], length: 0 }),
    (accumulator, chunk) => {
      if (chunk.byteLength > MAX_GIT_OUTPUT_BYTES - accumulator.length) {
        return Effect.fail(new GitProcessFailed({ cause: new Error("Git output exceeded the 64 MiB limit") }))
      }
      return Effect.sync(() => {
        accumulator.chunks.push(new Uint8Array(chunk))
        accumulator.length += chunk.byteLength
        return accumulator
      })
    }
  ).pipe(Effect.map(({ chunks, length }) => {
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  }))

const commandEnvironment = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_DIR: undefined,
  GIT_WORK_TREE: undefined,
  GIT_COMMON_DIR: undefined,
  GIT_INDEX_FILE: undefined,
  GIT_OBJECT_DIRECTORY: undefined,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
  GIT_CEILING_DIRECTORIES: undefined,
  GIT_PREFIX: undefined,
  GIT_TRACE: undefined,
  GIT_TRACE_SETUP: undefined,
  GIT_TRACE_PACKET: undefined,
  GIT_TRACE_CURL: undefined,
  GIT_TRACE2: undefined,
  GIT_TRACE2_EVENT: undefined,
  GIT_TRACE2_PERF: undefined,
  GIT_CURL_VERBOSE: undefined
}

const gitConfig = (hooksPath: string): ReadonlyArray<string> => [
  "-c", "gc.auto=0",
  "-c", "maintenance.auto=false",
  "-c", "maintenance.autoDetach=false",
  "-c", "commit.gpgsign=false",
  "-c", "protocol.allow=never",
  "-c", "protocol.file.allow=always",
  "-c", "protocol.ssh.allow=always",
  "-c", "protocol.https.allow=always",
  "-c", "core.hooksPath=" + hooksPath
]

const gitDirectoryArgs = (gitDirectory: string): ReadonlyArray<string> => ["--git-dir=" + gitDirectory]

const runGit = (
  cwd: string,
  hooksPath: string,
  args: ReadonlyArray<string>,
  input?: Uint8Array,
  extraEnvironment: Readonly<Record<string, string | undefined>> = {}
): Effect.Effect<Option.Option<CommandResult>, GitSpawnFailed | GitProcessFailed, ChildProcessSpawner> => Effect.gen(function*() {
  const spawner = yield* ProcessSpawner.ChildProcessSpawner
  const commandInput = input === undefined ? "ignore" : Stream.fromIterable([input])
  return yield* Effect.scoped(Effect.gen(function*() {
    const handle = yield* spawner.spawn(ChildProcess.make("git", [...gitConfig(hooksPath), ...args], {
      cwd,
      env: { ...commandEnvironment, ...extraEnvironment },
      extendEnv: true,
      shell: false,
      stdin: commandInput,
      stdout: "pipe",
      stderr: "pipe",
      detached: true,
      forceKillAfter: "1 second"
    })).pipe(Effect.mapError((cause) => new GitSpawnFailed({ cause })))

    const [output, , exitCode] = yield* Effect.all([
      collectOutput(handle.stdout),
      handle.stderr.pipe(Stream.runDrain, Effect.mapError((cause) => new GitProcessFailed({ cause }))),
      handle.exitCode.pipe(Effect.mapError((cause) => new GitProcessFailed({ cause })))
    ], { concurrency: "unbounded" })
    return { output, exitCode: Number(exitCode) }
  })).pipe(Effect.timeoutOption(COMMAND_TIMEOUT))
})

const runChecked = (
  cwd: string,
  hooksPath: string,
  args: ReadonlyArray<string>,
  operation: string,
  input?: Uint8Array
): Effect.Effect<Uint8Array, ProjectError, ChildProcessSpawner> => runGit(cwd, hooksPath, args, input).pipe(
  Effect.catchTags({
    GitSpawnFailed: () => Effect.fail(projectError("Could not start Git to " + operation)),
    GitProcessFailed: () => Effect.fail(projectError("Git failed while " + operation))
  }),
  Effect.flatMap((result) => Option.match(result, {
    onNone: () => Effect.fail(projectError("Git timed out while " + operation)),
    onSome: (completed) => completed.exitCode === 0
      ? Effect.succeed(completed.output)
      : Effect.fail(projectError("Git could not " + operation))
  }))
)

const decodeAscii = (bytes: Uint8Array): string | undefined => {
  let text = ""
  for (const byte of bytes) {
    if (byte > 0x7f) return undefined
    text += String.fromCharCode(byte)
  }
  return text
}

const parseObjectOutput = (bytes: Uint8Array): GitObject => {
  const text = decodeAscii(bytes)
  if (text === undefined) throw new Error("non-ASCII object ID")
  const value = text.endsWith("\n") ? text.slice(0, -1) : text
  if (value.length === 0 || value.includes("\n") || value.includes("\r")) throw new Error("invalid object ID output")
  return Schema.decodeSync(GitObject)(value)
}

const parseRemoteRef = (bytes: Uint8Array, expectedRef: string): GitObject | null => {
  const text = decodeAscii(bytes)
  if (text === undefined) throw new Error("non-ASCII remote ref")
  if (text === "") return null
  const lines = text.split("\n")
  if (lines[lines.length - 1] === "") lines.pop()
  if (lines.length !== 1) throw new Error("unexpected remote ref count")
  const line = lines[0]
  if (line === undefined) throw new Error("missing remote ref")
  const separator = line.indexOf("\t")
  if (separator <= 0 || line.slice(separator + 1) !== expectedRef) throw new Error("unexpected remote ref")
  return Schema.decodeSync(GitObject)(line.slice(0, separator))
}

const findByte = (bytes: Uint8Array, value: number, start: number): number => {
  for (let index = start; index < bytes.length; index++) if (bytes[index] === value) return index
  return -1
}

const parseTreeEntries = (bytes: Uint8Array): ReadonlyMap<string, GitEntry> => {
  const entries = new Map<string, GitEntry>()
  let offset = 0
  while (offset < bytes.length) {
    const end = findByte(bytes, 0, offset)
    if (end < 0 || end === offset) throw new Error("invalid ls-tree record boundary")
    const separator = findByte(bytes, 0x09, offset)
    if (separator < 0 || separator >= end) throw new Error("missing ls-tree path separator")
    const header = decodeAscii(bytes.subarray(offset, separator))
    if (header === undefined) throw new Error("non-ASCII ls-tree header")
    const fields = header.split(" ")
    if (fields.length !== 3) throw new Error("invalid ls-tree header")
    const modeText = fields[0]
    const objectType = fields[1]
    const objectText = fields[2]
    if (modeText === undefined || objectType === undefined || objectText === undefined) throw new Error("incomplete ls-tree header")
    const mode = Schema.decodeUnknownSync(GitMode)(modeText)
    if ((mode === "160000" && objectType !== "commit") || (mode !== "160000" && objectType !== "blob")) {
      throw new Error("ls-tree mode and object type disagree")
    }
    const path = UTF8().decode(bytes.subarray(separator + 1, end))
    if (path.length === 0 || entries.has(path)) throw new Error("invalid or duplicate ls-tree path")
    entries.set(path, Schema.decodeSync(GitEntry)({ mode, object: objectText }))
    offset = end + 1
  }
  return entries
}

const parseCatFileBatch = (bytes: Uint8Array, requested: ReadonlyArray<GitObject>): ReadonlyMap<GitObject, Uint8Array> => {
  const requestedObjects = new Set(requested)
  const contents = new Map<GitObject, Uint8Array>()
  let offset = 0
  while (offset < bytes.length) {
    const headerEnd = findByte(bytes, 0x0a, offset)
    if (headerEnd < 0) throw new Error("incomplete cat-file header")
    const header = decodeAscii(bytes.subarray(offset, headerEnd))
    if (header === undefined) throw new Error("non-ASCII cat-file header")
    const fields = header.split(" ")
    if (fields.length !== 3) throw new Error("invalid cat-file header")
    const objectText = fields[0]
    const objectType = fields[1]
    const sizeText = fields[2]
    if (objectText === undefined || objectType === undefined || sizeText === undefined) throw new Error("incomplete cat-file header")
    const object = Schema.decodeSync(GitObject)(objectText)
    if (!requestedObjects.has(object) || objectType !== "blob" || !/^(?:0|[1-9][0-9]*)$/.test(sizeText)) {
      throw new Error("cat-file returned an unrequested or non-blob object")
    }
    const size = Number(sizeText)
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("invalid cat-file object size")
    const contentStart = headerEnd + 1
    const contentEnd = contentStart + size
    if (contentEnd >= bytes.length || bytes[contentEnd] !== 0x0a || contents.has(object)) {
      throw new Error("invalid cat-file object boundary")
    }
    contents.set(object, bytes.slice(contentStart, contentEnd))
    offset = contentEnd + 1
  }
  if (contents.size !== requestedObjects.size) throw new Error("cat-file omitted requested objects")
  return contents
}

const decodeParse = <A>(decode: () => A, detail: string): Effect.Effect<A, ProjectError> => Effect.try({
  try: decode,
  catch: () => projectError(detail)
})

const readRemoteRef = (
  cwd: string,
  hooksPath: string,
  publication: GitPublication
): Effect.Effect<GitObject | null, ProjectError, ChildProcessSpawner> => {
  const ref = "refs/heads/" + publication.branch
  return runChecked(
    cwd,
    hooksPath,
    ["ls-remote", "--refs", "--", publication.repository, ref],
    "inspect the publication branch"
  ).pipe(Effect.flatMap((bytes) => decodeParse(
    () => parseRemoteRef(bytes, ref),
    "Git returned an invalid publication branch reference"
  )))
}

const readCommitRef = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  ref: string
): Effect.Effect<GitObject | null, ProjectError, ChildProcessSpawner> => runGit(
  cwd,
  hooksPath,
  [...gitDirectoryArgs(gitDirectory), "rev-parse", "--verify", "--quiet", ref + "^{commit}"]
).pipe(
  Effect.catchTags({
    GitSpawnFailed: () => Effect.fail(projectError("Could not start Git to inspect the publication branch")),
    GitProcessFailed: () => Effect.fail(projectError("Git failed while inspecting the publication branch"))
  }),
  Effect.flatMap((result) => Option.match(result, {
    onNone: () => Effect.fail(projectError("Git timed out while inspecting the publication branch")),
    onSome: (completed) => {
      if (completed.exitCode === 0) {
        return decodeParse(
          () => parseObjectOutput(completed.output),
          "Git returned an invalid publication commit"
        )
      }
      if (completed.exitCode === 1 && completed.output.byteLength === 0) return Effect.succeed(null)
      return Effect.fail(projectError("Git could not inspect the publication branch"))
    }
  }))
)

const readEntries = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  commit: GitObject | null
): Effect.Effect<ReadonlyMap<string, GitEntry>, ProjectError, ChildProcessSpawner> => {
  if (commit === null) return Effect.succeed(new Map())
  return runChecked(
    cwd,
    hooksPath,
    [...gitDirectoryArgs(gitDirectory), "ls-tree", "-r", "-z", "--full-tree", commit],
    "read the publication tree"
  ).pipe(Effect.flatMap((bytes) => decodeParse(
    () => parseTreeEntries(bytes),
    "Git returned an invalid publication tree"
  )))
}

const readSnapshot = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  commit: GitObject | null
): Effect.Effect<GitSnapshot, ProjectError, ChildProcessSpawner> => Effect.gen(function*() {
  const spawner = yield* ProcessSpawner.ChildProcessSpawner
  const entries = yield* readEntries(cwd, hooksPath, gitDirectory, commit)
  const read = (paths: ReadonlyArray<string>): Effect.Effect<ReadonlyMap<string, Uint8Array>, ProjectError> => {
    if (paths.length === 0) return Effect.succeed(new Map())
    return Effect.gen(function*() {
      const selected = new Map<string, GitEntry>()
      for (const path of paths) {
        const entry = entries.get(path)
        if (entry === undefined) return yield* projectError("A requested path is absent from the publication snapshot")
        if (entry.mode !== "100644" && entry.mode !== "100755") {
          return yield* projectError("A requested path is not a regular Git blob")
        }
        selected.set(path, entry)
      }
      const objects = [...new Set([...selected.values()].map((entry) => entry.object))]
      const input = new TextEncoder().encode(objects.map((object) => object + "\n").join(""))
      const output = yield* runChecked(
        cwd,
        hooksPath,
        [...gitDirectoryArgs(gitDirectory), "cat-file", "--batch"],
        "read publication blobs",
        input
      )
      const contents = yield* decodeParse(
        () => parseCatFileBatch(output, objects),
        "Git returned an invalid publication blob batch"
      )
      const result = new Map<string, Uint8Array>()
      for (const [path, entry] of selected) {
        const content = contents.get(entry.object)
        if (content === undefined) return yield* projectError("Git omitted a requested publication blob")
        result.set(path, new Uint8Array(content))
      }
      return result
    }).pipe(Effect.provideService(ProcessSpawner.ChildProcessSpawner, spawner))
  }
  return { commit, entries, read }
})

const makeSnapshot = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  publication: GitPublication,
  advertised: GitObject | null,
  initial: boolean
): Effect.Effect<GitSnapshot, ProjectError, ChildProcessSpawner> => Effect.gen(function*() {
  if (!initial && advertised !== null) {
    const ref = "refs/heads/" + publication.branch
    yield* runChecked(
      cwd,
      hooksPath,
      [
        ...gitDirectoryArgs(gitDirectory),
        "fetch",
        "--no-tags",
        "--no-recurse-submodules",
        "--depth=1",
        "--",
        publication.repository,
        "+" + ref + ":refs/pluginsdk/snapshot"
      ],
      "refresh the publication branch"
    )
  }
  const ref = initial
    ? "refs/heads/" + publication.branch
    : "refs/pluginsdk/snapshot"
  const commit = yield* readCommitRef(cwd, hooksPath, gitDirectory, ref)
  if (commit !== advertised) return yield* projectError("The publication branch changed while it was being read; retry publish")
  return yield* readSnapshot(cwd, hooksPath, gitDirectory, commit)
})

const createGitSnapshot = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  publication: GitPublication
): Effect.Effect<GitSnapshot, ProjectError, ChildProcessSpawner> => Effect.gen(function*() {
  const advertised = yield* readRemoteRef(cwd, hooksPath, publication)
  yield* runChecked(
    cwd,
    hooksPath,
    [
      "clone",
      "--bare",
      "--no-local",
      "--template=" + hooksPath,
      "--",
      publication.repository,
      gitDirectory
    ],
    "fetch the publication repository"
  )
  return yield* makeSnapshot(cwd, hooksPath, gitDirectory, publication, advertised, true)
})

const hashFile = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  content: Uint8Array
): Effect.Effect<GitObject, ProjectError, ChildProcessSpawner> => runChecked(
  cwd,
  hooksPath,
  [...gitDirectoryArgs(gitDirectory), "hash-object", "-w", "--stdin"],
  "store a publication file",
  content
).pipe(Effect.flatMap((bytes) => decodeParse(
  () => parseObjectOutput(bytes),
  "Git returned an invalid publication object ID"
)))

const writeTree = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  snapshot: GitSnapshot,
  files: ReadonlyArray<TreeFile>
): Effect.Effect<GitObject, ProjectError, ChildProcessSpawner> => Effect.gen(function*() {
  if (files.length === 0) return yield* projectError("A Git update must contain at least one file")
  const unique = new Set<string>()
  const records = new Array<Uint8Array>()
  for (const file of files) {
    if (unique.has(file.path)) return yield* projectError("A Git update contains a duplicate path")
    unique.add(file.path)
    const object = yield* hashFile(cwd, hooksPath, gitDirectory, file.content)
    const mode = file.executable ? "100755" : "100644"
    records.push(new TextEncoder().encode(mode + " " + object + "\t" + file.path + "\0"))
  }
  yield* runChecked(
    cwd,
    hooksPath,
    [...gitDirectoryArgs(gitDirectory), "read-tree", ...(snapshot.commit === null ? ["--empty"] : [snapshot.commit])],
    "prepare the publication index"
  )
  const indexData = new Uint8Array(records.reduce((size, record) => size + record.byteLength, 0))
  let offset = 0
  for (const record of records) {
    indexData.set(record, offset)
    offset += record.byteLength
  }
  yield* runChecked(
    cwd,
    hooksPath,
    [...gitDirectoryArgs(gitDirectory), "update-index", "-z", "--index-info"],
    "stage publication files",
    indexData
  )
  const treeOutput = yield* runChecked(
    cwd,
    hooksPath,
    [...gitDirectoryArgs(gitDirectory), "write-tree"],
    "write the publication tree"
  )
  return yield* decodeParse(
    () => parseObjectOutput(treeOutput),
    "Git returned an invalid publication tree ID"
  )
})

const commitTree = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  tree: GitObject,
  parent: GitObject | null
): Effect.Effect<GitObject, ProjectError, ChildProcessSpawner> => {
  const identity = {
    GIT_AUTHOR_NAME: "PluginSDK",
    GIT_AUTHOR_EMAIL: "pluginsdk@localhost",
    GIT_COMMITTER_NAME: "PluginSDK",
    GIT_COMMITTER_EMAIL: "pluginsdk@localhost",
    GIT_AUTHOR_DATE: undefined,
    GIT_COMMITTER_DATE: undefined
  }
  const args = [
    ...gitDirectoryArgs(gitDirectory),
    "commit-tree",
    tree,
    ...(parent === null ? [] : ["-p", parent])
  ]
  return runGit(
    cwd,
    hooksPath,
    args,
    new TextEncoder().encode("Publish PluginSDK release\n"),
    identity
  ).pipe(
    Effect.catchTags({
      GitSpawnFailed: () => Effect.fail(projectError("Could not start Git to create the publication commit")),
      GitProcessFailed: () => Effect.fail(projectError("Git failed while creating the publication commit"))
    }),
    Effect.flatMap((result) => Option.match(result, {
      onNone: () => Effect.fail(projectError("Git timed out while creating the publication commit")),
      onSome: (completed) => completed.exitCode === 0
        ? decodeParse(
          () => parseObjectOutput(completed.output),
          "Git returned an invalid publication commit ID"
        )
        : Effect.fail(projectError("Git could not create the publication commit"))
    }))
  )
}

const pushCommit = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  publication: GitPublication,
  expected: GitObject | null,
  commit: GitObject
): Effect.Effect<Option.Option<CommandResult>, GitSpawnFailed | GitProcessFailed, ChildProcessSpawner> => {
  const ref = "refs/heads/" + publication.branch
  const lease = "--force-with-lease=" + ref + ":" + (expected ?? "")
  const refspec = commit + ":" + ref
  return runGit(cwd, hooksPath, [
    ...gitDirectoryArgs(gitDirectory),
    "push",
    "--porcelain",
    lease,
    "--",
    publication.repository,
    refspec
  ])
}

export const publishGit = Effect.fn("Project.publishGit")(function*(
  destination: GitPublication,
  prepare: (snapshot: GitSnapshot) => Effect.Effect<GitEdit, ProjectError>
): Effect.fn.Return<GitPublishResult, ProjectError, FileSystem.FileSystem | ChildProcessSpawner> {
  const fs = yield* FileSystem.FileSystem
  const spawner = yield* ProcessSpawner.ChildProcessSpawner
  const program = Effect.scoped(Effect.gen(function*(): Effect.fn.Return<GitPublishResult, ProjectError, ChildProcessSpawner | Scope> {
    const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-git-" }).pipe(
      Effect.mapError(() => projectError("Cannot create a temporary Git workspace"))
    )
    const hooksPath = join(temporary, "empty-hooks")
    const gitDirectory = join(temporary, "repository.git")
    yield* fs.makeDirectory(hooksPath, { recursive: true }).pipe(
      Effect.mapError(() => projectError("Cannot create the Git hooks directory"))
    )

    const initial = yield* createGitSnapshot(temporary, hooksPath, gitDirectory, destination)
    const edit = yield* prepare(initial)
    return yield* Match.value(edit).pipe(Match.discriminatorsExhaustive("type")({
      unchanged: () => Effect.succeed<GitPublishResult>({ type: "unchanged", commit: initial.commit }),
      update: ({ files }) => Effect.gen(function*(): Effect.fn.Return<GitPublishResult, ProjectError, ChildProcessSpawner> {
        const tree = yield* writeTree(temporary, hooksPath, gitDirectory, initial, files)
        const commit = yield* commitTree(temporary, hooksPath, gitDirectory, tree, initial.commit)
        const pushed = yield* pushCommit(temporary, hooksPath, gitDirectory, destination, initial.commit, commit).pipe(
          Effect.flatMap((result) => Option.match(result, {
            onNone: () => reconcilePush(temporary, hooksPath, gitDirectory, destination, prepare),
            onSome: (completed) => completed.exitCode === 0
              ? Effect.succeed<GitPublishResult>({ type: "published", commit })
              : reconcilePush(temporary, hooksPath, gitDirectory, destination, prepare)
          })),
          Effect.catchTags({
            GitSpawnFailed: () => Effect.fail(projectError("Could not start Git to push the publication commit")),
            GitProcessFailed: () =>
              reconcilePush(temporary, hooksPath, gitDirectory, destination, prepare)
          })
        )
        return pushed
      })
    }))
  })).pipe(Effect.provideService(ProcessSpawner.ChildProcessSpawner, spawner))
  return yield* program
})

const refreshSnapshot = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  publication: GitPublication
): Effect.Effect<GitSnapshot, ProjectError, ChildProcessSpawner> => Effect.gen(function*() {
  const advertised = yield* readRemoteRef(cwd, hooksPath, publication)
  return yield* makeSnapshot(cwd, hooksPath, gitDirectory, publication, advertised, false)
})

const reconcilePush = (
  cwd: string,
  hooksPath: string,
  gitDirectory: string,
  publication: GitPublication,
  prepare: (snapshot: GitSnapshot) => Effect.Effect<GitEdit, ProjectError>
): Effect.Effect<GitPublishResult, ProjectError, ChildProcessSpawner> => Effect.gen(function*() {
  const refreshed = yield* Effect.option(refreshSnapshot(cwd, hooksPath, gitDirectory, publication))
  return yield* Option.match(refreshed, {
    onNone: () => Effect.succeed<GitPublishResult>({ type: "uncertain", commit: null }),
    onSome: (snapshot) => prepare(snapshot).pipe(Effect.flatMap((edit) => Match.value(edit).pipe(
      Match.discriminatorsExhaustive("type")({
        unchanged: () => Effect.succeed<GitPublishResult>({ type: "unchanged", commit: snapshot.commit }),
        update: () => Effect.fail(projectError("The Git publication branch changed or rejected the push; retry publish"))
      })
    )))
  })
})
