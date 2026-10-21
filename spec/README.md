# Lean contract

This is pluginsdk's formal model, following the [LDD loop](../docs/ldd.md) used by lcode. Lifecycle proves P1 through P14, rendering B1 through B8, and bundle checks V1 through V4. Asset assembly adds A1 through A7, repair review R1 through R8, invocation authorization U1 through U8 and catalog admission and selection C1 through C6. The proof gate checks `55/55` properties.

The existing [TypeScript conformance suite](../test/conformance.test.ts) compares 4,210 requests with the oracle. The separate repair suite compares 18 vectors and 40 generated requests.

The [authorization suite](../test/authorization.test.ts) compares 49 authored vectors, 120 generated combinations and a three-call revocation sequence. Its model receives trusted service evidence; it does not verify tokens or enforce a backend call.

The [catalog suite](../test/catalog.test.ts) compares 41 independent vectors and 144 generated requests, then checks release promotion, enumeration order and schema rejection. C1-C6 prove immutable admission and exact artifact selection through the pure model. Persistence, artifact verification and distribution remain I/O obligations.

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
| [Compiler/Assembly/Types.lean](PluginSdk/Compiler/Assembly/Types.lean), [Properties.lean](PluginSdk/Compiler/Assembly/Properties.lean) | Asset assembly contract and obligations A1 through A7 |
| [Compiler/Assembly/Model.lean](PluginSdk/Compiler/Assembly/Model.lean), [Proofs.lean](PluginSdk/Compiler/Assembly/Proofs.lean), [Wire.lean](PluginSdk/Compiler/Assembly/Wire.lean) | Canonical asset assembly, certificates for A1 through A7, and strict `assemble` wire |
| [Assembly.ts](../contracts/Assembly.ts), [assembly.ts](../src/model/assembly.ts), [assembly.test.ts](../test/assembly.test.ts) | Effect contract, conforming TypeScript model, and oracle comparisons |
| [Repair/Types.lean](PluginSdk/Repair/Types.lean), [Properties.lean](PluginSdk/Repair/Properties.lean) | Repair-review states and obligations R1 through R8 |
| [Repair/Model.lean](PluginSdk/Repair/Model.lean), [Proofs.lean](PluginSdk/Repair/Proofs.lean), [Wire.lean](PluginSdk/Repair/Wire.lean) | Pure repair review, certificates for R1 through R8, and strict repair wires |
| [Repair.ts](../contracts/Repair.ts), [Installer.ts](../contracts/Installer.ts), [repair.ts](../src/model/repair.ts), [repair.test.ts](../test/repair.test.ts) | Effect contracts, reviewed repair basis, conforming model, and oracle comparisons |
| [Authorization/Types.lean](PluginSdk/Authorization/Types.lean), [Rules.lean](PluginSdk/Authorization/Rules.lean), [Properties.lean](PluginSdk/Authorization/Properties.lean) | Trusted facts, independent eligibility predicates and obligations U1 through U8 |
| [Authorization/Model.lean](PluginSdk/Authorization/Model.lean), [Proofs.lean](PluginSdk/Authorization/Proofs.lean), [Wire.lean](PluginSdk/Authorization/Wire.lean) | Pure authorization, certificates for U1 through U8 and strict `authorize` wire |
| [Authorization.ts](../contracts/Authorization.ts), [authorization.ts](../src/model/authorization.ts), [authorization.test.ts](../test/authorization.test.ts) | Effect schemas, conforming model and authorization checks |
| [Catalog/Types.lean](PluginSdk/Catalog/Types.lean), [Rules.lean](PluginSdk/Catalog/Rules.lean), [Properties.lean](PluginSdk/Catalog/Properties.lean) | Release ledger, exact artifact correspondence and obligations C1 through C6 |
| [Catalog/Model.lean](PluginSdk/Catalog/Model.lean), [Proofs.lean](PluginSdk/Catalog/Proofs.lean), [Wire.lean](PluginSdk/Catalog/Wire.lean) | Immutable admission, resolution, proof certificates and strict catalog wire |
| [Catalog.ts](../contracts/Catalog.ts), [catalog.ts](../src/model/catalog.ts), [catalog.test.ts](../test/catalog.test.ts) | Effect schemas, conforming catalog model and independent oracle checks |
| [WireJson.lean](PluginSdk/WireJson.lean) | Duplicate-key rejection and shared identity and contained-path decoders |
| [Check.lean](scripts/Check.lean) | Required proof names, exact theorem types, and the axiom audit |
| [check_replay.py](scripts/check_replay.py) | Replay examples, vector freshness, and malformed wire checks |
| [check_compiler.py](scripts/check_compiler.py) | Compiler examples, vectors, malformed wire checks, and reordered inputs |
| [check_bundle.py](scripts/check_bundle.py) | Bundle examples, vectors, malformed wire checks, and independent combination checks |
| [check_assembly.py](scripts/check_assembly.py) | Assembly vectors, malformed wire checks, 40 permutations, and 819 path combinations |
| [check_repair.py](scripts/check_repair.py) | Repair vectors and malformed wire checks |
| [check_authorization.py](scripts/check_authorization.py) | Authored authorization vectors, malformed evidence and JavaScript numeric semantics |
| [check_catalog.py](scripts/check_catalog.py) | Independent catalog vectors and malformed release, target and provenance inputs |

