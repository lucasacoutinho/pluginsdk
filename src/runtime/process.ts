import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { isAbsolute, resolve } from "node:path"
import { Console, Effect, FileSystem, Match, Schema } from "effect"
import { LauncherPath } from "../../contracts/Launcher.ts"
import { EnvironmentName, ProcessText } from "../../contracts/Plugin.ts"
import { ProcessData } from "../../contracts/PortableMcp.ts"
import { CaptureInput } from "../../contracts/ProcessRuntime.ts"
import { parseJsonBytes } from "../internal/json.ts"
import { executeProcess, readProcessCapture } from "./model.ts"
import { runChild } from "./child.ts"
import { ProcessRuntimeFailure } from "./failure.ts"

const Platform = Schema.Literals(["linux", "win32"])
const Arguments = Schema.Tuple([
  ProcessText.check(Schema.makeFilter((value) => value === "." || isAbsolute(value), {
    expected: "an absolute plugin root or exactly ."
  })),
  LauncherPath
])
const NodeVersion = Schema.String.check(Schema.makeFilter((version) => {
  const [major, minor] = version.split(".").map(Number)
  return major !== undefined && minor !== undefined && (major > 24 || (major === 24 && minor >= 18))
}, { expected: "Node 24.18 or later" }))

function environmentValue(name: EnvironmentName): string | null {
  return Object.hasOwn(process.env, name) ? process.env[name] ?? null : null
}

const readCaptures = Effect.fn("ProcessRuntime.readCaptures")(function*(data: ProcessData) {
  const values: Array<readonly [EnvironmentName, ProcessText]> = []
  for (const capture of data.script.captures) {
    const input = yield* Schema.decodeEffect(CaptureInput)({
      source: capture.source,
      raw: environmentValue(capture.raw),
      check: environmentValue(capture.check)
    }).pipe(Effect.mapError(() => new ProcessRuntimeFailure({ detail: `Invalid capture for ${capture.source}` })))
    const value = readProcessCapture(input)
    if (value === null) return yield* new ProcessRuntimeFailure({ detail: `Missing environment source ${capture.source}` })
    values.push([capture.source, value])
  }
  return Object.fromEntries(values)
})

const replacePosix = Effect.fn("ProcessRuntime.replacePosix")(function*(root: ProcessText, data: ProcessData) {
  const execve = process.execve
  if (execve === undefined) return yield* new ProcessRuntimeFailure({ detail: "Process replacement is unavailable" })
  return yield* Effect.try({
    try: () => execve("/bin/sh", ["/bin/sh", `${root}/${data.posix}`, root], process.env),
    catch: () => new ProcessRuntimeFailure({ detail: "Could not start the POSIX launcher" })
  })
})

const run = Effect.fn("ProcessRuntime.run")(function*() {
  yield* Schema.decodeEffect(NodeVersion)(process.versions.node).pipe(
    Effect.mapError(() => new ProcessRuntimeFailure({ detail: "Node 24.18 or later is required" }))
  )
  const platform = yield* Schema.decodeUnknownEffect(Platform)(process.platform).pipe(
    Effect.mapError(() => new ProcessRuntimeFailure({ detail: "This runtime supports Linux and Windows only" }))
  )
  const [rootInput, path] = yield* Schema.decodeUnknownEffect(Arguments)(process.argv.slice(2)).pipe(
    Effect.mapError(() => new ProcessRuntimeFailure({ detail: "Expected a plugin root and contained process data path" }))
  )
  const root = ProcessText.make(resolve(rootInput))
  const fs = yield* FileSystem.FileSystem
  const bytes = yield* fs.readFile(`${root}/${path}`).pipe(
    Effect.mapError(() => new ProcessRuntimeFailure({ detail: "Could not read process data" }))
  )
  const value = yield* Effect.try({
    try: () => parseJsonBytes(bytes),
    catch: () => new ProcessRuntimeFailure({ detail: "Process data must be strict UTF-8 JSON" })
  })
  const data = yield* Schema.decodeUnknownEffect(ProcessData)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ProcessRuntimeFailure({ detail: "Invalid process data" }))
  )
  const captures = yield* readCaptures(data)
  const invocation = executeProcess({ script: data.script, root, captures })
  if (invocation === null) return yield* new ProcessRuntimeFailure({ detail: "Process instructions could not be resolved" })
  return yield* Match.value(platform).pipe(
    Match.when("linux", () => replacePosix(root, data)),
    Match.when("win32", () => Effect.gen(function*() {
      yield* Effect.sync(() => {
        for (const { raw, check } of data.script.captures) {
          delete process.env[raw]
          delete process.env[check]
        }
        for (const { name, value } of invocation.environment) process.env[name] = value
      })
      return yield* runChild(invocation, process.env)
    })),
    Match.exhaustive
  )
})

NodeRuntime.runMain(run().pipe(
  Effect.tap((code) => Effect.sync(() => { process.exitCode = code })),
  Effect.tapError(({ detail }) => Console.error(`pluginsdk runtime: ${detail}`)),
  Effect.provide(NodeFileSystem.layer)
), { disableErrorReporting: true })
