# Windows bundle-materialization acceptance

Both installer recipes now materialize an approved payload through one private operation before publishing metadata. Linux retains its existing file writer. Windows retains destination ancestors, creates files exclusively and captures the completed payload before the shared path, byte and executable-intent comparison. The [design](windows-materialization-design.md) records the selected ownership boundary.

The file-read, Windows-path, tree-read and executable-intent contracts remain unchanged. Their 57 certificates pass exact-type and standard-axiom checks. Twenty focused TypeScript oracle-conformance tests pass before the I/O edits.

## Evidence

| Check | Result |
| --- | --- |
| Production entry points | Twenty cases pass on Windows NT 10.0.26200 x64, Node 24.18.0, Effect 4.0.5 and Koffi 3.3.3. The run calls `CompilerLive.build`, `materializePayload`, the native writer and default `readPayload`. It also checks refusal through the ordinary recipe. |
| Build once | One definition produces the expected 11-file Claude bundle and 11-file Codex bundle. Both materialize with exact paths, bytes and retained executable flags. Their fingerprints match the Linux reference. |
| Names and admission | NFC and NFD names, supplementary characters, an empty file and a file spanning multiple write buffers survive exactly. Device, stream, trailing-period, component-limit and path-limit refusals precede directory or file creation. ASCII and Greek parent aliases refuse. |
| Containment and collisions | Junction roots, junction ancestors and a junction inserted during staging refuse before writing through them. Existing file and directory contents survive collisions. Held files refuse another writer, and held parents refuse renaming. |
| Write outcomes | A real short write completes through subsequent writes. Injected write failure preserves the first 65,536 bytes. Injected zero progress refuses. Injected flush failure preserves written bytes and refuses. All failing scopes close, and retries preserve existing data. |
| Complete comparison | An injected extra file appears in the captured inventory and fails the shared comparison. Both ordinary recipes refuse an occupied payload without publishing a catalog or marker. |
| Capacity | Materialization and capture succeed at a 32,766-unit complete GUID name. One further unit refuses before creation. The file and all 128 created directories are removed. |
| Ownership | All 582 instrumented root, directory and file handles close. After standard-stream initialization, the process count remains 202 before and after every case, including each public build, write and read. |
| Independent decoding | Python validates 13,318 raw calls, 4,540 metadata buffers, 72 enumeration buffers, 2,261 final names, 593 read buffers and 50 recorded write buffers. It distinguishes three injected outcomes and reconstructs all 22 bundle write/read streams. |
| Linux behavior | All 27 focused regressions pass. Three ordinary Claude/Codex lifecycles and the Codex project v2 lifecycle pass with real pinned clients. The project case runs in its required separate network namespace. |
| Static checks | Scoped TypeScript and Oxlint pass. Effect diagnostics check 18 files with zero errors, warnings or messages. |
| Cleanup | Exact child exit, zero remaining job processes and job closure pass. Main verifies and removes all 5,046 staged runtime files, totaling 126,565,798 bytes. |

Before native staging, 303 of the prior 309 sealed files remain unchanged. Six intended production edits add native creation, share completed-tree capture and comparison, and route both recipes through materialization. Two production modules and one focused test file are new. The platform-profile registry remains unchanged.

## Diagnostic and retained evidence

The first run passes all 20 behavior cases and closes all 582 instrumented handles, but its process count changes from 201 to 202. That run remains unqualified. Independent decoding confirms its behavior observations without marking the ownership check passed.

The second probe measures standard-stream initialization separately. Accessing `process.stdout` increases the count from 201 to 202. `process.stdin` and `process.stderr` leave it unchanged. Effect's pinned terminal layer accesses these process-owned streams when constructed. Every subsequent build, write, read and case retains the 202 baseline. Production code stays unchanged between attempts; all 5,045 other runtime files match before replacing only the probe.

An initial Linux fixture listed files in noncanonical order and failed the payload comparison. Its corrected approved inventory passes. The first combined native Linux run passes three ordinary lifecycles but refuses the project case at its network-namespace precondition. The isolated project rerun passes. These receipts remain separate from product failures.

Source manifests, native observations, diagnostics, independent validation and cleanup receipts are under `.audit/probes/windows-materialization/`. Its `acceptance.json` seals the implementation and evidence.

## Remaining qualification

This accepts bundle materialization on the tested Windows host. Atomic catalog and configuration activation, engine settlement and complete native client lifecycle remain open. This run does not establish power-loss recovery or Windows CLI installation support. Windows profiles stay disabled.

Source file and directory symbolic-link qualification remains open because fixture creation is denied with error 1314. macOS qualification is deferred without a host. CI, package-consumer and release-wide checks remain deferred.
