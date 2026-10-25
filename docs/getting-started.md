# Build and use your first plugin

Build a plugin that drafts release notes from Git history, then preview the same skill in Claude Code and Codex.

## Prepare the CLI

Use Node 24+ on Linux and a [supported Claude Code or Codex installation](compatibility.md). Clone the release notes example from the [examples repository](https://github.com/lucasacoutinho/pluginsdk-examples):

```sh
git clone --branch release-notes git@github.com:lucasacoutinho/pluginsdk-examples.git release-notes
cd release-notes
npm ci
```

The CLI is a private alpha. `npm ci` installs and builds it from the PluginSDK Git repository, so you need read access to that repository. Public npm distribution remains deferred.

## Build and preview

```sh
npx pluginsdk build
npx pluginsdk preview
```

Both commands find `definition.json` in the current directory. The definition and skill files are all this plugin needs.

`build` captures production packages for both clients in `.pluginsdk/build`. `preview` builds the current source and installs a separate development plugin in available local clients. The command prints its name and each client's result. An unsupported installed client stops the preview before installation changes.

Open a fresh Claude Code or Codex session in a Git repository. Ask:

> Use the release-notes skill from my development plugin to draft release notes since the latest release tag. Include breaking changes and upgrade steps. Keep the draft in your response.

If you have several release notes plugins installed, include the development plugin name printed by `preview`.

The [skill](https://github.com/lucasacoutinho/pluginsdk-examples/blob/release-notes/skills/release-notes/SKILL.md) checks the actual repository history and uses the packaged [template](https://github.com/lucasacoutinho/pluginsdk-examples/blob/release-notes/skills/release-notes/references/template.md). Both clients receive the same files.

## Change the output once

Edit `skills/release-notes/references/template.md`. Add an operational changes section, then run:

```sh
npx pluginsdk preview
```

Open fresh client sessions. Both previews now use the edited template. Preview changes do not change the production build you captured earlier.

## Publish for your team

Add a `publish` destination to `definition.json`, increment the version for the changed content, then run:

```sh
npx pluginsdk build && npx pluginsdk publish
```

See [Publish a plugin](publishing.md) for the Git marketplace configuration and client installation commands.

## Remove the preview

```sh
npx pluginsdk preview --remove
```

Continue with [Define a plugin](authoring.md) to package your own workflows. [Manage installations](usage.md) covers saved installation reviews and recovery.
