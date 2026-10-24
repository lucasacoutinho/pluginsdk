import { Effect, Layer } from "effect"
import { InstallerEngineLive } from "./lifecycle/engine.ts"
import { InstallerWorkerLive } from "./execution/client.ts"

export const InstallerLive = Layer.unwrap(Effect.sync(() => process.platform === "win32" ? InstallerWorkerLive : InstallerEngineLive))
