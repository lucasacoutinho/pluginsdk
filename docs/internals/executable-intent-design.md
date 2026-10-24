# Executable intent

## Usage and problem

Authors keep `pluginsdk build`, `pluginsdk publish` and `pluginsdk preview`. A built bundle already commits each file's path, bytes and executable intent. Installing that bundle on Windows must preserve both true and false intent without inventing POSIX permissions from a Windows file attribute.

Portable source definitions may declare executable source files alongside their existing assets:

```json
{
  "assets": ["tools"],
  "executables": ["tools/report"]
}
```

This is an optional field on the existing plugin definition, not a new SDK entry file. An explicit empty list declares that every captured source file is data. When omitted, capture retains the current POSIX permission-based behavior. A host that cannot represent those permissions must report missing intent rather than guess false. The declaration applies to source paths relative to the build root, before format rendering; generated native documents and launchers retain their renderer-owned intent.

The [integration record](executable-intent-integration-acceptance.md) accepts this authoring field and its Linux implementation. Windows native integration remains open.

## Flow before integration

[`capture`](../../src/compiler/source/capture.ts) reads a regular file through a Linux descriptor and derives executable intent from its mode. Captured skills/assets carry that flag into rendering and assembly. Agent prompts become text in generated documents, whose permissions belong to the renderer. Local MCP validation requires a packaged executable launcher. [`PackageFile`](../../contracts/Compiler.ts) and bundle identity already retain the Boolean; the package digest includes it.

[`stageFile`](../../src/installer/storage.ts) requests mode 0755 or 0644. [`readPayload`](../../src/installer/payload/read.ts) currently reconstructs the flag from POSIX modes. Both ordinary and Codex-project inspection compare every observed path, byte array and flag with the retained bundle. The retained plan and installed marker already preserve that bundle and validate its identity. They remain the authority for portable intent; a second metadata file would create another writer for the same fact.

Node's [permission contract](https://nodejs.org/download/release/v24.18.0/docs/api/fs.html#fschmodpath-mode-callback) permits only the write permission to change on Windows. Its execution-access flag also behaves as an existence check there. Windows [file execution access](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights) belongs to its access-control model. Neither mechanism represents the bundle's POSIX executable Boolean. This design preserves artifact intent; it does not claim to audit Windows ACLs or guarantee that an executable is runnable by a client.

## Alternatives and synthesis decision

| Complete shape | Consequence | Decision |
| --- | --- | --- |
| Recover one native execute bit on every host and keep all current signatures | `stat`, `chmod` and access checks cannot supply the same fact on Windows. Rejecting every executable bundle would remove required functionality. | Reject. |
| Use Git modes for capture and write an executable sidecar beside each payload | Adds repository/index dependencies, leaves new or untracked sources without intent, and duplicates the retained bundle's authority. | Reject. |
| Explicit portable source declarations, POSIX capture by default and bundle-bound payload intent | Works with files outside Git and retains the existing bundle schema. Native observations remain separate from retained metadata. | Select. |

The compiler owns source intent selection and declaration coverage. The installer owns restoration from an already validated retained bundle. The private rooted-tree owner owns exact paths, bytes, native kinds, containment, stable metadata and handle lifetimes. Existing byte-complete bundle comparison remains authoritative; this phase adds no new tree inventory framework.

## Pure contract sketch

`PermissionBits` is an integer from 0 through 0777. Only the three execute positions affect executable intent. A mode observation is `posix` with before/after permission bits, `unrepresented`, or `unavailable`. Missing evidence is distinct from a supported false value.

Source resolution takes either a filesystem inventory of paths and mode observations or an explicit declaration with the complete captured path inventory. It returns the same paths with resolved intent, or a refusal with an offending path. Exact duplicates, duplicate declarations and declarations absent from the captured inventory are refused. Native mode changes and unsupported/missing native intent are refused. Declaration membership compares exact case and Unicode representation. Output order follows the captured inventory.

Payload resolution takes one retained file's path, digest and intent, plus the observed file's path, digest and mode observation. Path and digest must agree before retained intent can be used. POSIX observations must be stable and match that intent. An explicitly unrepresented native bit restores either retained Boolean after binding; an unavailable observation refuses. This restoration is metadata recovery, not evidence of native execute permission.

The caller computes the observed digest from the same admitted bytes and retains the existing full-byte comparison. These models prove relationships among supplied identities and observations, not SHA-256, a native syscall, executable startup, or the retained plan's authenticity.

Proposed internal operations:

```ts
resolveSourceIntent(input: SourceInput): SourceResolution
resolvePayloadIntent(input: PayloadInput): PayloadResolution
```

The source declaration schema derives from this contract. No production reader may fill an unknown mode with false or return an expected flag before the path/content binding succeeds.

## LDD and acceptance

- [x] Ground capture, rendering, bundle commitment, staging and both inspection paths.
- [x] Compare complete alternatives and select the authorities above.
- [x] Proceed under the active milestone authorization.
- [x] Define and prove execute-bit semantics, exact source resolution, declaration coverage, refusals and payload binding.
- [x] Complete strict wire, independent vectors and TypeScript conformance before I/O changes. See the [pure acceptance record](executable-intent-acceptance.md).
- [x] Integrate the authoring field and private callers; qualify Linux capture, staging and inspection.
- [ ] Qualify Windows retained-intent behavior and integrate its complete native reader.
- [ ] Reassess if native evidence contradicts the selected boundary.

Native acceptance must include true/false intent, a non-default POSIX umask, mode drift, exact declaration names, missing/duplicate declarations, changed paths/bytes, and Windows files created with different requested modes. Full Windows source capture still depends on the qualified reader, source-link coverage and complete-path budgets. Windows profiles remain disabled; macOS and release-wide checks remain user-deferred.
