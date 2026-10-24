# Native path observations

The Windows Codex 0.163.0 counterexample installed the reviewed files and enabled the plugin, but SDK inspection returned `unknown`. Its marketplace listing contains `name` and `root`. The adapter incorrectly requires `marketplaceSource` there. The plugin listing and TOML declaration contain that source, using `\\?\C:\...` while the marketplace root uses `C:\...`. The retained operation and both matching payloads are recorded in `.audit/probes/windows-activation/codex-read-only-inspection-observation.json`.

## Grounded flow

`Installer.apply` retains the complete pending operation before the recipe runs. After its Windows writers exit, `observe` calls `readInventory`, `nativeState`, and `verifyCandidate`. Native inventory and configuration become fingerprint facts without path rewriting. `marketplaceMatches` binds the client registration to `targetPaths(target).market`. `verifyCandidate` binds the reported source to a retained plan ID, catalog, marker and approved bundle, then checks the staged and loaded bytes. A failed observation leaves the original pending operation intact. Repair uses the same marketplace binding.

The fix must recognize the client's two spellings of an owned path without broadening ownership to other paths or changing fingerprint evidence. The existing Windows path model owns syntax and reserved-device rules; the target module owns the host binding and constructed installation paths.

## Alternatives and synthesis decision

| Shape | Assessment |
| --- | --- |
| Normalize every path in native JSON before inspection and fingerprinting | Reject. It erases reported evidence and gives untrusted path strings a general normalization rule. Extended paths disable ordinary parsing, so removing a prefix is unsafe for dot components, trailing spaces and device names. |
| Resolve every reported path to a filesystem identity | Defer. It requires additional I/O, admits other aliases, and changes the ownership contract beyond the observed spelling difference. |
| Compare a reported path against the constructed expected path, allowing one proved Windows spelling | Select. A single pure policy owns the exception; raw facts and existing payload checks remain authoritative. |

This extends the existing Windows path model instead of adding a forwarding module. The target adapter binds the runtime platform and validates the path strings at the native boundary.

## Usage and interface sketch

```ts
matchesTargetPath(paths.market, installed.marketplaceSource.source)

type NativePathInput = {
  readonly platform: RuntimePlatform
  readonly expected: FinalPath
  readonly reported: FinalPath
}

matchesNativePath(input: NativePathInput): boolean
```

Exact strings continue to match on every platform. A differing string matches only on `win32`, only when `expected` is an ordinary absolute DOS path, and only when `reported` is exactly `\\?\` followed by that expected string. The ordinary spelling requires an ASCII drive letter, colon and backslash, followed by either no components or nonempty Windows components. Components cannot contain forward slashes, syntax characters, control characters, trailing dots or spaces, or reserved device stems. Case changes, UNC paths, volume GUIDs, repeated prefixes, dot traversal and other aliases gain no exception. Capacity and physical identity remain the responsibility of the existing file reader.

The Codex marketplace summary schema requires its actual `root` field. Its optional source metadata, when present, must also match. The separately decoded declaration must have exactly `source_type: "local"` and `source`; the installed plugin must still report a local marketplace source. Every source is checked against the expected market. Candidate payload verification reads the constructed owned path after checking the reported spelling and plan ID. Raw native rows remain in the fingerprint.

The pinned [Codex marketplace serializer](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/cli/src/marketplace_cmd.rs#L299-L365) makes summary source metadata optional. Its lookup uses a path key, while the [absolute path wrapper](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/utils/absolute-path/src/lib.rs#L147-L176) removes the Windows prefix from the lookup path. Plugin source lookup uses the marketplace name. The downloaded source excerpts and hashes are retained in `.audit/probes/codex-metadata-facts/`; Linux summary shape is a source inference until a raw observation is captured.

## LDD and acceptance

WP15–WP20 state exact matching, platform isolation, complete admission, unsafe-spelling refusal, other-path refusal and admission of the extended spelling of an ordinary DOS path. Prove them, add strict oracle wire support and independent vectors, then establish TypeScript conformance before editing native I/O. Boundary tests must retain strict configuration shape and reject neighboring paths. Native acceptance requires recovery of the retained Codex operation without another mutation, then a fresh install, replacement, removal and replay against the original client executable. Windows profiles stay candidates until their complete scope is qualified.

The materialization checkpoint remains immutable evidence for its original revision. Before editing, the affected original files were archived with their checkpoint hashes in `.audit/probes/windows-native-paths/baseline.json`. Subsequent runs must record the exact successor source changes and cannot claim unchanged checkpoint bytes.

## Phase checklist

- Ground: complete; real metadata and the observation failure are retained.
- Sketch: complete; select comparison directed by the expected path.
- Agree: proceed within the instruction to complete the milestones.
- Implement: properties, proof, oracle/vectors, TypeScript conformance, then native I/O.
- Scrap: revisit this rule if native evidence requires broader alias handling.

Microsoft documents the parsing difference in [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).
