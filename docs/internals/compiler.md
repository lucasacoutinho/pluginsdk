# Compiler model contract

`Compiler.build` remains the caller's only build operation. [CompilerModel.ts](../../contracts/CompilerModel.ts) defines its internal pure function:

```ts
import type { RenderInput, RenderResult } from "../contracts/CompilerModel.ts"

declare const render: (input: RenderInput) => RenderResult
```

The [TypeScript renderer](../../src/compiler/package/model.ts) conforms to the [Lean renderer](../../spec/PluginSdk/Compiler/Model.lean), whose [proofs of B1 through B8](../../spec/PluginSdk/Compiler/Proofs.lean) certify the [format relations](../../spec/PluginSdk/Compiler/Format.lean). Byte capture, encoding, hashing and native document validation live behind `Compiler.build`.

The internal [process](../../contracts/Process.ts), [portable MCP](../../contracts/PortableMcp.ts), [portable hooks](../../contracts/PortableHooks.ts) and [shared composition](../../contracts/PortableFeatures.ts) models add bundled commands behind the same public build operation. Their current certificates are M1–M5, PM1–PM6, PH1–PH8 and PC1–PC8. Oracle conformance and native acceptance are separate obligations.

## Interface decision

| Candidate | What the model receives | Consequence |
| --- | --- | --- |
| Raw package source | Directory names, file bytes, and raw skill documents | Pulls source traversal, document parsing, and byte encoding into the model. |
| Captured content and normalized metadata | File identities, executable bits, validated skill names, and canonical MCP definitions | Concentrates rendering policy in one pure function. Source capture and standard codecs retain separate checks. |

The design selects captured content. It hides format knowledge behind `Compiler` without creating public load, normalize, render, and write modules. The internal seam exists for the Lean oracle and TypeScript conformance.

## Input and output

