# Companion-file policy acceptance

The pure companion-file policy passes its LDD gate. It admits Windows metadata through the existing project-file contract and preserves the Linux requirement for mode `0600`. Native Windows companion reads and mutations remain unqualified.

## Accepted contract

[RF1–RF8](../../spec/PluginSdk/Installer/CompanionFile/Properties.lean) specify platform admission, complete reviewed-basis equality and projection into F1–F8 companion observations. A Windows basis retains the content digest, supported attributes and DACL digest. Additional or unavailable streams refuse admission. The DACL digest does not represent the owner, group or SACL.

[Universal proofs](../../spec/PluginSdk/Installer/CompanionFile/Proofs.lean) pass the exact-type and axiom audit, which now checks 318/318 properties. The strict oracle reuses the existing project-file metadata codecs. Its original 53 authored cases still pass.

Seventy-six independent [expected results](../../spec/vectors/companion-files.ndjson) matched Lean before the TypeScript implementation existed. The original design reference is preserved with its authorship hash. [TypeScript conformance](../../test/companion-file.test.ts) compares those cases and 13,490 generated requests with Lean. Both boundaries reject the 28 frozen malformed wires.

The new suite also checks that an admitted Linux basis requires mode `0600`, while the shared project-file basis still accepts other modes. The three scoped suites pass 13 tests. After a decoder-style correction, the five companion-file tests pass again. Strict TypeScript, Effect diagnostics and scoped lint report no errors or warnings.

## Implementation boundary

[The schema](../../contracts/CompanionFile.ts) derives its types from Effect Schema. [The total model](../../src/installer/companions/file-policy.ts) uses exhaustive Effect Match and reuses project-file admission and schema-derived basis equality. Installer I/O does not call the new model yet. All 179 predecessor production source files retain their bytes, and the compiled runtime, profiles and automatic format selection remain unchanged.

The [storage design](windows-companion-storage-design.md) selects a shared Windows owned-file boundary for project configuration and role files. Native checks must establish stable reads, metadata preservation, publication, reviewed removal and resource closure before integration. Complete Windows hook and agent lifecycles, interruption and repair follow that component gate.

The local record is `.audit/probes/windows-companion-storage/acceptance.json`, with frozen authorship, logs, exact before-images and the predecessor checkpoint. It records pure acceptance only. This gate starts no native client session and does not qualify macOS or promote a profile.
