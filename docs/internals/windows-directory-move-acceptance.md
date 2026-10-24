# Windows directory moves

The private Installer operation can move a directory into an absent destination on Windows x64. It requires the expected physical source identity and admits both parent paths from a retained root. This is one prerequisite for [Cursor local ownership](cursor-ownership-design.md). Package claims, the step interpreter and public Cursor support remain open.

## Implementation

`NativeRoot.moveDirectory` retains the root and admitted parents without delete sharing. It refuses reparse points, aliases, stale source identities, occupied destinations and destinations inside the source. The source handle requests delete access. Publication uses `SetFileInformationByHandle` with an absolute Volume GUID name, a null rename root and replacement disabled. The same source handle must report the expected identity and admitted destination afterward. Operation handles close before the method returns; the root can serve another move.

The scoped `WindowsDirectoryMover` layer owns root acquisition and release. Its construction performs no native calls. The shared rename-buffer encoder also serves managed-file publication; that existing policy is unchanged.

## Checks

Four focused tests pass: independent x64 encoding vectors, malformed UTF-16 and pointer limits, inert service construction, and strict request decoding. Scoped TypeScript, Effect diagnostics over five files and lint report no warnings or errors.

The isolated native run uses Windows `10.0.26200`, x64 and Node `24.18.0`, with Koffi `3.3.3`. All 25 cases pass:

- Ordinary and Unicode publication preserve directory identity and file bytes.
- Seventeen refusal cases preserve their inventories and issue no rename: occupied destinations, stale identities, wrong or missing source kinds, missing parents, reparse points, aliases, descendant destinations, invalid device names, component limits and a closed root.
- A destination created after the absence probe makes the kernel refuse publication with error 183. Both the source and the new destination survive.
- Two moves through one retained root release their operation handles between calls.
- The default live layer publishes successfully. Managed-file creation and replacement pass through the shared encoder and preserve an unrelated file.
- Two owned child processes stop immediately before and after the native rename. Fresh inspection finds the expected source or published directory and unchanged bytes. Only the before-call case retries, after that inspection.

All 157 handles observed through the injected parent-process API close. That count excludes the default layer's internal calls and the two terminated children. Both children reach their selected pause and close; the owning job exits successfully with no remaining processes. All 58 runtime files are retained and independently compared before the accepted temporary root is removed.

The private acceptance record is `.audit/probes/cursor-local-io/attempt-003/main-acceptance.json`; cleanup is recorded alongside it. Attempt 001 exposes error 87 for a relative-name/non-null-root rename. Attempt 002 passes publication but stops at an obsolete Effect API in the private harness. Their frozen inputs and failed fixtures remain preserved. Neither failed attempt contributes to the accepted case count.

## Boundary

This primitive verifies directory identity and namespace admission. It does not verify a package's complete or partial contents, confer ownership from a pathname, or implement Installer recovery. Discard actions will move verified packages into immutable SDK history outside the client's scan path; recursive garbage collection is separate. The check makes no machine-crash or power-loss guarantee.

No Cursor client, provider, third-party service or account is used in this component check. Public profiles and runtime distribution files are unchanged. macOS remains deferred without a host; CI, package-consumer, release and publication work retain their user deferrals.
