import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { Format } from "../contracts/Compiler.ts"
import * as Compatibility from "../contracts/Compatibility.ts"
import * as Installer from "../contracts/Installer.ts"
import { selectNativeProfile } from "../src/installer/target/compatibility.ts"
import { nativeProfiles, qualifiedFormat, qualifiedTarget, sameOwnedTarget } from "../src/installer/target/profiles.ts"

type Selection = Compatibility.Selection
type NativeProfile = Compatibility.NativeProfile
type Target = Installer.Target

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function select(
  host: Installer.Host,
  version: string,
  scope: Compatibility.Scope,
  format: Format,
  platform: string = process.platform
): Selection {
  return selectNativeProfile({
    query: {
      host,
      platform: Compatibility.RuntimePlatform.make(platform),
      version: Compatibility.RuntimeVersion.make(version),
      scope,
      format
    },
    profiles: nativeProfiles
  })
}

function expectSelected(
  selection: Selection,
  expected: { readonly host: Installer.Host; readonly version: string; readonly scope: Compatibility.Scope; readonly format: Format }
): void {
  const profile: NativeProfile = Match.value(selection).pipe(Match.discriminatorsExhaustive("type")({
    selected: ({ profile }) => profile,
    blocked: ({ reason }) => { throw new Error(`Expected a qualified profile, received ${reason}`) }
  }))
  expect(profile).toMatchObject({
    host: expected.host,
    version: expected.version,
    scope: expected.scope
  })
  expect(profile.formats).toContain(expected.format)
}

function expectUnqualified(selection: Selection): void {
  expect(selection).toEqual({ type: "blocked", reason: "unqualified" })
}

function decodeDestination(input: unknown): Installer.Destination {
  return decode(Installer.Destination, input)
}

function target(
  key: string,
  destination: Installer.Destination,
  plugin: string,
  profile: string,
  version: string
): Target {
  return decode(Installer.Target, { key, destination, plugin, profile, version })
}

const claudeUser = decodeDestination({
  type: "user",
  host: "claude_code",
  home: "/home/lucas/.claude"
})
const claudeProject = decodeDestination({
  type: "project",
  host: "claude_code",
  home: "/home/lucas/.claude",
  root: "/workspace/pluginsdk"
})
const codexUser = decodeDestination({
  type: "user",
  host: "codex",
  home: "/home/lucas/.codex"
})
const claude303 = target("installation-key", claudeUser, "team.plugin", "claude-local-marketplace:1", "2.1.303")
const claude304 = target("installation-key", claudeUser, "team.plugin", "claude-local-marketplace:1", "2.1.304")
const claudeProject303 = target("installation-key", claudeProject, "team.plugin", "claude-local-marketplace:1", "2.1.303")
const claudeProject304 = target("installation-key", claudeProject, "team.plugin", "claude-local-marketplace:1", "2.1.304")
const codex163 = target("installation-key", codexUser, "team.plugin", "codex-local-marketplace:1", "0.163.0")

