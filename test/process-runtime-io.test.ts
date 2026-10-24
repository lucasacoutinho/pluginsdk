import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { createConnection } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Cause, Effect, Exit, Fiber, FileSystem, Match, Schema } from "effect"
import { ProcessPlan } from "../contracts/Process.ts"
import * as PortableMcp from "../contracts/PortableMcp.ts"
import { Invocation } from "../contracts/ProcessRuntime.ts"
import * as RuntimeFailure from "../src/runtime/failure.ts"
import { runChild } from "../src/runtime/child.ts"

type PackageFiles = {
  readonly runtimePath: string
  readonly dataPath: string
  readonly data: PortableMcp.ProcessData
  readonly posixPath: string
  readonly posix: string
}

type MaterializedPackage = PackageFiles & {
  readonly root: string
  readonly runtime: string
  readonly marker: string
}

type CapturedProcess = {
  readonly pid: number | undefined
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly spawnError: Error | undefined
  readonly timedOut: boolean
}

type PlanOptions = {
  readonly command: string
  readonly cwd: "root" | "file"
  readonly args: ReadonlyArray<unknown>
  readonly environment: ReadonlyArray<unknown>
}

const runtimeAssetPath = fileURLToPath(new URL("../runtime/process.mjs", import.meta.url))
const runtimeAsset = readFileSync(runtimeAssetPath)
const RuntimeFixtureObservation = Schema.Struct({
  pid: Schema.Finite,
  argv: Schema.Array(Schema.String),
  cwd: Schema.String,
  source: Schema.NullOr(Schema.String),
  capturedSource: Schema.NullOr(Schema.String),
  captureBindings: Schema.Record(Schema.String, Schema.Boolean)
})
type RuntimeFixtureObservation = typeof RuntimeFixtureObservation.Type

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function encodeJson(value: unknown): string {
  const json = JSON.stringify(value)
  if (json === undefined) throw new Error("runtime fixture could not be encoded as JSON")
  return json
}

function renderPackage(options: PlanOptions): PackageFiles {
  const cwd = options.cwd === "root"
    ? { type: "root" }
    : { type: "file", path: "work" }
  const plan = decodeStrict(ProcessPlan, {
    command: { type: "literal", value: options.command },
    args: [{ type: "file", path: "fixture.mjs" }, ...options.args],
    environment: options.environment,
    cwd
  })
  const input = decodeStrict(PortableMcp.Input, {
    format: "claude_code",
    remote: {},
    local: { fixture: plan }
  })
  const result = decodeStrict(PortableMcp.Result, PortableMcp.renderPortableMcp(input))
  return Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
    rejected: () => { throw new Error("portable process fixture was rejected") },
    rendered: ({ files }) => {
      let runtimePath: string | undefined
      let dataPath: string | undefined
      let data: PortableMcp.ProcessData | undefined
      let posixPath: string | undefined
      let posix: string | undefined
      for (const file of files) {
        Match.value(file).pipe(Match.discriminatorsExhaustive("type")({
          runtime: ({ path }) => {
            if (runtimePath !== undefined) throw new Error("portable process plan has duplicate runtime files")
            runtimePath = path
          },
          process: ({ path, data: processData }) => {
            if (dataPath !== undefined) throw new Error("portable process plan has duplicate process data")
            dataPath = path
            data = decodeStrict(PortableMcp.ProcessData, processData)
          },
          posix: ({ path, content }) => {
            if (posixPath !== undefined) throw new Error("portable process plan has duplicate POSIX sidecars")
            posixPath = path
            posix = content
          }
        }))
      }
      if (runtimePath === undefined || dataPath === undefined || data === undefined ||
          posixPath === undefined || posix === undefined || data.posix !== posixPath) {
        throw new Error("portable process plan is incomplete")
      }
      return { runtimePath, dataPath, data, posixPath, posix }
    }
  }))
}

