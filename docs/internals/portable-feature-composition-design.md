# Shared portable process rendering

## Usage

An author keeps one definition, MCP server and hook program, then runs `npx pluginsdk build`. The same definition produces the Claude and Codex packages. No runtime declaration or extra authoring file is added.

The compiler's private call becomes `renderPortableFeatures({ mcp, hooks })`. It receives both native documents and all generated process files together, then materializes and hashes those files through its existing boundary.

## Problem and traced flow

`Compiler.build` captures source bytes and lowers MCP and hook declarations into process plans. `materializeMcp` currently renders MCP, reads the runtime asset and serializes its descriptors and sidecars. The compiler separately renders legacy hooks and appends their files before assembly. The new [portable hook renderer](portable-hooks-model-acceptance.md) supplies its own runtime plan, so concatenating the two results would duplicate `.psdk/runtime/process.mjs`.

The [MCP design](portable-mcp-design.md) binds native declarations to process data and sidecars. The [hook design](portable-hooks-design.md) preserves the same ownership and explicitly requires a pure composition gate. These constraints require complete component outputs, consistent host selection and exactly one runtime before I/O begins. No historical reason for MCP's original sole runtime ownership is assumed.

## Shape

```ts
type Input = {
  readonly mcp: McpInput
  readonly hooks: HooksInput["hooks"]
}

declare function renderPortableFeatures(input: Input):
  | {
      readonly type: "rendered"
      readonly mcpDocument: JsonObject | null
      readonly hooksDocument: JsonObject | null
      readonly files: readonly FilePlan[]
    }
  | {
      readonly type: "rejected"
      readonly issues: NonEmptyReadonlyArray<
        | { readonly type: "mcp"; readonly issue: PortableMcp.Issue }
        | { readonly type: "hook"; readonly issue: PortableHooks.Issue }
      >
    }
```

The existing MCP input remains nested so its authoritative remote/local-name constraint survives schema reuse. Hook input uses the existing hook-record schema. The host comes from the MCP format; a caller cannot supply a contradictory hook host. The existing and portable MCP renderers and the composer share `Mcp.hostFor`, matching the Lean owner. This follows type-system discipline and keeps decoding at the external wire boundary.

The operation runs both existing pure renderers. If either rejects, it returns all diagnostics, MCP first and hooks second, retaining each owner's canonical order and identity. A server and a hook may have the same name. No partial package is returned.

For two accepted components, preserve both documents exactly. Remove only the tagged runtime plans, then emit one canonical runtime followed by all MCP payload files and all hook payload files in their original order. Do not deduplicate ordinary files by path. The model must prove that the two generated namespaces are disjoint. An empty process set emits no runtime; remote-only MCP retains its document without adding process files.

This one input/output boundary hides host agreement, paired-file preservation, runtime cardinality and combined rejection. Renderers continue to own their documents and canonical ordinals. The compiler continues to own source capture, byte materialization, native validation and bundle hashing.

## Synthesis decision

Select the whole-component renderer. Keep file roles and process data under `PortableProcess`; add the private composition contract under `PortableFeatures` and `Compiler.Portable` in Lean. No author API, format selection or Installer changes belong to this pure gate.

## Alternatives considered

- Concatenate the renderer outputs and remove duplicate paths in the compiler. This keeps the API small but exposes runtime policy and duplicate-file decisions to I/O. It can conceal a conflicting descriptor or sidecar. Reject it.
- Expose a generic `mergeFiles` operation and make the compiler render each component first. It hides runtime filtering but leaves host agreement, two result variants, diagnostics and document/file binding with the caller. The selected operation hides those decisions together.
- Make MCP's renderer accept hook declarations. That moves hook policy into an MCP-specific interface and makes its existing wire and proof obligations change. Separate composition preserves both accepted contracts.

## Properties and implementation

PC1–PC8 establish exact admission, component documents, complete ordered files and count, exact runtime cardinality, safe distinct paths, enumeration invariance, complete diagnostics and MCP compatibility with empty hooks. Properties precede the concrete model; proofs and independent oracle vectors precede TypeScript. Compiler I/O follows conformance.

- [x] Ground the current call path and materialization owner.
- [x] Compare whole-component rendering with file merging and compiler-side deduplication.
- [x] Continue under the active milestone instruction.
- [x] Prove PC1–PC8.
- [x] Match authored vectors and strict TypeScript conformance.
- [x] Integrate materialization and native validation after the pure gate. [Compiler acceptance](portable-features-compiler-acceptance.md).
- [ ] Revise the shape if implementation or qualification contradicts it.

Moving schema ownership may change generated runtime bytes when generation resumes. Compare and qualify those bytes at that stage. Native hook events, trust, complete lifecycles and Windows agent companions retain their separate gates. macOS, Grok native tests, third-party authentication, CI and release checks remain deferred.
