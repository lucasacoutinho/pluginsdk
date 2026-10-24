import { Match, Schema, Struct } from "effect"
import type { Format } from "../../../contracts/Compiler.ts"
import { AdapterRevision, NativeProfile, ProfileIdentity, RuntimePlatform, RuntimeVersion } from "../../../contracts/Compatibility.ts"
import { Target } from "../../../contracts/Installer.ts"
import { nativeOwnershipCompatible, selectNativeProfile } from "./compatibility.ts"

const claudeBasic = ["claude_code_v1", "claude_code_v2"]
const codexBasic = ["agent_plugins_v1", "agent_plugins_v2"]

export const nativeProfiles = Schema.decodeUnknownSync(Schema.Array(NativeProfile))([
  { host: "claude_code", platform: "linux", version: "2.1.303", scope: "user", revision: "claude-local-marketplace:1", formats: claudeBasic },
  { host: "claude_code", platform: "linux", version: "2.1.303", scope: "project", revision: "claude-local-marketplace:1", formats: claudeBasic },
  { host: "claude_code", platform: "linux", version: "2.1.304", scope: "user", revision: "claude-local-marketplace:1", formats: [...claudeBasic, "claude_code_v3", "claude_code_v4", "claude_code_v5", "claude_code_portable_v1", "claude_code_portable_v2"] },
  { host: "claude_code", platform: "linux", version: "2.1.304", scope: "project", revision: "claude-local-marketplace:1", formats: [...claudeBasic, "claude_code_portable_v2", "claude_code_portable_v1"] },
  { host: "codex", platform: "linux", version: "0.162.1", scope: "user", revision: "codex-local-marketplace:1", formats: codexBasic },
  { host: "codex", platform: "linux", version: "0.163.0", scope: "user", revision: "codex-local-marketplace:1", formats: [...codexBasic, "agent_plugins_v3", "codex_plugin_v1", "codex_plugin_v2", "codex_plugin_portable_v1", "codex_plugin_portable_v2"] },
  { host: "codex", platform: "linux", version: "0.163.0", scope: "project", revision: "codex-project-cache:1", formats: [...codexBasic, "codex_plugin_portable_v1", "codex_plugin_portable_v2"] },
  { host: "codex", platform: "win32", version: "0.163.0", scope: "project", revision: "codex-project-cache:1", formats: ["agent_plugins_v2", "codex_plugin_portable_v1", "codex_plugin_portable_v2"] },
  { host: "codex", platform: "win32", version: "0.163.0", scope: "user", revision: "codex-local-marketplace:1", formats: ["agent_plugins_v2", "codex_plugin_portable_v1", "codex_plugin_portable_v2"] },
  { host: "claude_code", platform: "win32", version: "2.1.304", scope: "user", revision: "claude-local-marketplace:1", formats: ["claude_code_v2", "claude_code_portable_v1", "claude_code_portable_v2"] },
  { host: "claude_code", platform: "win32", version: "2.1.304", scope: "project", revision: "claude-local-marketplace:1", formats: ["claude_code_v2", "claude_code_portable_v1", "claude_code_portable_v2"] },
  { host: "cursor", platform: "win32", version: "3.26.16+8fcb8ace5c73fa31f2e2707fd6783160e4ed3e40", scope: "user", revision: "cursor-local-directory:1", formats: ["claude_code_v2", "claude_code_portable_v1"] }
])

const sameSubject = Schema.toEquivalence(Schema.Struct(Struct.omit(Target.fields, ["version"])))
const profileIdentity = (target: Target): ProfileIdentity => ({
  host: target.destination.host,
  platform: RuntimePlatform.make(process.platform),
  version: RuntimeVersion.make(target.version),
  scope: target.destination.type,
  revision: AdapterRevision.make(target.profile)
})

export const qualifiedTarget = (target: Target): boolean => {
  const identity = profileIdentity(target)
  return nativeOwnershipCompatible({ current: identity, retained: identity, profiles: nativeProfiles })
}

export const sameOwnedTarget = (current: Target, retained: Target): boolean =>
  sameSubject(current, retained) && nativeOwnershipCompatible({
    current: profileIdentity(current), retained: profileIdentity(retained), profiles: nativeProfiles
  })

export const qualifiedFormat = (target: Target, format: Format): boolean => {
  const identity = profileIdentity(target)
  return Match.value(selectNativeProfile({
    query: { host: identity.host, platform: identity.platform, version: identity.version, scope: identity.scope, format },
    profiles: nativeProfiles
  })).pipe(Match.discriminatorsExhaustive("type")({
    selected: ({ profile }) => profile.revision === identity.revision,
    blocked: () => false
  }))
}
