# Lean contract

[Portable feature defaults](../docs/internals/portable-feature-defaults-acceptance.md) revise BF1 and BF2 so that hooks or agents select the client's portable v2 format. BF3 keeps stdio-only selection on portable v1; BF4 keeps basic outputs unchanged. The current exact-type and axiom audit checks **318/318 properties**. All sixteen feature inputs agree with Lean and TypeScript, and both decoders reject the 33 malformed request frames. Native Linux and Windows user qualification now backs all four enabled feature profiles.

The following entries record earlier checkpoints and the support boundaries that applied when each was accepted.

[Companion-file policy](PluginSdk/Installer/CompanionFile/Properties.lean) adds RF1–RF8 for exact Linux private-mode admission, Windows metadata admission, reviewed-basis equality and projection into companion observations. The [proofs](PluginSdk/Installer/CompanionFile/Proofs.lean) bring the exact-type and axiom audit to **318/318 properties**. Seventy-six [frozen expectations](vectors/companion-files.ndjson), 13,490 generated comparisons and 28 malformed-wire pairs conform before file I/O changes. The original 53 project-file expectations also pass the extended oracle. [Pure policy acceptance](../docs/internals/windows-companion-file-acceptance.md) records the boundary; native Windows companion storage remains open.

The [portable feature compiler gate](../docs/internals/portable-features-compiler-acceptance.md) extends catalog, artifact, distribution and compatibility formats to distinct Claude/Codex portable v2 identities. All **310/310** existing universal certificates rebuild and pass the audit. [Thirty-six frozen format cases](vectors/portable-feature-formats.ndjson), the original thirty portable-format cases and five malformed-wire pairs conform before compiler I/O changes. Fifty scoped integration and regression tests pass. The separate [Linux native gate](../docs/internals/portable-features-native-linux-acceptance.md) now qualifies complete private user lifecycles for both clients without changing these formal contracts; Windows companion storage and profile promotion remain open.

[Shared portable rendering](PluginSdk/Compiler/Portable/Properties.lean) adds PC1–PC8 for complete MCP/hook composition, one runtime, safe paths, diagnostics, enumeration and MCP compatibility with empty hooks. The [proofs](PluginSdk/Compiler/Portable/Proofs.lean), [strict wire](PluginSdk/Compiler/Portable/Wire.lean) and [27 frozen expectations](vectors/portable-features.ndjson) agree with TypeScript; 132 additional inputs conform and both decoders reject 32 malformed requests. That checkpoint checks **310/310 properties**. [Composition acceptance](../docs/internals/portable-feature-composition-acceptance.md) precedes compiler I/O integration.

[Portable hook rendering](PluginSdk/Compiler/Hooks/Portable/Properties.lean) adds PH1–PH8 for admission, native documents, paired files, path safety, enumeration, complete diagnostics, empty preservation and process semantics. The [proofs](PluginSdk/Compiler/Hooks/Portable/Proofs.lean), [strict wire](PluginSdk/Compiler/Hooks/Portable/Wire.lean) and [twenty frozen expectations](vectors/portable-hooks.ndjson) agree with TypeScript; 108 additional requests conform and both decoders reject 40 malformed requests. That checkpoint checks **302/302 properties**. [Pure acceptance](../docs/internals/portable-hooks-model-acceptance.md) supplies complete hook output for shared-runtime composition.

[Portable hook bindings](PluginSdk/Compiler/Hooks/Binding/Properties.lean) add HB1–HB4 for the native invocation shape and canonical descriptor paths. The [proofs](PluginSdk/Compiler/Hooks/Binding/Proofs.lean), strict wire and [fourteen native-fixture vectors](vectors/hook-binding.ndjson) agree with TypeScript; 54 additional requests conform and both decoders reject 31 malformed requests. That checkpoint checks **294/294 properties**. [Pure binding acceptance](../docs/internals/portable-hook-binding-model-acceptance.md) supplies the renderer's native invocation.

[Build format selection](PluginSdk/Compiler/BuildFormat/Properties.lean) adds BF1–BF4 for agents, hooks, bundled stdio and basic content. The [proofs](PluginSdk/Compiler/BuildFormat/Proofs.lean), strict wire and [sixteen finite inputs](vectors/build-format.ndjson) agree with TypeScript; both decoders reject 33 malformed requests. That checkpoint checks **290/290 properties**. [Automatic build acceptance](../docs/internals/portable-defaults-acceptance.md) records integration after the pure gate.

