# Review kit for Claude Code and Codex

The plugin consists of [definition.json](definition.json), the [review skill](skills/review/SKILL.md) and its [checklist](skills/review/references/checklist.txt). Edit those files once; PluginSDK packages the same content for both clients.

The optional [SDK usage sample](sdk.ts) is 21 lines. It imports that definition and calls `Compiler.build` and `Installer.plan` for the selected client.

To build and verify both clients from the repository root on Linux:

```sh
npm ci
npm run example:cross-client
```

Requires Node 24+, Claude Code 2.1.304 and Codex CLI 0.163.0 on `PATH`.

The command builds both packages, installs them in temporary homes, checks native discovery and identical shared bytes, verifies replay, and removes the installations. The verification machinery lives in [scripts/verify-cross-client.ts](../scripts/verify-cross-client.ts); it is not part of the authored plugin.

Generated bundles and results are in `.pluginsdk/cross-client/`:

- `claude_code.bundle.json`
- `codex.bundle.json`
- `report.json`

The native manifests differ, so the two bundles have different digests. The skill and checklist bytes are identical. To keep the plugin installed in your regular clients, follow the [plan, review and apply commands](../docs/usage.md#install-the-example-in-each-client).
