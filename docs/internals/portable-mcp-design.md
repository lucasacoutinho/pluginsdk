# Portable MCP package generation

## Usage

An integration team keeps its plugin definition and server files in one project:

```sh
npx pluginsdk build
npx pluginsdk preview
```

The same definition supplies both Claude and Codex bundles. Authors do not name runtime files, select an operating system or write a launcher. Publication keeps the configured destination behavior. Qualification of the new bundle encoding precedes automatic selection.

## Ground

`Compiler.build` in `src/compiler/index.ts` captures declared files, lowers each process with `lowerProcess`, and calls `renderMcp`. The current renderer owns canonical MCP ordinals, client records and `.psdk/mcp/<ordinal>.sh` files. The compiler materializes those files, assembles them with captured assets and calculates the complete bundle digest. Native validation checks the chosen format before returning the bundle. Installation consumes those immutable bytes through the existing ownership protocol.

The [portable launcher](portable-launcher-model-acceptance.md) now supplies checked instruction data, a native Node invocation and exact POSIX bytes. The packaging step must keep those three outputs bound together. Remote MCP document semantics already belong to the compiler's shared render helpers and remain reusable.

## Shape

Add one private pure operation:

```ts
declare function renderPortableMcp(input: McpInput):
  | { readonly type: "rendered"; readonly document: JsonObject | null; readonly files: readonly FilePlan[] }
  | { readonly type: "rejected"; readonly issues: NonEmptyReadonlyArray<{ readonly server: string; readonly reason: PortableLauncher.Issue }> }

type FilePlan =
  | { readonly type: "runtime"; readonly path: PackagePath }
  | { readonly type: "process"; readonly path: LauncherPath; readonly data: ProcessData }
  | { readonly type: "posix"; readonly path: LauncherPath; readonly content: ProcessText }

type ProcessData = {
  readonly schema: 1
  readonly posix: LauncherPath
  readonly script: Launcher.Script
}
```

The renderer emits `.psdk/runtime/process.mjs` once when local servers exist. Each canonical local ordinal gets `.psdk/mcp/<ordinal>.json` and `.psdk/mcp/<ordinal>.sh`. The data file names its own POSIX sidecar. Client records come from the same accepted launcher result as the data and shell files. Remote-only inputs emit no runtime files.

The compiler materializes a runtime plan from the SDK's bundled runtime asset, a process plan as JSON, and a POSIX plan as text. Executable intent follows the variant: only the POSIX sidecar is executable. Existing assembly and bundle hashing cover every resulting file. No new public service or intermediate author API is needed. This follows type-system discipline for file variants and boundary discipline for runtime file decoding.

New format identifiers will distinguish this encoding from previously qualified bytes. Their first version supports assets and stdio. Hooks and agents require their portable gates before a Windows profile can admit them. Existing Linux hook/agent formats retain their qualified behavior. Profile promotion and automatic format selection wait for SDK-built native acceptance.

## Synthesis decision

Use the new private renderer and typed file plans. It concentrates generated paths, paired files, runtime cardinality and client records behind one call. `Compiler.build` owns byte materialization and hashing, which are already its responsibilities.

The alternative was to add platform and encoding branches directly to `Compiler.build`, reuse the old shell renderer and patch client declarations afterward. That shape makes the compiler coordinate ordinals, JSON data and native records across independent outputs. It permits one declaration to point at data compiled from another process. The selected renderer produces those outputs together.

A mode parameter on the old renderer would also change every existing wire request and proof obligation. Separate versioned encodings preserve the accepted legacy byte contracts while sharing remote/native object helpers. Both renderers remain private compiler implementations.

## Properties

- Accept exactly when every local portable launcher is representable; rejected results carry no partial package.
- Preserve remote records and expose exactly the accepted local server names and native declarations.
- Generate the runtime once and the exact paired data/shell files for every canonical local ordinal.
- Keep all generated paths contained, distinct and free of expansion syntax.
- Preserve output under input-map enumeration changes, including remote header order.
- Report each local launcher's exact diagnostics with its server identity in canonical server order.

The process data schema is the runtime's input boundary. These properties establish package plans; runtime execution, runtime asset bytes and native process lifetime require their own checks.

## Implementation phases

- [x] Ground: trace compiler capture, process lowering, MCP rendering, assembly and native validation.
- [x] Sketch: compare compiler-side patching, a mode on the legacy renderer and a private portable renderer.
- [x] Agree: the active milestone instruction authorizes the selected design.
- [x] Implement the pure renderer: Lean properties and certificates, oracle/vectors and TypeScript conformance. [Acceptance](portable-mcp-acceptance.md) records the result. Compiler/runtime I/O follows this gate.
- [ ] Scrap: revise the shape if runtime or native checks contradict the file-plan contract.
