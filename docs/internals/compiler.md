# Compiler model contract

`Compiler.build` remains the caller's only build operation. [CompilerModel.ts](../../contracts/CompilerModel.ts) defines its internal pure function:

```ts
import type { RenderInput, RenderResult } from "../contracts/CompilerModel.ts"

declare const render: (input: RenderInput) => RenderResult
```

The [TypeScript renderer](../../src/compiler/package/model.ts) conforms to the [Lean renderer](../../spec/PluginSdk/Compiler/Model.lean), whose [proofs of B1 through B8](../../spec/PluginSdk/Compiler/Proofs.lean) certify the [format relations](../../spec/PluginSdk/Compiler/Format.lean). Byte capture, encoding, hashing and native document validation live behind `Compiler.build`.

The internal [process](../../contracts/Process.ts), [launcher](../../contracts/Launcher.ts) and [MCP composition](../../contracts/Mcp.ts) models add bundled stdio behind the same public build operation. Their [design](local-mcp-design.md) states M1-M5, Q1, L1-L7 and K1-K7, with checked certificates, oracle conformance and separate native acceptance.

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

| Output | `agent_plugins_v1` | `claude_code_v1` | `codex_plugin_v1` |
| --- | --- | --- | --- |
| Manifest path | `plugin.json` | `.claude-plugin/plugin.json` | `.codex-plugin/plugin.json` |
| Manifest fields | `$schema`, `name`, `version`, `description` | `name`, `version`, `description` | `name`, `version`, `description` |
| MCP path | `mcp.json` | `.mcp.json` | `.mcp.json` |
| MCP document | `$schema` and `mcpServers` | `mcpServers` | `mcpServers` |
| Remote transport tag | `streamable-http` | `http` | Inferred from `url` |
| Remote header field | `headers` | `headers` | `http_headers` |

