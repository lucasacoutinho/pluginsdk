# Executable-intent integration

Authors keep one definition and the existing build, preview and publish commands. The optional `executables` list declares source paths relative to the definition root. An empty list declares all captured source files as data. Omitting the field retains POSIX permission discovery. The [pure contract](executable-intent-acceptance.md) is already accepted; this record selects its I/O integration.

## Flow before integration

[`Compiler.build`](../../src/compiler/index.ts) snapshots and strictly decodes its request, then calls [`capture`](../../src/compiler/source/capture.ts). Capture currently resolves each skill, asset and agent prompt and reads bytes through a Linux file descriptor. It assigns an executable Boolean during each read. Skills then shorten supporting-file paths for rendering. Shared agent prompts may name the same source more than once. Agent rendering creates new documents with renderer-owned intent.

Ordinary [`inspection`](../../src/installer/lifecycle/inspect.ts) validates a retained plan, marker and bundle, then reads staged and loaded payloads. Its binding result currently participates in the final identity decision after those reads. [`Project inspection`](../../src/installer/project/inspect.ts) already checks that binding before reading its two trees. Both callers compare complete `PackageFile` arrays and compute a content/intent commitment. [`readPayload`](../../src/installer/payload/read.ts) reconstructs intent from Linux permission bits.

[`stageFile`](../../src/installer/storage.ts) requests 0755 or 0644 during exclusive creation, writes and flushes through the same writable handle, closes it and syncs the parent. The [previous native checks](windows-file-staging-acceptance.md) establish that handle lifetime. They cover the recorded umask, not every restrictive execute mask. That premise is being checked separately before changing staging.

The retained bundle already commits intent. Source capture must resolve declarations before rendering changes path layout. Payload inspection must recover intent only after validated retained metadata binds to the observed file. The existing full-byte comparison remains required.

## Alternatives and synthesis decision

| Source capture shape | Decision |
| --- | --- |
| Assign declaration membership inside each read, then separately check missing declarations | Reject. The reader and coverage check would separately implement the same membership rule. Repeated source reads could observe different versions of one logical file. |
| Capture one raw inventory, resolve its intent once, then project skills and assets | Select. One module owns capture, declaration coverage, exact source names and the final renderer inputs. Shared prompts reuse the admitted source bytes. |

| Payload shape | Decision |
| --- | --- |
| Return raw observations and make ordinary/project callers restore flags and compare trees | Reject. Both callers would coordinate binding, restoration, byte equality and fingerprint rules. |
| Make the payload owner inspect against a validated retained file set and return match/fingerprint evidence | Select. Both installation paths use one complete comparison. The owner retains native lifetimes and exposes no invented Boolean for a changed or unexpected file. |

| POSIX staging shape | Decision |
| --- | --- |
| Apply 0755 or 0644 with `chmod` after creation | Reject. This would also widen read/write permissions removed by the caller's umask. |
| Preserve read/write bits and change only the execute bits needed by artifact intent | Select. The native baseline reproduces masked executable intent. Preserve a matching mode. Otherwise true adds only owner execute; false clears the three execute positions. Prove this transformation before its I/O use. |

These choices keep the existing Compiler and Installer public operations. The only authoring addition is `Plugin.executables?: PackagePath[]`. No sidecar, Git index or additional SDK entry file becomes an authority.

## Contract sketches

The capture owner retains raw source facts keyed by exact logical path. Each fact uses the accepted `ObservedFile` schema: path, digest and a mode observation. Bytes remain in the existing digest-keyed content table. A repeated logical source uses the first admitted fact. Role-specific validation still checks skill frontmatter and agent text.

Pending skill groups retain their source directory and original paths until intent resolution. The owner submits the complete distinct inventory to `resolveSourceIntent`, then constructs the existing `Skill` and `Asset` records. Supporting-file path shortening happens during that final projection. Generated manifests, agent documents and launchers retain their renderer-owned intent.

Invalid declarations produce `BuildRejected` with an `invalid_executable` path and human-readable detail, following the existing invalid-skill/asset/agent issue shape. Native I/O failures remain `SourceUnavailable`. The CLI handles the new issue exhaustively. The declaration field does not make uncaptured files part of the plugin.

The private payload interface becomes:

```ts
readPayload(root: string, retained: ReadonlyArray<PackageFile>): Promise<{
  matches: boolean
  fingerprint: string
}>
```

Callers validate the retained plan/bundle binding before invoking it. The owner reads every regular file, admits its native observations, computes its digest and calls `resolvePayloadIntent` against the corresponding retained path. Missing/extra paths, changed bytes or incompatible POSIX intent yield a known mismatch. An I/O failure or unstable native observation remains unavailable.

Only a complete reconstructed file set can match. The owner retains exact full-byte equality against the complete retained array. A matching tree keeps the existing `native-tree` commitment of path, digest and executable flag. A mismatching tree receives a separate commitment of the complete observed path/digest/mode facts. No false flag substitutes for unresolved intent. Ordinary and project callers consume the same match and fingerprint result.

Production traversal remains Linux-only in this phase. The accepted Windows rooted-tree component will supply `unrepresented` mode facts when its complete reader is integrated. Changing this comparison does not enable a Windows profile.

The additional pure staging operation is:

```ts
stagePermissions(input: {
  current: PermissionBits
  executable: boolean
}): PermissionBits
```

Its laws require exact requested executable intent, unchanged read/write bits, unchanged already-matching modes and only owner-execute addition when true intent is missing. Permission bits remain bounded by 0777. Native staging reads the actual newly created file's permissions from its writable handle, applies a different proved target only on POSIX and then flushes that same handle. Windows retains its qualified write/flush behavior without a POSIX permission claim.

## Acceptance and limits

- [x] Ground capture, both inspection paths, bundle binding and staged-file ownership.
- [x] Compare complete source, payload and permission alternatives; select the owners above.
- [x] Proceed under the active milestone authorization.
- [x] Reproduce restrictive-umask behavior and prove the additional permission transformation.
- [x] Complete its independent vectors, strict wire and TypeScript conformance before staging edits.
- [x] Integrate authoring, capture and both payload callers; preserve exact bytes and generated-file intent.
- [x] Exercise native Linux capture/staging/inspection and isolated client lifecycle regressions.
- [x] Reassess native evidence: restore owner execute only, preserving read/write restrictions.

The [integration acceptance](executable-intent-integration-acceptance.md) records twenty checked certificates, 4,307 oracle comparisons and the Linux I/O and client evidence.

Native checks must include default POSIX discovery, declarations overriding file modes in both directions, exact missing/duplicate names, shared source reuse, Unicode/case distinctions, renderer-owned permissions, payload byte/path/mode drift, collision preservation and restrictive umasks without widened read/write access. All umask changes run in isolated children. Parents exist before masks that remove every directory traversal bit; these checks do not claim support for inaccessible directory trees.

Complete Windows traversal integration, source symbolic-link coverage, complete-path budgets, materialization, activation and client qualification remain open. macOS has no host and remains deferred. CI, package-consumer and release-wide checks remain user-deferred.
