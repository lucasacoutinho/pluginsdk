import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Release } from "../contracts/Registry.ts"

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url))

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
  const directory = mkdtempSync(join(tmpdir(), "pluginsdk-distribution-cli-"))
  try {
    run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

it("registers distribution plan and apply commands with their documented options", () => {
  withTempDirectory((directory) => {
    const rootHelp = runCli(directory, ["--help"])
    expect(rootHelp.status, rootHelp.stderr).toBe(0)
    expect(`${rootHelp.stdout}${rootHelp.stderr}`).toContain("distribution")

    const help = runCli(directory, ["distribution", "--help"])
    expect(help.status, help.stderr).toBe(0)
    const output = `${help.stdout}${help.stderr}`
    expect(output).toContain("plan")
    expect(output).toContain("apply")

    const planHelp = runCli(directory, ["distribution", "plan", "--help"])
    expect(planHelp.status, planHelp.stderr).toBe(0)
    expect(`${planHelp.stdout}${planHelp.stderr}`).toContain("--request")
    expect(`${planHelp.stdout}${planHelp.stderr}`).toContain("--catalog")
    expect(`${planHelp.stdout}${planHelp.stderr}`).toContain("--out")

    const applyHelp = runCli(directory, ["distribution", "apply", "--help"])
    expect(applyHelp.status, applyHelp.stderr).toBe(0)
    expect(`${applyHelp.stdout}${applyHelp.stderr}`).toContain("--state")
  })
})

it("strictly rejects malformed request and reviewed-plan JSON before execution", () => {
  withTempDirectory((directory) => {
    const release = Schema.decodeSync(Release)({
      key: { organization: "acme", integration: "demo", release: "approved-1" },
      version: "1.0.0",
      origin: {
        type: "artifact",
        location: "https://packages.example.invalid/demo.json",
        digest: "a".repeat(64)
      },
      contents: {
        type: "plugin",
        plugin: "demo",
        packages: { claude_code: "b".repeat(64) }
      }
    })
    const releasePath = join(directory, "release.json")
    writeFileSync(releasePath, JSON.stringify(Schema.encodeSync(Release)(release)))

    const requestPath = join(directory, "request.json")
    writeFileSync(requestPath, JSON.stringify({
      desired: "present",
      targets: [{
        type: "workspace",
        id: "workbench",
        organization: "acme",
        workspace: "main",
        surface: "codex"
      }],
      extra: true
    }))
    const rejectedRequest = runCli(directory, [
      "distribution", "plan", releasePath,
      "--request", requestPath,
      "--catalog", join(directory, "catalog"),
      "--out", join(directory, "reviewed.json")
    ])
    expect(rejectedRequest.status).not.toBe(0)
    expect(rejectedRequest.stderr).toContain("Distribution request does not match the Request schema")
    expect(existsSync(join(directory, "reviewed.json"))).toBe(false)

    const invalidPlanPath = join(directory, "invalid-plan.json")
    const statePath = join(directory, "state")
    writeFileSync(invalidPlanPath, "{}")
    const rejectedPlan = runCli(directory, [
      "distribution", "apply", invalidPlanPath,
      "--state", statePath
    ])
    expect(rejectedPlan.status).not.toBe(0)
    expect(rejectedPlan.stderr).toContain("Reviewed distribution does not match the ReadyPlan schema")
    expect(existsSync(statePath)).toBe(false)
  })
})
