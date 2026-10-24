import { constants } from "node:fs"
import { lstat, open, readdir, realpath } from "node:fs/promises"
import { join } from "node:path"
import { Effect, Match, Schema } from "effect"
import { PackageFile } from "../../../contracts/Compiler.ts"
import { PermissionBits } from "../../../contracts/ExecutableIntent.ts"
import { PackagePath } from "../../../contracts/Plugin.ts"
import { inside } from "../../internal/paths.ts"
import { commitment, fileDigest } from "../../internal/identity.ts"
import { resolvePayloadIntent } from "../../internal/files/executable.ts"
import { WindowsPayloadReader, WindowsPayloadReaderLive } from "../../internal/windows-files/payload.ts"
import type { NativeContent } from "../../internal/source-files.ts"

const sameFiles = Schema.toEquivalence(Schema.Array(PackageFile))

export class PayloadUnavailable extends Schema.TaggedError<PayloadUnavailable, { readonly brand: unique symbol }>()(
  "PayloadUnavailable", { cause: Schema.Defect() }
) {}

const readLinuxPayload = async (root: string): Promise<NativeContent[]> => {
  if (process.platform !== "linux") throw new Error("Payload inspection requires the Linux file-descriptor profile")
  if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error("Payload root is not a physical directory")
  const files: NativeContent[] = []
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name)
      const logical = prefix === "" ? name : `${prefix}/${name}`
      const info = await lstat(path)
      if (info.isSymbolicLink()) throw new Error("Native payload contains a symbolic link")
      if (info.isDirectory()) { await walk(path, logical); continue }
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        if (!inside(root, await realpath(`/proc/self/fd/${file.fd}`))) throw new Error("Native payload escaped its root")
        const before = await file.stat({ bigint: true })
        if (!before.isFile()) throw new Error("Native payload contains a special file")
        const content = new Uint8Array(await file.readFile())
        const after = await file.stat({ bigint: true })
        if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || before.mode !== after.mode) {
          throw new Error("Native payload changed during inspection")
        }
        files.push({
          path: PackagePath.make(logical), content,
          mode: {
            type: "posix",
            before: PermissionBits.make(Number(before.mode & 0o777n)),
            after: PermissionBits.make(Number(after.mode & 0o777n))
          }
        })
      } finally { await file.close() }
    }
  }
  await walk(root, "")
  files.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))
  return files
}

export const comparePayload = (captured: ReadonlyArray<NativeContent>, retained: ReadonlyArray<PackageFile>) => {
  const files = captured.map((file) => ({ ...file, digest: fileDigest(file.content) }))
  const expected = new Map(retained.map((file) => [file.path, file]))
  const reconstructed: PackageFile[] = []
  for (const file of files) {
    const approved = expected.get(file.path)
    if (approved === undefined) continue
    const resolution = resolvePayloadIntent({
      retained: { path: approved.path, digest: fileDigest(approved.content), executable: approved.executable },
      observed: { path: file.path, digest: file.digest, mode: file.mode }
    })
    Match.value(resolution).pipe(Match.discriminatorsExhaustive("type")({
      resolved: ({ executable }) => { reconstructed.push({ path: file.path, content: file.content, executable }) },
      refused: ({ reason }) => Match.value(reason).pipe(
        Match.when("path", () => undefined),
        Match.when("content", () => undefined),
        Match.when("intent", () => undefined),
        Match.when("unavailable", () => { throw new Error("Native payload permission evidence is unavailable") }),
        Match.when("changed", () => { throw new Error("Native payload permissions changed during inspection") }),
        Match.exhaustive
      )
    }))
  }
  const matches = files.length === retained.length && reconstructed.length === files.length && sameFiles(reconstructed, retained)
  const fingerprint = matches
    ? commitment("native-tree", reconstructed.map(({ path, content, executable }) => ({ path, digest: fileDigest(content), executable })))
    : commitment("native-tree-observation", files.map(({ path, digest, mode }) => ({ path, digest, mode })))
  return { matches, fingerprint }
}

export const readPayload = Effect.fn("Installer.readPayload")(function*(root: string, retained: ReadonlyArray<PackageFile>) {
  const files = yield* process.platform === "win32"
    ? Effect.flatMap(WindowsPayloadReader, (reader) => reader.read(root)).pipe(
      Effect.provide(WindowsPayloadReaderLive),
      Effect.mapError((cause) => new PayloadUnavailable({ cause }))
    )
    : Effect.tryPromise({ try: () => readLinuxPayload(root), catch: (cause) => new PayloadUnavailable({ cause }) })
  return yield* Effect.try({ try: () => comparePayload(files, retained), catch: (cause) => new PayloadUnavailable({ cause }) })
})
