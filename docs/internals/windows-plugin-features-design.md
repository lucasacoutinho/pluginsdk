# Windows hooks and agents

The author keeps one definition, hook program and agent prompt. `pluginsdk build` produces the Claude and Codex packages; `preview` uses their supported user installations. Adding Windows support must not add a wrapper file, operating-system option or separate installation workflow for the author.

## Progress

- [x] Trace current rendering, process launch and companion ownership.
- [x] Compare native-binding approaches and select the next premise checks.
- [x] Continue under the milestone instruction.
- [x] Establish native hook-binding premises with the unchanged portable runtime.
- [x] Prove portable hook binding and rendering contracts.
- [x] Complete strict hook oracle and TypeScript conformance before I/O changes.
- [x] Prove shared-runtime composition with MCP.
- [x] Integrate portable compilation, native validation and common admission metadata. [Compiler acceptance](portable-features-compiler-acceptance.md).
- [x] Qualify complete portable v2 lifecycles in private Linux user candidates. [Linux acceptance](portable-features-native-linux-acceptance.md).
- [x] Prove companion metadata admission, review and projection. [Pure policy acceptance](windows-companion-file-acceptance.md).
- [x] Qualify shared Windows owned-file primitives. [Component acceptance](windows-owned-file-acceptance.md).
- [x] Integrate Windows companion storage. [Adapter acceptance](windows-companion-integration-acceptance.md).
- [ ] Qualify complete SDK lifecycles and promote only evidenced profiles.
- [ ] Compare the implementation with the selected design.

## Existing flow

`src/compiler/index.ts` snapshots the author definition, captures source bytes, lowers local MCP and hook declarations into the existing process plans, and renders complete files before assembly and hashing. Legacy hook formats retain the POSIX launchers from `src/compiler/hooks/model.ts` and their exact native validator. Portable v2 formats use the native bindings described below and compose all processes around one shared runtime. Agent rendering preserves prompt, model and tool policy through the existing G1–G8 contract.

The recommendation function still selects the older hook/agent formats when those features are present. Their `processes: "posix"` capability makes the Installer require Linux, including an agent-only bundle. Windows profiles also exclude those formats before reaching that runtime check. Portable v1 retains its MCP-only contract. The new v2 formats compile all three features and now have private Linux user qualification; production profiles do not yet admit them. Existing format identities and saved bundle bytes retain their meaning.

Codex agent installation additionally manages TOML companions in its user `agents/` directory. Their `psdk_<plugin>_<agent>.toml` filenames avoid the colon in the logical role identity. `role-files.ts` owns inventory and logical-name policy; `role-storage.ts` selects the POSIX backend or shared Windows file owner. The [adapter gate](windows-companion-integration-acceptance.md) qualifies metadata, replacement and removal. Full SDK lifecycles through a private Windows worker must precede profile promotion.

`Installer.plan/apply` continues to own the complete lifecycle. Native Codex hook review remains separate from package approval. PluginSDK must neither grant trust nor equate installed hooks with executed hooks.

## Native binding candidates

Per-platform shell scripts would require a build target or runtime selection among Bash, cmd and PowerShell. The native command text would then duplicate shell quoting and root expansion rules. This adds author decisions or parallel execution mechanisms. Reject that shape.

A uniform shell command for both clients could launch Node with a constant JavaScript bootstrap that reads the plugin root from the environment. This keeps root values out of shell text, but still routes Claude through a shell even though its native hook protocol has an executable-and-arguments form.

The selected premise candidate uses each client's native boundary and the existing portable process data/runtime. Claude receives `command: "node"` and a separate argument vector. Codex receives a constant Node bootstrap because its pinned runner accepts shell command text. The bootstrap reads the plugin root from the environment and imports the existing runtime after constructing its entry arguments. It inserts no package root or authored value into shell text and starts no additional Node child. A new runtime or independently implemented process interpreter is unnecessary if these premises hold.

Claude's [hook reference](https://code.claude.com/docs/en/hooks#command-hook-fields) documents direct argument execution and literal placeholder substitution. Codex's [pinned command runner](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/hooks/src/engine/command_runner.rs) builds a shell invocation, uses cmd by default on Windows and supplies environment overrides. Those sources guide the experiment; they do not qualify an emitted plugin.

## Premise acceptance

Private fixtures use the unchanged runtime with SHA-256 `9d1c4f65bd1329f9a9f9dd3679a74ce2b10478cf3182310e71b8ec655d91e0c2` and the existing proved process-data compiler. They check literal argv, stdin, cwd, environment values, output and process closure at a package path containing spaces, Unicode and shell metacharacters. A sentinel detects evaluation of the root as shell text.

The Windows cases cover Claude's actual direct-argument plugin hook and the Codex-style constant command under cmd and PowerShell. A Linux shell control checks the same bootstrap with the POSIX runtime replacement. A temporary Claude `Setup` hook can establish the direct-execution primitive without a model call; it does not qualify the product's `SessionStart` or `UserPromptSubmit` events.

The controller derives its ownership checks from the qualified Windows lifecycle runner. It creates a fresh short stage with a full UUID marker, checks the known dependency source before and after copying, and retains each process birth before resume through terminal observation and handle close. Existing stages and protected roots remain untouched. A failed or timed-out run supplies no passing evidence.

These premise checks preceded the portable hook contract. Complete Windows SDK acceptance must still prove real startup context, prompt blocking before a provider request, native hook trust, install/update/replay/remove, exact payload bytes and process shutdown. [Companion adapter acceptance](windows-companion-integration-acceptance.md) now covers Windows metadata and file operations. macOS, Grok native tests, third-party authentication, CI and release checks retain their deferred status.

The [binding acceptance record](portable-hook-binding-acceptance.md) establishes these premises on Linux and Windows. Claude's real `Setup` event used the direct argument form. The constant Codex command preserved the process descriptor under both cmd and Windows PowerShell. The [pure renderer gate](portable-hooks-model-acceptance.md) proves that binding's composition with events, descriptors and sidecars. The [shared-runtime gate](portable-feature-composition-acceptance.md) proves complete MCP/hook composition and passes strict oracle and TypeScript conformance. [Compiler integration](portable-features-compiler-acceptance.md), [private Linux lifecycles](portable-features-native-linux-acceptance.md) and [Windows companion integration](windows-companion-integration-acceptance.md) follow those gates. Native Windows product events and complete feature lifecycles remain open.
