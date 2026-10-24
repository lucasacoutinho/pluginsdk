import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { Bundle as BundleSchema, BundleBody, Format, type Bundle } from "../contracts/Compiler.ts"
import * as Compatibility from "../contracts/Compatibility.ts"
import * as Installer from "../contracts/Installer.ts"
import { selectNativeProfile } from "../src/installer/target/compatibility.ts"
import { nativeProfiles, qualifiedBundle, qualifiedTarget, sameOwnedTarget } from "../src/installer/target/profiles.ts"
import { bundleDigest } from "../src/internal/identity.ts"

type Selection = Compatibility.Selection
type NativeProfile = Compatibility.NativeProfile
type Target = Installer.Target

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function select(
  host: Installer.Host,
  platform: string,
  scope: Compatibility.Scope,
  format: Format | null,
  requirements: ReadonlyArray<Compatibility.Capability> = []
): Selection {
  return selectNativeProfile({
    query: decode(Compatibility.ProfileQuery, { host, platform, scope, format, requirements }),
    profiles: nativeProfiles
  })
}

const expectSelected = (selection: Selection, expected: NativeProfile): void => {
  const profile = Match.value(selection).pipe(Match.discriminatorsExhaustive("type")({
    selected: ({ profile }) => profile,
    blocked: ({ reason }) => { throw new Error(`Expected a current native profile, received ${reason}`) }
  }))
  expect(profile).toEqual(expected)
}

const expectUnqualified = (selection: Selection): void => {
  expect(selection).toEqual({ type: "blocked", reason: "unqualified" })
}

const otherFormat = (format: Format): Format => Match.value(format).pipe(
  Match.withReturnType<Format>(),
  Match.when("claude_code", () => "codex"),
  Match.when("codex", () => "claude_code"),
  Match.exhaustive
)

const allCapabilities = ["stdio", "hooks", "agents"] satisfies ReadonlyArray<Compatibility.Capability>
const expectedProfiles = decode(Schema.Array(Compatibility.NativeProfile), [
  { host: "claude_code", platform: "linux", scope: "user", revision: "claude-local-marketplace:1", format: "claude_code", capabilities: allCapabilities },
  { host: "claude_code", platform: "linux", scope: "project", revision: "claude-local-marketplace:1", format: "claude_code", capabilities: allCapabilities },
  { host: "claude_code", platform: "win32", scope: "user", revision: "claude-local-marketplace:1", format: "claude_code", capabilities: allCapabilities },
  { host: "claude_code", platform: "win32", scope: "project", revision: "claude-local-marketplace:1", format: "claude_code", capabilities: allCapabilities },
  { host: "codex", platform: "linux", scope: "user", revision: "codex-local-marketplace:1", format: "codex", capabilities: allCapabilities },
  { host: "codex", platform: "linux", scope: "project", revision: "codex-project-cache:1", format: "codex", capabilities: allCapabilities },
  { host: "codex", platform: "win32", scope: "user", revision: "codex-local-marketplace:1", format: "codex", capabilities: allCapabilities },
  { host: "codex", platform: "win32", scope: "project", revision: "codex-project-cache:1", format: "codex", capabilities: allCapabilities },
  { host: "cursor", platform: "win32", scope: "user", revision: "cursor-local-directory:1", format: "claude_code", capabilities: ["stdio"] }
])

function profileSignature(profile: NativeProfile): string {
  const signature = JSON.stringify([
    profile.host,
    profile.platform,
    profile.scope,
    profile.revision,
    profile.format,
    profile.capabilities
  ])
  if (signature === undefined) throw new Error("A native profile did not encode as a JSON tuple")
  return signature
}

it("registers one current format and capability set per host, platform and scope", () => {
  expect(new Set(nativeProfiles.map(profileSignature))).toEqual(new Set(expectedProfiles.map(profileSignature)))
  for (const profile of nativeProfiles) expect(decode(Compatibility.NativeProfile, profile)).toEqual(profile)
})

