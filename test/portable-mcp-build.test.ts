import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import {
  BuildRequest,
  Bundle,
  BundleBody,
  Compiler,
  type BuildIssue,
  type Format as CompilerFormat,
  type PackageFile
} from "../contracts/Compiler.ts"
import { ProcessData as PortableProcessData, type ProcessData as PortableProcessDataType } from "../contracts/PortableMcp.ts"
import { EnvironmentName, McpName, ProcessText } from "../contracts/Plugin.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { validateBundle } from "../src/compiler/package/native.ts"
import { bundleDigest } from "../src/internal/identity.ts"
import { jsonBytes, parseJsonBytes } from "../src/internal/json.ts"
import { serializeLauncher } from "../src/compiler/process/posix.ts"

type Host = "claude_code" | "codex"
type FormatCase = { readonly format: CompilerFormat; readonly host: Host }
type RequestOptions = {
  readonly assets?: ReadonlyArray<string>
  readonly hooks?: unknown
  readonly agents?: unknown
}
type CapturedProcess = {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly spawnError: Error | undefined
  readonly timedOut: boolean
}

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)
const formats: ReadonlyArray<FormatCase> = [
  { format: "claude_code", host: "claude_code" },
  { format: "codex", host: "codex" }
]
const runtimeAsset = new Uint8Array(readFileSync(fileURLToPath(new URL("../runtime/process.mjs", import.meta.url))))
const literalArgument = "literal $" + "{UNEXPANDED}; $(touch SHOULD_NOT_EXIST) '雪\n"
const serverSource = [
  "import { readFileSync } from 'node:fs'",
  "const names = ['EMPTY', 'TEXT', 'EXIT_CODE', 'ORIGINAL', 'SNAPSHOT']",
  "const env = Object.fromEntries(names.filter((name) => Object.hasOwn(process.env, name)).map((name) => [name, process.env[name]]))",
  "console.log(JSON.stringify({node: process.version, script: process.argv[1], argv: process.argv.slice(2), cwd: process.cwd(), env, file: readFileSync(process.argv[2] ?? '', 'utf8')}))",
  "process.exitCode = Number(process.env.EXIT_CODE ?? '0')"
].join("\n")
const Observation = Schema.Struct({
  node: Schema.String,
  script: Schema.String,
  argv: Schema.Array(Schema.String),
  cwd: Schema.String,
  env: Schema.Record(Schema.String, Schema.String),
  file: Schema.String
})
const ClaudeLocal = Schema.Struct({
  type: Schema.Literal("stdio"),
  command: ProcessText,
  args: Schema.Array(ProcessText),
  env: Schema.Record(EnvironmentName, ProcessText),
  cwd: Schema.optionalKey(ProcessText)
})
const ClaudeDocument = Schema.Struct({ mcpServers: Schema.Record(McpName, ClaudeLocal) })

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function request(
  root: string,
  format: CompilerFormat,
  mcp: unknown,
  options: RequestOptions = {}
): BuildRequest {
  return decodeStrict(BuildRequest, {
    root,
    format,
    plugin: {
      id: "portable-build-fixture",
      version: "1.0.0",
      description: "Compiled portable MCP fixture",
      skills: [],
      assets: options.assets ?? [],
      mcp,
      ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
      ...(options.agents === undefined ? {} : { agents: options.agents })
    }
  })
}

const issues = (input: BuildRequest) => Compiler.use((compiler) => Effect.flip(compiler.build(input))).pipe(
  Effect.map((error): ReadonlyArray<BuildIssue> => Match.value(error).pipe(Match.tagsExhaustive({
    BuildRejected: (rejected) => rejected.issues,
    SourceUnavailable: (unavailable) => { throw unavailable }
  })))
)

function fileAt(bundle: Bundle, path: string): PackageFile {
  const file = bundle.files.find((candidate) => candidate.path === path)
  if (file === undefined) throw new Error("Missing package file " + path)
  return file
}

