import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import { BuildRequest, BundleBody, Compiler, type BuildIssue, type Bundle, type Format, type PackageFile } from "../contracts/Compiler.ts"
import { PackagePath } from "../contracts/Plugin.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { validateBundle } from "../src/compiler/package/native.ts"
import { bundleDigest } from "../src/internal/identity.ts"
import { jsonBytes, parseJsonBytes } from "../src/internal/json.ts"

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)
const formats: ReadonlyArray<Format> = ["claude_code", "codex"]
const source = "import { writeFileSync } from 'node:fs'\n" +
  "if (process.env.STARTED) writeFileSync(process.env.STARTED, 'started')\n" +
  "console.log(JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd(),env:Object.fromEntries(['OPTIND','EMPTY','TEXT','FROM_SOURCE'].filter(k=>Object.hasOwn(process.env,k)).map(k=>[k,process.env[k]]))}))\n"

const request = (root: string, format: Format, mcp: unknown, assets: ReadonlyArray<string> = ["mcp"]) =>
  Schema.decodeUnknownSync(BuildRequest)({
    root, format,
    plugin: { id: "process-demo", version: "1.0.0", description: "Existing application MCP", skills: [], assets, mcp }
  })

const fileAt = (bundle: Bundle, path: string): PackageFile => {
  const file = bundle.files.find((candidate) => candidate.path === path)
  if (file === undefined) throw new Error(`Missing bundle file ${path}`)
  return file
}

const repackage = (bundle: Bundle, files: ReadonlyArray<PackageFile>): Bundle => {
  const body = Schema.decodeUnknownSync(Schema.toType(BundleBody))({ schema: bundle.schema, plugin: bundle.plugin, format: bundle.format, files })
  return { ...body, digest: bundleDigest(body) }
}

const issues = (input: BuildRequest) => Compiler.use((compiler) => Effect.flip(compiler.build(input))).pipe(
  Effect.map((error): ReadonlyArray<BuildIssue> => Match.value(error).pipe(Match.tagsExhaustive({
    BuildRejected: (error) => error.issues,
    SourceUnavailable: (error) => { throw error }
  })))
)

const prepare = Effect.fnUntraced(function*() {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-process-" })
  yield* fs.makeDirectory(join(root, "mcp/work"), { recursive: true })
  yield* fs.writeFileString(join(root, "mcp/server.mjs"), source)
  yield* fs.writeFileString(join(root, "mcp/work/data.txt"), "captured directory")
  return { fs, root }
})

it.effect("builds one process declaration for both clients without starting the server", () => Effect.gen(function*() {
  const { fs, root } = yield* prepare()
  const compiler = yield* Compiler
  const started = join(root, "started.txt")
  const args = ["", "apostrophe ' \n雪", "${LITERAL}"]
  const env = { OPTIND: "chosen-value", EMPTY: "", TEXT: "literal ${LITERAL}\n'雪", STARTED: started }
  const mcp = {
    remote: { url: "https://app.example/mcp", headers: { "X-App": "shared" } },
    app: { type: "stdio", command: "node", args: [{ file: "mcp/server.mjs" }, ...args], cwd: "mcp/work", env }
  }
  let sharedLauncher: Uint8Array | undefined
  for (const format of formats) {
    const bundle = yield* compiler.build(request(root, format, mcp))
    expect(yield* fs.exists(started)).toBe(false)
    const launcher = fileAt(bundle, ".psdk/mcp/0.sh")
    expect(launcher.executable).toBe(true)
    if (sharedLauncher !== undefined) expect(launcher.content).toEqual(sharedLauncher)
    sharedLauncher = launcher.content
    const codex = format === "codex"
    const variable = codex ? "${PLUGIN_ROOT}" : "${CLAUDE_PLUGIN_ROOT}"
    const local = {
      type: "stdio", command: "node",
      args: [variable + "/.psdk/runtime/process.mjs", variable, ".psdk/mcp/0.json"], env: {}
    }
    expect(parseJsonBytes(fileAt(bundle, ".mcp.json").content)).toEqual({
      mcpServers: {
        app: codex ? { command: "node", args: [".psdk/runtime/process.mjs", ".", ".psdk/mcp/0.json"], env: {}, cwd: "." } : local,
        remote: codex
          ? { url: "https://app.example/mcp", http_headers: { "X-App": "shared" } }
          : { type: "http", url: "https://app.example/mcp", headers: { "X-App": "shared" } }
      }
    })
    const packageRoot = join(root, codex ? "codex-package" : "claude-package")
    for (const file of bundle.files) {
      const path = join(packageRoot, file.path)
      yield* fs.makeDirectory(dirname(path), { recursive: true })
      yield* fs.writeFile(path, file.content)
      yield* fs.chmod(path, file.executable ? 0o755 : 0o644)
    }
    const child = spawnSync(join(packageRoot, launcher.path), [packageRoot], {
      encoding: "utf8", timeout: 5_000,
      env: { PATH: dirname(process.execPath) + ":/usr/bin:/bin", LITERAL: "must not expand" }
    })
    if (child.error !== undefined) throw child.error
    expect(child.status, child.stderr).toBe(0)
    expect(JSON.parse(child.stdout)).toEqual({ argv: args, cwd: join(packageRoot, "mcp/work"), env: { OPTIND: env.OPTIND, EMPTY: env.EMPTY, TEXT: env.TEXT } })
    expect(yield* fs.readFileString(started)).toBe("started")
    yield* fs.remove(started)
  }
}).pipe(Effect.provide(CompilerTest)))

