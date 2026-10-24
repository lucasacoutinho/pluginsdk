import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import { BuildRequest, BundleBody, BundleRejected, Compiler, type Bundle, type Format, type PackageFile } from "../contracts/Compiler.ts"
import { ProcessData } from "../contracts/PortableProcess.ts"
import { PackagePath } from "../contracts/Plugin.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { validateBundle } from "../src/compiler/package/native.ts"
import { bundleDigest } from "../src/internal/identity.ts"
import { jsonBytes, parseJsonBytes } from "../src/internal/json.ts"
import { bundleRoles } from "../src/installer/companions/capture.ts"

type Host = "claude_code" | "codex"
const formats: ReadonlyArray<{ readonly format: Format; readonly host: Host }> = [
  { format: "claude_code", host: "claude_code" },
  { format: "codex", host: "codex" }
]
const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)
const runtime = new Uint8Array(readFileSync(new URL("../runtime/process.mjs", import.meta.url)))
const literal = "literal '${UNEXPANDED}'; $(do-not-run) 雪\n"
const hookPath = ".psdk/hooks/0.json"
const sidecarPath = ".psdk/hooks/0.sh"

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function fileAt(bundle: Bundle, path: string): PackageFile {
  const file = bundle.files.find((file) => file.path === path)
  if (file === undefined) throw new Error(`Missing package file: ${path}`)
  return file
}

function dataAt(bundle: Bundle, path: string): ProcessData {
  return decode(ProcessData, parseJsonBytes(fileAt(bundle, path).content))
}

const prepare = Effect.fnUntraced(function*() {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-features-雪 " })
  const marker = join(root, "program-started")
  yield* fs.makeDirectory(join(root, "automation/work"), { recursive: true })
  const source = `import {readFileSync,writeFileSync} from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)},'started')\nconsole.log(JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd(),input:readFileSync(0,'utf8'),empty:process.env.EMPTY}))\nprocess.exitCode=7\n`
  yield* fs.writeFileString(join(root, "automation/job.mjs"), source)
  yield* fs.writeFileString(join(root, "automation/work/readme.txt"), "Captured working directory.\n")
  yield* fs.writeFileString(join(root, "auditor.md"), "Inspect the proposed release.\n")
  const program = { command: "node", args: [{ file: "automation/job.mjs" }], cwd: "automation/work" }
  const plugin = {
    id: "portable-features", version: "1.0.0", description: "Mixed process package", skills: [], assets: ["automation"],
    mcp: { shared: { type: "stdio", ...program }, remote: { url: "https://api.example.test/mcp", headers: {} } },
    hooks: {
      shared: { event: "SessionStart", ...program },
      prompt: { event: "UserPromptSubmit", ...program, args: [...program.args, literal, ""], env: { EMPTY: "" }, timeout: 7 }
    },
    agents: { auditor: { description: "Inspect releases.", prompt: "auditor.md", shell: "deny" } }
  }
  return { fs, root, marker, source, plugin, request: (format: Format, overrides: Readonly<Record<string, unknown>> = {}) =>
    decode(BuildRequest, { root, format, plugin: { ...plugin, ...overrides } }) }
})

function expectedHandler(host: Host, ordinal: number, timeout: number) {
  const path = `.psdk/hooks/${ordinal}.json`
  return Match.value(host).pipe(
    Match.when("claude_code", () => ({
      type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/.psdk/runtime/process.mjs", "${CLAUDE_PLUGIN_ROOT}", path], timeout, async: false
    })),
    Match.when("codex", () => ({
      type: "command", command: "node --input-type=commonjs -e \"const p=require('node:path'),u=require('node:url'),r=process.env.PLUGIN_ROOT,e=p.join(r,'.psdk/runtime/process.mjs');process.argv.splice(1,0,e,r);import(u.pathToFileURL(e).href)\" -- " + path,
      additionalContextLimit: 0, timeout, async: false
    })),
    Match.exhaustive
  )
}

const expectedHooks = (host: Host) => ({ hooks: {
  SessionStart: [{ hooks: [expectedHandler(host, 1, 30)] }],
  UserPromptSubmit: [{ hooks: [expectedHandler(host, 0, 7)] }]
} })

