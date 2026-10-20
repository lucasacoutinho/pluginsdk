# Lean contract

This is pluginsdk's formal model, following the [LDD loop](../docs/ldd.md) used by lcode. Lifecycle proves P1 through P14; rendering proves B1 through B8; bundle checks prove V1 through V4. One NDJSON oracle exposes the proved functions. The proof gate checks `26/26`; [TypeScript conformance](../test/conformance.test.ts) compares 4,210 actual oracle requests with the runtime models.

| File | Defines |
| --- | --- |
| [Domain.lean](PluginSdk/Domain.lean) | Distinct identity types, contained package paths, skill names, formats, and path comparisons |
| [Lifecycle/Types.lean](PluginSdk/Lifecycle/Types.lean) | Installation states and the `decide`, `begin`, and `settle` interface |
| [Lifecycle/Rules.lean](PluginSdk/Lifecycle/Rules.lean) | Ownership, journal projection, and the required planning and settlement relations |
| [Lifecycle/Properties.lean](PluginSdk/Lifecycle/Properties.lean) | Obligations P1 through P14 |
| [Lifecycle/Model.lean](PluginSdk/Lifecycle/Model.lean) | Total functions for planning, begin, replay, and settlement |
| [Lifecycle/Proofs.lean](PluginSdk/Lifecycle/Proofs.lean) | Proof certificates for P1 through P14 against that model |
| [Lifecycle/Wire.lean](PluginSdk/Lifecycle/Wire.lean) | Strict version 1 request decoding and response encoding |
| [Oracle.lean](Oracle.lean) | Streaming NDJSON execution of the models |
| [Compiler/Types.lean](PluginSdk/Compiler/Types.lean) | Captured content, requested headers, native JSON, and rendering results |
| [Compiler/Format.lean](PluginSdk/Compiler/Format.lean) | Native document meanings, header compatibility, requested paths, and collisions |
| [Compiler/Properties.lean](PluginSdk/Compiler/Properties.lean) | Obligations B1 through B8 |
| [Compiler/Model.lean](PluginSdk/Compiler/Model.lean) | Total rendering into copy references, native JSON, or canonical issues |
| [Compiler/Proofs.lean](PluginSdk/Compiler/Proofs.lean) | Proof certificates for B1 through B8 against that model |
| [Compiler/Paths.lean](PluginSdk/Compiler/Paths.lean), [Collisions.lean](PluginSdk/Compiler/Collisions.lean) | Contained path construction and complete collision detection |
| [Compiler/Canonical.lean](PluginSdk/Compiler/Canonical.lean) | Unsigned UTF-8 ordering, sorting, and deduplication lemmas |
| [Compiler/Json.lean](PluginSdk/Compiler/Json.lean), [Native.lean](PluginSdk/Compiler/Native.lean) | Native JSON construction, exact fields, and header lookup proofs |
| [Compiler/Headers.lean](PluginSdk/Compiler/Headers.lean) | Header rejection rules and meaning preservation |
| [Compiler/Facts.lean](PluginSdk/Compiler/Facts.lean), [Enumeration.lean](PluginSdk/Compiler/Enumeration.lean) | Source accounting, result facts, and invariance under enumeration changes |
| [Compiler/Wire.lean](PluginSdk/Compiler/Wire.lean) | Strict rendering request decoding and response encoding |
| [Compiler/Bundle/Types.lean](PluginSdk/Compiler/Bundle/Types.lean), [Properties.lean](PluginSdk/Compiler/Bundle/Properties.lean) | Bundle-check projection, results, and obligations V1 through V4 |
| [Compiler/Bundle/Model.lean](PluginSdk/Compiler/Bundle/Model.lean), [Proofs.lean](PluginSdk/Compiler/Bundle/Proofs.lean) | Digest comparison, canonical paths, and exact diagnostic certificates |
| [Compiler/Bundle/Wire.lean](PluginSdk/Compiler/Bundle/Wire.lean) | Strict `check_bundle` decoding and result encoding |
| [WireJson.lean](PluginSdk/WireJson.lean) | Duplicate-key rejection and shared identity and contained-path decoders |
| [Check.lean](scripts/Check.lean) | Required proof names, exact theorem types, and the axiom audit |
| [check_replay.py](scripts/check_replay.py) | Replay examples, vector freshness, and malformed wire checks |
| [check_compiler.py](scripts/check_compiler.py) | Compiler examples, vectors, malformed wire checks, and reordered inputs |
| [check_bundle.py](scripts/check_bundle.py) | Bundle examples, vectors, malformed wire checks, and independent combination checks |

## Design decision

| Candidate | Consequence |
| --- | --- |
| Postulate model functions with axioms or placeholder bodies | Other declarations could appear proved while depending on an invented implementation. |
| State properties over an explicit function interface | Lean checks the contract's types now. A later concrete model must supply proofs of those exact properties. |

The design selects explicit interfaces. There are no postulated functions, `sorry` proofs, or dummy implementations in the contract. Planning rules and native format relations specify behavior; they do not implement the product's operations.

