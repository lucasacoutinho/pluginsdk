# Windows root and file ownership

Authors keep the same definition, `pluginsdk build` and `pluginsdk preview`. The next Windows boundary must supply trustworthy facts to the qualified [read-admission model](file-read-acceptance.md). This design does not enable a Windows profile.

## Current flow

`compiler.capture` resolves the root once, walks the requested skill/asset trees and agent prompts, opens a Node file and compares its descriptor path and metadata around the read. It admits source links whose endpoints remain inside the physical root. `installer.readPayload` rejects links and reads each payload file through its Node descriptor. Both use Linux `/proc/self/fd`; neither retains a root directory handle. Executable intent comes from Unix mode bits and needs a separate Windows contract.

The earlier [observation design](windows-file-observation-design.md) chose the Node-to-native bridge for querying the exact Node descriptor. It explicitly retained native ownership as an alternative if sharing or root lifetime required it. That is the decision being tested here. The source history and unavailable remote-history categories remain recorded in that design; they do not establish a historical reason for a new ownership choice.

## Alternatives and synthesis

| Complete ownership shape | Consequence | Decision |
| --- | --- | --- |
| Node opens and reads; native calls only observe | Preserves the current byte reader, but the caller cannot choose native sharing rules through Node's open flags. | Keep as an observation control, not a qualified protected-read operation. |
| Native root/file handles protect a separate Node reader | Preserves Node reads, but opens each file twice and must bind both handles to the same identity and stream throughout their shared lifetime. | Retain as a comparison control. |
| Native operation owns root/file opening, observations, reading and closure | One owner chooses sharing and reparse behavior and observes the same handle it reads. It also owns byte-read progress and cleanup. | Select. The [native qualification](windows-file-read-acceptance.md) passes the tested sharing, lifetime and complete-read checks. |

The intended private boundary owns a root for the whole capture or inspection scope. Its file-read operation collects both observations, reads complete bytes, calls `admitRead`, and closes its file handle before returning. Callers receive bytes and typed failure; they do not receive handles or coordinate native stages. A later tree-reading interface must preserve the compiler's source-link behavior and the installer's link rejection.

```ts
withRoot(root, use): Effect<A, ReadUnavailable | E, R>
RootReader.read(logicalPath): Effect<Uint8Array, ReadUnavailable>
```

These are ownership sketches, not SDK exports. Native flag values, identity layouts and path queries stay inside the adapter. The pure model owns admission. Root lifetime spans the callback; file lifetime spans the complete read. No Unix executable-bit claim follows from these operations.

## Premises to test

The [CreateFileW contract](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew) describes sharing conflicts with existing readers, writers, delete access and writable mappings. Attribute access is separate from those sharing flags. [Byte-range locks](https://learn.microsoft.com/en-us/windows/win32/fileio/locking-and-unlocking-byte-ranges-in-files) do not protect mapped access, so they cannot replace this qualification.

The isolated probe must measure root and ancestor renames; file write/delete/rename conflicts; an existing writable handle; a writable mapping after the original file handle closes; hard-link and stream aliases; root junction rebinding; and physical endpoints of child junctions. Successful sharing restrictions must also disappear after handle closure. Before/after path, identity, kind, size and times must retain their exact native values. All handles and mapping views must close on success and failure.

Tests of a rooted path must distinguish the original logical alias from the physical path returned for the retained root. A changed alias must not redirect a later accepted read. A root handle alone must not be assumed to pin all ancestors without evidence.

`PackagePath` currently permits colon characters inside components. Windows can interpret those characters as stream syntax, and native path queries may normalize an explicit default-stream alias. The eventual adapter must validate package-path materialization before opening files; final-path admission alone cannot establish the caller's requested filename. That path contract needs its own LDD checks before integration. This probe records the default-stream alias behavior without changing the platform-neutral package schema.

- [x] Ground compiler and payload reads and the qualified pure contract.
- [x] Compare complete ownership alternatives and select the native-owned qualification path.
- [x] Proceed under the active milestone authorization.
- [x] Test root, sharing, mapping and alias premises on the isolated Windows host.
- [x] Select native ownership from the findings; retain metadata checks and require pre-open package-path admission.
- [ ] Integrate only after its native prerequisites, package-path materialization and executable-intent contracts are settled.