function processData(bundle: Bundle, path: string): PortableProcessDataType {
  const file = fileAt(bundle, path)
  const data = decodeStrict(PortableProcessData, parseJsonBytes(file.content))
  expect(file.content).toEqual(jsonBytes(Schema.encodeSync(PortableProcessData)(data)))
  return data
}

const prepare = Effect.fnUntraced(function*() {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-portable-build-" })
  yield* fs.makeDirectory(join(root, "mcp/work"), { recursive: true })
  yield* fs.writeFileString(join(root, "mcp/server.mjs"), serverSource)
  yield* fs.writeFileString(join(root, "mcp/payload.txt"), "packaged file payload\n")
  yield* fs.writeFileString(join(root, "mcp/work/.keep"), "working directory fixture\n")
  return { fs, root }
})

function processServer(options: {
  readonly env?: unknown
  readonly command?: unknown
  readonly args?: ReadonlyArray<string | { readonly file: string }>
  readonly cwd?: string
}) {
  return {
    type: "stdio",
    command: options.command ?? "node",
    args: options.args ?? [{ file: "mcp/server.mjs" }, { file: "mcp/payload.txt" }, "", literalArgument],
    ...(options.cwd === undefined ? { cwd: "mcp/work" } : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: options.env })
  }
}

function localMcp(options: Parameters<typeof processServer>[0] = {}) {
  return { fixture: processServer(options) }
}

function remoteMcp() {
  return { url: "https://example.test/mcp", headers: { "X-Fixture": "literal header" } }
}

const writeBundle = Effect.fnUntraced(function*(fs: FileSystem.FileSystem, root: string, bundle: Bundle) {
  for (const file of bundle.files) {
    const path = join(root, file.path)
    yield* fs.makeDirectory(dirname(path), { recursive: true })
    yield* fs.writeFile(path, file.content)
    yield* fs.chmod(path, file.executable ? 0o755 : 0o644)
  }
})

function runChildProcess(arguments_: ReadonlyArray<string>, environment: NodeJS.ProcessEnv): Promise<CapturedProcess> {
  const child = spawn(process.execPath, [...arguments_], {
    cwd: process.cwd(),
    env: environment,
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stdout = ""
  let stderr = ""
  let spawnError: Error | undefined
  let timedOut = false
  child.stdout?.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
  const completion = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((resolve) => {
    child.once("error", (error) => { spawnError = error })
    child.once("close", (code, signal) => { resolve({ code, signal }) })
  })
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill("SIGKILL")
  }, 10_000)
  return completion.finally(() => clearTimeout(timeout)).then(({ code, signal }) => ({
    code, signal, stdout, stderr, spawnError, timedOut
  }))
}

function runtimeEnvironment(values: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  return { PATH: dirname(process.execPath) + ":/usr/bin:/bin", ...values }
}

function observation(stdout: string): typeof Observation.Type {
  return decodeStrict(Observation, JSON.parse(stdout))
}

function repackage(bundle: Bundle, files: ReadonlyArray<PackageFile>): Bundle {
  const body = decodeStrict(Schema.toType(BundleBody), {
    schema: bundle.schema,
    plugin: bundle.plugin,
    format: bundle.format,
    files
  })
  return decodeStrict(Schema.toType(Bundle), { ...body, digest: bundleDigest(body) })
}

function claudeDocument(bundle: Bundle): typeof ClaudeDocument.Type {
  return decodeStrict(ClaudeDocument, parseJsonBytes(fileAt(bundle, ".mcp.json").content))
}

function updateClaudeDocument(
  bundle: Bundle,
  update: (document: typeof ClaudeDocument.Type) => typeof ClaudeDocument.Type
): Bundle {
  const document = update(claudeDocument(bundle))
  const content = jsonBytes(Schema.encodeSync(ClaudeDocument)(document))
  const files = bundle.files.map((file) => file.path === ".mcp.json" ? { ...file, content } : file)
  return repackage(bundle, files)
}

function objectRecord(value: unknown): Record<string, unknown> {
  return decodeStrict(Schema.Record(Schema.String, Schema.Unknown), value)
}

