import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import { dirname, join } from "node:path"
import { parse as parseToml, stringify as stringifyToml } from "smol-toml"
import { parseDocument, stringify as stringifyYaml } from "yaml"
import { Bundle as BundleSchema, BundleBody, BundleRejected, BuildRequest, Compiler, type BuildIssue, type Bundle, type BundleIssue, type Format, type PackageFile } from "../contracts/Compiler.ts"
import { AgentDefinition, PackagePath } from "../contracts/Plugin.ts"
import { bundleDigest } from "../src/internal/identity.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { validateBundle } from "../src/compiler/package/native.ts"

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)

const claudePrompt = `Review “café” safely.\nLiteral \${CLAUDE_PLUGIN_ROOT}.\nUse "double quotes" and 'single quotes'.`
const codexPrompt = `Compare 雪 and café.\nLiteral \${PLUGIN_ROOT}.\nKeep "quoted" content intact.`

type AgentInput = Readonly<Record<string, typeof AgentDefinition.Encoded>>

const agentDefinitions = {
  zulu: {
    description: "Review quotes, Unicode 雪, and ${literal}.",
    prompt: "prompts/zulu.md",
    models: { claude_code: "claude-haiku-4-5", codex: "gpt-6.1-sol" },
    shell: "deny"
  },
  auditor: {
    description: "Inspect changes with care.",
    prompt: "prompts/auditor.md"
  }
} satisfies AgentInput
const auditorDefinition = Schema.decodeSync(AgentDefinition)(agentDefinitions.auditor)

const agentFormats: ReadonlyArray<readonly [Format, "claude_code" | "codex"]> = [
  ["claude_code", "claude_code"],
  ["codex", "codex"]
]
const agentNames: ReadonlyArray<keyof typeof agentDefinitions> = ["auditor", "zulu"]

const makeRequest = (root: string, format: Format, agents?: AgentInput) =>
  Schema.decodeSync(BuildRequest)({
    root,
    format,
    plugin: {
      id: "agent-build",
      version: "1.0.0",
      description: "Agent compiler build test",
      skills: [],
      mcp: {},
      ...(agents === undefined ? {} : { agents })
    }
  })

const buildIssues = (request: ReturnType<typeof makeRequest>) =>
  Compiler.use((compiler) => Effect.flip(compiler.build(request))).pipe(
    Effect.map((error): ReadonlyArray<BuildIssue> => Match.value(error).pipe(Match.tagsExhaustive({
      BuildRejected: (rejected) => rejected.issues,
      SourceUnavailable: (unavailable) => { throw unavailable }
    })))
  )

const writeSourceFile = (fs: FileSystem.FileSystem, root: string, path: string, contents: string) =>
  Effect.gen(function*() {
    const target = join(root, path)
    yield* fs.makeDirectory(dirname(target), { recursive: true })
    yield* fs.writeFileString(target, contents)
  })

const fileAt = (bundle: Bundle, path: string): PackageFile => {
  const file = bundle.files.find((candidate) => candidate.path === path)
  if (file === undefined) throw new Error(`Missing bundle file ${path}`)
  return file
}

const fileText = (file: PackageFile): string => new TextDecoder("utf-8", { fatal: true }).decode(file.content)

const objectRecord = (value: unknown): Record<string, unknown> =>
  Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(value)

const repackage = (bundle: Bundle, files: ReadonlyArray<PackageFile>): Bundle => {
  const body = Schema.decodeUnknownSync(Schema.toType(BundleBody))({
    schema: bundle.schema,
    plugin: bundle.plugin,
    format: bundle.format,
    files
  })
  return Schema.decodeSync(Schema.toType(BundleSchema))({ ...body, digest: bundleDigest(body) })
}

