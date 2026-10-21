# pluginsdk

Typed plugin authoring, reproducible packages, and reviewed installation changes across agent apps.

Run the [Claude Code and Codex example](examples/README.md): `npm run example:cross-client`. One definition produces both native packages. The command installs them in isolated homes, verifies native discovery and identical shared content, then verifies removal. The [SDK usage sample](examples/sdk.ts) shows the build and plan calls; native verification lives in `scripts/`.

The [organization design](docs/organization-design.md) describes central release management, distribution and access policies for existing application integrations across Claude, ChatGPT, Cursor and Grok Bot. Existing repositories and deployment infrastructure remain the starting point; plugin/MCP code management is a possible future extension.

The alpha builds existing Agent Skills, supporting files and remote HTTP MCP definitions for Claude Code and Codex. Its Effect implementation follows 55 Lean proofs and a running conformance oracle. The previous checkout remains in the workspace's `.references` archive, which is excluded from distribution.

Start with the [design](docs/design.md). The contracts define two Effect modules:

- [Compiler](contracts/Compiler.ts): `build` turns a [Plugin](contracts/Plugin.ts) into a self-contained package.
- [Installer](contracts/Installer.ts): `plan` describes an installation change, and `apply` executes a reviewed plan.

[The Lean project](spec/README.md) proves lifecycle P1-P14, rendering B1-B8, bundle checks V1-V4, asset assembly A1-A7, repair R1-R8, invocation authorization U1-U8 and release catalog C1-C6. They run through one NDJSON oracle. The proof gate passes `55/55`; [explicit repair](docs/repair-design.md) has qualified native acceptance for proven absence and orphaned SDK marketplaces. The [authorization](docs/authorization-design.md) and [catalog](docs/catalog-design.md) models are internal foundations; authentication, artifact verification, storage and organization distribution remain integration work. The [LDD specification](docs/ldd.md) describes the development order.

[Lifecycle](contracts/Lifecycle.ts) and [CompilerModel](contracts/CompilerModel.ts) expose the pure models implemented with exhaustive Effect `Match`. The [conformance suite](test/conformance.test.ts) compares TypeScript with 4,210 decoded Lean oracle requests. [Effect conventions](docs/effect.md) cover the pinned toolchain, schemas, matching and optional devtools.

The [compiler contract](docs/compiler.md) defines native layouts and header compatibility. The compiler captures bytes and executable bits, validates skills, rejects source escapes, and returns a content-addressed bundle. Portable headers are literal; Claude additionally supports explicit environment references.

[Identity encoding](docs/identity.md) defines bundle and plan preimages. Journal revisions retain completed attempts and distinguish replay from intentional replanning. The [replay examples](docs/examples/replay.ndjson) agree with the oracle's [generated vectors](spec/vectors/lifecycle.ndjson).

[Bundle acceptance](docs/bundle.md) defines imported-package checks and private byte snapshots. `Installer.plan` can report `BundleRejected`; callers do not coordinate another verification step.

The initial native profiles qualify Linux, Claude Code 2.1.304 in user and project scope, and Codex CLI 0.163.0 in user scope. The [real lstack pilot](docs/pilot.md) passes installation, discovery, update and removal in all three environments, preserving all 34 skills and their supporting files. Grok Bot and Meta Muse return `DestinationUnsupported`; [host research](docs/host-research.md) records the missing management contracts.

Follow the [usage guide](docs/usage.md) to build, review, apply and remove the example. `npm run check` runs Lean proofs, TypeScript, Effect diagnostics, lint, tests, and external package-consumer acceptance. `npm run test:native` adds isolated real-host lifecycle, discovery, MCP and crash-recovery checks. The [roadmap](docs/roadmap.md) records acceptance and release limits. The working package is `pluginsdk@0.1.0-alpha.0`, licensed under [MIT](LICENSE) and kept private; public registry publication is deferred.
