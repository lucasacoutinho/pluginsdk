import { Match, Schema } from "effect"
import { Release, ReleaseKey } from "../../contracts/Catalog.ts"
import type { Registration, ReleaseLedger, ReleaseTarget, Resolution } from "../../contracts/Catalog.ts"

const sameKey = Schema.toEquivalence(ReleaseKey)
const sameRelease = Schema.toEquivalence(Release)

export function register(ledger: ReleaseLedger, release: Release): Registration {
  if (ledger.some((prior) => sameKey(prior.key, release.key) && !sameRelease(prior, release))) return { type: "conflict" }
  if (ledger.some((prior) => sameKey(prior.key, release.key))) return { type: "unchanged" }
  return { type: "registered", ledger: [...ledger, release] }
}

function selectArtifact(release: Release, target: ReleaseTarget): Resolution {
  return Match.value(release.contents).pipe(Match.discriminatorsExhaustive("type")({
    plugin: ({ plugin, packages }) => Match.value(target).pipe(Match.discriminatorsExhaustive("type")({
      plugin: ({ format }): Resolution => {
        const digest = packages[format]
        return digest === undefined ? { type: "blocked", reason: "format_unavailable" } : {
          type: "resolved", release, artifact: { type: "plugin", plugin, format, digest }
        }
      },
      mcp: (): Resolution => ({ type: "blocked", reason: "kind_mismatch" })
    })),
    mcp: ({ service, contract }) => Match.value(target).pipe(Match.discriminatorsExhaustive("type")({
      plugin: (): Resolution => ({ type: "blocked", reason: "kind_mismatch" }),
      mcp: (): Resolution => ({ type: "resolved", release, artifact: { type: "mcp", service, contract } })
    }))
  }))
}

export function resolve(ledger: ReleaseLedger, key: ReleaseKey, target: ReleaseTarget): Resolution {
  const [first, ...rest] = ledger.filter((prior) => sameKey(prior.key, key))
  if (first === undefined) return { type: "blocked", reason: "release_missing" }
  if (!rest.every((prior) => sameRelease(prior, first))) return { type: "blocked", reason: "release_conflict" }
  return selectArtifact(first, target)
}
