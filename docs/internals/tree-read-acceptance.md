# Rooted-tree admission acceptance

The pure entry and directory contracts are qualified. The [Effect schemas](../../contracts/TreeRead.ts), [Lean model](../../spec/PluginSdk/TreeRead/Model.lean) and [TypeScript port](../../src/internal/files/tree.ts) agree on the selected [rooted-tree design](tree-read-design.md). No production filesystem operation changes in this phase.

Entry admission binds the active branch to its retained root and each requested component to its exact no-follow endpoint. Ordinary entries retain kind, full identity and canonical path. Source links may resolve inside the root through the two admitted link tags; payload mode refuses reparse points. Active ancestor identities prevent directory cycles while allowing reuse in separate sibling branches.

Directory admission requires stable root/directory bindings and timestamps, complete enumerations before and after traversal, unique names, and exactly one completed visit per member. Names compare exactly, including case and Unicode representation. Enumeration and visit order do not affect any decision.

## Evidence

| Check | Result |
| --- | --- |
| TR1-TR13 | All thirteen certificates have their exact registered property type. Their axiom audit permits only `propext`, `Classical.choice` and `Quot.sound`. |
| Independent cases | 93 distinct requests cover all thirteen properties and all seventeen entry/directory decisions. |
| Generated conformance | 4,704 entry requests cover policies, active branches, physical bindings and target kinds. Another 3,240 requests cover directory names, failures, changed metadata, duplicates, missing visits and ordering. TypeScript agrees with Lean and preserves every input. |
| Strict wire | 2,062 malformed requests are rejected. Nested missing/excess fields, wrong JSON kinds, invalid brands, component syntax, duplicate keys and malformed Unicode are covered. |
| Exact numbers | Thirteen integral schema/tag forms pass, including negative zero. Four precise fractional values are rejected even when a floating conversion would round them to an integer. |
| Scoped TypeScript checks | Four tests, typechecking, strict Effect diagnostics and lint pass. |
| Shared decoder regressions | The file-read wire still passes 64 vectors, 584 malformed requests and its numeric cases. The Windows path wire still passes 107 vectors, 81 malformed requests and its exact-capacity cases. |

TR3 directly proves refusal for payload reparse points and unknown tags. TR6 directly names repeated ancestor identities. TR11 proves that both enumerations and the completed visits contain the same members exactly once. TR13 proves equality of the complete decision after independently reordering all three lists, including refusal cases.

The strict wire reuses the existing file-read decoders. An extracted exact unsigned-32-bit reader serves both reparse tags and Windows capacities. The extraction changes neither accepted numeric values nor the path classifier. Main review corrected the authored tag labels and a GUID-case fixture that accidentally repeated the root identity, then added explicit precedence and Unicode cases.

From `spec/`, build the focused modules and oracle:

```sh
lake build PluginSdk.TreeRead.Proofs PluginSdk.TreeRead.Wire oracle
```

From the repository root, check the wire and port:

```sh
python3 spec/scripts/check_tree_reads.py
npx vitest run test/tree-read.test.ts
```

All thirteen properties are registered in the deferred combined gate, bringing its obligation count to 218. Source hashes, the exact-type/axiom audit, authored cases, structured test results and scoped checks are retained under `.audit/probes/tree-read-contract/`.

## Native and integration limits

The model consumes supplied observations. A native owner must still establish enumeration completion, current no-follow and followed facts, branch lifetimes, successful child visits and resource cleanup. Agreement before and after an operation does not establish continuous immutability or an atomic snapshot.

The [native Windows component](windows-tree-read-acceptance.md) now qualifies these observations for ordinary files and directory junctions through retained handles. Its 310 native frames agree with TypeScript and Lean. Windows symbolic-link traversal remains unqualified because fixture creation is denied with error 1314.

Production capture, payload reading, staging and profiles are unchanged. Full source-link coverage, complete-tree materialization, executable intent, complete-path budgets and reader integration remain open. Windows installation profiles stay disabled. macOS qualification is deferred because no host is available. CI, package-consumer and release-wide checks remain deferred by the user.