function fixtureSource(root: string, data: PortableMcp.ProcessData): string {
  const captureNames = data.script.captures.flatMap(({ raw, check }) => [raw, check])
  return [
    "import { writeFileSync } from 'node:fs'",
    `writeFileSync(${JSON.stringify(join(root, "started"))}, "started")`,
    `const captureNames = ${JSON.stringify(captureNames)}`,
    "const report = {",
    "  pid: process.pid,",
    "  argv: process.argv.slice(2),",
    "  cwd: process.cwd(),",
    "  source: process.env.SOURCE ?? null,",
    "  capturedSource: process.env.CAPTURED_SOURCE ?? null,",
    "  captureBindings: Object.fromEntries(captureNames.map((name) => [name, Object.hasOwn(process.env, name)]))",
    "}",
    "process.stdout.write(JSON.stringify(report) + '\\n')",
    "process.stdout.write('fixture-stdout\\n')",
    "process.stderr.write('fixture-stderr\\n')",
    "process.exitCode = 37"
  ].join("\n")
}

const installPackage = Effect.fnUntraced(function*(files: PackageFiles) {
  const fs = yield* FileSystem.FileSystem
  const temporaryParent = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-process-runtime-" })
  const root = join(temporaryParent, "Plugin Root '雪")
  const runtime = join(root, files.runtimePath)
  const dataPath = join(root, files.dataPath)
  const posixPath = join(root, files.posixPath)
  const marker = join(root, "started")
  yield* fs.makeDirectory(root, { recursive: true })
  yield* fs.makeDirectory(dirname(runtime), { recursive: true })
  yield* fs.makeDirectory(dirname(dataPath), { recursive: true })
  yield* fs.makeDirectory(dirname(posixPath), { recursive: true })
  yield* fs.makeDirectory(join(root, "work"), { recursive: true })
  yield* fs.writeFile(runtime, runtimeAsset)
  const encodedData = yield* Schema.encodeEffect(PortableMcp.ProcessData)(files.data)
  yield* fs.writeFileString(dataPath, encodeJson(encodedData))
  yield* fs.writeFileString(posixPath, files.posix)
  yield* fs.chmod(posixPath, 0o755)
  yield* fs.writeFileString(join(root, "fixture.mjs"), fixtureSource(root, files.data))
  return { ...files, root, runtime, dataPath: files.dataPath, marker }
})

function runtimeEnvironment(data: PortableMcp.ProcessData, sourceValue?: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" }
  if (sourceValue !== undefined) {
    for (const capture of data.script.captures) {
      environment[capture.raw] = sourceValue
      environment[capture.check] = sourceValue
    }
  }
  return environment
}

function runStandalone(
  package_: MaterializedPackage,
  dataPath: string,
  environment: NodeJS.ProcessEnv
): Promise<CapturedProcess> {
  return captureProcess([package_.runtime, package_.root, dataPath], environment)
}

function captureProcess(arguments_: ReadonlyArray<string>, environment: NodeJS.ProcessEnv, cwd = process.cwd()): Promise<CapturedProcess> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...arguments_], {
      cwd,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"]
    })
    let stdout = ""
    let stderr = ""
    let spawnError: Error | undefined
    let closed = false
    let timedOut = false
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
    child.once("error", (error) => { spawnError = error })
    const completion = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((done) => {
      child.once("close", (code, signal) => {
        closed = true
        done({ code, signal })
      })
    })
    const timeout = setTimeout(() => {
      if (!closed) {
        timedOut = true
        child.kill("SIGKILL")
      }
    }, 10_000)
    void completion.then((outcome) => {
      clearTimeout(timeout)
      resolve({
        pid: child.pid,
        ...outcome,
        stdout,
        stderr,
        spawnError,
        timedOut
      })
    })
  })
}

function observationFrom(stdout: string): RuntimeFixtureObservation {
  const line = stdout.split(/\r?\n/).find((value) => value.startsWith("{"))
  if (line === undefined) throw new Error(`runtime fixture did not report an observation: ${stdout}`)
  const raw: unknown = JSON.parse(line)
  return decodeStrict(RuntimeFixtureObservation, raw)
}

