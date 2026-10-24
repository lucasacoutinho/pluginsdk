# Codex project acceptance

Basic packages qualify on Linux with Codex 0.163.0 and Node 24.18.0. Authors use the existing definition and build command, then `plan --project` and `apply`. The adapter keeps the ordinary Codex home and changes only its owned project registration. [User instructions](../usage.md#install-for-a-project) cover installation and prerequisites.

## Formal contract and local checks

[J1-J6](../../spec/PluginSdk/Installer/ProjectConfig/Properties.lean) specify exact admission, rejection reasons, preservation of foreign segments, desired content, unchanged documents and replay. Their Lean proofs, strict oracle and independent vectors preceded the TypeScript port. The wire check passes 24 authored cases, 46 malformed requests and three numeric schema cases. TypeScript conformance compares 2,496 generated requests with Lean.

The focused pass covers 39 tests in seven files: project model, TOML editing, physical file replacement, plan commitments, native profiles, role-file inspection and companion plans. The source build, scoped TypeScript check and scoped Oxlint pass. The existing CLI and publication CLI tests also pass. CI, package-consumer and release-wide gates remain deferred.

The TOML tests cover canonical ownership, duplicate and malformed markers, markers in multiline strings, foreign comments and values, sealed tables, unknown controlled fields and quoted roots. File checks cover exact bytes and permissions, stale digest/mode rejection, no-clobber creation, symbolic links, special files, invalid UTF-8 and temporary-file cleanup. Plan checks bind the file basis and previous revision, and reject user-marketplace cleanup through a project repair plan.

## Native acceptance

Main-thread execution used the pinned native binary, temporary homes and two trusted Git projects in a separate network namespace. Loopback was enabled only inside that namespace. No real client home, third-party service, authentication flow or model inference was used.

The cache premise proved that ordinary fresh Codex sessions load the selected immutable cache only in project A. Project B remains unaffected. Different package bytes at the same plugin version load after switching registrations. Removing the registration hides the plugin while keeping the user configuration byte-for-byte unchanged. An empty `.codex` directory exposes the native project trust layer before a plugin config file exists.

Fifteen project cases pass through the compiled SDK CLI:

- Basic v1 and v2 install and remove; replay; same-version replacement; complete cache bytes and executable bits; unrelated project settings and user config preservation.
- Rejection of stale config reviews, untrusted projects, disabled plugins, unowned selectors, changed cache bytes and changed registration values. Inspection preserves the changed bytes.
- Concurrent reviewed writers cannot overwrite another plugin's block. A fresh review can add the second plugin while retaining the first.
- Caller and worker termination before and after activation for installation, replacement and removal. Fresh sessions load the expected old or new content. Resume and replay start no additional worker.
- Both inherited lock descriptors remain open after caller death. Contenders reach the home and project locks and stay blocked until the worker finishes, including another home targeting the same project.
- An interrupted inactive operation admits a repair with no further activation, then replays its completion.
- A fresh project A session discovers the remote MCP server and completes a direct loopback tool call. Project B has no plugin tool. Removal clears the tool from a fresh A session.

Two existing Codex user-scope regression cases also pass: inherited-lock survival after caller death and orphaned-marketplace repair followed by installation and removal.

The implementation is in [project inspection](../../src/installer/project/inspect.ts), [execution](../../src/installer/project/execute.ts), [file replacement](../../src/installer/project/files/file.ts) and [TOML admission](../../src/installer/project/config/document.ts). The native cases are [lifecycle](../../test/native/project-lifecycle.test.ts), [recovery](../../test/native/project-recovery.test.ts) and [MCP](../../test/native/project-mcp.test.ts). Set `PSDK_PROJECT_COMPILED=1` to select the built CLI in that fixture. Its runtime guard requires a separate network namespace identified by `PSDK_PROJECT_OUTER_NET_NS`.

Local machine-readable evidence is retained under `.audit/probes/codex-project-source/`: `cache-premise.json`, `sdk-native.compiled.json`, `sdk-crash.compiled.json`, `sdk-repair-regression.json` and `acceptance.json`. The initial harness rejection of native skill metadata and its incorrect expectation for the CLI's `not_applied` exit status are retained separately in `sdk-native.initial.json`.

## Limits

This profile admits `agent_plugins_v1` and `agent_plugins_v2`. Project hooks, bundled stdio, agents, other versions and other platforms remain unqualified. Backend authorization and third-party authentication remain outside this acceptance.

SDK locks coordinate SDK writers. Atomic replacement does not provide compare-and-swap against arbitrary external writers. Process termination does not simulate power loss. Interrupted preparation or cleanup can leave inactive caches and temporary files; they do not activate a plugin. Retained SDK plans and revision packages are recovery evidence and have no garbage collector yet. Explicit project repair admits confirmed inactive state; active owned changes settle through their saved operation plan.
