# Opened-file read admission acceptance

The pure [read-admission contract](file-read-design.md) is qualified. It decides whether supplied observations permit a read; it does not collect those observations or enable Windows installation profiles.

The [Effect schemas](../../contracts/FileRead.ts), [Lean model](../../spec/PluginSdk/FileRead/Model.lean) and [TypeScript model](../../src/internal/files/file.ts) share three operations: parse a final path, check proper containment, and admit a read. The author definition and CLI are unchanged.

## Evidence

| Check | Result |
| --- | --- |
| V1-V10 certificates | All ten pass the exact-type audit with only `propext`, `Classical.choice` and `Quot.sound`. No `sorry`, custom axiom or native decision certificate is used. |
| Authored vectors | 64 cases: 18 path, ten containment and 36 read cases. Lean and TypeScript agree with the authored responses. |
| Generated conformance | 580 path/containment requests and 2,187 read requests agree with Lean without mutating inputs. |
| Strict wire | 584 malformed requests are rejected, including missing/extra fields, invalid identities and quantities, duplicate keys, NUL and invalid Unicode. |
| Schema numbers | Seven exact representations of one are accepted. Two mathematically non-one values that floating-point conversion rounds to one are rejected. |
| Scoped TypeScript checks | All four tests pass across the authored and generated runs. Typechecking, lint and strict Effect diagnostics pass. |

The [vectors](../../spec/vectors/file-reads.ndjson) include empty files, signed-64-bit maximum quantities, full hexadecimal identities, GUID-case aliases, Unicode components, component-case differences, sibling escapes, stream syntax and refusal precedence. Five cases retain exact snapshots from the [Windows observation bridge](windows-file-observation-acceptance.md): a regular-file positive control, rename, replacement, named stream and junction escape. Reusing those observations is a pure contract check, not a new native read trial.

Run the focused checks from the repository root:

```sh
python3 spec/scripts/check_file_reads.py
npx vitest run test/file-read.test.ts
```

Build the oracle with `lake build oracle` from `spec/` first. The [certificates](../../spec/PluginSdk/FileRead/Proofs.lean) are registered in the deferred combined proof gate. Scoped command results, the ten-certificate audit and source hashes are retained in `.audit/probes/file-read-contract/`.

## Remaining native work

Production source capture, payload reading and staged-file writing are unchanged in this phase. Windows profiles remain disabled. Before integration, native qualification must establish root and ancestor lifetime, trustworthy physical paths, file sharing and stable reads through the observed handle. Before/after agreement alone does not prove continuous immutability.

Executable semantics, activation, other metadata boundaries, separate debug chains, full engine settlement and complete Windows client lifecycle remain open. No macOS host is available, so macOS qualification stays deferred. CI, package-consumer and release-wide checks remain deferred by the user.
