# Opened-file read admission

The compiler and installer need one decision for accepting bytes read through an opened file. The author's definition and CLI remain unchanged. This internal contract follows the [Windows observation findings](windows-file-observation-acceptance.md), including the named-stream counterexample. It does not enable a Windows profile.

## Contract and alternatives

| Input shape | Consequence | Decision |
| --- | --- | --- |
| Caller supplies booleans for containment, default stream and stability | The model cannot check the path or identify which observation changed. Every I/O caller owns those policies. | Reject. |
| Caller supplies the retained root and raw before/after observations | One pure module parses native paths, binds the root, checks containment and compares complete metadata. | Select. Native adapters supply facts; this module owns admission. |

`contracts/FileRead.ts` owns the Effect schemas. `PluginSdk.FileRead` owns the Lean contract and oracle. `src/internal/files/file.ts` is the conforming port. No handle, filesystem service or client configuration appears in this contract.

```ts
parseFinalPath(raw: FinalPath): ParsedPath
inside(root: CanonicalPath, file: CanonicalPath): boolean
admitRead(input: ReadInput): ReadDecision
```

`ReadInput` retains an initial root anchor, before/after root and file observations, and a complete-read length or a failed read. Root anchors retain full identity, native path and case-sensitivity state. File observations retain full identity, native path, size, modification time and change time. Unavailable, directory, regular-file and other observations are distinct variants. Decimal strings retain exact sizes and times; fixed hexadecimal strings retain full identities.

The path parser accepts normalized local volume-GUID paths. It normalizes GUID hexadecimal case and preserves component case. It rejects dot components, empty non-root components, forward separators and unsupported namespace forms. Explicit stream syntax receives a distinct refusal. The parser does not claim support for network paths or prove Windows filename materialization rules.

The Lean lexer splits Unicode character lists and preserves empty components. This permits kernel-checked concrete path witnesses without `native_decide`.

Containment requires the same volume and an exact, proper component prefix. `root2` is not inside `root`; case differences are not folded. Native volume identity must also match. The initial root identity, parsed path and case-sensitivity state must match both observed roots. File identity, parsed path, size, modification/change times and the complete-read length must agree.

Refusal precedence is unavailable evidence, non-regular files, unsupported paths, stream syntax, changed root, outside file, changed file. Only the remaining case is accepted. Root lifetime and sharing must still make the supplied native observations trustworthy; before/after agreement is not a proof of continuous filesystem immutability.

## LDD obligations

- V1: parsing a plain path agrees exactly with the supported path grammar.
- V2: containment is exactly same-volume, proper component-prefix containment.
- V3: read admission is equivalent to all required evidence.
- V4: unavailable observations or a failed read refuse admission.
- V5: explicit stream syntax refuses admission.
- V6: a changed root binding refuses admission.
- V7: escaped file evidence refuses admission.
- V8: mismatched file metadata or read length refuses admission.
- V9: non-regular file observations refuse admission.
- V10: matching file identities alone do not establish an admissible read.

Independent vectors must include an accepted empty file, large exact identifiers and quantities, Unicode components, GUID-case aliases, component-case differences, sibling-prefix escapes, alternate volumes, namespace and stream refusals, root replacement, file replacement, and changed timestamps. Strict wire checks must reject malformed brands, noncanonical quantities, extra fields and invalid variants. Pure conformance precedes product I/O changes.

- [x] Ground the existing reads and native observation evidence.
- [x] Compare complete input contracts and select raw observations.
- [x] Proceed under the active milestone authorization.
- [x] Prove V1-V10 and complete strict oracle and TypeScript conformance. See the [acceptance record](file-read-acceptance.md).
- [ ] Integrate only after the remaining native root-lifetime and containment premises are qualified.
