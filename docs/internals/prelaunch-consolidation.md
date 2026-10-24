# Current package and client contracts

## Outcome and authority

An author keeps one definition and runs `pluginsdk build`, `pluginsdk preview` and `pluginsdk publish`. The compiler emits the current Claude Code and Codex representations. Cursor uses the compatible Claude package. Authors never select a development generation or maintain an SDK wrapper.

Lucas confirmed that PluginSDK has not launched and no installations exist. This explicitly supersedes the earlier requirement to retain prelaunch formats, legacy stores and exact-version qualification. Preserve historical evidence without keeping those representations executable in the product. The [launch plan](launch-plan.md) fixes the completion scope.

## Replaced prelaunch design

Before consolidation, `Project.build` chose among fourteen `Compiler.Format` tags using feature flags. `nativeLocations` lowered them to three base renderers and four process encodings. Compiler capture, rendering and validation branched on those selections. Catalog digest fields repeated the fourteen tags. Distribution selected a compatible family. Installer resolved an exact version/platform/scope/format row before reading native state. Preview had another exact-version identity for imported packages.

The portable implementation already rendered MCP and hooks with one shared runtime and preserved agents. Additional generations retained development history in executable code. Exact binary allowlists could also make a compatible app update block installation and stale a reviewed plan. Physical identity, complete observations, owned bytes, backend authorization and pending-operation quiescence remain actual requirements.

## Compared designs

| Candidate | Contract and consequences | Decision |
| --- | --- | --- |
| Keep legacy identities and add a current alias | Callers see a simple default, but the compiler, catalog, installer and proofs still carry obsolete branches. It preserves the unnecessary compatibility burden. | Reject. |
| One native package identity per package client; requirements from validated contents | `Format` reuses `PackageClient`: `claude_code` or `codex`. Each has one renderer and the current shared process runtime. Installer selects the documented adapter contract by platform/scope and requires support for the actual package contents. | Select. |

The selected design removes public generation selection and internal duplicate execution paths. It preserves the four deep module boundaries. It adds no provider framework, public capability registry or caller-managed compatibility policy.

## Selected interfaces

`Compiler.Format` is the existing schema-defined `PackageClient`. `RenderInput` uses that same two-value schema. Claude emits `.claude-plugin/plugin.json`; Codex emits `.codex-plugin/plugin.json`; both use `.mcp.json` with their own server-field encodings. Assets, the existing hook events and agents use the current implementation. Process packaging always uses the existing shared portable feature renderer. A package without process definitions contains no process runtime.

Delete the feature-to-generation selector and its obsolete contract/proofs/vectors. Choosing the build output is the package-client identity, independent of requested features. Remove the old shell-only materialization and its native-validation alternatives. Pure quoting/evaluation helpers used by current portable sidecars remain useful and stay.

Catalog package digests have only `claude_code` and `codex` keys. Its persisted record has one current tagged-entry representation. It rejects obsolete, missing and corrupt records; it does not migrate them. Keep immutable release identity, provenance and complete artifact binding.

The internal compatibility schemas use these shapes, derived through Effect Schema:

```ts
type Capability = "stdio" | "hooks" | "agents"
type ProfileIdentity = {
  host: Host
  platform: RuntimePlatform
  scope: "user" | "project"
  revision: AdapterRevision
}
type NativeProfile = ProfileIdentity & {
  format: Format
  capabilities: readonly Capability[]
}
type ProfileQuery = {
  host: Host
  platform: RuntimePlatform
  scope: "user" | "project"
  format: Format | null
  requirements: readonly Capability[]
}
```

Claude and Codex retain their existing Linux/Windows user/project adapters and current features. Cursor retains its Windows x64 user adapter and stdio capability; hooks and agents must reject until their semantics are implemented. Skills, supporting files and remote MCP are the baseline representation. No feature is inferred from a version string.

A candidate profile matches exactly on host, platform and scope, on format when requested, and when every requirement is included in its capabilities. Select only a unique candidate. Missing or ambiguous contracts reject. Ownership reuse requires unique registrations and the same host, platform, scope and adapter revision. The physical key, canonical destination, plugin identity, complete payload and retained-plan checks remain prerequisites.

`validateBundle` derives requirements from the native documents and their validated packaged processes/agents. `resolveTarget` receives the actual bundle for a present intent, rather than only its format. It checks actual runtime prerequisites only when the bundle contains process launchers. Inspection/removal needs no new package. Keep the Windows x64 restriction and current filesystem/working-directory admission.

The observed client version remains diagnostic evidence in `Target`. It is not profile admission or mutation authority. New-plan target comparisons use the physical target and adapter contract, so an app version change alone does not stale a plan. Stored marker and retained-plan integrity checks still compare their original complete values. Revalidation still checks current capabilities before and after acquiring locks. Pending operations never gain permission to replay a native mutation.

Keep real runtime requirements, such as the portable launcher's Node minimum and required operations. Replace an exact helper version check only with a check of the behavior the launcher actually needs. Test binary hashes and exact application versions remain in reproducibility receipts.

The installer's launcher policy has only `absent` and `portable` modes. Retire the shell-only `posix` mode and its `pwd` prerequisite with the removed encodings. Linux portable launchers require Node, `/bin/sh` and the environment-transfer behavior used by their sidecars; Windows requires Node. Observe the needed GNU `env` operations rather than accepting only its previously tested version string.

## LDD obligations and checks

The change deliberately replaces the old version-based eligibility requirement. Prove the current two-format rendering and catalog relations before porting their TypeScript. The compatibility model must establish unique selection soundness/completeness, ambiguity refusal, ordering independence, exact adapter ownership, and required-capability preservation. Include valid success cases so rejecting every request cannot satisfy the contract.

Use strict new-format oracle inputs and independent expected examples for both package clients. Compare pure TypeScript before editing I/O. Retain scoped compiler/CLI/catalog/distribution/installer checks, malformed-input refusal and native lifecycle requirements from the launch plan. Old evidence does not qualify regenerated bundles or a changed admission policy. Formal TypeScript refinement stays explicitly unproved.

## Architecture phases

- [x] Ground: main traced the project selector, compiler/materializer/validator, catalog, distribution, profile resolver and plan comparisons; Luna supplied a bounded read-only dependency inventory.
- [x] Sketch: compared alias retention with one current representation and content requirements.
- [x] Agree: Lucas explicitly authorized consolidation without migration and resumed the finite completion goal.
- [x] Implement: checked Lean construction, oracle, pure TypeScript and scoped I/O. Current native author and manager acceptance close L6/L7 in the launch plan.
- [x] Scrap review: main reviewed the removed paths, current module boundaries and counterexamples; [scoped acceptance](prelaunch-consolidation-acceptance.md) records corrections and limits.
