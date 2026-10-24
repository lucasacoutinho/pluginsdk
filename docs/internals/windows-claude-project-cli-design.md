# Windows Claude project CLI qualification

The final project gate exercises compiled PluginSDK commands for Claude Code 2.1.304 on Windows x64, project scope, using `claude_code_v2`. The normal SDK query experiment establishes A's enabled installation and B's disabled view of that same installation. The seven interruption cases must close with independent validation and guarded removal before this gate starts.

The developer uses the existing CLI:

```text
pluginsdk build --target claude_code
pluginsdk plan .pluginsdk/build/claude_code.bundle.json --host claude_code --home HOME --project PROJECT --out install.json
pluginsdk show install.json
pluginsdk apply install.json
```

The same authored definition builds both pinned generations. A second reviewed plan replaces the installed payload. `pluginsdk remove platform-tools` reviews removal, and `apply` performs it. The selected target is always explicit in installation planning. `preview` remains the already qualified user installation workflow; publication destinations and remote authentication remain outside this gate.

## Grounded flow

`src/cli/project.ts` discovers the project definition and captures the compiled bundle. `src/cli.ts` decodes that bundle, constructs the project destination from `--project`, writes a reviewed plan, and applies that saved authority. `worker-client.ts` chooses the emitted `.js` transaction worker when the CLI is compiled. This gate therefore includes the package context, emitted worker, and native schema files. Source-only execution cannot establish the compiled route.

The source base has 150 pinned files, including the generic home and project lock implementation. The old user CLI receipt used 147 source files and a different emitted graph. The new compile map and complete staging count must come from a fresh isolated output directory. Existing `dist` contents do not define that map.

The accepted compatibility proofs and oracle projection continue to govern admission. The candidate adds one exact Windows Claude project row, keeping the production table unchanged until qualification passes. No new public interface, pure business model, or installer implementation is required.

## Alternatives and decision

Adding a CLI admission override would create a second installation path. A source-only SDK run would leave the compiled worker and command boundary unobserved. The selected approach uses an isolated compiled copy with the exact candidate profile and the accepted worker tracer, then promotes that qualified profile's unchanged bytes.

The private CLI fixture extends the accepted project fixture with authored definition files for automatic build discovery. It reuses the frozen query observer, project settings boundary, and pure metadata validator. The existing user CLI scenario supplies the 17-command lifecycle; the existing project CLI scenario supplies explicit project arguments and physical root identity. Each retained native query still has admitted births, terminal waits, and closed handles.

The private interfaces stay small:

```ts
run(args, label, cwd): Promise<CliResult>
// Own the nonce-bound caller, decoded output, worker traces, and completion.

buildBundle(state, generation): Promise<Bundle>
// Write the authored definition and supply the approved reference bundle.

discover(state, target, activeBundle, activePlan, label): Promise<ProjectDiscovery>
// Verify exact payload bytes and A/B native metadata through the accepted fixture.
```

The controller pins the new source and emitted maps, profile projection, fixture preflight, and validators. Only the profile and worker tracer are source overlays. Removing those additions must recover the current accepted source bytes. Engine checkpoints belong to interruption testing and are absent from the compiled gate.

## Acceptance

Run 17 CLI commands: two builds and five commands each for install, replacement, and removal. Each operation has plan, show, apply, replay, and unchanged planning. Build outputs must match both full approved bundles and their build snapshots. Twelve transaction workers must complete, with exactly three `Installer.executeOnce` calls across the actual changes. Completed replay and unchanged planning add none.

The target commits to the home and physical A root. Claude plans retain no SDK Codex configuration capture. A's unrelated settings remain intact; its complete configuration bytes and journal remain stable across replay. User and B settings remain byte-exact. Native queries after install and replacement show A enabled and B disabled with A's project path and the approved payload. Queries after removal show the owned plugin and marketplace absent in both contexts.

Complete writer evidence precedes retention. Independent semantic validation of the retained evidence precedes cleanup. Unknown completion stops inventory, reuse, and removal. Only after guarded cleanup may the exact qualified profile be enabled and user-facing support documentation updated. macOS has no available host. Grok native tests, third-party authentication, CI, and package/release-wide checks remain deferred.

## Work phases

- [x] Ground the CLI, emitted worker, package context, and project ownership.
- [x] Compare admission approaches and select an isolated compiled copy.
- [x] Continue under the active milestone instruction.
- [x] Prepare the source snapshot after recovery closes.
- [x] Compile, validate the emitted map, and pass scoped preflight.
- [ ] Run and independently validate the compiled lifecycle.
- [ ] Remove the known-complete stage, then promote the exact profile and update support docs.
