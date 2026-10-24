# Windows compiler source capture

Authors keep the existing definition and `Compiler.build`. Capture reads declared skill trees, assets and agent prompts. It does not scan the surrounding application repository. Windows sources require an explicit `executables` declaration because their native mode is unrepresented; the existing executable-intent model owns that decision.

## Grounding

`CompilerLive.build` snapshots and validates the request, calls `capture`, renders each host format and validates the complete bundle. Capture currently combines Linux I/O with skill frontmatter, agent text, source memoization and executable-intent projection. The asset tests establish contained file/directory links, outside-target refusal, cycle refusal, exact source bytes and permission discovery. The executable-intent integration record requires one admitted version per logical source, including shared prompts.

The accepted Windows payload reader supplies retained roots, exact entry observations, complete enumeration, stable reads and bounded path operations. Source policy differs: supported links may resolve to ordinary targets inside the root. Each requested parent component needs entry admission, including parents of a single selected file. Enumerating every root member would make unrelated app files part of capture.

The local source history records the verified alpha and preserved-asset pilot. The current rationale is explicit in the rooted-tree and executable-intent design records and the user's organization scenario. No external planning or telemetry record is established for this local change.

## Alternatives and synthesis

| Shape | Decision |
| --- | --- |
| Add a second complete compiler capture function for Windows | Reject. Skill parsing, agent projection, executable intent and source grouping would diverge across platforms. |
| Expose open/stat/follow/close primitives to the existing capture loop | Reject. The semantic compiler would coordinate native lifetime, exact-name checks and directory admission. |
| Keep one semantic capture function over a scoped source-reader layer | Select. The reader owns platform I/O and one admitted byte version per logical path. The compiler owns plugin semantics and rendering inputs. |

The private reader exposes two operations: `file(path)` returns one captured file; `select(path, mode)` returns all files in a declared directory or asset. Mode distinguishes a required directory from an asset that can be a file or directory. Results contain logical path, bytes and native mode. They contain no handles, physical path or caller-supplied capacity.

`SourceFilesLive(root)` acquires the platform reader in an Effect layer scope. Linux retains its existing descriptor-based read and source-link behavior. Windows canonicalizes the requested root once, then retains an ordinary native root. A shared private schema represents captured content for both source reading and payload reading. Source refusal carries a logical path and a closed reason; the semantic compiler maps that reason to its existing role-specific issue. Native unavailability remains `SourceUnavailable`.

## Windows ownership

The source reader navigates each selected path one component at a time. It retains the active parent chain. Each component opens without following the final entry. Ordinary entries reuse that retained handle. Supported native reparse entries retain their guard while a followed handle supplies the target observation. The accepted source entry model checks exact names, root binding, containment and ancestor identities before any bytes are read.

The private native owner adds an explicit entry/target opening mode. Its default remains entry mode for payload inspection. Lexical and requested-path capacity admission still run before either opening. Required normalized-name queries remain bounded and fail if reparse expansion cannot be represented. Source link targets cannot be predicted from the lexical root views; acceptance must check the actual target observations rather than claim that the lexical budget proves their expanded lengths.

Selected directory capture observes complete membership before and after traversal and admits every completed child through the existing directory model. Unselected ancestor directories retain identity and exact entry binding without requiring traversal of their siblings. Stable file reads consume the existing read model. A successful file is memoized by logical path for the lifetime of the build. Separate sibling aliases may capture the same physical directory; active ancestor cycles refuse.

The Windows adapter follows only native link kinds it implements. The source entry model remains the policy authority after target acquisition. Unknown native kinds refuse. Root and all active handles close before the build returns, including refusals and partial traversal.

## Acceptance

The existing pure models and proofs remain unchanged. This phase must preserve Linux compiler, asset, executable-intent, agent and payload checks after separating I/O. Scoped typechecking, Effect diagnostics and lint must pass.

Native Windows checks must invoke the production source layer and `Compiler.build`, cover declared selection without unrelated-tree scans, exact Unicode/case names, contained junctions, escapes, cycles, source reuse, concurrent changes, explicit executable declarations and unchanged payload behavior. Bundles for Claude and Codex must retain the expected files and renderer-owned metadata. Qualification must independently decode native observations and establish handle/job/runtime cleanup.

Windows symbolic-link creation previously failed with privilege error 1314. Its traversal remains a separate native gap unless this host can supply that fixture. Installation profiles remain disabled until materialization, activation, engine settlement and full client lifecycle pass. macOS and CI/package/release checks remain deferred.

- [x] Ground current capture, source-link policy, memoization and accepted native operations.
- [x] Compare complete shapes and select the scoped source reader.
- [x] Proceed under the active milestone authorization.
- [x] Integrate shared semantic capture and platform readers.
- [x] Complete focused checks and native qualification for ordinary files and junctions.
- [x] Reassess ownership and selection against native observations. Symbolic-link qualification remains open.

The [acceptance record](windows-source-capture-acceptance.md) records 18 Windows cases, 32 Linux regressions, exact Claude and Codex bundles, independent decoding and complete runtime cleanup.