it("selects only exact current profile identities that satisfy bundle requirements", () => {
  for (const profile of nativeProfiles) {
    expectSelected(select(profile.host, profile.platform, profile.scope, profile.format, profile.capabilities), profile)
    expectSelected(select(profile.host, profile.platform, profile.scope, null, profile.capabilities), profile)
    expectUnqualified(select(profile.host, profile.platform, profile.scope, otherFormat(profile.format)))
  }

  const cursorProfile = nativeProfiles.find((profile) => profile.host === "cursor")
  if (cursorProfile === undefined) throw new Error("The current Cursor profile is missing")
  expectSelected(select("cursor", "win32", "user", "claude_code", ["stdio"]), cursorProfile)
  expectUnqualified(select("cursor", "win32", "user", "claude_code", ["hooks"]))
  expectUnqualified(select("cursor", "win32", "user", "claude_code", ["agents"]))
  expectUnqualified(select("cursor", "win32", "project", "claude_code", ["stdio"]))
  expectUnqualified(select("cursor", "linux", "user", "claude_code", ["stdio"]))
  expectUnqualified(select("claude_code", "darwin", "user", "claude_code"))

  const ambiguous = selectNativeProfile({
    query: decode(Compatibility.ProfileQuery, {
      host: "cursor", platform: "win32", scope: "user", format: "claude_code", requirements: ["stdio"]
    }),
    profiles: [cursorProfile, cursorProfile]
  })
  expect(ambiguous).toEqual({ type: "blocked", reason: "ambiguous" })
})

const claudeUser = decode(Installer.Destination, {
  type: "user", host: "claude_code", home: "/profiles/claude"
})
const claudeProject = decode(Installer.Destination, {
  type: "project", host: "claude_code", home: "/profiles/claude", root: "/workspace/plugin"
})
const codexUser = decode(Installer.Destination, {
  type: "user", host: "codex", home: "/profiles/codex"
})

function target(
  key: string,
  destination: Installer.Destination,
  plugin: string,
  profile: string,
  version: string
): Target {
  return decode(Installer.Target, { key, destination, plugin, profile, version })
}

const claudeTarget = target("installation-key", claudeUser, "team.plugin", "claude-local-marketplace:1", "2.1.304")
const unseenVersionTarget = target("installation-key", claudeUser, "team.plugin", "claude-local-marketplace:1", "99.0.0")

it.skipIf(process.platform !== "linux")("keeps ownership and plan applicability across a client-version change", () => {
  expect(qualifiedTarget(claudeTarget)).toBe(true)
  expect(qualifiedTarget(unseenVersionTarget)).toBe(true)
  expect(sameOwnedTarget(claudeTarget, unseenVersionTarget)).toBe(true)
  expect(sameOwnedTarget(unseenVersionTarget, claudeTarget)).toBe(true)

  expect(sameOwnedTarget(claudeTarget, target(
    "other-installation-key", claudeUser, "team.plugin", "claude-local-marketplace:1", "2.1.304"
  ))).toBe(false)
  expect(sameOwnedTarget(claudeTarget, target(
    "installation-key", decode(Installer.Destination, {
      type: "user", host: "claude_code", home: "/profiles/claude-other"
    }), "team.plugin", "claude-local-marketplace:1", "2.1.304"
  ))).toBe(false)
  expect(sameOwnedTarget(claudeTarget, target(
    "installation-key", claudeProject, "team.plugin", "claude-local-marketplace:1", "2.1.304"
  ))).toBe(false)
  expect(sameOwnedTarget(claudeTarget, target(
    "installation-key", claudeUser, "team.plugin", "claude-local-marketplace:2", "2.1.304"
  ))).toBe(false)
  expect(sameOwnedTarget(claudeTarget, target(
    "installation-key", codexUser, "team.plugin", "codex-local-marketplace:1", "2.1.304"
  ))).toBe(false)
})

const manifestPath = (format: Format): string => Match.value(format).pipe(
  Match.when("claude_code", () => ".claude-plugin/plugin.json"),
  Match.when("codex", () => ".codex-plugin/plugin.json"),
  Match.exhaustive
)

function currentBundle(format: Format): Bundle {
  const plugin = "profile-fixture"
  const body = decode(Schema.toType(BundleBody), {
    schema: 1,
    plugin,
    format,
    files: [{
      path: manifestPath(format),
      content: new TextEncoder().encode(JSON.stringify({ name: plugin, version: "1.0.0", description: "Profile test" })),
      executable: false
    }]
  })
  return decode(Schema.toType(BundleSchema), { ...body, digest: bundleDigest(body) })
}

it.skipIf(process.platform !== "linux")("qualifies a strictly validated bundle against the current package profile", () => {
  const claudeBundle = currentBundle("claude_code")
  const codexBundle = currentBundle("codex")
  const codexTarget = target("codex-installation-key", codexUser, "profile-fixture", "codex-local-marketplace:1", "99.0.0")

  expect(qualifiedBundle(unseenVersionTarget, claudeBundle)).toBe(true)
  expect(qualifiedBundle(codexTarget, codexBundle)).toBe(true)
  expect(qualifiedBundle(unseenVersionTarget, codexBundle)).toBe(false)
  expect(qualifiedBundle(codexTarget, claudeBundle)).toBe(false)
})
