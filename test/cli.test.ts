import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
    format: "agent_plugins_v1",
    files: [{
      path: PackagePath.make("plugin.json"),
      content: new TextEncoder().encode(JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
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
    const output = join(directory, "bundle.json")
    const built = runCli(directory, [
      "build",
      definition,
      "--root",
      source,
      "--format",
      "agent_plugins_v1",
      "--out",
      output,
      "--json"
    ])

    expect(built.status, built.stderr).toBe(0)
    const bundle = Schema.decodeUnknownSync(Bundle)(parseJson(built.stdout))
    expect(bundle.plugin).toBe("demo")
    expect(bundle.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(readFileSync(output, "utf8")).toBe(built.stdout.trim())
    const [manifest] = bundle.files
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
    expect(invalid.stderr).toContain("Plugin definition does not match the Plugin schema")

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
    expect(shown.stdout).toContain("file: plugin.json executable=false")
    expect(shown.stdout).not.toContain(packageContent)
    expect(shown.stdout).not.toContain(Buffer.from(packageContent).toString("base64"))
  })
})
