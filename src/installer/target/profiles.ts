import { Match, Schema, Struct } from "effect"
import { BundleRejected, type Bundle, type Capability } from "../../../contracts/Compiler.ts"
import { AdapterRevision, NativeProfile, ProfileIdentity, RuntimePlatform } from "../../../contracts/Compatibility.ts"
import { Target } from "../../../contracts/Installer.ts"
import { validateBundle } from "../../compiler/package/native.ts"
import { nativeOwnershipCompatible, selectNativeProfile } from "./compatibility.ts"

const capabilities: ReadonlyArray<Capability> = ["stdio", "hooks", "agents"]

export const nativeProfiles = Schema.decodeSync(Schema.Array(NativeProfile))([
  { host: "claude_code", platform: "linux", scope: "user", revision: "claude-local-marketplace:1", format: "claude_code", capabilities },
  { host: "claude_code", platform: "linux", scope: "project", revision: "claude-local-marketplace:1", format: "claude_code", capabilities },
  { host: "claude_code", platform: "win32", scope: "user", revision: "claude-local-marketplace:1", format: "claude_code", capabilities },
  { host: "claude_code", platform: "win32", scope: "project", revision: "claude-local-marketplace:1", format: "claude_code", capabilities },
  { host: "codex", platform: "linux", scope: "user", revision: "codex-local-marketplace:1", format: "codex", capabilities },
  { host: "codex", platform: "linux", scope: "project", revision: "codex-project-cache:1", format: "codex", capabilities },
  { host: "codex", platform: "win32", scope: "user", revision: "codex-local-marketplace:1", format: "codex", capabilities },
  { host: "codex", platform: "win32", scope: "project", revision: "codex-project-cache:1", format: "codex", capabilities },
  { host: "cursor", platform: "win32", scope: "user", revision: "cursor-local-directory:1", format: "claude_code", capabilities: ["stdio"] }
], { onExcessProperty: "error" })

const sameSubject = Schema.toEquivalence(Schema.Struct(Struct.omit(Target.fields, ["version"])))
const profileIdentity = (target: Target): ProfileIdentity => ({
  host: target.destination.host,
  platform: RuntimePlatform.make(process.platform),
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

export const qualifiedBundle = (target: Target, bundle: Bundle): boolean => {
  const identity = profileIdentity(target)
  let requirements: ReadonlyArray<Capability>
  try {
    requirements = validateBundle(bundle).requirements
  } catch (cause) {
    if (cause instanceof BundleRejected) return false
    throw cause
  }
  return Match.value(selectNativeProfile({
    query: { host: identity.host, platform: identity.platform, scope: identity.scope, format: bundle.format, requirements },
    profiles: nativeProfiles
  })).pipe(Match.discriminatorsExhaustive("type")({
    selected: ({ profile }) => profile.revision === identity.revision,
    blocked: () => false
  }))
}
