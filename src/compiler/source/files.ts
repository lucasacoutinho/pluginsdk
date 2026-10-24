import { Effect, Layer } from "effect"
import type { Directory } from "../../../contracts/Plugin.ts"
import { SourceFiles } from "../../internal/source-files.ts"
import { makeWindowsSourceFiles } from "../../internal/windows-files/source.ts"
import { makeLinuxSourceFiles } from "./linux.ts"

export const SourceFilesLive = (root: Directory) => Layer.effect(SourceFiles,
  Effect.gen(function*() {
    if (process.platform === "win32") return yield* makeWindowsSourceFiles(root)
    return yield* makeLinuxSourceFiles(root)
  })
)