it.effect("resolves executable references at the captured skill's final package path", () => Effect.gen(function*() {
  const { fs, root } = yield* prepare()
  yield* fs.makeDirectory(join(root, "custom/review/bin"), { recursive: true })
  yield* fs.writeFileString(join(root, "custom/review/SKILL.md"), "---\nname: review\ndescription: Review changes.\n---\nUse the packaged tool.\n")
  yield* fs.writeFileString(join(root, "custom/review/bin/run.sh"), "#!/bin/sh\nprintf '%s' packaged\n")
  yield* fs.chmod(join(root, "custom/review/bin/run.sh"), 0o755)
  const base = request(root, "claude_code", { app: { type: "stdio", command: { file: "skills/review/bin/run.sh" } } }, [])
  const bundle = yield* Compiler.use((compiler) => compiler.build({ ...base, plugin: { ...base.plugin, skills: [PackagePath.make("custom/review")] } }))
  expect(fileAt(bundle, "skills/review/bin/run.sh").executable).toBe(true)
  expect(new TextDecoder().decode(fileAt(bundle, ".psdk/mcp/0.sh").content)).toContain("skills/review/bin/run.sh")
}).pipe(Effect.provide(CompilerTest)))

it.effect("rejects missing sources, nonexecutable commands, missing directories and unsupported references explicitly", () => Effect.gen(function*() {
  const { root } = yield* prepare()
  expect(yield* issues(request(root, "codex", {
    app: {
      type: "stdio", command: { file: "mcp/server.mjs" }, args: [{ file: "not-captured" }], cwd: "absent",
      env: { TOKEN: { type: "environment", name: "APP_TOKEN" } }
    }
  }))).toEqual([
    { type: "invalid_process", server: "app", reason: { type: "environment_reference_unsupported", name: "APP_TOKEN" } },
    { type: "invalid_process", server: "app", reason: { type: "missing_directory", path: "absent" } },
    { type: "invalid_process", server: "app", reason: { type: "missing_file", path: "not-captured" } },
    { type: "invalid_process", server: "app", reason: { type: "not_executable", path: "mcp/server.mjs" } }
  ])
  expect(yield* issues(request(root, "claude_code", { app: { type: "stdio", command: "node", args: [{ file: ".claude-plugin/plugin.json" }] } }, []))).toContainEqual({
    type: "invalid_process", server: "app", reason: { type: "missing_file", path: ".claude-plugin/plugin.json" }
  })
}).pipe(Effect.provide(CompilerTest)))

it.effect("rejects collisions between captured assets and generated launchers", () => Effect.gen(function*() {
  const { fs, root } = yield* prepare()
  const local = { app: { type: "stdio", command: "node" } }
  yield* fs.makeDirectory(join(root, ".psdk/mcp"), { recursive: true })
  yield* fs.writeFileString(join(root, ".psdk/mcp/0.sh"), "source bytes")
  const collision = yield* issues(request(root, "claude_code", local, [".psdk"]))
  expect(collision).toContainEqual({ type: "path_collision", path: ".psdk/mcp/0.sh" })
}).pipe(Effect.provide(CompilerTest)))

it.effect("validates imported process packages after their digests have been recomputed", () => Effect.gen(function*() {
  const { root } = yield* prepare()
  const bundle = yield* Compiler.use((compiler) => compiler.build(request(root, "codex", { app: { type: "stdio", command: "node", args: [{ file: "mcp/server.mjs" }] } })))
  const server = { command: "node", args: [".psdk/runtime/process.mjs", ".", ".psdk/mcp/0.json"], env: {}, cwd: "." }
  for (const changed of [
    { ...server, command: "/bin/sh" }, { ...server, command: "./.psdk/mcp/1.json" },
    { ...server, args: ["literal-root"] }, { ...server, cwd: "/tmp" },
    { ...server, env: { PLUGIN_ROOT: "replacement" } }
  ]) {
    const files = bundle.files.map((file) => file.path === ".mcp.json"
      ? { ...file, content: jsonBytes({ mcpServers: { app: changed } }) }
      : file)
    expect(() => validateBundle(repackage(bundle, files))).toThrow()
  }
  const files = bundle.files.map((file) => file.path === ".psdk/mcp/0.sh" ? { ...file, executable: false } : file)
  expect(() => validateBundle(repackage(bundle, files))).toThrow()
}).pipe(Effect.provide(CompilerTest)))
