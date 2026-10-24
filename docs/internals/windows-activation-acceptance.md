# Windows activation and normal settlement

The isolated pilot runs the public `Compiler` and Windows `Installer` worker against the real pinned clients. Production Windows profiles remain disabled. The [design](windows-activation-design.md) explains the candidate registry overlay and its limits.

| Client and scope | Normal lifecycle |
| --- | --- |
| Claude Code 2.1.304, user | Passed; independently validated |
| Claude Code 2.1.304, project | Passed; independently validated |
| Codex 0.163.0, user | Passed; independently validated |
| Codex 0.163.0, project | Passed for the normal v2 lifecycle; independently validated |

## What the check proves

One definition contains two operational skills, supporting references, root assets, an executable declaration and two remote HTTP MCP declarations. Both generations produce the same nine-file Claude and Codex bundles as the Linux reference. The source CLI discovers `definition.json` and builds both bundles through `build --json`.

Each accepted scope reviews and applies installation, replacement and removal through the public worker. Completed replay preserves the journal, and a fresh review reports unchanged. Native inventories identify the installed plugin. The complete source and loaded payloads match the approved bytes and executable intent. Unrelated settings survive, and each real change settles to the expected idle journal.

The independent validator recomputes bundle and plan commitments, checks raw journal bytes, reconstructs payload fingerprints and verifies the retained source files and ownership markers after removal. It binds its result to the raw run, complete input/output inventories and outer job receipt.

## Codex project scope

The normal project pilot uses the accepted [project-file implementation](project-file-acceptance.md), the public compiler and installer worker, and real Codex 0.163.0. That run preserves the 147 accepted runtime source files. Only its isolated source copy enables the candidate project profile. The later interruption qualification below adds the temporary-directory correction.

All 33 recorded steps pass: build, reviewed installation, completed replay, unchanged review, replacement from changed skill source, removal, removal replay and a final unchanged review. Both generations match the Linux reference bundles exactly. Independent validation recomputes bundle and plan commitments and checks all eighteen payload files across the two generations.

Six fresh app-server sessions call `skills/list`. Installation and replacement expose two enabled skills with the exact marketplace-qualified plugin ID and expected cache files in project A, with none in project B. Removal leaves neither project with fixture skills, and both owned cache roots are absent. Codex reports these cached skills with scope `user`; project isolation is established by the configuration and A/B discovery results. All six sessions close through stdin EOF with exit code zero and no forced termination.

The original user configuration and both project configurations retain their exact bytes after removal. The foreign project prefix survives intermediate changes. The observed archive attribute and DACL digest remain equal across configuration writes. Replay preserves the completed journals, and the final empty journal retains the removal revision.

The complete sequence takes approximately 161 seconds. Its job deadline is 300 seconds and its controller deadline is 315 seconds. Independent validation checks all 5,096 immutable staged files, the complete 5,315-file final inventory, and the unchanged 5,786-file original activation root. It retains 101 result, journal, RPC, configuration and trace artifacts. The successful scratch root is removed after validation and a fresh exact inventory.

Two earlier results remain separate. A 120-second attempt reached removal planning before its deadline, but did not establish descendant completion; its scratch root remains retained and the lifecycle is unqualified. Another fresh attempt blocked at installation planning with an unknown observation before any apply call. Its before/after configuration basis matches, but the underlying inspection cause is not established. That run's completed process and file evidence was validated before its scratch root was removed.

Standard Effect tracing records compiler and caller spans. Installer execution occurs in a separate worker; its internal spans do not cross the IPC boundary. The successful trace therefore does not explain the earlier unknown observation.

The project evidence and independent validators are under `.audit/probes/windows-codex-project-traced/`, with the two prior attempts in `windows-codex-project-candidate/` and `windows-codex-project-second/`. This accepts the normal v2 SDK lifecycle. The subsequent [project interruption matrix](windows-project-recovery-acceptance.md) accepts seven caller/worker termination and replay cases and fixes temporary-directory creation on long Windows paths. Packaged Windows CLI qualification and the other limits below remain open. No Windows production profile is enabled.

## Observation and harness corrections

An open Node read handle reproduces `EPERM` when the original metadata helper replaces its destination. Publication succeeds after the reader closes. Thirty unobserved writes and forty polling writes succeed in the separate metadata comparison; the deliberately held reader supplies the deterministic counterexample. The initial lifecycle poller could overlap writer retention, so normal acceptance now reads journals after operations finish. Pending-record observation and termination recovery remain separate checks.

Two temporary diagnostic source copies record the caught error and native pipe output. Neither is used in the accepted normal runs; their production hashes are restored first. A separate direct-client diagnostic installs and removes the same bundle successfully. Those diagnostic runs do not qualify the SDK lifecycle.

Earlier receipts also retain a missing package-context error, a process-start allocation failure and the original 45-second deadline. The earlier normal runs stage the sealed package metadata and use a 120-second limit. The Codex project run uses the longer bounded deadline above. Native inventory matches every path, size and SHA-256 from the WSL inventory and avoids repeated reads across the filesystem bridge.

## Evidence and remaining work

The reviewed programs, raw output, staged-source manifests and scope-specific validation receipts are under `.audit/probes/windows-activation/`. The runtime uses Windows NT 10.0.26200 x64, Node 24.18.0, Effect 4.0.5 and Koffi 3.3.3. All accepted runs require outer job assignment, zero remaining processes, a closed job and confirmed root exit. Forty-eight scoped lifecycle/compatibility/execution/writer certificates and twenty-two TypeScript tests pass. The native path change additionally passes twenty Windows path certificates, forty-four authored vectors, 1,800 generated native-path comparisons and strict wire rejection checks. The CLI and SDK sources compile in a separate audit output directory; Effect diagnostics report no messages.

The first Codex user run retained a real pending installation after native inspection returned `unknown`. Its CLI summary omitted optional source metadata, while its plugin and config sources used an extended DOS path. The [native path design](native-path-design.md) records the fix and its LDD sequence. A fresh normal lifecycle then passed. A separate fresh public installer process settled the original four-writer pending record and acknowledged replay. Independent validation recomputed its fingerprint and verified all eighteen staged/cache files. The full before/after inventory changed only that workspace's state record; catalog, config, cache, markers, plans and payload bytes stayed unchanged. This proves settlement of the retained completed mutation; termination at other lifecycle cuts remains separate.

Both Claude scopes passed another complete lifecycle with that same inspection fix. [Native path acceptance](native-path-acceptance.md) records that revision and its checks. The initial Codex project probe built all four reference bundles, then stopped during planning at the Linux-only configuration file I/O barrier. It made no apply call and changed no prior workspace. The project-file implementation and subsequent project pilot above supersede that barrier; the original result remains retained.

This phase covers the v2 skill/asset/remote-MCP formats, normal settlement and the specific Codex user recovery above. The linked project interruption matrix adds its seven qualified cuts. A packaged Windows CLI, other interruption boundaries and scopes, modern process/hook/agent formats, MCP authentication and remote tool calls remain unqualified. Native source symbolic-link qualification remains open. macOS qualification is deferred without a host. CI, package-consumer and release-wide checks remain deferred.
