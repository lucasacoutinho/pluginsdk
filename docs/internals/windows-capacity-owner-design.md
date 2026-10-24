# Windows capacity at the native opening boundary

The [pure capacity operation](windows-path-capacity-acceptance.md) is accepted. The next component binds its inputs to a retained native root and applies its result before `CreateFileW`. Authors supply a package path, without native limits or root spellings.

## Selected ownership

| Shape | Decision |
| --- | --- |
| Let callers calculate or override capacities | Reject. The caller does not own the actual root observations or decoder allocations. |
| Cache a budget from the requested DOS root | Reject. Native expansion and the retained root's representations can differ. |
| Observe the retained root, derive capacity and classify the package path inside the native owner | Select. The opening operation owns both its observations and the admission decision. |

The component uses the unchanged, qualified [root owner](windows-root-session-acceptance.md). It obtains the volume component limit through `GetVolumeInformationByHandleW`. The API reports WCHAR units, matching the pure model. It queries the same retained handle for the normalized NT name and uses its validated GUID and volume-relative names. [Microsoft's volume API](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getvolumeinformationbyhandlew), [final-path API](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew).

The required views represent GUID creation input, normalized GUID output, opened GUID output, normalized NT expansion and the two counted volume-relative name outputs used by the reader. Limits remain private to the component. Creation permits 32,767 units including NUL in the qualified experiment. The final-name decoder allocates at most 32,768 units including NUL. The qualified normalization limit permits 32,767 NT text units. The counted `FILE_NAME_INFO` buffers hold 32,768 units without a terminator, represented in the capacity contract by a 32,769-unit limit including its conceptual NUL.

These are limits of the qualified operations and host observations, not universal Windows guarantees. The component requires a validated ordinary NTFS root. It refuses unavailable required observations. Root identity, canonical path and case sensitivity must still match the originally retained anchor. Every opening obtains fresh observations; a caller cannot reuse or override a returned budget.

The package path is parsed before native work. The existing lexical classifier retains syntax, device, component and path refusal order. Only acceptance constructs the complete GUID name and reaches `CreateFileW`. Successful opening still requires exact names, identity, stable reads and complete-tree admission before publication. Capacity admission alone cannot provide those facts.

## Native acceptance

An isolated Windows run must read an ordinary file through this opening boundary and compare its bytes and read-admission frame with the accepted models. It must construct a file whose complete GUID input exactly fits the derived capacity, then refuse one additional relative unit before `CreateFileW`. The fixture must keep each component within the observed volume limit so the boundary exercises the complete path limit.

Additional controls cover supplementary characters in the root and filename, syntax/device/component refusals, malformed package paths before any native call, repeated observations, independently owned roots and a closed root. Raw required capacities, UTF-16 buffers, root observations, pure frames and native call counts remain available for independent replay. Every acquired file handle and every created deep directory must be released or removed before the isolated runtime is deleted.

This phase qualifies the native opening component. Production reader integration, materialization, source symbolic-link coverage, activation and full Windows client lifecycle remain open. Windows profiles remain disabled. macOS, CI and release-wide checks retain their existing deferrals.
