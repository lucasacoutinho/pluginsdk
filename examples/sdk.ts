import { Effect, Match, Schema } from "effect"
import { BuildRequest, Compiler, type Format } from "../contracts/Compiler.ts"
import { Destination, Installer } from "../contracts/Installer.ts"
import { PluginSdkLive } from "../src/node.ts"
import definition from "./definition.json" with { type: "json" }

type Client = Extract<Destination["host"], "claude_code" | "codex">

export const preview = Effect.fn("ReviewKit.preview")(function*(root: string, home: string, host: Client = "claude_code") {
  const format = Match.value(host).pipe(
    Match.when("claude_code", (): Format => "claude_code_v2"),
    Match.when("codex", (): Format => "agent_plugins_v2"),
    Match.exhaustive
  )
  const request = yield* Schema.decodeEffect(BuildRequest, { onExcessProperty: "error" })({ root, plugin: definition, format })
  const destination = yield* Schema.decodeEffect(Destination)({ type: "user", host, home })
  const compiler = yield* Compiler
  const installer = yield* Installer
  const bundle = yield* compiler.build(request)
  return yield* installer.plan({ destination, intent: { type: "present", bundle } })
}, Effect.provide(PluginSdkLive))
