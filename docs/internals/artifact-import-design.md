# Import a pinned release

## Outcome and traced constraints

A central plugin team should package existing build outputs, publish that artifact through its existing infrastructure, review the resulting release metadata, then import it into ReleaseCatalog. Import must verify the exact approved artifact before retaining any package. Authors keep the same JSON definition and build command.

The compiler already returns complete validated bundles. The catalog's `captureRelease` privately copies them and applies native validation plus E1-E4; `admit` runs C1-C4 under a writer lock and atomically retains metadata and complete bytes. `acquire` validates retained state and applies C5-C6 to select the exact native format. The catalog CLI packages existing build outputs and owns the complete import flow.

ReleaseOrigin already distinguishes a pinned repository reference from an artifact location and SHA-256 digest. An artifact import can use that existing identity without claiming that an opaque URL authenticates its publisher. Network acquisition must happen before taking the catalog writer lock. A failed or interrupted acquisition must leave catalog.json unchanged.

## Caller usage and shape

The manager CLI supports:

```sh
pluginsdk catalog init --directory /srv/pluginsdk/catalog
pluginsdk catalog pack claude.bundle.json codex.bundle.json \
  --organization acme --integration internal-app --release approved-1 \
  --location https://artifacts.example.com/internal-app/approved-1.json \
  --out approved-1.artifact.json --json > approved-1.release.json
# Publish approved-1.artifact.json through the existing infrastructure, then review the metadata.
pluginsdk catalog import approved-1.release.json --directory /srv/pluginsdk/catalog
pluginsdk catalog acquire acme internal-app approved-1 --format claude_code_v4 \
  --directory /srv/pluginsdk/catalog --out approved-claude.bundle.json
```

`pack` derives plugin identity, native version, per-format bundle digests and the complete artifact digest from the captured bundles. It writes one versioned JSON archive and prints the release metadata. Bundle order is canonicalized. Managers supply qualified release identity and the location at which their infrastructure will serve those exact bytes. `admit RELEASE --bundle BUNDLE...` also retains existing local packages without HTTP. No extra author setup file is added.

The existing public operations remain. One new operation owns remote acquisition and admission together:

```ts
catalog.import(release: ArtifactRelease): Effect<Admission, CatalogError>
```

ArtifactRelease derives from Release and the existing artifact-origin schema. PackageArchive contains schema version 1 and a nonempty bundle array. [MCP archives](mcp-contract-design.md) use an explicit kind and a complete reviewed contract; plugin archive bytes remain unchanged. The compiler still owns bundle/native validation; the catalog owns the relationship between those bytes and the release. Transport and archive details remain in its implementation.

## Alternatives and synthesis decision

| Candidate | Interface depth and consequences | Decision |
| --- | --- | --- |
| Expose fetch, hash, decode and admission as manager steps | Callers must preserve the verified snapshot and coordinate failures; the same invariant spreads across deployment scripts. | Reject. |
| Replace admission with a new source union | One operation could accept local and remote sources, but it changes the existing admission contract and persisted-entry vocabulary to add one acquisition path. | Reject for this extension. |
| Add import to the owning catalog module | Managers supply an approved artifact-backed release. One operation snapshots metadata, acquires bounded bytes, checks the pin, decodes the archive and applies existing verified admission. | Select. |

The main thread selects import on ReleaseCatalog. A separate source-provider framework would expose a hypothetical seam. The configured Node layer supplies the HTTP implementation internally. Construction remains lazy; existing local admission and acquisition start no network activity. CLI JSON I/O and error presentation are shared with the existing commands.

## LDD and runtime obligations

The pure admission and package-selection policy is unchanged. C1-C6 and E1-E4 are the existing checked contracts; import must feed the same private captured package set into the same admission transition. This does not introduce a replacement policy or a second release ledger. SHA-256, HTTP bytes, strict JSON decoding and interruption remain I/O obligations, as they are for source capture and persisted catalog records. The new schemas precede implementation.

Required local acceptance:

- Package actual compiler output for both clients; verify canonical archive bytes and independently recomputed SHA-256. Reordered bundles produce identical bytes and metadata.
- Import from a local HTTP fixture, reopen the store and acquire complete packages and release metadata. Replay is unchanged; a reused key cannot replace retained content.
- Reject a changed artifact pin before decoding/admitting it. Reject invalid UTF-8, duplicate keys, unknown fields, empty archives, invalid bundles and package mismatch even when their archive digest matches.
- Reject redirects and non-200 responses. Use HTTPS or loopback HTTP only; reject URL credentials, fragments and interpolation. No ambient credentials or automatic redirect forwarding.
- Bound the streamed body to 64 MiB and acquisition to 30 seconds. Release HTTP resources on success, rejection, timeout and caller interruption. Never hold the catalog writer lock while fetching.
- Preserve existing catalog bytes after acquisition or package-validation failure. A storage failure after rename can expose the complete new record before acknowledgement; use the existing immutable replay and inspection rules. Snapshot metadata before the first asynchronous operation; caller mutation cannot select another URL, key or digest.
- Drive the compiled CLI through pack/import/acquire with the existing automation packages; inspect exact output bytes. CLI failures return a failing exit status and write no acquired bundle.

Authenticating publishers, credential integration, repository fetches, workspace distribution and backend RBAC remain separate work. A digest is useful only when the approved metadata comes from the team's trusted review channel. Full CI and release gates stay deferred.

## Local acceptance

The main thread ran six focused suites: 33 tests passed, including nine artifact-runtime checks and two manager-CLI checks. The runtime tests use independently encoded and hash-pinned compiler packages for two integrations, including binary executable content. Actual interruption closes the socket while a separate local admission proceeds; a 64 MiB+1 streamed body rejects, and a stalled acquisition reaches the real 30-second timeout. Typecheck, Effect diagnostics over 93 files, focused lint and the source build pass. The unchanged pure-policy audit checks all 87 properties; package-binding wire checks pass 23 independent vectors, 23 permutations and 31 malformed requests.

A separate main-thread probe drives the compiled CLI with both authored ten-file automation bundles. The canonical archive is 12,280 bytes with SHA-256 `05fdb252a37d63835189919e76b677a24680bf36865279143e06d27215ee8a08`, independent of bundle argument order. HTTP import and fresh-process acquisition preserve both complete bundles and release metadata. Replay is unchanged; conflicting provenance, changed remote bytes and redirects fail without changing catalog.json. The redirect target receives no request, and the fixture receives no Authorization or Cookie header. All owned probe resources are removed.

These are local HTTP and storage checks. They do not qualify a publisher account, credentials, production infrastructure or a native client rollout. [Acceptance](acceptance.md) retains the broader limits.

## Progress

- [x] Ground: trace source validation, private catalog capture, admission, selection and CLI I/O.
- [x] Sketch: compare exposed acquisition, source-union replacement and catalog-owned import.
- [x] Agree: the active milestone instruction authorizes this extension.
- [x] Implement: network acquisition, CLI management and focused acceptance.
- [x] Scrap review: acquisition and snapshot ownership remain inside the catalog; managers supply approved release metadata rather than coordinating transport steps.
