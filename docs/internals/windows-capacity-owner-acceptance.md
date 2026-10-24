# Windows native capacity admission acceptance

The private native opening component derives its path budget from the retained root and enforces it before `CreateFileW`. It uses the [accepted pure capacity model](windows-path-capacity-acceptance.md), the unchanged [native root owner](windows-root-session-acceptance.md) and the ownership described in the [design](windows-capacity-owner-design.md).

The isolated Windows run reads an actual file with a complete GUID name of 32,766 UTF-16 units. Its complete input buffer contains 32,767 units including NUL. Adding one relative unit refuses with `path_limit` before a native opening call. Every component stays within the observed 255-unit volume limit, so this exercises the complete-path boundary.

## Evidence

| Check | Result |
| --- | --- |
| Root observations | Three retained owners provide native volume information, GUID input/output names, opened GUID names, normalized NT names and counted volume-relative names. Independent decoding reconstructs 102 required views across 17 observations. |
| Native opening | Ordinary and supplementary filenames and the exact complete-path boundary open and read successfully. Six reads preserve the expected bytes and fit every required actual name representation. |
| Pre-open refusal | One complete-path overflow, two syntax cases, one device name and two component overflows refuse before `CreateFileW`. |
| Boundary parsing | Nine malformed package paths refuse before any native call. |
| Ownership | Every opening refreshes root observations. Distinct roots derive their own capacities. A second owner of the same root remains readable after the first is closed. Closed-root operations refuse before native calls. |
| Model replay | All 35 recorded capacity, lexical and read-admission frames agree with their expectations, Windows TypeScript, WSL TypeScript and Lean. Strict schema decoding and unchanged inputs pass. |
| Resource cleanup | All nine native reader/root handles and the one native creation handle close. Process handle counts start and end at 182. The boundary file and all 127 deep directories are removed. |
| Isolation | Exact child exit and job closure pass. Main verifies the staged manifest before removing all 632 runtime files. |

The native root and file name buffers are decoded independently from their raw UTF-16 output. Validation checks required capacities, returned lengths, terminal NUL where applicable and the counted `FILE_NAME_INFO` lengths. It checks the capacity input against those actual root names and the operation's private limits. The read checker reconstructs all six byte streams from native `ReadFile` buffers.

The pure acceptance's 58 pins pass before staging and again before native acceptance. The staged WindowsPath schema and model match the accepted extension; the native root-owner implementation and shared ABI remain unchanged. Product source, production filesystem I/O and the profile registry remain unchanged in this phase.

Source hashes, stage/run manifests, raw observations, strict model vectors, validation and cleanup receipts are retained under `.audit/probes/windows-capacity-native/`. Its `acceptance.json` seals the component and evidence. No failed native attempt or unresolved cleanup remains.

## Remaining integration

This qualifies the capacity boundary for ordinary native openings on the tested host. Diagnostic access to the raw owner remains private to the qualifier. Production Effect scopes must hide it, use the admitted opening operation and release every owner before returning captured data.

Production source/payload reader integration, source symbolic-link coverage, materialization, activation and full Windows client lifecycle remain open. Capacity checks do not replace exact-name, stable-read or complete-tree admission. Windows profiles remain disabled. macOS has no qualification host. CI, package-consumer and release-wide checks remain deferred.