function updateProcessData(
  bundle: Bundle,
  update: (data: Record<string, unknown>) => unknown
): Bundle {
  const data = processData(bundle, ".psdk/mcp/0.json")
  const wire = Schema.encodeSync(PortableProcessData)(data)
  const content = jsonBytes(decodeStrict(Schema.Json, update(objectRecord(wire))))
  const files = bundle.files.map((file) => file.path === ".psdk/mcp/0.json" ? { ...file, content } : file)
  return repackage(bundle, files)
}

function updateNativeCaptures(bundle: Bundle): Bundle {
  const data = processData(bundle, ".psdk/mcp/0.json")
  const env = Object.fromEntries(data.script.captures.flatMap(({ source, raw, check }) => [
    [raw, ProcessText.make("$" + "{" + source + "}")],
    [check, ProcessText.make("$" + "{" + source + ":-PSDK_ABSENT}")]
  ]))
  return updateClaudeDocument(bundle, (document) => {
    const server = document.mcpServers.fixture
    if (server === undefined) throw new Error("Claude capture process fixture is missing")
    return { ...document, mcpServers: { ...document.mcpServers, fixture: { ...server, env } } }
  })
}

function updateSidecar(bundle: Bundle): Bundle {
  const data = processData(bundle, ".psdk/mcp/0.json")
  const content = new TextEncoder().encode(serializeLauncher(data.script))
  return repackage(bundle, bundle.files.map((file) => file.path === ".psdk/mcp/0.sh" ? { ...file, content } : file))
}

function capturedEnvironment(data: PortableProcessDataType): NodeJS.ProcessEnv {
  const values: Record<string, string> = { ORIGINAL: "before", SOURCE: "from-source" }
  const environment: NodeJS.ProcessEnv = runtimeEnvironment(values)
  for (const capture of data.script.captures) {
    const value = values[capture.source]
    if (value === undefined) throw new Error("Missing source fixture value " + capture.source)
    environment[capture.raw] = value
    environment[capture.check] = value
  }
  return environment
}

it.effect("builds deterministic host packages with canonical local ordinals and runtime plans", () => Effect.gen(function*() {
  const { root } = yield* prepare()
  const compiler = yield* Compiler
  for (const format of formats) {
    const mcp = {
      zulu: processServer({ args: [{ file: "mcp/server.mjs" }, "zulu"] }),
      remote: remoteMcp(),
      alpha: processServer({ args: [{ file: "mcp/server.mjs" }, "alpha"] })
    }
    const reordered = {
      alpha: mcp.alpha,
      remote: mcp.remote,
      zulu: mcp.zulu
    }
    const first = yield* compiler.build(request(root, format.format, mcp, { assets: ["mcp"] }))
    const second = yield* compiler.build(request(root, format.format, reordered, { assets: ["mcp"] }))
    expect(second.digest).toBe(first.digest)
    expect(second.files).toEqual(first.files)
    expect(first.files.map(({ path }) => path)).toEqual([...first.files.map(({ path }) => path)].sort())

    const runtime = fileAt(first, ".psdk/runtime/process.mjs")
    expect(new Uint8Array(runtime.content)).toEqual(runtimeAsset)
    expect(runtime.executable).toBe(false)
    const document = decodeStrict(
      Schema.Struct({ mcpServers: Schema.Record(McpName, Schema.Unknown) }),
      parseJsonBytes(fileAt(first, ".mcp.json").content)
    )
    for (const [ordinal, name] of ["alpha", "zulu"].entries()) {
      const dataFile = fileAt(first, ".psdk/mcp/" + ordinal + ".json")
      const sidecar = fileAt(first, ".psdk/mcp/" + ordinal + ".sh")
      const data = processData(first, dataFile.path)
      expect(data.posix).toBe(".psdk/mcp/" + ordinal + ".sh")
      expect(dataFile.executable).toBe(false)
      expect(sidecar.executable).toBe(true)
      expect(new TextDecoder().decode(sidecar.content)).toContain(name)
      const server = objectRecord(document.mcpServers[name])
      const expected = Match.value(format.host).pipe(
        Match.when("claude_code", () => ({
          type: "stdio",
          command: "node",
          args: ["$" + "{CLAUDE_PLUGIN_ROOT}/.psdk/runtime/process.mjs", "$" + "{CLAUDE_PLUGIN_ROOT}", ".psdk/mcp/" + ordinal + ".json"],
          env: {}
        })),
        Match.when("codex", () => ({
          command: "node",
          args: [".psdk/runtime/process.mjs", ".", ".psdk/mcp/" + ordinal + ".json"],
          cwd: ".",
          env: {}
        })),
        Match.exhaustive
      )
      expect(server).toEqual(expected)
    }
    const remote = objectRecord(document.mcpServers.remote)
    const expectedRemote = Match.value(format.host).pipe(
      Match.when("claude_code", () => ({
        type: "http", url: "https://example.test/mcp", headers: { "X-Fixture": "literal header" }
      })),
      Match.when("codex", () => ({
        url: "https://example.test/mcp", http_headers: { "X-Fixture": "literal header" }
      })),
      Match.exhaustive
    )
    expect(remote).toEqual(expectedRemote)
  }
}).pipe(Effect.provide(CompilerTest)))