const replaceContent = (bundle: Bundle, path: string, content: Uint8Array): Bundle => {
  let found = false
  const files = bundle.files.map((file) => {
    if (file.path !== path) return file
    found = true
    return { ...file, content }
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

const markdownParts = (text: string): { readonly metadata: unknown; readonly prompt: string } => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text)
  const frontmatter = match?.[1]
  const body = match?.[2]
  if (frontmatter === undefined || body === undefined) throw new Error("Missing Markdown frontmatter")
  const document = parseDocument(frontmatter, { uniqueKeys: true, strict: true })
  return { metadata: document.toJS({ maxAliasCount: 0 }), prompt: body.endsWith("\n") ? body.slice(0, -1) : body }
}

const replaceClaudeDocument = (bundle: Bundle, transform: (document: Record<string, unknown>) => Record<string, unknown>, prompt = claudePrompt): Bundle => {
  const file = fileAt(bundle, "agents/auditor.md")
  const original = markdownParts(fileText(file))
  const metadata = transform(objectRecord(original.metadata))
  return replaceContent(bundle, file.path, new TextEncoder().encode(`---\n${stringifyYaml(metadata, { lineWidth: 0 })}---\n${prompt}\n`))
}

const replaceCodexDocument = (bundle: Bundle, transform: (document: Record<string, unknown>) => Record<string, unknown>): Bundle => {
  const file = fileAt(bundle, "agents/auditor.toml")
  const original: unknown = parseToml(fileText(file))
  return replaceContent(bundle, file.path, new TextEncoder().encode(stringifyToml(transform(objectRecord(original)))))
}

const expectInvalidBundle = (bundle: Bundle): void => {
  const issues = validationIssues(bundle)
  expect(issues).toHaveLength(1)
  expect(issues[0]?.type).toBe("invalid_native_package")
}

it.effect("builds canonical Claude and Codex agent documents and preserves prompt controls", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-agents-build-" })
    yield* writeSourceFile(fs, root, "prompts/zulu.md", ` \n${codexPrompt}\n `)
    yield* writeSourceFile(fs, root, "prompts/auditor.md", `\t${claudePrompt}\n `)
    const compiler = yield* Compiler
    const permuted: AgentInput = {
      auditor: agentDefinitions.auditor,
      zulu: agentDefinitions.zulu
    }

    for (const [format, expectedHost] of agentFormats) {
      const first = yield* compiler.build(makeRequest(root, format, agentDefinitions))
      const second = yield* compiler.build(makeRequest(root, format, permuted))
      expect(first).toStrictEqual(second)
      expect(first.digest).toBe(second.digest)
      expect(first.files.filter((file) => file.path.startsWith("agents/")).map((file) => file.path)).toEqual(
        expectedHost === "claude_code" ? ["agents/auditor.md", "agents/zulu.md"] : ["agents/auditor.toml", "agents/zulu.toml"]
      )

      for (const name of agentNames) {
        const path = expectedHost === "claude_code" ? `agents/${name}.md` : `agents/${name}.toml`
        const file = fileAt(first, path)
        expect(file.executable).toBe(false)
        if (expectedHost === "claude_code") {
          const { metadata, prompt } = markdownParts(fileText(file))
          expect(prompt).toBe(name === "auditor" ? claudePrompt : codexPrompt)
          expect(metadata).toEqual(name === "auditor"
            ? { name, description: agentDefinitions.auditor.description }
            : { name, description: agentDefinitions.zulu.description, model: "claude-haiku-4-5", disallowedTools: ["Bash"] })
        } else {
          const document: unknown = parseToml(fileText(file))
          expect(document).toEqual(name === "auditor"
            ? {
              name: `agent-build:${name}`,
              description: agentDefinitions.auditor.description,
              developer_instructions: claudePrompt
            }
            : {
              name: `agent-build:${name}`,
              description: agentDefinitions.zulu.description,
              developer_instructions: codexPrompt,
              model: "gpt-6.1-sol",
              features: { shell_tool: false }
            })
        }
      }
      expect(validateBundle(first).version).toBe("1.0.0")
    }
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("preserves empty-agent package commitments for both clients", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-agents-empty-" })
    const compiler = yield* Compiler

    for (const [format] of agentFormats) {
      const absent = yield* compiler.build(makeRequest(root, format))
      const empty = yield* compiler.build(makeRequest(root, format, {}))
      expect(empty.files).toEqual(absent.files)
      expect(empty.digest).toBe(absent.digest)
    }
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects unsupported controls at the programmatic build boundary", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-agents-controls-" })
    yield* writeSourceFile(fs, root, agentDefinitions.auditor.prompt, claudePrompt)
    const compiler = yield* Compiler
    const request = makeRequest(root, "codex", { auditor: agentDefinitions.auditor })
    yield* compiler.build(request)
    const unsupported = {
      ...request,
      plugin: {
        ...request.plugin,
        agents: { auditor: { ...auditorDefinition, web: "deny" } }
      }
    }
    const failure = yield* Effect.flip(compiler.build(unsupported))
    expect(failure._tag).toBe("SourceUnavailable")
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("captures agent prompts inside the root and rejects invalid UTF-8 or blank content", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-agents-capture-" })
    const outside = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-agents-outside-" })
    yield* writeSourceFile(fs, outside, "prompt.md", claudePrompt)
    yield* fs.makeDirectory(join(root, "prompts"), { recursive: true })
    yield* fs.symlink(join(outside, "prompt.md"), join(root, "prompts", "escape.md"))
    yield* fs.writeFile(join(root, "prompts", "invalid.md"), new Uint8Array([0xff, 0xfe]))
    yield* writeSourceFile(fs, root, "prompts/blank.md", " \n\t ")

    const promptRequest = (prompt: string) => makeRequest(root, "claude_code", {
      auditor: { ...agentDefinitions.auditor, prompt }
    })
    expect(yield* buildIssues(promptRequest("prompts/escape.md"))).toEqual([
      { type: "source_escape", path: PackagePath.make("prompts/escape.md") }
    ])
    expect(yield* buildIssues(promptRequest("prompts/invalid.md"))).toEqual([
      { type: "invalid_agent", path: PackagePath.make("prompts/invalid.md"), detail: "Prompt must be nonempty valid UTF-8 text without NUL" }
    ])
    expect(yield* buildIssues(promptRequest("prompts/blank.md"))).toEqual([
      { type: "invalid_agent", path: PackagePath.make("prompts/blank.md"), detail: "Prompt must be nonempty valid UTF-8 text without NUL" }
    ])
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects resealed noncanonical or unsafe imported native agents", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-agents-import-" })
    yield* writeSourceFile(fs, root, "prompts/zulu.md", codexPrompt)
    yield* writeSourceFile(fs, root, "prompts/auditor.md", claudePrompt)
    const compiler = yield* Compiler
    const claude = yield* compiler.build(makeRequest(root, "claude_code", agentDefinitions))
    const codex = yield* compiler.build(makeRequest(root, "codex", agentDefinitions))

    expectInvalidBundle(replaceCodexDocument(codex, (document) => ({ ...document, name: "other-plugin:auditor" })))
    expectInvalidBundle(replaceCodexDocument(codex, (document) => ({ ...document, features: { shell_tool: true } })))
    expectInvalidBundle(replaceCodexDocument(codex, (document) => ({ ...document, web_search: "disabled" })))
    expectInvalidBundle(replaceCodexDocument(codex, (document) => ({ ...document, developer_instructions: "" })))
    expectInvalidBundle(replaceClaudeDocument(claude, (document) => ({ ...document, disallowedTools: ["WebFetch"] })))
    expectInvalidBundle(replaceClaudeDocument(claude, (document) => ({ ...document, hidden_control: "private-control" })))
    expectInvalidBundle(replaceClaudeDocument(claude, (_document) => ({ name: "auditor", description: agentDefinitions.auditor.description, model: "claude-sonnet-4-5" }), ""))

    const codexFile = fileAt(codex, "agents/auditor.toml")
    const executable = repackage(codex, codex.files.map((file) => file.path === codexFile.path ? { ...file, executable: true } : file))
    expectInvalidBundle(executable)

    const unknown = validationIssues(replaceClaudeDocument(claude, (document) => ({ ...document, hidden_control: claudePrompt })))
    expect(JSON.stringify(unknown)).not.toContain(claudePrompt)
  }).pipe(Effect.provide(CompilerTest))
)
