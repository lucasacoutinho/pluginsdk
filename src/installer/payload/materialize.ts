import { join } from "node:path"
import { Effect } from "effect"
import type { PackageFile } from "../../../contracts/Compiler.ts"
import { StateUnavailable, type InstallationKey } from "../../../contracts/Installer.ts"
import { WindowsPayloadWriter, WindowsPayloadWriterLive } from "../../internal/windows-files/writer.ts"
import { comparePayload, readPayload } from "./read.ts"
import { ensureDirectory, stageFile } from "../storage.ts"

export const materializePayload = Effect.fn("Installer.materializePayload")(function*(key: InstallationKey, root: string, files: ReadonlyArray<PackageFile>) {
  const unavailable = (cause: unknown) => new StateUnavailable({ key, cause })
  const observed = yield* process.platform === "win32"
    ? Effect.flatMap(WindowsPayloadWriter, (writer) => writer.write(root, files)).pipe(
      Effect.provide(WindowsPayloadWriterLive),
      Effect.mapError(unavailable),
      Effect.flatMap((captured) => Effect.try({ try: () => comparePayload(captured, files), catch: unavailable }))
    )
    : Effect.gen(function*() {
      yield* ensureDirectory(key, root)
      for (const file of files) yield* stageFile(key, join(root, file.path), file.content, file.executable)
      return yield* readPayload(root, files).pipe(Effect.mapError(unavailable))
    })
  if (!observed.matches) return yield* unavailable(new Error("Materialized payload does not match the approved bundle"))
})
