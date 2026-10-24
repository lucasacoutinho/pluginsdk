# Local package claims

The package classifier connects an approved physical directory to a complete or partial LocalSlot claim. The Windows reader supplies captured trees, and the private persistence layer validates and stores approvals. The guarded lifecycle projection prevents residual staged or retired packages from settling as complete. The LocalSlot interpreter must still connect these components to Installer execution before enabling Cursor installation.

The [Effect schema](../../contracts/LocalPackage.ts) binds an approval to its installation owner, plan, bundle, physical root identity and nonempty file descriptors. A captured tree contains its root identity, basis, directories and observed file descriptors. The [classifier](../../src/installer/local/package.ts) returns the existing LocalSlot observation.

Absent and unknown observations remain unchanged. Unavailable or changing mode evidence produces unknown. A missing approval or different physical root is foreign. Colliding approved file paths produce unknown. Duplicate captured entries, unexpected directories, missing parents, changed bytes or incorrect executable intent are foreign. A verified proper subset is partial; complete requires every approved file. Both preserve the approved owner and full plan/bundle identity, plus the captured basis.

An empty owned root or approved empty parent directory can be partial. An unrelated empty directory cannot. Directory order and file order do not affect classification. The compiler's collision rules apply to approved files; captured directories use exact uniqueness so ordinary nested directories remain valid.

## Acceptance

LP1–LP11 are stated over an arbitrary classifier interface and proved by the [Lean implementation](../../spec/PluginSdk/Installer/LocalPackage/Proofs.lean). Main independently elaborates all four modules and checks every theorem's exact property type and axiom set against the repository's standard axiom policy. The proof registry now lists 354 properties; the combined release gate remains deferred.

Before TypeScript implementation, the strict oracle passes 46 reviewed vectors and rejects 28 malformed requests. The reused wire decoders also preserve all 41 LocalSlot and 57 executable-intent vectors. Their only source changes expose existing decoder functions within the Lean wire modules.

The [conformance tests](../../test/local-package.test.ts) pass 46 reviewed cases, 5,760 generated combinations and 216 independent file/directory permutations: 6,022 comparisons in total. Both wire boundaries reject 28 malformed requests. All four tests pass. Scoped TypeScript, Effect diagnostics over three files and lint report no warnings or errors.

Private records under `.audit/probes/cursor-local-claims/` retain the proof, oracle, TypeScript start and accepted checks in that order. No product I/O or public host profile changes in this component.

## Windows capture

The [Windows metadata premise](windows-package-metadata-premise.md) establishes the directory/file stream distinction in eight native cases and 18 independently decoded observations. The [package reader](windows-package-reader-acceptance.md) implements that boundary and retains empty directories, root identity, content digests and a metadata-sensitive basis. Its 21 native cases include ordinary and partial packages, foreign contents, hidden streams, junctions and mutations during a read. All 14 captured trees agree with the Lean classifier.

## Physical approval binding

The [physical approval contract](../../contracts/LocalApproval.ts) binds an immutable record to validated retained-plan facts. Both owners, the full plan/bundle identity and the captured physical root must agree. Accepted output preserves the retained descriptor list exactly. LA1–LA5 are [proved in Lean](../../spec/PluginSdk/Installer/LocalApproval/Proofs.lean) and pass independent theorem-type and axiom checks. The strict oracle precedes TypeScript; 19 reviewed examples and 2,916 generated comparisons pass, with 23 malformed requests refused at both boundaries. The registry now lists 359 properties; the combined release gate remains deferred.

This binder assumes that I/O has validated the retained plan and bundle. A record alone cannot supply trusted file descriptors. The [private persistence layer](windows-physical-claims-acceptance.md) now implements those checks and passes fourteen Windows cases over actual captured roots.

## Remaining I/O obligations

The [rooted observation gate](windows-local-observation-acceptance.md) adds LO1–LO6 and 4,077 TypeScript comparisons. Seventeen Windows cases qualify missing-component handling, retained parent checks and guarded settlement. The four native projection and settlement results agree with Lean. All 269 tracked handles close; 84 runtime files and two named streams are retained before accepted-root cleanup.

The LocalSlot interpreter must combine capture, validated claims and directory movement under Installer's existing leases and execution ownership. Root identity does not freeze file contents. Fresh capture, basis checks, prior-writer completion and post-action settlement require their own integration and native evidence.

The selected staging order is a unique private allocation, complete materialization and verification, then durable registration as the staged role. Earlier interrupted allocations stay outside active roles. Verified discard actions move packages into exclusive SDK history outside the client scan path. The step interpreter, normal SDK lifecycle, drift and interruption cases must pass before public Cursor admission. macOS remains deferred without a host.
