# Portable feature packages

## Usage and acceptance

An author keeps the existing definition, hook programs, MCP servers and agent documents. `pluginsdk build` still discovers that definition. This stage adds explicit `claude_code_portable_v2` and `codex_plugin_portable_v2` compiler formats for packages that combine those features. Automatic selection and installation profiles wait for native qualification.

Build the same mixed definition twice for each host. Each package must contain its exact native declarations, one shared runtime, every process descriptor and POSIX sidecar, all captured assets and the existing agent documents. Native package validation must reject altered bindings, referenced descriptors and sidecars. The hook process plans must reach the existing runtime and directory admission checks through `BundleMetadata.processes`.

## Grounded flow and constraints

Before this change, `Compiler.build` captured sources, lowered MCP and hook programs, called `materializeMcp`, rendered legacy hooks separately, assembled files and validated the final native package. `materializeMcp` owned the runtime read and descriptor serialization. `validatePortableMcp` owned descriptor decoding, canonical process reconstruction and sidecar checks. Hook validation knew only the older shell encoding and returned paths without process metadata.

The accepted [composition contract](portable-feature-composition-design.md) already hides host agreement, complete rejection and runtime cardinality. Its PC1–PC8 proofs and oracle conformance precede this I/O work. The existing portable format names describe MCP-only packages. Changing their meaning would make retained release digests and qualified profiles ambiguous. New format identities must first pass the catalog, artifact, distribution and compatibility contracts.

The catalog stores one digest per format; distribution selects exactly one host-compatible format; compatibility requires the exact qualified format. Existing generic proofs quantify over every format, so extending the closed format type requires rebuilding and auditing those proofs. Independent cross-version cases must show that v1 and v2 remain distinct.

## Sketch

```ts
type ProcessEncoding = false | "posix" | "portable" | "portable_features"

// src/compiler/process/materialize.ts
declare const materializeProcesses: (
  input: PortableFeatures.Input,
  encoding: ProcessEncoding,
  request: Pick<BuildRequest, "root" | "format">
) => Effect.Effect<{
  readonly mcpDocument: JsonObject | null
  readonly hooksDocument: JsonObject | null
  readonly files: PackageFile[]
}, BuildRejected | SourceUnavailable, FileSystem>

// src/compiler/process/portable-native.ts
declare function validatePortableProcess(
  host: ProcessInput["host"],
  descriptor: LauncherPath,
  sidecar: LauncherPath,
  files: ReadonlyMap<string, PackageFile>
): { readonly program: Extract<PortableLauncher.Result, { type: "rendered" }>; readonly paths: ReadonlySet<string> }

// src/compiler/hooks/portable-native.ts
declare function validatePortableHooks(
  host: ProcessInput["host"],
  files: ReadonlyMap<string, PackageFile>
): { readonly processes: ReadonlyArray<PackagedProcess>; readonly paths: ReadonlySet<string> }

type PackagedProcess = { readonly path: LauncherPath; readonly script: Script }
```

The materializer handles both native documents and generated process files. The portable-feature branch consumes the proved composer once. Legacy branches retain their original renderers, diagnostics and bytes. File roles determine runtime reads, JSON serialization and executable POSIX sidecars. The compiler appends the returned documents and files without coordinating runtime sharing.

The common native process validator owns strict descriptor decoding, canonical reconstruction, exact sidecar content and executable roles, and the required runtime file. MCP validation retains its native-server checks. Portable hook validation strictly decodes the native event document, binds every handler to `bindHook(host, ordinal)`, checks unique contiguous ordinals across events, rejects captured bindings and preserves timeout and synchronous execution. Both validators return recognized paths and process entries. Each entry retains the descriptor path with its script so directory admission reports the actual hook or MCP file.

The v2 formats reuse the existing host manifests, asset semantics and agent documents. Supporting a representation does not qualify its installation lifecycle. Windows agent companions, real hook events and trust, complete lifecycle qualification, default selection and profile promotion remain separate gates.

Integration tracing found two remaining format-specific assumptions in the Installer: Codex companion extraction and retained-agent qualification enumerate only the older agent formats. Both must use the existing host and agent capability data for v2. Runtime admission must also classify the new encoding as portable. These changes retain all qualification rows and add no qualified destination.

The existing asset contract permits ordinary files under `.psdk`, including names that resemble process descriptors. Validation follows native declarations and preserves those assets without treating them as programs. An initial test incorrectly required rejection of every unreferenced descriptor-shaped asset. Correct the test and retain the established asset semantics rather than introducing a new namespace policy at the I/O boundary.

## Alternatives and synthesis

- Keep MCP materialization and append portable hooks in `Compiler.build`. This duplicates runtime coordination and exposes two render results to assembly. It contradicts the accepted composition boundary.
- Add a generic file-plan materializer but leave component rendering and diagnostics in `Compiler.build`. The helper would hide serialization while leaving the more difficult host and rejection rules with the caller.
- Select one process materializer and one common native process validator. These replace the MCP-only ownership at the two real boundaries. Component validators keep their native-document rules. This hides the complete operation without adding an author API or service layer.

Select the third design. Keep shared helpers private to the compiler. Remove the superseded MCP-only materializer when its caller moves. Do not expose a generic merge or reconstruction API to plugin authors.

## Sequence

- [x] Ground the compiler, catalog and validator call paths.
- [x] Compare designs and select the process boundary.
- [x] Continue under the instruction to complete the milestones.
- [x] Extend the Lean format contracts and audit the existing universal proofs.
- [x] Freeze independent cross-version cases and compare with Lean before TypeScript changes.
- [x] Extend Effect schemas and exhaustive host selection; pass pure conformance.
- [x] Integrate materialization and native validation; verify deterministic mixed packages and rejection boundaries. [Acceptance](portable-features-compiler-acceptance.md).
- [ ] Qualify the exact SDK-built packages in isolated native clients before profile or default changes.
- [ ] Revise the design if the implementation or native behavior contradicts it.

The predecessor checkpoint and 434 before-images, including every sealed Lean build artifact, are retained under `.audit/probes/portable-features-compiler/`. macOS has no available host. Grok native tests, third-party authentication, CI and release checks remain deferred.