For the executable models, returning each result with its proof would couple computation to certification. The selected design keeps total functions in `Model.lean` and certificates in `Proofs.lean`. The oracle imports model and wire modules without importing the certificate modules. Construction and ordering helpers include lemmas needed by those certificates. The public Effect interfaces stay the same.

P5 requires an authorized fresh plan to start, P8 requires observed success to settle, P14 specifies the planning table, B4 requires representable input to render, and V4 requires a valid envelope to pass. Those clauses exclude a model that simply rejects every request. B3 and V3 require collision diagnostics to correspond to actual paths.

## Check the design

From this directory:

```sh
lake build
lake build oracle
python3 scripts/check_replay.py
python3 scripts/check_compiler.py
python3 scripts/check_bundle.py
bash scripts/gate.sh
```

The project pins Lean 4.34.1 and has no external Lean dependencies. `lake build` checks the models, specification, and proofs. `lake exe oracle` reads one version 1 request per line and immediately writes one response per line. It accepts `render`, `check_bundle`, `decide`, `begin`, and `settle`. Each request carries its full input. A malformed request writes a diagnostic to stderr and exits 1 without an answer for that request.

The gate audits all 26 proofs, builds the oracle, and checks [12 lifecycle frames](vectors/lifecycle.ndjson), [15 compiler frames](vectors/compiler.ndjson), and [15 bundle frames](vectors/bundle.ndjson) against the models and design examples. It rejects 17 malformed lifecycle, 39 malformed compiler, and 36 malformed bundle requests, including duplicate and escaped duplicate keys, and checks equivalent numeric schema versions. It also checks 100 reordered compiler inputs and 1,638 bundle combinations against independent expectations. All checks pass.

`PluginSdk.Lifecycle.model`, `PluginSdk.Compiler.model`, and `PluginSdk.Compiler.Bundle.model` have their declared `Interface` types. Each property requires a theorem with the same basename under its module's `Proofs` namespace. For example, `Lifecycle.Proofs.P1_unowned_never_starts` proves `Lifecycle.P1_unowned_never_starts Lifecycle.model`, without additional assumptions or parameters.

The gate rejects missing certificates, mismatched theorem types, non-theorem certificates, `sorryAx`, and custom axioms. It audits dependencies of every loaded declaration under `PluginSdk`; only `propext`, `Classical.choice`, and `Quot.sound` are allowed. This follows Lean's [proof validation guidance](https://lean-lang.org/doc/reference/latest/ValidatingProofs/).

Temporary checks passed 1,800 lifecycle oracle request/response pairs and all 15 compiler frames through the existing Effect 4.0.5 schemas with strict decoding and round trips. They exercised every lifecycle outcome variant. Seven generated portable documents passed the pinned Agent Plugins schemas. A 176-path corpus agreed between the Effect schema, relative-path grammar, and Lean decoder. The oracle also answered while stdin remained open. These checks establish wire compatibility; the complete JSON codec has no formal correctness proof.

The TypeScript suite compares all committed example/vector frames, generated lifecycle traces, 1,920 rendering permutations, 48 Schema-generated normalized MCP cases and 1,638 bundle combinations. It strictly decodes oracle responses and checks the actual TypeScript model results. Boundary and native I/O checks remain separate from these formal properties.

## Representation and proof limits

`Lifecycle.Journal.idle` wraps the three idle variants. Its codec flattens that wrapper to match the existing Effect schemas. Lean constructor names such as `notApplied` encode as wire values such as `not_applied`; the design adds no wire fields. The compiler codec flattens captured assets and header literals as follows.

| Lean representation | Required wire representation |
| --- | --- |
| Identity, path, and skill-name wrappers | Their string values |
| `NonemptyList.head` and `tail` | One nonempty JSON array |
| `Asset.file` | `digest` and `executable` beside `path` |
| `HeaderValue.literal` | A JSON string |
| `HeaderValue.environment` | An object with `type: "environment"`, `name`, and `prefix` |
| `JsonObject` | Its JSON value, without the proof field |

Compiler records use lists for MCP servers and headers so enumeration order can vary. `Normalized` requires distinct exact record keys. ASCII case aliases remain possible inputs and must produce rejection. Canonical URLs, header syntax, metadata validation, and file capture are prerequisites supplied by the source decoder. Their external validation is not proved by these properties.

Package paths and skill names carry their validity propositions. The decoder establishes those propositions before calling the model. Path containment uses nonempty safe segments with no dot segments or drive prefix, so generated paths can carry direct proofs. Digests and fingerprints are distinct symbolic identities; the model does not compute SHA-256. Copy preservation is preservation of captured identities and executable bits. The real content table must supply the corresponding bytes.

Generated JSON is interpreted as objects, rather than serialized bytes. RFC 8785 encoding, URL normalization, filesystem containment, process outcomes, and durable writes retain their own checks. The [LDD specification](../docs/ldd.md) records these assumptions and the development order.

Bundle checking receives claimed and recomputed digests and the complete committed path sequence. V1 through V4 prove its decision policy, including rejection without repairing the artifact. They do not establish how `computed` was obtained. The [bundle contract](../docs/bundle.md) requires a private byte snapshot shared by hashing, native validation, plan persistence, and staging; those operations remain implementation obligations.
