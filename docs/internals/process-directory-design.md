# Windows process directory admission

A portable plugin can install successfully and fail when its MCP process starts. The Windows SDK lifecycle probe produced a 317-unit child working directory. Node 24.18 refused to create that process. An ordinary directory of 258 UTF-16 units started; 259 units failed. The [native premise](windows-process-directory-premise.md) records the controls, including the short-name fallback that makes extended-path experiments unsuitable as acceptance evidence.

## Progress

- [x] Ground the behavior in the public Installer and native process probes.
- [x] Compare designs and select the interface.
- [x] Proceed under the existing implementation authorization.
- [x] Prove the model, then pass authored vectors and TypeScript conformance.
- [x] Integrate the check and verify refusal before durable installation state changes.
- [x] Qualify the Windows portable lifecycle at an admitted destination.
- [x] Compare the model with native results.

## Caller first

The author still supplies one plugin definition. No new setting is required. On Windows, Installer.plan refuses a destination whose eventual process working directory exceeds the qualified bound. Its error identifies the process and required path length. Installer.apply repeats admission for a new operation before retaining the plan or writing pending state. Removal, interrupted-operation recovery and completed replay retain their existing behavior.

```ts
admitProcessDirectory({ root: loadedPackageRoot, script })
// accepted(directory) | unresolved | too_long(utf16Units)
```

The checker reads the authoritative launcher Script. Parameter zero denotes the package root. A snapshot root or file denotes the root or root plus a package path. A literal, captured value or out-of-range index cannot establish a package-relative directory and returns unresolved. Captures elsewhere in the instruction stream remain permitted.

## Designs considered

One design moves every Windows installation into a short staging root and relies on short-name aliases for deep paths. That changes location ownership and native discovery, depends on filesystem alias generation, and can report success while using a different directory spelling. The controls observed exactly that fallback. This design is rejected.

The selected design checks each prospective process directory before retaining a new plan. The compiler's existing bundle validator returns the canonical portable scripts it has already checked. The Installer owns client path layout: Claude loads the source payload; Codex loads its native cache. A single pure checker owns static directory projection and the measured bound. The engine calls one admission operation in planning and the new-operation apply branch. No runtime or authoring interface changes are needed.

This design keeps path layout out of the model, avoids a second process-data parser, and does not repeat the runtime's environment handling. One script per input lets the Installer report the relevant process without putting catalog iteration policy into the proof model.

## Proof and acceptance contract

PD1 states that accepted directories are exactly declared package-relative directories within the bound. PD2 states that unresolved means no such static declaration exists. PD3 gives the exact length for a capacity refusal. PD4 connects admission to the actual portable runtime: whenever an admitted script executes successfully, its invocation uses the admitted directory.

The ordinary Windows process-directory budget reserves two units within 260. The checker counts UTF-16 units, including surrogate pairs, and accepts at most 258. This is a capacity check, not a promise that an arbitrary directory exists or that arbitrary executable code will start. Existing file-name and filesystem checks still apply.

The LDD sequence is property, Lean proof and axiom audit, authored oracle vectors, TypeScript conformance, Installer integration, then native negative and positive controls. Linux behavior, portable runtime bytes and public profile selection stay unchanged during this admission work.

## Module ownership

`contracts/ProcessDirectory.ts` owns the schema-derived wire types. `spec/PluginSdk/Installer/ProcessDirectory/` owns the declarative properties, model, proofs and oracle. `src/installer/runtime/directory-policy.ts` implements that model. `src/installer/runtime/directories.ts` owns prospective native layout and admission errors. Bundle validation remains the sole parser and canonicality check for packaged process instructions.
