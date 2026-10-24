# Codex project activation model

The pure project activation model derives one revision's native cache paths and agent bindings. Its authority review distinguishes the previously owned project declarations from foreign declarations and discovered agents. Installer now uses this model for project cache preparation, config editing and role inspection. Portable project profiles remain gated pending native SDK qualification.

The [selected design](../../.audit/probes/portable-project-codex-design/design.md) keeps agent files in the immutable package cache. One owned project config block activates the plugin and its agent bindings together. Nine isolated Codex 0.163.0 sessions establish the native loading premise. That experiment does not qualify the SDK lifecycle.

## Interfaces and ownership

[ProjectActivation](../../contracts/ProjectActivation.ts) defines the Effect schemas. The [TypeScript model](../../src/installer/project/activation-model.ts) exposes two total functions:

```ts
buildProjectActivation(input: BuildInput): BuildResult
reviewProjectRoleAuthority(input: AuthorityInput): AuthorityResult
```

The builder receives the platform, Codex home, package version, revision registration and agent names. It returns the marketplace cache directory, package payload path and complete agent bindings. Given a canonical absolute home, each binding has the plugin-qualified role name and an absolute `config_file` path inside that payload. Duplicate names reject with canonical diagnostics.

The cache path uses the revision marketplace, plugin and package version. The marketplace's source directory is a separate registration value. Changing that source value preserves the cache path. Both Linux and Windows path spellings are modeled, including trailing separators and filesystem roots.

Authority review receives previous bindings, desired bindings and native observations. A managed observation must match one prior binding's declared name, effective name and file path exactly. Missing, repeated, changed or extra managed declarations reject as drift. A foreign declaration or discovered agent that overlaps a relevant name or path rejects as unowned. Unrelated foreign entries remain outside the operation.

Refusal order is duplicate basis, unknown observation, foreign conflict, then drift. Empty previous and desired sets require no role scan. This preserves the basic project package workflow.

The public `Registration`, `ProjectCapture` and `Installer.plan/apply` schemas retain their previous shapes. The new projection and observation schemas stay inside Installer's model boundary. Backend tool authorization retains its service owner.

## Formal guarantees

The [property statements](../../spec/PluginSdk/Installer/ProjectActivation/Properties.lean) precede the model and its [proof certificates](../../spec/PluginSdk/Installer/ProjectActivation/Proofs.lean).

| Properties | Guarantee |
| --- | --- |
| PA1–PA2 | Exact admission and canonical duplicate diagnostics |
| PA3–PA4 | Exact cache paths and complete bindings with unique names and paths |
| PA5–PA6 | Registration preservation and enumeration independence |
| PA7–PA8 | Empty agent sets and cache independence from the marketplace source directory |
| RA1–RA2 | Exact authority admission and refusal reasons |
| RA3–RA4 | Exact prior ownership and rejection of foreign aliases or path consumers |
| RA5–RA6 | No scan for basic packages and enumeration independence |

Main independently checks all fourteen theorem types and their transitive axioms. Only Lean's standard `propext`, `Classical.choice` and `Quot.sound` are allowed. The prior 318 certificates carry forward, giving 332 registered obligations. The combined release gate remains deferred.

Fifty-one independently authored cases and two recorded native cache paths agree with Lean and TypeScript. Another 960 cache cases and 11,816 authority cases cover the finite input matrix. Both decoders reject 47 malformed requests. Scoped typechecking, Effect diagnostics and lint pass. The [acceptance record](../../.audit/probes/portable-project-activation-model/acceptance.json) retains commands, snapshots and promotion evidence.

With the repository's Lean toolchain and Node 24.18+, the focused checks are:

```sh
cd spec
lake build PluginSdk.Installer.ProjectActivation.Proofs oracle
cd ..
node node_modules/vitest/vitest.mjs run test/project-activation.test.ts
```

## Installer implementation

[Project layout](../../src/installer/project/layout.ts) supplies the same proved cache projection to preparation, verification and Windows process-directory admission. Previous bindings come from a verified retained plan and complete bundle. Desired bindings come from the new reviewed bundle. The project document owns plugin, marketplace and agent bindings in one atomic config block. Basic package blocks retain their previous bytes.

[Role inspection](../../src/installer/project/roles.ts) reads active native layers and recursive discovery. It distinguishes declaration keys from file-defined names, resolves relative references at their defining directory, and refuses aliases, incomplete scans and changed ownership. Physical role reads accept immutable package modes without applying user companion write policy. Preview checks role size and prospective inventory capacity. Cache retirement checks foreign references before deleting an old cache. Project targets use no user companion capture or writes.

Fifty-five focused tests cover the model, document preservation, cache binding, real-file role inspection and existing user companion behavior. Scoped typechecking, Effect diagnostics and lint pass. The native regression distinguishes raw per-layer declarations from Codex's merged declarations, which include null-valued optional fields. Both forms retain strict ownership checks. The [integration record](../../.audit/probes/portable-project-codex-integration/acceptance.json) binds the initial implementation; the [Linux normal lifecycle record](codex-project-portable-linux-normal.md) covers the corrected native reader.

## Native qualification obligations

The model assumes validated observations. A `managed` label must come from the exact retained project config block after ownership, file basis and complete bundle verification. User configuration cannot supply that authority. Native qualification must demonstrate the reader's coverage of active layers and discovery sources, including foreign aliases and changed role files.

Both portable formats pass normal Linux SDK lifecycles, the [sixteen-case interruption and repair matrix](codex-project-portable-linux-recovery.md) and [fourteen refusal and coexistence cases](codex-project-portable-linux-refusals.md) in isolated Codex 0.163.0 sessions. The [qualified Linux profile is enabled](codex-project-portable-linux-admission.md). The [Windows profile is also enabled](codex-project-portable-windows-admission.md) after its normal, recovery and role-refusal gates. macOS qualification is deferred because no host is available. CI, package-consumer and release checks remain deferred.
