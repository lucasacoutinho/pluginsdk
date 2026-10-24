import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ChildProcessSpawner } from "effect/process"
import { Effect, FileSystem, Layer, Schema } from "effect"
import { join } from "node:path"
import { BuildRequest, Compiler } from "../contracts/Compiler.ts"
import { Destination } from "../contracts/Installer.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { validateBundle } from "../src/compiler/package/native.ts"
import { checkLauncherRuntime } from "../src/installer/runtime/launcher.ts"

const CompilerTest = Layer.provideMerge(CompilerLive, NodeServices.layer)

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

const request = (root: string, mcp: unknown, assets: ReadonlyArray<string> = []) => decode(BuildRequest, {
  root,
  format: "claude_code",
  plugin: {
    id: "launcher-runtime-io",
    version: "1.0.0",
    description: "Validated process runtime fixture",
    skills: [],
    assets,
    mcp
  }
})

it.live.runIf(process.platform === "linux")("probes only the current runtime needs of validated portable processes", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "pluginsdk-launcher-runtime-" })
    yield* fs.makeDirectory(join(root, "mcp"), { recursive: true })
    yield* fs.writeFileString(join(root, "mcp", "server.mjs"), "export {}\n")

    const compiler = yield* Compiler
    const remoteBundle = yield* compiler.build(request(root, {
      status: { url: "https://status.example.test/mcp", headers: {} }
    }))
    const processBundle = yield* compiler.build(request(root, {
      local: { type: "stdio", command: "node", args: [{ file: "mcp/server.mjs" }] }
    }, ["mcp"]))
    const remoteMetadata = validateBundle(remoteBundle)
    const processMetadata = validateBundle(processBundle)
    expect(remoteMetadata.processes).toEqual([])
    expect(processMetadata.processes.length).toBeGreaterThan(0)
    expect(processMetadata.requirements).toEqual(["stdio"])

    const destination = decode(Destination, { type: "user", host: "claude_code", home: root })
    const noProbeSpawner = ChildProcessSpawner.make(() => Effect.die(new Error("No process probes are needed")))
    yield* checkLauncherRuntime(destination, remoteMetadata.processes).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, noProbeSpawner)
    )

    yield* checkLauncherRuntime(destination, processMetadata.processes)
  }).pipe(Effect.provide(CompilerTest))
)
