# Windows root-session acceptance

The native file component can create repeated and overlapping root owners in one process. A lazy module owns an immutable function table and anonymous FFI structures; each root retains its own path, resource map, handles and accounting. Closing one root leaves another readable, including two owners of the same physical directory.

This replaces the duplicate-type constraint found during [executable-intent qualification](windows-executable-intent-acceptance.md). It remains a private component awaiting production reader integration. Windows installation profiles stay disabled.

## Design and preserved behavior

The alternatives were anonymous binding setup per root, one shared binding with independent roots, and one broad ancestor-root owner. The selected shared binding avoids repeated immutable setup while retaining narrow root ownership. Looking up existing named FFI types was rejected because another initializer could own a different layout. The production Windows process adapter already uses anonymous structures.

The extraction moves ABI declarations and directory record offsets into one module. It removes the two global struct names and caches the function table only after successful initialization. The offset table and function table are frozen. No root path, resource, map or accounting value enters the shared module.

A reconstruction check restores the original native file implementation exactly, ignoring blank lines. The ABI declaration block matches the original apart from anonymous struct creation. All read, directory decoding, containment, metadata and resource-ownership code is preserved. The accepted FileRead, TreeRead and ExecutableIntent models remain unchanged; no new domain rule or pure property is introduced.

## Native evidence

The pinned Windows x64 Node 24.18.0 and Koffi 3.3.3 guards pass. The staged executable and binding files match the previously qualified hashes.

| Check | Result |
| --- | --- |
| Binding | Repeated access returns the same frozen function table and frozen offsets. |
| Root construction | Sequential roots, overlapping distinct roots and two owners of one physical root pass. |
| Ownership refusal | Foreign resource objects with equal local IDs refuse before a native call. Sibling DOS and GUID paths refuse before opening. |
| Independent cleanup | Closing one root leaves another root's open file readable. Closed resources refuse reads/close calls; repeated cleanup issues no extra native calls. |
| Constructor failure | Missing and non-directory roots fail with all acquired handles released. A subsequent valid root remains usable. |
| Repetition | Twenty-four repeated root reads retain one binding and restore the process-handle count after every iteration. |
| Complete result | Ten cases pass across 37 successful root owners. All ten case-level handle counts return to their starting value. |
| Model replay | 136 recorded entry, directory, file-read and payload-intent frames agree with their expectations, Windows TypeScript, Linux TypeScript and Lean. Strict schema decoding and input preservation pass. |
| Raw reads | Main reconstructs 34 complete reads from native chunk buffers and verifies the digests supplied to intent resolution. |
| Resources | All 73 handles from successful owners and one handle from a failed constructor close. No live native handles remain. Process handles start and end at 182. |
| Isolation | Exact child exit and job-handle closure pass. The marker-owned runtime is removed after its manifest is verified. |

The first attempt stops before executing the probe because the minimal runtime omits `src/compiler/package/model.ts`. `CompilerModel` re-exports that module, so importing the executable-intent schema also requires it. The second attempt adds that unchanged dependency and passes. The failed output and dependency repair record remain available; the probe and native component do not change between attempts.

Source hashes, the extraction check, strict model vectors, raw observations, runtime manifests and cleanup receipt are retained under `.audit/probes/windows-root-sessions/`.

## Integration limits

These checks cover simultaneous live owners and interleaved calls in one JavaScript process; they do not claim parallel FFI execution across worker threads. `closeAll` remains resource cleanup rather than a terminal-session protocol. Production Effect scopes must keep acquisition within their lifetime and return captured data without exposing raw root owners.

Complete-path budgets, source symbolic-link coverage, materialization, production reader integration, activation and full Windows client lifecycle remain open. Artifact intent does not establish Windows ACL permission or executable startup. macOS has no qualification host. CI, package-consumer and release-wide checks remain user-deferred.
