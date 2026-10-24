# Windows bundle materialization

Authors keep the existing definition, build and preview commands. Before publishing a marketplace catalog or installed marker, the installer must write the approved bundle and verify its complete paths, bytes and executable intent.

## Current flow and constraints

`Installer.apply` retains the pending journal and starts `executeChange` inside the transaction worker. The ordinary recipe creates an immutable payload, calls `stageFile` for each file, then writes catalog and marker metadata. The Codex project recipe stages a revision and a cache, commits both directories, then verifies the revision before changing project configuration.

`stageFile` already creates, writes and flushes through one exclusive writable handle. Its accepted Windows checks cover that lifetime. They do not establish complete package-path admission or exact stored parent names. The native filename counterexample creates `Tools/a.bin` and `tools/b.bin` under the same stored directory. The lexical design therefore requires admission before file creation and complete comparison before publication.

The accepted root owner supplies NTFS observations, complete-name capacity and handles that deny deletion. Tree admission checks exact names and rejects payload reparse entries. Stable reading and executable-intent resolution already establish the comparison policy. These pure contracts remain unchanged.

The local alpha commit and the staging, filename, tree-read and executable-intent design records explain the existing shape. This implementation has no established project-linked issue, chat or telemetry record. The user's milestone instruction authorizes this integration.

## Alternatives and synthesis decision

| Shape | Decision |
| --- | --- |
| Add Windows checks to each absolute `stageFile` call | Reject. The original package path and complete inventory have already been split across callers. Parent aliases and publication order remain caller responsibilities. |
| Put Windows creation and verification loops in each recipe | Reject. Ordinary and project installation would own competing filesystem policies. |
| Materialize one approved payload behind a private operation | Select. Storage owns the entire inventory and native lifetime. Recipes publish only after that operation succeeds. |

Both recipes use this private operation:

```ts
materializePayload(key, root, files): Effect.Effect<void, StateUnavailable>
```

`files` is `ReadonlyArray<PackageFile>` from the approved bundle. Linux retains `ensureDirectory` and `stageFile`, followed by the shared payload comparison. Windows supplies captured native content from its retained writer and uses the same comparison. A mismatch fails the operation. The public SDK gains no interface or configuration field.

## Native ownership

The Windows writer opens the local volume root and retains every ordinary directory along the requested absolute root. It creates missing directories one component at a time. Existing reparse entries and stored-name aliases refuse before traversal. Starting at the volume prevents a junction in a destination ancestor from becoming the trusted payload root.

The payload root must be empty. Before creating any bundle file, the root owner admits every complete relative path through the accepted Windows lexical and capacity operation. Parent directory handles remain retained throughout writing and verification. Each created or reused directory receives payload entry admission against its actual parent.

The native owner adds private directory creation and exclusive file creation. A created file has a separate capability containing a read-only file view, `write(bytes)` and `flush()`. Creation requests read/write access, `CREATE_NEW`, no-follow behavior and sharing that refuses other writers and deletion. The implementation handles short writes and rejects zero progress. File flushing uses that same writable handle.

Created file handles stay retained until the complete tree has been captured through the existing reader. Directory synchronization uses the existing checked helper while parent guards remain live. The captured tree then passes the shared path, byte and executable-intent comparison before the operation returns. Finalizers close every handle on success or refusal. Failed staging can leave an unpublished partial payload; it never authorizes catalog or marker publication.

The [CreateFileW contract](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew) defines exclusive creation and sharing. [CreateDirectoryW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createdirectoryw) creates one final component. [WriteFile](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-writefile) supplies the synchronous byte count, and [FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers) requires write access. Native checks must verify these premises on the pinned host.

## LDD and acceptance

The existing file-read, Windows-path, tree-read and executable-intent certificates and TypeScript oracle comparisons must pass before the I/O edits. This phase composes those accepted policies rather than adding a new pure decision rule.

Native checks must build and materialize the same Claude and Codex bundles, preserve both executable flags, reject syntax and capacity failures before file creation, refuse case aliases and junction ancestors, preserve existing contents on collision, propagate write and flush failures, verify complete output before publication, and establish handle, job and scratch cleanup. Linux checks must preserve both recipe paths and payload fingerprints.

Atomic catalog and configuration activation, process settlement and native client loading remain separate obligations. Windows profiles stay disabled. macOS, CI, package-consumer and release-wide qualification remain deferred.

- [x] Ground the worker, both recipes, staging helper and accepted native operations.
- [x] Compare complete shapes and select one private payload operation.
- [x] Proceed under the active milestone authorization.
- [x] Check the unchanged pure certificates and oracle conformance: 57 certificates and 20 focused tests pass.
- [x] Integrate native creation and both recipes.
- [x] Qualify 27 focused Linux regressions, four native Linux lifecycles and 20 Windows materialization cases.
- [x] Reassess ownership and publication order. Exact names, retained parents and complete comparison satisfy the tested premises. Process-wide stdout initialization is measured before the ownership baseline.

The [acceptance record](windows-materialization-acceptance.md) records independent buffer decoding, the initial handle-count diagnostic and complete runtime cleanup.
