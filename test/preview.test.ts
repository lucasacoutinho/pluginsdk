import { expect, it } from "@effect/vitest"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url))

function fixture(run: (root: string, bin: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "pluginsdk-preview-boundary-"))
  const bin = join(root, "bin")
  mkdirSync(bin)
  writeFileSync(join(root, "definition.json"), JSON.stringify({
    id: "preview-check", version: "1.0.0", description: "Preview boundary", skills: [], mcp: {}
  }))
  try { run(root, bin) } finally { rmSync(root, { recursive: true, force: true }) }
}

function preview(root: string, bin: string, args: ReadonlyArray<string> = []) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cli, "preview", "--json", ...args], {
    cwd: root, encoding: "utf8", timeout: 30_000,
    env: { PATH: bin, HOME: root, CODEX_HOME: join(root, "codex-home"), CLAUDE_CONFIG_DIR: join(root, "claude-home") }
  })
  if (result.error !== undefined) throw result.error
  return result
}

it("reports missing clients without creating local configuration", () => fixture((root, bin) => {
  const result = preview(root, bin)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("No local clients found")
  expect(existsSync(join(root, "codex-home"))).toBe(false)
  expect(existsSync(join(root, "claude-home"))).toBe(false)
}))

it("blocks an unsupported installed client before changing either home", () => fixture((root, bin) => {
  writeFileSync(join(bin, "claude"), "#!/bin/sh\nprintf '2.1.304 (Claude Code)\\n'\n", { mode: 0o755 })
  writeFileSync(join(bin, "codex"), "#!/bin/sh\nprintf 'codex-cli 99.0.0\\n'\n", { mode: 0o755 })
  const result = preview(root, bin)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("codex 99.0.0 is unsupported")
  expect(existsSync(join(root, "codex-home"))).toBe(false)
  expect(existsSync(join(root, "claude-home"))).toBe(false)
}))

it("reports an unlaunchable client instead of treating it as missing", () => fixture((root, bin) => {
  writeFileSync(join(bin, "claude"), "#!/bin/sh\nexit 0\n", { mode: 0o644 })
  const result = preview(root, bin)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("Cannot start claude")
  expect(existsSync(join(root, "claude-home"))).toBe(false)
}))

it.skipIf(process.platform === "win32")("refuses Cursor preview on an unsupported platform before creating a home", () => fixture((root, bin) => {
  const result = preview(root, bin, ["--target", "cursor"])
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("Cursor preview requires a qualified Windows x64 installation")
  expect(existsSync(join(root, ".cursor"))).toBe(false)
  expect(existsSync(join(root, "codex-home"))).toBe(false)
  expect(existsSync(join(root, "claude-home"))).toBe(false)
}))
