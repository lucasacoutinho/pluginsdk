# Windows package-path materialization

## Caller outcome

Authors keep one definition, `pluginsdk build` and `pluginsdk preview`. A Windows adapter must preserve package names or refuse the operation with the offending path. It must not silently rename files, change case, normalize Unicode or redirect a path to a stream or device.

This is the next design after [native read ownership acceptance](windows-file-read-acceptance.md). It introduces no SDK options and enables no Windows profile.

## Current flow

[`PackagePath`](../../contracts/Plugin.ts) parses relative Unicode paths with slash separators. It rejects backslashes, NUL and dot segments, but permits colons within components. [`capture`](../../src/compiler/source/capture.ts) preserves logical names while following contained source links. The compiler assembles those files and validates the complete bundle. [`pathCollisionKeys`](../../src/internal/paths.ts) checks ASCII case collisions and file/directory prefix conflicts. It is not a Windows Unicode filename comparator.

For an ordinary installation, [`executeOrdinaryChange`](../../src/installer/lifecycle/recipe.ts) stages bundle files, publishes marketplace metadata and then invokes the client. [`stageFile`](../../src/installer/storage.ts) creates each file exclusively and flushes its bytes. Project execution stages both marketplace and cache payloads. Later, [`readPayload`](../../src/installer/payload/read.ts) enumerates each installed tree, rejects links and compares the retained package. Its Linux descriptor checks currently keep this flow unavailable on Windows.

Windows path admission belongs inside these operations. A caller must not coordinate filename validation, native comparison and staging. The existing public `Compiler` and `Installer` interfaces retain ownership of the complete operation.

## Alternatives and synthesis decision

| Complete design | Complexity hidden or exposed | Decision |
| --- | --- | --- |
| Restrict the shared authoring schema to Windows-compatible filenames | One early rule covers every platform, but changes which existing Linux sources and bundles are valid. Native aliases and destination behavior still need runtime checks. | Reject the global restriction. |
| Predict all Windows collisions with a pure filename-normalization table, then stage | Makes preflight deterministic, but duplicates native Unicode, case, short-name and namespace behavior. A wrong equivalence rule can admit aliases or reject distinct files. | Reject as the authority for filesystem identity. |
| Keep platform-specific lexical admission inside native operations; qualify exclusive creation and exact name fidelity on the destination | Hides Windows syntax, capacities, alias behavior and cleanup. Retains every original package name. Collisions can refuse an unpublished staged tree. | Select, subject to native fidelity checks. |

Rewriting names into generated safe names would require rewriting arbitrary plugin content and references. A sidecar map cannot make native clients resolve those references. That design does not preserve the existing bundle contract.

The selected adapter uses pure pre-open admission to exclude special syntax. Native creation, traversal and observed names then establish what the filesystem actually represented. A successful lexical decision alone grants no permission to publish or activate a payload. The native owner retains every handle and keeps incomplete staging outside activation.

## Private contract sketch

The first pure contract classifies one existing `PackagePath` against capacities supplied by the native root owner:

```ts
type PathCapacity = {
  maxComponentUnits: UInt32
  remainingPathUnits: UInt32
}

type WindowsPathDecision =
  | "accepted"
  | "syntax"
  | "device"
  | "component_limit"
  | "path_limit"

classifyWindowsPath(input: {
  path: PackagePath
  capacity: PathCapacity
}): WindowsPathDecision
```

These types are schema-derived internal contracts. The capacity units are UTF-16 code units, including separators for the relative path budget. The native root owner derives the remaining budget from its qualified API bounds and actual root path. A volume query supplies its component limit. Callers never configure these values. Zero capacity remains a representable refusal case, so the pure function is total.

The classifier preserves Unicode and letter case. It rejects stream delimiters, Win32 reserved characters and control characters, trailing space/period semantics and reserved device names, including documented extension and superscript-digit forms. It counts supplementary Unicode characters as two UTF-16 units. It returns a decision without rewriting the path or manufacturing a physical identity.

