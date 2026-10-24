import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { InstallerEngineLive } from "../lifecycle/engine.ts"
import { installerWorker } from "./server.ts"

NodeRuntime.runMain(installerWorker.pipe(
  Effect.provide(InstallerEngineLive.pipe(Layer.provide(NodeServices.layer))),
  Effect.tap((code) => Effect.sync(() => { process.exitCode = code }))
), { disableErrorReporting: true })
