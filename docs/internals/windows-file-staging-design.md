# Windows staged-file writes

## Problem and usage

Plugin authors keep the same `pluginsdk build` and `pluginsdk preview` workflow. Before native installation, ordinary recipes materialize each approved bundle file under its immutable payload. Codex project recipes materialize both a revision payload and a cache payload. Both call the private storage operation:

```ts
stageFile(key, path, bytes, executable): Effect.Effect<void, StateUnavailable>
```

The operation must create a new file exclusively, write the exact bytes, flush and close the file, then flush its containing directory. Any failed operation must fail staging. Existing destination bytes must survive a collision.

The current implementation calls path-based `writeFile` with `wx`, then reopens that path read-only to flush it. Earlier [Windows premises](windows-premises.md) found that read-only regular-file flushing fails. The documented Windows flush contract requires write access. A fresh native control and the actual product helper must confirm the failure before an implementation change. See [FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers).

## Alternatives and synthesis decision

| Shape | Ownership and interface depth | Decision |
| --- | --- | --- |
| Write by path, then reopen with platform-specific writable access | Keeps the public signature but gives the write and flush separate file opens. The helper must coordinate both paths and select access rights by platform. | Reject. It retains a reopen between writing and flushing. |
| Create, write and flush through one exclusive writable handle | The storage operation owns the complete file lifetime. Callers supply the same approved bytes and executable intent; no platform option or extra service escapes storage. | Select, subject to native write-only access controls. |

The selected implementation keeps `stageFile` in `src/installer/storage.ts`. It opens with `O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW` and the existing requested mode, writes and flushes through that handle, closes it in `finally`, and flushes the directory. `stateIO` retains the typed failure boundary. The existing uninterruptible operation waits for its I/O to finish. No new schema, domain variant or caller parameter is needed.

The [Node 24.18.0 file-handle contract](https://github.com/nodejs/node/blob/v24.18.0/doc/api/fs.md#class-filehandle) supports writing, flushing and explicit closure on the same handle. This change preserves exclusive creation and Linux mode requests. It does not establish Windows containment, executable-bit semantics, atomic activation or power-loss recovery.

## LDD and acceptance

This changes a filesystem premise of the existing lifecycle and repair models. Their pure policies stay unchanged. Scoped exact-type and axiom checks and TypeScript oracle conformance precede the I/O edit; they do not prove the native filesystem calls.

Native evidence must retain the pre-fix counterexample and compare it with the same harness after the fix. Check writable and read-only flush controls, binary and empty files, nested Unicode paths, existing-file and directory collisions, and a junction parent. Injected file-flush failure must propagate as `StateUnavailable`, close the handle, preserve the written bytes and refuse an overwriting retry. The Linux check must also preserve executable intent in its actual mode bits.

- [x] Ground: trace both recipe callers, the storage helper and existing Windows flush evidence.
- [x] Sketch: compare separate opens with ownership by one exclusive writable handle.
- [x] Agree: proceed under the active milestone authorization.
- [x] Verify scoped proofs and pure conformance before editing product I/O: twelve certificate checks and fourteen focused tests pass.
- [x] Reproduce the actual Windows staging failure and writable-access controls: four ordinary calls fail with `EPERM`; both writable controls succeed.
- [x] Implement the selected handle lifetime and qualify native and Linux behavior: all eleven cases pass on each host. See [acceptance](windows-file-staging-acceptance.md).
- [x] Reassess against native evidence: one writable handle resolves the observed failure without a new API or platform branch. Broader filesystem obligations remain open.
