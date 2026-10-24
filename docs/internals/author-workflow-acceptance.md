# Author workflow acceptance

The author commands are `build`, `preview` and `publish`. They discover `definition.json` in the current directory. Publication selects the configured Git destination; preview uses separate local development installations. The user-facing instructions are in [Publish a plugin](../publishing.md).

## LDD

The Publication model has six certified properties: exact fresh-version acceptance, unchanged historical replay, exact blocking reasons, history preservation, completed-publication idempotence and unique successful history. Properties precede the model in `spec/PluginSdk/Publication`; the certificates use only standard Lean axioms.

The scoped Lake build passed for Publication proofs, wire and oracle. The certificate audit checked their exact types and axioms. The strict wire check passed 16 independently authored cases, 59 malformed requests and three numeric schema cases. The TypeScript port conformed to Lean on those cases and 780 generated small histories.

## Focused runtime checks

Source compilation with `tsconfig.build.json` and scoped Oxlint passed. Focused tests covered:

- Build capture, definition changes, invalid Git configuration, tampered bundles and duplicate client packages.
- Missing, unlaunchable and unsupported local clients without installation changes.
- CLI publication, exact captured bytes, repeated releases, version conflicts, older replay, foreign entries, client-specific releases, name collisions and changed retained packages.
- Git binary bytes and executable modes, concurrent ref rejection, a lost push acknowledgement, an unconfirmed push followed by fresh inspection, and an empty SHA-256 repository.
- Existing CLI behavior, including explicit native formats and saved installation management commands.

The commands ran the feature files `publication.test.ts`, `project-build.test.ts`, `preview.test.ts`, `project-cli.test.ts`, `project-git.test.ts` and `cli.test.ts`. CI, package-consumer and release-wide checks remain deferred.

## Native acceptance

The current compiled CLI passed in a separate network namespace with isolated homes, using Node 24.18.0, Claude Code 2.1.304 and Codex 0.163.0. The probe used the release notes example and an owned local bare Git repository.

It exercised bare `npx pluginsdk build`, configured `publish`, identical publication replay, `preview`, a template update, preview replay and `preview --remove`. Fresh native sessions discovered the same skill and template bytes in both clients. Preview changes left the production build and published commit unchanged.

The probe then cloned the publication, added its marketplace through each native client, installed the production plugin and compared every installed package file with the captured build. Native removal and fresh absence checks passed. Temporary homes and repositories were removed.

The local evidence is `.audit/probes/author-workflow-native/report.json`; it includes the compiled artifact hashes, commands, version observations and completed checks. `.audit/probes/publication-lean/` holds the certificate audit. The platform tools example also built successfully with its publication configuration; its placeholder remote was not contacted.

This establishes the local Git and qualified Linux client workflow. External Git authentication and branch protections were not exercised. It does not qualify other clients, platforms, MCP authentication or a public package release.
