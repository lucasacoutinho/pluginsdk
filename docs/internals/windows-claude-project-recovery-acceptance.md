# Windows Claude project recovery acceptance

Claude Code 2.1.304 on Windows x64 passed all seven candidate project interruption cases. The normal SDK lifecycle and A/B query premise were already accepted. The public Windows project profile remains disabled until the compiled CLI gate passes.

| Interruption | Recovered result | Controlled execution entries |
| --- | --- | --- |
| Before install | `not_applied` | 0 |
| After install | `installed` | 1 |
| Before replacement | `not_applied` | 0 |
| After replacement | `installed` | 1 |
| Before removal | `not_applied` | 0 |
| After removal | `removed` | 1 |
| Caller exits; install worker survives | `installed` | 1 |

Every case checked both home and project leases at the cut, after caller termination, and after worker completion. Both stayed held through caller exit and became available after the worker completed. These 42 lease observations accompany exact process identities and terminal waits. The surviving worker had already settled its installed journal before the fresh recovery request.

Recovery and completed replay added no execution entries. Before-execution cases preserved the previous active payload. After-execution cases settled the exact observed installation or removal. Installed payloads matched all nine approved files. A reported its project installation enabled; B listed the same A installation disabled. Removal cleared the owned plugin and marketplace from both query contexts. User and B settings remained byte-exact, A's unrelated settings were preserved, and settlement/replay preserved configuration and journal state.

Independent validation covered 358 recorded steps, 36 callers, 36 transaction workers, and 86 native queries in 36 groups. The queries accounted for 516 retained process births, each with admission, termination, and handle-closure evidence. Guarded cleanup consumed all seven validation receipts, checked the final inventory, and removed 6,155 files totaling 423,612,749 bytes. No new unknown root remains; the four previously unknown roots were untouched.

The evidence is under `.audit/probes/windows-claude-project-recovery/`. Each case has an independent validation receipt and retained inputs/results. `cleanup.json` records guarded removal; `acceptance.json` seals the complete result. The private fixture composes the frozen query observer with a metadata validator checked against six positive and 48 negative vectors. An independent Python validator passed six positive and 33 negative metadata vectors plus the process-frame checks. The 155-file candidate snapshot passed the scoped compiler; Effect diagnostics reported zero errors, warnings, or messages across 149 TypeScript files. The fixture preflight performed no native operations.

No public runtime source, pure business model, Lean proof, or oracle changed in this gate. Existing lifecycle, worker, writer, and installation-lock properties remain authoritative. [The compiled CLI design](windows-claude-project-cli-design.md) describes the remaining native gate and profile promotion. macOS has no available host. Grok native tests, third-party authentication, CI, and package/release-wide checks remain deferred.