Refusal precedence is syntax, device, component limit, then complete relative-path limit. Syntax means a component contains a character below U+0020 or one of `< > : " \\ | ? *`, or ends in an ASCII space or period. The existing package schema supplies separator and dot-segment validity. Device matching uses the first period-delimited stem, removes its trailing ASCII spaces and folds ASCII letters only. The reserved stems are `con`, `prn`, `aux`, `nul`, `conin$`, `conout$`, and `com`/`lpt` followed by 1-9 or superscript 1-3. The console forms are documented by [CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#consoles). This explicit admission policy still requires the native filename qualification below.

The [Effect schemas](../../contracts/WindowsPath.ts) define this internal input and its five decisions. WP1-WP5 require exact admission and refusal conditions. WP6 requires accepted paths to remain accepted as both capacities increase. WP7 refuses every component containing a colon. WP8 requires both component and complete-path bounds for every accepted input. WP9 checks the two-unit supplementary-character boundary, including both distinct limit refusals.

The private `RootReader.read` operation runs this classifier before opening the requested source file. The materialization operation checks every bundle path before staging any file. Actual name collisions and file/directory conflicts still require native evidence. Exclusive creation must never replace an existing file. The completed tree must match the original bundle before metadata publication or client activation.

## Native premises and proof limits

[Windows naming rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) document special characters, device names, trailing space/period behavior and short-name aliases. The previous native probe confirms that `::$DATA` can disappear from the final path. Those facts require admission before opening.

[CompareStringOrdinal](https://learn.microsoft.com/en-us/windows/win32/api/stringapiset/nf-stringapiset-comparestringordinal) uses the operating system's uppercase table when case is ignored. Its documentation does not establish that the function reproduces every destination filesystem's lookup behavior. JavaScript lowercasing is likewise insufficient evidence. The selected design does not depend on either as proof of file identity.

[GetVolumeInformationByHandleW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getvolumeinformationbyhandlew) returns the volume's component limit in WCHARs. A volume capability flag does not establish the current directory's case behavior. Retained directory observations and the actual creation checks must supply that evidence.

Before integration, isolated native checks must establish exact-name observations for case aliases, Unicode pairs, composed/decomposed names, short names, trailing characters and explicit namespace syntax. They must also cover device spellings, component limits, file/directory conflicts and cleanup after refusal. Extended-path APIs and ordinary client lookup may differ; successful SDK staging alone cannot qualify client loading.

The [native filename checks](windows-filename-acceptance.md) now qualify these tested premises on the isolated NTFS host. They expose an ancestor-alias counterexample: `Tools/a.bin` and `tools/b.bin` can both be created, but both appear under `Tools`. The complete materializer must verify every stored component and the resulting tree before publication. Exclusive leaf creation is insufficient. Case-sensitive directories also keep `A.bin` and `a.bin` distinct despite ordinal ignore-case equality. Neither observation changes the lexical model into a filesystem comparator.

## LDD sequence

- [x] Ground the authoring schema, capture, bundle validation, staging, inspection and accepted native findings.
- [x] Compare complete alternatives and select platform-owned admission with native fidelity checks.
- [x] Proceed under the active milestone authorization.
- [x] Specify lexical admission properties and prove them in Lean.
- [x] Add strict oracle cases and TypeScript conformance before changing production I/O. See the [pure acceptance record](windows-package-path-acceptance.md).
- [x] Qualify tested native names, component capacities, collisions and cleanup. See the [component acceptance](windows-filename-acceptance.md); maximum complete-path capacity and client loading remain open.
- [ ] Integrate with complete traversal and executable-intent contracts, then reassess the design against native counterexamples.

The [complete-capacity design](windows-path-capacity-design.md) now records the native prefix-expansion counterexample and selected budget operation. A requested path's length is insufficient: creation, NT normalization and final-name output have different bounds. The root owner must derive the remaining relative capacity from all required native views before using this classifier.