function objectRecord(value: unknown): Record<string, unknown> {
  return decodeStrict(Schema.Record(Schema.String, Schema.Unknown), value)
}

function malformedPayloads(data: PortableMcp.ProcessData): ReadonlyArray<{ readonly name: string; readonly json: string }> {
  const record = objectRecord(Schema.encodeSync(PortableMcp.ProcessData)(data))
  const script = objectRecord(record.script)
  const snapshot = decodeStrict(Schema.Array(Schema.Unknown), script.snapshot)
  const first = snapshot[0]
  if (first === undefined) throw new Error("process fixture script had no snapshot word")
  const secret = "runtime-invalid-data-secret"
  const invalidVariant = { ...record, script: { ...script, snapshot: [{ type: "future", secret }] } }
  const excessField = { ...record, script: { ...script, snapshot: [{ type: "literal", value: secret, unexpected: secret }] } }
  const firstWord = objectRecord(first)
  const secretLiteral = { ...firstWord, value: secret }
  const secretIndexData = { ...record, script: { ...script, snapshot: [secretLiteral], command: Number.MAX_SAFE_INTEGER + 1 } }
  const nulText = { ...record, script: { ...script, snapshot: [{ type: "literal", value: `${secret}\0` }] } }
  const validJson = encodeJson(record)
  const duplicateJson = validJson.replace("{", `{"secret":${JSON.stringify(secret)},"schema":1,`)
  return [
    { name: "unknown snapshot variant", json: encodeJson(invalidVariant) },
    { name: "nested excess snapshot field", json: encodeJson(excessField) },
    { name: "duplicate JSON field", json: duplicateJson },
    { name: "unsafe script index", json: encodeJson(secretIndexData) },
    { name: "NUL process text", json: encodeJson(nulText) }
  ]
}

function waitForFile(path: string) {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    for (let attempt = 0; attempt < 200; attempt++) {
      if (yield* fs.exists(path)) return
      yield* Effect.sleep("10 millis")
    }
    throw new Error("child fixture did not become ready")
  })
}

function probeUnixSocket(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(path)
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => {
      socket.destroy()
      resolve(false)
    })
  })
}

const runtimeTestLayer = NodeServices.layer

it.effect("executes packaged process instructions through Linux replacement with exact argv, cwd, captures and status", () => Effect.gen(function*() {
  if (process.platform !== "linux") return
  const files = renderPackage({
    command: process.execPath,
    cwd: "file",
    args: [
      { type: "literal", value: "" },
      { type: "literal", value: "apostrophe ' and quote \"\n雪λ" },
      { type: "literal", value: "${LITERAL} %PATH% & $(not-expanded)" }
    ],
    environment: [
      { name: "SOURCE", value: { type: "literal", value: "replacement" } },
      { name: "CAPTURED_SOURCE", value: { type: "environment", name: "SOURCE" } }
    ]
  })
  const package_ = yield* installPackage(files)
  const environment = runtimeEnvironment(files.data, "captured-before-replacement")
  const result = yield* Effect.promise(() => runStandalone(package_, files.dataPath, environment))
  expect(result.timedOut).toBe(false)
  expect(result.spawnError).toBeUndefined()
  expect(result.signal).toBeNull()
  expect(result.code, result.stderr).toBe(37)
  expect(result.stderr).toContain("fixture-stderr")
  if (result.pid === undefined) throw new Error("standalone process had no child handle pid")
  expect(result.pid).toBe(observationFrom(result.stdout).pid)
  expect(result.stdout).toContain("fixture-stdout")
  const captureBindingEntries: Array<readonly [string, boolean]> = []
  for (const capture of files.data.script.captures) {
    captureBindingEntries.push([capture.raw, false], [capture.check, false])
  }
  expect(observationFrom(result.stdout)).toEqual({
    pid: result.pid,
    argv: ["", "apostrophe ' and quote \"\n雪λ", "${LITERAL} %PATH% & $(not-expanded)"],
    cwd: join(package_.root, "work"),
    source: "replacement",
    capturedSource: "captured-before-replacement",
    captureBindings: Object.fromEntries(captureBindingEntries)
  })
}).pipe(Effect.provide(runtimeTestLayer)))

