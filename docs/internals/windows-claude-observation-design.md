# Retaining Windows Claude query processes

The first Windows Claude user recovery case stopped during its first read-only discovery query. The native owner reported two process births. The fixture admitted the root Claude executable, but it failed before admitting the second birth. Its Effect failure rendering discarded the underlying cause. This does not establish the second image or why admission failed.

The frozen run is `.audit/probes/windows-claude-user/before-install-run.json`, SHA-256 `0bfd1e1ad48d2165ef41d64dc152c9e217a38e96bce4e51d9f87d76a64cf1894`. Its observation is `7033630fd20c05327d241eb3f725a666f946286804b3f6a707d40a778f6e990c`. Keep its stage and inputs untouched. Unknown completion forbids inspection, cleanup, retry and reuse of that stage.

## Selected contract

The production Windows command owner already authenticates each debug process event against a retained job handle, records PID and creation time, and withholds continuation until the callback retains that birth. It accepts descendants with their own executable images. The private discovery fixture instead required every image to equal Claude and requested termination access for every independent handle.

Use the existing owner and add a private observation-only handle API in a versioned diagnostic snapshot:

```ts
interface ObservedProcess {
  observe(): ProcessWitness
  wait(milliseconds: number): "terminated" | "active"
  close(): void
}
declare function openObservedProcess(expected: Writer): ObservedProcess
```

Open only with `PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE`. Validate exact PID and creation time before admission; record the kernel-reported image. Do not expose termination through this API. The first birth must be the active staged Claude executable. Every subsequent birth must be the exact active process reported by the trusted native owner; its image is recorded rather than presumed. Retain every handle until its bounded wait and final observation independently establish termination. Unknown or failed admission remains incomplete.

Existing `openOwnedProcess` and its image requirement remain available for controlled SDK callers and workers. No public SDK, contract or installer implementation changes are part of this correction.

## LDD and bounded evidence

The existing Lean writer model and proofs govern birth identity, admission, PID reuse and completion. The existing Windows path model governs qualified root image equality. First compare TypeScript with the actual Lean oracle over exact and mismatched births, unavailable lookups, missing or duplicate observations, active and terminated descendants, and exact versus extended DOS root paths. This is conformance to existing properties, not a new claim that arbitrary process images are equivalent.

After conformance passes, prepare one isolated native snapshot from the accepted dependency root and pinned source inputs. Run only `claude plugin list --json` from a fresh project and fresh Claude home. Capture full Effect causes through `runPromiseExit` and `Cause.pretty`. Record each birth, initial kernel witness, independent bounded wait, terminal witness and handle close. Root image qualification and complete coverage are required independently of job accounting.

Only established completion permits reading the closed probe inventory. A successful query with no plugin rows and exact process coverage accepts this observation premise; it does not qualify installation or enable a native profile. Failure retains the fresh stage and stops dependent work.

Once the premise passes, carry the exact reviewed helper and query logic into a fresh recovery snapshot and its independent validator. Preserve the failed snapshot. Continue the existing seven cuts, compiled commands and preview acceptance before admitting the exact Windows Claude user profile. macOS remains deferred because no host is available.