[Process-directory admission](PluginSdk/Installer/ProcessDirectory/Properties.lean) adds PD1–PD4 for static directory projection, exact capacity decisions and agreement with the existing portable runtime. The [proofs](PluginSdk/Installer/ProcessDirectory/Proofs.lean), strict wire, [25 authored cases](vectors/process-directory.ndjson), 288 generated comparisons and 16 malformed-wire pairs pass before Installer integration. Its checkpoint checks **286/286 properties**. [Integration and native gates](../docs/internals/process-directory-acceptance.md) pass separately.

[Launcher runtime requirements](PluginSdk/Installer/LauncherRuntime/Properties.lean) add NR1–NR5 for exact platform checks and Node admission. The [certificates](PluginSdk/Installer/LauncherRuntime/Proofs.lean), [strict wire](PluginSdk/Installer/LauncherRuntime/Wire.lean), [26 authored vectors](vectors/launcher-runtime.ndjson) and [TypeScript conformance](../test/launcher-runtime.test.ts) pass before installer I/O changes. That checkpoint checks **282/282 properties**. [Runtime admission](../docs/internals/launcher-runtime-admission.md) records the separate I/O boundary.

The [portable runtime properties](PluginSdk/Compiler/Process/Portable/Runtime/Properties.lean) and [proofs](PluginSdk/Compiler/Process/Portable/Runtime/Proofs.lean) cover paired captures and instruction evaluation. The [strict wire](PluginSdk/Compiler/Process/Portable/Runtime/Wire.lean), [21 authored vectors](vectors/process-runtime.ndjson) and [TypeScript conformance](../test/process-runtime.test.ts) precede the executable boundary. Native qualification remains separate in the [runtime design](../docs/internals/portable-process-runtime-design.md).

This is pluginsdk's formal model, following the [LDD loop](../docs/internals/ldd.md) used by lcode. Lifecycle proves P1 through P14, rendering B1 through B8, and bundle checks V1 through V4. Asset assembly adds A1 through A7, repair review R1 through R8, invocation authorization U1 through U8, catalog admission and selection C1 through C6, package binding E1 through E4, tool-contract binding T1 through T7, process normalization M1 through M5, literal quoting Q1, Windows argument quoting Q2, stream and request lifetime Q3-Q10, launcher behavior L1 through L7, MCP composition K1 through K7 and command hooks H1 through H8. Distribution adds selection S1-S4, planning D1-D4 and execution X1-X9. Native compatibility adds N1-N8. Agent rendering adds G1-G8 and companion review adds F1-F8. Publication W1-W6, project config J1-J6, execution evidence I1-I4, worker admission O1-O4 and writer protocol Z1-Z22, opened-file read admission V1-V10, Windows paths WP1-WP20, rooted-tree admission TR1-TR13, executable intent EI1-EI20 and project-file policy PF1-PF7 account for the first 256 obligations. Installation locks IL1–IL4, portable launchers PL1–PL7, portable MCP PM1–PM6 and runtime evaluation PR1–PR4 bring that checkpoint to 277. Launcher runtime admission NR1–NR5 brings that checkpoint to 282. Process-directory admission PD1–PD4 brings that checkpoint to 286. Build selection BF1–BF4 brings that checkpoint to 290. Hook bindings HB1–HB4 bring that checkpoint to 294; portable hook rendering PH1–PH8 brings that checkpoint to 302; shared composition PC1–PC8 brings that checkpoint to 310. Companion-file policy RF1–RF8 brings the current audit to 318. Feature checks run separately; the combined gate remains deferred.

[Project-file policy](PluginSdk/Installer/ProjectFile/Properties.lean) adds PF1-PF7 for platform-specific metadata admission and exact reviewed-basis agreement. The [proof certificates](PluginSdk/Installer/ProjectFile/Proofs.lean) pass the scoped exact-type and axiom audit. Fifty-three [authored vectors](vectors/project-files.ndjson), 4,108 generated TypeScript comparisons and 28 malformed-wire pairs pass before the platform file backends change. The [native acceptance](../docs/internals/project-file-acceptance.md) records the separate Linux and Windows I/O checks.

