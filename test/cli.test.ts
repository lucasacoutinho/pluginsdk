import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Bundle } from "../contracts/Compiler.ts"
import { PlanBody, ReadyPlan } from "../contracts/Installer.ts"
import { PackagePath, PluginId } from "../contracts/Plugin.ts"
import { parseJson } from "../src/internal/json.ts"
import { bundleDigest, planId } from "../src/internal/identity.ts"

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const packageMetadata: unknown = createRequire(import.meta.url)("pluginsdk/package.json")
const packageVersion = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.NonEmptyString }))(packageMetadata).version

type CliResult = {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

const runCli = (directory: string, args: ReadonlyArray<string>): CliResult => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cliPath, ...args], {
    cwd: directory,
    encoding: "utf8"
  })
  if (result.error !== undefined) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

const withTempDirectory = (run: (directory: string) => void): void => {
  const directory = mkdtempSync(join(tmpdir(), "pluginsdk-cli-"))
  try {
    run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const readyPlanJson = (content: string): string => {
  const bundleBody = {
    schema: 1,
    plugin: PluginId.make("demo"),
    format: "codex",
    files: [{
      path: PackagePath.make(".codex-plugin/plugin.json"),
      content: new TextEncoder().encode(JSON.stringify({
        name: "demo", version: "1.0.0", description: content
      })),
      executable: false
    }]
  } satisfies Omit<Bundle, "digest">
  const bundle = { ...bundleBody, digest: bundleDigest(bundleBody) }
  const body = Schema.decodeSync(PlanBody)({
    type: "ready",
    schema: 1,
    target: {
      key: "codex:demo",
      destination: { type: "user", host: "codex", home: "/home/example/.codex" },
      plugin: "demo",
      profile: "codex-profile-v1",
      version: "1.0.0"
    },
    before: { revision: null, receipt: null, observed: { type: "unknown" } },
    change: {
      type: "install",
      bundle: Schema.encodeSync(Bundle)(bundle)
    }
  })
  return JSON.stringify(Schema.encodeSync(ReadyPlan)({ ...body, id: planId(body) }))
}

it("prints help and the package-derived version", () => {
  withTempDirectory((directory) => {
    const help = runCli(directory, ["--help"])
    expect(help.status, help.stderr).toBe(0)
    expect(`${help.stdout}${help.stderr}`).toContain("build")
    expect(`${help.stdout}${help.stderr}`).toContain("plan")
    expect(`${help.stdout}${help.stderr}`).toContain("show")

    const version = runCli(directory, ["--version"])
    expect(version.status, version.stderr).toBe(0)
    expect(`${version.stdout}${version.stderr}`).toContain(packageVersion)
  })
})

it("builds a schema-encoded bundle and rejects invalid or duplicate-key definitions", () => {
  withTempDirectory((directory) => {
    const source = join(directory, "source")
    mkdirSync(source)
    const definition = join(directory, "plugin.json")
    writeFileSync(definition, JSON.stringify({
      id: "demo",
      version: "1.0.0",
      description: "CLI build fixture",
      skills: [],
      mcp: {}
    }))
    const output = join(directory, "codex-build")
    const built = runCli(directory, [
      "build",
      definition,
      "--root",
      source,
      "--target",
      "codex",
      "--out",
      output,
      "--json"
    ])

    expect(built.status, built.stderr).toBe(0)
    const bundle = Schema.decodeUnknownSync(Bundle)(parseJson(built.stdout))
    expect(bundle.plugin).toBe("demo")
    expect(bundle.format).toBe("codex")
    expect(bundle.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(readFileSync(join(output, "codex.bundle.json"), "utf8")).toBe(built.stdout.trim())
    expect(existsSync(join(output, "build.json"))).toBe(true)
    const manifest = bundle.files.find((file) => file.path === ".codex-plugin/plugin.json")
    if (manifest === undefined) throw new Error("Codex package manifest is missing")
    expect(parseJson(Buffer.from(manifest.content).toString("utf8"))).toEqual({
      name: "demo", version: "1.0.0", description: "CLI build fixture"
    })
    expect(built.stdout).toContain(Buffer.from(manifest.content).toString("base64"))

    const invalidDefinition = join(directory, "invalid.json")
    writeFileSync(invalidDefinition, "{}")
    const invalid = runCli(directory, [
      "build",
      invalidDefinition,
      "--root",
      source,
      "--out",
      join(directory, "invalid-bundle.json")
    ])
    expect(invalid.status).not.toBe(0)
    expect(invalid.stderr).toContain("Project definition does not match the ProjectDefinition schema")

    const duplicateDefinition = join(directory, "duplicate.json")
    writeFileSync(duplicateDefinition, '{"id":"first","id":"second","version":"1.0.0","description":"duplicate key","skills":[],"mcp":{}}')
    const duplicate = runCli(directory, [
      "build",
      duplicateDefinition,
      "--root",
      source,
      "--out",
      join(directory, "duplicate-bundle.json")
    ])
    expect(duplicate.status).not.toBe(0)
    expect(duplicate.stderr).toContain("Input is not valid JSON")
  })
})

it("shows a persisted ready plan without printing package contents or consulting a native host", () => {
  withTempDirectory((directory) => {
    const planPath = join(directory, "ready-plan.json")
    const packageContent = "package payload that must remain hidden"
    writeFileSync(planPath, readyPlanJson(packageContent))

    const shown = runCli(directory, ["show", planPath])
    expect(shown.status, shown.stderr).toBe(0)
    expect(shown.stdout).toContain("status: ready")
    expect(shown.stdout).toContain("intent: install")
    expect(shown.stdout).toContain("plugin: demo")
    expect(shown.stdout).toContain("host: codex")
    expect(shown.stdout).toContain("scope: user")
    expect(shown.stdout).toContain("file: .codex-plugin/plugin.json executable=false")
    expect(shown.stdout).not.toContain(packageContent)
    expect(shown.stdout).not.toContain(Buffer.from(packageContent).toString("base64"))
  })
})

it("builds both clients from one definition without source-root or SDK setup", () => {
  withTempDirectory((directory) => {
    const source = join(directory, "plugin")
    const skill = join(source, "skills", "review")
    mkdirSync(skill, { recursive: true })
    const content = "---\nname: review\ndescription: Review code changes.\n---\nReview the requested changes.\n"
    writeFileSync(join(skill, "SKILL.md"), content)
    const definition = join(source, "definition.json")
    writeFileSync(definition, JSON.stringify({
      id: "demo", version: "1.0.0", description: "One maintained plugin", skills: ["skills/review"],
      mcp: { docs: { url: "https://docs.example/mcp", headers: { "X-App": "shared" } } }
    }))

    const built = runCli(directory, ["build", definition, "--json"])
    expect(built.status, built.stderr).toBe(0)
    const outputs = built.stdout.trim().split("\n").map((line) => Schema.decodeUnknownSync(Bundle)(parseJson(line)))
    expect(outputs.map((bundle) => bundle.format)).toEqual(["claude_code", "codex"])
    const discovered = runCli(source, ["build", "--json"])
    expect(discovered.status, discovered.stderr).toBe(0)
    const discoveredOutputs = discovered.stdout.trim().split("\n").map((line) => Schema.decodeUnknownSync(Bundle)(parseJson(line)))
    expect(discoveredOutputs).toEqual(outputs)
    for (const [host, format] of [["claude_code", "claude_code"], ["codex", "codex"]]) {
      const bundle = Schema.decodeUnknownSync(Bundle)(parseJson(readFileSync(join(directory, ".pluginsdk", "build", `${host}.bundle.json`), "utf8")))
      expect(bundle.format).toBe(format)
      const manifestPath = host === "claude_code" ? ".claude-plugin/plugin.json" : ".codex-plugin/plugin.json"
      const manifest = bundle.files.find((file) => file.path === manifestPath)
      if (manifest === undefined) throw new Error("Built native manifest is missing")
      expect(parseJson(Buffer.from(manifest.content).toString("utf8"))).toEqual({
        name: "demo", version: "1.0.0", description: "One maintained plugin"
      })
      const mcpFile = bundle.files.find((file) => file.path === ".mcp.json")
      if (mcpFile === undefined) throw new Error("Built MCP document is missing")
      expect(parseJson(Buffer.from(mcpFile.content).toString("utf8"))).toEqual({
        mcpServers: { docs: host === "claude_code"
          ? { type: "http", url: "https://docs.example/mcp", headers: { "X-App": "shared" } }
          : { url: "https://docs.example/mcp", http_headers: { "X-App": "shared" } } }
      })
      const entry = bundle.files.find((file) => file.path === "skills/review/SKILL.md")
      if (entry === undefined) throw new Error("Built skill is missing")
      expect(new TextDecoder().decode(entry.content)).toBe(content)
    }
  })
})

it("selects one client and writes no bundles when a requested client cannot preserve the definition", () => {
  withTempDirectory((directory) => {
    const definition = join(directory, "definition.json")
    writeFileSync(definition, JSON.stringify({
      id: "demo", version: "1.0.0", description: "Per-user service credential reference", skills: [],
      mcp: { docs: { url: "https://docs.example/mcp", headers: { Authorization: { type: "environment", name: "DOCS_TOKEN", prefix: "Bearer " } } } }
    }))
    const selected = runCli(directory, ["build", definition, "--target", "claude_code", "--out", "claude"])
    expect(selected.status, selected.stderr).toBe(0)
    expect(existsSync(join(directory, "claude", "claude_code.bundle.json"))).toBe(true)
    expect(existsSync(join(directory, "claude", "codex.bundle.json"))).toBe(false)

    const rejected = runCli(directory, ["build", definition])
    expect(rejected.status).not.toBe(0)
    expect(rejected.stderr).toContain("unsupported MCP configuration")
    expect(existsSync(join(directory, ".pluginsdk", "build"))).toBe(false)

    const unknown = runCli(directory, ["build", definition, "--target", "grok_bot"])
    expect(unknown.status).not.toBe(0)
    expect(existsSync(join(directory, ".pluginsdk", "build"))).toBe(false)

    const legacyFormat = runCli(directory, ["build", definition, "--format", "claude_code", "--out", "legacy-format"])
    expect(legacyFormat.status).not.toBe(0)
    expect(existsSync(join(directory, "legacy-format"))).toBe(false)
  })
})

it("builds both current clients for bundled stdio and rejects incomplete multi-client builds before writing", () => {
  withTempDirectory((directory) => {
    mkdirSync(join(directory, "server"))
    writeFileSync(join(directory, "server", "app.mjs"), "throw new Error('Building must not run this application')\n")
    const definition = join(directory, "definition.json")
    const plugin = {
      id: "application", version: "1.0.0", description: "One existing application server", skills: [], assets: ["server"],
      mcp: { app: { type: "stdio", command: "node", args: [{ file: "server/app.mjs" }] } }
    }
    writeFileSync(definition, JSON.stringify(plugin))
    const built = runCli(directory, ["build", definition, "--json"])
    expect(built.status, built.stderr).toBe(0)
    const bundles = built.stdout.trim().split("\n").map((line) => Schema.decodeUnknownSync(Bundle)(parseJson(line)))
    expect(bundles.map((bundle) => bundle.format)).toEqual(["claude_code", "codex"])
    for (const bundle of bundles) {
      expect(bundle.files.find((file) => file.path === ".psdk/mcp/0.sh")?.executable).toBe(true)
      expect(bundle.files.some((file) => file.path === "server/app.mjs")).toBe(true)
    }
    expect(existsSync(join(directory, ".pluginsdk", "build", "build.json"))).toBe(true)
    const legacyFormat = runCli(directory, ["build", definition, "--format", "claude_code", "--out", "legacy-format"])
    expect(legacyFormat.status).not.toBe(0)
    expect(existsSync(join(directory, "legacy-format"))).toBe(false)

    writeFileSync(definition, JSON.stringify({
      ...plugin,
      mcp: { app: { ...plugin.mcp.app, env: { TOKEN: { type: "environment", name: "PSDK_SAFE_EXAMPLE_SOURCE" } } } }
    }))
    const rejected = runCli(directory, ["build", definition, "--out", "rejected"])
    expect(rejected.status).not.toBe(0)
    expect(rejected.stderr).toContain("client cannot supply environment source: PSDK_SAFE_EXAMPLE_SOURCE")
    expect(existsSync(join(directory, "rejected"))).toBe(false)
    const selected = runCli(directory, ["build", definition, "--target", "claude_code", "--out", "claude-only"])
    expect(selected.status, selected.stderr).toBe(0)
    expect(existsSync(join(directory, "claude-only", "claude_code.bundle.json"))).toBe(true)
    expect(existsSync(join(directory, "claude-only", "build.json"))).toBe(true)
  })
})

it("builds the shared skill, MCP and two-event policy example with one command", () => {
  withTempDirectory((directory) => {
    const definition = fileURLToPath(new URL("./fixtures/plugins/automation.json", import.meta.url))
    const built = runCli(directory, ["build", definition, "--out", "automation", "--json"])
    expect(built.status, built.stderr).toBe(0)
    const bundles = built.stdout.trim().split("\n").map((line) => Schema.decodeUnknownSync(Bundle)(parseJson(line)))
    expect(bundles.map((bundle) => bundle.format)).toEqual(["claude_code", "codex"])
    const sharedPaths = [
      ".psdk/hooks/0.sh", ".psdk/hooks/1.sh", "automation/policy.mjs", "mcp/server/echo.mjs",
      "skills/review/SKILL.md", "skills/review/references/checklist.txt"
    ]
    const shared = bundles.map((bundle) => {
      expect(bundle.files).toHaveLength(14)
      const files = bundle.files.filter((file) => sharedPaths.includes(file.path))
      expect(files.map((file) => file.path)).toEqual(sharedPaths)
      return files
    })
    expect(shared[0]).toEqual(shared[1])
    for (const host of ["claude_code", "codex"]) {
      expect(existsSync(join(directory, "automation", `${host}.bundle.json`))).toBe(true)
    }

    const invalid = join(directory, "invalid-hooks.json")
    writeFileSync(invalid, JSON.stringify({
      id: "invalid-hooks", version: "1.0.0", description: "Unsupported hook environment source", skills: [], mcp: {},
      hooks: { context: { event: "SessionStart", command: "node", env: { TOKEN: { type: "environment", name: "TEAM_TOKEN" } } } }
    }))
    const rejected = runCli(directory, ["build", invalid, "--out", "rejected-hooks"])
    expect(rejected.status).not.toBe(0)
    expect(rejected.stderr).toContain("invalid hook process for context")
    expect(rejected.stderr).toContain("client cannot supply environment source: TEAM_TOKEN")
    expect(existsSync(join(directory, "rejected-hooks"))).toBe(false)
  })
})