## Design decision

| Candidate | Consequence |
| --- | --- |
| Postulate model functions with axioms or placeholder bodies | Other declarations could appear proved while depending on an invented implementation. |
| State properties over an explicit function interface | Lean checks the contract's types now. A later concrete model must supply proofs of those exact properties. |

The design selects explicit interfaces. There are no postulated functions, `sorry` proofs, or dummy implementations in the contract. Planning rules and native format relations specify behavior; they do not implement the product's operations.

For the executable models, returning each result with its proof would couple computation to certification. The selected design keeps total functions in `Model.lean` and certificates in `Proofs.lean`. The oracle imports model and wire modules without importing the certificate modules. Construction and ordering helpers include lemmas needed by those certificates. The public Effect interfaces stay the same.

P5 requires an authorized fresh plan to start, P8 requires observed success to settle, P14 specifies the planning table, B4 requires representable input to render, V4 requires a valid envelope to pass and U7 requires a fully authorized invocation to succeed. Those clauses exclude models that simply reject every request. B3 and V3 require collision diagnostics to correspond to actual paths.

## Check the design

From this directory:

```sh
lake build
lake build oracle
python3 scripts/check_replay.py
python3 scripts/check_compiler.py
python3 scripts/check_bundle.py
python3 scripts/check_assembly.py
python3 scripts/check_repair.py
python3 scripts/check_authorization.py
bash scripts/gate.sh
```

The project pins Lean 4.34.1 and has no external Lean dependencies. `lake build` checks the models, specification, and proofs. `lake exe oracle` reads one version 1 request per line and writes one response per line.

The compiler wires handle `render` and `assemble`. The bundle wire handles `check_bundle`. The repair wire handles `repair_propose`, `repair_begin`, and `repair_settle`. Authorization handles `authorize`; catalog handles `catalog_register` and `catalog_resolve`. The lifecycle wire handles `decide`, `begin`, and `settle`. Each request carries its full input. A malformed request writes a diagnostic to stderr and exits 1 without a response.

The gate audits all 55 proofs and builds the oracle. It checks 12 lifecycle frames, 15 render frames, 15 bundle frames, 6 assembly frames, 18 repair frames, 49 authorization vectors and 41 catalog vectors.

It rejects 17 malformed lifecycle, 39 malformed render, 36 malformed bundle, 38 malformed assembly, 31 malformed repair, 277 malformed authorization and 481 malformed catalog requests. These checks include duplicate keys, escaped duplicate keys and numeric schema versions. Authorization also checks safe integer milliseconds using JavaScript binary64 decoding.

The gate also checks 100 reordered render inputs and 1,638 bundle combinations. Assembly adds 40 permutations and 819 path combinations. The gate compares these generated cases with independent expectations.

`PluginSdk.Lifecycle.model`, `PluginSdk.Compiler.model`, `PluginSdk.Compiler.Bundle.model`, `PluginSdk.Compiler.Assembly.model`, `PluginSdk.Repair.model`, `PluginSdk.Authorization.model` and `PluginSdk.Catalog.model` have their declared `Interface` types. Each property requires a theorem with the same basename under its module's `Proofs` namespace. For example, `Lifecycle.Proofs.P1_unowned_never_starts` proves `Lifecycle.P1_unowned_never_starts Lifecycle.model`, without additional assumptions or parameters.

The gate rejects missing certificates, mismatched theorem types, non-theorem certificates, `sorryAx`, and custom axioms. It audits dependencies of every loaded declaration under `PluginSdk`; only `propext`, `Classical.choice`, and `Quot.sound` are allowed. This follows Lean's [proof validation guidance](https://lean-lang.org/doc/reference/latest/ValidatingProofs/).

Temporary checks passed 1,800 lifecycle oracle request/response pairs and all 15 compiler frames through the existing Effect 4.0.5 schemas with strict decoding and round trips. They exercised every lifecycle outcome variant. Seven generated portable documents passed the pinned Agent Plugins schemas. A 176-path corpus agreed between the Effect schema, relative-path grammar, and Lean decoder. The oracle also answered while stdin remained open. These checks establish wire compatibility; the complete JSON codec has no formal correctness proof.

The existing TypeScript suite compares committed example/vector frames, generated lifecycle traces, 1,920 rendering permutations, 48 Schema-generated normalized MCP cases, and 1,638 bundle combinations. The assembly and repair suites run separately. The repair suite compares 18 committed vectors and 40 generated requests with the oracle. Each suite strictly decodes oracle responses and checks the TypeScript model result. Boundary and native I/O checks remain separate from these formal properties.

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

Authorization compares semantic identities and evidence supplied by the service. Its wire checks nonempty names, contract digest syntax and safe integer timestamps; the model's time domain is `Nat`. U1-U8 prove the decision over those facts, including expiry, age bounds and current-grant revocation. They do not establish token verification, audience binding, membership authority, contract hashing, record permissions, clock accuracy or enforcement. Those require qualified I/O as described in the [authorization design](../docs/authorization-design.md).
