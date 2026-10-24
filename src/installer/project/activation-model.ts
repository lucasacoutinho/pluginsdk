import { Match, Schema } from "effect"
import { RoleName } from "../../../contracts/Agents.ts"
import { Directory } from "../../../contracts/Plugin.ts"
import { ConfigFile, Observation } from "../../../contracts/ProjectActivation.ts"
import type { AuthorityInput, AuthorityResult, Binding, BuildInput, BuildResult, Platform } from "../../../contracts/ProjectActivation.ts"
import { compareUtf8 } from "../../internal/paths.ts"

const sameObservation = Schema.toEquivalence(Observation)

function nativePath(platform: Platform, root: string, components: ReadonlyArray<string>): Directory {
  const separator = Match.value(platform).pipe(
    Match.when("linux", () => "/"),
    Match.when("win32", () => "\\"),
    Match.exhaustive
  )
  let end = root.length
  while (end > 0 && root[end - 1] === separator) end -= 1
  return Directory.make(`${root.slice(0, end)}${separator}${components.join(separator)}`)
}

export function buildProjectActivation(input: BuildInput): BuildResult {
  const counts = new Map<BuildInput["agents"][number], number>()
  for (const agent of input.agents) counts.set(agent, (counts.get(agent) ?? 0) + 1)
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([agent]) => agent).toSorted(compareUtf8)
  const [first, ...rest] = duplicates
  if (first !== undefined) return { type: "rejected", duplicates: [first, ...rest] }

  const registration = input.registration
  const directory = nativePath(input.platform, input.home, ["plugins", "cache", registration.marketplace])
  const payload = nativePath(input.platform, directory, [registration.plugin, input.version])
  const agents = input.agents.toSorted(compareUtf8).map((agent): Binding => ({
    name: RoleName.make(`${registration.plugin}:${agent}`),
    configFile: ConfigFile.make(nativePath(input.platform, payload, ["agents", `${agent}.toml`]))
  }))
  return { type: "rendered", cache: { directory, payload }, activation: { registration, agents } }
}

function uniqueBindings(bindings: ReadonlyArray<Binding>): boolean {
  return new Set(bindings.map((binding) => binding.name)).size === bindings.length &&
    new Set(bindings.map((binding) => binding.configFile)).size === bindings.length
}

function managedObservation(binding: Binding): Observation {
  return { type: "declared", source: "managed", declaredName: binding.name,
    name: binding.name, configFile: binding.configFile }
}

export function reviewProjectRoleAuthority(input: AuthorityInput): AuthorityResult {
  if (input.previous.length === 0 && input.desired.length === 0) return { type: "ready" }
  if (!uniqueBindings(input.previous) || !uniqueBindings(input.desired)) {
    return { type: "blocked", reason: "duplicate" }
  }
  const relevant = [...input.previous, ...input.desired]
  const names = new Set(relevant.map((binding) => binding.name))
  const paths = new Set(relevant.map((binding) => binding.configFile))
  const owned: Observation[] = []
  let unknown = false
  let unowned = false
  for (const observation of input.observed) {
    Match.value(observation).pipe(Match.discriminatorsExhaustive("type")({
      unknown: () => { unknown = true },
      discovered: ({ name, path }) => { unowned ||= names.has(name) || paths.has(path) },
      declared: (entry) => Match.value(entry.source).pipe(
        Match.when("managed", () => { owned.push(entry) }),
        Match.when("foreign", () => {
          unowned ||= names.has(entry.declaredName) || names.has(entry.name) ||
            (entry.configFile !== null && paths.has(entry.configFile))
        }),
        Match.exhaustive
      )
    }))
  }
  if (unknown) return { type: "blocked", reason: "unknown" }
  if (unowned) return { type: "blocked", reason: "unowned" }

  const expected = input.previous.map(managedObservation)
  const complete = expected.every((before) => owned.filter((actual) => sameObservation(before, actual)).length === 1)
  const exact = owned.every((actual) => expected.some((before) => sameObservation(before, actual)))
  return complete && exact ? { type: "ready" } : { type: "blocked", reason: "drift" }
}
