# Production Windows payload-reader acceptance

The installer now reads Windows payloads through a private scoped Effect service. Ordinary and project inspection share the same retained-file comparison on both platforms. The [design](windows-production-read-design.md) keeps handle ownership, native decoding and path admission below that comparison.

The production implementation consumes the previously proved file-read, tree-read, executable-intent and Windows path-capacity models. Their schemas, models, proofs and conformance evidence remain unchanged. This phase connects those accepted operations to production I/O.

## Evidence

| Check | Result |
| --- | --- |
| Actual production entry points | Sixteen cases pass on Windows NT 10.0.26200 x64, Node 24.18.0 and Koffi 3.3.3. The run calls the production reader implementation and the default `readPayload` entry point. |
| Complete capture | Empty directories, zero-byte files, a file spanning multiple read buffers, distinct NFC/NFD names and supplementary characters preserve exact paths and bytes. Native permission observations remain unrepresented. |
| Retained comparison | Repeated reads preserve the existing `37a1d864…f011037` fingerprint. Both approved executable flags survive comparison. Byte, missing-path and extra-path drift produce mismatches and different fingerprints. |
| Concurrent changes | An actual same-length rewrite during reading changes timestamps and refuses. Adding a file after the first directory enumeration also refuses. Both failing scopes release their handles. |
| Reparse policy | A junction root and inside/outside child junctions refuse. Payload inspection does not follow them. |
| Capacity | Production traversal reads the file at a 32,766-unit complete GUID name. A further relative unit refuses before `CreateFileW`. Syntax, device and component limits also refuse before opening. |
| Ownership | Independently retained owners share one immutable ABI binding. Closing one preserves the other; closed capabilities refuse before native calls. All 153 instrumented production handles and the separate fixture creation handle close. Process counts return from 182 to 182. |
| Independent decoding | Main validates 1,264 raw call records, including 468 metadata buffers, 13 enumeration buffers and 222 final-name results. Python independently reconstructs the recorded snapshot and all five captured byte streams. |
| Linux regression | All 22 focused payload, project-plan, companion-plan, repair and repair-storage tests pass. The existing literal fingerprint assertion remains intact. |
| Static checks | Scoped TypeScript and Oxlint pass. Effect diagnostics check ten files with zero errors, warnings or messages. |
| Cleanup | The boundary file and all 127 deep directories are removed. Exact child exit, zero remaining job processes and job closure pass. Main verifies and removes all 978 staged runtime files, totaling 109,937,903 bytes. |

Before staging, 210 prior sealed files match exactly. The three intended production changes are `payload.ts`, `inspect.ts` and `project-inspect.ts`; the five Windows reader modules are new. The platform-profile registry remains unchanged.

Two earlier attempts stopped during harness setup: one lacked the transitive `jsonc-parser` package, and another supplied bytes to a base64 wire decoder. Both exited and closed their jobs before correction. The first runtime was verified and removed. The second retained runtime was verified before replacing only its probe; all 977 other files stayed unchanged. Neither attempt ran the production cases.

Source manifests, setup failures, native observations, independent validation and cleanup receipts are retained under `.audit/probes/windows-production-read/`. Its `acceptance.json` seals the current implementation and evidence.

## Remaining integration

This qualifies production payload capture on the tested Windows host. Compiler source capture, source symbolic-link coverage, materialization, activation, engine settlement and full client lifecycle still require integration and acceptance. Windows installation profiles remain disabled.

macOS qualification is deferred because no host is available. CI, package-consumer and release-wide checks remain deferred.
