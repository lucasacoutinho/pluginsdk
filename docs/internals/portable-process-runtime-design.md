# Portable process runtime

Authors use the existing definition and `pluginsdk build` command. The compiler packages one runtime alongside the [checked process data](portable-mcp-acceptance.md). A client invokes that runtime with the installed plugin root and the generated data path.

## Ground and selection

The existing Lean `Launcher.execute` already defines snapshot evaluation and ordered argument/environment lookup. Its capture protocol distinguishes missing values from empty strings and literal `${NAME}` values. The runtime must preserve that protocol while reading actual generated environment bindings. Package plans bind each instruction script to its native declaration and POSIX sidecar.

A single runtime that spawns children on both platforms would add a parent process to Linux's qualified process lifetime. The selected runtime instead replaces its Linux process with `/bin/sh` and the packaged sidecar through Node's `execve`. On Windows it evaluates the same instruction data, starts the resolved process with inherited streams and waits for completion. The [native premises](windows-stdio-premise-acceptance.md) establish those host primitives; SDK-built acceptance still has to qualify the complete path.

Keep instruction evaluation in a pure function and capture/environment/process access at the executable boundary. This gives one interpreter to compare with the proved launcher semantics. Reading files, decoding data, gathering captures, changing environment bindings and starting a process inside that interpreter would hide the proof boundary and make invocation preservation harder to check.

## Internal interfaces

```ts
declare function readProcessCapture(input: {
  readonly source: EnvironmentName
  readonly raw: ProcessText | null
  readonly check: ProcessText | null
}): ProcessText | null
declare function executeProcess(input: {
  readonly script: Launcher.Script
  readonly root: ProcessText
  readonly captures: Readonly<Record<EnvironmentName, ProcessText | null>>
}): Invocation | null
```

`Invocation` contains the command, ordered arguments, ordered environment replacements and cwd. Missing sources and invalid parameter indices produce no invocation. The interpreter is a refinement of the existing Lean evaluator, including its behavior on invalid indices.

The executable strictly decodes `ProcessData`, gathers each paired capture before replacing any environment value, and calls the interpreter. Windows environment assignment uses the native case-insensitive environment object. It removes generated capture bindings, applies replacements and spawns without a shell. Linux retains captures for the sidecar, which snapshots and removes them before replacing itself with the server.

The Windows child owner uses a scoped Node `ChildProcess` handle. It observes errors but waits for the actual `close` event, and uses that same held handle to terminate a child during interruption before waiting for closure. Effect's pinned generic Windows spawner uses `taskkill` with a PID, so it does not supply this ownership boundary. The child owner makes no descendant-lifetime claim; client qualification must establish that separately.

The runtime asset must be self-contained. It can bundle the SDK's Effect matching and schemas; installed plugins do not need their own dependency installation. The compiler owns the immutable runtime bytes and includes them in ordinary bundle assembly and hashing. The executable requires Node 24.18 or later. Unsupported platforms fail at its boundary; macOS qualification remains deferred.

## Compiler integration

`claude_code_portable_v1` and `codex_plugin_portable_v1` identify the new encoding. They support skills, assets, remote MCP and portable stdio. Hooks and agents remain outside these formats until their portable encodings qualify. Existing format identifiers retain their existing bytes and behavior.

One private MCP materializer chooses the checked renderer, resolves its file plans to bytes and returns the native document plus ordinary `PackageFile`s. The build operation still captures sources, lowers declarations, materializes files and assembles one hashed bundle. It exposes no new authoring stage. Runtime bytes come from the SDK's own build asset, process data uses canonical JSON, and the POSIX sidecar retains its executable bit.

Native bundle validation checks the command and argument tuple against the host's root placeholder and canonical ordinal, the exact paired capture bindings, the strictly decoded process data, its sidecar path and bytes, and a packaged nonexecutable runtime. Catalog resolution and distribution selection recognize both identifiers. Native installation profiles and automatic project format selection remain gated on SDK-built lifecycle evidence.

The validator projects process words back from their parameter indices, recompiles that plan with the checked portable launcher, and requires exact instruction equality. It then compares the native declaration and sidecar with that compiled result. This rejects malformed capture aliases and mismatched snapshot bindings without maintaining another implementation of the naming or admission rules.

## Proof and acceptance sequence

- [x] Ground: trace launcher evaluation, paired captures, package plans and native process premises.
- [x] Sketch: compare uniform child spawning with Linux process replacement and a Windows child owner; keep the pure interpreter separate from system access.
- [x] Agree: the active milestone instruction authorizes implementation.
- [x] Implement: prove capture decoding, interpreter refinement, full invocation preservation and missing-source refusal; compare TypeScript with the oracle before runtime I/O.
- [x] Runtime I/O: exercise the standalone asset, held child owner and SDK-built bundles on Linux.
- [ ] Native gate: qualify SDK-built client lifecycle on Linux and Windows before enabling profiles or automatic selection.
- [ ] Scrap: revise the design if runtime observations contradict the checked invocation or process lifetime.
