# Portable launcher model

Authors keep their existing `definition.json`, `npx pluginsdk build` and `npx pluginsdk preview` workflow. The compiler owns the client declarations and process runtime. This model adds no author-written entry point or operating-system setting.

The [native premises](windows-stdio-premise-acceptance.md) establish that the added Node process can preserve Windows invocation values and remain inside the clients' process ownership. The selected portable entry point can also transfer its Linux PID into the existing POSIX launcher. Compiler qualification remains separate.

## Internal shape

Use one SDK runtime at `.psdk/runtime/process.mjs` per package, with generated data and a POSIX sidecar for each process. The native declaration runs `node`, binds the plugin root, and names the process data file. The runtime selects the qualified operating-system behavior.

Claude expands `${CLAUDE_PLUGIN_ROOT}` in the runtime path and root argument; its declaration omits `cwd`. Codex's `.codex-plugin` compatibility format leaves `${PLUGIN_ROOT}` arguments literal. Its declaration therefore sets `cwd` to `"."`, which the client resolves against the installed package, and passes `.psdk/runtime/process.mjs` and `"."` as relative entry/root arguments. The runtime accepts an absolute root or exactly `"."` and resolves it once before interpreting process data. Other relative roots are refused. The [native acceptance record](portable-stdio-native-acceptance.md) retains the counterexample and corrected SDK-built packages.

Per-process generated JavaScript would repeat executable logic and force the model and implementation to maintain a large code template. A shared runtime keeps that code in one module. The pure model produces its instruction data, native declaration and POSIX bytes; package assembly supplies the SDK runtime once. Assembly must bind all of those files into the same bundle digest before installation.

```ts
declare function compilePortableLauncher(input: LauncherInput):
  | { readonly type: "rendered"; readonly script: Script; readonly native: Native; readonly posix: ProcessText }
  | { readonly type: "rejected"; readonly issues: NonEmptyReadonlyArray<Issue> }
```

`LauncherInput.path` identifies the generated process data file. The MCP compiler owns file naming and assembly. The existing `Compiler` and `Installer` remain the public services. This instruction result refines the [earlier file-level sketch](windows-stdio-design.md): callers of the SDK still receive a complete immutable bundle.

## Capture names and environment behavior

Existing capture names include the source environment name. Names derived from `TOKEN` and `token` therefore alias on Windows. The portable compiler numbers sources in their existing canonical order, yielding distinct uppercase names such as `PSDK______A_0` and `PSDK______A_1`. Both source references remain supported. The source name itself stays attached to each capture for the native client's expansion protocol.

The model rejects environment destinations that collide under ASCII case folding, including exact duplicate destinations. Environment names are already restricted to ASCII by the authoring schema. The runtime must snapshot all capture values before changing any destination and use Windows' native case-insensitive assignment behavior. It must distinguish an absent reference from an empty value and remove generated capture bindings before starting the server.

Codex continues to reject references to arbitrary inherited environment variables because its plugin launcher filters them. Literal bindings remain supported. Neither build nor installation reads referenced values or starts the server.

## Proof obligations

| ID | Claim |
| --- | --- |
| PL1 | Accept exactly declarations without destination aliases and without unsupported Codex references. |
| PL2 | Preserve the complete command, ordered arguments, working directory and environment instruction values. |
| PL3 | Stop instruction execution when a required source is absent. |
| PL4 | Generate valid, fresh capture names that remain distinct under Windows case folding. |
| PL5 | Emit exactly the Node runtime command, client-specific entry/root arguments, data argument, capture bindings and cwd fields. |
| PL6 | Produce the exact POSIX serialization of the compiled instruction data. |
| PL7 | Report every required issue once, in strict canonical order, and report no unrelated issue. |

[Types.lean](../../spec/PluginSdk/Compiler/Process/Portable/Types.lean) and [Properties.lean](../../spec/PluginSdk/Compiler/Process/Portable/Properties.lean) state the contract. The capture transformation preserves the existing instruction evaluator, so process preservation and missing-source behavior can reuse its checked certificates. The new name proof covers the Windows difference explicitly.

These properties describe instructions and serialization. They do not certify Node, the shell, filesystem access, environment mutation or client shutdown. Those boundaries require scoped runtime checks and SDK-built native packages after TypeScript conformance passes.

## Phase checklist

- [x] Ground: trace the old launcher, native primitives and capture-name collision.
- [x] Sketch: compare repeated per-process JavaScript with a shared SDK runtime and process data.
- [x] Agree: retain the existing authoring interface and implement within the authorized milestone work.
- [x] Implement: complete all seven certificates, strict oracle/vector checks and TypeScript conformance before runtime I/O. [Acceptance](portable-launcher-model-acceptance.md) records the bounded result.
- [x] Scrap: replace the contradicted Codex root placeholder with its qualified relative entry/root binding; strengthen PL5, authored vectors and runtime boundary checks before repeating native qualification.
