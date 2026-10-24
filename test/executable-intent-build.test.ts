import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import { dirname, join } from "node:path"
import {
  BuildRequest,
  Compiler,
  SourceUnavailable,
  type BuildIssue,
  type Bundle,
  type Format,
  type PackageFile
} from "../contracts/Compiler.ts"
import { AgentDefinition } from "../contracts/Plugin.ts"
import { CompilerLive } from "../src/compiler/index.ts"

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)

type AgentInput = Readonly<Record<string, typeof AgentDefinition.Encoded>>

type RequestOptions = {
  readonly format?: Format
  readonly skills?: ReadonlyArray<string>
  readonly assets?: ReadonlyArray<string>
  readonly executables?: ReadonlyArray<string>
  readonly agents?: AgentInput
}

type BuildOutcome =
  | { readonly type: "built"; readonly bundle: Bundle }
  | { readonly type: "rejected"; readonly issues: ReadonlyArray<BuildIssue> }
  | { readonly type: "unavailable"; readonly error: SourceUnavailable }

const makeRequest = (root: string, options: RequestOptions = {}) =>
  Schema.decodeSync(BuildRequest)({
    root,
    format: options.format ?? "agent_plugins_v2",
    plugin: {
      id: "executable-intent",
      version: "1.0.0",
      description: "Executable intent integration test",
      skills: options.skills ?? [],
      assets: options.assets ?? [],
      ...(options.executables === undefined ? {} : { executables: options.executables }),
      mcp: {},
      ...(options.agents === undefined ? {} : { agents: options.agents })
    }
  })

const buildOutcome = (request: ReturnType<typeof makeRequest>) =>
  Compiler.use((compiler) => Effect.result(compiler.build(request))).pipe(
    Effect.map((result): BuildOutcome => Match.value(result).pipe(
      Match.tagsExhaustive({
        Failure: (failure) => Match.value(failure.failure).pipe(Match.tagsExhaustive({
          BuildRejected: (rejected): BuildOutcome => ({ type: "rejected", issues: rejected.issues }),
          SourceUnavailable: (unavailable): BuildOutcome => ({ type: "unavailable", error: unavailable })
        })),
        Success: (success): BuildOutcome => ({ type: "built", bundle: success.success })
      })
    ))
  )

const bundleFrom = (outcome: BuildOutcome): Bundle => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    built: (value) => value.bundle,
    rejected: (value) => { throw new Error(`Expected build success, received ${JSON.stringify(value.issues)}`) },
    unavailable: (value) => { throw value.error }
  })
)

const issuesFrom = (outcome: BuildOutcome): ReadonlyArray<BuildIssue> => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    built: () => { throw new Error("Expected compiler build rejection") },
    rejected: (value) => value.issues,
    unavailable: (value) => { throw value.error }
  })
)

const writeSourceFile = (fs: FileSystem.FileSystem, root: string, path: string, content: string) =>
  Effect.gen(function*() {
    const target = join(root, path)
    yield* fs.makeDirectory(dirname(target), { recursive: true })
    yield* fs.writeFileString(target, content)
  })

const writeSkill = (fs: FileSystem.FileSystem, root: string, directory: string, name: string) =>
  writeSourceFile(fs, root, `${directory}/SKILL.md`, [
    "---",
    `name: ${name}`,
    `description: ${name} skill fixture`,
    "---",
    `# ${name}`,
    ""
  ].join("\n"))

const fileAt = (bundle: Bundle, path: string): PackageFile => {
  const file = bundle.files.find((candidate) => candidate.path === path)
  if (file === undefined) throw new Error(`Expected bundle file ${path}`)
  return file
}

const expectExecutableIssue = (issues: ReadonlyArray<BuildIssue>, path: string): void => {
  expect(issues).toHaveLength(1)
  const issue = issues[0]
  if (issue === undefined || issue.type !== "invalid_executable") {
    throw new Error(`Expected invalid_executable for ${path}, received ${JSON.stringify(issues)}`)
  }
  expect(issue.path).toBe(path)
  expect(issue.detail.trim().length).toBeGreaterThan(0)
}

