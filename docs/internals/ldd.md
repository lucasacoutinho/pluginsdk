# Lean-driven design

Lean Driven Development keeps behavior explicit before it reaches I/O. The specification proves properties of pure models. It does not prove that TypeScript refines those models; that relation remains unproved.

## Required order

1. State the property in the owning `Properties.lean` module. Include positive behavior as well as refusal conditions so a model that rejects every input cannot satisfy the contract.
2. Define a total pure model with an explicit `Interface`. Prove each property against that model without weakening the property or adding assumptions.
3. Run the exact-type and transitive-axiom audit for the affected obligations. [`spec/scripts/Check.lean`](../../spec/scripts/Check.lean) is the full registry; a scoped checker must retain the same checks for its selected properties. Require each model's declared interface, each theorem's exact property type, and no transitive `sorryAx` or custom axioms. Only `propext`, `Classical.choice`, and `Quot.sound` are allowed.
4. Add independent wire examples and vectors. The oracle must decode the current schema strictly and return the specified result; do not derive expected values from the TypeScript implementation.
5. Port the pure model to TypeScript using the authoritative Effect schemas. Compare decoded model results with oracle results before editing the I/O implementation. This is conformance evidence, not a formal refinement proof.
6. Check I/O behavior through scoped interfaces, then qualify host-dependent behavior separately on isolated native clients. Record those results separately from Lean proofs and pure conformance.

## Current compiler and client contracts

`Compiler.Format` is the package client: `claude_code` or `codex`. There are no feature-selected generations. Claude output uses `.claude-plugin/plugin.json` and Codex output uses `.codex-plugin/plugin.json`; both use `.mcp.json`. Remote MCP uses Claude's `type`/`url`/`headers` fields or Codex's `url`/`http_headers` fields. These shapes are specified by [Compiler/Format.lean](../../spec/PluginSdk/Compiler/Format.lean).

The compiler contract is split by responsibility:

- [Compiler rendering](../../spec/PluginSdk/Compiler/Properties.lean) states B1–B8 for deterministic native output, captured content, path safety, diagnostics, and header meaning.
- [Portable MCP](../../spec/PluginSdk/Compiler/Mcp/Portable/Properties.lean) states PM1–PM6 for admission, native documents, generated files, paths, enumeration, and diagnostics.
- [Portable hooks](../../spec/PluginSdk/Compiler/Hooks/Portable/Properties.lean) states PH1–PH8 for hook admission, documents, files, path safety, enumeration, diagnostics, empty preservation, and process preservation.
- [Shared portable composition](../../spec/PluginSdk/Compiler/Portable/Properties.lean) states PC1–PC8 for combined admission, document preservation, files, runtime, paths, enumeration, diagnostics, and empty-hook behavior.
- [Logical client mapping](../../spec/PluginSdk/Compatibility/ClientPackages/Properties.lean) keeps requested local clients mapped to unique current package clients and conserves Cursor's compatible package mapping.

Native profile queries carry a `requirements` array. Profiles carry one package `format` and a `capabilities` array. Compatibility N1–N6 and N8 cover unique selection, exact blocking, ordering independence, and ownership; N9 preserves every requested capability; N10 proves that a selected profile for stronger requirements remains eligible for weaker requirements. There is no version-based profile admission or ownership theorem. See [Compatibility/Properties.lean](../../spec/PluginSdk/Compatibility/Properties.lean) and [Compatibility/Types.lean](../../spec/PluginSdk/Compatibility/Types.lean).

Launcher runtime requirements retain NR1 and NR3–NR5: absent launchers require no tools, portable launchers have exact platform requirements, unsupported combinations reject, and Node admission checks the required runtime behavior. NR2's `posix` mode is retired. See [LauncherRuntime/Properties.lean](../../spec/PluginSdk/Installer/LauncherRuntime/Properties.lean).

BF1–BF4, K1–K7 `render_mcp`, H1–H8 `render_hooks`, NR2, and compatibility N7 are retired. The current proof registry and the active properties they contain are linked from the [Lean specification index](../../spec/README.md).

## Model and wire boundaries

The Lean package is under [`spec/PluginSdk`](../../spec/PluginSdk); [`spec/Oracle.lean`](../../spec/Oracle.lean) exposes strict JSON request/response operations. Independent examples are kept in [`spec/vectors`](../../spec/vectors). A vector records an expectation independently of the implementation being checked.

The oracle checks policy over supplied structured values. It does not compute real file digests, inspect a filesystem, launch a client, observe process completion, or perform durable writes. Those values and effects enter through checked interfaces. Effect schemas define the TypeScript wire boundary; strict decoding and canonicalization checks remain explicit at that boundary.

## Current acceptance scope

The accepted prelaunch consolidation evidence covers 58 focused obligations: 54 core and 4 launcher properties. The receipt is `pure-main-checked.json`; this is not a full audit of every obligation in `Check.lean`. The repository-wide Lean gate, CI, package-consumer and release gates remain deferred. Native caller qualification remains open in the [launch plan](launch-plan.md). Do not describe the scoped receipt as full repository acceptance.

Every I/O or native claim needs its own evidence. In particular, compiler vectors do not establish host filesystem behavior, successful process launches, real-client discovery, or installation lifecycle behavior. Pure TypeScript conformance establishes agreement on checked inputs only; it does not close the formal refinement gap.