it("qualifies portable packages for the tested clients and scopes", () => {
  for (const platform of ["linux", "win32"]) {
    for (const row of [
      { host: "claude_code", version: "2.1.304", format: "claude_code_portable_v1" },
      { host: "codex", version: "0.163.0", format: "codex_plugin_portable_v1" },
      { host: "claude_code", version: "2.1.304", format: "claude_code_portable_v2" },
      { host: "codex", version: "0.163.0", format: "codex_plugin_portable_v2" }
    ] satisfies ReadonlyArray<{ host: Installer.Host; version: string; format: Format }>) {
      expectSelected(select(row.host, row.version, "user", row.format, platform), { ...row, scope: "user" })
      expectSelected(select(row.host, row.version, "project", row.format, platform), { ...row, scope: "project" })
      expectUnqualified(select(row.host, row.version, "user", row.format, "darwin"))
      expectUnqualified(select(row.host, "unknown", "user", row.format, platform))
    }
    expectUnqualified(select("claude_code", "2.1.303", "user", "claude_code_portable_v1", platform))
    expectUnqualified(select("codex", "0.162.1", "user", "codex_plugin_portable_v1", platform))
    expectUnqualified(select("claude_code", "2.1.303", "user", "claude_code_portable_v2", platform))
    expectUnqualified(select("claude_code", "2.1.303", "project", "claude_code_portable_v1", platform))
    expectUnqualified(select("claude_code", "2.1.303", "project", "claude_code_portable_v2", platform))
    expectUnqualified(select("codex", "0.162.1", "user", "codex_plugin_portable_v2", platform))
    expectUnqualified(select("claude_code", "2.1.304", "user", "codex_plugin_portable_v2", platform))
    expectUnqualified(select("codex", "0.163.0", "user", "claude_code_portable_v2", platform))
  }
  expectUnqualified(select("claude_code", "2.1.304", "user", "codex_plugin_portable_v1", "win32"))
  expectUnqualified(select("codex", "0.163.0", "user", "claude_code_portable_v1", "win32"))

  const featureProfiles = new Set([
    ["claude_code", "linux", "2.1.304", "user", "claude_code_portable_v2"],
    ["claude_code", "linux", "2.1.304", "project", "claude_code_portable_v2"],
    ["codex", "linux", "0.163.0", "user", "codex_plugin_portable_v2"],
    ["codex", "linux", "0.163.0", "project", "codex_plugin_portable_v2"],
    ["claude_code", "win32", "2.1.304", "user", "claude_code_portable_v2"],
    ["claude_code", "win32", "2.1.304", "project", "claude_code_portable_v2"],
    ["codex", "win32", "0.163.0", "user", "codex_plugin_portable_v2"],
    ["codex", "win32", "0.163.0", "project", "codex_plugin_portable_v2"]
  ].map((tuple) => JSON.stringify(tuple)))
  for (const profile of nativeProfiles) {
    for (const format of ["claude_code_portable_v2", "codex_plugin_portable_v2"] satisfies ReadonlyArray<Format>) {
      const selection = select(profile.host, profile.version, profile.scope, format, profile.platform)
      const key = JSON.stringify([profile.host, profile.platform, profile.version, profile.scope, format])
      if (featureProfiles.has(key)) {
        expectSelected(selection, { host: profile.host, version: profile.version, scope: profile.scope, format })
      } else {
        expectUnqualified(selection)
      }
    }
  }
})

it("selects only registered version, platform, scope and format rows", () => {
  if (process.platform === "linux") {
    for (const scope of Compatibility.Scope.literals) {
      for (const format of ["claude_code_v1", "claude_code_v2"] satisfies ReadonlyArray<Format>) {
        expectSelected(select("claude_code", "2.1.303", scope, format), {
          host: "claude_code", version: "2.1.303", scope, format
        })
      }
    }
    for (const format of ["agent_plugins_v1", "agent_plugins_v2"] satisfies ReadonlyArray<Format>) {
      expectSelected(select("codex", "0.162.1", "user", format), {
        host: "codex", version: "0.162.1", scope: "user", format
      })
    }
    expectSelected(select("claude_code", "2.1.304", "user", "claude_code_v2"), {
      host: "claude_code", version: "2.1.304", scope: "user", format: "claude_code_v2"
    })
    expectSelected(select("codex", "0.163.0", "user", "agent_plugins_v2"), {
      host: "codex", version: "0.163.0", scope: "user", format: "agent_plugins_v2"
    })
    for (const format of ["agent_plugins_v1", "agent_plugins_v2"] satisfies ReadonlyArray<Format>) {
      expectSelected(select("codex", "0.163.0", "project", format), {
        host: "codex", version: "0.163.0", scope: "project", format
      })
    }
    expect(qualifiedFormat(claude304, "claude_code_v5")).toBe(true)
    expect(qualifiedFormat(codex163, "codex_plugin_v2")).toBe(true)
    expect(qualifiedFormat(claude303, "claude_code_v5")).toBe(false)
    expect(qualifiedFormat(claudeProject304, "claude_code_v5")).toBe(false)
    expect(qualifiedFormat(claudeProject304, "claude_code_portable_v1")).toBe(true)
    expect(qualifiedFormat(claudeProject304, "claude_code_portable_v2")).toBe(true)
    expect(qualifiedFormat(codex163, "claude_code_v5")).toBe(false)
  }

  expectUnqualified(select("claude_code", "2.1.303", "user", "claude_code_v4"))
  expectUnqualified(select("codex", "0.162.1", "user", "agent_plugins_v3"))
  expectUnqualified(select("codex", "0.162.1", "user", "codex_plugin_v1"))
  expectUnqualified(select("codex", "0.162.1", "user", "codex_plugin_v2"))
  expectUnqualified(select("claude_code", "2.1.303", "user", "claude_code_v5"))
  expectUnqualified(select("claude_code", "2.1.304", "project", "claude_code_v5"))
  expectUnqualified(select("claude_code", "2.1.305", "user", "claude_code_v2"))
  expectUnqualified(select("claude_code", "2.1.304", "user", "claude_code_v2", "freebsd"))
  expectUnqualified(select("codex", "0.162.1", "project", "agent_plugins_v2"))
  expectUnqualified(select("codex", "0.163.0", "project", "agent_plugins_v3"))
  expectUnqualified(select("codex", "0.163.0", "project", "codex_plugin_v1"))
  expectUnqualified(select("codex", "0.163.0", "project", "codex_plugin_v2"))
  expectUnqualified(select("claude_code", "2.1.304", "project", "claude_code_v4"))
})

