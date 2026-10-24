# Windows writer observation acceptance

The private [writer observer](../../src/installer/windows/process/writers.ts) and `WindowsExecution.completion` pass four isolated native trials on Windows 10.0.26200 x64, Node 24.18.0 and Koffi 3.3.3. A separate observer process runs the product implementation against root and detached-child identities. Independent retained handles bracket its requests. This accepts the completion component for these cases; transaction recovery and Windows installation remain unqualified.

## Contract and pure checks

The [recovery design](windows-writer-recovery-design.md) selects one completion operation over the retained writer ledger. Callers supply an installation key for errors and exact writer identities. Native lookup, identity binding, process waits and handle release stay inside that operation.

All Z1-Z16 [proof certificates](../../spec/PluginSdk/Installer/Writers/Proofs.lean) pass the scoped exact-type and axiom audit. The strict wire passes 72 authored cases, 8,940 malformed requests and eight JavaScript numeric equivalents. Eight TypeScript tests compare the model with Lean on those vectors, 7,240 generated protocol requests and 279 generated observation requests, including input immutability. Pure conformance passed before the native implementation was edited. Scoped TypeScript checking, Effect diagnostics and Oxlint pass; diagnostics report no errors, warnings or messages across six checked files.

## Native results

| Check | Observed result |
| --- | --- |
| Active writers | Every positive request preserved the original identity and reported active while both independent process handles remained unsignalled. |
| Termination in progress | Two trials closed the last containment-job handle; two requested job termination. Every trial captured an unsignalled request after termination began. Completion remained active until the independent handles signalled. |
| Terminated objects still held open | Fresh lookups reopened both original objects, verified PID and creation time and obtained signalled waits. Product completion returned complete. |
| Last process handles closed | All 80 raw target lookups returned null with error 87. The product returned complete for all 40 two-writer requests. The harness records this result without requiring PID disappearance or forbidding reuse. |
| Changed creation identity | Supplying the same PID with a different creation token returned complete for that supplied identity. Original handles pinned the actual generations during the held phases. This checks generation comparison; it does not demonstrate actual OS PID recycling. |
| Access denied | The read-only PID-four control returned error 5. Its product observation and completion stayed unknown in all 56 requests. |
| Duplicate and mixed ledgers | An active original writer took precedence. Once originals terminated, a duplicate identity or an inaccessible member kept completion unknown. An empty ledger completed. |
| Handle lifetime and cleanup | Process-handle counts were unchanged around all 56 groups of product calls. All eight target handles and four observer handles signalled before release. The outer process exited zero, collected its output and closed its containment job. The owned Windows stage was removed. |

The implementation uses fixed query and synchronization rights, disables handle inheritance and accepts only positive retained PIDs. A failed open supplies missing evidence only for error 87. Other open failures remain unavailable. A successful open supplies its actual identity and a process-handle wait; exit codes, job accounting and process enumeration do not supply completion. Effect acquisition and release pair every opened handle with its close, including failed use and interruption.

The error-87 interpretation follows the pinned Microsoft `dotnet/runtime` lookup branch and the preceding four diagnostic trials. The Win32 reference does not document a general stale-PID error mapping. This is a qualified implementation decision for the private component, with its source evidence and limits recorded in the [design](windows-writer-recovery-design.md).

Receipts, the pinned Microsoft source, reviewed harnesses and source hashes are under `.audit/probes/windows-recovery-witness/`. `diagnostic/` preserves the original premise probe. `product-observation.json`, `product-wrapper.json`, `product-staged-files.json` and `acceptance.json` record the product check. The staged production sources matched the checkout hashes when accepted. The raw harness keeps `nativeAdapterQualified: false`; accepting this component does not qualify the full Installer adapter.

## Remaining work

The subsequent [retained-ledger acceptance](windows-ledger-integration-acceptance.md) connects the witness to complete pending records and checks controller death at creation, retention and continuation. It also interrupts a synthetic metadata write under the production lock. The later [publication checks](windows-owner-publication-acceptance.md) qualify nine initial owner-publication boundaries with fresh-process recovery. Full engine inspection and settlement, other metadata boundaries, Windows filesystem qualification, separate descendant debugging chains and complete SDK client lifecycle acceptance remain required. These process tests do not simulate power loss. macOS remains unsupported because no native host is available. CI, package-consumer and release-wide checks remain deferred.
