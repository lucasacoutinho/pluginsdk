# Windows Claude project qualification

The candidate is Claude Code 2.1.304 on Windows x64, project scope, using the basic `claude_code_v2` package. The public profile stays disabled until normal lifecycle, interruption recovery and compiled CLI checks pass. macOS, Grok native tests, third-party authentication, CI and release-wide checks remain deferred.

## Grounded contract

The installer invokes the native project-scoped commands from the canonical project root. Installation identity includes both the home and project inode identities. Claude keeps installation metadata and caches in its home while writing the project's `.claude/settings.json`. The [installation-lock correction](installation-locks-acceptance.md) gives every project operation a home lease and a shared project lease.

The previous candidate-only Windows observation exercised one project. It reported `scope=project`, that project's `projectPath`, and `projectEnabled=true`. It does not establish what another project's process can discover. The accepted user fixture queries two projects, but requires the user plugin to appear in both. That expectation cannot be carried into project qualification.

## Alternatives and selected experiment

One option infers isolation from project A's settings and inventory. That leaves project B's behavior unobserved. The selected option creates two separate Git project roots under one isolated Claude home, installs only into A, and queries each from its own working directory. It preserves user and B settings byte for byte and permits only the owned selector and marketplace entries to change in A.

The first experiment records native evidence before choosing a classifier for B. It runs the normal SDK lifecycle with the candidate profile, checks exact planned payload bytes, and captures `plugin list --json` and `plugin marketplace list --json` in both roots after install, replacement and removal. Installed states also query `plugin details` in A. Every command uses the accepted retained-birth observer, terminal wait and handle-closure checks. Inventory visibility and effective activation remain separate questions until the responses establish their meaning.

The same authored `platform-tools` definition produces the two pinned nine-file generations. The normal driver must prove distinct physical target keys for A and B, no-op planning and stable replay in A, replacement and removal, and absence of changes to user and B settings. A ready B plan may be captured but never applied. Home-global metadata and cache changes are recorded rather than mistaken for project activation.

## Boundaries and progression

The fixture exports `createFixture`, `buildBundle`, `captureState`, `inspectConfig`, `verifyForeign`, `save`, `observeProjectQueries` and `clientProcessesComplete`. It owns source and settings capture and native query observation. The driver owns the SDK request sequence and uses the accepted transport for caller and worker accounting. The controller owns staging, immutable input hashes, the native job, exact completion gates and guarded cleanup.

After complete observed responses, define the project-inventory classifier and retain its positive and negative vectors. Only then adapt the seven accepted interruption cases. Each case must show both leases held after caller exit, exact worker and native-writer completion, both leases released after worker completion, and settlement/replay without another native mutation. Compiled `plan`/`apply` checks follow. `preview` remains a local user-installation workflow and already has its own qualification.

No native root may be inventoried, reused or removed while any caller, worker or native descendant has unknown completion. The four previously retained unknown roots remain untouched.
