import { Schema, Struct } from "effect"
import * as Compatibility from "../../../contracts/Compatibility.ts"

const equivalentIdentity = Schema.toEquivalence(Compatibility.ProfileIdentity)
const equivalentQuery = Schema.toEquivalence(Schema.Struct(Struct.omit(Compatibility.ProfileQuery.fields, ["format"])))

function eligible(profile: Compatibility.NativeProfile, query: Compatibility.ProfileQuery): boolean {
  return equivalentQuery(profile, query) &&
    (query.format === null || profile.formats.includes(query.format))
}

export function selectNativeProfile(input: Compatibility.SelectionInput): Compatibility.Selection {
  const candidates = input.profiles.filter((profile) => eligible(profile, input.query))
  const [profile, second] = candidates
  if (profile === undefined) return { type: "blocked", reason: "unqualified" }
  return second === undefined
    ? { type: "selected", profile }
    : { type: "blocked", reason: "ambiguous" }
}

function hasUniqueRegistration(
  profiles: ReadonlyArray<Compatibility.NativeProfile>,
  identity: Compatibility.ProfileIdentity
): boolean {
  return profiles.filter((profile) => equivalentIdentity(profile, identity)).length === 1
}

export function nativeOwnershipCompatible(input: Compatibility.OwnershipInput): boolean {
  const { current, retained, profiles } = input
  return hasUniqueRegistration(profiles, current) &&
    hasUniqueRegistration(profiles, retained) &&
    current.host === retained.host &&
    current.platform === retained.platform &&
    current.scope === retained.scope &&
    current.revision === retained.revision
}
