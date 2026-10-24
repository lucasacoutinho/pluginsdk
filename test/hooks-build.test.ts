import { dirname, join } from "node:path"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import {
  BuildRequest,
  BundleBody,
  BundleRejected,
  Compiler,
  type BuildIssue,
  type Bundle,
  type BundleIssue,
  type Format,
  type PackageFile
} from "../contracts/Compiler.ts"
import { PackagePath } from "../contracts/Plugin.ts"
import { bundleDigest } from "../src/internal/identity.ts"
import { parseJsonBytes } from "../src/internal/json.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { validateBundle } from "../src/compiler/package/native.ts"

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)
const hookFormats = ["claude_code_v4", "codex_plugin_v1"] as const

type RequestOptions = { readonly assets?: ReadonlyArray<string>; readonly mcp?: unknown; readonly hooks?: unknown }

const makeRequest = (root: string, format: Format, options: RequestOptions = {}) =>
  Schema.decodeUnknownSync(BuildRequest)({
    root, format, plugin: {
      id: "hooks-build", version: "1.0.0", description: "Hook compiler build test", skills: [],
      ...(options.assets === undefined ? {} : { assets: options.assets }), mcp: options.mcp ?? {},
      ...(options.hooks === undefined ? {} : { hooks: options.hooks })
    }
  })

const buildIssues = (input: ReturnType<typeof makeRequest>) =>
  Compiler.use((compiler) => Effect.flip(compiler.build(input))).pipe(
    Effect.map((error): ReadonlyArray<BuildIssue> => Match.value(error).pipe(Match.tagsExhaustive({
      BuildRejected: (error) => error.issues,
      SourceUnavailable: (error) => { throw error }
    })))
  )

const fileAt = (bundle: Bundle, path: string): PackageFile => {
  const file = bundle.files.find((candidate) => candidate.path === path)
  if (file === undefined) throw new Error(`Missing bundle file ${path}`)
  return file
}

const writeSourceFile = (fs: FileSystem.FileSystem, root: string, path: string, contents: string) =>
  Effect.gen(function*() {
    const target = join(root, path)
    yield* fs.makeDirectory(dirname(target), { recursive: true })
    yield* fs.writeFileString(target, contents)
  })

const repackage = (bundle: Bundle, files: ReadonlyArray<PackageFile>): Bundle => {
  const body = Schema.decodeUnknownSync(Schema.toType(BundleBody))({ schema: bundle.schema, plugin: bundle.plugin, format: bundle.format, files })
  return { ...body, digest: bundleDigest(body) }
}

const replaceJsonFile = (bundle: Bundle, path: string, value: unknown): Bundle => {
  const text = JSON.stringify(value)
  if (text === undefined) throw new Error("Expected a JSON document")
  let found = false
  const files = bundle.files.map((file) => {
    if (file.path !== path) return file
    found = true
    return { ...file, content: new TextEncoder().encode(text) }
  })
  if (!found) throw new Error(`Missing bundle file ${path}`)
  return repackage(bundle, files)
}

const validationIssues = (bundle: Bundle): ReadonlyArray<BundleIssue> => {
  try {
    validateBundle(bundle)
    return []
  } catch (cause) {
    if (cause instanceof BundleRejected) return cause.issues
    throw cause
  }
}

const expectInvalidNativePackage = (bundle: Bundle): void => {
  const issues = validationIssues(bundle)
  expect(issues).toHaveLength(1)
  expect(issues[0]?.type).toBe("invalid_native_package")
}

const expectedHookCommand = (format: typeof hookFormats[number], ordinal: number): string =>
  format === "claude_code_v4"
    ? `/bin/sh "$CLAUDE_PLUGIN_ROOT/.psdk/hooks/${ordinal}.sh" "$CLAUDE_PLUGIN_ROOT"`
    : `/bin/sh "$PLUGIN_ROOT/.psdk/hooks/${ordinal}.sh" "$PLUGIN_ROOT"`

const expectedHookHandler = (format: typeof hookFormats[number], ordinal: number, timeout = 30) => ({
  type: "command", command: expectedHookCommand(format, ordinal), timeout, async: false,
  ...(format === "codex_plugin_v1" ? { additionalContextLimit: 0 } : {})
})