function repackage(bundle: Bundle, files: ReadonlyArray<PackageFile>): Bundle {
  const body = decode(Schema.toType(BundleBody), { schema: 1, plugin: bundle.plugin, format: bundle.format, files })
  return { ...body, digest: bundleDigest(body) }
}

function replaceFile(bundle: Bundle, path: string, update: (file: PackageFile) => PackageFile): Bundle {
  fileAt(bundle, path)
  return repackage(bundle, bundle.files.map((file) => file.path === path ? update(file) : file))
}

function replaceJson(bundle: Bundle, path: string, value: unknown): Bundle {
  return replaceFile(bundle, path, (file) => ({ ...file, content: jsonBytes(decode(Schema.Json, value)) }))
}

function expectInvalid(bundle: Bundle, name: string): void {
  try {
    validateBundle(bundle)
  } catch (cause) {
    if (!(cause instanceof BundleRejected)) throw cause
    expect(cause.issues.map((issue) => issue.type), name).toEqual(["invalid_native_package"])
    return
  }
  throw new Error(`Native package accepted ${name}`)
}

it.effect("builds deterministic mixed packages with one runtime and complete hook admission metadata", () => Effect.gen(function*() {
  const fixture = yield* prepare()
  const compiler = yield* Compiler
  for (const row of formats) {
    const bundle = yield* compiler.build(fixture.request(row.format))
    const repeated = yield* compiler.build(fixture.request(row.format, {
      mcp: Object.fromEntries(Object.entries(fixture.plugin.mcp).reverse()),
      hooks: Object.fromEntries(Object.entries(fixture.plugin.hooks).reverse())
    }))
    expect(repeated).toEqual(bundle)
    expect(yield* fixture.fs.exists(fixture.marker)).toBe(false)
    expect(bundle.files.filter((file) => file.path === ".psdk/runtime/process.mjs")).toHaveLength(1)
    expect(new Uint8Array(fileAt(bundle, ".psdk/runtime/process.mjs").content)).toEqual(runtime)
    expect(parseJsonBytes(fileAt(bundle, "hooks/hooks.json").content)).toEqual(expectedHooks(row.host))
    expect(new Uint8Array(fileAt(bundle, "automation/job.mjs").content)).toEqual(new TextEncoder().encode(fixture.source))
    const metadata = validateBundle(bundle)
    expect(metadata.processes.map(({ path }) => path)).toEqual([".psdk/mcp/0.json", hookPath, ".psdk/hooks/1.json"])
    expect(metadata.requirements).toEqual(["stdio", "hooks", "agents"])
    for (const { path, script } of metadata.processes) {
      const data = dataAt(bundle, path)
      expect(script).toEqual(data.script)
      expect(fileAt(bundle, path).executable).toBe(false)
      expect(fileAt(bundle, data.posix).executable).toBe(true)
    }
    expect(bundle.files.some((file) => file.path.startsWith("agents/"))).toBe(true)
    expect(bundleRoles(bundle)).toHaveLength(row.host === "codex" ? 1 : 0)
  }
}).pipe(Effect.provide(CompilerTest)))

it.effect("derives requirements from validated MCP and hook documents", () => Effect.gen(function*() {
  const fixture = yield* prepare()
  const compiler = yield* Compiler
  for (const row of formats) {
    for (const mcp of [{}, { remote: fixture.plugin.mcp.remote }, fixture.plugin.mcp]) {
      const options = { hooks: {}, agents: {}, mcp }
      const current = yield* compiler.build(fixture.request(row.format, options))
      expect(current.files.some((file) => file.path === "hooks/hooks.json")).toBe(false)
      expect(validateBundle(current).processes).toHaveLength("shared" in mcp ? 1 : 0)
      expect(validateBundle(current).requirements).toEqual("shared" in mcp ? ["stdio"] : [])
    }
    const onlyHooks = yield* compiler.build(fixture.request(row.format, { mcp: {}, agents: {} }))
    expect(onlyHooks.files.some((file) => file.path === ".mcp.json")).toBe(false)
    expect(validateBundle(onlyHooks).processes.map(({ path }) => path)).toEqual([hookPath, ".psdk/hooks/1.json"])
    expect(validateBundle(onlyHooks).requirements).toEqual(["hooks"])
  }
}).pipe(Effect.provide(CompilerTest)))

