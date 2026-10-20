import { NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { DevTools } from "effect/devtools"
import { CompilerLive } from "./compiler/index.ts"
import { InstallerLive } from "./installer/index.ts"

export { CompilerLive, InstallerLive }

export const PluginSdkLive = Layer.merge(CompilerLive, InstallerLive).pipe(Layer.provide(NodeServices.layer))

export const devtools = (url?: string) => DevTools.layer(url)
