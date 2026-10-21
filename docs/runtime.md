# Native execution and durability

The installer uses the existing `decide`, `begin` and `settle` protocol. This document specifies its Node implementation obligations. The initial native profiles qualify Linux, Claude Code 2.1.304 and Codex CLI 0.163.0. Other versions, platforms and unsupported scopes fail before mutation.

## Alternatives

Calling native commands directly from the library process is simple, but a killed caller can leave a command running after its SDK lock disappears. A fresh caller could then mistake a temporarily unchanged installation for a completed failed attempt.

Writing native registries directly would avoid that process lifetime, but would make private settings and cache formats part of the SDK's write contract. It would also duplicate native merge and installation behavior.

The implementation selects native CLI operations in one short-lived child process. It is an execution process for one approved change, not a daemon. The main process persists the pending plan before starting it. The child inherits the same open-file-description lock as the caller. This keeps all SDK writers to that host home serialized even if the caller exits.

## Handoff

1. Snapshot and validate caller data before asynchronous work.
2. Resolve the physical host home, project and plugin key. Acquire the home-wide OS lock. Recheck target, profile, native version, before-state and plan commitment.
3. Durably save the full approved plan and pending journal with execution marked `prepared`.
4. Start a child that holds the inherited lock and waits for a message. Persist its process-group ID and Linux boot ID before sending the change.
5. Send the approved change once. Before receiving it, the child exits when its caller disconnects. After receiving it, the child completes its native recipe even if the caller disconnects. A retry never sends the change again.
6. After child exit, prove its process group no longer exists. Then inspect native registration, activation and every payload byte and executable bit. Call `settle` and durably save its journal before reporting completion.

A pending operation with a live or unverifiable process group yields an unknown observation. A changed boot ID proves a previous boot's native processes cannot still commit. PID reuse can delay settlement conservatively; it cannot authorize a second native write.

## Storage and ownership

SDK files live beneath the physically resolved host home. One kernel lock serializes shared catalogs and records across SDK instances. Storage rejects symbolic-link aliases. Records use strict schema decoding and reject duplicate JSON keys. Writes use a new file, file sync, atomic rename and directory sync. Newly created directory chains are synchronized too.

Each installation has its own local marketplace inside SDK storage. Payloads contain the bundle's exact files. Operation identity and the original bundle envelope live outside the native payload. Ownership requires a matching SDK receipt, registered SDK source, managed catalog and activation, plus a freshly recomputed digest of the actual files. A marker alone proves nothing.

Claude's local marketplace uses an in-place source. Codex copies that source into its own cache. The concrete profiles verify these distinct paths. The public interface stays unchanged. Removing a plugin also removes its dedicated marketplace registration; archived immutable SDK plans and staged artifacts remain available for inspection.

Native CLI configuration writes preserve unrelated entries. The SDK lock coordinates SDK writers; arbitrary external programs must still respect the native host's own serialization. A plan rechecks relevant registration and payload facts immediately before the handoff. The protocol provides no transaction spanning multiple hosts or arbitrary external writers.

The crash harness must terminate the caller at each durable and native transition, then resume from another process. It must also demonstrate that a still-running execution process prevents a conflicting SDK writer from proceeding.

## Reviewed repair

The [repair protocol](repair-design.md) uses the same lock and one-shot execution handoff. A repair-pending record retains the full interrupted operation, current cleanup plan and execution token. Marketplace cleanup requires fresh quiescence, exact retained catalog provenance and no installed or configured consumers. Proven absence starts no native worker. A cleanup retry only inspects and settles; another cleanup attempt requires a new reviewed basis and plan ID. Settlement durably records removal only after qualified absence.
