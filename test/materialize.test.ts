import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { PackageFile } from "../contracts/Compiler.ts"
import { InstallationKey } from "../contracts/Installer.ts"
import { materializePayload } from "../src/installer/payload/materialize.ts"
import { readPayload } from "../src/installer/payload/read.ts"

const key = InstallationKey.make("a".repeat(64))
const files = Schema.decodeSync(Schema.Array(PackageFile))([
  { path: "Tools/run.mjs", content: Buffer.from("#!/usr/bin/env node\nconsole.log('ready')\n").toString("base64"), executable: true },
  { path: "data/café.bin", content: "", executable: false },
  { path: "data/café.bin", content: Buffer.from([0, 1, 255, 0, 42]).toString("base64"), executable: false }
])

const refused = (root: string) => materializePayload(key, root, files).pipe(
  Effect.as(false),
  Effect.catchTag("StateUnavailable", () => Effect.succeed(true))
)

const workspace = Effect.acquireRelease(
  Effect.promise(async () => realpath(await mkdtemp(join(tmpdir(), "pluginsdk-materialize-test-")))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true }))
)

it.effect("writes the complete approved tree with both executable intents", () => Effect.gen(function*() {
  const root = yield* workspace
  const payload = join(root, "payload")
  yield* materializePayload(key, payload, files)
  for (const file of files) {
    const path = join(payload, file.path)
    expect(new Uint8Array(yield* Effect.promise(() => readFile(path)))).toEqual(file.content)
    const info = yield* Effect.promise(() => stat(path))
    expect((info.mode & 0o111) !== 0).toBe(file.executable)
  }
  expect((yield* readPayload(payload, files)).matches).toBe(true)
}).pipe(Effect.scoped))

it.effect("preserves existing bytes when an immutable file collides", () => Effect.gen(function*() {
  const root = yield* workspace
  const payload = join(root, "payload")
  const collision = join(payload, "Tools/run.mjs")
  yield* Effect.promise(async () => { await mkdir(join(payload, "Tools"), { recursive: true }); await writeFile(collision, "retain me") })
  expect(yield* refused(payload)).toBe(true)
  expect(yield* Effect.promise(() => readFile(collision, "utf8"))).toBe("retain me")
}).pipe(Effect.scoped))

it.effect("refuses a linked destination without touching its target", () => Effect.gen(function*() {
  const root = yield* workspace
  const outside = join(root, "outside")
  const payload = join(root, "payload")
  yield* Effect.promise(async () => { await mkdir(outside); await writeFile(join(outside, "sentinel"), "retain me"); await symlink(outside, payload, "dir") })
  expect(yield* refused(payload)).toBe(true)
  expect(yield* Effect.promise(() => readFile(join(outside, "sentinel"), "utf8"))).toBe("retain me")
}).pipe(Effect.scoped))

it.effect("refuses an output tree containing an unapproved file", () => Effect.gen(function*() {
  const root = yield* workspace
  const payload = join(root, "payload")
  yield* Effect.promise(async () => { await mkdir(payload); await writeFile(join(payload, "unapproved"), "retain me") })
  expect(yield* refused(payload)).toBe(true)
  expect(yield* Effect.promise(() => readFile(join(payload, "unapproved"), "utf8"))).toBe("retain me")
}).pipe(Effect.scoped))
