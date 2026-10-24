# Windows compiler source-capture acceptance

One plugin definition now builds the same Claude and Codex bundles on Linux and Windows. The compiler shares skill parsing, agent projection and executable-intent handling over a private scoped source reader. The [design](windows-source-capture-design.md) keeps native ownership and traversal inside that reader.

The implementation consumes the accepted file-read, tree-read, executable-intent and Windows path-capacity models. Their schemas, pure operations, proofs and conformance evidence remain unchanged. This phase connects those operations to compiler I/O.

## Evidence

| Check | Result |
| --- | --- |
| Production entry points | Eighteen cases pass on Windows NT 10.0.26200 x64 with Node 24.18.0, Effect 4.0.5 and Koffi 3.3.3. The run calls the production source reader, `CompilerLive.build` with real `NodeServices.layer`, and default `readPayload`. |
| Build once | Eight selected source files produce an 11-file `claude_code_v5` bundle and an 11-file `codex_plugin_v2` bundle. Both encoded bundles match the Linux reference byte for byte, including paths, content, executable flags and metadata. |
| Declared selections | A selected file ignores an unrelated repository tree. Selected directories preserve exact Unicode names and bytes. Shared source paths reuse the first admitted bytes. Windows builds require explicit executable intent. |
| Source traversal | Contained junctions retain logical paths. Single-file selection checks its parent components. Outside targets, ancestor cycles, stored-case mismatches, invalid paths and unsuitable entry kinds refuse. A junction used as the requested root resolves once to the retained ordinary root. |
| Concurrent changes | A same-length rewrite during reading changes native timestamps and refuses. A directory membership change during traversal also refuses. |
| Existing payload behavior | Both built bundles retain their expected payload fingerprints through the default Windows reader. Payload inspection retains its separate reparse policy. |
| Capacity | The selected file reads at a 32,766-unit complete GUID name. All 127 deep directories and the boundary file are removed. |
| Ownership | Independent scopes remain usable after another scope closes. Released capabilities refuse before native calls. All 179 instrumented production handles and the separate fixture write handle close. Process handle counts return from 202 to 202. |
| Independent decoding | Python validates 1,998 raw calls, including 728 metadata buffers, seven enumeration buffers, 354 final names, 34 read buffers and four reparse buffers. It checks followed openings, reconstructs captured bytes and compares both complete bundles. |
| Linux regression | All 32 focused compiler, asset, agent-build, executable-intent-build and payload-intent tests pass. |
| Static checks | Scoped TypeScript and Oxlint pass. Effect diagnostics check 24 files with zero errors, warnings or messages. |
| Cleanup | Exact child exit, zero remaining job processes and job closure pass. Main verifies and removes all 4,972 staged runtime files, totaling 124,913,573 bytes. |

Before native staging, 260 of the prior 266 sealed files remain unchanged. Six intended production edits separate source I/O, share the content schema and add guarded target opening. Four source modules are new. The platform-profile registry remains unchanged.

The first native attempt exits before module evaluation because the staged dependency closure omits the required `redis` peer. Its exact exit and job closure pass. The corrected harness verifies all 2,323 existing runtime files and adds 2,649 dependency files without changing production sources. The second attempt runs all 18 cases successfully. Final cleanup removes the complete retained runtime.

Source manifests, the setup failure, native observations, independent validation and cleanup receipts are retained under `.audit/probes/windows-source-capture/`. Its `acceptance.json` seals the implementation and evidence.

## Remaining qualification

File and directory symbolic-link fixture creation both return privilege error 1314. Neither traversal kind is qualified by this run. Junction coverage does not close that gap.

Windows materialization, activation, engine settlement and full client lifecycle still require implementation and acceptance. Windows installation profiles remain disabled. macOS qualification is deferred because no host is available. CI, package-consumer and release-wide checks remain deferred.
