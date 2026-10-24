# Windows physical package claims

The private [claim functions](../../src/installer/local/claims.ts) bind an SDK allocation's physical root to a validated retained plan and bundle. Records stay outside the package tree, under the installation's private storage. Moving a directory preserves its claim; a separate directory with identical bytes remains unclaimed.

`readLocalApproval` reads the record and retained ready plan strictly, validates commitments and package contents, checks target ownership and format qualification, derives descriptors from bundle bytes, then applies the [proved binder](local-package-claims.md#physical-approval-binding). Missing records return null. Malformed, missing, conflicting or incompatible retained evidence returns StateUnavailable.

`retainLocalApproval` requires a complete captured tree before writing. It refuses a different record for the same physical root, retains the immutable plan before a new claim, and leaves both stored files unchanged on identical replay. The caller owns the installation lease, fresh capture, allocation and prior-writer checks. These remain private Installer functions.

## Acceptance

LA1–LA5, the strict oracle and all 2,935 TypeScript comparisons precede I/O implementation. Seven local persistence test groups then pass with actual compiler bundles and explicitly supplied tree fixtures. They cover reopening, replay bytes and file stamps, refused writes, immutable conflicts, malformed state, corrupt plan and bundle commitments, and owner/root/target binding. Scoped TypeScript, Effect diagnostics and lint have no errors, warnings or messages.

Fourteen Windows cases use the unchanged seven-file `cursor-ui-lifecycle` Claude portable package from an ordinary CLI build. The native package reader supplies all seventeen trees. The cases verify:

- Missing records cause no writes. Complete approval survives reopening, and replay preserves claim and plan bytes, file IDs and modification stamps.
- The qualified directory mover preserves the approved physical root at a new path. A different allocation remains unclaimed.
- Partial or foreign trees and conflicting claims cannot create or replace approved state. Malformed records, missing/corrupt/mismatched plans, incompatible targets and unqualified formats are refused.
- Content drift after approval preserves the original descriptors and classifies foreign on fresh capture.

Six bindings from actual persisted records agree with the Lean oracle. Nine expected operations return StateUnavailable. The native run uses Windows `10.0.26200`, x64, Node `24.18.0`, Koffi `3.3.3` and the already qualified filesystem extension dependency. It holds the existing installation leases for mutation cases. The fixture supplies a trusted qualified target; it does not replace normal Installer target resolution.

## Resources and limits

All 257 injected package-reader/mover API handles close. Node filesystem and lease internals are outside that count. The native process exits successfully and its owning Windows job has no surviving descendants. All 155 runtime files and fifteen pre-corruption originals are retained and compared before the accepted temporary root is removed.

The private evidence is `.audit/probes/cursor-physical-claims/attempt-002/`. Attempt 001 exposes a probe inventory error: reading the held lease file fails with EBUSY. The corrected probe compares that file's metadata during the lease and checks its full bytes after release. Its failed job closes cleanly and its root remains protected. Product code and the pinned bundle are unchanged between attempts.

This qualifies the claim component. Allocation interruption, the LocalSlot interpreter, actual Cursor SDK install/update/remove and recovery remain separate gates. The public Cursor profile is still disabled. macOS, provider authentication and release-wide work retain their existing deferrals.
