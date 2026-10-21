# Organization plugin management

## Outcome and scope

A company has several internal applications whose plugins and MCP servers live in separate repositories. One team needs to curate releases, distribute them across its agent clients, and govern access. Some users can read application data; others can invoke administrative tools. An approved integration should retain those permissions when the user changes clients.

The target clients are Claude Code, Claude Desktop and web, ChatGPT Business/Enterprise, Cursor IDE and Grok Bot. Codex remains an existing target. Each product and execution surface requires its own qualification; sharing a package format does not establish shared installation or authorization behavior.

For this phase, PluginSDK manages the catalog, approved releases, distribution and access-policy definitions. Plugin and MCP source can remain in existing repositories. The company supplies deployment infrastructure and its identity provider. Plugin/MCP code management is a possible future extension: the current design must admit it without requiring repository migration, server provisioning or a new hosting platform.

This is a design extension. Organization schemas, policy proofs and workspace adapters are not implemented. The current executable interfaces remain `Compiler.build` and `Installer.plan/apply`.

## Manager workflow

1. Register an existing plugin release or MCP endpoint with a stable catalog identity, provenance and responsible team.
2. Select an approved release for an audience and the required client surfaces. Review compatibility and the proposed changes together.
3. Apply supported distribution changes through the clients' organization mechanisms. Track each destination's observed result separately.
4. Users connect with identities recognized by the existing MCP service. That service checks tool permissions on every call.
5. Promote another release or withdraw access centrally. Record distribution, user authentication and backend permission changes as separate outcomes.

A plugin installation and an MCP endpoint registration are different resources. A company can register an existing MCP service without inventing a skills package. A plugin can reference several services, each with its own identity and permissions.

## Candidate interfaces and synthesis

| Candidate | Interface and maintenance cost | Decision |
| --- | --- | --- |
| Central source workspace plus infrastructure graph | Managers import every plugin's code and describe hosting resources before distributing it. Source ownership, deployment and client installation become coupled. | Defer source management and provisioning. These are future requirements. |
| Native configuration generator | Managers render client files, register endpoints, refresh tool snapshots, publish releases and reconcile failures themselves. Native ordering and policy differences leak into every caller. | Reject the exposed pipeline. |
| Catalog of pinned releases with reviewed distribution | Managers name releases, audiences and destinations. The owning module resolves native representations, checks qualification and retains per-destination outcomes. Existing repositories and infrastructure remain usable. | Select. |

The selected interface keeps the compiler's package knowledge and the installer's local ownership protocol intact. Organization distribution adds knowledge about tenant identity, marketplace ownership, audiences and independent host outcomes. It must earn a separate deep module when those contracts are proved; it must not become a caller-written loop over local `Installer` destinations.

An organization identifier cannot be represented by a local `home` directory. A workspace registration receipt cannot stand for a user's completed authentication or a server's authorization decision. Preserve these distinctions before extending `Destination`.

## Data to model next

| Concept | Required meaning |
| --- | --- |
| Catalog entry | Stable organization-qualified identity, responsible team and a plugin or MCP release reference. |
| Plugin release | Immutable release identity and verified package digests for its supported rendering formats. A human-readable version alone does not establish identity. |
| Source provenance | Repository, exact commit and contained path, or an artifact location and digest. Provenance describes origin; it grants no ability to execute or modify that source. |
| MCP contract release | Stable service identity and a digest of the reviewed tool contract. Deployment endpoint and observed contract revision are separate: an HTTPS URL alone does not pin server behavior. |
| Distribution intent | Release, audience and explicit destination surfaces, with the requested native installation behavior. |
| Tool permission | Organization, service and exact tool identity. New tools receive no implicit permission. |
| Access policy | Versioned role-to-permission grants and trusted group-to-role bindings, independent of a client manifest. |
| Enforcement evidence | Which existing service enforces a policy, the observed policy revision and the identity mechanism qualified for that client. A declaration of RBAC support is insufficient. |
| Distribution result | Per-destination observed revision and outcome. Published, installed, authentication-required, blocked, uncertain and unavailable are distinct states. |

Authoring values remain plain data derived from authoritative Effect schemas. Internal values use semantic brands and exhaustive `Match`. Remote source resolution, native configuration and protocol objects stay inside the modules that own that knowledge. Design schemas and Lean models before adding network or workspace writes.

Catalog connection settings contain public authentication metadata and credential references. User tokens and deployment credentials stay in the client's credential store or the company's existing secret infrastructure; they do not become package contents or policy documents.

Release origin is the extension point for future code management. A later managed workspace can produce the same release artifacts and provenance. Catalog identities, access policies and distribution receipts must survive that change. Avoid an empty source-provider framework until a second implemented acquisition path needs one.

## Authorization ownership

There are three separate permissions: managing the catalog, receiving an integration in a client, and invoking a backend tool. Publishing a plugin grants none of the backend permissions by itself.

The existing identity system establishes a principal and organization. Trusted membership data supplies roles. The MCP service authorizes each requested tool and applies application permissions to the requested records. A signed-in client account, a claimed email, model arguments or an arbitrary header must not supply an unverified role.

