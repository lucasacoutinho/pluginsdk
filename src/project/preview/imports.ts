import { Effect, FileSystem, Option, Schema } from "effect"
import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"
import { ProfileIdentity } from "../../../contracts/Compatibility.ts"
import { Directory } from "../../../contracts/Plugin.ts"
import { ProjectError, type ProjectDefinition } from "../../../contracts/Project.ts"
import type { Provider } from "../../../contracts/PreviewRouting.ts"
import type { ResolvedClient } from "./clients.ts"

const sameProfile = Schema.toEquivalence(ProfileIdentity)
const providerProfile = Schema.decodeSync(ProfileIdentity)({
  host: "claude_code", platform: "win32", version: "2.1.304", scope: "user", revision: "claude-local-marketplace:1"
})
const consumerProfile = Schema.decodeSync(ProfileIdentity)({
  host: "cursor", platform: "win32", version: "3.26.16+8fcb8ace5c73fa31f2e2707fd6783160e4ed3e40", scope: "user", revision: "cursor-local-directory:1"
})
const ImportPreference = Schema.Struct({ value: Schema.Literals(["true", "false"]) })

export const readImportPreference = Effect.fn("Project.readCursorImportPreference")(function*(storage: Directory) {
  const fs = yield* FileSystem.FileSystem
  const unavailable = () => new ProjectError({ detail: "Cannot inspect Cursor's third-party import preference" })
  const database = join(storage, "User", "globalStorage", "state.vscdb")
  const exists = yield* fs.exists(database).pipe(Effect.mapError(unavailable))
  if (!exists) return true
  const { DatabaseSync } = yield* Effect.tryPromise({ try: () => import("node:sqlite"), catch: unavailable })
  return yield* Effect.scoped(Effect.gen(function*() {
    const connection = yield* Effect.acquireRelease(
      Effect.try({ try: () => new DatabaseSync(database, { readOnly: true, timeout: 1000 }), catch: unavailable }),
      (connection) => Effect.sync(() => connection.close())
    )
    const row = yield* Effect.try({
      try: () => connection.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursor/thirdPartyExtensibilityEnabled"),
      catch: unavailable
    })
    if (row === undefined) return true
    const preference = yield* Schema.decodeUnknownEffect(ImportPreference, { onExcessProperty: "error" })(row).pipe(Effect.mapError(unavailable))
    return preference.value === "true"
  }))
})

export const previewProvider = Effect.fn("Project.previewProvider")(function*(
  definition: ProjectDefinition,
  clients: ReadonlyArray<ResolvedClient>
): Effect.fn.Return<Provider, ProjectError, FileSystem.FileSystem> {
  const claude = clients.find(({ client }) => client === "claude_code")
  const cursor = clients.find(({ client }) => client === "cursor")
  if (claude === undefined || cursor === undefined) return "none"
  const fs = yield* FileSystem.FileSystem
  const unavailable = () => new ProjectError({ detail: "Cannot establish which Claude plugin source Cursor imports" })
  const imported = yield* fs.stat(join(homedir(), ".claude")).pipe(
    Effect.asSome,
    Effect.catchTag("PlatformError", (error) => error.reason._tag === "NotFound" ? Effect.succeedNone : Effect.fail(unavailable()))
  )
  if (Option.isNone(imported)) return "none"
  const provider = yield* fs.stat(claude.home).pipe(Effect.mapError(unavailable))
  if (Option.isNone(provider.ino) || Option.isNone(imported.value.ino)) return yield* unavailable()
  if (provider.dev !== imported.value.dev || provider.ino.value !== imported.value.ino.value) return "none"
  if (process.env.VSCODE_PORTABLE !== undefined) return yield* new ProjectError({ detail: "Shared Cursor preview requires the qualified default desktop profile; use an explicit --target for a portable profile" })
  const appData = yield* Schema.decodeUnknownEffect(Directory)(process.env.APPDATA).pipe(Effect.mapError(unavailable))
  if (!isAbsolute(appData)) return yield* unavailable()
  if (!(yield* readImportPreference(Directory.make(join(appData, "Cursor"))))) return "none"
  return sameProfile(claude.profile, providerProfile) && sameProfile(cursor.profile, consumerProfile) &&
    Object.keys(definition.mcp).length === 0 && Object.keys(definition.hooks ?? {}).length === 0 && Object.keys(definition.agents ?? {}).length === 0
    ? "qualified" : "unqualified"
})
