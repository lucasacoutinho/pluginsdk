# Project configuration files

## Problem

A Codex project installation edits one owned TOML block in `.codex/config.toml`. The remaining configuration must survive installation, replacement and removal. The current file implementation is qualified on Linux. Its directory traversal, descriptor-path checks and permission handling prevent a Windows project plan from being reviewed.

The isolated Windows Node 24.18.0 probe reproduced the public reader's `StateUnavailable`. It measured `realpath("\\") === "C:\\"`, an unavailable `/proc/self/fd` path, absent `O_NOFOLLOW` and `O_NONBLOCK` constants, and `0666` after both creation and chmod with `0600`. The [diagnostic acceptance](../../.audit/probes/windows-project-file/node-premises-corrected-validation.json) binds those observations, 5,043 immutable copied files and the unchanged 5,786-file activation workspace. The diagnostic scratch directory was removed after independent validation.

## Usage

The installer continues to use two operations:

```ts
const file = yield* readProjectFile(target)
// The reviewed plan retains file.basis, rather than the configuration text.
yield* replaceProjectFile(target, plan.project.before, activation.text)
```

Plugin authors continue to use the same definition and CLI. They do not choose filesystem backends or configure Windows permission emulation.

## Current flow

`Installer.plan` observes the project, captures its file basis, reviews the owned document edit and saves a ready plan. `readProjectView` brackets Codex's layered configuration query with two file reads. Execution reviews again before preparing a revision and again before replacing the file. `replaceProjectFile` compares the file with the reviewed basis before staging and immediately before publication. Recovery observes the resulting installation through the existing lifecycle protocol.

`FileBasis` currently records absence or a content digest and POSIX mode. It participates in plan commitments, drift equality and observation fingerprints. The existing Lean project-config model proves TOML block editing, rather than filesystem metadata or publication. No tracked history explains a broader platform intent for the newly added file module. The Linux-only native acceptance and the implementation's `/proc` calls establish its present scope.

## Alternatives considered

| Candidate | Ownership and interface | Assessment |
| --- | --- | --- |
| A: extend the Node implementation | One implementation branches around drive roots and `/proc`; all files retain numeric modes. | Rejected. The measured mode cannot express Windows access control. Conditional path fixes would leave that decision scattered through reads and staging. |
| B: private platform backends | The project-file owner keeps `readProjectFile` and `replaceProjectFile`. Each backend owns physical reads, metadata, staging and publication. A shared pure policy admits metadata and checks the reviewed basis. | Selected. Two operations hide the platform decisions and retain one owner for configuration replacement. |
| C: extend `SourceFiles` into a mutable file service | Source capture also exposes conditional configuration replacement, metadata policies and publication. | Rejected. Callers would need to coordinate capture and configuration policies. Plugin source selection and preservation of an external configuration file have different ownership rules. |

The screen for shallow interfaces, leaked representations, temporal decomposition and duplicate ownership favors B. Its internal native helpers may be shared; its publication policy belongs to the project-file owner.

## Shape

Keep the existing `absent` and `file { digest, mode }` wire forms so Linux plans retain their representation. Add `windows_file { digest, attributes, security }`. `attributes` is a native DWORD. `security` is a digest of the DACL descriptor observed through the file handle. Neither field is a POSIX mode. Descriptor bytes remain inside the backend and never enter a plan or log.

The pure `ProjectFile` policy admits absence on Linux and Windows, POSIX metadata on Linux, and qualified native metadata on Windows. It rejects other platforms and mismatched representations. Windows admission requires only the default data stream and supported writable attributes. Initially those are combinations of hidden, system, archive and not-content-indexed, or normal alone. Read-only, reparse, sparse, encrypted, compressed, offline and other attributes remain unqualified. A second operation compares admitted metadata with the reviewed basis and returns a drift refusal when they differ. Both operations are total and schema-derived.

The Linux backend retains its current permission and publication behavior. The Windows backend must hold physical NTFS parent directories, reject reparse traversal and aliases, read through a stable native handle, bracket bytes and native metadata, and qualify missing files from native errors under a verified parent. Existing FileRead and WindowsPath models remain authoritative for their respective checks.

Windows staging must create an exclusive sibling with the admitted attributes and the existing file's DACL before writing configuration bytes. It must verify that metadata and the staged identity, flush the data, recheck the reviewed basis, then publish within the same directory. An absent target uses a no-replacement move; an existing target uses replacement. Cross-volume copy fallback is excluded. Cleanup verifies the temporary file's identity before removing it. An absent file inherits the parent directory's native access policy.

This design uses a same-directory move and explicitly refuses extra streams or attributes it cannot preserve. `ReplaceFileW` was considered for its metadata merging, but its documented partial failure states would require a separate backup and recovery contract. The selected subset avoids that additional protocol. This is a design choice, not a claim that either API supplies destination compare-and-swap. The existing SDK locks serialize SDK writers; the metadata checks bracket external changes as in the Linux implementation. [Microsoft documents the move flags](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw) and [replacement failure states](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew).

## Synthesis decision

Use B with a separate Windows file basis and a conservative native metadata policy. Preserve the two-operation caller surface and the old Linux wire forms. Keep native ABI details behind the backend. Use handle-based DACL observation; [GetSecurityInfo](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getsecurityinfo) documents NTFS handles and the required access. Node's numeric mode is unsuitable for this contract; [Node documents Windows chmod's limited behavior](https://nodejs.org/download/release/v24.17.0/docs/api/fs.html#file-modes).

## Tradeoffs and acceptance

The first Windows contract supports ordinary writable configuration files. It preserves configuration bytes outside the owned block, admitted attributes and DACLs. It does not claim preservation of every security descriptor component or power-loss durability. Extra native metadata requires its own design and qualification. macOS remains deferred because no host is available.

Follow LDD in order: define metadata and review properties, prove them in Lean, author oracle vectors, establish TypeScript conformance, then edit file I/O. Native acceptance must exercise the public project reader and writer for absent and present files, prove metadata preservation and refusal before mutation, and run the isolated Codex project lifecycle. Windows production profiles remain disabled until the remaining compatibility gates pass.

Architecture checklist:

- [x] Ground: public failure and filesystem premises measured on Windows.
- [x] Sketch: three ownership alternatives compared against the caller's usage.
- [x] Agree: the active milestone instruction authorizes implementation.
- [ ] Implement: properties, proofs, oracle, TypeScript, then native I/O.
- [ ] Scrap: revise this shape if metadata copying or native publication contradicts its assumptions.