const addExecutable = (bundle: Bundle, path: string, contents: Uint8Array): Bundle => repackage(
  bundle,
  [...bundle.files, { path: PackagePath.make(path), content: contents, executable: true }]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
)

it.effect("builds mixed MCP and two-event hook packages for both hosts without starting programs", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-hooks-build-" })
    const marker = join(root, "program-started")
    const program = `import { writeFileSync } from "node:fs"\nwriteFileSync(${JSON.stringify(marker)}, "started")\n`
    yield* writeSourceFile(fs, root, "automation/job.mjs", program)
    yield* writeSourceFile(fs, root, "automation/work/readme.txt", "Captured working directory.\n")

    const input = {
      assets: ["automation"],
      mcp: {
        shared: {
          type: "stdio", command: "node", args: [{ file: "automation/job.mjs" }],
          cwd: "automation/work", env: { MCP_TEXT: "literal '${MCP}' 雪" }
        },
        remote: { url: "https://api.example.test/mcp", headers: { "X-Source": "literal" } }
      },
      hooks: {
        shared: {
          event: "SessionStart", command: "node", args: [{ file: "automation/job.mjs" }],
          cwd: "automation/work", env: { EMPTY: "", HOOK_TEXT: "literal '${HOOK}' 雪" }
        },
        prompt: {
          event: "UserPromptSubmit", command: "node", args: [{ file: "automation/job.mjs" }, ""],
          cwd: "automation/work", timeout: 7
        }
      }
    }
    const compiler = yield* Compiler
    let previous: Bundle | undefined

    for (const format of hookFormats) {
      const bundle = yield* compiler.build(makeRequest(root, format, input))
      expect(yield* fs.exists(marker)).toBe(false)

      const codex = format === "codex_plugin_v1"
      const variable = codex ? "${PLUGIN_ROOT}" : "${CLAUDE_PLUGIN_ROOT}"
      expect(parseJsonBytes(fileAt(bundle, "hooks/hooks.json").content)).toEqual({
        hooks: {
          SessionStart: [{ hooks: [expectedHookHandler(format, 1)] }],
          UserPromptSubmit: [{ hooks: [expectedHookHandler(format, 0, 7)] }]
        }
      })
      expect(parseJsonBytes(fileAt(bundle, ".mcp.json").content)).toEqual({
        mcpServers: {
          shared: codex
            ? { command: "/bin/sh", args: [".psdk/mcp/0.sh"], env: {}, cwd: "." }
            : {
              type: "stdio", command: `${variable}/.psdk/mcp/0.sh`, args: [variable], env: {}
            },
          remote: codex
            ? { url: "https://api.example.test/mcp", http_headers: { "X-Source": "literal" } }
            : { type: "http", url: "https://api.example.test/mcp", headers: { "X-Source": "literal" } }
        }
      })
      expect(fileAt(bundle, "hooks/hooks.json").executable).toBe(false)
      for (const path of [".psdk/hooks/0.sh", ".psdk/hooks/1.sh", ".psdk/mcp/0.sh"]) {
        expect(fileAt(bundle, path).executable).toBe(true)
      }
      expect(fileAt(bundle, "automation/job.mjs").content).toEqual(new TextEncoder().encode(program))

      if (previous !== undefined) {
        for (const path of ["automation/job.mjs", ".psdk/hooks/0.sh", ".psdk/hooks/1.sh"]) {
          expect(fileAt(bundle, path).content).toEqual(fileAt(previous, path).content)
        }
      }
      previous = bundle
    }
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("keeps old formats hook-free and preserves ordinary v2 hook-adjacent assets", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-hooks-legacy-" })
    yield* writeSourceFile(fs, root, ".psdk/hooks/readme.txt", "Ordinary package asset.\n")
    const compiler = yield* Compiler
    const oldFormats: ReadonlyArray<Format> = [
      "agent_plugins_v1", "claude_code_v1", "agent_plugins_v2", "claude_code_v2", "agent_plugins_v3", "claude_code_v3"
    ]

    for (const format of oldFormats) {
      expect(yield* buildIssues(makeRequest(root, format, {
        hooks: { task: { event: "SessionStart", command: "node" } }
      }))).toEqual([{ type: "unsupported_feature", feature: "hooks", format }])

      const withoutHooks = yield* compiler.build(makeRequest(root, format))
      const emptyHooks = yield* compiler.build(makeRequest(root, format, { hooks: {} }))
      expect(emptyHooks.files).toEqual(withoutHooks.files)
      expect(emptyHooks.digest).toBe(withoutHooks.digest)
    }

    for (const format of ["agent_plugins_v2", "claude_code_v2"] as const) {
      const bundle = yield* compiler.build(makeRequest(root, format, {
        assets: [".psdk/hooks/readme.txt"], hooks: {}
      }))
      expect(fileAt(bundle, ".psdk/hooks/readme.txt").content).toEqual(
        new TextEncoder().encode("Ordinary package asset.\n")
      )
    }
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("reports hook process failures by hook and rejects references on both hosts", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-hooks-process-" })
    yield* writeSourceFile(fs, root, "tools/run.sh", "#!/bin/sh\nexit 0\n")
    const nonExecutable = join(root, "tools/run.sh")
    yield* fs.chmod(nonExecutable, 0o644)

    const processIssues = yield* buildIssues(makeRequest(root, "claude_code_v4", {
      assets: ["tools/run.sh"],
      hooks: {
        "missing-cwd": { event: "SessionStart", command: "node", cwd: "missing-work" },
        "missing-file": { event: "SessionStart", command: "node", args: [{ file: "absent.mjs" }] },
        "non-executable": { event: "SessionStart", command: { file: "tools/run.sh" } }
      }
    }))
    expect(processIssues).toEqual([
      { type: "invalid_hook_process", hook: "missing-cwd", reason: { type: "missing_directory", path: "missing-work" } },
      { type: "invalid_hook_process", hook: "missing-file", reason: { type: "missing_file", path: "absent.mjs" } },
      { type: "invalid_hook_process", hook: "non-executable", reason: { type: "not_executable", path: "tools/run.sh" } }
    ])

    for (const format of hookFormats) {
      expect(yield* buildIssues(makeRequest(root, format, {
        hooks: {
          referenced: {
            event: "SessionStart", command: "node",
            env: { TOKEN: { type: "environment", name: "SOURCE_TOKEN" } }
          }
        }
      }))).toEqual([{
        type: "invalid_hook_process", hook: "referenced",
        reason: { type: "environment_reference_unsupported", name: "SOURCE_TOKEN" }
      }])
    }
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects generated hook path collisions and reserved native hook assets", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-hooks-collisions-" })
    yield* writeSourceFile(fs, root, ".psdk/hooks/0.sh", "asset bytes\n")
    yield* writeSourceFile(fs, root, "hooks/hooks.json", "asset bytes\n")
    const hooks = { job: { event: "SessionStart", command: "node" } }

    const launcherCollision = yield* buildIssues(makeRequest(root, "claude_code_v4", {
      assets: [".psdk/hooks/0.sh"], hooks
    }))
    expect(launcherCollision).toContainEqual({ type: "path_collision", path: ".psdk/hooks/0.sh" })

    const reservedDocument = yield* buildIssues(makeRequest(root, "codex_plugin_v1", {
      assets: ["hooks/hooks.json"], hooks
    }))
    expect(reservedDocument).toContainEqual({ type: "reserved_asset", path: "hooks/hooks.json" })
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects resealed tampered native hook documents for both hosts", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-hooks-native-" })
    const compiler = yield* Compiler
    for (const format of hookFormats) {
      const hooks = {
        first: { event: "SessionStart", command: "node" },
        second: { event: "UserPromptSubmit", command: "node" }
      }
      const bundle = yield* compiler.build(makeRequest(root, format, { hooks }))
      const codex = format === "codex_plugin_v1"
      const firstHandler = { type: "command", command: expectedHookCommand(format, 0), timeout: 30, async: false, ...(codex ? { additionalContextLimit: 0 } : {}) }
      const secondHandler = { type: "command", command: expectedHookCommand(format, 1), timeout: 30, async: false, ...(codex ? { additionalContextLimit: 0 } : {}) }
      const baseline = {
        hooks: {
          SessionStart: [{ hooks: [firstHandler] }],
          UserPromptSubmit: [{ hooks: [secondHandler] }]
        }
      }
      expect(parseJsonBytes(fileAt(bundle, "hooks/hooks.json").content)).toEqual(baseline)
      expect(validationIssues(bundle)).toEqual([])

      const wrongHost = format === "claude_code_v4" ? "codex_plugin_v1" : "claude_code_v4"
      const bracedRoot = "${" + (codex ? "PLUGIN_ROOT" : "CLAUDE_PLUGIN_ROOT") + "}"
      const gap = { hooks: { ...baseline.hooks, UserPromptSubmit: [{ hooks: [{ ...secondHandler, command: expectedHookCommand(format, 2) }] }] } }
      const malformedGroups: ReadonlyArray<unknown> = [
        { matcher: "startup", hooks: [firstHandler] },
        { hooks: [{ ...firstHandler, async: true }] },
        { hooks: [{ ...firstHandler, timeout: 0 }] },
        { hooks: [firstHandler, firstHandler] },
        { hooks: [] },
        { hooks: [{ ...firstHandler, command: `/bin/sh "${bracedRoot}/.psdk/hooks/0.sh" "${bracedRoot}"` }] },
        codex
          ? { hooks: [{ type: "command", command: firstHandler.command, timeout: 30, async: false }] }
          : { hooks: [{ ...firstHandler, additionalContextLimit: 0 }] }
      ]
      const malformedDocuments: ReadonlyArray<unknown> = [
        { hooks: { ...baseline.hooks, PostToolUse: [] } },
        ...malformedGroups.map((group) => ({ hooks: { ...baseline.hooks, SessionStart: [group] } })),
        { hooks: { ...baseline.hooks, UserPromptSubmit: [{ hooks: [{ ...secondHandler, command: expectedHookCommand(format, 0) }] }] } },
        gap,
        { hooks: { ...baseline.hooks, SessionStart: [{ hooks: [{ ...firstHandler, command: expectedHookCommand(wrongHost, 0) }] }] } }
      ]

      for (const document of malformedDocuments) {
        expectInvalidNativePackage(replaceJsonFile(bundle, "hooks/hooks.json", document))
      }

      const withGapFile = addExecutable(
        replaceJsonFile(bundle, "hooks/hooks.json", gap),
        ".psdk/hooks/2.sh",
        fileAt(bundle, ".psdk/hooks/0.sh").content
      )
      expectInvalidNativePackage(withGapFile)

      expectInvalidNativePackage(repackage(
        bundle,
        bundle.files.filter((file) => file.path !== ".psdk/hooks/0.sh")
      ))
      expectInvalidNativePackage(repackage(bundle, bundle.files.map((file) =>
        file.path === ".psdk/hooks/0.sh" ? { ...file, executable: false } : file
      )))
    }
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects resealed Codex MCP records with non-native fields", () =>
  Effect.gen(function*() {
    const compiler = yield* Compiler
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-codex-mcp-hooks-" })
    const input = {
      mcp: {
        local: { type: "stdio", command: "node", args: ["--version"] },
        remote: { url: "https://api.example.test/mcp", headers: { "X-Source": "literal" } }
      }
    }
    const bundle = yield* compiler.build(makeRequest(root, "codex_plugin_v1", input))
    const baseline = {
      mcpServers: {
        local: { command: "/bin/sh", args: [".psdk/mcp/0.sh"], env: {}, cwd: "." },
        remote: { url: "https://api.example.test/mcp", http_headers: { "X-Source": "literal" } }
      }
    }
    expect(parseJsonBytes(fileAt(bundle, ".mcp.json").content)).toEqual(baseline)
    expect(validationIssues(bundle)).toEqual([])

    for (const document of [
      { mcpServers: { ...baseline.mcpServers, remote: { url: "https://api.example.test/mcp", headers: { "X-Source": "literal" } } } },
      { mcpServers: { ...baseline.mcpServers, remote: { ...baseline.mcpServers.remote, type: "http" } } },
      { mcpServers: { ...baseline.mcpServers, local: { ...baseline.mcpServers.local, cwd: "automation/work" } } },
      { mcpServers: { ...baseline.mcpServers, local: { ...baseline.mcpServers.local, args: [".psdk/mcp/1.sh"] } } },
      { mcpServers: { ...baseline.mcpServers, local: { ...baseline.mcpServers.local, env: { EXTRA: "replacement" } } } }
    ]) {
      expectInvalidNativePackage(replaceJsonFile(bundle, ".mcp.json", document))
    }
  }).pipe(Effect.provide(CompilerTest))
)
