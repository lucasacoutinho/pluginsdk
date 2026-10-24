# Windows local package observation

The private Windows package reader can observe a package below a retained root and distinguish a missing component from a refused read. The [lifecycle projection](../../src/installer/local/observation.ts) combines live, staged and retired observations. Any remaining staged or retired state prevents Installer settlement from reporting completion.

## Observation contract

The [Effect schema](../../contracts/LocalObservation.ts) supplies an installation owner and three LocalSlot observations. Clear auxiliary roles allow an absent live package to project absent. A complete live claim for that owner preserves its exact identity and basis. Foreign, partial or differently owned live content projects present without an owned identity. Unknown live state remains unknown.

LO1–LO6 are stated over an arbitrary interface and [proved in Lean](../../spec/PluginSdk/Installer/LocalObservation/Proofs.lean). LO6 connects active auxiliary roles to the existing lifecycle model: settlement preserves the pending journal as uncertain. Main checks each theorem's exact type and standard axiom set. The registry contains 365 properties; the combined release gate remains deferred.

The strict oracle passes 29 reviewed vectors and rejects twenty malformed requests before TypeScript implementation. Four [conformance tests](../../test/local-observation.test.ts) then pass 4,077 comparisons, including 3,024 calls to the existing settlement model. Both wire boundaries reject all twenty malformed requests. Scoped TypeScript, Effect diagnostics and lint pass.

## Rooted Windows reads

`WindowsPackageReader.observe(root, path)` validates the full relative path before lookup, retains every existing parent, admits each immediate child and verifies parent anchors after capture. Only immediate-child error 2 means absent. Errors 3 and 5 remain typed failures. Files and junctions in the directory chain are refused. Existing package capture supplies physical identity, directories, content digests and the metadata-sensitive basis.

Seventeen isolated Windows cases use the unchanged seven-file CLI-built `cursor-ui-lifecycle` package. They cover missing first, middle and final components; repeated and sibling package reads; file parents; three junction positions; directory and file named streams; retained-parent rename refusal; changed parent information; reserved suffixes; staged publication; and native lookup errors.

Nine trees and seven absent observations are captured. Ten expected reads return `WindowsReadUnavailable`. Repeated rooted reads match an independent absolute read. Renaming a retained parent fails during capture and succeeds after handles close. The changed-parent case injects a flag into an actual native result; it does not claim a physical metadata change.

The staged-publication case holds the existing installation lease, approves an actual allocation and moves it through the private roles. Its two projection results and two settlement results agree with the Lean executable. Probe code drives those moves; production Installer execution remains a separate gate.

## Resources and limits

All 269 tracked native API handles close. Node filesystem and lease internals are outside that count. Node 24.18.0 exits successfully on Windows `10.0.26200` x64, and its owning job has no surviving descendants. All 84 runtime files and both authored named streams are retained. Independent native stream reads and a fresh inventory pass before removal of the accepted temporary root.

Private evidence is under `.audit/probes/cursor-local-observation/attempt-001/`. Eight existing metadata and directory-move tests also pass. The LocalSlot interpreter, explicit local recovery, actual Cursor SDK lifecycle and public Cursor admission remain open. macOS, authentication and release-wide work retain their existing deferrals.
