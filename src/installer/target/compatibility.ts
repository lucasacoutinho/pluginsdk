import { Schema, Struct } from "effect"
import * as Compatibility from "../../../contracts/Compatibility.ts"

const equivalentIdentity = Schema.toEquivalence(Compatibility.ProfileIdentity)
const equivalentTarget = Schema.toEquivalence(Schema.Struct(
  Struct.omit(Compatibility.ProfileQuery.fields, ["format", "requirements"])
))

function eligible(profile: Compatibility.NativeProfile, query: Compatibility.ProfileQuery): boolean {
  return equivalentTarget(profile, query) &&
    (query.format === null || profile.format === query.format) &&
    query.requirements.every((requirement) => profile.capabilities.includes(requirement))
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
    equivalentIdentity(current, retained)
}
