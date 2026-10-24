# Production Windows payload reading

The native [root owner](windows-root-session-acceptance.md), [tree observations](windows-tree-read-acceptance.md), [read admission](windows-file-read-acceptance.md), [executable intent](windows-executable-intent-acceptance.md) and [capacity boundary](windows-capacity-owner-acceptance.md) are qualified components. Production payload inspection still refuses Windows before reading. This change connects those operations to the existing payload comparison, without enabling an installation profile.

## Grounding and ownership

Ordinary inspection validates the retained plan and bundle before `verifyCandidate` reads staged and loaded trees. Project inspection does the same in `verifyProjectRevision`. Both call `readPayload`, which captures native bytes, resolves retained executable intent, compares the complete file array and derives the fingerprint. An unchanged tree uses the existing `native-tree` fingerprint. Unexpected paths, bytes or intent produce a mismatch fingerprint; unavailable native facts fail inspection.

The current filesystem capture inside `readPayload` is a Linux-specific async function. Callers wrap it in another Promise boundary. Windows needs retained handles and complete native directory observations. The qualified prototypes expose raw diagnostics for verification; those diagnostics and handles do not belong in the production payload result.

The existing shape exists to bind bytes to an approved bundle and preserve old fingerprints, as recorded in [executable-intent integration](executable-intent-integration-design.md). That requirement stays in `payload.ts`. Native acquisition and observation belong below it. Compiler source capture selects only declared source paths and has a different link policy; it will reuse the native primitives without scanning every file in an integration repository.

## Usage and alternatives

Callers yield `readPayload(root, retainedFiles)` directly. The operation returns `{ matches, fingerprint }` and a `PayloadUnavailable` error channel, which inspection callers map to `InspectionUnavailable`. It starts no runtime. The Windows backend returns captured bytes and unrepresented native permission observations, after releasing its scope.

| Shape | Decision |
| --- | --- |
| Import the diagnostic JavaScript qualifier or copy its full call log into the SDK | Reject. This exposes raw ownership and keeps qualification-only representations in production. |
| Reimplement Windows traversal inside both inspection callers | Reject. It duplicates root binding, cleanup and the accepted comparison policy. |
| Use a private scoped Windows payload-reader layer beneath the existing comparison | Select. One operation hides native root acquisition, capacity, complete traversal and read admission. Both callers keep one comparison path. |

## Synthesis decision

The production reader has a small service interface: `read(root): Effect<ReadonlyArray<NativeContent>, WindowsReadUnavailable>`. Its live layer binds the shared immutable native API. Its implementation opens one ordinary root without following reparse points, retains handles through each observation, and closes the scope before returning bytes. Raw handles remain in closures. There is no caller-configured capacity or native path representation.

The native primitives are split by owned knowledge: `api.ts` binds and checks the ABI; `observation.ts` decodes handle information and names; `directory.ts` decodes complete enumeration; `owner.ts` owns handle lifetime, admission and byte reading; `payload.ts` coordinates the accepted tree/read models inside an Effect scope. The installer owns retained intent and fingerprint comparison. The module split removes the diagnostic call log and avoids a general filesystem wrapper.

Schemas remain authoritative for captured data and observations. Native outputs are `unknown` until parsed at the ABI boundary. Closed unions use exhaustive Effect Match. No cast, `any`, hidden runtime or raw handle enters the payload result. Query failure refuses instead of fabricating an observation. Release attempts every owned handle and preserves cleanup failures.

## Existing LDD contract

No domain rule changes. WP1-WP14, FileRead V1-V10, TreeRead TR1-TR13 and executable-intent EI1-EI20 already passed their proofs and pure conformance before these I/O edits. Production traversal must consume the actual entry, directory and read observations through those same models. It must preserve exact stored names, observe complete directory membership twice, check every visit and bind bytes to stable file observations.

## Acceptance

Focused Linux tests must preserve exact old fingerprints and mismatch behavior after the Promise-to-Effect migration. Native Windows checks must invoke the actual production layer and `readPayload`, verify complete bytes and retained flags, refuse payload reparse points and aliases, exercise supplementary names and complete-path admission, repeat independent owners, and establish release before the Effect returns. The native API used by that layer may be instrumented by the qualifier to replay actual model inputs and raw buffers; the production result remains captured data.

Source symbolic-link coverage, source capture integration, materialization, activation and full Windows client lifecycle remain separate remaining work. Profiles remain disabled until their required integration and client checks pass. macOS has no host. CI, package-consumer and release-wide checks remain deferred.
