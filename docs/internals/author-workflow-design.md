# Author workflow

The author works in a plugin directory containing `definition.json` and its skills, prompts and supporting files:

```sh
npx pluginsdk build
npx pluginsdk preview
npx pluginsdk publish
```

`build` captures production packages. `preview` builds a development variant and installs it in available local clients. `publish` reads the captured production build and chooses its destination from the definition. Publishing and local preview are separate operations.

The first publication destination is an organization Git marketplace:

```json
{
	"id": "platform-tools",
	"version": "1.0.0",
	"description": "Investigate incidents across internal services.",
	"skills": ["skills/triage-incident"],
	"mcp": {},
	"publish": {
		"type": "git",
		"repository": "git@github.com:acme/agent-plugins.git",
		"branch": "main",
		"marketplace": "acme"
	}
}
```

This destination publishes native Claude Code and Codex marketplace entries together. It uses existing Git authentication and infrastructure. Other destination kinds require concrete adapters before the definition accepts them. The SDK package itself remains private; availability through `npx` needs package access separately from publishing a plugin.

## Grounding and alternatives

The existing CLI requires a definition path and exposes catalog packing, metadata, admission and distribution as separate commands. It has no publisher. Those manager operations remain useful, but making authors coordinate them fails the intended workflow. Compiler already owns package meaning, Installer owns local ownership and recovery, and the catalog owns retained approved releases.

| Candidate | Consequence | Decision |
| --- | --- | --- |
| Rename catalog commands to `publish` | Leaves authors choosing formats, deriving metadata and coordinating storage. | Reject. |
| Run a configured shell script | Hides syntax while handing package integrity, replay and error handling back to each organization. | Reject. |
| Project commands over the existing modules, with a concrete publisher | One definition drives build, local iteration and publication. Native package and installation knowledge stay with their current owners. | Select. |

The implementation lives behind the CLI's project commands. It adds no TypeScript setup file or public provider registry. A configured destination is required for `publish`; absence never falls back to a local installation. `preview` uses a distinct development plugin ID and preserves Installer's ownership checks. Missing local clients are reported; unsupported installed versions block the preview before any installation changes.

## Build and publication contract

A build record binds the complete definition digest to the production plugin ID, version and exact package digests. Publication validates that record and each captured package. Changing the definition requires a rebuild. Markdown changes after the build do not change the captured release.

Publication history is an ordered list of unique plugin/version records. A record's digest commits to the complete native package set. A new version appends one record. Repeating identical content is unchanged, including when a newer release already exists. Reusing a version with different content blocks. Duplicate historical keys block rather than selecting an arbitrary occurrence.

The pure publication model and certificates precede its TypeScript port and Git I/O. The native indexes derive from the latest recorded publication available for each client and plugin. Publishing one client leaves the other client's last publication intact. Existing foreign marketplace entries and files must survive.

## Git obligations

Git publication prepares one complete tree and commit without checking out repository content. That commit contains immutable package directories, native indexes and the SDK publication record. One push activates them together. The commit is a direct child of the inspected branch head, or a root commit for an absent branch. An explicit Git ref lease requires that exact previous head. Although Git names that option `--force-with-lease`, this module only constructs fast-forward updates and never rewrites existing commits. Separate per-client pushes are forbidden.

The publisher reads a fresh branch, verifies its managed records and index entries, and preserves foreign paths. Existing unowned plugin entries or package paths block adoption. A concurrent branch change rejects the push; a fresh read can prove a completed identical publication or permit a new attempt. A transport failure that cannot be resolved remains uncertain. A retry always inspects the remote before creating another publication.

Acceptance uses an owned local bare repository, not a real organization's remote. It must exercise both clients' native package discovery, repeated publication, changed-content conflicts, a second version, an older-build replay, foreign entries, concurrent publishers and interrupted acknowledgement. Local preview uses isolated real client homes. CI and release-wide gates remain deferred.

## Modules and records

`ProjectDefinition` extends the compiler's `Plugin` schema with an optional Git publication destination. The compiler receives the plugin fields only. No client installation paths belong in the publication definition.

`src/project/build.ts` loads the definition, selects native formats and captures complete bundles in `.pluginsdk/build/build.json`. That record contains the definition commitment and bundle bytes. The separate client bundle files remain available for installation management.

`src/project/preview.ts` compiles a development plugin, checks all installed client versions, then plans every available destination before applying any installation. Its ID includes the source plugin name and a digest of the physical source directory. Different source directories therefore receive different development installations. `preview --remove` uses the same identity.

`src/project/publication.ts` owns the immutable history decision. Its interface accepts history and a desired publication, and returns published, unchanged or blocked. The W1–W6 properties live in `spec/PluginSdk/Publication/Properties.lean`; their concrete certificates and strict wire follow the same module structure.

`src/project/marketplace.ts` binds native package metadata and files to that decision. `.pluginsdk/publications.json` retains ordered release metadata. Packages live below `plugins/<plugin>/<release-digest>/<client>`. Before a publication, it checks retained package digests, managed index entries and path ownership. Foreign entries and files survive.

`src/project/git.ts` owns scoped Git transport and tree operations. A bare clone negotiates the repository's object format without checking out content. Tree edits use Git objects and an index in the temporary repository. After a failed push acknowledgement, a fresh inspection can confirm an identical publication; it never immediately retries a mutation.

## Progress

- [x] Ground: trace build, catalog, native installation and distribution behavior.
- [x] Sketch: compare aliases, shell delegation and project commands with a concrete publisher.
- [x] Agree: the user specifies configured publication and local preview as the author workflow.
- [x] Prove: immutable publication history and replay rules.
- [x] Port: strict oracle and TypeScript conformance.
- [x] Implement: build records, configured Git publication and local preview.
- [x] Revisit: replace manual Git initialization with a bare clone after the empty SHA-256 repository check; retain the resulting interfaces after native acceptance.

The [acceptance record](author-workflow-acceptance.md) records focused proof, CLI, Git and native checks. Other compatibility milestones remain separate.
