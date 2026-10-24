# Windows stdio compilation

An author keeps one process declaration and the existing build workflow:

```json
{
  "id": "internal-tools",
  "version": "1.0.0",
  "description": "Internal application tools",
  "skills": [],
  "assets": ["mcp"],
  "mcp": {
    "app": {
      "type": "stdio",
      "command": "node",
      "args": [{ "file": "mcp/server.mjs" }]
    }
  }
}
```

```sh
npx pluginsdk build
npx pluginsdk preview --target claude_code
```

The intended outcome is that the same authored server loads in Claude Code and Codex on Windows. Native qualification must precede enabling a Windows stdio profile. macOS qualification remains deferred because no host is available.

## Current flow and constraint

`Project.compileProject` chooses each client's format from the definition's features. `Compiler.build` captures files, normalizes each process into `ProcessPlan`, calls the MCP renderer, assembles files and validates the native package. The installer admits an exact client, platform, version, scope and format combination before planning a lifecycle change.

The current renderer generates `.psdk/mcp/<ordinal>.sh`. Its versioned native validators require those shell launchers. These bytes belong to the accepted Linux formats. Replacing them in place would change an existing format's meaning. Windows currently admits the basic v2 formats; it does not admit stdio, hook or agent formats.

The compiler owns the translation because native fields cannot preserve the shared process semantics alone. Claude's observed working directory and interpolation differ from Codex's. The [existing rationale](local-mcp-design.md) therefore remains a constraint: authors provide process intent, and generated package files preserve it.

## Whole-shape alternatives

| Shape | Contract sketch | Complexity exposed to the caller |
| --- | --- | --- |
| Platform-specific bundles | `BuildTarget = { client: Client; platform: Platform }`; `build(definition, targets)` produces a package for each target. Platform-specific renderers translate one `ProcessPlan`. | The CLI can build all configured targets automatically, preserving the author workflow. Release and distribution interfaces must still select the correct client and operating system. This preserves the existing Linux runtime requirements and adds an encoding for Windows. |
| Portable generated launcher | `renderPortableLauncher(input: { host: Client; path: LauncherPath; plan: ProcessPlan }): GeneratedProcess`; a versioned encoding includes a generated Node launcher and its data. Existing `build(definition)` remains the public operation. | Authors need a qualified Node runtime in the client's executable search path. The compiler hides path conversion, literal preservation, environment snapshots and directory selection. |

Directly emitting native process fields cannot implement the existing literal and working-directory contract. Author-written client overrides would move that work back into every plugin. A hosted runtime would change the organization's deployment model.

## Synthesis decision

Select a portable generated entry point for a new stdio encoding. On Windows, Node starts the normalized process with inherited stdio and waits for it. On Linux, Node replaces itself with the existing POSIX launcher through `process.execve`; the shell keeps the existing process-transfer behavior. The two branches share the authored process declaration and captured package paths. Existing format bytes remain unchanged.

The [private premise checks](windows-stdio-premise-acceptance.md) support this choice. Both Windows clients preserved the wrapper's arguments, environment and working directory, then completed their process families without harness termination. A separate Linux check preserved the process ID through Node, `/bin/sh` and the final process. This establishes the required host primitives; it does not qualify the compiler encoding.

Accept Node 24.18.0 as an additional qualified runtime requirement for the new encoding. Linux still needs the qualified shell and, for environment bindings, GNU `env`. This cost avoids adding operating-system selection to release and distribution interfaces. Platform-specific bundles remain the alternative if this runtime requirement proves unsuitable. Their Windows launcher would still need its own process-lifetime evidence.

`process.execve` is experimental in the qualified Node version. Keep the runtime requirement explicit in compatibility checks and qualify changes before widening it. A Node version accepted by the SDK's package manifest alone does not establish this launcher capability.

The private experiment lives in `.audit/probes/windows-stdio-premise/`. Its hand-written native packages are test inputs. They do not qualify `Compiler.build`, the installer, a public format or a new compatibility profile.

## Selected internal contract

Keep the public definition and build operations. Add a pure compiler operation with this shape, then derive its authoritative Effect schema from the proved model:

```ts
type PortableLauncher =
  | { readonly type: "rendered"; readonly native: Native; readonly files: NonEmptyReadonlyArray<GeneratedFile> }
  | { readonly type: "rejected"; readonly issues: NonEmptyReadonlyArray<PortableLauncherIssue> }

declare function renderPortableLauncher(input: LauncherInput): PortableLauncher
```

`LauncherInput`, `Native` and `GeneratedFile` already belong to the process and MCP compiler contracts. The operation owns the Node entry point, Windows instruction data, POSIX sidecar and client root/capture fields. The MCP renderer assembles its returned files. The installer continues to manage the resulting immutable package.

The model must define `PortableLauncherIssue` before implementation, including unsupported native captures and ambiguous Windows environment destinations. Runtime environment references must be snapshotted before assignments. Windows assignments must use the native case-insensitive environment behavior; spreading an environment object and adding differently cased keys is insufficient.

Version each client's new stdio encoding separately from accepted shell encodings. Keep the existing hook and agent formats on their qualified path until those features receive equivalent acceptance. Change automatic format selection only after SDK-built packages pass the new encoding's Linux and Windows gates. Authors do not select a launcher backend.

## Premise checks

Use the pinned Windows Claude Code 2.1.304 and Codex 0.163.0 binaries in fresh isolated homes. Compare a direct Node server, a Node launcher whose child exits on EOF, and a launcher with a server and descendant that remain alive after EOF. Each client must load the packaged paths, preserve literal arguments and environment values, and start the requested package directory.

Claude's no-model check connects and lists tools. Codex's app-server check also calls the echo tool directly. Both checks end the host session and await normal completion of every observed process. The harness retains an independent handle for each debugger-observed birth before it resumes, then records its exact identity, wait result and handle closure. Harness-forced cleanup is a failed shutdown premise even when cleanup succeeds.

## LDD obligations after selecting the encoding

Before production implementation, state and prove the new encoding's properties in Lean and expose strict oracle requests. The conforming TypeScript model must establish:

- Exact ordered arguments, including empty strings, Unicode, quotes, newlines and literal placeholder text.
- Package-contained file and directory references at the actual host root.
- Environment references read from the original snapshot before any destination changes. Missing and empty values remain distinct; captured values stay out of argv.
- Windows case-insensitive environment bindings have one unambiguous destination, including reserved generated names. Native environment comparison follows the existing Windows environment boundary.
- Deterministic generated files and explicit rejection of unrepresentable declarations.
- Existing versioned encodings remain byte-for-byte stable.

Then add the runtime boundary and independently exercise SDK-built packages through native startup, tool discovery, Codex tool calls, shutdown and installation lifecycle. A successful private Node fixture is only the first premise check.

## Phase checklist

- [x] Ground: trace the compiler, process model, native validators and installer admission; retain the observed client differences.
- [x] Sketch: compare platform-specific bundles and a portable generated launcher.
- [x] Agree: the instruction to complete the milestones authorizes this work without another approval checkpoint.
- [ ] Implement: the private premises and encoding choice are complete; prove the model, establish TypeScript conformance, then implement and qualify the I/O boundary.
- [ ] Scrap: replace the launcher design if native evidence contradicts its runtime or lifetime assumptions.
