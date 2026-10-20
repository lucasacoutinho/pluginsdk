import { Effect, Schema } from "effect"
import { BuildRequest, Compiler } from "../contracts/Compiler.ts"
import { Destination, Installer } from "../contracts/Installer.ts"
import type { PluginDefinition } from "../contracts/Plugin.ts"
import { PluginSdkLive } from "../src/node.ts"

const definition: PluginDefinition = {
  id: "review-kit",
  version: "0.1.0",
  description: "Review code changes against the request and repository contracts.",
  skills: ["skills/review"],
  mcp: {}
};

export const preview = Effect.fn("ReviewKit.preview")(function*(root: string, home: string) {
  const request = yield* Schema.decodeEffect(BuildRequest)({ root, plugin: definition, format: "claude_code_v1" })
  const destination = yield* Schema.decodeEffect(Destination)({ type: "user", host: "claude_code", home })
  const compiler = yield* Compiler
  const installer = yield* Installer
  const bundle = yield* compiler.build(request)
  return yield* installer.plan({ destination, intent: { type: "present", bundle } })
}, Effect.provide(PluginSdkLive))
