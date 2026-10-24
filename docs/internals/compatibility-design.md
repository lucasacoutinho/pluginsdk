# Native contract selection and ownership

Installer selects the documented adapter contract by host, platform, scope, package format and required capabilities. PluginSDK has not launched; no existing installations require migration. The [consolidation design](prelaunch-consolidation.md) supersedes the development-generation and exact-version policies.

## Selected boundary

Callers use `Installer.plan/apply`, directly or through Distribution. They supply no version range, compatibility override, profile registry or migration callback. Compiler owns package meaning and derives its required capabilities from validated native contents. Installer owns platform prerequisites, physical target resolution and native inspection.

Each schema-defined `NativeProfile` contains `host`, `platform`, `scope`, `revision`, one `format` and its `capabilities`. Selection requires an exact host/platform/scope match, the requested format when present, and support for every required capability. Only one eligible occurrence may select. No match or multiple matches block; duplicate identical rows remain ambiguous. Record order carries no precedence.

The current profile list covers Claude Code and Codex on Linux and Windows in user/project scopes with stdio, hooks and agents. Cursor has a Windows x64 user adapter using the Claude package with stdio support. Hooks and agents reject for Cursor. Native runtime checks apply only to validated packaged processes.

The observed client version stays in `Target` as diagnostic evidence. It does not select a profile. Runtime minimums and actual platform constraints remain admission requirements. Exact app binaries and hashes belong in native qualification receipts.

## Ownership and reviewed plans

Ownership requires unique registrations for the retained and current profile identities and equality of host, platform, scope and adapter revision. Installer additionally requires the same physical key, canonical destination and plugin identity. `sameOwnedTarget` excludes only the diagnostic version field from the target comparison.

An app version change alone therefore neither abandons an owned package nor stales a review. Changes to the physical target, installed bytes, reviewed configuration, adapter or required capabilities still reject. Apply resolves and checks the target before and after acquiring its locks.

Stored markers and retained plans must still bind one another exactly, including their original target and commitments. Complete staged/loaded bytes, native metadata, fingerprints and receipts remain prerequisites. Excluding the currently observed version does not relax stored-record integrity.

Pending operations retain their original identity and journal. A changed app version grants no permission to repeat an uncertain native mutation. Replay, settlement and explicit repair retain their existing lifecycle rules.

## Pure obligations

| ID | Claim |
| --- | --- |
| N1 | A selected profile is the sole eligible occurrence. |
| N2 | A sole eligible occurrence selects. |
| N3 | No match and ambiguity produce exactly their blocking result. |
| N4 | Profile ordering cannot change selection. |
| N5 | Ownership reuse holds exactly for uniquely registered identities in the same adapter contract. |
| N6 | Changes to host, platform, scope or revision prevent ownership reuse. |
| N8 | Profile ordering cannot change ownership reuse. |
| N9 | Selection preserves every required capability. |
| N10 | A profile selected under stronger requirements was a candidate under weaker requirements. |

The prelaunch N7 exact-version theorem is retired because profile identity contains no version. Its number is not reused.

The [Lean properties](../../spec/PluginSdk/Compatibility/Properties.lean), [model](../../spec/PluginSdk/Compatibility/Model.lean), [certificates](../../spec/PluginSdk/Compatibility/Proofs.lean) and strict wire precede the [TypeScript port](../../src/installer/target/compatibility.ts). Authored vectors, generated comparisons and malformed-wire checks cover these claims, including positive selection and duplicate-row refusal. `.audit/probes/prelaunch-consolidation/pure-main-checked.json` records the accepted pure gate; formal refinement of TypeScript remains unproved.

## Runtime evidence

Scoped tests exercise profile projection, one unseen app version, retained ownership, physical/scope/revision isolation, validated-bundle requirements, live launcher prerequisites and temporary preview fixtures. Catalog and Distribution tests exercise their current packages independently.

Fresh native qualification for changed callers remains tracked by the [launch plan](launch-plan.md). Earlier native records preserve their tested binaries and encodings; they do not establish current package acceptance. CI, package-consumer and full release gates remain deferred.
