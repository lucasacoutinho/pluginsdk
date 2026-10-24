# Complete Windows path-capacity acceptance

The private `deriveWindowsPathCapacity` operation derives the tightest relative-path budget across every required native name view. It counts UTF-16 units, the separator when missing, and the terminal NUL. A root that already exceeds its buffer limit refuses. A root that exactly fits returns zero remaining capacity. Authors keep the existing definition and commands.

The [design and native counterexample](windows-path-capacity-design.md) explain why one requested path limit cannot account for normalization and output buffers. The [Effect schemas](../../contracts/WindowsPath.ts) require at least one view and preserve each operation's limit. The [Lean properties](../../spec/PluginSdk/WindowsPath/Properties.lean), [certificates](../../spec/PluginSdk/WindowsPath/CapacityProofs.lean) and [TypeScript model](../../src/internal/windows-files/path.ts) agree before production I/O changes.

## Evidence

| Check | Result |
| --- | --- |
| WP10-WP14 | Exact resolution, complete-name fit, greatest fitting budget, monotonic limits and ordering independence are proved. All 14 Windows path certificates pass the exact-type audit with only `propext`, `Classical.choice` and `Quot.sound`. |
| Authored capacities | 32 distinct requests match explicit expected responses. Independent UTF-16 byte counts verify each available budget's fit and tightness and every refusal's root overflow. |
| Generated capacities | 1,320 TypeScript requests agree with Lean. Additional assertions check full encoded names, tight bounds, reversed views, increased limits and unchanged inputs. |
| Strict capacity wire | 76 malformed requests are rejected, including missing/excess fields, empty views, duplicate keys, invalid Unicode, NUL and invalid capacities. Fourteen exact integral numeric forms and two negative-zero forms pass. Eight precise invalid numbers are rejected. |
| Lexical regression | 107 authored and 6,174 generated decisions still agree. The existing 81 malformed requests and exact-number controls pass. |
| Scoped checks | Six tests, TypeScript checking, lint and strict Effect diagnostics pass. Effect reports zero errors, warnings and messages across the three affected TypeScript files. |

The capacity vectors distinguish supplementary characters from code points, preserve combining sequences, account for trailing separators, keep component limits unchanged and enforce the tightest of repeated or distinct API views. The native counterexample is represented by roots with a 42-unit difference: accepting only the DOS budget would admit a name that exceeds the required expanded view.

From `spec/`, build the focused model, certificates and oracle:

```sh
lake build PluginSdk.WindowsPath.CapacityProofs oracle
```

From the repository root, check the wire and TypeScript conformance:

```sh
python3 spec/scripts/check_windows_root_capacities.py
python3 spec/scripts/check_windows_paths.py
npx vitest run test/windows-path.test.ts
```

The deferred combined registry contains 243 obligations, including all 14 Windows path properties. Scoped check receipts, source hashes, the independent vector check and the acceptance seal are retained under `.audit/probes/windows-root-capacity/`.

## Remaining integration

The operation trusts the owner's supplied root views and limits. Its proof does not establish which views an API requires, discover filesystem limits, validate root identity or qualify a host. Native integration must construct these inputs from the retained root, apply admission before opening or materialization, and preserve the existing exact-name and complete-tree observations.

Production filesystem I/O and Windows profiles are unchanged in this phase. Source symbolic-link coverage, materialization, activation, reader integration and full Windows client lifecycle remain open. macOS has no host. CI, package-consumer and release-wide checks remain deferred.
