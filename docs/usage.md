# Build and review a plugin locally

Build the included review skill, inspect the saved installation plan, then apply or remove it from a supported host configuration.

Run these commands from the repository root. The checkout includes [`examples/definition.json`](../examples/definition.json), the [review skill](../examples/skills/review/SKILL.md), and its [checklist](../examples/skills/review/references/checklist.txt).

## Run both clients

On Linux, with Node 24+, Claude Code 2.1.304 and Codex CLI 0.163.0 available:

```sh
npm ci
npm run example:cross-client
```

The [example](../examples/README.md) uses one definition to build both native packages. It installs in isolated temporary homes, verifies fresh native skill discovery and identical shared bytes, checks replay, and removes the installations. Bundles and a report remain in `.pluginsdk/cross-client/`. It performs no model turns or provider authentication.

## Install the example in each client

After running the example, the bundles can be reviewed for installation in your regular configuration homes:

```sh
node dist/src/cli.js plan .pluginsdk/cross-client/claude_code.bundle.json \
	--host claude_code --home "$HOME/.claude" \
	--out .pluginsdk/cross-client/claude.plan.json
node dist/src/cli.js show .pluginsdk/cross-client/claude.plan.json
node dist/src/cli.js apply .pluginsdk/cross-client/claude.plan.json

node dist/src/cli.js plan .pluginsdk/cross-client/codex.bundle.json \
	--host codex --home "$HOME/.codex" \
	--out .pluginsdk/cross-client/codex.plan.json
node dist/src/cli.js show .pluginsdk/cross-client/codex.plan.json
node dist/src/cli.js apply .pluginsdk/cross-client/codex.plan.json
```

Review each `show` result before its `apply`. The configuration directories must exist. A ready plan names the client, destination, native version, bundle digest and exact file paths. In fresh client sessions the installed plugin supplies the `review` skill with its shared checklist. Applying changes to your regular homes is separate from the isolated demonstration above.

## Build the bundle

Install the locked dependencies and compile the CLI:

```sh
npm ci
npm run build
mkdir -p .pluginsdk
```

Build the example for Claude Code:

```sh
node dist/src/cli.js build examples/definition.json \
	--root examples \
	--format claude_code_v1 \
	--out .pluginsdk/review-kit.bundle.json
```

The output is a complete `Bundle`: schema version, plugin ID, format, digest, and files with paths, Base64 content and executable bits. The digest commits to those bytes. Bundle and plan files contain the complete package, so keep secrets out of the author definition.

For Codex, build the same definition with `--format agent_plugins_v1`, then use `--host codex` and its configuration home when planning.

Use `--json` to print the encoded schema value to stdout. The normal build summary prints the plugin ID, digest, file count, and output path.

The [Effect SDK example](../examples/sdk.ts) uses the checkout's public contract modules so it typechecks before `dist` exists. The package exposes the same services as `pluginsdk/Compiler`, `pluginsdk/Installer`, and `pluginsdk/node`.

## Choose a supported host configuration

The qualified profiles target Linux with Claude Code 2.1.304 in user or project scope, and Codex CLI 0.163.0 in user scope. Project scope is supported only for Claude Code. Grok Bot and Meta Muse are unsupported.

Pass the host's configuration directory to `--home`. For example, use `$HOME/.claude` or `$HOME/.codex`, not `$HOME` itself. The directory must already exist. Keep it separate from any work configuration while evaluating a native change.

Run `npm run test:native` with both pinned host binaries installed. The harness creates isolated temporary homes; it does not use your host configuration. CI runs the portable proof, compiler, diagnostics, lint, unit and build checks.

## Plan and inspect an installation

Create a user-scope Claude plan:

```sh
CLAUDE_HOME="$HOME/.claude"
node dist/src/cli.js plan .pluginsdk/review-kit.bundle.json \
	--host claude_code \
	--home "$CLAUDE_HOME" \
	--out .pluginsdk/review-kit.plan.json
```

The command writes a `Planning` value. Inspect the summary before applying it:

```sh
node dist/src/cli.js show .pluginsdk/review-kit.plan.json
```

Only a `ready` result can be applied. `unchanged` means the requested state already holds. `blocked` and `pending` results need recovery before you plan another change. The summary includes the intent, destination, native version/profile, before-state, current ownership, plan ID, new bundle digest, and file paths with executable bits. It does not print file contents or expanded credentials.

To plan a Claude project installation, add `--project "$PWD"`. That flag selects project scope. Do not use it for Codex.

## Apply the reviewed plan

Applying a ready plan is the explicit native action. The CLI does not ask for a second confirmation:

```sh
node dist/src/cli.js apply .pluginsdk/review-kit.plan.json
```

The result distinguishes an installed plugin, a removal, `not_applied`, and an uncertain outcome. Stop and inspect host state when the CLI reports `uncertain`.

## Repair an interrupted operation

Use the saved plan from the interrupted operation to request a cleanup review:

```sh
node dist/src/cli.js repair .pluginsdk/review-kit.plan.json \
	--out .pluginsdk/review-kit.repair.json
```

`repair` accepts the interrupted `ReadyPlan` or the current `RepairPlan`. It writes a new `Planning` value and never applies it. Review the cleanup plan, then apply it:

```sh
node dist/src/cli.js show .pluginsdk/review-kit.repair.json
node dist/src/cli.js apply .pluginsdk/review-kit.repair.json
```

The review shows the new plan ID, interrupted plan ID, current pending plan ID, physical target, host version and profile, observed residual and fingerprint, and intended action. `none` means the review authorizes no native command. `remove marketplace` means it authorizes removal of the owned SDK marketplace.

Repair proceeds only when the host process is quiescent and complete inventory proves that no plugin uses the SDK marketplace in any scope. The requested scope must also have no same-name plugin or configuration entry. Any remaining marketplace registration must still point to the SDK path and match its retained catalog. Unknown, unowned, changed, or active state blocks the review. Resolve the host state before requesting another cleanup review. Repair does not change host sign-in or provider authentication.

After applying a cleanup plan, build or reuse the retained bundle and create a fresh installation plan:

```sh
node dist/src/cli.js plan .pluginsdk/review-kit.bundle.json \
	--host claude_code \
	--home "$CLAUDE_HOME" \
	--out .pluginsdk/review-kit.fresh-plan.json
node dist/src/cli.js show .pluginsdk/review-kit.fresh-plan.json
node dist/src/cli.js apply .pluginsdk/review-kit.fresh-plan.json
```

## Plan and apply removal

Create a removal plan for the same plugin and destination:

```sh
node dist/src/cli.js remove review-kit \
	--host claude_code \
	--home "$CLAUDE_HOME" \
	--out .pluginsdk/review-kit.remove-plan.json
```

Inspect the ready plan, then apply it:

```sh
node dist/src/cli.js show .pluginsdk/review-kit.remove-plan.json
node dist/src/cli.js apply .pluginsdk/review-kit.remove-plan.json
```

The CLI stores plans and bundles as JSON artifacts. Keep them with the review record for the change. See [native execution and durability](runtime.md) for the lifecycle and recovery rules, and [the Lean contract](../spec/README.md) for the formal models and proof limits.