it.effect("reports both MCP and hook rendering failures without starting either program", () => Effect.gen(function*() {
  const fixture = yield* prepare()
  const compiler = yield* Compiler
  const env = { PATH: "one", Path: "two" }
  for (const row of formats) {
    const failure = yield* Effect.flip(compiler.build(fixture.request(row.format, {
      mcp: { shared: { ...fixture.plugin.mcp.shared, env } },
      hooks: { shared: { ...fixture.plugin.hooks.shared, env } }
    })))
    const issues = Match.value(failure).pipe(Match.tagsExhaustive({
      BuildRejected: ({ issues }) => issues,
      SourceUnavailable: (cause) => { throw cause }
    }))
    expect(issues).toEqual([
      { type: "invalid_process", server: "shared", reason: { type: "environment_collision", name: "path" } },
      { type: "invalid_hook_process", hook: "shared", reason: { type: "environment_collision", name: "path" } }
    ])
    expect(yield* fixture.fs.exists(fixture.marker)).toBe(false)
  }
}).pipe(Effect.provide(CompilerTest)))

it.effect("refuses hook environment references during build and in resealed process data", () => Effect.gen(function*() {
  const fixture = yield* prepare()
  const compiler = yield* Compiler
  const env = { API_TOKEN: { type: "environment", name: "TOKEN" } }
  const captured = yield* compiler.build(fixture.request("claude_code", {
    hooks: {}, agents: {}, mcp: { shared: { ...fixture.plugin.mcp.shared, env } }
  }))
  const capturedData = dataAt(captured, ".psdk/mcp/0.json")
  expect(capturedData.script.captures).toHaveLength(1)
  for (const row of formats) {
    const failure = yield* Effect.flip(compiler.build(fixture.request(row.format, {
      mcp: {}, hooks: { shared: { ...fixture.plugin.hooks.shared, env } }
    })))
    const issues = Match.value(failure).pipe(Match.tagsExhaustive({
      BuildRejected: ({ issues }) => issues,
      SourceUnavailable: (cause) => { throw cause }
    }))
    expect(issues).toEqual([{ type: "invalid_hook_process", hook: "shared", reason: { type: "environment_reference_unsupported", name: "TOKEN" } }])
    const bundle = yield* compiler.build(fixture.request(row.format))
    const injected = replaceJson(bundle, hookPath, { ...capturedData, posix: sidecarPath })
    expectInvalid(replaceFile(injected, sidecarPath, (file) => ({
      ...file, content: fileAt(captured, ".psdk/mcp/0.sh").content
    })), `${row.host} captured hook`)
  }
}).pipe(Effect.provide(CompilerTest)))

it.effect("rejects resealed hook document and binding changes for both hosts", () => Effect.gen(function*() {
  const fixture = yield* prepare()
  const compiler = yield* Compiler
  for (const row of formats) {
    const bundle = yield* compiler.build(fixture.request(row.format))
    const handler = expectedHandler(row.host, 1, 30)
    const malformed: ReadonlyArray<unknown> = [
      { ...handler, command: "node injected" }, { ...handler, args: [] },
      { ...handler, timeout: 0 }, { ...handler, timeout: 601 }, { ...handler, timeout: 1.5 },
      { ...handler, async: true }, { ...handler, unexpected: true },
      { ...handler, additionalContextLimit: 1 },
      expectedHandler(row.host, 0, 30), expectedHandler(row.host, 2, 30),
      expectedHandler(row.host, Number.MAX_SAFE_INTEGER + 1, 30)
    ]
    for (const [index, invalid] of malformed.entries()) {
      expectInvalid(replaceJson(bundle, "hooks/hooks.json", { hooks: {
        SessionStart: [{ hooks: [invalid] }], UserPromptSubmit: [{ hooks: [expectedHandler(row.host, 0, 7)] }]
      } }), `${row.host} handler ${index}`)
    }
    for (const value of [{ hooks: {} }, { hooks: { SessionStart: [] } }, { hooks: { Setup: [{ hooks: [handler] }] } }]) {
      expectInvalid(replaceJson(bundle, "hooks/hooks.json", value), `${row.host} event document`)
    }
  }
}).pipe(Effect.provide(CompilerTest)))

