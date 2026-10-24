# Project-scoped portable features

## Usage and outcome

An author keeps `definition.json` and runs `pluginsdk build`. A consumer supplies the existing project destination to `Installer.plan` and applies the reviewed plan. The intended result is that the selected project can use the plugin's MCP server, hooks and agents while another project sharing that client home cannot. Publication and backend authorization keep their existing owners.

```ts
installer.plan({
  destination: { type: "project", host: "claude_code", home, root },
  intent: { type: "present", bundle }
})
```

`home` is the normal client configuration directory. `root` is the physical project directory. Authors do not choose a project-specific package format or create another SDK file.

## Grounded flow and rationale

Build already produces a scope-independent portable bundle. `resolveTarget` queries the exact host/platform/version/scope/format profile and derives installation identity from the physical home and project. The engine holds home and project leases. Claude inspection reads native project state; the ordinary recipe invokes native marketplace and plugin commands with `--scope project` from the project root. Its agents remain package documents. The execution worker, retained plan and receipt govern recovery as they do for basic project packages.

Codex project installation has a different activation mechanism. `project-layout` derives an immutable revision marketplace, `project-execute` prepares its cache, and `project-document` switches one owned project-config block. That adapter currently refuses every non-basic package and every companion capture. Codex role storage admits user targets only. Extending its profile before resolving those rules would turn a declared capability into an invalid reviewed plan.

The existing project designs explain this difference: Codex mutation commands write user configuration and cache refresh can change unrelated caches. The immutable revision adapter therefore owns project activation. Claude already has native project commands. These are local design records and pinned implementation evidence; no unrecorded product or review history is inferred.

## Alternatives and synthesis decision

| Candidate | Public interface and hidden work | Decision |
| --- | --- | --- |
| Give each project another client home | Callers must manage authentication, settings inheritance and a special launch environment. Installer hides less of the user's actual project workflow. | Reject. |
| Add one shared SDK activation mechanism for both clients | Callers retain a small API, but Installer duplicates Claude's native registration and changes qualified ownership and recovery paths. | Reject. |
| Retain each existing project adapter and qualify its feature behavior separately | Existing plan/apply hides native registration, revision caches and resource ownership. Author and destination interfaces remain sufficient. | Select. |

The selected shape adds no public type, service or forwarding layer. Compiler owns bundle meaning. Installer owns physical target, activation, ownership and settlement. Profile data remains the single support declaration. This avoids split ownership, duplicate activation paths and leaking client storage into the author interface.

## Formal and native boundary

N1–N8 already quantify profile scope and exact format membership. The current 318-proof checkpoint and TypeScript/oracle conformance remain unchanged. Before native experimentation, compare the private Claude project profile against the Lean selector for all registered tuples and formats, their enumeration reversal, and explicit neighboring unknown/older/platform/client refusals. This is new profile input to an existing proved function, not a new theorem about native loading.

The first candidate changes only the private Linux Claude 2.1.304 project row to admit portable v2. Production sources and profiles stay frozen. It uses exactly the already-qualified v2 bundle bytes and runtime. No Codex profile changes.

Run the real SDK install/update/replay/remove lifecycle in a fresh user/network/PID/mount namespace with two separate Git projects and one private home. Preserve user and project B settings byte for byte. Preserve all unrelated project A settings. Record a ready plan for B with a distinct target key but never apply it. In A verify both generations' complete payload, MCP calls, startup context, prompt blocking and native agent dispatch/prompt/model/tool policy. In B require fresh inference without the plugin's role, tools or context, require a marked prompt to reach inference, and require no fixture process events. Repeat after replacement and removal. Replays must add no native mutation.

The retained namespace owner supplies bounded output, parent-death binding, held child completion and final process inventories. Forced termination is failed evidence. A complete normal experiment advances this gate. Linux interruption/recovery remains required before promoting this candidate; Windows needs its own normal and recovery qualification.

## Tradeoffs and next steps

We accept client-specific internal activation in exchange for preserving each client's settings and qualified ownership contract. We accept separate native gates because user-scope success does not establish project isolation.

Codex project roles require a later design for project-local companion placement, collision detection and revision activation. Windows process admission must also receive the actual immutable revision-cache root; its current user-cache projection differs from project execution. The [source report](../../.audit/probes/portable-features-project-design/project-feature-facts.md) identifies these constraints. Any change to their pure contracts must first revise properties, prove them and finish oracle conformance before native I/O edits. Project support remains disabled until those obligations pass.

- [x] Ground: trace current target, inspection, recipe, project activation and role storage.
- [x] Sketch: compare separate homes, shared activation and existing adapters.
- [x] Agree: continue under the existing milestone authorization.
- [x] Implement: private profile conformance, then Claude Linux normal lifecycle and project isolation.
- [x] Scrap review: observed Claude project behavior supports the selected adapter. Codex's separate constraints remain unresolved.

macOS has no available host. Native Grok tests, third-party authentication, CI, package-consumer/release checks and publication remain deferred.