`RenderInput` holds one format, plugin metadata, skill trees, and MCP definitions. `Metadata` derives its fields from `Plugin`. Each skill has an explicit `entry` for `SKILL.md` and a list of assets with paths relative to that skill. The initial rendering profiles use ASCII skill names with the length and hyphen rules in [Agent Skills](https://agentskills.io/specification#name-field).

A `CapturedFile` holds a `FileDigest` and executable bit. The compiler keeps the corresponding immutable bytes in its own content table. The model compares file identities; it neither computes digests nor reads that table. Every source file is captured before rendering, and materialization never rereads the source tree.

MCP definitions use the encoded representation of `RemoteMcp`. Source normalization must first decode them with `RemoteMcp`, then encode the validated value. `Schema.toEncoded` describes that representation; it does not repeat the URL checks from the decoding transformation. Conformance generators must create canonical MCP values through the authoring codec rather than treating arbitrary encoded strings as normalized input.

The source decoder validates skill frontmatter, directory-name agreement, native metadata constraints, and source containment. Those are prerequisites to rendering. The model receives every accepted requested skill and server; normalization cannot silently omit one.

`RenderedFile` is either a copy reference with its executable bit, or a generated JSON object. `RenderResult` returns the entire nonempty file list or a nonempty list of structured issues. Rejected results contain no partial package. The public build failures and oracle use the same `PathCollision` and `UnsupportedMcp` schemas.

## Format rules

`Format` reuses `PackageClient`: `claude_code` or `codex`. Each has one current representation. Cursor selects the Claude package. The [consolidation design](prelaunch-consolidation.md) replaces the prelaunch generations without aliases or migration paths.

| Output | `claude_code` | `codex` |
| --- | --- | --- |
| Manifest path | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` |
| Manifest fields | `name`, `version`, `description` | `name`, `version`, `description` |
| MCP path | `.mcp.json` | `.mcp.json` |
| MCP document | `mcpServers` | `mcpServers` |
| Remote transport | `type: "http"` | Inferred from `url` |
| Remote header field | `headers` | `http_headers` |

Plugin metadata `id` becomes native `name`. Version strings need not be semver, but must fit one native cache path component: no slash, backslash, NUL, `.` or `..`. Every skill maps to `skills/<name>/SKILL.md`; supporting files stay below that skill. Explicit assets retain their package-relative paths. The manifest always exists; an empty MCP declaration produces no MCP file.

`materializeProcesses` uses one shared portable renderer for MCP and hooks. A package containing process declarations carries one runtime, canonical process descriptors and the required sidecars. Empty and remote-only packages carry no runtime. Source-relative executable and argument references must resolve against captured source files at their final package paths. Generated files cannot satisfy a missing source reference. Assembly checks all generated/source collisions before committing bundle bytes.

Command strings stay literal. Explicit environment references remain symbolic at build time; Claude supports them for MCP, while Codex rejects unpreservable sources. Shared hooks reject environment references. Working directories default to the package root; an explicit directory must have a captured descendant. Building does not start the server or hook program.

Hooks support synchronous `SessionStart` and `UserPromptSubmit` declarations with a timeout of 1–600 seconds, defaulting to 30. The compiler emits `hooks/hooks.json`, descriptors and executable sidecars. Validation checks complete native commands, event documents, paths, ordinals and packaged processes. Native hook approval remains a client decision.

Agents preserve a shared description and prompt, qualified identity, optional per-client models and shell policy. Claude receives Markdown frontmatter; Codex receives TOML. Imported native agents are reparsed and rerendered to check their complete bytes, paths and non-executable mode. The Installer owns Codex companion-file capture separately from package generation.

`validateBundle` returns the package version, validated processes and required capabilities. Stdio MCP processes require `stdio`; hook processes require `hooks`; native agent files require `agents`. Installer selects an adapter supporting all those requirements. The observed app version does not choose an encoding.

## Header meaning and compatibility

A header string means literal public configuration. An explicit environment reference can be authored as:

```ts
import type { PluginDefinition } from "../contracts/Plugin.ts"

export const definition = {
	id: "team-kit",
	version: "0.1.0",
	description: "Documentation tools",
	skills: [],
	mcp: {
		docs: {
			url: "https://docs.example.test/mcp",
			headers: {
				Authorization: { type: "environment", name: "DOCS_TOKEN", prefix: "Bearer " }
			}
		}
	}
} satisfies PluginDefinition
```

Codex rejects that reference as `unsupported_mcp` with an `environment_reference` reason. Claude renders the header as `Bearer ${DOCS_TOKEN}`. An environment reference with an empty prefix renders only `${NAME}`. Neither operation reads an environment variable.

The renderer preserves each native header contract. Claude expands explicit environment references; the Codex package represents literal headers. A multi-client build rejects a declaration that either output cannot preserve.

For Claude, a literal value or literal prefix containing `${` is rejected with `literal_expansion`; the renderer cannot promise to preserve it literally. Codex preserves such strings as literal text. Both package clients reject header names that collide under ASCII case folding. Diagnostic header names use the lowercase comparison key. Header names and literal text follow the field syntax in [HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-fields).

The initial endpoint schema requires HTTPS, except HTTP to `localhost` or loopback IP literals. User information and fragments are excluded. URLs are literal; canonical URLs containing `${` are rejected rather than acquiring a different meaning in Claude. Environment references are supported only through explicit header objects. Environment-variable availability, native credential policy, and successful authentication remain host checks.

## Paths and ordering

Both formats use an ASCII case-folded comparison key for path collisions. Identical keys collide even when contents match. A key also collides with a descendant when the ancestor is a file. The diagnostic reports the shorter comparison key. This rule includes non-adjacent sorted entries: files `a`, `a-b`, and `a/c` still conflict at `a`.

The model rejects these collisions before returning files. It also rejects two skills with the same name, since both would produce the same entry path. `PackagePath` consists of nonempty segments separated by `/`, with no dot segments, backslashes, NUL, or initial drive prefix. `SkillName` is a single segment. The Lean path type carries this grammar as a proposition; constructors prove that generated and copied paths satisfy it. The wire decoder checks the same grammar before constructing a path.

Accepted files use unsigned UTF-8 path ordering, as required by [identity encoding](identity.md). Issues are deduplicated and sorted by tag, then collision path or server, then reason tag and header. Native filesystem rules can add aliases beyond ASCII case folding. `Installer` must check those rules against the actual host before mutation.

## Materialization and proof limits

Copy entries resolve to the captured bytes with the specified executable bit. Generated objects use the same RFC 8785 encoder specified for identity, with no trailing newline and an executable bit of false. The compiler validates the resulting native documents against the current format rules before returning a byte-complete `Bundle`. Native CLI validation is an acceptance check; building a package does not require an installed host.

The model's content identity abstraction supports B2 only if the content table faithfully supplies the captured bytes. Filesystem checks, YAML parsing, canonical URL production, standard JSON encoding, hashing, and native validation need their own acceptance checks. Native format validation remains distinct from session loading and MCP authentication.

`CompilerModel.OracleRequest` and `CompilerModel.OracleResponse` define the version 1 `render` wire. The same executable handles lifecycle requests. The 16 frames in [compiler examples](examples/compiler.ndjson) specify files and rejection cases; all agree with the running model. [Generated compiler vectors](../../spec/vectors/compiler.ndjson) retain actual oracle responses. File digests remain symbolic captured identities.

The Lean gate exercises 100 reordered inputs, including Unicode path ordering and simultaneous rejections, and rejects 39 malformed compiler requests. TypeScript conformance additionally checks 1,920 rendering permutations and 48 Schema-generated normalized MCP cases. Focused compiler and boundary tests cover actual bytes, executable bits, source links, snapshots, native validation and canonical identity.

Source capture uses the opened-file boundary for Linux and the rooted Windows boundary. Platform-specific containment, identity and stable-read checks remain separate from pure rendering.

[Bundle acceptance](bundle.md) specifies the compiler-owned checks reused when importing a byte-complete package for installation. Its `checkBundle` model compares the claimed and recomputed digest and checks the committed path sequence. It reuses the renderer's collision and ordering rules. It never sorts an imported artifact or substitutes a file identity for its byte payload.
