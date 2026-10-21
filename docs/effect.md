# Effect conventions and tooling

The implementation pins Effect 4.0.5. Its installed authoring guide and [v4 documentation](https://effect.website/docs/v4/getting-started/) define the module patterns below. Dependencies, TypeScript configuration and diagnostics are checked in here.

## Module patterns

- Define module interfaces with `Context.Service<Self, Shape>()`. Implement them with focused `Layer`s. Supply filesystem and process dependencies through those layers.
- Use `Effect.gen` for inline orchestration. Use named `Effect.fn` for meaningful traced operations and `Effect.fnUntraced` for reusable work without tracing. Pure model functions stay ordinary total functions.
- Define data with `Schema` and derive TypeScript types from `.Type`. Decode configuration, saved plans, records, and native output at their input seams. Use `Schema.decodeUnknownEffect` inside Effect. Treat excess wire fields as errors.
- Use tagged unions for choices and `Schema.TaggedError` for expected operational failures. Keep `unknown` in external input or diagnostic causes. It never becomes the module's entire error or requirements channel.
- Use `Effect.catchTag` for an explicitly recoverable failure. Preserve defects and interruption. A broad catch must not turn an unknown native outcome into success.
- Manage temporary directories, process handles, and locks with `Scope` and acquisition/release. Retry read-only inspection only where appropriate. A native mutation is governed by the lifecycle model, rather than a generic retry schedule.
- Run effects at the application entry. Library modules do not call `runPromise` or create hidden runtimes. Logs and spans omit credentials, expanded headers, and package contents.

These choices follow the packaged Effect guide. The [code-style guidance](https://effect.website/docs/v4/code-style/guidelines) also recommends explicit callbacks where point-free composition would lose generic inference.

## Exhaustive matching

The contract unions use `type` to share a simple wire with Lean. Their schemas expose exhaustive `.match` helpers through `Schema.toTaggedUnion("type")`. For more involved matching, use Effect's `Match` module:

```ts
import { Match } from "effect"
import type { Decision } from "../contracts/Lifecycle.ts"

declare const decision: Decision

const label = Match.value(decision).pipe(
	Match.discriminatorsExhaustive("type")({
		change: ({ change }) => change.type,
		unchanged: () => "unchanged",
		blocked: ({ reason }) => reason,
		pending: () => "pending"
	})
)
```

Adding a variant must break an incomplete match at compile time. Core logic does not use a catch-all branch. The custom [Oxlint rule](../scripts/lint-patterns.mjs) rejects every `switch` statement. [Effect's matching documentation](https://effect.website/docs/v4/code-style/pattern-matching) explains the exhaustiveness guarantee.

## Compiler and diagnostics

The installed pairing is `effect@4.0.5`, `@effect/tsgo@0.54.1`, and native `typescript@7.0.2`. The [tsgo support table](https://github.com/Effect-TS/tsgo#supported-package-versions) lists that TypeScript release. `npm ci` runs the project's `prepare` script to patch native TypeScript with the pinned Effect compiler.

`npm run typecheck` invokes that patched compiler. `npm run diagnostics` runs `effect-tsgo diagnostics --strict --project tsconfig.json`. The required check rejects warnings and errors. Correctness diagnostics include floating effects, missing errors or requirements, unsafe assertions, duplicate Effect packages, and obsolete APIs.

Configure your editor to use effect-tsgo as its sole TypeScript language server. `npm exec -- effect-tsgo get-exe-path` locates the project executable. The [installation guide](https://github.com/Effect-TS/tsgo#installation) documents editor integration; editor installation is outside the package.

The tsconfig enables strict checking, unchecked indexed access, exact optional properties, unused declarations, verbatim module syntax, and erasable syntax. The named unstable v4 filesystem, process, CLI, test and devtools APIs are deliberately allowed and pinned. Oxlint checks syntax and repository patterns; it does not duplicate Effect's language-service diagnostics.

## Runtime devtools

The [Effect editor extension](https://effect.website/docs/v4/getting-started/devtools) is separate from the project language server. It can inspect fiber context, span stacks, and fibers, and pause on a defect. Its installation belongs to the user's editor setup, not the SDK package.

Named spans cover `Compiler.build`, `Installer.plan`, `Installer.apply` and native execution. The Node entry exports `devtools(url)`, which returns Effect's devtools layer. An application can supply it to its runtime while using an installed Effect editor extension. Connections are opt-in; SDK construction starts no debug server or exporter.

## Checks

`npm run check` runs Lean proofs and wire checks, the patched compiler, Effect diagnostics, Oxlint, behavioral tests, and package-consumer acceptance. The current gate passes 55 portable tests with zero Effect diagnostics. The existing `test/conformance.test.ts` suite sends 4,210 requests to the Lean oracle. Assembly, repair and authorization run separate oracle comparisons: repair checks 18 vectors and 40 generated requests; authorization checks 49 authored vectors, 120 generated combinations and a three-call revocation sequence. The package check installs the tarball with production dependencies in a fresh directory, builds through the installed CLI and SDK, and compiles a consumer against its exported declarations, including reviewed repair and existing ready plans.

The strengthened lstack lifecycle pilot passed on Claude Code 2.1.304 in user and project scopes and Codex 0.163.0 in user scope. Native acceptance covers 39 tests, including explicit repair in Claude user/project and Codex user scope, plus the installed-package lifecycle check.

`npm run test:native` separately exercises the qualified host binaries in isolated homes. [Acceptance](acceptance.md) distinguishes native discovery and loopback MCP checks from provider authentication and model use.