[Opened-file admission](PluginSdk/FileRead/Properties.lean) adds V1-V10 for path grammar, proper containment, root binding and agreement of read observations. All ten certificates pass the scoped type and axiom audit. The [wire checker](scripts/check_file_reads.py) passes 64 authored vectors, rejects 584 malformed requests, accepts seven exact schema-number forms and rejects two rounded non-one values. Four [TypeScript tests](../test/file-read.test.ts) add 2,767 generated comparisons. Five vectors reuse exact native snapshots; production readers are unchanged. [Native prerequisites](../docs/internals/file-read-acceptance.md#remaining-native-work) remain open.

[Windows paths](PluginSdk/WindowsPath/Properties.lean) have twenty registered properties. WP1-WP9 cover syntax/device refusal, UTF-16 capacities, monotonic acceptance and colon exclusion. WP10-WP14 add exact complete-name capacity, encoded-name fit, greatest fitting budgets, increasing limits and view-order independence. The [lexical wire checker](scripts/check_windows_paths.py) passes 107 authored requests and rejects 81 malformed requests. The [capacity wire checker](scripts/check_windows_root_capacities.py) passes 32 authored requests and rejects 76 malformed requests; both check exact numeric forms. Six [TypeScript tests](../test/windows-path.test.ts) add 6,174 lexical and 1,320 capacity comparisons. The [pure capacity acceptance](../docs/internals/windows-path-capacity-acceptance.md) separates these guarantees from remaining native integration. The [native filename component](../docs/internals/windows-filename-acceptance.md) adds eleven groups and 190 recorded-path comparisons. Complete source-link coverage and materialization remain open.

[Rooted-tree admission](PluginSdk/TreeRead/Properties.lean) adds TR1-TR13 for exact component binding, source/payload reparse policy, ancestor cycles, stable directory observations and complete visits. The [wire checker](scripts/check_tree_reads.py) passes 93 authored requests and rejects 2,062 malformed requests. Four [TypeScript tests](../test/tree-read.test.ts) add 7,944 generated comparisons. The [acceptance record](../docs/internals/tree-read-acceptance.md) separates pure admission from the remaining native traversal work.

[Executable intent](PluginSdk/ExecutableIntent/Properties.lean) adds EI1-EI20 for stable native permissions, exact source declarations, payload-bound retained intent and staged permission adjustment. All twenty certificates pass the scoped exact-type and axiom audit. The [source/payload checker](scripts/check_executable_intents.py) passes 57 authored requests and rejects 515 malformed requests. The [staging checker](scripts/check_staging_permissions.py) adds 18 authored requests and rejects 78 malformed requests. Six [TypeScript tests](../test/executable-intent.test.ts) cover 4,307 oracle comparisons, including every permission value and both staging flags. The [integration record](../docs/internals/executable-intent-integration-acceptance.md) covers the public authoring field, Linux capture, payload comparison and permission-preserving staging. Windows integration remains open.

[Installer/Execution](PluginSdk/Installer/Execution/Properties.lean) states I1-I4 for exact quiescence, activity, unknown evidence and rejection of job accounting as completion evidence. A [native counterexample](../docs/internals/windows-recovery-design.md#counterexample) required changing empty/absent Windows jobs to unknown. Its [certificates](PluginSdk/Installer/Execution/Proofs.lean) pass the scoped type and axiom check. The [wire checker](scripts/check_execution.py) passes 22 authored cases, 842 malformed requests and seven numeric cases. The [TypeScript suite](../test/execution.test.ts) adds 308 generated comparisons. The replacement [writer protocol](PluginSdk/Installer/Writers/Properties.lean) has its own LDD cycle; native implementation and recovery acceptance remain open.

[Installer/Writers](PluginSdk/Installer/Writers/Properties.lean) states Z1-Z10 for exact retention before continuation, ledger preservation, stopping on retention failure, terminal states and completion evidence for every authorized writer. Z11-Z16 add lookup binding, exact activity/termination/unknown classification and changed process generations. The Z1-Z17 [proof certificates](PluginSdk/Installer/Writers/Proofs.lean) pass the scoped exact-type and axiom audit. The [Effect schemas](../contracts/Writers.ts) distinguish process identities, gate states, signals, actions and observations. The [pure TypeScript model](../src/installer/windows/process/model.ts) conforms on 72 independent vectors, 7,240 generated protocol requests and 279 generated observation requests in [five protocol tests](../test/writers.test.ts) and [three observation tests](../test/writer-observation.test.ts). The [wire checker](scripts/check_writers.py) rejects 8,940 malformed requests and accepts eight JavaScript numeric equivalents. The [Windows recovery design](../docs/internals/windows-writer-recovery-design.md) states the native obligations that these pure properties assume.

Z17 proves that every resumed identity remains in the ledger after any finite signal trace. Twelve independent [trace vectors](vectors/writer-traces.ndjson) pass 40 existing step-oracle requests; two [TypeScript trace tests](../test/writer-traces.test.ts) add 1,755 generated traces and 5,016 step comparisons. From the repository root, `python3 spec/scripts/check_writers.py --traces-only` checks those authored traces without repeating the unchanged malformed-wire corpus. The [Windows storage checks](../docs/internals/windows-transaction-storage-acceptance.md) pass after that pure conformance.

Z18-Z22 classify prior lock owners, excluding only the exact current process identity. All 22 writer certificates pass the focused type and axiom audit. Nineteen independent [owner vectors](vectors/writer-prior-owners.ndjson), 14,135 generated TypeScript comparisons and 3,186 malformed-wire requests pass before the Windows lock I/O changes. Use `python3 spec/scripts/check_writers.py --prior-owners-only` from the repository root for the focused wire check.

[Windows argument quoting](PluginSdk/Installer/WindowsCommand/Quoting.lean) adds Q2: an independent reader recovers every encoded quoted word. Its exact-type and standard-axiom audit passes. Twenty independent [vectors](vectors/windows-quoting.ndjson), 4,811 generated TypeScript comparisons, 22 malformed-wire requests and three numeric-schema equivalents pass before native launch changes. Use `python3 spec/scripts/check_windows_quoting.py` from the repository root for the focused wire check. The [command design](../docs/internals/windows-command-design.md) separates this codec from process and pipe qualification.

[Windows streams and request lifetime](PluginSdk/Installer/WindowsCommand/Streams.lean) add Q3-Q10. Eight certificates pass the exact-type and standard-axiom audit. Thirty independent [vectors](vectors/windows-streams.ndjson), 110 rejected malformed requests and 13 accepted numeric forms pass the [wire checker](scripts/check_windows_streams.py). Four [TypeScript tests](../test/windows-streams.test.ts) compare 67,012 generated steps over 15,576 traces with Lean, check budget conservation and retain native request ownership until observed completion. Pure conformance passed before product I/O changes. Native buffer lifetime, scheduling and process cleanup remain separate obligations.

[Installer/Worker](PluginSdk/Installer/Worker/Properties.lean) states O1-O4 for exact request admission, exact stopping, accepted-work retention and prevention of another start. The [certificates](PluginSdk/Installer/Worker/Proofs.lean) and [TypeScript suite](../test/worker.test.ts) pass all nine state/signal combinations. The [wire checker](scripts/check_worker.py) rejects 94 malformed requests and accepts three numeric-schema equivalents. [Worker acceptance](../docs/internals/worker-acceptance.md) separately checks IPC and process-owned locks.

The existing [TypeScript conformance suite](../test/conformance.test.ts) compares 4,210 requests with the oracle. The separate repair suite compares 18 vectors and 40 generated requests.

[Compiler/Agents](PluginSdk/Compiler/Agents/Properties.lean) and [Installer/Companions](PluginSdk/Installer/Companions/Properties.lean) contain the agent contracts, total models, proof certificates and strict wires. The [wire checker](scripts/check_agents.py) checks 52 authored agent/companion vectors, 55 permutations, 505 malformed requests, six numeric-schema cases and 50 dependent lifecycle vectors. The pure TypeScript ports conform before I/O integration; [native acceptance](../docs/internals/agents-design.md) remains a separate obligation.

The [authorization suite](../test/authorization.test.ts) compares 49 authored vectors, 120 generated combinations and a three-call revocation sequence. Its model receives trusted service evidence; it does not verify tokens or enforce a backend call.

The [catalog suite](../test/catalog.test.ts) compares 53 independent vectors and 192 generated requests, then checks release promotion, enumeration order and schema rejection. C1-C6 prove immutable admission and exact artifact selection through the pure model. E1-E4 prove complete package correspondence and exact diagnostics. Their wire checks 23 independent vectors, 23 permutations and 31 malformed inputs; the [TypeScript suite](../test/artifacts.test.ts) adds 192 generated requests. [Local catalog acceptance](../docs/internals/artifact-design.md) connects these models to retained plugin-package bytes. [Pinned HTTP import](../docs/internals/artifact-import-design.md) verifies an approved archive before using the same transition. Network and storage truth remain I/O obligations; source authenticity and workspace adapters remain open.

The [tool-contract suite](../test/tool-contract.test.ts) compares 27 independently authored vectors, 42 generated normalization inputs and eight exact binding combinations with Lean. T1-T7 certify preservation and canonical ordering of complete descriptors, exact duplicate diagnostics and organization/service/digest binding. The strict wire also checks 1,467 permutations and rejects 70 malformed requests. [Reviewed MCP contracts](../docs/internals/mcp-contract-design.md) retain the full JSON committed by these descriptors in the same local release catalog.

Distribution has 85 independently authored vectors, 207 permutation checks and 1,158 malformed requests. Its three TypeScript model suites add 1,681 generated comparisons with Lean. Selection requires exactly one compatible declared format; planning preserves every destination or blocks; execution binds prior progress and preserves terminal outcomes. [Runtime and native acceptance](../docs/internals/distribution-design.md) establish separate complete-byte, storage and client obligations.

Native compatibility has 44 authored vectors, 212 permutation checks, 697 malformed requests and six numeric-schema cases. Its [TypeScript suite](../test/compatibility.test.ts) adds 1,664 generated oracle comparisons. N1-N8 prove exact profile selection and ownership reuse within uniquely registered adapter contracts. Actual profile qualification remains an I/O obligation in the [design](../docs/internals/compatibility-design.md).

The process model preserves symbolic commands, arguments, working directories and explicit environment bindings. Its wire matches 22 independent vectors and six enumeration cases, and rejects 508 malformed requests. The quoting model matches nine independent vectors, rejects 19 malformed requests and preserves 285 arguments in the actual `/bin/sh`. The launcher model has eight independent vectors, seven malformed cases, six actual shell scenarios and a conforming TypeScript serializer with 32 additional oracle cases. MCP composition adds seventeen authored vectors, seventeen enumeration cases, twelve malformed inputs, two actual cwd-root shell controls and 96 generated TypeScript oracle comparisons. SDK-built v3 packages have isolated user-scope native lifecycle evidence on both clients; see the [local MCP design](../docs/internals/local-mcp-design.md).

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
| [Compiler/Process/Types.lean](PluginSdk/Compiler/Process/Types.lean), [Properties.lean](PluginSdk/Compiler/Process/Properties.lean), [Model.lean](PluginSdk/Compiler/Process/Model.lean), [Proofs.lean](PluginSdk/Compiler/Process/Proofs.lean), [Wire.lean](PluginSdk/Compiler/Process/Wire.lean) | Process normalization, certificates for M1-M5 and strict `lower_process` wire |
| [Compiler/Process/Quoting.lean](PluginSdk/Compiler/Process/Quoting.lean), [QuoteWire.lean](PluginSdk/Compiler/Process/QuoteWire.lean) | Literal-word codec, Q1 round-trip proof and strict `quote_process_text` wire |
| [Compiler/Process/LauncherTypes.lean](PluginSdk/Compiler/Process/LauncherTypes.lean), [Launcher.lean](PluginSdk/Compiler/Process/Launcher.lean) | Script instruction interface, L1-L7 obligations, capture allocation and shell serialization |
| [Compiler/Process/LauncherProofs.lean](PluginSdk/Compiler/Process/LauncherProofs.lean), [LauncherTransferProofs.lean](PluginSdk/Compiler/Process/LauncherTransferProofs.lean), [LauncherWire.lean](PluginSdk/Compiler/Process/LauncherWire.lean) | Exact launcher certificates and strict `render_launcher` wire |
| [Launcher.ts](../contracts/Launcher.ts), [launcher.ts](../src/compiler/process/posix.ts), [launcher.test.ts](../test/launcher.test.ts) | Effect schemas, conforming serializer, authored and generated oracle comparisons |
| [Compiler/Mcp/Types.lean](PluginSdk/Compiler/Mcp/Types.lean), [Paths.lean](PluginSdk/Compiler/Mcp/Paths.lean), [Model.lean](PluginSdk/Compiler/Mcp/Model.lean), [Proofs.lean](PluginSdk/Compiler/Mcp/Proofs.lean), [Wire.lean](PluginSdk/Compiler/Mcp/Wire.lean) | Complete MCP composition, safe ordinal paths, K1-K7 certificates and strict `render_mcp` wire |
| [Compiler/Mcp/CwdLauncher.lean](PluginSdk/Compiler/Mcp/CwdLauncher.lean) | Native Codex cwd-root framing and bootstrap serialization, certified by K7 |
| [Mcp.ts](../contracts/Mcp.ts), [mcp.ts](../src/compiler/mcp/model.ts), [mcp.test.ts](../test/mcp.test.ts) | Effect schemas, conforming composition model and oracle comparisons |
| [Compiler/Hooks/Types.lean](PluginSdk/Compiler/Hooks/Types.lean), [Properties.lean](PluginSdk/Compiler/Hooks/Properties.lean), [Model.lean](PluginSdk/Compiler/Hooks/Model.lean), [Proofs.lean](PluginSdk/Compiler/Hooks/Proofs.lean), [Wire.lean](PluginSdk/Compiler/Hooks/Wire.lean) | Exact command-hook composition, H1-H8 certificates and strict `render_hooks` wire |
| [Hooks.ts](../contracts/Hooks.ts), [hooks.ts](../src/compiler/hooks/model.ts), [hooks.test.ts](../test/hooks.test.ts) | Internal Effect schemas, conforming renderer and event-specific protocol checks |
| [Assembly.ts](../contracts/Assembly.ts), [assembly.ts](../src/compiler/package/assembly.ts), [assembly.test.ts](../test/assembly.test.ts) | Effect contract, conforming TypeScript model, and oracle comparisons |
| [Repair/Types.lean](PluginSdk/Repair/Types.lean), [Properties.lean](PluginSdk/Repair/Properties.lean) | Repair-review states and obligations R1 through R8 |
| [Repair/Model.lean](PluginSdk/Repair/Model.lean), [Proofs.lean](PluginSdk/Repair/Proofs.lean), [Wire.lean](PluginSdk/Repair/Wire.lean) | Pure repair review, certificates for R1 through R8, and strict repair wires |
| [Repair.ts](../contracts/Repair.ts), [Installer.ts](../contracts/Installer.ts), [repair.ts](../src/installer/recovery/model.ts), [repair.test.ts](../test/repair.test.ts) | Effect contracts, reviewed repair basis, conforming model, and oracle comparisons |
| [Authorization/Types.lean](PluginSdk/Authorization/Types.lean), [Rules.lean](PluginSdk/Authorization/Rules.lean), [Properties.lean](PluginSdk/Authorization/Properties.lean) | Trusted facts, independent eligibility predicates and obligations U1 through U8 |
| [Authorization/Model.lean](PluginSdk/Authorization/Model.lean), [Proofs.lean](PluginSdk/Authorization/Proofs.lean), [Wire.lean](PluginSdk/Authorization/Wire.lean) | Pure authorization, certificates for U1 through U8 and strict `authorize` wire |
| [Authorization.ts](../contracts/Authorization.ts), [authorization.ts](../src/authorization.ts), [authorization.test.ts](../test/authorization.test.ts) | Effect schemas, conforming model and authorization checks |
| [Catalog/Types.lean](PluginSdk/Catalog/Types.lean), [Rules.lean](PluginSdk/Catalog/Rules.lean), [Properties.lean](PluginSdk/Catalog/Properties.lean) | Release ledger, exact artifact correspondence and obligations C1 through C6 |
| [Catalog/Model.lean](PluginSdk/Catalog/Model.lean), [Proofs.lean](PluginSdk/Catalog/Proofs.lean), [Wire.lean](PluginSdk/Catalog/Wire.lean) | Immutable admission, resolution, proof certificates and strict catalog wire |
| [Catalog.ts](../contracts/Catalog.ts), [catalog.ts](../src/catalog/model.ts), [catalog.test.ts](../test/catalog.test.ts) | Effect schemas, conforming catalog model and independent oracle checks |
| [Catalog/Artifacts/Types.lean](PluginSdk/Catalog/Artifacts/Types.lean), [Properties.lean](PluginSdk/Catalog/Artifacts/Properties.lean) | Complete package correspondence, required diagnostics and obligations E1 through E4 |
| [Catalog/Artifacts/Model.lean](PluginSdk/Catalog/Artifacts/Model.lean), [Proofs.lean](PluginSdk/Catalog/Artifacts/Proofs.lean), [Wire.lean](PluginSdk/Catalog/Artifacts/Wire.lean) | Exact package checks, proof certificates and strict `check_packages` wire |
| [Artifacts.ts](../contracts/Artifacts.ts), [artifacts.ts](../src/catalog/artifacts/model.ts), [artifacts.test.ts](../test/artifacts.test.ts) | Effect schemas, conforming package-binding model and independent oracle comparisons |
| [Catalog/Tools/Types.lean](PluginSdk/Catalog/Tools/Types.lean), [Properties.lean](PluginSdk/Catalog/Tools/Properties.lean) | Tool descriptors, normalization/binding interfaces and T1-T7 |
| [Catalog/Tools/Model.lean](PluginSdk/Catalog/Tools/Model.lean), [Proofs.lean](PluginSdk/Catalog/Tools/Proofs.lean), [Wire.lean](PluginSdk/Catalog/Tools/Wire.lean) | Total operations, certificates and strict tool-contract wire |
| [ToolContract.ts](../contracts/ToolContract.ts), [tool-contract.ts](../src/catalog/tools/model.ts), [tool-contract.test.ts](../test/tool-contract.test.ts) | Effect schemas, TypeScript port and independent oracle comparisons |
| [Distribution/Types.lean](PluginSdk/Distribution/Types.lean) | Semantic target, installation and complete-operation descriptor identities |
| [Distribution/Selection](PluginSdk/Distribution/Selection/Properties.lean) | Sole compatible-format selection, S1-S4 and separate model/proof modules |
| [Distribution/Planning](PluginSdk/Distribution/Planning/Properties.lean) | Complete canonical planning, D1-D4 and separate model/proof modules |
| [Distribution/Execution](PluginSdk/Distribution/Execution/Properties.lean) | Exact progress binding, retry scheduling, terminal outcomes and X1-X9 |
| [Distribution/Wire.lean](PluginSdk/Distribution/Wire.lean) | Strict six-operation distribution decoder and encoder |
| [DistributionModel.ts](../contracts/DistributionModel.ts), [distribution](../src/distribution) | Effect contracts and conforming pure TypeScript models |
| [Compatibility/Types.lean](PluginSdk/Compatibility/Types.lean), [Properties.lean](PluginSdk/Compatibility/Properties.lean) | Exact native profile selection, ownership compatibility and N1-N8 |
| [Compatibility/Model.lean](PluginSdk/Compatibility/Model.lean), [Proofs.lean](PluginSdk/Compatibility/Proofs.lean), [Wire.lean](PluginSdk/Compatibility/Wire.lean) | Total operations, eight exact certificates and strict compatibility wire |
| [Compatibility.ts](../contracts/Compatibility.ts), [compatibility.ts](../src/installer/target/compatibility.ts) | Internal Effect schemas and conforming TypeScript relations |
| [Installer/ProjectFile](PluginSdk/Installer/ProjectFile/Properties.lean) | PF1-PF7, separate types/model/proofs/wire, and the platform metadata policy |
| [WireJson.lean](PluginSdk/WireJson.lean) | Duplicate-key and unpaired-surrogate rejection, shared identity and contained-path decoders |
| [Check.lean](scripts/Check.lean) | Required proof names, exact theorem types, and the axiom audit |
| [check_replay.py](scripts/check_replay.py) | Replay examples, vector freshness, and malformed wire checks |
| [check_compiler.py](scripts/check_compiler.py) | Compiler examples, vectors, malformed wire checks, and reordered inputs |
| [check_bundle.py](scripts/check_bundle.py) | Bundle examples, vectors, malformed wire checks, and independent combination checks |
| [check_assembly.py](scripts/check_assembly.py) | Assembly vectors, malformed wire checks, 40 permutations, and 819 path combinations |
| [check_repair.py](scripts/check_repair.py) | Repair vectors and malformed wire checks |
| [check_authorization.py](scripts/check_authorization.py) | Authored authorization vectors, malformed evidence and JavaScript numeric semantics |
| [check_catalog.py](scripts/check_catalog.py) | Independent catalog vectors and malformed release, target and provenance inputs |
| [check_artifacts.py](scripts/check_artifacts.py) | Independent package-binding vectors, permutations and malformed inputs |
| [check_process.py](scripts/check_process.py), [check_process_quoting.py](scripts/check_process_quoting.py) | Authored process/quoting vectors, malformed inputs, enumeration cases and actual shell argument checks |
| [check_launcher.py](scripts/check_launcher.py) | Authored launcher vectors, malformed inputs and execution of emitted scripts |
| [check_mcp.py](scripts/check_mcp.py) | Authored MCP documents and scripts, record/header permutations and malformed inputs |
| [check_hooks.py](scripts/check_hooks.py) | Authored hook documents, record permutations, strict malformed-input checks and actual native-command shell controls |
| [check_distribution.py](scripts/check_distribution.py) | Authored selection/planning/execution vectors, permutations and malformed requests |
| [check_compatibility.py](scripts/check_compatibility.py) | Authored profile/ownership vectors, permutations, malformed requests and numeric-schema cases |

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
python3 scripts/check_catalog.py
python3 scripts/check_artifacts.py
python3 scripts/check_tool_contracts.py
python3 scripts/check_process.py
python3 scripts/check_process_quoting.py
python3 scripts/check_launcher.py
python3 scripts/check_mcp.py
python3 scripts/check_hooks.py
python3 scripts/check_distribution.py
python3 scripts/check_compatibility.py
python3 scripts/check_agents.py
bash scripts/gate.sh
```

The project pins Lean 4.34.1 and has no external Lean dependencies. `lake build` checks the models, specification, and proofs. `lake exe oracle` reads one version 1 request per line and writes one response per line.

The compiler wires handle `render`, `assemble`, `render_mcp`, `render_hooks` and `render_agents`. Companion review handles `review_companions`. The bundle wire handles `check_bundle`. The repair wire handles `repair_propose`, `repair_begin`, and `repair_settle`. Authorization handles `authorize`; catalog handles `catalog_register`, `catalog_resolve`, `check_packages`, `normalize_tools` and `check_contract_binding`. Process wires handle `lower_process`, `quote_process_text`, `quote_windows_argument` and `render_launcher`. The Windows stream wire handles `windows_stream_step` and `windows_io_step`. The lifecycle wire handles `decide`, `begin`, and `settle`. Distribution handles `select_distribution_format`, `normalize_distribution`, `open_distribution`, `schedule_distribution`, `record_distribution` and `summarize_distribution`. Compatibility handles `select_native_profile` and `native_ownership_compatible`. File reading handles `file_path`, `file_containment` and `file_read`; Windows admission handles `windows_path`, `windows_root_capacity` and `native_path_match`; project-file policy handles `admit_project_file` and `review_project_file`; rooted-tree admission handles `tree_entry` and `tree_directory`; executable intent handles `source_intent`, `payload_intent` and `stage_permissions`. Each request carries its full input. A malformed request writes a diagnostic to stderr and exits 1 without a response.

The configured gate audits the registered proof certificates and builds the oracle; the combined gate remains deferred. It checks 12 lifecycle frames, 20 render vectors plus the existing example frames, 15 bundle frames, 6 assembly frames, 18 repair frames, 49 authorization vectors, 53 catalog vectors, 23 package-binding vectors, 27 tool-contract vectors, 22 process vectors, nine shell-quoting vectors, twenty Windows-quoting vectors, thirty Windows-stream vectors, eight launcher vectors, seventeen MCP composition vectors, fourteen hook vectors, 85 distribution vectors, 44 compatibility vectors, 52 agent/companion vectors and 50 agent lifecycle vectors. Publication, project config, execution, worker and writer models have separate focused checkers wired into that gate.

It rejects 17 malformed lifecycle, 39 malformed render, 36 malformed bundle, 38 malformed assembly, 31 malformed repair, 277 malformed authorization, 481 malformed catalog, 31 malformed package-binding, 70 malformed tool-contract, 508 malformed process, 19 malformed quoting, seven malformed launcher, twelve malformed MCP composition, 26 malformed hook, 1,158 malformed distribution, 697 malformed compatibility and 505 malformed agent/companion requests. These checks include duplicate keys, escaped duplicate keys and numeric schema versions. Authorization also checks safe integer milliseconds using JavaScript binary64 decoding.

The gate also checks 100 reordered render inputs and 1,638 bundle combinations. Assembly adds 40 permutations and 819 path combinations; package binding adds 23 permutations, tool normalization adds 1,467, distribution adds 207, compatibility adds 212 and agents/companions add 55. The gate compares these generated cases with independent expectations. The earlier 119-property audit, new sixteen-property audit, thirty dependent certificates and focused checkers passed independently; the combined gate remains deferred.

Every model has its declared `Interface` type, including `PluginSdk.Compiler.Process.model` and `PluginSdk.Compiler.Process.Quoting.model`. Each property requires a theorem with the same basename under its module's `Proofs` namespace. For example, `Lifecycle.Proofs.P1_unowned_never_starts` proves `Lifecycle.P1_unowned_never_starts Lifecycle.model`, without additional assumptions or parameters.

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

Generated JSON is interpreted as objects, rather than serialized bytes. RFC 8785 encoding, URL normalization, filesystem containment, process outcomes, and durable writes retain their own checks. The [LDD specification](../docs/internals/ldd.md) records these assumptions and the development order.

Bundle checking receives claimed and recomputed digests and the complete committed path sequence. V1 through V4 prove its decision policy, including rejection without repairing the artifact. They do not establish how `computed` was obtained. The [bundle contract](../docs/internals/bundle.md) requires a private byte snapshot shared by hashing, native validation, plan persistence, and staging; those operations remain implementation obligations.

Authorization compares semantic identities and evidence supplied by the service. Its wire checks nonempty names, contract digest syntax and safe integer timestamps; the model's time domain is `Nat`. U1-U8 prove the decision over those facts, including expiry, age bounds and current-grant revocation. They do not establish token verification, audience binding, membership authority, contract hashing, record permissions, clock accuracy or enforcement. Those require qualified I/O as described in the [authorization design](../docs/internals/authorization-design.md).
