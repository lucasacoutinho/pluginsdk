# Windows package metadata

The package reader must inspect directories as well as ordinary files. Eight isolated native cases establish the stream-query behavior needed by [local package claims](local-package-claims.md) on Windows `10.0.26200`, x64, with Node `24.18.0` and Koffi `3.3.3`.

| Entry | Observed data streams |
| --- | --- |
| Empty or populated ordinary directory | No records; the native call returns false with EOF 38. |
| Empty or populated ordinary file | One `::$DATA` record, including a zero-size record for an empty file. |
| Directory with named streams | Its named data streams, without a default data record. |
| File with named streams | The default data record and each named stream. |

The controls include Unicode stream names, multiple records and empty named streams. All nine entries receive two physical snapshots, basic-info queries, stream inventories and DACL digests. All 18 observations preserve their expected kind, identity, bytes and metadata. Main independently decodes the retained basic and stream buffers and compares every field with the reported records.

All nine tracked probe handles close. The native process exits successfully, its job has no remaining processes, and its owning handles close. The separate read-only verifier opens eleven authored data streams through native safe handles and checks their SHA-256 values before and after retention. All six named streams are retained as ordinary binary files, alongside default contents and raw observations. The 17 runtime files are independently compared before the accepted temporary root is removed.

The private evidence is `.audit/probes/cursor-package-capture/attempt-001/`. The first retention reader exposes Windows PowerShell text-encoding defaults and the .NET Framework path parser's refusal of the named-stream syntax. Corrected scripts use explicit UTF-8 and native safe handles. The original scripts, failed command outputs and successful correction are retained; no native case is rerun to repair these read-only verification errors.

## Implementation consequence

The shared decoder must distinguish an empty stream inventory from an empty default file stream. A package directory can have no data streams; a regular file must expose its default stream. Named data streams on either kind are outside the approved package representation and must prevent an owned complete or partial claim. Other query failures must remain errors rather than empty inventories. Metadata stability and physical tree admission retain their separate checks.

This premise does not implement the package reader, durable claim storage or Installer recovery. Public Cursor admission remains gated on those components and actual SDK lifecycle checks. macOS remains deferred without a host.
