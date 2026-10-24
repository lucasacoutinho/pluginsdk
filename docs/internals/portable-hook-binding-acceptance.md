# Portable hook binding premises

The private binding experiment passed on Linux and Windows with the existing portable process runtime. This selects Claude's direct executable-and-arguments form and a constant Codex shell command for the next contract. It does not qualify a production hook format or complete SDK lifecycle.

The author still supplies one plugin definition and hook program. The proposed compiler binding adds no wrapper or operating-system choice to that definition.

## Observed behavior

The Windows fixture used Node 24.18.0 and Claude Code 2.1.304. Claude validated the fixture and ran its real `Setup` hook through `command: "node"` and a separate argument vector. Codex 0.163.0 was version-checked; the cmd and Windows PowerShell controls reproduced its command-string launch boundary with synthetic `SessionStart` input. These controls did not execute a native Codex hook event or its trust workflow.

All three Windows backends received the descriptor's exact arguments and literal environment value, retained UTF-8 stdin, ran from the packaged working directory and produced the expected output. The package path contained spaces, Unicode and shell metacharacters. The evaluation sentinel remained absent. The three Linux controls passed the same data checks through direct execution and the constant shell command.

The runtime retained SHA-256 `9d1c4f65bd1329f9a9f9dd3679a74ce2b10478cf3182310e71b8ec655d91e0c2`. All 12 fixture files remained byte-identical after each Windows attempt. None of the 170 tracked product inputs changed.

## Failed attempt and correction

The first isolated environment omitted `PATHEXT`. Claude and cmd passed; Windows PowerShell could not resolve `node.exe`. The failed run is retained, including its actual exit code and 33 observed child identities. It supplies no passing PowerShell evidence.

The corrected attempt added `.COM;.EXE;.BAT;.CMD` to the private environment and used a fresh owned stage. The runtime, fixture, argument encoding and ownership checks remained unchanged. All six commands completed successfully, including all three binding cases. The main-thread validator checked backend values against the packaged process descriptors and joined their process identities to retained birth records.

Both attempts reached an empty Windows Job and normal root-handle closure. Every one of their 68 observed child identities reached terminal observation and handle close. The two owned stages were removed after sealed validation and a matching final inventory; cleanup removed 10,979 files. The known dependency source and protected roots were preserved.

## Evidence and remaining work

- [Linux control](../../.audit/probes/windows-plugin-features/linux-acceptance.json)
- [Failed attempt validation](../../.audit/probes/windows-plugin-features/windows/main-validation.json)
- [Corrected attempt validation](../../.audit/probes/windows-plugin-features/windows-v2/main-validation.json)
- [Sealed validation before cleanup](../../.audit/probes/windows-plugin-features/native-validation-checkpoint.json)
- [First stage cleanup](../../.audit/probes/windows-plugin-features/windows/cleanup.json) and [corrected stage cleanup](../../.audit/probes/windows-plugin-features/windows-v2/cleanup.json)

The next step is the portable hook schema, Lean properties and proofs, and TypeScript oracle conformance. Compiler integration follows that gate. Production qualification still requires real `SessionStart` context, prompt blocking before a provider request, Codex hook trust, both clients' complete install/update/replay/remove lifecycles and process shutdown. Windows Codex agent companions require a separate storage contract and native filesystem evidence. macOS remains deferred because no host is available.
