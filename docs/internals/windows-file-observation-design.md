# Windows opened-file observations

## Caller outcome and current flow

Plugin authors keep `pluginsdk build` and `pluginsdk preview`. Windows capture and inspection need an equivalent of the Linux descriptor check before a Windows profile can be enabled. This design selects the observation boundary; it does not complete Windows filesystem support.

The compiler resolves source paths, opens each file, resolves `/proc/self/fd/<fd>`, checks containment, and compares metadata around the read. It allows source links whose endpoints remain inside the source root. The installer separately reads staged and loaded payloads, rejects links, and uses the same Linux descriptor path. Its payload reader imports the compiler's `inside` predicate. Neither path can be enabled on Windows by replacing only `realpath`.

The existing [compiler contract](compiler.md#materialization-and-proof-limits) requires an equivalent qualified capture primitive. The [design contract](design.md#compiler-interface) requires physical source containment and retains executable intent in each complete bundle. Those requirements stay in force.

## Alternatives and synthesis decision

The private observation seam has this proposed shape. It is not a new SDK export:

```ts
observeOpenedFile(file: FileHandle): Effect.Effect<OpenedFileObservation, FileObservationUnavailable>
```

`OpenedFileObservation` must retain exact volume/file identity, final path, file kind, size and modification/change times. Directory observations also need the filesystem's case-sensitivity information. The eventual read operation owns observations before and after reading; callers must not coordinate native handles themselves.

| Complete observation path | Ownership and cost | Decision |
| --- | --- | --- |
| Node opens and reads; native calls describe that same open file | Borrow the native handle through the running Node binary's `uv_get_osfhandle`. Keep it inside the original `FileHandle` scope. Existing Node read and close ownership remain intact. | Select for the observation seam. Seven native cases establish the bridge on the pinned host. |
| Native adapter opens, reads, describes and closes files | Use `CreateFileW`, native reads and separate native resource ownership. Sharing and reparse options become explicit, but the adapter also owns another byte-read implementation. | Retain as an alternative if later root-lifetime or sharing evidence requires ownership beyond Node's open operation. |

The selected seam hides native symbol lookup, bounded UTF-16 path queries, file-information layouts and exact identity decoding. It must not export the borrowed handle, cache it beyond the file scope or close it independently. The [libuv ownership contract](https://docs.libuv.org/en/v1.x/fs.html#c.uv_get_osfhandle) makes the descriptor's original owner responsible for closure. The pinned Node headers declare the bridge and its Windows handle type: [uv.h](https://github.com/nodejs/node/blob/v24.18.0/deps/uv/include/uv.h), [win.h](https://github.com/nodejs/node/blob/v24.18.0/deps/uv/include/uv/win.h).

Validate the live descriptor before each native observation and keep the read inside its owning scope. A closed or reused descriptor must never retarget a cached native capability.

## Native findings that constrain the model

The [observation qualification](windows-file-observation-acceptance.md) confirms matching Node/native bytes, stable identity across rename, a changed final path, distinct identity after replacement, directory observations, namespace aliases and junction endpoints. Node inode values exceed JavaScript's safe integer range. Identity and metadata must retain exact integer representations.

The additional named-stream case disproves identity-only byte binding. The default stream and a named stream have the same volume/file identity but different bytes. Their final paths differ on this host. A future accepted read must establish default-stream admission as well as identity, path containment and stability. [Windows stream semantics](https://learn.microsoft.com/en-us/windows/win32/fileio/file-streams) also give each stream its own size and sharing state.

The pure contract must cover these requirements before product I/O changes:

- Compare volume and full file identity without numeric rounding.
- Parse final paths and establish containment by volume and complete path components. Preserve case distinctions; do not reuse the current `../` predicate.
- Reject named streams and unsupported path representations before accepting bytes.
- Require regular-file evidence, a complete read, matching size, stable identity, final path and modification/change times.
- Bind the root's identity and path before and after observation. Unknown evidence must refuse acceptance.
- Keep executable intent separate from Windows mode bits.

The [pure read-admission contract](file-read-acceptance.md) now supplies these rules. The subsequent [native ownership qualification](windows-file-read-acceptance.md) tests root and ancestor lifetime, sharing, aliases, junction endpoints and case-sensitive directories. Those findings select native ownership for complete reads while retaining this bridge as an observation component. Complete traversal, pre-open package-path materialization and executable intent remain open.

## Rationale evidence and limits

The source history contains commits `186e57b` and `7191aa6045a4253ae38298b24a2afa3a0e29078b`; the latter explicitly adds preserved package assets and the real-plugin lifecycle pilot. The repository's explicit contracts, rather than an inferred historical motive, supply the containment and executable-intent constraints above. There is no committed history for the current untracked payload reader, and the repository has no pull requests.

The available Linear and Atlassian connectors both returned `USER_NOT_LOGGED_IN`, so issue and remote document history could not be searched. No team-chat, infrastructure-observability, error-tracking or product-analytics search source is exposed for this project. Local design documents and native receipts supply the direct evidence. Why the current installer imports the compiler predicate is unknown; this design does not assign an intent to that dependency.

- [x] Ground the compiler and installer reads, history and existing physical-file requirements.
- [x] Compare Node-owned and native-owned observation paths.
- [x] Proceed under the active milestone authorization.
- [x] Qualify the Node-to-native bridge and test the identity-only premise.
- [x] Specify and prove the complete read-admission contract, add its oracle and conforming TypeScript.
- [ ] Qualify root lifetime, containment, stream and path rules before integrating product I/O.
- [x] Reassess complete-read ownership from native evidence and select the native-owned boundary.
