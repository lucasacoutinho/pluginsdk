# Executable-intent acceptance

This record accepts the original pure source and payload contracts. The [Effect schemas](../../contracts/ExecutableIntent.ts), [Lean model](../../spec/PluginSdk/ExecutableIntent/Model.lean) and [TypeScript port](../../src/internal/files/executable.ts) implement the selected [design](executable-intent-design.md). Capture, payload reading, staging and profile selection were unchanged at that checkpoint. The later [integration record](executable-intent-integration-acceptance.md) covers the authoring field, Linux I/O changes and four additional staging properties.

Source resolution preserves stable POSIX executable intent or applies exact declarations to a complete source inventory. It refuses duplicate paths, duplicate declarations, absent declared files, changed modes and missing native intent. An explicit empty declaration assigns false to every captured file. Paths retain their case, Unicode representation and inventory order.

Payload resolution binds the observed path and digest to the retained file before restoring its executable intent. Stable POSIX permissions must agree with the retained flag. An unrepresented native bit can restore either Boolean; an unavailable observation refuses. This distinction supplies the contract needed for Windows without claiming that Windows exposes a POSIX execute bit.

## Evidence

| Check | Result |
| --- | --- |
| EI1-EI16 | Sixteen certificates pass the independent exact-type and axiom audit. Only the permitted standard axioms occur. The focused build has no warnings. |
| Independent examples | 57 distinct authored requests cover all sixteen properties, six source refusal reasons and five payload refusal reasons. Expected results are authored independently of both implementations. |
| Generated comparisons | 3,072 requests cover all 512 permission values, retained flags and mode changes. Another 96 cover declaration/source permutations and 40 cover payload binding and mode evidence. All agree with the independent expectations and Lean. |
| Strict wire | 515 malformed requests are rejected, covering nested fields, JSON kinds, path/digest brands, duplicate escaped keys, Unicode, tags and permission bounds. |
| Exact numbers | Nineteen integral numeric forms pass. Ten precise fractional values are rejected even when a floating conversion would round them to an accepted integer. |
| TypeScript acceptance | Five tests pass, including strict schema rejection and input preservation. Scoped typechecking, strict Effect diagnostics and lint pass for the three feature files. |

The 3,208 generated comparisons plus 57 authored comparisons total 3,265. Permission expectations use arithmetic positions rather than the implementations' bit mask. Declaration expectations start with assigned flags and vary the input ordering. EI9 proves order independence for valid declarations; malformed declarations retain deterministic refusal precedence.

Main review removed a duplicate Python schema implementation. It also corrected a Unicode mutation that had left an empty declaration unchanged. The checker now mutates actual path locations, including declaration-array entries, and its malformed corpus has no overlap with the authored valid requests.

From `spec/`, build the focused modules and oracle:

```sh
lake build PluginSdk.ExecutableIntent.Proofs PluginSdk.ExecutableIntent.Wire oracle
```

From the repository root, check the wire and port:

```sh
python3 spec/scripts/check_executable_intents.py
npx vitest run test/executable-intent.test.ts
```

All sixteen properties are registered in the deferred combined gate, bringing its obligation count to 234. This acceptance checks the sixteen new certificates; it does not claim a combined-gate run. Source hashes, the exact-type/axiom audit, structured test results and scoped check receipts are retained under `.audit/probes/executable-intent-contract/`.

## Native and integration limits

These models consume supplied observations. The caller must compute the observed digest from the admitted bytes, validate the retained bundle and preserve the existing full-byte comparison. The proofs establish neither hash collision resistance nor the authenticity of supplied observations. A native owner must still establish regular-file kind, containment, metadata stability and resource lifetime.

The original checkpoint left the `executables` definition field and native integration for the next LDD phase. The [integration record](executable-intent-integration-acceptance.md) covers both intent values, non-default POSIX umasks, mode drift, exact declarations and changed paths/bytes on Linux. The subsequent [Windows file component](windows-executable-intent-acceptance.md) qualifies both retained flags over native files created with different requested modes. Production Windows reader integration remains open. Recovering artifact metadata does not establish Windows ACL permission or successful executable startup.

Complete-path budgets, source symbolic-link coverage, materialization, activation and production reader integration remain open. Windows installation profiles stay disabled. macOS qualification is deferred because no host is available. CI, package-consumer and release-wide checks remain user-deferred.
