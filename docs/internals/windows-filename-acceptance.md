# Windows filename component acceptance

The filename probe qualifies the tested creation, lookup, capacity and cleanup premises on Windows NT 10.0.26200, x64, NTFS, Node 24.18.0 and Koffi 3.3.3. The final run completes all eleven groups. Production capture, payload reading, staging and profiles are unchanged. Complete Windows materialization remains open.

The [path design](windows-package-path-design.md) keeps lexical admission separate from native identity and exact tree spelling. Native results support that distinction. A successful `CREATE_NEW` does not establish that every requested directory component was preserved.

## Observed behavior

| Case | Result |
| --- | --- |
| Exact names | `MixedCase.bin`, precomposed and decomposed accented names, Chinese characters and an emoji retain their exact names and nine binary bytes. Both accent representations coexist. |
| Default case aliases | ASCII case, accented case and `Σ`/`σ` lookups reach the original full identity and bytes. Exclusive creation through either ordinary or volume-GUID aliases fails with error 80. |
| Other Unicode pairs | Kelvin sign, dotless i, sharp-s, final sigma and decomposed accent alias lookups return not found in their tested pairs. No universal Unicode equivalence rule is inferred. |
| Directory alias | Creating `tools` after `Tools` fails with error 183. Opening either reaches the same directory. Creating `tools/b.bin` succeeds, but the stored tree is `Tools/a.bin` and `Tools/b.bin`. |
| Prefix conflicts | Creating an existing exact or case-alias file fails with error 80. A file used as a parent fails with error 3. A directory used as a file fails with error 5. Original bytes remain intact. |
| Component capacity | The retained volume reports 255 UTF-16 units. Volume-GUID creation accepts both ASCII and supplementary-character names at 255 units and refuses 256 with error 123. Ordinary-path attempts fail with error 3 in this fixture. |
| Actual short name | The OS supplies an 8.3 alias with changed ancestor names and leaf name. Its retained handle has the original full identity, endpoint and bytes. Exclusive creation through that alias fails with error 80. No alias settings are changed. |
| Trailing characters | Ordinary creation of `file.` or `file ` stores `file`. Volume-GUID creation preserves the requested trailing character. |
| Device and console spellings | Several reserved spellings can be created as disk files in the tested context. Ordinary `NUL` returns a character-device handle, which is closed without reading or writing. The conservative pre-open device policy remains necessary. |
| Stream syntax | `file:stream` holds nineteen alternate bytes while the default file keeps its nine bytes. `file::$DATA` exclusive creation fails; read-only opening reaches the default file's identity, bytes and final name without the suffix. |
| Invalid and ordinary characters | Tested reserved punctuation and a C0 control fail with error 123. A leading period, interior repeated periods, a leading space and a trailing nonbreaking space preserve their names. |
| Long path | Volume-GUID creation and reading succeed at 468 UTF-16 units. The ordinary-path control fails with error 3. This does not qualify the maximum extended-path boundary or native client loading. |
| Case-sensitive directory | Setting its flag to one succeeds. `A.bin` and `a.bin` have distinct identities and bytes even though ordinal ignore-case comparison reports equality. |
| Partial-stage refusal | A conflicting create preserves the original. Exact cleanup removes the file and directory. Fresh reads prove absence; recreating the directory and file succeeds. No metadata is published. |
| Rename observation | A rename changes normalized, opened, `FileNameInfo` and `FileNormalizedNameInfo` observations to the new spelling. Identity and bytes remain unchanged. These queries do not recover the original request. |

These results describe this host and the tested API arguments. They do not replace Microsoft's [filename rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file), which distinguish namespace behavior, reserved names, trailing characters and optional short aliases. The [volume query](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getvolumeinformationbyhandlew) supplies the component capacity; the adapter must query its destination rather than hardcode 255.

## Independent checks

The first run records all eleven groups but skips two long-path controls because its setup opens the long directory through an ordinary path. The corrected setup opens the directory through its retained-root volume-GUID path. The second run executes both controls. Both source versions, staged manifests and raw observations are preserved.

Main-thread validation checks full 24-byte identities, signed metadata, UTF-16 name buffers, query bounds, expected bytes and hashes. It checks 222 distinct snapshots and 153 byte records in the first run, then 223 snapshots and 155 byte records in the final run. All 339 native handles close successfully. Each process starts and finishes with 181 handles. Both exact root processes exit before their wrapper jobs close.

Strict Effect decoding, TypeScript and Lean agree on 190 distinct requests built from the recorded relative paths. Expected decisions are assigned independently by case. The component capacity is the observed volume value. Relative-path budgets are test inputs at each requested length and one unit below; they do not claim an OS maximum. The comparisons include lexically accepted aliases and ordinary paths that native creation refuses.

The final 71-file runtime manifest is verified before removing all 94,857,547 staged bytes. Native observations, both probe versions, independent validation, model comparisons, scoped syntax/lint results and the acceptance seal are retained under `.audit/probes/windows-path-native/`.

## Integration requirements

The materializer must check the observed spelling of every component and the complete resulting tree before publication. Exclusive leaf creation alone misses merged ancestor aliases such as `Tools`/`tools`. Native identity and retained directory observations remain authoritative; ordinal case comparison cannot replace them.

Full traversal, source-link policy, payload reparse rejection, executable intent, trustworthy complete-path budgets, production reader integration, activation and the complete SDK client lifecycle remain open. Windows installation profiles stay disabled. macOS qualification is deferred because no host is available. CI, package-consumer and release-wide checks remain deferred by the user.