it.effect("resolves a packaged process cwd to the plugin root", () => Effect.gen(function*() {
  if (process.platform !== "linux") return
  const files = renderPackage({ command: process.execPath, cwd: "root", args: [], environment: [] })
  const package_ = yield* installPackage(files)
  const result = yield* Effect.promise(() => runStandalone(package_, files.dataPath, runtimeEnvironment(files.data)))
  expect(result.timedOut).toBe(false)
  expect(result.spawnError).toBeUndefined()
  expect(result.signal).toBeNull()
  expect(result.code, result.stderr).toBe(37)
  expect(observationFrom(result.stdout).cwd).toBe(package_.root)
}).pipe(Effect.provide(runtimeTestLayer)))

it.live.runIf(process.platform === "linux")("resolves exactly . from the launch cwd and refuses other relative roots", () => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const files = renderPackage({
    command: process.execPath, cwd: "file",
    args: [{ type: "file", path: "payload.txt" }], environment: []
  })
  const package_ = yield* installPackage(files)
  yield* fs.writeFileString(join(package_.root, "payload.txt"), "payload")
  const environment = runtimeEnvironment(files.data)
  const rejected = yield* Effect.promise(() => captureProcess(
    [package_.runtime, "./work", files.dataPath], environment, package_.root
  ))
  expect(rejected.timedOut).toBe(false)
  expect(rejected.code).toBe(1)
  expect(yield* fs.exists(package_.marker)).toBe(false)

  const result = yield* Effect.promise(() => captureProcess(
    [package_.runtime, ".", files.dataPath], environment, package_.root
  ))
  expect(result.timedOut).toBe(false)
  expect(result.spawnError).toBeUndefined()
  expect(result.signal).toBeNull()
  expect(result.code, result.stderr).toBe(37)
  expect(observationFrom(result.stdout).argv).toEqual([join(package_.root, "payload.txt")])
  expect(observationFrom(result.stdout).cwd).toBe(join(package_.root, "work"))
}).pipe(Effect.provide(runtimeTestLayer)))

it.effect("refuses a missing required capture before starting the packaged fixture", () => Effect.gen(function*() {
  if (process.platform !== "linux") return
  const files = renderPackage({
    command: process.execPath,
    cwd: "root",
    args: [],
    environment: [{ name: "CAPTURED_SOURCE", value: { type: "environment", name: "SOURCE" } }]
  })
  const package_ = yield* installPackage(files)
  const capture = files.data.script.captures[0]
  if (capture === undefined) throw new Error("process fixture did not compile its source capture")
  const secret = "missing-capture-secret"
  const environment = runtimeEnvironment(files.data)
  environment[capture.raw] = secret
  const result = yield* Effect.promise(() => runStandalone(package_, files.dataPath, environment))
  const fs = yield* FileSystem.FileSystem
  expect(result.timedOut).toBe(false)
  expect(result.spawnError).toBeUndefined()
  expect(result.code).not.toBe(0)
  expect(result.stderr).not.toContain(secret)
  expect(yield* fs.exists(package_.marker)).toBe(false)
}).pipe(Effect.provide(runtimeTestLayer)))

it.effect("rejects malformed packaged process data without echoing its contents", () => Effect.gen(function*() {
  if (process.platform !== "linux") return
  const files = renderPackage({ command: process.execPath, cwd: "root", args: [], environment: [] })
  const package_ = yield* installPackage(files)
  const fs = yield* FileSystem.FileSystem
  for (const current of malformedPayloads(files.data)) {
    yield* fs.writeFileString(join(package_.root, files.dataPath), current.json)
    const result = yield* Effect.promise(() => runStandalone(package_, files.dataPath, runtimeEnvironment(files.data)))
    expect(result.timedOut, current.name).toBe(false)
    expect(result.spawnError, current.name).toBeUndefined()
    expect(result.code, `${current.name}: ${result.stderr}`).not.toBe(0)
    expect(result.stderr, current.name).not.toContain("runtime-invalid-data-secret")
  }
}).pipe(Effect.provide(runtimeTestLayer)))

