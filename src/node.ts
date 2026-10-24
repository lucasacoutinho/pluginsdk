import { NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { DevTools } from "effect/devtools"
import { CompilerLive } from "./compiler/index.ts"
import { InstallerLive } from "./installer/index.ts"
import { DistributionLive } from "./distribution/index.ts"

export { CompilerLive, InstallerLive, DistributionLive }
export { ReleaseCatalogLive } from "./catalog/index.ts"

export const PluginSdkLive = Layer.merge(CompilerLive, DistributionLive.pipe(Layer.provideMerge(InstallerLive))).pipe(Layer.provide(NodeServices.layer))

export const devtools = (url?: string) => DevTools.layer(url)
