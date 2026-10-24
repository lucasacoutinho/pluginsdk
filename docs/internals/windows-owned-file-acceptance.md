# Windows owned-file component acceptance

The shared Windows file component passes 45 native checks on Windows x64 with Node 24.18.0 and Koffi 3.3.3. The component has no Installer caller yet. Windows companion inventory and complete hook and agent lifecycles remain open.

## Accepted behavior

[The internal service](../../src/internal/windows-files/managed.ts) owns physical ancestor handles, stable reads, staged publication and reviewed removal. Its Effect layer supplies the native API. Each operation closes its scoped handles before returning.

The native probe covers these behaviors:

- Create, read, replace and remove arbitrary role filenames with Unicode content.
- Refuse stale content, attributes and DACLs; preserve hidden/archive attributes and a protected DACL during replacement.
- Observe additional streams and refuse their replacement or removal. Reject stream syntax, case aliases and a reparse ancestor.
- Enforce byte ceilings, including an empty file at a zero-byte ceiling and a file that grows during reading.
- Delete the owned temporary object after an injected write failure. Retain staging after publication starts and the rename call fails.
- Exclude a competing data-write open during reviewed removal. If another object appears after the reviewed handle closes, retain that new object and report failure.
- Read and replace files written by the current project backend, and let that backend read and replace the shared component's output.

All 378 tracked component file handles close. The accepted Node process exits with code zero, its assigned job reaches zero active processes, and the job handle and direct process object close. Main review independently checks every handle event pair, the original staged-file hashes and the retained fixture bytes. The scratch directory is removed only after another matching native inventory.

## Evidence and limits

The [RF1–RF8 pure gate](windows-companion-file-acceptance.md) precedes this I/O implementation and retains the 318-property audit. Strict TypeScript, Effect diagnostics, scoped lint and compilation pass. The only existing production source change adds an optional byte ceiling to `readBytes`; its default preserves the earlier reader behavior.

The probe uses a fresh UUID directory and standalone, verified Node/Koffi artifacts. It copies no client state or older scratch installation. The first launcher failed before loading its wrapper because environment isolation removed its process execution policy. The next guarded Node process failed during module loading because `jsonc-parser` was missing. Both failures remain recorded. After correcting those inputs, the unchanged compiled component passes all 45 checks.

The local record is `.audit/probes/windows-owned-file-component/acceptance.json`. It retains artifact checksums, the compiled candidate, failed launches, the native report, handle events, inventories and main verification.

Replacement rechecks the reviewed destination before a name-based rename. It provides no atomic comparison of target identity or metadata against arbitrary external writers. Removal reviews and deletes the same handle, while data-write sharing is excluded. Other metadata permissions remain a separate concern. These are component guarantees; interruption, repair, role-name inventory and complete client lifecycles need their own integration evidence.

Installer routing, production runtime bytes, enabled profiles and automatic format selection remain unchanged. No native client session runs in this gate. macOS remains deferred without a host.
