# Portable stdio native acceptance

One operating-system-independent definition builds both Claude and Codex packages through `Compiler.build`. Each package contains 13 files: the shared runtime, three process descriptors, three executable POSIX sidecars, four source assets and two native JSON records. Authors supply no launcher, SDK entry point or operating-system branch.

This checkpoint qualifies those exact SDK-built packages in native client sessions. SDK installer plan/apply, update, replay and removal qualification remains open for the portable formats. Enabled profiles and automatic build selection are unchanged.

## Root binding correction

Codex 0.163.0 does not expand `${PLUGIN_ROOT}` arguments in its `.codex-plugin`/`.mcp.json` compatibility format. The first SDK package failed before the MCP server started. Removing the native `cwd` alone exposed the same literal placeholder in the runtime arguments. A diagnostic exec replacement recorded those arguments without recording ambient values.

The corrected declaration uses `cwd: "."`, which Codex resolves against the installed plugin, with `.psdk/runtime/process.mjs` and `"."` as the entry and root arguments. The runtime resolves an absolute root or exactly `"."` once; it refuses other relative roots. Claude retains its expanded `${CLAUDE_PLUGIN_ROOT}` entry/root arguments and omits native `cwd`. Existing format encodings remain unchanged.

PL5 and its Lean model now state those exact client bindings. All **277 property proofs** pass. Ten authored launcher vectors and fourteen authored MCP vectors agree with Lean and TypeScript. The focused successor gate passes **23 tests across four files**, including refusal of another relative root and execution from the package root. All 19 scoped TypeScript entries pass typechecking, Effect diagnostics and lint; Effect reports zero errors, warnings or messages. SDK production emission passes.

The deterministic runtime has 323,519 bytes and SHA-256 `9d1c4f65bd1329f9a9f9dd3679a74ce2b10478cf3182310e71b8ec655d91e0c2`. The preceding [runtime integration record](portable-process-runtime-acceptance.md) retains its separate 54-test boundary. The successor pure checkpoint is `.audit/probes/portable-stdio-binding/pure-acceptance.json`, SHA-256 `e0baa815389ba6ba4c15e92d9b59deec848202d941759e98186876e1dbc67094`.

## Native results

The pinned clients are Claude Code **2.1.304** and Codex **0.163.0**, with Node **24.18.0**. Both use fresh isolated homes and marketplaces. The fixture checks empty arguments, quotes, trailing backslashes, newlines, Unicode, shell metacharacters, literal environment values, packaged file arguments and server working directories.

| Client and platform | Observed result | Shutdown scope |
| --- | --- | --- |
| Claude, Linux | All three servers connect; exact invocation values pass. | Direct and wrapped servers terminate naturally. The persistent grandchild survives its server. |
| Codex, Linux | All three servers expose `echo`; three actual calls return `portable:safe-marker`. | All servers and persistent descendants terminate naturally before namespace exit. |
| Claude, Windows x64 | All three servers connect; each records stdin EOF. | All 57 tracked processes terminate; 171 wait/observation/close rows validate. |
| Codex, Windows x64 | All three servers expose `echo`; three actual calls return `portable:safe-marker`. | All 39 tracked processes terminate; 117 wait/observation/close rows validate. |

Codex starts each server twice across installation and app-server discovery. Each run creates a persistent descendant in the descendant case. No Codex EOF event was observed; termination evidence does not establish stdin EOF.

Claude's Linux grandchild behavior also occurs with the previously qualified `claude_code_v3` encoding and the same backend. Its accepted scope is startup and direct-process shutdown. The strict harness records the surviving grandchild as a failure and stops before removal. Exiting the private PID namespace drains it; that cleanup does not count as native-client shutdown. The portable runtime makes no independent descendant-lifetime guarantee.

## Ownership and evidence

Linux runs in private user, network, PID and mount namespaces. The controller retains its child handle and waits for actual closure. Successful shutdown requires no remaining live processes before namespace exit. No forced native-client termination was needed.

Windows retains every process birth before debug resume and identifies it by PID and creation time. Each retained process reaches a terminated wait result, supplies the matching terminated image witness, then closes its handle. Both owning jobs finish normally with zero active processes. All **96 process handles** close before the owned scratch installation is inventoried and removed. Unknown earlier scratch roots and the retained dependency source remain untouched.

Codex filters the ambient fixture evidence variable. An external ancestor marker supplies the log directory to the fixture without modifying either SDK package. The fixture records only the variable's presence; it never records an inherited value. Claude sees it and Codex does not.

Evidence is retained under `.audit/probes/portable-stdio-binding/`: exact bundles and package files, `linux-validation.json`, `linux/*/evidence/`, `windows/main-validation.json`, per-client retained evidence and `windows/cleanup.json`. Earlier failed packages and the Claude Linux baseline remain under `.audit/probes/portable-stdio-native/`, `portable-stdio-cwd/` and `portable-stdio-logged/`; a manually overridden Codex control is explicitly separate from SDK acceptance.

## Remaining boundary

Next, qualify portable runtime admission and SDK install/update/replay/remove through a private candidate before changing production profiles or defaults. Windows hooks, agents and source symbolic links remain open. macOS has no available host. CI, package-consumer and release-wide checks, publication, third-party authentication and Grok native testing remain deferred.
