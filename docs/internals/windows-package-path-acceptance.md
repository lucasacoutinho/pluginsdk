# Windows lexical path admission acceptance

The pure [Windows path contract](windows-package-path-design.md) is qualified. It classifies a package path against supplied UTF-16 capacities before native opening or materialization. It preserves the platform-neutral authoring schema and adds no SDK configuration.

The [Effect schemas](../../contracts/WindowsPath.ts), [Lean model](../../spec/PluginSdk/WindowsPath/Model.lean) and [TypeScript model](../../src/internal/windows-files/path.ts) agree on syntax, device, component-limit and path-limit refusals, in that order. An accepted decision establishes only the lexical and capacity rules. Native name fidelity and filesystem identity remain separate obligations.

## Evidence

| Check | Result |
| --- | --- |
| WP1-WP9 certificates | All nine have the exact registered property type. The axiom audit permits only `propext`, `Classical.choice` and `Quot.sound`. No `sorry`, custom axiom or native decision certificate is used. |
| Authored vectors | 107 distinct requests cover all nine properties and agree with independently authored responses. |
| Generated comparisons | TypeScript and Lean agree on 6,174 requests spanning Unicode, device families, control characters and both capacities. Inputs remain unchanged. |
| Strict wire | 81 malformed requests are rejected, including excess/missing fields, duplicate keys, invalid package paths and malformed capacities. |
| Exact numbers | Seventeen integral schema/capacity representations and negative-zero capacities pass. Four fractional or overflowing capacities and two non-one schema values that float conversion rounds to one are rejected. |
| Scoped TypeScript checks | Three tests, typechecking, lint and strict Effect diagnostics pass. |

WP1-WP5 establish each decision's exact conditions and refusal precedence. WP6 proves that increasing both capacities preserves acceptance. WP7 refuses any component containing a colon. WP8 establishes both bounds for every accepted path. WP9 proves the supplementary-character boundary: an emoji needs two UTF-16 units in both capacities.

The [vectors](../../spec/vectors/windows-paths.ndjson) include all 31 non-NUL C0 controls, documented device families and superscript digits, explicit default-stream syntax, separator budgets and zero/maximum capacities. Precomposed, decomposed and supplementary Unicode names remain representable. These are lexical decisions, not observations of filesystem collision behavior.

From `spec/`, build the focused oracle and certificates:

```sh
lake build PluginSdk.WindowsPath.Proofs PluginSdk.WindowsPath.Wire oracle
```

From the repository root, run the focused comparisons:

```sh
python3 spec/scripts/check_windows_paths.py
npx vitest run test/windows-path.test.ts
```

All nine properties are registered in the deferred combined gate, which now contains 205 obligations. Source hashes, the exact-type audit, scoped command results and the acceptance seal are retained under `.audit/probes/windows-package-path/`.

## Subsequent native qualification

Production capture, payload reading, staging and the profile registry are unchanged. No native filename trial was run in this pure phase. The subsequent [native filename component acceptance](windows-filename-acceptance.md) qualifies the tested names, aliases, component limits, collision refusals and cleanup. Complete traversal, executable intent, complete-path budgets and reader integration remain open. Windows installation profiles remain disabled.

macOS qualification remains deferred because no host is available. CI, package-consumer and release-wide checks remain deferred by the user.