it.effect("omits runtime files for remote-only and empty MCP packages", () => Effect.gen(function*() {
  const { root } = yield* prepare()
  const compiler = yield* Compiler
  for (const format of formats) {
    const empty = yield* compiler.build(request(root, format.format, {}))
    expect(empty.files.some(({ path }) => path === ".psdk/runtime/process.mjs")).toBe(false)
    const remote = { remote: remoteMcp() }
    const remoteOnly = yield* compiler.build(request(root, format.format, remote))
    expect(remoteOnly.files.some(({ path }) => path.startsWith(".psdk/"))).toBe(false)
  }
}).pipe(Effect.provide(CompilerTest)))

it.live.runIf(process.platform === "linux")("runs each compiled package with literal argv, cwd, env and exit status", () => Effect.gen(function*() {
  const { fs, root } = yield* prepare()
  const compiler = yield* Compiler
  const env = { EMPTY: "", TEXT: "literal $" + "{UNEXPANDED}; $(touch NOT_CREATED) '雪\n", EXIT_CODE: "7" }
  for (const format of formats) {
    const bundle = yield* compiler.build(request(root, format.format, localMcp({ env }), { assets: ["mcp"] }))
    const packageRoot = join(root, "Package Root '" + format.host + "-雪")
    yield* writeBundle(fs, packageRoot, bundle)
    const result = yield* Effect.promise(() => runChildProcess([
      join(packageRoot, ".psdk/runtime/process.mjs"), packageRoot, ".psdk/mcp/0.json"
    ], runtimeEnvironment()))
    expect(result.timedOut).toBe(false)
    expect(result.spawnError).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.code).toBe(7)
    expect(result.stderr).toBe("")
    expect(observation(result.stdout)).toEqual({
      node: process.version,
      script: join(packageRoot, "mcp/server.mjs"),
      argv: [join(packageRoot, "mcp/payload.txt"), "", literalArgument],
      cwd: join(packageRoot, "mcp/work"),
      env,
      file: "packaged file payload\n"
    })
    expect(yield* fs.exists(join(packageRoot, "mcp/work/SHOULD_NOT_EXIST"))).toBe(false)
  }
}).pipe(Effect.provide(CompilerTest)))

