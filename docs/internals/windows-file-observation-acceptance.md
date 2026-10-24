# Windows opened-file observation acceptance

Seven native cases pass on Windows 10.0.26200 x64, Node 24.18.0 and Koffi 3.3.3. This qualifies the bridge from a live Node `FileHandle` to native file observations on that host. Product code is unchanged and Windows installation profiles remain disabled.

| Case | Observed result |
| --- | --- |
| Directory descriptor | The borrowed handle supplies a volume/file identity, DOS and volume-GUID paths, directory kind and case-sensitivity flags. The fixture directory reports the default insensitive mode. |
| Regular file | Node reads and native reads through the borrowed handle return the exact same binary bytes. Node's bigint inode matches the native identifier's low 64 bits and exceeds the safe integer range. |
| Rename while open | The file retains its volume/file identity and original bytes; querying that same handle returns the renamed path. |
| Replacement at the old name | A fresh descriptor observes another identity and the replacement bytes. The retained original descriptor still reads the original file. |
| Namespace alias | Opening the namespaced spelling returns the original identity, volume-GUID path and bytes. |
| Named stream | The default and named streams share file identity but return different bytes. The native final path exposes the named-stream suffix. Identity equality alone cannot admit a read. |
| Junction endpoint | A lexical path through an inside junction returns a physical final path outside the root. The endpoint's bytes match the controlled outside file. |

The pinned executable's export table contains `uv_get_osfhandle`; the probe resolves and calls it from the running executable. All six observed Node file handles close normally. Native code never closes a borrowed handle. The process handle count is 181 before and after the seven-case run. Its wrapper collects the process, reports no active descendants and closes its containment job. The earlier six-case run also passes, closes five observed file handles and preserves the same handle count.

The main-thread verifier checks raw identity bytes, exact content, metadata, final-path relationships and resource evidence independently. Receipts, reviewed source, binary input hashes and the acceptance seal are under `.audit/probes/windows-file-identity/`. Cleanup removes the owned Windows stage.

This is a native premise check before new read-admission schemas, Lean properties and product I/O changes. It does not qualify containment, root lifetime, case-sensitive directory behavior, reparse races, executable semantics or complete Windows SDK lifecycle. The next LDD step is the pure read-admission contract in the [design](windows-file-observation-design.md). No macOS host is available; CI, package-consumer and release-wide checks remain deferred.