The portable schema identifiers are `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` and `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`. These locations and fields follow [Agent Plugins 1.0.0](https://agent-plugins.org/specification). Claude's default manifest and MCP locations follow its [plugin reference](https://code.claude.com/docs/en/plugins-reference). Plugin metadata `id` becomes native `name`. Version strings need not be semver, but must fit one native cache path component: no slash, backslash, NUL, `.` or `..`.

Every skill entry maps to `skills/<name>/SKILL.md`; its assets map below `skills/<name>/`. Server names are preserved exactly, including hyphens. A format's MCP file is omitted when no servers were requested. The manifest always exists.

`agent_plugins_v2` and `claude_code_v2` retain those native layouts and add explicit package-relative supporting assets. They also preserve skill metadata as a JSON object, including the nested extension exercised by lstack; v1 retains its original string-map requirement. The [assembly design](expansion-design.md) specifies contained capture, reserved native namespaces, complete collision diagnostics and properties A1 through A7. The [real-plugin pilot](pilot.md) establishes native discovery and lifecycle for that extension.

`agent_plugins_v3` and `claude_code_v3` add bundled stdio. The CLI selects them when an author declares `type: "stdio"`. V1/v2 reject that feature and keep their previous meaning. Package-relative command and argument references resolve only against captured source files at their final package paths. Generated documents and launchers cannot satisfy a missing source reference. The compiler generates executable `.psdk/mcp/<ordinal>.sh` launchers in UTF-8 server-name order, emits one MCP document containing every remote and local entry, then checks source/generated collisions through assembly. Launcher bytes and modes enter the ordinary bundle digest and reviewed plan.

Stdio strings mean literal text. Explicit environment references are symbolic at build time; the pinned Claude profile captures them at runtime, while Codex rejects them because it filters those sources. Working directories default to the package root and must have a captured descendant when specified. Source dependencies stay explicit `assets`. Building and installing do not run the application server. The v3 installer checks `/bin/sh` and GNU `/usr/bin/env` 9.4 before mutation. [Native acceptance](acceptance.md) records the qualified clients and scopes.

`claude_code_v4` and `codex_plugin_v1` add synchronous command hooks for `SessionStart` and `UserPromptSubmit`. Both retain skills, supporting assets and local/remote MCP. A definition with nonempty `hooks` selects these formats automatically. Each declaration reuses `command`, `args`, `cwd` and `env`, adds an event, and permits an optional timeout of 1–600 seconds (default 30). Hook strings stay literal; explicit environment references reject on both clients. The handler reads the common native event JSON on stdin. Empty stdout allows normal processing; startup context and prompt blocking use the protocol in the [hook design](hooks-design.md).

Hooks produce `hooks/hooks.json` and executable `.psdk/hooks/<ordinal>.sh` files. Native import validation checks event-specific documents, exact command references, unique contiguous ordinals and packaged executable files. These bytes enter the existing bundle identity and reviewed installation plan. Codex hook trust remains the client's separate review decision.

The native Codex format uses a different MCP parser from Agent Plugins. Its generated stdio script obtains the absolute package root from the native rooted cwd before executing the same proved process body. K7 covers root-frame recovery; actual shell checks include trailing newlines and a declared cwd below the package root. Its installer also checks GNU `/bin/pwd` 9.4. See the [selected representation](hooks-design.md) and its evidence limits.

`claude_code_v5` and `codex_plugin_v2` retain those features and add agents. Nonempty `agents` selects them automatically. Prompts are captured through the existing contained-file boundary, decoded as strict UTF-8 and normalized only at their outer whitespace. G1-G8 preserve the description, prompt, qualified identity, selected native model and shell policy. Claude receives canonical Markdown frontmatter; Codex receives canonical TOML. Imported native agent files are reparsed and rerendered to verify their complete bytes, paths and non-executable mode. Older formats reject nonempty agent declarations and preserve their earlier commitments.

Agent authoring uses `description`, relative `prompt`, optional two-client `models` and optional `shell`. No generated instruction silently drops an unsupported control. The [agent contract](agents-design.md) records native semantics and the Installer's ownership of Codex companion files.

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

The portable format rejects that reference as `unsupported_mcp` with an `environment_reference` reason. Claude renders the header as `Bearer ${DOCS_TOKEN}`. An environment reference with an empty prefix renders only `${NAME}`. Neither operation reads an environment variable.

This difference is required by the primary contracts. [Agent Plugins](https://agent-plugins.org/specification#721-discovery-and-configuration) requires literal remote headers and defines no portable credential-reference field. [Claude](https://code.claude.com/docs/en/mcp#environment-variable-expansion-in-mcp-json) expands environment references in headers. This corrects the earlier design's claim that placeholder strings were portable.

For Claude, a literal value or literal prefix containing `${` is rejected with `literal_expansion`; the renderer cannot promise to preserve it literally. The portable target preserves such strings as literal text. Both targets reject header names that collide under ASCII case folding. Diagnostic header names use the lowercase comparison key. Header names and literal text follow the field syntax in [HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-fields).

The initial endpoint schema requires HTTPS, except HTTP to `localhost` or loopback IP literals. User information and fragments are excluded. URLs are literal; canonical URLs containing `${` are rejected rather than acquiring a different meaning in Claude. Environment references are supported only through explicit header objects. Environment-variable availability, native credential policy, and successful authentication remain host checks.

## Paths and ordering

Both initial formats use an ASCII case-folded comparison key for path collisions. Identical keys collide even when contents match. A key also collides with a descendant when the ancestor is a file. The diagnostic reports the shorter comparison key. This rule includes non-adjacent sorted entries: files `a`, `a-b`, and `a/c` still conflict at `a`.

The model rejects these collisions before returning files. It also rejects two skills with the same name, since both would produce the same entry path. `PackagePath` consists of nonempty segments separated by `/`, with no dot segments, backslashes, NUL, or initial drive prefix. `SkillName` is a single segment. The Lean path type carries this grammar as a proposition; constructors prove that generated and copied paths satisfy it. The wire decoder checks the same grammar before constructing a path.

Accepted files use unsigned UTF-8 path ordering, as required by [identity encoding](identity.md). Issues are deduplicated and sorted by tag, then collision path or server, then reason tag and header. Native filesystem rules can add aliases beyond ASCII case folding. `Installer` must check those rules against the actual host before mutation.

## Materialization and proof limits

Copy entries resolve to the captured bytes with the specified executable bit. Generated objects use the same RFC 8785 encoder specified for identity, with no trailing newline and an executable bit of false. The compiler validates the resulting native documents against pinned format rules before returning a byte-complete `Bundle`. Native CLI validation is an acceptance check; building a package does not require an installed host.

The model's content identity abstraction supports B2 only if the content table faithfully supplies the captured bytes. Filesystem checks, YAML parsing, canonical URL production, standard JSON encoding, hashing, and native validation need their own acceptance checks. Native format validation remains distinct from session loading and MCP authentication.

`CompilerModel.OracleRequest` and `CompilerModel.OracleResponse` define the version 1 `render` wire. The same executable handles lifecycle requests. The 15 frames in [compiler examples](examples/compiler.ndjson) specify files and rejection cases; all agree with the running model. [Generated compiler vectors](../../spec/vectors/compiler.ndjson) retain actual oracle responses. File digests remain symbolic captured identities.

The Lean gate exercises 100 reordered inputs, including Unicode path ordering and simultaneous rejections, and rejects 39 malformed compiler requests. TypeScript conformance additionally checks 1,920 rendering permutations and 48 Schema-generated normalized MCP cases. Focused compiler and boundary tests cover actual bytes, executable bits, source links, snapshots, native validation and canonical identity.

The initial source-capture implementation qualifies Linux. It checks containment using the opened file descriptor and compares file size and nanosecond modification/change timestamps around the read. Other platforms need an equivalent qualified capture primitive.

[Bundle acceptance](bundle.md) specifies the compiler-owned checks reused when importing a byte-complete package for installation. Its `checkBundle` model compares the claimed and recomputed digest and checks the committed path sequence. It reuses the renderer's collision and ordering rules. It never sorts an imported artifact or substitutes a file identity for its byte payload.
