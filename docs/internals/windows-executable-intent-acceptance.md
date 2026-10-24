# Windows executable-intent acceptance

The Windows file component preserves both executable flags from validated SDK bundles after admitting the observed path and bytes. One definition produces Claude and Codex bundles; their ten package files pass actual Windows staging and native reading. Production capture and payload inspection remain Linux-only, and no Windows client profile is enabled.

The check runs the existing `stageFile` helper and unchanged qualified native reader on Windows 10.0.26200, x64, with Node 24.18.0 and Koffi 3.3.3. The native reader retains root/file handles, supplies before/after observations to `admitRead`, and reads through the same file handle. The observed logical path comes from the native final path. Only an admitted read can reach `resolvePayloadIntent` with an `unrepresented` execute bit.

## Evidence

| Check | Result |
| --- | --- |
| SDK packages | One definition builds `claude_code_v2` and `agent_plugins_v2`. Each contains an executable command, three data files and a generated manifest. All ten file paths and complete byte arrays match their bundles on Windows. |
| Opposite intent | Executable and data files have identical Windows stat modes. The bound retained flags remain true and false, including after chmod requests of 0644 and 0755. |
| Binding and refusal | Changed bytes refuse with `content`; a renamed file refuses with `path`. A missing open and a directory read supply no usable intent. An exclusive staging collision returns `EEXIST` and preserves the file. Forged retained flags fail complete bundle validation before intent resolution. |
| Source declarations | The proved model resolves exact declarations and an explicit empty list over the native file inventory. Filesystem-only selection refuses the unrepresented bit. This does not qualify the Windows compiler capture adapter. |
| Native cases | All nine cases pass. |
| Model replay | All 44 recorded frames agree with their case expectations, Windows TypeScript, Linux TypeScript and Lean. Strict schema decoding and input preservation pass. |
| Raw reads | Main reconstructs twenty reads from native chunk buffers and verifies the supplied digests. Complete SDK bundle bytes are compared separately. |
| Resource lifetime | All 42 native file handles close. Three staging/collision controls hold at 183 process handles while the root lease is retained. The accepted run starts and ends at 182. Exact child exit and job-handle closure pass. |

The original pure checkpoint supplies twenty checked certificates and 4,307 oracle comparisons before native work. This phase changes no production model or I/O source. Its runtime is staged under one marker-owned temporary directory, with the inherited environment removed and fresh home directories. The manifest is checked before execution and cleanup.

## Probe corrections and integration constraints

The first run passes eight cases but rejects the forged-metadata fixture at schema decoding: that fixture supplied already-decoded bytes to the base64 JSON codec. The corrected fixture re-encodes the retained bundle before changing its flag.

That run also observes a cold process-handle count of 179 and a final count of 182. The next run measures 183 before and after each of three staging controls, with one native root handle held: the increase precedes staging. The accepted run allocates its scratch directory before measuring the native baseline, then verifies unchanged counts throughout those controls and after all native handles close. This establishes the recorded steady behavior; it does not classify the three cold-start handles by kernel type.

The second run exposes another constraint: constructing the original native reader twice in one process fails with a duplicate `FILE_ID_128` FFI type. That component declares process-global types inside its factory. This accepted run retains one instance. The subsequent [root-session qualification](windows-root-session-acceptance.md) separates immutable anonymous binding setup from root ownership and qualifies repeated roots. Production integration must carry that separation into its scoped reader.

Both failed probes, their raw observations and their source snapshots are preserved. The accepted probe, model replay, staged manifest, source pins and cleanup receipt are retained under `.audit/probes/windows-intent-native/`.

## Remaining work

Complete-path budgets, source symbolic-link coverage, complete materialization, production reader integration, activation and full Windows client lifecycle remain open. Artifact intent does not establish Windows ACL permission or executable startup. macOS has no qualification host. CI, package-consumer and release-wide checks remain user-deferred.