it.live.runIf(process.platform === "linux")("captures Claude environment before replacements and refuses a missing capture", () => Effect.gen(function*() {
  const { fs, root } = yield* prepare()
  const compiler = yield* Compiler
  const mcp = localMcp({
    args: [{ file: "mcp/server.mjs" }, { file: "mcp/payload.txt" }],
    env: {
      ORIGINAL: { type: "environment", name: "SOURCE" },
      SNAPSHOT: { type: "environment", name: "ORIGINAL" }
    }
  })
  const bundle = yield* compiler.build(request(root, "claude_code", mcp, { assets: ["mcp"] }))
  const data = processData(bundle, ".psdk/mcp/0.json")
  const packageRoot = join(root, "capture-package")
  yield* writeBundle(fs, packageRoot, bundle)
  const result = yield* Effect.promise(() => runChildProcess([
    join(packageRoot, ".psdk/runtime/process.mjs"), packageRoot, ".psdk/mcp/0.json"
  ], capturedEnvironment(data)))
  expect(result.code, result.stderr).toBe(0)
  expect(observation(result.stdout).env).toEqual({ ORIGINAL: "from-source", SNAPSHOT: "before" })

  const missing = yield* Effect.promise(() => runChildProcess([
    join(packageRoot, ".psdk/runtime/process.mjs"), packageRoot, ".psdk/mcp/0.json"
  ], runtimeEnvironment()))
  expect(missing.code).toBe(1)
  expect(missing.stderr).toContain("Missing environment source")
}).pipe(Effect.provide(CompilerTest)))

it.effect("rejects unsupported Codex references, environment collisions and generated asset paths", () => Effect.gen(function*() {
  const { fs, root } = yield* prepare()
  expect(yield* issues(request(root, "codex", localMcp({
    args: [{ file: "mcp/server.mjs" }], env: { TOKEN: { type: "environment", name: "SOURCE" } }
  }), { assets: ["mcp"] }))).toContainEqual({
    type: "invalid_process", server: "fixture", reason: { type: "environment_reference_unsupported", name: "SOURCE" }
  })
  expect(yield* issues(request(root, "codex", localMcp({
    args: [{ file: "mcp/server.mjs" }], env: { PATH: "one", Path: "two" }
  }), { assets: ["mcp"] }))).toContainEqual({
    type: "invalid_process", server: "fixture", reason: { type: "environment_collision", name: "path" }
  })
  yield* fs.makeDirectory(join(root, ".psdk/runtime"), { recursive: true })
  yield* fs.writeFileString(join(root, ".psdk/runtime/process.mjs"), "source asset")
  expect(yield* issues(request(root, "claude_code", localMcp({ args: [{ file: "mcp/server.mjs" }] }), {
    assets: ["mcp", ".psdk/runtime/process.mjs"]
  }))).toContainEqual({ type: "path_collision", path: ".psdk/runtime/process.mjs" })
}).pipe(Effect.provide(CompilerTest)))

it.effect("detects changed runtime, data and sidecar bytes before semantic validation", () => Effect.gen(function*() {
  const { root } = yield* prepare()
  const bundle = yield* Compiler.use((compiler) => compiler.build(request(
    root, "claude_code", localMcp({ args: [{ file: "mcp/server.mjs" }] }), { assets: ["mcp"] }
  )))
  for (const path of [".psdk/runtime/process.mjs", ".psdk/mcp/0.json", ".psdk/mcp/0.sh"]) {
    const mutate = (file: PackageFile) => file.path === path
      ? { ...file, content: new Uint8Array([...file.content, 0x20]) }
      : file
    const [head, ...tail] = bundle.files
    const files: [PackageFile, ...PackageFile[]] = [mutate(head), ...tail.map(mutate)]
    expect(() => validateBundle({ ...bundle, files })).toThrow()
  }
}).pipe(Effect.provide(CompilerTest)))

