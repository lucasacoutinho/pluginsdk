# Launcher runtime admission

Installer preflight now selects checks from the package's launcher encoding and the current platform. Portable Windows packages require Node; they no longer inherit POSIX requirements. Authors keep the same definition and commands. Production profiles and automatic format selection remain unchanged until SDK lifecycle qualification passes.

The compiler's `nativeLocations` remains the authority for format encodings. The internal [schema](../../contracts/LauncherRuntime.ts) distinguishes absent, POSIX and portable launchers; POSIX alone carries the existing Codex shell-root requirement. The [pure model](../../src/installer/runtime/launcher-policy.ts) returns an ordered check list or refuses an unsupported platform/encoding combination.

| Launcher | Linux checks | Windows checks |
| --- | --- | --- |
| Absent | None | None |
| POSIX | `/bin/sh`, GNU `/usr/bin/env` 9.4; GNU `/bin/pwd` 9.4 for Codex's existing shell-root binding | Unsupported |
| Portable | Node 24.18 or later with `process.execve`, `/bin/sh`, GNU `/usr/bin/env` 9.4 | Node 24.18 or later |

Other platforms remain unsupported for process launchers. A package without a launcher imposes no launcher checks; exact native profile selection still applies independently.

NR1–NR5 specify the no-launcher case, exact POSIX and portable checks, all unsupported combinations and exact Node admission. The [properties](../../spec/PluginSdk/Installer/LauncherRuntime/Properties.lean) and [certificates](../../spec/PluginSdk/Installer/LauncherRuntime/Proofs.lean) pass the exact-type and axiom audit: **282/282 properties checked**. Twenty-six authored vectors and 444 generated requests agree with the Lean oracle and TypeScript. Both readers reject nineteen malformed requests.

The [private installer operation](../../src/installer/runtime/launcher.ts) runs constant probes without loading plugin code. It decodes the Node observation at that boundary, preserves scoped subprocess ownership and the five-second bound, and reports a destination error for unavailable requirements. Node uses the inherited search path; GNU checks retain their absolute paths and C locale.

Three pure tests pass before I/O edits. A live Linux test then checks both portable formats and existing Claude/Codex POSIX formats against actual Node and GNU tools. The two compatibility regression tests also pass. Typechecking, lint and Effect diagnostics pass for the affected entries; Effect reports zero errors, warnings or messages. Production SDK emission passes into a private output directory. An initial oracle build selected the older root toolchain; the successful build uses the spec's pinned Lean 4.34.1. Failed checks are retained separately.

Evidence is under `.audit/probes/launcher-runtime-admission/`. Its pure checkpoint, `pure-acceptance.json`, has SHA-256 `dddd2605b40b13d47a52c6f7cee72209f9eb07bb32c291db527a44aa8575c63d`. The preceding [SDK-built native package gate](portable-stdio-native-acceptance.md) retains its exact runtime and client-session evidence. The packaged runtime bytes are unchanged here.

Windows execution of this new preflight and SDK install/update/replay/remove remain the next private-candidate gate. This record does not enable portable profiles, qualify Codex project scope or establish another client/platform contract.
