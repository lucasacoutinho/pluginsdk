# Bundled MCP processes

An author should be able to package an existing MCP server in the same definition used for skills:

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

The command remains `pluginsdk build definition.json`. The author supplies the server and its dependencies. The compiler captures their bytes, translates the declaration and produces each client's package. Building and installing a package never starts its server. A client session owns server startup and shutdown.

The [public schema](../../contracts/Plugin.ts) accepts this declaration. The CLI selects v3 and builds both clients from the same definition. Process normalization, quoting, launcher behavior and MCP composition have proved models and conforming TypeScript ports. SDK build, user-scope installation, startup, update and removal have isolated native acceptance on both pinned Linux clients. The [example](../../test/fixtures/plugins/mcp/definition.json) contains the definition and application server.

## Existing flow

The CLI reads one definition. `Compiler.build` snapshots its Effect schema, captures contained regular files, renders native JSON and assembles supporting assets. Native validation and a digest commit the complete bundle. `Installer.plan` checks that bundle before ownership inspection; `apply` retains the reviewed plan before native mutation. The two public modules remain `Compiler` and `Installer`.

Local MCP belongs inside compilation. It adds a process declaration and generated package files, rather than another service, a caller-written launcher or an `sdk.ts` entrypoint. The installer continues to manage the complete immutable bundle.

Resolve process references against captured source files at their final package paths, after skill path mapping. Generated manifests and launchers are not reference inputs. Final assembly checks collisions across all captured and generated files.

## Observed client contracts

The isolated probes used Claude Code 2.1.304 and Codex CLI 0.163.0 on Linux. Claude connected and listed tools. Codex connected, listed tools and completed a direct app-server tool call. No model turn or provider authentication ran.

| Behavior | Claude Code | Codex Agent Plugins |
| --- | --- | --- |
| Packaged file in arguments | `${CLAUDE_PLUGIN_ROOT}` expands. | `${PLUGIN_ROOT}` expands. |
| Empty argument or environment value | Preserved. | Preserved. |
| Ordinary `${NAME}` in arguments and environment | Expands using the parent environment. | Remains literal. |
| Arbitrary parent environment variable | The safe probe marker was inherited. | The safe probe marker was absent. |
| Explicit working directory | The process ran in the project directory despite configured package-root `cwd`. | Package-root `cwd` and a contained `/work` directory were honored. |
| Process shutdown | The fixture received SIGINT. | The fixture received SIGTERM. |

Codex requires a bare executable name or a contained `./` command. Its pinned parser also restricts stdio working directories to package/data paths. The native probe confirmed a valid bare `node` command and a contained working directory. Earlier absolute-command attempts were invalid inputs, rather than evidence that stdio was unsupported. See the [pinned Codex parser](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/codex-mcp/src/agent_plugin_config.rs).

These observations qualify the host primitives. They do not qualify a PluginSDK process compiler. Claude's CLI exposed no direct tool-call command. The initial raw receipts are in `.audit/probes/local-mcp/`.

## Alternatives and synthesis decision

| Design | Author knowledge and maintenance | Decision |
| --- | --- | --- |
| Accept native process objects | Authors manage client variables, interpolation and working-directory differences. | Reject. This repeats client-specific work across definitions. |
| Translate directly into native fields | The compiler translates file references, but cannot preserve literal placeholders or a common working directory on the observed clients. | Reject for the complete process interface. |
| Generate a contained process launcher | The compiler owns quoting, directory changes, environment bindings and native root translation. The author keeps one definition. | Select for the qualified Linux profiles. |
| Introduce a hosted MCP runtime | Authors move server code and deployment into a new framework. | Defer. The organization uses existing infrastructure. |

The launcher is a generated executable package file. It uses the qualified system `/bin/sh`, changes to the declared package directory and replaces itself with the requested process. Definitions with environment bindings also use GNU `/usr/bin/env`; the v3 profile pins coreutils 9.4 and checks that runtime before installation. Native declarations contain only compiler-generated paths, client root variables and explicit source captures. Author literals stay in the launcher, where the compiler quotes them without interpolation.

The launcher cannot recover environment variables that Codex filters before starting a plugin process. Codex environment references therefore produce an explicit build rejection. For Claude, the native declaration captures each requested source before shell startup. This also preserves sources such as `IFS` that a shell resets during startup. Literal environment values remain available on both clients.

Claude leaves an absent `${NAME}` reference as literal text. Rejecting that text alone would also reject a valid source with that exact value. The selected protocol captures `${NAME}` and `${NAME:-PSDK_ABSENT}` under two fresh names. It rejects only when the raw value equals the unresolved reference and the defaulted value differs. Isolated native evidence confirms the distinction for missing, empty, literal-reference and fallback-equal values. Substitution happens once, preserving placeholder text inside present values. Receipts are in `.audit/probes/claude-capture/`.

