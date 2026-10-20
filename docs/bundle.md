# Bundle acceptance

`Installer.plan` accepts packages built earlier or decoded from storage. Decoding `Bundle` establishes its shape: it does not establish its digest, file ordering, path uniqueness, or native document validity. The installer must reject an invalid imported package before inspecting or changing a host.

The caller still uses the existing interface:

```ts
import { Installer } from "../contracts/Installer.ts"
import type { PlanRequest } from "../contracts/Installer.ts"

declare const request: PlanRequest

const preview = Installer.use((installer) => installer.plan(request))
```

The effect can fail with `BundleRejected`. The caller does not invoke a separate verification method.

## Interface decision

| Candidate | Consequence |
| --- | --- |
| Add `Compiler.verify` returning an immutable validated handle | Can retain a private snapshot, but adds a public handle and another operation before planning. Importing serialized data must recover validation. |
| Validate a private package snapshot inside `Compiler` and `Installer` | Keeps package rules with the compiler and makes planning own admission. Callers continue to build, plan, and apply. |

The design selects internal validation. Planning already owns imported artifacts, saved plans, and recovery, so it also owns their admission. The package rules are reused inside the implementation; no new public module or operation is added. `Compiler.build` must satisfy those rules before returning. `Installer.plan` validates imported packages and adds `BundleRejected` to its error channel. Invalid content inside an applied saved plan remains `PlanRejected` with `invalid_plan`.

## Snapshot and commitment

When their effects run, both `plan` and `apply` first capture a private copy of all caller-owned data, including every file byte array. They finish that copy before their first asynchronous suspension. Hashing, native validation, plan persistence, and eventual native staging consume that same private snapshot. The implementation must not retain aliases to the caller's mutable buffers.

The package digest is recomputed from the exact encoded `BundleBody` defined in [identity encoding](identity.md). The check excludes the claimed digest field and includes plugin identity, format, paths, bytes, and executable bits. Planning never repairs or sorts an imported package: changing its committed contents requires a new bundle and digest.

File paths must already be in strict unsigned UTF-8 order and must have no ASCII case aliases or file/descendant conflicts. Collision detection reuses the renderer's policy, including conflicts that are not adjacent after sorting. Equal content does not make duplicate paths valid.

The compiler's pinned native-format validation also checks the byte-complete package. A matching digest alone does not establish that a manifest is present, that its plugin identity agrees with the bundle, or that its documents satisfy the format. These checks do not establish native installation or session discovery.

| Issue | Meaning |
| --- | --- |
| `digest_mismatch` | The claimed bundle digest differs from the recomputed digest. |
| `noncanonical_order` | The committed file sequence is not strictly ordered by UTF-8 path bytes. |
| `path_collision` | Two committed file paths alias or conflict as file and descendant. The path is the shorter folded key. |
| `invalid_native_package` | Native package validation failed; `detail` describes the failure. |

All independent envelope issues are returned, deduplicated and sorted by tag, then collision path. Native validation failures use the same `BundleRejected` error. Package failures do not become `StateUnavailable` or `HostUnavailable`.

## Formal contract

[CompilerModel.ts](../contracts/CompilerModel.ts) exposes the internal pure `checkBundle` implementation. Its input is a projection of the private package snapshot:

- `digest`: the claimed bundle digest;
- `computed`: the digest recomputed over that snapshot's encoded body;
- `paths`: the complete nonempty file sequence in its committed order.

Its result is `valid` or `rejected` with envelope issues. Native document validation stays with the byte-complete compiler checks and can report `invalid_native_package`; the pure checker cannot produce that issue.

The [Lean properties](../spec/PluginSdk/Compiler/Bundle/Properties.lean) have checked [proofs](../spec/PluginSdk/Compiler/Bundle/Proofs.lean) against the concrete [model](../spec/PluginSdk/Compiler/Bundle/Model.lean):

| ID | Obligation |
| --- | --- |
| V1 | Accepted input has equal claimed and computed digests. |
| V2 | Accepted paths have canonical order and no conflicts. |
| V3 | Every required issue is reported, every reported issue is real, and issues have canonical order without duplicates. |
| V4 | Input satisfying the digest and path rules is accepted. |

These properties compare digest identities. They do not prove SHA-256, canonical JSON encoding, Base64 encoding, or the accuracy of the `computed` projection. The implementation must compute that value from the same captured bytes it validates and persists. Snapshot isolation and native document validation need separate implementation checks.

The `check_bundle` oracle command uses the version 1 envelope with that input projection and result. Its 15 [example frames](examples/bundle.ndjson) agree with the [generated vectors](../spec/vectors/bundle.ndjson). The proof gate rejects 36 malformed requests and checks 1,638 digest/path combinations against independent expectations. TypeScript conformance compares those combinations with the actual oracle. Compiler and boundary tests independently check digest preimages, byte snapshots including shared buffers, and native document rejection.