it.effect("rejects missing process data and fails when the packaged command cannot be started", () => Effect.gen(function*() {
  if (process.platform !== "linux") return
  const missingData = renderPackage({ command: process.execPath, cwd: "root", args: [], environment: [] })
  const missingPackage = yield* installPackage(missingData)
  const missingResult = yield* Effect.promise(() => runStandalone(missingPackage, ".psdk/mcp/missing.json", runtimeEnvironment(missingData.data)))
  expect(missingResult.timedOut).toBe(false)
  expect(missingResult.spawnError).toBeUndefined()
  expect(missingResult.code).not.toBe(0)
  expect(missingResult.stderr).toContain("Could not read process data")

  const unknown = renderPackage({ command: "pluginsdk-no-such-command", cwd: "root", args: [], environment: [] })
  const unknownPackage = yield* installPackage(unknown)
  const unknownResult = yield* Effect.promise(() => runStandalone(unknownPackage, unknown.dataPath, runtimeEnvironment(unknown.data)))
  expect(unknownResult.timedOut).toBe(false)
  expect(unknownResult.spawnError).toBeUndefined()
  expect(unknownResult.code).not.toBe(0)
  expect(yield* (yield* FileSystem.FileSystem).exists(unknownPackage.marker)).toBe(false)
}).pipe(Effect.provide(runtimeTestLayer)))

it.live("interrupts the held child owner and awaits its close", () => Effect.gen(function*() {
  if (process.platform !== "linux") return
  const fs = yield* FileSystem.FileSystem
  const temporaryParent = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-process-child-" })
  const socketPath = join(temporaryParent, "owned.sock")
  const startedPath = join(temporaryParent, "started")
  const source = [
    "const fs = require('node:fs')",
    "const net = require('node:net')",
    "const server = net.createServer()",
    `server.listen(${JSON.stringify(socketPath)}, () => fs.writeFileSync(${JSON.stringify(startedPath)}, "ready"))`,
    "const watchdog = setTimeout(() => process.exit(99), 15000)",
    "watchdog.unref()",
    "setInterval(() => {}, 1000)"
  ].join("\n")
  const invocation = decodeStrict(Invocation, {
    command: process.execPath,
    args: ["-e", source],
    environment: [],
    cwd: process.cwd()
  })
  const fiber = yield* runChild(invocation, { PATH: "/usr/bin:/bin" }).pipe(Effect.forkChild)
  yield* waitForFile(startedPath)
  expect(yield* Effect.promise(() => probeUnixSocket(socketPath))).toBe(true)
  yield* Fiber.interrupt(fiber)
  const exit = yield* Fiber.await(fiber)
  expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  expect(yield* Effect.promise(() => probeUnixSocket(socketPath))).toBe(false)
}).pipe(Effect.provide(runtimeTestLayer)))

it.effect("child owner preserves nonzero exit codes and maps an unknown executable to a typed failure", () => Effect.gen(function*() {
  if (process.platform !== "linux") return
  const normal = decodeStrict(Invocation, {
    command: process.execPath,
    args: ["-e", "process.exitCode = 37"],
    environment: [],
    cwd: process.cwd()
  })
  expect(yield* runChild(normal, { PATH: "/usr/bin:/bin" })).toBe(37)

  const unknown = decodeStrict(Invocation, {
    command: "/pluginsdk/no-such-child-command",
    args: [],
    environment: [],
    cwd: process.cwd()
  })
  const failure = yield* Effect.flip(runChild(unknown, { PATH: "/usr/bin:/bin" }))
  expect(failure).toBeInstanceOf(RuntimeFailure.ProcessRuntimeFailure)
  expect(failure.detail).toBe("Child process could not be started")
}))
