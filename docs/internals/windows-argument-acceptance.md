# Windows argument acceptance

The private Windows argument codec passes Q2's Lean proof, pure TypeScript conformance and 4,850 actual Windows argument comparisons. The existing recipe entry now uses that codec. Seven native execution regression scenarios pass. This accepts argument serialization on Windows 10.0.26200 x64 with Node 24.18.0 and Koffi 3.3.3; command transport and Windows client profiles remain unqualified.

## Contract and integration

[Q2](../../spec/PluginSdk/Installer/WindowsCommand/Quoting.lean) requires an independent quoted-word reader to recover every encoded argument. The exact-type and standard-axiom audit passes. The codec preserves literal quotes and doubles the required backslash runs. External process text still rejects NUL and malformed Unicode at the schema boundary.

Twenty independent vectors and 4,811 generated TypeScript comparisons pass against the actual Lean executable. The strict wire rejects 22 malformed requests and accepts three numeric-schema equivalents. These pure checks passed before the [native entry](../../src/installer/windows/process/native.ts) changed. The runtime change imports the [codec](../../src/installer/windows/protocol.ts) and uses it to assemble the existing recipe arguments.

Scoped TypeScript checking, lint and Effect diagnostics pass, with zero errors, warnings or messages across seven checked files. The focused suites pass five tests: two codec tests and three worker-entry subprocess tests. Q2 brings the registered obligations to 178. The combined proof and release gates remain deferred.

## Native checks

The probe launches the pinned Node executable through explicit `CreateProcessW`, with a writable UTF-16 command line. Executable and script paths contain spaces and Unicode. It invokes no shell. A small child records its actual argument array in a file; the main thread independently compares all returned values and their order with the original inputs.

| Check | Observed result |
| --- | --- |
| Argument preservation | All 4,850 distinct inputs survive four launches unchanged. Cases include empty arguments, ASCII controls, embedded quotes, whitespace, shell metacharacters, Unicode, combining marks and long backslash runs. |
| Creation gate | Every child remains suspended with its output file absent and an independent handle wait of `WAIT_TIMEOUT`. `ResumeThread` reports a prior suspend count of one. |
| Completion | Every independent handle signals before the final exit-code read. All four children exit zero. |
| Resource release | All sixteen harness-owned native handles close, including four independent process handles. All four attribute lists are deleted. Cleanup reports no errors and the outer containment job closes. |
| Existing execution | All seven original execution scenarios pass against the changed launcher. Every one of the fifteen independent process observations signals before release. The staged native worker is restored to its original hash. |

The four batches contain 3,062, 1,779, three and six arguments. Their complete returned arrays are retained under `.audit/probes/windows-command-design/actual-argv/`. Source hashes, reviewed harnesses, pure acceptance, raw observations and wrapper receipts are beside them. The owned Windows stage is removed after verification.

## Limits

The [command design](windows-command-design.md) still requires asynchronous pipe acquisition, cancellation, bounded streams, command containment and actual inspection protocols. This probe uses NUL standard handles and files to observe arguments; it does not qualify pipe transport. Microsoft documents the serialization rules for its C runtime. The actual Node checks do not establish argument behavior for every executable. [Microsoft argument parsing](https://learn.microsoft.com/en-us/cpp/c-language/parsing-c-command-line-arguments?view=msvc-170).

The regression suite checks the existing execution component. It does not add a fresh full-engine recovery or client lifecycle claim. Filesystem capture/publication, remaining recovery boundaries and real Windows client acceptance remain open. No macOS host is available. CI, package-consumer and release-wide checks remain deferred.