it.effect("rejects resealed process changes and admits only referenced descriptors as processes", () => Effect.gen(function*() {
  const fixture = yield* prepare()
  const compiler = yield* Compiler
  for (const row of formats) {
    const bundle = yield* compiler.build(fixture.request(row.format))
    const data = dataAt(bundle, hookPath)
    const changed: ReadonlyArray<readonly [string, Bundle]> = [
      ["sidecar reference", replaceJson(bundle, hookPath, { ...data, posix: ".psdk/hooks/9.sh" })],
      ["instruction bounds", replaceJson(bundle, hookPath, { ...data, script: { ...data.script, command: 999 } })],
      ["noncanonical instructions", replaceJson(bundle, hookPath, { ...data, script: { ...data.script, snapshot: [...data.script.snapshot, { type: "literal", value: "unused" }] } })],
      ["descriptor fields", replaceJson(bundle, hookPath, { ...data, extra: true })],
      ["sidecar bytes", replaceFile(bundle, sidecarPath, (file) => ({ ...file, content: new TextEncoder().encode("exit 0\n") }))],
      ["descriptor executable", replaceFile(bundle, hookPath, (file) => ({ ...file, executable: true }))],
      ["sidecar mode", replaceFile(bundle, sidecarPath, (file) => ({ ...file, executable: false }))],
      ["runtime mode", replaceFile(bundle, ".psdk/runtime/process.mjs", (file) => ({ ...file, executable: true }))],
      ["runtime empty", replaceFile(bundle, ".psdk/runtime/process.mjs", (file) => ({ ...file, content: new Uint8Array() }))],
      ...[hookPath, sidecarPath, ".psdk/runtime/process.mjs"].map((path): readonly [string, Bundle] => [
        `missing ${path}`, repackage(bundle, bundle.files.filter((file) => file.path !== path))
      ])
    ]
    for (const [name, invalid] of changed) expectInvalid(invalid, `${row.host} ${name}`)
    const asset = { ...fileAt(bundle, hookPath), path: PackagePath.make(".psdk/hooks/9.json"), content: new TextEncoder().encode("ordinary asset data") }
    const withAsset = repackage(bundle, [...bundle.files, asset].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    expect(validateBundle(withAsset).processes).toEqual(validateBundle(bundle).processes)
  }
}).pipe(Effect.provide(CompilerTest)))

it.live.runIf(process.platform === "linux")("runs compiled hook descriptors with exact stdin, literal argv, cwd and exit status", () => Effect.gen(function*() {
  const fixture = yield* prepare()
  const compiler = yield* Compiler
  for (const row of formats) {
    const bundle = yield* compiler.build(fixture.request(row.format))
    const root = join(fixture.root, row.host + " package 雪")
    for (const file of bundle.files) {
      const path = join(root, file.path)
      yield* fixture.fs.makeDirectory(dirname(path), { recursive: true })
      yield* fixture.fs.writeFile(path, file.content)
      yield* fixture.fs.chmod(path, file.executable ? 0o755 : 0o644)
    }
    const input = '{"prompt":"quoted 雪"}\n'
    const result = yield* Effect.sync(() => spawnSync(process.execPath, [join(root, ".psdk/runtime/process.mjs"), root, hookPath], {
      cwd: fixture.root, env: { PATH: dirname(process.execPath) + ":/usr/bin:/bin" }, input, encoding: "utf8", timeout: 10_000
    }))
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(7)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout)).toEqual({ argv: [literal, ""], cwd: join(root, "automation/work"), input, empty: "" })
  }
}).pipe(Effect.provide(CompilerTest)))
