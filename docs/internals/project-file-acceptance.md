# Project-file policy and native I/O acceptance

The project-file module keeps the installer's two operations, `readProjectFile` and `replaceProjectFile`, and hides the platform backend. Linux retains its original file-basis wire form. Windows records the content digest, admitted attributes and a digest of the native DACL descriptor.

This accepts metadata policy and file I/O. The [later Codex project pilot](windows-activation-acceptance.md#codex-project-scope) separately accepts the normal v2 lifecycle. Interruption recovery and complete Windows release qualification remain open. Production Windows profiles are disabled. No macOS host is available, so native macOS qualification is deferred.

## Formal contract

[PF1-PF7](../../spec/PluginSdk/Installer/ProjectFile/Properties.lean) require exact Linux metadata, exact admitted Windows metadata, refusal of unsupported platforms and foreign representations, exact reviewed-basis agreement, preservation of admission refusals and rejection of metadata drift. The [model](../../spec/PluginSdk/Installer/ProjectFile/Model.lean), [proofs](../../spec/PluginSdk/Installer/ProjectFile/Proofs.lean) and [wire](../../spec/PluginSdk/Installer/ProjectFile/Wire.lean) are separate.

Seven exact-type checks and the scoped axiom audit pass with only Lean's standard axioms. The oracle passes 53 independently authored vectors before the TypeScript port. Five [policy tests](../../test/project-file-policy.test.ts) pass 4,108 generated comparisons, the authored vectors, old Linux wire retention and 28 malformed-wire pairs. Pure acceptance was sealed before any file I/O changes.

The TypeScript policy derives its unions and equivalence from Effect schemas and uses exhaustive `Match`. Native metadata and publication remain I/O obligations; the Lean properties do not prove Windows syscalls.

## Filesystem evidence

| Scope | Accepted behavior |
| --- | --- |
| Linux file module | Eight existing file tests pass after extraction into a private backend. |
| Linux Codex project | Five isolated native lifecycle cases pass, including install, replacement, stale review, replay, removal and scope/drift controls. |
| Windows file module | The real reader/writer probe passes creation and replacement, BOM and Unicode preservation, the observed archive attribute, inherited and protected DACLs, and preservation of a foreign sibling. |
| Windows refusals | A stale review, a file appearing after an absent capture, a read-only file and an additional stream are refused. Newer/default/stream bytes remain intact; restoring attributes or removing the owned stream restores admissibility. |

The final Windows run contains 39 recorded steps, including six expected refusals. It uses Windows x64, Node 24.18.0 and Koffi 3.3.3. It calls the exported reader and writer through Effect and NodeServices, without syscall substitutions. The protected fixture has one explicit current-user full-control rule; no identities or security descriptor bytes are recorded. Other admitted attribute combinations remain unmeasured.

Two native failures refined the implementation:

1. A directory-relative rename with a non-null `RootDirectory` returned error 87. The accepted call uses the full Volume GUID destination while retaining the source and physical ancestor handles.
2. `CreateFileW` preserved inherited DACL entries but cleared `SE_DACL_AUTO_INHERITED`. Applying the DACL by handle restored the complete descriptor. Replacement still requires its exact digest before the first content write and checks it again before and after publication.

The [implementation design](project-file-native-design.md) records the selected native operations and their limits. SDK locks serialize SDK writers; these checks do not provide destination compare-and-swap or a power-loss guarantee. File I/O acceptance also does not qualify process interruption, every attribute/security component or complete Codex loading.

## Evidence and cleanup

The local acceptance seal is `.audit/probes/windows-project-config/acceptance.json`. It binds the pure acceptance, source candidates, failed observations, corrected native observations, scoped static checks and cleanup receipts. `.audit` is ignored by Git; those raw receipts are local evidence, while the contracts, Lean files, tests and this record are reviewable repository files.

The accepted Windows run is `windows-project-file-dacl/native-file-dacl`. Its independent validation checks all 5,048 immutable staged files, the complete before/after inventories and the unchanged 5,786-file original activation root. Only three fixture files are added. The native job reports assignment before execution, root exit, zero remaining members and successful closure. The 5,051-file scratch root is removed after that validation and a fresh exact inventory.

The earlier failed candidates and the permission premise retain their original sources and observations. Their separate scratch roots are also removed after independent validation. The original activation root remains available for the next client lifecycle probe.

Scoped typechecking, strict Effect diagnostics and lint pass. The combined proof gate, CI and package/release checks remain deferred at the user's request.