it.effect("discovers executable source modes when the declaration is omitted", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-executable-default-" })
    yield* writeSourceFile(fs, root, "tools/run.sh", "#!/bin/sh\nexit 0\n")
    yield* writeSourceFile(fs, root, "tools/readme.txt", "This is data.\n")
    yield* fs.chmod(join(root, "tools/run.sh"), 0o755)
    yield* fs.chmod(join(root, "tools/readme.txt"), 0o644)

    for (const format of ["agent_plugins_v2", "claude_code_v2"] as const) {
      const bundle = bundleFrom(yield* buildOutcome(makeRequest(root, { format, assets: ["tools"] })))
      expect(fileAt(bundle, "tools/run.sh").executable).toBe(true)
      expect(fileAt(bundle, "tools/readme.txt").executable).toBe(false)
    }
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("treats every captured file as data when executables is explicitly empty", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-executable-empty-" })
    yield* writeSourceFile(fs, root, "tools/run.sh", "#!/bin/sh\nexit 0\n")
    yield* fs.chmod(join(root, "tools/run.sh"), 0o755)

    const bundle = bundleFrom(yield* buildOutcome(makeRequest(root, {
      format: "claude_code_v2",
      assets: ["tools"],
      executables: []
    })))
    expect(fileAt(bundle, "tools/run.sh").executable).toBe(false)
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("resolves exact declared source paths before shortening skill support paths", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-executable-paths-" })
    const skill = "source/guide"
    const uppercase = `${skill}/scripts/Run.sh`
    const lowercase = `${skill}/scripts/run.sh`
    const composed = `${skill}/scripts/café.sh`
    const decomposed = `${skill}/scripts/cafe\u0301.sh`
    yield* writeSkill(fs, root, skill, "guide")
    for (const path of [uppercase, composed, decomposed]) {
      yield* writeSourceFile(fs, root, path, "#!/bin/sh\nexit 0\n")
      yield* fs.chmod(join(root, path), 0o755)
    }

    const bundle = bundleFrom(yield* buildOutcome(makeRequest(root, {
      format: "claude_code_v5",
      skills: [skill],
      executables: [uppercase, composed]
    })))
    expect(fileAt(bundle, "skills/guide/scripts/Run.sh").executable).toBe(true)
    expect(fileAt(bundle, "skills/guide/scripts/café.sh").executable).toBe(true)
    expect(fileAt(bundle, "skills/guide/scripts/cafe\u0301.sh").executable).toBe(false)

    const wrongCase = issuesFrom(yield* buildOutcome(makeRequest(root, {
      format: "claude_code_v5",
      skills: [skill],
      executables: [lowercase]
    })))
    expectExecutableIssue(wrongCase, lowercase)
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("rejects duplicate, missing, and uncaptured executable declarations", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-executable-invalid-" })
    yield* writeSourceFile(fs, root, "assets/run.sh", "#!/bin/sh\nexit 0\n")
    yield* writeSourceFile(fs, root, "orphan.sh", "#!/bin/sh\nexit 0\n")

    const duplicate = issuesFrom(yield* buildOutcome(makeRequest(root, {
      assets: ["assets"],
      executables: ["assets/run.sh", "assets/run.sh"]
    })))
    expectExecutableIssue(duplicate, "assets/run.sh")

    const missing = issuesFrom(yield* buildOutcome(makeRequest(root, {
      assets: ["assets"],
      executables: ["assets/missing.sh"]
    })))
    expectExecutableIssue(missing, "assets/missing.sh")

    const uncaptured = issuesFrom(yield* buildOutcome(makeRequest(root, {
      executables: ["orphan.sh"]
    })))
    expectExecutableIssue(uncaptured, "orphan.sh")
  }).pipe(Effect.provide(CompilerTest))
)

it.effect("packages declared executables and data while keeping generated host documents nonexecutable", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-executable-hosts-" })
    const skill = "skills/tool"
    const executable = `${skill}/bin/run.sh`
    const documentation = `${skill}/references/usage.txt`
    const sharedPrompt = "prompts/shared.md"
    const agents = {
      alpha: { description: "First shared-prompt agent.", prompt: sharedPrompt },
      beta: { description: "Second shared-prompt agent.", prompt: sharedPrompt }
    } satisfies AgentInput

    yield* writeSkill(fs, root, skill, "tool")
    yield* writeSourceFile(fs, root, executable, "#!/bin/sh\nexit 0\n")
    yield* writeSourceFile(fs, root, documentation, "Tool reference.\n")
    yield* writeSourceFile(fs, root, sharedPrompt, "A shared agent prompt.\n")
    yield* fs.chmod(join(root, executable), 0o644)
    yield* fs.chmod(join(root, documentation), 0o755)
    yield* fs.chmod(join(root, sharedPrompt), 0o755)

    const claudeManifest = ".claude-plugin/plugin.json"
    const codexManifest = ".codex-plugin/plugin.json"
    const hosts = [
      {
        format: "claude_code_v5",
        manifest: claudeManifest,
        agentPaths: ["agents/alpha.md", "agents/beta.md"]
      },
      {
        format: "codex_plugin_v2",
        manifest: codexManifest,
        agentPaths: ["agents/alpha.toml", "agents/beta.toml"]
      }
    ] as const
    for (const host of hosts) {
      const bundle = bundleFrom(yield* buildOutcome(makeRequest(root, {
        format: host.format,
        skills: [skill],
        executables: [executable, sharedPrompt],
        agents
      })))

      expect(fileAt(bundle, executable).executable).toBe(true)
      expect(fileAt(bundle, documentation).executable).toBe(false)
      expect(fileAt(bundle, host.manifest).executable).toBe(false)
      for (const path of host.agentPaths) {
        const document = fileAt(bundle, path)
        expect(document.executable).toBe(false)
        expect(new TextDecoder().decode(document.content)).toContain("A shared agent prompt.")
      }
    }
  }).pipe(Effect.provide(CompilerTest))
)
