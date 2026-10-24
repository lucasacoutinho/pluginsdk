# Windows companion storage

## Problem and caller view

An author keeps the same definition, agent prompt and `pluginsdk build` / `preview` workflow. Windows Codex must discover the resulting qualified role and the Installer must own its creation, replacement and removal. No author wrapper, Windows option or second role installation API is needed.

The [Linux feature gate](portable-features-native-linux-acceptance.md) qualifies the complete portable v2 package. The [Windows adapter gate](windows-companion-integration-acceptance.md) now qualifies companion storage and inventory. Full SDK feature lifecycles through the private Windows worker remain necessary before profile promotion.

## Traced ownership

`Installer.plan` resolves and locks the destination, observes its receipt and native state, and derives complete previous/desired role bytes from retained bundles. The existing F1–F8 model reviews absent, owned, conflicting and unknown role observations. The saved plan commits the complete capture. `apply` rederives it, verifies the before-state, records pending execution and invokes the companion writer. Settlement compares the full native observation; completed replay only acknowledges the journal.

`inspectCompanions` reads active Codex config layers, checks role declarations and discovered files, and includes companion facts in the installation fingerprint. Those facts can carry Windows metadata through the existing receipt and stale-plan checks. A new public plan field is unnecessary. Logical role identity remains `<plugin>:<agent>`; its fixed filename remains `psdk_<plugin>_<agent>.toml`.

The [agent design](agents-design.md#grounded-flow) records why companions exist: the pinned Codex client loads user role files while ignoring the tested plugin-contained file. The [project-file design](project-file-native-design.md) records why Windows needs native metadata and held handles: POSIX mode is insufficient, exact DACL restoration requires an explicit native operation, and cleanup must identify the opened staging object. Local Git has no committed history for the newly added role implementation. External tracker/document connectors are exposed, but the checkout cites no associated records for this local storage design; no unrelated organization records were queried.

## Alternatives and synthesis

One candidate adds a Windows-specific role reader and writer beside the current POSIX implementation. It leaves the project-file backend intact but duplicates stream admission, DACL capture/restoration, temporary publication and cleanup. Changes to that native contract would then have two owners.

The selected candidate shares a Windows owned-file boundary between project configuration and role storage. Each operation opens its physical ancestors, validates the selected leaf, performs its complete read or mutation, and closes its resources. The callers supply a reviewed metadata basis and complete bytes; they never coordinate staging handles or FFI calls. Project configuration retains its target/text policy. Role inventory retains names, config-layer collisions, byte limits and role parsing.

The existing project-file metadata contract is the common basis: absent; POSIX digest/mode; or Windows digest, attributes and DACL digest, with stream state on the observation. Role admission adds the exact POSIX `0600` requirement and projects admitted files into the existing F1–F8 digest observations. Reuse the proved Windows metadata policy rather than copying its attribute mask or stream rules. The native shared boundary may be extracted only after this role policy conforms to its oracle.

This shape hides Windows handles, path capacity, metadata, temporary files and publication behind three internal operations. It adds no public service. It accepts the existing internal metadata contract's project-oriented location to preserve saved schemas and avoid an unrelated type migration.

## Interfaces and module boundaries

The internal `WindowsManagedFiles` service owns three operations:

- `readFile(path, maximumBytes?)` returns the native observation and complete bounded bytes.
- `writeFile(path, before, bytes, maximumBytes?)` reviews the destination and publishes staged bytes.
- `removeFile(path, before, maximumBytes?)` requires a present Windows basis and removes the reviewed handle.

The live layer supplies the native API. The factory accepts that API so native checks can track real handle acquisitions and releases. Each operation returns an Effect with `ManagedFileUnavailable` as its operational error. The pure role signatures remain:

```ts
// Pure role policy, derived from authoritative Effect schemas.
admitCompanionFile(input: MetadataInput): CompanionFileDecision
reviewCompanionFile(input: MetadataReview): CompanionFileDecision
observeCompanionFile(input: MetadataInput): Companions.FileObservation
```

`contracts/CompanionFile.ts` owns role admission, review and projection schemas. `src/installer/companions/file-policy.ts` owns their total pure functions. `spec/PluginSdk/Installer/CompanionFile/` owns the matching types, properties, model, certificates and strict wire. The existing project-file wire supplies the common strict metadata codecs.

The shared native operations live in `src/internal/windows-files/managed.ts`. `project-file.ts` adapts project paths and text directly to that service, and the duplicate `project-file-windows.ts` backend is removed. `role-storage.ts` supplies traced operations and selects the physical backend. `role-storage-posix.ts` retains the POSIX mechanics. Inventory rejects conflicting names and unknown data. Windows role facts include the admitted metadata so DACL or attribute drift changes the receipt fingerprint.

## Pure obligations

- RF1: Linux absence is exact; a file succeeds exactly at mode `0600`, preserving its digest and basis.
- RF2: Windows absence is exact; files succeed exactly with the existing admitted attributes, default stream and unchanged digest/DACL basis.
- RF3: Unsupported platforms reject, including absent input.
- RF4: A foreign platform representation rejects before role mode checks.
- RF5: Review succeeds exactly when current admission succeeds and the entire reviewed basis matches.
- RF6: Review preserves the current admission refusal.
- RF7: Any admitted-basis drift rejects as changed.
- RF8: Projection preserves admitted absence/digest, maps refusal to unknown and never invents a name conflict.

## Native obligations and remaining questions

Physical read admission remains separate from role metadata policy. Native checks must cover exact paths, reparse/alias refusal, stable reads, exclusive creation, DACL/attribute preservation, stale basis, default streams, and handle-based removal. The security digest represents the DACL descriptor, not owner, group or SACL. New Windows files use native inherited DACL semantics; this does not claim equivalence to POSIX privacy permissions.

Does generalizing the fixed project leaf preserve its already qualified behavior? Do reviewed removal and failed publication leave a truthful inspectable result without deleting another object? Which concurrent changes can the native publication operation exclude while handles are held? The native component must answer these before integration; metadata equality alone is not an atomic compare-and-swap guarantee.

Full acceptance then builds both versions from the author definition, installs/updates/replays/removes through the SDK, rejects drift and unowned aliases, interrupts before companion cleanup, repairs only captured residuals and establishes fresh-client absence. Hook trust and execution remain separate native checks. Profile promotion waits for those results.

## Sequence

The [pure policy gate](windows-companion-file-acceptance.md) completes RF1–RF8, independent wire expectations and TypeScript conformance. The [native component gate](windows-owned-file-acceptance.md) adds scoped read, write and removal with byte limits, metadata preservation and truthful outcomes after failed publication. The [adapter gate](windows-companion-integration-acceptance.md) integrates project configuration and companion inventory with that boundary. Complete SDK feature lifecycles follow integration. macOS, Grok tests, external authentication, CI and release checks retain their deferred status.
