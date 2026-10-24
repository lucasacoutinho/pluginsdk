# Windows companion integration acceptance

Project configuration and Codex companion storage now use the shared Windows file owner. Role inventory retains config-layer declarations, recursive discovery and logical-name conflicts. Its Windows facts include content, attributes, DACL digest and stream state, so metadata drift changes the existing installation fingerprint. Saved-plan fields and author configuration stay the same.

`role-storage.ts` selects the physical backend and passes the role byte ceiling through reads and mutation reviews. `role-storage-posix.ts` retains the Linux protocol. `project-file.ts` calls the shared Windows service directly; the duplicate `project-file-windows.ts` backend is removed. File snapshots derive absence and byte presence together from the authoritative schema. Library operations start no Effect runtime.

## Accepted behavior

The fresh Windows x64 fixture passes 42 operations on Node 24.18.0, including 16 expected refusals. It exercises the compiled production adapters with 18 supplied Codex config exchanges. It runs no real client session.

- Project reads preserve complete UTF-8 text, including the BOM. Replacement preserves reviewed attributes and protected DACL state. Missing parents, stale metadata, invalid UTF-8 and additional streams refuse without changing the existing bytes.
- Companion creation makes its physical parent. Keep preserves the file identity. Replacement preserves metadata, and removal leaves unrelated nested roles intact.
- Inventory records complete Windows bases and changes its facts when attributes or DACL state change. Recursive aliases, referenced logical names, declarations of the fixed path and byte-identical unowned files block mutation.
- Oversized desired bytes refuse before parent creation. Oversized existing files and additional streams become unknown and block mutation. A junction parent cannot receive a role file.

After warming the filesystem and protocol, all 38 measured operations retain the process handle count of 191. The guarded Node invocation exits successfully, its job reaches zero active processes, and the job and process object close. This gate measures process handle counts; the preceding [component gate](windows-owned-file-acceptance.md) separately records each native file handle.

Main review verifies all 4,532 staged files before execution, all 4,537 retained files afterward, the resulting project bytes, companion absence and unchanged unrelated role bytes. Another matching inventory precedes removal of the owned fixture. The dependency fixture uses 24 lock-pinned packages and the official Node archive; all archive checksums and extracted files are independently verified.

## Checks and limits

The [RF1–RF8 conformance gate](windows-companion-file-acceptance.md) precedes I/O changes and retains the 318-property audit. The stronger snapshot schema passes the existing 13 pure checks before integration. Scoped strict TypeScript, Effect diagnostics with no warnings or messages, lint and compilation pass. Four Linux filesystem and plan suites pass all 22 tests.

The additional `agent-lifecycle.test.ts` run passes its authored cases but stops at a generated-case count assertion: it expects 100 and produces 116. That file matches its existing index version; this integration does not change its generating contracts or model functions. The failure is retained separately. No CI or release gate runs.

The local record is `.audit/probes/windows-companion-integration/acceptance.json`. It preserves the frozen design, before-images, scoped checks, dependency provenance, native report, inventories, review and cleanup evidence.

The selected module boundaries match the implementation. The POSIX mutation signatures gained a byte-ceiling argument so that inventory and mutation review use one limit. Windows replacement retains the component's documented name-based rename limit; metadata equality does not provide an atomic conditional rename against arbitrary external writers.

Complete Windows SDK feature lifecycles, interruption and repair, private worker composition and profile promotion remain open. Production worker bytes and automatic format selection are unchanged. macOS qualification remains deferred because no host is available.
