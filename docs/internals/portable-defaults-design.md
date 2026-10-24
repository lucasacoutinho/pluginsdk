# Portable build defaults

The [Windows SDK gate](portable-sdk-windows-lifecycle-acceptance.md) closes admission and the complete user-scope lifecycle for both portable formats. The [automatic build acceptance](portable-defaults-acceptance.md) connects that native evidence to the existing author workflow.

## Progress

- [x] Trace build, preview and native profile selection.
- [x] Compare designs and select the existing automatic workflow.
- [x] Proceed under the authorized milestone work.
- [x] Prove format selection and pass TypeScript oracle conformance.
- [x] Integrate selection and register the four qualified user profiles.
- [x] Verify normal CLI builds reproduce the native-qualified bundle bytes.
- [x] Compare the implementation with the selected design.

## Caller first

```sh
npx pluginsdk build
npx pluginsdk preview
```

An existing definition containing local stdio MCP selects the portable Claude and Codex formats. No SDK wrapper file, new format flag or platform branch is required. Preview already targets user installations and calls the same recommendation function as build.

## Designs considered

Adding a portable-mode option would leave the older format as the default and require authors to coordinate flags across build and preview. It would duplicate compatibility decisions in project configuration and CLI wiring. This option is rejected.

The selected design keeps automatic selection in one proved pure function. It receives the existing client and three feature facts derived from the validated plugin. Agents take precedence, then hooks, then local stdio MCP, then basic content. Only the stdio-only branch changes to portable formats. Hooks and agents retain their existing formats because the portable formats do not support those features. Basic definitions retain their existing outputs.

The profile table registers exactly the four user rows already exercised by the private candidate: Claude 2.1.304 and Codex 0.163.0 on Linux and Windows. Project profiles remain basic, matching their current supported features. Other versions and clients keep their existing qualification requirements.

## Contract and acceptance

`contracts/BuildFormat.ts` owns the schema-derived feature input and oracle wire. `spec/PluginSdk/Compiler/BuildFormat/` proves BF1–BF4, which cover every Boolean feature combination for both clients. The model returns the existing catalog package-format enum. The wire reuses the existing client decoder and package-format encoder.

`src/project/build-format.ts` implements the policy after proof and oracle acceptance. `src/project/build.ts` retains its public recommendation signature and derives the three facts from the plugin. Build and preview continue to call that single recommendation. Profile registration changes data, using the already qualified compatibility selector.

Acceptance requires all sixteen finite inputs against Lean, malformed-input refusal, project-level feature projection checks, and exact byte comparison of normal CLI build outputs with the native-qualified g1/g2 bundles. The production profile module must match the qualified private module. Runtime and Installer code remain unchanged.

Native support is scoped to the documented clients, versions and user installations. macOS remains deferred because no host is available. This change does not enable Windows hooks or agents.
