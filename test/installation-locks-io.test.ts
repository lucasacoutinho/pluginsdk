import { mkdtemp, mkdir, open, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { expect, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { tryLock } from "fs-native-extensions"
import { Host, Target } from "../contracts/Installer.ts"
import { lockTarget } from "../src/installer/target/locks.ts"

const available = async (path: string) => {
  await mkdir(dirname(path), { recursive: true })
  const file = await open(path, "a+")
  try { return tryLock(file.fd) } finally { await file.close() }
}

it.skipIf(process.platform !== "linux")("serializes two homes sharing a project and releases both leases", async () => {
  const workspace = Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(join(tmpdir(), "pluginsdk-lock-test-")))),
    (root) => Effect.promise(() => rm(root, { recursive: true }))
  )
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const root = yield* workspace
    const homeA = join(root, "home-a")
    const homeB = join(root, "home-b")
    const projectA = join(root, "project-a")
    const projectB = join(root, "project-b")
    yield* Effect.promise(async () => {
      for (const path of [homeA, homeB, projectA, projectB]) await mkdir(path)
    })
    for (const host of Host.literals.filter((host) => host === "claude_code" || host === "codex")) {
      const target = (home: string, project: string | null) => Schema.decodeSync(Target)({
        key: `${host}-${home}-${project ?? "user"}`,
        destination: project === null ? { type: "user", host, home } : { type: "project", host, home, root: project },
        plugin: "lock-test", profile: "lock-test:1", version: "1"
      })
      const projectLock = join(projectA, ".pluginsdk/installer/writer.lock")
      yield* Effect.scoped(Effect.gen(function*() {
        expect(yield* lockTarget(target(homeA, projectA))).toHaveLength(2)
        expect(yield* Effect.promise(() => available(projectLock))).toBe(false)
        const shared = yield* Effect.scoped(lockTarget(target(homeB, projectA))).pipe(Effect.timeoutOption("100 millis"))
        expect(Option.isNone(shared)).toBe(true)
        const separate = yield* Effect.scoped(lockTarget(target(homeB, projectB))).pipe(Effect.timeoutOption("1 second"))
        expect(Option.getOrThrow(separate)).toHaveLength(2)
        const user = yield* Effect.scoped(lockTarget(target(homeB, null))).pipe(Effect.timeoutOption("1 second"))
        expect(Option.getOrThrow(user)).toHaveLength(1)
      }))
      expect(yield* Effect.promise(() => available(projectLock))).toBe(true)
      expect(yield* Effect.promise(() => available(join(homeA, ".pluginsdk/writer.lock")))).toBe(true)
    }
  })))
})
