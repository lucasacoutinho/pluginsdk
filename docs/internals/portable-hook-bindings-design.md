# Portable hook binding contract

`bindHook` selects the native invocation for one generated hook ordinal. It accepts a host and a nonnegative safe integer. It returns the canonical process-data path and either a direct `node` argument vector for Claude or a constant shell command for Codex. It performs no I/O and accepts no package root, authored command, argument, environment value or working directory.

This contract uses the [qualified binding premises](portable-hook-binding-acceptance.md). The existing portable runtime remains responsible for reading the process descriptor and invoking the authored program. The existing hook renderer remains unchanged until the complete portable renderer passes its own oracle gate.

## Interface

```ts
type Input = { readonly host: "claude_code" | "codex"; readonly ordinal: Ordinal }
type Output =
  | { readonly type: "direct"; readonly path: LauncherPath; readonly command: "node";
      readonly args: readonly [ClaudeRuntimeArgument, ClaudeRootArgument, LauncherPath] }
  | { readonly type: "shell"; readonly path: LauncherPath; readonly command: ProcessText }

declare function bindHook(input: Input): Output
```

The Effect schemas define the actual types. `Ordinal` is branded and bounded by `Number.MAX_SAFE_INTEGER`. The Lean model accepts natural ordinals; its wire decoder applies the same safe-integer boundary as TypeScript. The [pure acceptance record](portable-hook-binding-model-acceptance.md) records the completed proof and conformance gate.

Claude's direct arguments are `${CLAUDE_PLUGIN_ROOT}/.psdk/runtime/process.mjs`, `${CLAUDE_PLUGIN_ROOT}` and `.psdk/hooks/<ordinal>.json`. Codex's command contains the already exercised Node bootstrap and that generated data path. Its JavaScript reads `PLUGIN_ROOT` from the environment and imports the unchanged runtime in the same process. A package root never enters generated shell text.

## Properties and evidence

1. `HB1_claude_binding_exact`: Claude receives the exact executable and three separate arguments.
2. `HB2_codex_binding_exact`: Codex receives the fixed bootstrap followed only by the ordinal's canonical data path.
3. `HB3_data_paths_safe`: each output path equals `.psdk/hooks/<ordinal>.json`, is contained and contains no expansion marker.
4. `HB4_data_path_identity`: two output paths are equal exactly when their ordinals are equal, across either host.

The shared Lean generated-path module owns the JSON path construction and its safety/injectivity lemmas. Existing shell paths retain their meaning. The new proof audit registers these four properties; authored vectors bind the output bytes to the native premise fixture. Strict malformed-wire cases cover unsafe ordinals and extra fields. TypeScript uses exhaustive Effect `Match` and schema-derived equivalence.

These proofs describe generated artifacts. They do not interpret JavaScript or shell programs. Native launch behavior remains supported by the separate Windows and Linux evidence. The next portable renderer must separately prove event grouping, ordering, reference rejection, file layout and sharing one runtime with MCP artifacts before compiler I/O changes.
