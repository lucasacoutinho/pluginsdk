# Implementation rules

Use the selected two-module design in `docs/design.md` and the Effect conventions in `docs/effect.md`. Preserve `.references`.

Use Effect `Match` with exhaustive handlers for domain variants. Do not introduce `switch` statements or catch-all handlers for a closed union. Derive types and equivalence from authoritative Effect schemas. Keep pure model functions total. Use scoped Effect layers for I/O and `Effect.fn` for traced operations.

Follow LDD: property, Lean proof, oracle or vector, conforming TypeScript, host checks. A native installation claim needs evidence from an isolated real host. Worker output requires main-thread review and acceptance.

Run `npm run check` for the full acceptance gate. `npm run lint` rejects switch statements. Native verification is a separate gate because it requires the pinned host binaries.

Delegate bounded execution only to `gpt-6-luna` with max reasoning and `fork_turns: "none"`. Main owns design, judgment, quality and acceptance. Workers must receive exact scope, writable paths, checks and a stopping condition; they never spawn agents.