it("qualifies only the pinned Cursor user profile and its accepted formats", () => {
  const cursorVersion = "3.26.16+8fcb8ace5c73fa31f2e2707fd6783160e4ed3e40"

  for (const format of Format.literals) {
    const selection = select("cursor", cursorVersion, "user", format, "win32")
    if (format === "claude_code_v2" || format === "claude_code_portable_v1") {
      expectSelected(selection, { host: "cursor", version: cursorVersion, scope: "user", format })
    } else {
      expectUnqualified(selection)
    }
  }

  for (const format of ["claude_code_v2", "claude_code_portable_v1"] satisfies ReadonlyArray<Format>) {
    expectUnqualified(select("cursor", cursorVersion, "project", format, "win32"))
    expectUnqualified(select("cursor", cursorVersion, "user", format, "linux"))
    expectUnqualified(select("cursor", cursorVersion, "user", format, "darwin"))
    expectUnqualified(select("cursor", "3.26.16", "user", format, "win32"))
    expectUnqualified(select("cursor", "3.26.16+8fcb8ace5c73fa31f2e2707fd6783160e4ed3e41", "user", format, "win32"))
  }
})

it("qualifies exact targets and preserves ownership only for the same registered physical subject", () => {
  if (process.platform === "linux") {
    expect(qualifiedTarget(claude303)).toBe(true)
    expect(qualifiedTarget(claude304)).toBe(true)
    expect(qualifiedTarget(claudeProject304)).toBe(true)
    expect(qualifiedTarget(codex163)).toBe(true)
    const codex162 = target("installation-key", codexUser, "team.plugin", "codex-local-marketplace:1", "0.162.1")
    expect(qualifiedTarget(codex162)).toBe(true)
    expect(sameOwnedTarget(claude304, claude303)).toBe(true)
    expect(sameOwnedTarget(claude303, claude304)).toBe(true)
    expect(sameOwnedTarget(codex163, codex162)).toBe(true)
    expect(sameOwnedTarget(codex162, codex163)).toBe(true)
  }

  expect(qualifiedTarget(target(
    "installation-key", claudeUser, "team.plugin", "claude-local-marketplace:2", "2.1.304"
  ))).toBe(false)
  expect(qualifiedTarget(target(
    "installation-key", claudeUser, "team.plugin", "claude-local-marketplace:1", "2.1.305"
  ))).toBe(false)
  expect(qualifiedTarget(target(
    "installation-key", decodeDestination({ ...codexUser, type: "project", root: "/workspace/pluginsdk" }),
    "team.plugin", "codex-local-marketplace:1", "0.163.0"
  ))).toBe(false)

  expect(sameOwnedTarget(claude304, target(
    "other-installation-key", claudeUser, "team.plugin", "claude-local-marketplace:1", "2.1.303"
  ))).toBe(false)
  expect(sameOwnedTarget(claude304, target(
    "installation-key", decodeDestination({ ...claudeUser, home: "/home/lucas/.claude-other" }),
    "team.plugin", "claude-local-marketplace:1", "2.1.303"
  ))).toBe(false)
  expect(sameOwnedTarget(claude304, target(
    "installation-key", codexUser, "team.plugin", "codex-local-marketplace:1", "0.163.0"
  ))).toBe(false)
  expect(sameOwnedTarget(claude304, target(
    "installation-key", claudeUser, "other.plugin", "claude-local-marketplace:1", "2.1.303"
  ))).toBe(false)
  expect(sameOwnedTarget(claude304, claudeProject303)).toBe(false)
  expect(sameOwnedTarget(claude304, target(
    "installation-key", claudeUser, "team.plugin", "claude-local-marketplace:2", "2.1.303"
  ))).toBe(false)
  expect(sameOwnedTarget(claude304, target(
    "installation-key", claudeUser, "team.plugin", "claude-local-marketplace:1", "2.1.305"
  ))).toBe(false)
  expect(sameOwnedTarget(claude304, claudeProject304)).toBe(false)
  expect(sameOwnedTarget(claudeProject304, target(
    "installation-key",
    decodeDestination({ ...claudeProject, root: "/workspace/other" }),
    "team.plugin", "claude-local-marketplace:1", "2.1.303"
  ))).toBe(false)
})
