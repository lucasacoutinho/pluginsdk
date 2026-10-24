# Windows root and file ownership acceptance

The native-owned read operation is qualified as a component on Windows NT 10.0.26200, x64, NTFS, Node 24.18.0 and Koffi 3.3.3. Both runs complete all 17 probe groups. Twelve recorded observation frames agree with the [TypeScript model](../../src/internal/files/file.ts) and Lean oracle. Production readers are unchanged, and Windows installation profiles remain disabled.

The [ownership design](windows-file-read-design.md) selects one native owner for opening, observing, reading and closing each file inside a retained root scope. The Node descriptor bridge remains qualified for observation. The native owner can choose sharing rules and avoids binding two separately opened readers.

## Native results

| Operation | Observed result |
| --- | --- |
| Node-owned root rename control | Rename succeeds while the root is open. Identity stays the same; its final path changes. |
| Native root, read/write sharing without delete sharing | Direct root rename fails with error 32. Parent rename fails with error 5, both with and without an open member file. All three renames succeed after closure. |
| Native file, read sharing only | Write access, delete access, rename and deletion fail with error 32. A writer opens after reader closure. |
| Existing writer or writable mapping | The restrictive read fails with error 32. A mapped view still prevents the read after the backing file handle closes. The read succeeds after writer or mapping closure. |
| Hard-link alias | Both names have the same full identity. Writing through the alias fails with error 32. |
| Named stream | Another stream remains writable. Its bytes differ while the default stream's bytes stay unchanged. File metadata changes. |
| Explicit default stream | `::$DATA` resolves to the ordinary default file's final path, identity and bytes. Final-path inspection alone cannot recover this requested syntax. |
| Attribute write | An attribute handle opens and changes the modification time during the restrictive read. The bytes stay unchanged. |
| Native guard with a Node reader | Both readers report the same identity and bytes. Write and rename attempts fail. This remains a comparison control. |
| Complete native reads | Empty, nine-byte binary and 4,097-byte patterned files match exactly. The patterned read returns 1,024, 1,024, 1,024, 1,024, 1 and 0 bytes. |
| Rebound root junction | The retained physical root keeps its identity and path. Reading through that physical path returns the original bytes; the rebound logical path reaches the outside target. |
| Child junctions | An outside endpoint has an outside physical path. An inside endpoint remains a proper descendant. Opening the junction without following it reports reparse tag `0xa0000003`. |
| Case-sensitive directory | Enabling the flag succeeds. `A.bin` and `a.bin` retain distinct identities, paths and bytes. |
| Exception cleanup | A scoped read failure closes the file handle. A writer and rename succeed afterward. |

These observations support the tested sharing and lifetime rules. They do not establish continuous metadata immutability or a complete traversal policy. Source capture permits contained links; payload inspection rejects links. Those policies still need distinct implementation and qualification.

## Model and resource checks

The twelve native frames cover complete reads, retained-root and rebound-root reads, inside and outside junctions, both case-distinct files, a changed case flag, changed metadata and a named stream. Strict Effect decoding validates every frame. TypeScript and Lean return the expected decision without changing the inputs.

Main-thread validation checks 145 native snapshots and 68 byte records across both runs. Full 24-byte volume/file identities, signed-64-bit metadata strings, lengths, hashes and expected bytes agree. All 86 native file/directory handles, four Node handles, four mapping handles and four mapped views are released. Each process's handle count remains 181 before and after. No borrowed Node handle is closed by native code.

The isolated wrapper waits for each exact Node process to exit before closing its job. Both processes exit successfully. The final 71-file runtime manifest is verified before removing all 94,834,652 staged bytes. Raw observations, source reviews, independent validation, native-to-model comparisons and the acceptance seal are retained under `.audit/probes/windows-file-lease/`.

## Integration prerequisites

The next contract must establish Windows package-path materialization before opening a file. The platform-neutral `PackagePath` currently permits colons within components. The explicit default-stream result above makes a pre-open rule necessary.

Complete traversal and payload reparse rejection, executable intent, activation, other metadata boundaries, separate debug chains, full engine settlement and the SDK client lifecycle remain open. No Windows profile is enabled by this component acceptance. macOS qualification remains deferred because no host is available. CI, package-consumer and release-wide checks remain deferred by the user.
