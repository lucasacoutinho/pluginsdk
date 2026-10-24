# Windows package capture

The private Windows package reader captures physical root identity, every file and directory, content digests and a basis that includes native metadata. It reuses the existing payload traversal and admits file and directory observations before returning a tree. The reader supplies inputs to the [package classifier](local-package-claims.md); trusted durable approvals remain an Installer obligation.

## Qualified behavior

Twenty-one isolated cases pass on Windows `10.0.26200`, x64, with Node `24.18.0` and Koffi `3.3.3`:

- Complete packages, file subsets and approved empty parent directories classify correctly. Unrelated empty directories, changed bytes, stale physical identities and unclaimed packages remain foreign.
- Named data streams on files, child directories or the root prevent capture, including an empty named stream. Junctions also prevent capture.
- Unchanged captures preserve their basis. Changing a hidden attribute changes the basis while preserving file contents. Attribute or directory-stream changes during an actual read cause a typed failure.
- The default live layer captures an ordinary package. Reader construction performs no native calls. Existing payload reads preserve their default-content behavior, and managed-file creation, replacement and additional-stream refusal pass after adopting the shared metadata decoder.

Fourteen returned trees pass the authoritative schema and agree with the actual Lean oracle on their captured inputs. Eight captures return expected failures. The fixture supplies approvals explicitly; it does not establish durable approval validation or storage.

## Resources and evidence

All 216 injected API handles close. The default live layer obtains its own API, so its internal calls are outside that count. The native Node process exits successfully and its Windows job has no remaining descendants.

Main reviews the case results and independent inventories. A separate native safe-handle reader checks all 61 authored data streams before and after retention, including named stream bytes preserved as ordinary evidence files. All 117 runtime files match the native inventory before the accepted temporary root is removed. Private records are under `.audit/probes/cursor-package-reader/attempt-001/`.

Eight focused unit tests pass, including the accepted native stream vectors and malformed-buffer refusals. Scoped TypeScript, Effect diagnostics over five files and lint report no errors, warnings or messages. The [pure classifier checks](local-package-claims.md#acceptance) precede these I/O changes.

Durable physical claims, the LocalSlot interpreter, SDK install/update/remove, drift and interruption checks remain open. This component does not enable a public Cursor profile. macOS qualification remains deferred without a host; CI and release-wide checks remain deferred by request.
