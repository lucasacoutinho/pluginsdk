# Installation locks

Project installation must serialize changes to the same physical project even when callers use different client homes. The installer already does this for Codex. Claude also writes shared project configuration, so the rule belongs to destination scope.

## Caller and boundary

`Installer.plan` and `Installer.apply` resolve a canonical `Target`, acquire its locks, and resolve it again before reading or changing installation state. Apply passes the acquired lease descriptors to the transaction worker. That worker must retain every lease after the caller exits.

The selected interface is internal:

```ts
declare function installationLockSubjects(destination: Destination): ReadonlyArray<LockSubject>
// user:    [{ type: "home", root: destination.home }]
// project: [{ type: "home", root: destination.home },
//           { type: "project", root: destination.root }]
```

`Destination` remains the authoritative input schema. `LockSubject` is a tagged schema with a directory root. The pure selection never reads a filesystem or chooses a host. The I/O adapter maps home subjects to `<home>/.pluginsdk` and project subjects to `<root>/.pluginsdk/installer`, acquiring them in list order through the existing scoped `installationLock` implementation. Codex's `.codex` directory preparation stays specific to Codex.

## Alternatives and decision

One option adds a Claude-specific project lock beside the Codex branch. It duplicates the same shared-resource rule and would require another branch for every future project adapter. Another option derives ordered subjects from the destination and uses the existing lock primitive for each. We select the latter. It preserves current lock paths and worker lease handling, and makes host-independent coordination explicit.

Adding another installation key would not solve this problem. Keys include the home identity, while the shared project file does not. A home-global lock also cannot coordinate different homes. Project locks coordinate SDK writers; they do not claim to lock an unrelated client or editor.

## LDD obligations

| ID | Property |
| --- | --- |
| IL1 | A user destination selects exactly its home subject. |
| IL2 | A project destination selects exactly its home followed by its project subject. |
| IL3 | Project destinations with the same root select the same project subject regardless of home. |
| IL4 | Every selection contains exactly one home subject, first, with the input home. |

Lean models the validated destination scope and directory strings. Host validation belongs to the wire parser; selection ignores the host. TypeScript conformance covers every host and both scopes, including equal home/project strings, Unicode and Windows directory text. This is a selection theorem, not a filesystem identity or locking theorem.

The native premise is tested separately: while the selected locks are held, a second home cannot acquire the same project lease; another project remains independent; all leases become available after scope release. A user operation must leave project locks available. The regression first runs against an exact extraction of the existing `lockTarget` body. Windows project qualification must additionally prove both lease descriptors survive caller interruption and that completed workers release them.

## Work sequence

- Ground: trace target identity, project writes and worker lease inheritance; reproduce the missing shared lease.
- Sketch: compare host branches with scope-based subjects and select the latter.
- Agree: proceed under the existing milestone authorization.
- Implement: prove IL1–IL4, run the oracle and TypeScript conformance, then update I/O and run the lock regression.
- Scrap: reconsider the shape if the real lock or worker behavior contradicts it.