it.effect("rejects recomputed bundles with noncanonical portable declarations or package plans", () => Effect.gen(function*() {
  const { root } = yield* prepare()
  const compiler = yield* Compiler
  const bundle = yield* compiler.build(request(root, "claude_code", localMcp({
    args: [{ file: "mcp/server.mjs" }], env: { OUTPUT: { type: "environment", name: "SOURCE" } }
  }), { assets: ["mcp"] }))
  const document = claudeDocument(bundle)
  const server = document.mcpServers.fixture
  if (server === undefined) throw new Error("Claude local process fixture is missing")
  const data = processData(bundle, ".psdk/mcp/0.json")
  const capture = data.script.captures[0]
  if (capture === undefined) throw new Error("Claude capture fixture is missing")

  const changedArgs = updateClaudeDocument(bundle, (current) => ({
    ...current,
    mcpServers: { ...current.mcpServers, fixture: { ...server, args: [...server.args, ProcessText.make("extra")] } }
  }))
  expect(() => validateBundle(changedArgs)).toThrow()
  const changedCapture = updateClaudeDocument(bundle, (current) => ({
    ...current,
    mcpServers: { ...current.mcpServers, fixture: {
      ...server, env: { ...server.env, [capture.raw]: ProcessText.make("wrong source") }
    } }
  }))
  expect(() => validateBundle(changedCapture)).toThrow()

  for (const path of [".psdk/runtime/process.mjs", ".psdk/mcp/0.json", ".psdk/mcp/0.sh"]) {
    expect(() => validateBundle(repackage(bundle, bundle.files.filter((file) => file.path !== path)))).toThrow()
    const changedMode = bundle.files.map((file) => file.path === path ? { ...file, executable: !file.executable } : file)
    expect(() => validateBundle(repackage(bundle, changedMode))).toThrow()
  }

  const wrongSidecar = bundle.files.map((file) => file.path === ".psdk/mcp/0.sh"
    ? { ...file, content: new TextEncoder().encode("#!/bin/sh\nexit 0\n") }
    : file)
  expect(() => validateBundle(repackage(bundle, wrongSidecar))).toThrow()
  expect(() => validateBundle(updateProcessData(bundle, (wire) => ({ ...wire, posix: ".psdk/mcp/9.sh" })))).toThrow()

  const invalidIndex = updateProcessData(bundle, (wire) => {
    const script = objectRecord(wire.script)
    return { ...wire, script: { ...script, command: Number.MAX_SAFE_INTEGER + 1 } }
  })
  expect(() => validateBundle(invalidIndex)).toThrow()
  const nulText = updateProcessData(bundle, (wire) => {
    const script = objectRecord(wire.script)
    const snapshot = decodeStrict(Schema.Array(Schema.Unknown), script.snapshot)
    return { ...wire, script: { ...script, snapshot: [{ type: "literal", value: "invalid\0text" }, ...snapshot.slice(1)] } }
  })
  expect(() => validateBundle(nulText)).toThrow()

  const aliasedCapture = updateProcessData(bundle, (wire) => {
    const script = objectRecord(wire.script)
    const captures = decodeStrict(Schema.Array(Schema.Unknown), script.captures)
    const first = captures[0]
    if (first === undefined) throw new Error("Capture alias fixture has no capture")
    const capture = objectRecord(first)
    const aliased = { ...capture, check: capture.raw }
    const snapshot = decodeStrict(Schema.Array(Schema.Unknown), script.snapshot).map((word) => {
      const entry = objectRecord(word)
      return entry.type === "captured" ? { ...entry, capture: aliased } : word
    })
    return { ...wire, script: { ...script, captures: [aliased, ...captures.slice(1)], snapshot } }
  })
  expect(() => validateBundle(updateSidecar(updateNativeCaptures(aliasedCapture)))).toThrow()

  const mismatchedSnapshot = updateProcessData(bundle, (wire) => {
    const script = objectRecord(wire.script)
    const captures = decodeStrict(Schema.Array(Schema.Unknown), script.captures)
    const first = captures[0]
    if (first === undefined) throw new Error("Snapshot capture fixture has no capture")
    const capture = objectRecord(first)
    const snapshot = decodeStrict(Schema.Array(Schema.Unknown), script.snapshot).map((word) => {
      const entry = objectRecord(word)
      if (entry.type !== "captured") return word
      const reference = objectRecord(entry.capture)
      return { ...entry, capture: { ...reference, raw: capture.check } }
    })
    return { ...wire, script: { ...script, snapshot } }
  })
  expect(() => validateBundle(updateSidecar(mismatchedSnapshot))).toThrow()
}).pipe(Effect.provide(CompilerTest)))
