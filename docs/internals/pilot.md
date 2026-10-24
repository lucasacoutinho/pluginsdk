# lstack lifecycle pilot

The real lstack 0.2.1 package passes build, reviewed installation, replay, fresh discovery, replacement and removal through PluginSDK on Linux. The installed source remains unchanged. Third-party MCP authentication is deferred by user instruction; lstack declares no MCP servers.

| Native environment | Initial discovery | Updated discovery | After removal |
| --- | --- | --- | --- |
| Claude Code 2.1.304, user | 34 skills, version 0.2.1 | 34 skills, version 0.2.2-pilot | No lstack installation |
| Claude Code 2.1.304, project | 34 skills, version 0.2.1 | 34 skills, version 0.2.2-pilot | No lstack installation |
| Codex 0.163.0, user | 34 enabled skills, version 0.2.1 | 34 enabled skills, version 0.2.2-pilot | No lstack installation or discovered skills |

Each build contains 151 skill files, six supporting files and one generated native manifest: 158 files with nine executables. The supporting files include `LICENSE`, `NOTICE.md`, three third-party licenses and the original `.lstack-generated.json`. Every retained file has its original bytes and executable bit. Cross-skill references retain their paths. Native registration preserves an unrelated configuration sentinel through installation, replacement and removal.

The source has 160 files and three host manifests. PluginSDK regenerates one target manifest from the declared name, version and description, plus the schema identifier for the portable format. Source-only author, display, keyword and repository fields are not passed through. The copied generation receipt describes the original lstack source; it is not a PluginSDK build receipt.

The pilot also preserves `rick-mode`'s nested skill metadata. Both native hosts discover that skill. The v2 format accepts this metadata extension; the v1 format retains its string-map validation. [The expansion design](expansion-design.md) records that choice and the supporting-asset contract.

## Reproduce

From the repository root with Node 24 or later and the qualified native binaries on `PATH`:

```sh
npm run pilot:lstack -- /path/to/installed/lstack/0.2.1 .audit/pilot/lstack.json
```

The [compiled harness](../../scripts/pilot-lstack.ts) makes temporary source copies, homes and projects. It clears inherited credentials, uses the public Compiler and Installer services, verifies complete native payloads and checks discovery in fresh host processes. Claude's component inventory must list exactly the expected skill names and count. Codex discovery uses a fresh app-server. The update changes one copied skill body and the authored version; the original source is never edited. Temporary environments are removed when the run ends.

The local JSON report records bundle identities, source inventories, host and plugin versions, discovered counts, replay equality and preserved configuration. Its source-tree digest includes file hashes and directory/file modes. The accepted source digest before and after the run is `c8f423d42f2666a7b81bac27e37fbf1f776d512691f50061b93dd9f96fd525d6`.

## Source findings and limits

The installed source's `NOTICE.md` references seven absent provenance records: `catalog/pstack-baseline.json`, `catalog/pstack-merge-ledger.json`, `catalog/pstack-merge-policy.json`, `docs/pstack-refresh.md`, `skills-lock.json`, `vendor/skills.json` and `vendor/tools.json`. PluginSDK preserves the notice and the licenses that are present. It does not invent those missing records.

This pilot verifies package lifecycle and discovery. It does not execute all 34 workflows, authenticate a third-party service, make a model turn, or qualify other native versions and operating systems.
