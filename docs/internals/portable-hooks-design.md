# Portable hook rendering

## Usage

An integration team keeps its existing definition and hook program:

```sh
npx pluginsdk build
npx pluginsdk preview
```

Changing startup context or prompt validation changes that program and the same definition. Authors supply no runtime path, wrapper, operating-system choice or second build step. The compiler's private call is `renderPortableHooks({ host, hooks })`; its result supplies the complete native hook document and generated process files together.

## Problem and traced flow

`Compiler.build` captures source files and lowers hook declarations to the same `ProcessPlan` used by MCP. The legacy `renderHooks` orders names by UTF-8, assigns ordinals, groups `SessionStart` and `UserPromptSubmit` handlers, rejects captured environment references and emits POSIX launchers. The compiler materializes those outputs, assembles all assets and hashes one immutable bundle. Native validation checks the selected encoding before the Installer accepts it.

The [portable MCP design](portable-mcp-design.md#shape) binds process data, native declarations and POSIX sidecars together. The [runtime design](portable-process-runtime-design.md#internal-interfaces) makes `ProcessData` the executable's input boundary. Both describe one runtime with a pure interpreter. The [hook-binding gate](portable-hook-binding-model-acceptance.md) now supplies the missing native hook invocation. These records support sharing the process protocol; they do not establish why its schema was originally placed under MCP. That placement appears to follow the first consumer, but the bounded history search found no corresponding commit rationale.

## Shape

```ts
declare function renderPortableHooks(input: HooksInput):
  | { readonly type: "rendered"; readonly document: JsonObject | null; readonly files: readonly FilePlan[] }
  | { readonly type: "rejected"; readonly issues: NonEmptyReadonlyArray<{ readonly hook: HookName; readonly reason: PortableLauncher.Issue }> }
```

The existing Effect schemas remain authoritative for hook declarations and process instructions. `PortableProcess` owns the shared `ProcessData` and tagged `FilePlan` schemas. `PortableMcp` retains its existing schema exports while using that owner. The corresponding Lean types move to `Compiler.Process.Portable.Files`; existing MCP aliases preserve its wire shape and proof targets. This is an ownership change, not another descriptor format.

The renderer owns canonical ordering, ordinal assignment, event grouping, timeout/context fields, native binding and paired files. It delegates process compilation and environment-collision diagnostics to `compilePortableLauncher`. Hooks add their existing rejection of every ambient reference, for either host. Merge those reasons, remove duplicate issues and sort by UTF-8 hook name followed by reason key. Any issue rejects the whole result.

For accepted input, emit `.psdk/runtime/process.mjs` once, followed by `.psdk/hooks/<ordinal>.json` and `.psdk/hooks/<ordinal>.sh` for each canonical hook. The JSON names its exact sidecar and compiled instruction script. Only the sidecar becomes executable when materialized. The native document comes from the same ordinal and the proved `bindHook` result. Empty input emits neither a document nor process files.

This call hides the coordination between names, events, native arguments, process data and sidecars. The authoring surface stays unchanged. Per type-system and boundary discipline, file roles are tagged schemas, external decoding is strict, and native execution remains outside this pure model.

## Synthesis decision

Select a separate portable renderer and a shared process-data owner. Keep the legacy renderer and saved format meanings intact. Reuse portable process admission/execution and the new hook binding; do not introduce a second interpreter or shell quoting implementation.

Compiler integration must first pass a separate composition gate that shares the runtime with MCP output and preserves every descriptor/sidecar. New format identifiers preserve the older representations and allow exact SDK-built artifacts to enter native qualification. Profile promotion follows complete SDK native qualification. No compiler or installer I/O changes begin during this pure gate.

## Alternatives considered

- Patch legacy hook commands and add data files inside `Compiler.build`. This makes the compiler coordinate events, ordinals and several separately produced artifacts, exposing the renderer's internal rules to its caller. Reject this split ownership.
- Add an encoding option to the existing hook renderer. This changes its established wire and proof surface and makes every caller select an implementation detail. Separate versioned encodings preserve those contracts with a smaller caller interface.
- Copy `ProcessData` and file-plan schemas into the hook module. This leaves two authorities for the same executable input. Moving the shared types keeps both consumers on one protocol.

## Tradeoffs and open qualification

- The new encoding additionally rejects environment-name collisions under ASCII folding, as the portable process contract requires. Legacy format admission remains unchanged.
- Moving the shared schema may change bundled runtime bytes when runtime generation resumes. Compare the artifact then; qualify changed bytes through the required native gates rather than assuming the old runtime evidence covers them.
- Native binding evidence covers launch primitives. Real startup context, prompt blocking, Codex hook trust and complete install/update/replay/remove still need feature qualification. Windows Codex agent storage remains a separate contract. macOS remains deferred without a host.

## Properties

PH1–PH8 cover exact admission, event/document fields, complete paired files, contained and distinct paths, enumeration invariance, complete canonical diagnostics, empty preservation and process semantics with no captures. Properties precede the model and proofs; oracle vectors precede TypeScript implementation. Compiler I/O follows both this gate and the shared-runtime composition gate.

## Sources consulted

- Source control: bounded history for the MCP schema and its design/runtime records returned no commits. No historical placement rationale is claimed.
- Issue tracking: the GitHub query was scoped to this repository and portable work; the connector was not connected. No external issue evidence was available from that query.
- Long-form records: the two local design records above state the process-boundary and artifact-binding requirements. A bounded Pages search returned an unrelated guide, which was not used as evidence.
- Team chat: no matching read connector was exposed.
- Infrastructure observability: no matching query connector was exposed; local native acceptance records establish behavior, not historical intent.
- Exception tracking: no matching query connector was exposed.
- Product analytics: no matching query connector was exposed.

## Implementation phases

- [x] Ground the renderer, compiler and runtime boundaries.
- [x] Compare whole-shape alternatives and select the private renderer.
- [x] Continue under the active milestone instruction.
- [x] Prove PH1–PH8 and shared-type compatibility.
- [x] Complete strict oracle and TypeScript conformance.
- [x] Prove runtime sharing before compiler integration. [Composition acceptance](portable-feature-composition-acceptance.md).
- [x] Integrate the versioned compiler and native validators. [Compiler acceptance](portable-features-compiler-acceptance.md).
- [ ] Revisit the shape if implementation or native evidence contradicts it.
