import { it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { Directory } from "../contracts/Plugin.ts"
import { checkLauncherRuntime } from "../src/installer/runtime/launcher.ts"

it.live.runIf(process.platform === "linux")("admits the actual Node and GNU tools for portable and existing Linux launchers", () => Effect.gen(function*() {
  const home = Directory.make("/tmp")
  yield* checkLauncherRuntime({ type: "user", host: "claude_code", home }, "claude_code_portable_v1")
  yield* checkLauncherRuntime({ type: "user", host: "codex", home }, "codex_plugin_portable_v1")
  yield* checkLauncherRuntime({ type: "user", host: "claude_code", home }, "claude_code_portable_v2")
  yield* checkLauncherRuntime({ type: "user", host: "codex", home }, "codex_plugin_portable_v2")
  yield* checkLauncherRuntime({ type: "user", host: "codex", home }, "codex_plugin_v1")
  yield* checkLauncherRuntime({ type: "user", host: "claude_code", home }, "claude_code_v3")
}).pipe(Effect.provide(NodeServices.layer)))