The compiler chooses a capture namespace longer than every requested destination and source name. Distinct markers identify the two captures. The script snapshots the command, directory, ordered arguments and environment values into positional parameters before changing any binding. It then removes all capture variables, changes directory and transfers the requested environment to the process. All positional references use braces, including `${10}` and above. This avoids shell-variable shadowing and preserves references to an original value when another binding replaces that source name.

Shell exports cannot implement every valid binding: `/bin/sh` rejects a nonnumeric `OPTIND` value. Passing values as arguments to `env` would expose referenced values in its argument list. Instead, the script exports fresh transfer variables and gives GNU `env -S` symbolic `DEST=${TRANSFER}` expressions. GNU `env` expands each value without splitting it and removes the transfer variables through `-u` before replacing itself with the server; see the [pinned implementation](https://github.com/coreutils/coreutils/blob/v9.4/src/env.c). Runtime source values stay out of that argument list. The counterexample and safe local transfer receipt are in `.audit/probes/local-mcp/shell-export-counterexample.json`. Actual emitted scripts qualify this utility behavior alongside the shell form.

The launcher becomes part of the bundle digest and the reviewed installation plan. The client owns process lifetime. The SDK does not start a daemon, infer package-manager dependencies or fetch dependencies during build.

## Authoring interface

The existing remote declaration keeps its meaning. The stdio alternative has these fields:

```ts
type StdioMcp = {
  readonly type: "stdio"
  readonly command: ExecutableName | { readonly file: PackagePath }
  readonly args?: ReadonlyArray<ProcessText | { readonly file: PackagePath }>
  readonly cwd?: PackagePath
  readonly env?: Readonly<Record<EnvironmentName,
    ProcessText | { readonly type: "environment"; readonly name: EnvironmentName }
  >>
}
```

The authoritative [Effect schemas](../../contracts/Plugin.ts) define these types. `ProcessText` contains valid Unicode without NUL. `ExecutableName` is a bare program name, such as `node`, `python3` or `uvx`; it cannot contain a path or shell expression. A packaged command uses `{ "file": ... }` and must have a captured executable bit. File arguments must name captured regular files. Supporting dependencies remain explicit `assets`.

The default directory is the package root. `cwd` selects a contained package directory that exists in the captured files. An empty directory cannot be represented by the current file-only bundle. Arguments preserve their order and empty values. Strings always mean literal text; environment references use their explicit object form. The compiler reads no environment values while building.

The bundle formats are `claude_code_v3` and `agent_plugins_v3`. V1 and v2 retain their existing accepted contents and reject stdio. The CLI selects v3 when a definition contains stdio MCP; the author does not choose a launcher backend. A request to build all clients rejects before writing either bundle when one client cannot preserve the declaration.

## LDD contract

[Types.lean](../../spec/PluginSdk/Compiler/Process/Types.lean) defines the process definition, captured-file input, symbolic process plan and structured failures. [Properties.lean](../../spec/PluginSdk/Compiler/Process/Properties.lean) states five obligations:

| Property | Required claim |
| --- | --- |
| M1 | Accept exactly representable input, including success for every valid declaration. Required files exist, packaged commands are executable, directories exist, environment names are unique and the host supports all requested references. |
| M2 | Preserve the program, complete ordered argument list, working directory and every explicit environment binding for every root and supplied environment. |
| M3 | Report all and only required failures, once each in strict canonical order. |
| M4 | Order successful environment bindings canonically. |
| M5 | Reordering captured files or environment entries preserves the result. Argument order remains meaningful. |

The [model](../../spec/PluginSdk/Compiler/Process/Model.lean) and [proofs](../../spec/PluginSdk/Compiler/Process/Proofs.lean) certify M1 through M5. The strict [wire](../../spec/PluginSdk/Compiler/Process/Wire.lean) matches 22 independently authored vectors and rejects 508 malformed requests. Six enumeration cases retain the same expected results. The [TypeScript port](../../src/compiler/process/model.ts) matches the authored results and the Lean oracle, including those enumeration cases.

[Quoting.lean](../../spec/PluginSdk/Compiler/Process/Quoting.lean) proves Q1: literal text survives encoding and decoding through its restricted quoting grammar. Nine independent vectors match that oracle. The [shell check](../../spec/scripts/check_process_quoting.py) verifies 285 quoted arguments byte for byte in the actual `/bin/sh`, including every non-NUL ASCII character, apostrophes, newlines, Unicode and literal substitution syntax. Its strict wire rejects 19 malformed requests. The common JSON decoder also rejects unpaired Unicode escapes instead of replacing their values.

The launcher [types and obligations](../../spec/PluginSdk/Compiler/Process/LauncherTypes.lean) describe a separate script instruction model. L1 requires exact capture presence and value; L2 valid fresh names; L3 complete, distinct captures; L4 complete process preservation through positional lookup; L5 rejection before execution for a missing source; L6 exact native command, root, capture and directory fields; L7 safe, distinct transfer names. The [model and serializer](../../spec/PluginSdk/Compiler/Process/Launcher.lean) have [six certificates](../../spec/PluginSdk/Compiler/Process/LauncherProofs.lean) and a [transfer-name certificate](../../spec/PluginSdk/Compiler/Process/LauncherTransferProofs.lean). The exact-type and axiom audit checks all 74 project properties. The [TypeScript serializer](../../src/compiler/process/posix.ts) matches eight authored expectations and 32 additional oracle cases through its [conformance tests](../../test/launcher.test.ts).

These are properties of the instruction model and capture protocol. They do not certify complete POSIX or GNU interpreters. Eight independent vectors match the launcher oracle and seven malformed requests are rejected. Six focused executions check actual emitted scripts, including quotes, newlines, empty values, Unicode separators, 10+ argument positions, reference snapshots, missing sources, special environment names and internal-variable removal. Q1 certifies the literal-word codec.

The exact oracle-emitted launcher also ran through isolated native packages at versions 1.0.0 and 2.0.0. Both clients preserved arguments, working directory and literal environment bindings, discovered the fixture's tool and shut its process down. Claude used marketplace update followed by plugin update; Codex used removal followed by addition and completed a direct tool call at each version. Removal left empty task-owned inventories, and temporary homes were removed. Claude's effective root was the marketplace source directory; Codex's was its versioned cache. These checks used native packages assembled by the probe, not `Compiler.build` or `Installer`. Receipts are in `.audit/probes/emitted-launcher/`.

The [SDK native tests](../../test/native/discovery.test.ts) derive a fixture from the authored example and add instrumentation only in a temporary source tree. At versions 1.0.0 and 2.0.0, both clients preserve ten literal arguments, declared cwd and special environment bindings, discover the tool, shut down, accept a reviewed update and remove cleanly. Codex completes direct tool calls. Reapplying each saved plan is stable. Builds, planning, installation and removal leave the external log unchanged until a client session starts the server. Logs stay outside the captured package, so native loading does not alter its committed bytes. Native inventory supplies the expected root, and recorded PIDs must exit before mutation.

These checks qualify user-scope stdio on the pinned Linux clients. Claude project scope, other client versions, macOS and Windows need separate stdio acceptance. The full package/release gates have not been rerun; CI is deferred. Generated-file collisions remain with the assembly model.

## Package composition

Two implementation shapes were compared. Extending the original renderer's input and output variants would make its existing contracts depend on process plans and generated executable files. A separate internal MCP renderer can reuse the original remote rendering rules and the proved launcher while leaving legacy rendering unchanged. Select the latter: it owns the complete MCP document and generated launcher files behind one pure function. It adds no public module or author configuration.

```ts
import type { McpInput, McpResult } from "../contracts/Mcp.ts"

declare const renderMcp: (input: McpInput) => McpResult
```

The two records have distinct names, inherited from the single authored MCP record. The function sorts local server names by unsigned UTF-8 order, assigns `.psdk/mcp/<ordinal>.sh`, renders each proved launcher and emits one native MCP document containing all remote and local entries. Generated scripts are executable and have no author-supplied paths. A missing native representation rejects the complete result. Empty input produces no MCP document or launchers. Remote-only input preserves the existing document.

The [Lean interface](../../spec/PluginSdk/Compiler/Mcp/Types.lean) states K1-K7: exact server keys and values; exact generated bytes and modes; contained, distinct launcher paths without expansion syntax; success exactly when every local plan has a native representation; invariance under record enumeration; legacy document preservation when no local server is present; and native Codex cwd-root recovery with complete process preservation. All seven [certificates](../../spec/PluginSdk/Compiler/Mcp/Proofs.lean) pass the exact-type and axiom audit. Seventeen authored vectors and seventeen enumeration cases agree with the oracle; twelve malformed inputs reject. Two actual shell controls preserve roots ending in newlines through the Codex bootstrap. The [TypeScript port](../../src/compiler/mcp/model.ts) also agrees on 96 generated cases. The [hook-capable Codex format](hooks-design.md) needs this native MCP adapter while v1-v3 retain their bytes.

Process normalization remains M1-M5; script behavior remains L1-L7. The runtime compiler passes every normalized local plan once, replaces the legacy MCP document once and includes every emitted script before assembly and digesting. Five [compiler checks](../../test/local-mcp.test.ts) establish those connections, final skill-path references, explicit failures, legacy preservation, imported native validation and that building never starts a server. The [CLI check](../../test/cli.test.ts) exercises automatic v3 selection and rejection before multi-client output writes. Native acceptance separately establishes client loading and lifecycle.