For a protected tool, effective access requires the current organization policy, sufficient token scopes and application permission together. Native client controls can further restrict access. They cannot widen backend permission. Missing identity, unknown policy or insufficient permission rejects the call. Client-filtered tool discovery improves usability; direct invocation still goes through the same authorization check.

Use per-user authentication where individual access differs. A shared credential supplies only its own authority unless an independently verified delegation mechanism preserves the acting principal. MCP resource servers validate tokens for their own audience; upstream credentials require their own authorization flow. These requirements follow the [MCP authorization contract](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

PluginSDK can describe and validate a policy deployment into an existing enforcement integration. It cannot claim that distributing a manifest enforces that policy. Until such an integration is qualified, a requested RBAC guarantee remains blocked. The company continues to run its services and identity infrastructure.

Permission revocation needs a stated freshness bound. Version policy and trusted membership inputs; recheck authorization for every invocation. Partition discovery caches by authorization context. Revocation acceptance must exercise a previously discovered tool directly after access changes. Removing a plugin is a separate distribution action.

## Client contracts to qualify

Research checked on 2026-10-20. These are documented product capabilities, not completed PluginSDK adapters.

| Client | Documented integration path | Qualification needed |
| --- | --- | --- |
| Claude Code, Desktop and web | Organization marketplaces can distribute plugins across these surfaces. Enterprise group installation preferences exist. | Supported contents on each surface, organization registration, group mapping, observed version and withdrawal behavior. [Organization plugin documentation](https://support.claude.com/en/articles/13837433-manage-plugins-for-your-organization). |
| Claude organization management | The beta organization interface documents plugin versions and installation settings. | Account authority, exact upload/read/update semantics and recovery. Pinning a served version has documented persistent consequences, so generic rollback cannot be assumed. [Organization reference](https://platform.claude.com/docs/en/api/beta/organization). |
| ChatGPT Business/Enterprise | Plugin packages can bundle skills and MCP dependencies. Workspace publishing and registered MCP mappings are separate from local marketplace installation. | Workspace identity, surface support and private publishing/update contracts. [Plugin packaging](https://developers.openai.com/plugins/build/plugins). |
| ChatGPT custom MCP connections | Business and Enterprise support workspace-managed remote MCP connections; Enterprise adds access controls. Tool changes require workspace review of the approved snapshot. | Registration identity, authentication, reviewed tool-contract refresh and observed publication. Private connectivity uses the company's supported network path. [Custom MCP connections](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt). |
| Cursor IDE | Team marketplaces support Agent Plugins and Cursor packages. Marketplace access and plugin installation modes are separate from MCP server trust controls. | Package loading, team registration, audience mapping and per-user connection outcomes. Adding an allowlist entry alone does not distribute a server. [Plugins](https://cursor.com/docs/plugins), [integration management](https://cursor.com/docs/enterprise/model-and-integration-management). |
| Grok Bot | Connected apps inherit the team's Cursor connector policy. Shared Team Bots can operate with a different credential context from a member's own chat. | Actual acting-principal semantics, connector registration, tool calls and withdrawal in each selected Bot context. A computer setup script is insufficient lifecycle evidence. [Teams and Enterprise](https://cursor.com/docs/grok-bot/teams). |

The identity provider remains unspecified. Its issuer, tenant mapping, membership freshness and client registration behavior are integration inputs, rather than a reason to invent a PluginSDK account system.

## LDD sequence and acceptance

The next organization slice starts with an existing app integration and a second independently owned app. Its schemas must describe both without copying their source into PluginSDK. Proposed formal obligations are:

- O1: A release reference resolves to the reviewed artifact and contract identities; a mutable tag cannot silently select different content.
- O2: Unsupported client semantics block the requested distribution; accepted content and permissions are never silently dropped.
- O3: Organization, service and tool identities prevent a grant from crossing into another organization's integration.
- O4: Missing or unverified identity and unknown policy cannot authorize a protected invocation.
- O5: Authorization requires every applicable grant and restriction; changing clients cannot widen it.
- O6: Unknown tool identities receive no grant; stale discovery cannot authorize direct invocation.
- O7: Fresh revocation takes effect within the documented bound while the plugin remains installed.
- O8: Completion and replay are recorded per destination; a partial rollout cannot report global success or replay completed native mutations.

These are proposed properties, not additional checked proofs. Follow the existing sequence: Effect schemas and Lean types/properties, checked Lean model and proofs, strict oracle vectors, conforming TypeScript, then qualified I/O.

Acceptance uses two users: a reader and an administrator. Both see the same approved integration from every qualified client. Reading succeeds for both; an administrative tool succeeds only for the administrator. Calling that tool directly as the reader still fails. Revoke the administrator's role while leaving the plugin installed, repeat the call, and verify the declared freshness bound. Check record-level permissions, tenant isolation, release promotion, tool-contract drift and partial-rollout recovery separately.

If the company chooses code management later, repository creation, source editing and builds need their own design cycle. Their addition must reuse catalog and release identity instead of replacing the distribution and authorization model. Hosting remains a separate scope decision.
