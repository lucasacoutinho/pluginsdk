# Installation lock acceptance

Project locking now follows destination scope. Claude and Codex project operations acquire the home lock and then the project lock; both descriptors pass to the transaction worker. Codex's project directory preparation is preserved. The [design](installation-locks-design.md) states the property and I/O boundaries.

## Reproduced failure

An exact extraction of the previous `lockTarget` body acquired one lease for a Claude project. A second home entered that same project while the first held its lease. Codex acquired two leases and blocked the second home. The retained before/after observations are under `.audit/probes/project-locks/`.

## Scoped checks

- Lean proves IL1–IL4. Kernel axiom inspection reports no axioms for IL1/IL2 and the standard `propext` axiom for IL3/IL4. The properties are registered with the existing proof audit.
- TypeScript matches the actual Lean executable on 120 inputs covering every host, both scopes, equal home/project strings, Unicode and Windows paths. Pure conformance passed before the I/O adapter changed.
- The real Linux file-lock regression passes for Claude and Codex. A second home cannot enter the shared project; another project and a separate user destination remain available. Scope exit releases both leases. Scratch roots are removed after the scoped operations complete.
- Eight tests pass across installation selection, lock I/O, project plans and native profiles. The scoped compiler, Effect diagnostics and lint pass.
- The existing isolated `claude_code project native lifecycle` test passes against Claude Code 2.1.304 on Linux. It exercises install, replay, replacement, drift refusal, alias identity, removal and unrelated settings preservation.

## Limits

This accepts the selection rule and the observed Linux behavior. Windows Claude project installation, cross-home native project behavior and interruption recovery still need qualification. Its candidate profile passes 2,500 compatibility comparisons and remains disabled. macOS has no available host. CI, package-consumer and release-wide checks remain deferred.
