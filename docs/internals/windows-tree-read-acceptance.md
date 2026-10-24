# Windows rooted-tree read qualification

Ordinary files and directory junctions pass traversal through retained native handles. The probe uses the existing [rooted-tree](tree-read-acceptance.md), [file-read](file-read-acceptance.md) and [Windows path](windows-package-path-acceptance.md) models from staged source files. Production capture, payload reading, storage and installation profiles are unchanged. Windows symbolic-link traversal remains unqualified.

## Selected native boundary

Enumeration uses `GetFileInformationByHandleEx` through the retained directory handle. The first call uses `FileIdExtdDirectoryRestartInfo` (20); subsequent calls use `FileIdExtdDirectoryInfo` (19). This keeps enumeration attached to the opened directory. The [information classes](https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ne-minwinbase-file_info_by_handle_class) and [record layout](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_extd_dir_info) define the native boundary.

The helper checks the Koffi structure size, alignment and every field offset before decoding. The variable name begins at byte 88. Each chain offset, alignment, name length and UTF-16 value must fit the supplied buffer. Only exact `.` and `..` entries are omitted from logical children. Invalid native data produces a failed enumeration.

Each child is opened without following its final reparse point, then queried through that handle. Source junctions also retain a followed target handle. Exact names, identities, physical containment and active ancestor identities pass through `admitEntry`. Directory completion passes through `admitDirectory`; bytes read through the same file handle pass through `admitRead`. The probe contains no separate admission implementation.

Root and ancestor handles deny delete sharing during descendant work. File handles permit read sharing only. The helper records native outcomes, full 64-bit volume identifiers, opaque 128-bit file identifiers, names, timestamps, directory records and byte chunks. A normalized GUID path outside the marker-owned stage cannot become a readable endpoint.

## Native evidence

The isolated run uses Windows/x64 Node 24.18.0, Koffi 3.3.3 and Effect 4.0.5 on NTFS. Node and binding archives are pinned; staged Effect bytes match the package-lock integrity and installed dependency. The eight actual contract/model source files match their repository hashes. HOME, profile, Codex home and temporary paths are isolated.

Twenty behavior cases pass, plus one capability assertion that records a real qualification limit:

| Cases | Result |
| --- | --- |
| Ordinary source and payload trees | Empty, binary, 4,097-byte and nested Unicode files retain their exact bytes. Precomposed and decomposed names coexist. Enumerated identifiers match opened members. |
| Empty and multi-batch directories | An empty directory completes. Forty-eight files require fourteen calls per listing with a 512-byte buffer. Restart returns the same inventory. Error 18 terminates each complete enumeration. |
| Insufficient buffer | A 64-byte buffer returns native error 24. Both listings are failed observations and directory admission returns `unavailable`; no bytes are read. |
| Case aliases and case-sensitive names | Requested parent and leaf case aliases return `name_mismatch`. A directory with case-sensitive flag 1 retains distinct `A.bin` and `a.bin` identities and bytes. |
| Contained, outside and repeated junctions | Source mode traverses a contained junction; payload mode refuses it. An outside-root target is observed but never read. An active ancestor cycle is refused; separate sibling branches may reuse one target. |
| Membership and metadata changes | Additions, removals, replacement under the same name and timestamp changes return `changed`. Same-name replacement retains the name inventory but changes directory metadata. |
| Incomplete visits | Skipping one child returns `incomplete` despite complete listings. |
| Retained guards and failure release | Root/parent rename and conflicting file-writer attempts fail while handles are retained. Controls succeed after closure. An injected exception releases the branch; a fresh scan succeeds and closed handles refuse further queries or reads. |
| Root rebinding and reparse guard | Rebinding a logical root junction does not redirect reads through its retained physical root. A no-follow junction guard blocks removal until it closes. |
| Windows symbolic-link creation | `CreateSymbolicLinkW` with unprivileged creation requested returns error 1314. This records a host privilege limitation; it does not qualify symbolic-link traversal. |

For a no-follow junction handle, normalized/opened GUID names and both file-name information classes name the junction itself. The followed handle names its target. These observations support the exact-entry binding used by the model.

All 133 acquired native file handles close successfully. The process handle count is 182 before and after the run. The wrapper retains the exact Node process in its job, observes its exit, verifies zero active processes and closes the job before scratch removal.

## Model and raw-data checks

All 310 recorded frames match independently assigned case expectations, the local TypeScript functions and the Lean oracle:

| Model | Frames |
| --- | ---: |
| Windows path admission | 98 |
| Tree entry admission | 100 |
| File-read admission | 80 |
| Directory completion | 32 |

Strict schema decoding passes and the TypeScript functions preserve their inputs. Independent validation decodes 176 distinct native snapshots, 154 directory calls and 324 directory records from their raw buffers. All eighty byte-read records agree with their native chunks and hashes. Frame observations are bound to the recorded native snapshots. Scoped syntax and pattern checks pass without warnings.

The runtime/source manifest contains 600 verified files. After exact process exit, cleanup verifies every staged hash, inventories the fixtures and removes 677 regular files totaling 108,361,742 bytes and six junctions. Junctions are observed as symlinks and are not followed during cleanup. The marker-owned scratch root is absent.

The sources, manifests, observations, independent validator, model vectors, conformance receipt and acceptance seal are retained under `.audit/probes/windows-tree-native/`.

## Remaining acceptance

Junctions use tag `0xA0000003`. The pure contract also admits source symbolic links with tag `0xA000000C`, but that native path remains unqualified because this host cannot create the fixture. No symbolic-link success is inferred from the junction cases.

Before/after agreement does not establish continuous immutability or an atomic snapshot. The fixture path budget of 1,024 UTF-16 units is a supplied test bound, not the platform's maximum complete-path capacity. Executable intent, complete-path budgets, complete-tree materialization, production reader integration, activation and full client lifecycle remain open. Windows installation profiles stay disabled. macOS remains deferred because no host is available; CI, package-consumer and release-wide checks remain user-deferred.
