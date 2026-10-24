import { NodeRuntime } from "@effect/platform-node"
import { appendFile, open, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Effect, Layer } from "effect"
import { tryLock } from "fs-native-extensions"
import { DestinationUnsupported, HostUnavailable, Installer, type PlanRequest } from "../../contracts/Installer.ts"
import { installerWorker } from "../../src/installer/execution/server.ts"

const fixtureOperation = Effect.fn("fixture.lockedPlan")(function*(request: PlanRequest) {
  const host = request.destination.host
  const attempt = <A>(operation: () => Promise<A>) => Effect.tryPromise({ try: operation, catch: (cause) => new HostUnavailable({ host, cause }) })
  const directory = request.destination.home
  const lock = yield* Effect.acquireRelease(
    attempt(() => open(join(directory, "writer.lock"), "a+")),
    (file) => Effect.promise(() => file.close())
  )
  let waiting = false
  while (!(yield* Effect.try({ try: () => tryLock(lock.fd), catch: (cause) => new HostUnavailable({ host, cause }) }))) {
    if (!waiting) {
      yield* attempt(() => writeFile(join(directory, `waiting-${process.pid}`), "contended\n"))
      waiting = true
    }
    yield* Effect.sleep("10 millis")
  }
  yield* attempt(() => appendFile(join(directory, "calls"), `${process.pid}\n`))
  yield* attempt(() => writeFile(join(directory, `entered-${process.pid}`), "entered\n"))
  const released = () => stat(join(directory, `release-${process.pid}`)).then(() => true, (cause: unknown) => {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return false
    throw cause
  })
  while (!(yield* attempt(released))) yield* Effect.sleep("10 millis")
  yield* attempt(() => writeFile(join(directory, `completed-${process.pid}`), "completed\n"))
  return yield* new DestinationUnsupported({ destination: request.destination, detail: "fixture operation completed" })
}, Effect.scoped)

const fixture = Layer.succeed(Installer, Installer.of({
  plan: fixtureOperation,
  apply: (plan) => Effect.fail(new DestinationUnsupported({ destination: plan.target.destination, detail: "fixture apply rejected" }))
}))

NodeRuntime.runMain(installerWorker.pipe(
  Effect.provide(fixture),
  Effect.tap((code) => Effect.sync(() => { process.exitCode = code }))
), { disableErrorReporting: true })
