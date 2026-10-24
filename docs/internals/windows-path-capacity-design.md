# Complete Windows name capacity

Authors keep one definition and the existing build/install commands. The native owner derives a path budget from its actual root and required API name views. A package path must fit every required name, including separators and NUL, before native opening or materialization. No author configures these limits.

## Grounded behavior

The [lexical classifier](windows-package-path-design.md) already proves syntax, device, component and relative-path admission. Its caller supplies `remainingPathUnits`. It does not establish that the caller subtracted the right root or accounted for every API representation.

The [reusable native owner](windows-root-session-acceptance.md) binds each root to a handle and canonical GUID path. Its reads obtain final names through `GetFinalPathNameByHandleW`. Production staging still uses the existing `stageFile`; the Windows materializer and reader have not been integrated. Those operations must own admission together with their native lifetimes.

Microsoft documents the extended maximum as approximate because namespace-prefix expansion affects the total. `GetFinalPathNameByHandleW` reports successful text length without NUL, but required buffer length with NUL. These are separate limits. [Maximum path length](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation), [final path by handle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew).

## Native counterexample

An isolated NTFS experiment uses an emoji-containing root and deep components no longer than 255 UTF-16 units. Two sweeps attempt every complete requested length from 32,720 through 32,770, through GUID and extended DOS names. Both create through 32,766 units; the next unit refuses with Win32 error 206. Every created file is closed and deleted.

Creation alone is insufficient. A successful DOS request of 32,766 units expands to 32,808 GUID units, and all three final-name queries fail with error 161. Adjacent controls distinguish requested-name limits from normalization and output-buffer limits:

| DOS request units | GUID output units | NT output units | Final-name queries |
| --- | --- | --- | --- |
| 32,724 | 32,766 | 32,741 | All succeed |
| 32,725 | 32,767 | 32,742 | All succeed |
| 32,726 | 32,768 | 32,743 | All succeed |
| 32,749 | 32,791 | 32,766 | All succeed |
| 32,750 | 32,792 | 32,767 | All succeed |
| 32,751 | — | 32,768 implied by the observed root expansion | All refuse with error 161 |

The current reader also bounds each final-name allocation to 32,768 units. Its configured decoder capacity and an API's creation or normalization limit must remain distinct. A successful native creation cannot authorize publication of a payload that the required reader cannot represent.

These are host observations, not universal Windows constants or completed planner acceptance. Raw buffers, requested lengths, errors, source snapshots and cleanup are retained under `.audit/probes/windows-path-budget/`. Validation reconstructs the UTF-16 bytes and every generated parent path. Across the three completed observations, 104 files and 512 directories are created and removed. The initial failed probe also cleans its 94 files and 256 directories; its assertion incorrectly required every final-name query to succeed.

## Alternatives and synthesis

| Complete shape | Decision |
| --- | --- |
| Subtract one requested DOS root from a universal 32,767-character constant | Reject. It admits the observed file whose creation succeeds but normalization fails, and conflates input and output capacities. |
| Use only the canonical GUID root and one capacity | Reject as a general contract. GUID input currently dominates on this host, but the operation also relies on expanded NT names and a separately bounded output decoder. |
| Derive the tightest budget across all required native name views and their qualified limits | Select. One owner supplies the observed roots and operation-specific bounds; one pure operation returns the capacity consumed by the existing classifier. |

No second path-normalization policy is added. Native observation supplies the root spellings. Existing name-fidelity and complete-tree checks remain required, and no file is renamed to make it fit.

## Selected private contract

The new schema-derived input contains a component limit and a nonempty list of required name views. Each view provides its observed native root text and a qualified limit for that complete UTF-16 name buffer, including NUL. Repeated views can carry distinct operation limits: for example, GUID input and GUID output allocation.

```ts
deriveWindowsPathCapacity(input: {
  maxComponentUnits: UnitCapacity
  views: readonly [
    { root: FinalPath; maxPathBufferUnits: UnitCapacity },
    ...ReadonlyArray<{ root: FinalPath; maxPathBufferUnits: UnitCapacity }>
  ]
}):
  | { type: "available"; capacity: PathCapacity }
  | { type: "refused" }
```

The private operation is implemented in [the pure model](../../src/internal/windows-files/path.ts). For each view, root overhead is its UTF-16 length, one separator when missing, and one NUL. If any root overhead exceeds its limit, resolution refuses. Otherwise the available relative budget is the minimum remaining space across all views. Zero remaining space is valid and the existing classifier refuses every nonempty package path against it. The component limit is preserved.

The native owner constructs every required view from the same retained root and the actual API/decoder limits. It does not accept caller-configured root budgets. Source, staged and loaded trees each derive their own capacity. Existing syntax/device/component refusal precedence remains inside `classifyWindowsPath`.

## LDD obligations

WP10-WP14 prove exact available/refused resolution, complete-name fit for every required view, a witness that the budget is tight, monotonic behavior as limits increase, and independence from view ordering. The fit property counts actual UTF-16 separators and NUL. Independent vectors cover root suffix separators, supplementary characters, zero capacity, multiple views, duplicate views, distinct operation limits and the observed counterexample.

Property definitions, Lean certificates, strict wire cases and conforming TypeScript pass in the [pure acceptance record](windows-path-capacity-acceptance.md). Production I/O does not yet use the operation. Native integration must derive every required view from the retained root and qualified operation limits before it opens or materializes a package path.

Windows materialization, production integration, source symbolic-link coverage, activation and client lifecycle remain open. Windows profiles stay disabled. macOS has no host. CI, package-consumer and release-wide checks remain deferred.
