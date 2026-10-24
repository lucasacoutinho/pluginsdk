# Rooted tree reading

## Caller outcome and current flow

Authors keep one definition and run `pluginsdk build`, `pluginsdk publish` or `pluginsdk preview`. The compiler captures requested source trees; the installer inspects complete installed payloads. Source links may resolve inside the retained root. Installed payloads reject links. These policies remain internal.

[`capture`](../../src/compiler/source/capture.ts) currently resolves each directory, tracks ancestor paths, enumerates children and reads files through Linux descriptors. [`readPayload`](../../src/installer/payload/read.ts) rejects links and collects regular files. [`verifyCandidate`](../../src/installer/lifecycle/inspect.ts) already compares complete file paths, bytes and executable flags with the retained bundle. That comparison remains the authority for bundle fidelity; empty directories do not acquire a new bundle identity.

The [native filename counterexample](windows-filename-acceptance.md) requires an earlier check. A request for `tools/b.bin` can create a file under the stored `Tools` directory. The walker must bind every requested component to the observed entry before trusting a logical path. Full file identity alone also cannot detect ancestor cycles or a skipped enumeration member.

## Shape

The selected private root owner completes capture or inspection inside one scope. Its intended operations remain small:

```ts
RootTree.capture(requestedSources): Effect<CapturedSources, SourceUnavailable | BuildRejected>
RootTree.inspectPayload(): Effect<ReadonlyArray<PackageFile>, PayloadUnavailable>
```

These are implementation sketches, not SDK exports. The owner retains roots and active ancestor directories, checks package-path admission before opening, obtains no-follow entry facts, follows only admitted source links, reads through the qualified file owner, checks complete directory visits and closes every resource. Callers never coordinate handles, native flags or admission stages.

Two pure operations own the missing decisions:

```ts
admitEntry(input: EntryInput): EntryDecision
admitDirectory(input: DirectoryInput): DirectoryDecision
```

`EntryInput` retains the initial root, the active branch's parent and ancestors, one requested component, a no-follow entry observation and its resolved target observation. Observations reuse the existing file identities, anchors, metadata and volume-GUID path parser. Reparse observations additionally retain their raw unsigned 32-bit tag. They do not supply booleans asserting containment or name fidelity.

The branch's final anchor must match the retained root. Every branch anchor must be on the root's volume and at or inside its physical path. The no-follow entry must have exactly its parent's canonical path plus the requested component. A plain entry and target must agree on kind, full identity and canonical path. Source mode permits symbolic-link and mount-point tags whose resolved regular-file or directory target stays inside the root. Payload mode refuses every reparse point. Unknown tags refuse in either mode. A resolved directory cannot repeat any active ancestor identity; separate sibling branches may resolve to the same directory.

`DirectoryInput` retains the root and directory anchors, root/directory observations before and after traversal, complete-or-failed enumerations before and after traversal, and the names whose child operations completed successfully. Directory observations include modification and change times. Acceptance requires stable bindings and timestamps, complete enumerations, no duplicate names, the same exact name set in both enumerations, and exactly one completed visit for every member. Ordering is irrelevant. An empty directory can pass with three empty name lists.

Entry refusal order is unavailable evidence, non-regular target, unsupported path, stream syntax, changed root/ordinary binding, escaped branch or target, mismatched entry name, disallowed reparse point, then ancestor cycle. Directory refusal order is unavailable evidence, non-directory, unsupported path, stream syntax, changed bindings or metadata, outside directory, duplicate names, changed enumeration, then incomplete visits. The schemas retain each refusal explicitly.

## Alternatives and synthesis decision

| Complete shape | Depth and cost | Decision |
| --- | --- | --- |
| Expose a generic walker with hooks for links, comparison, reads and cleanup | Callers must coordinate the native lifetime and every safety policy. The interface leaks the details that vary together. | Reject. |
| Keep independent path walks and rely on final bundle comparison | Reuses the existing semantic comparison, but leaves directory rebinding, cycles, reparse policy and enumeration completeness scattered across callers. | Reject as the traversal boundary. |
| One private rooted-tree owner, existing bundle comparison and narrow entry/directory models | Hides native ownership and traversal policy while retaining the useful existing package boundary. Pure models consume native facts and make no syscall claims. | Select. |

The selected shape adds no public tree framework or author configuration. It follows the [boundary](effect.md) and schema-derived type rules. The current Linux flow is evidence for existing behavior, not evidence that Windows primitives satisfy these obligations. The local source history names the initial alpha, preserved-asset pilot and reviewed repair changes; the current Windows rationale comes from the accepted local probes. No remote planning, chat or telemetry record is established as a source for this local design.

## Proof and native limits

TR1-TR7 specify exact entry acceptance, unavailable evidence, reparse policy, exact component binding, containment, ancestor-cycle refusal and ordinary-entry identity binding. TR8-TR13 specify exact directory acceptance, failed enumeration refusal, duplicate refusal, exact member coverage, changed-observation refusal and permutation invariance.

Native enumeration completion is an I/O premise. The [Windows component](windows-tree-read-acceptance.md) selects handle-based `GetFileInformationByHandleEx` enumeration and distinguishes the end marker from other failures. The native adapter opens each member and queries its current facts; enumeration attributes alone are insufficient. Microsoft's [tag definitions](https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ns-minwinbase-win32_find_dataa) identify mount points as `0xA0000003` and symbolic links as `0xA000000C`. The junction path is qualified; Windows symbolic-link traversal remains unqualified after fixture creation returned privilege error 1314.

Before/after agreement does not prove continuous filesystem immutability or an atomic snapshot. Native qualification must cover concurrent additions, removals and replacements, no-follow versus followed endpoints, retained branch lifetimes, cycles, case aliases, failures and cleanup. Executable intent and complete-path budgets remain separate prerequisites. Windows profiles remain disabled; macOS and release-wide checks remain user-deferred.

- [x] Ground capture, inspection, native findings and existing ownership rationale.
- [x] Compare complete alternatives and select the private rooted-tree owner.
- [x] Proceed under the active milestone authorization.
- [x] Define and prove TR1-TR13, then complete strict oracle and TypeScript conformance. See the [pure acceptance record](tree-read-acceptance.md).
- [x] Qualify ordinary-file and junction traversal with retained handles, raw validation and 310 native oracle frames.
- [ ] Qualify Windows symbolic links and integrate only after the remaining materialization prerequisites pass.
- [ ] Reassess the shape if implementation or native evidence contradicts it.
