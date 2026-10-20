# Build and review a plugin locally

Build the included review skill, inspect the saved installation plan, then apply or remove it from a supported host configuration.

Run these commands from the repository root. The checkout includes [`examples/definition.json`](../examples/definition.json), the [review skill](../examples/skills/review/SKILL.md), and its [checklist](../examples/skills/review/references/checklist.txt).

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
