# Cursor installed-runtime observation

The private `inspectCursorVersion()` operation passes six isolated Windows x64 cases for Cursor 3.26.16, commit `8fcb8ace5c73fa31f2e2707fd6783160e4ed3e40`. It detects a user-local installation without requiring the normal `.cursor` home to exist. Preview consumes this observation; Installer target admission remains open.

| Case | Result | Probe state |
| --- | --- | --- |
| Pinned Cursor, first observation | Exact version and commit | Removed after independent process termination checks |
| Pinned Cursor, second observation | Exact version and commit | Removed after independent process termination checks |
| Missing executable | None | No probe created |
| Present executable with missing CLI | `HostUnavailable` | No probe created |
| Controlled malformed version response | `HostUnavailable` with a schema error | Probe retained |
| Controlled interruption after readiness | Interrupted Effect exit after process closure | Probe retained |

The last two cases use the staged Node executable and explicit CommonJS fixtures to exercise refusal and interruption. The first two use the real pinned Cursor executable and CLI. All twelve pinned client files retain their bytes before and after the run. Every case leaves the normal `.cursor` home absent.

The compiled operation uses the actual NodeServices filesystem and concrete Windows command owner. The native observer checks six birth-specific command-writer handles, including the controlled console-host descendants. All six writers are independently signalled before case completion; the filesystem observer also requires a signalled observation before both successful probe removals. All six additional observer handles close. This handle count covers the independent observers.

The outer job closes with no surviving descendants. Main independently checks the case records, process identities, images, observations, restored environment, failed probe directories and readiness bytes. All 189 runtime files are retained and compared by default-stream bytes. The accepted root is then removed. All sixteen earlier protected roots remain untouched.

The evidence is in `.audit/probes/cursor-discovery/acceptance.json`, SHA-256 `6dc04482d0d29dd41c1c4abaa70330ec2d77e160a442f6e4949a8bfd65e331bb`. Main review corrected an eager access to a successful Effect exit's cause and the controlled fixture's module boundary before native execution. Offline checks cover the compiled exports and actual generated control scripts.

The implementation retains the existing writer-completion policy. Native process, filesystem and FFI behavior remain trust boundaries; formal TypeScript refinement remains open. Production Cursor profile admission, `claude_code_v2` native lifecycle qualification, preview defaults and managed distribution still require their gates. [Private installation and recovery](cursor-sdk-target-acceptance.md) and [SDK-managed IDE discovery](cursor-sdk-ui-acceptance.md) retain their separate evidence.
