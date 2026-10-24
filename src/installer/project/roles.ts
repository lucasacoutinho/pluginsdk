import { lstat, readdir } from "node:fs/promises"
import { extname, isAbsolute, join, resolve } from "node:path"
import { Effect, Schema } from "effect"
import { RoleName } from "../../../contracts/Agents.ts"
import { ConfigFile, type Activation, type AuthorityResult, type Observation } from "../../../contracts/ProjectActivation.ts"
import { compareUtf8 } from "../../internal/paths.ts"
import { reviewProjectRoleAuthority } from "./activation-model.ts"
import { NativeRoleDeclaration, type ConfigRead } from "../hosts/codex-config.ts"
import { absolutePath, configFolder, parseRoleIdentity, physicalDirectory, roleDeclarations, roleLimits } from "./codex-role-sources.ts"
import { InspectionUnavailable, inspectIO } from "../hosts/state.ts"
import type { ProjectTarget } from "./layout.ts"
import { roleStorage } from "../companions/storage.ts"

const sameDeclaration = Schema.toEquivalence(NativeRoleDeclaration)

const inspectMetadata = <A>(operation: () => A) => Effect.try({
  try: operation,
  catch: (cause) => new InspectionUnavailable({ cause })
})

export const inspectProjectRoles = Effect.fn("Installer.inspectProjectRoles")(function*(
  target: ProjectTarget,
  config: ConfigRead,
  previous: Activation | null,
  desired: Activation | null
): Effect.fn.Return<AuthorityResult, InspectionUnavailable> {
  const before = previous?.agents ?? []
  const after = desired?.agents ?? []
  if (before.length + after.length === 0) return { type: "ready" }
  if (config.layers.length > roleLimits.files) return yield* new InspectionUnavailable({ cause: new Error("Codex config layers exceed the inventory limit") })
  const observed: Observation[] = []
  const storage = roleStorage(target.key, roleLimits.bytes)
  const readIdentity = Effect.fnUntraced(function*(path: string, hint?: string) {
    const file = yield* storage.read(path).pipe(Effect.mapError((cause) => new InspectionUnavailable({ cause })))
    const name = file.bytes === null ? null : parseRoleIdentity(file.bytes, hint)
    if (name === null) return yield* new InspectionUnavailable({ cause: new Error("Codex role identity is unavailable") })
    return name
  })
  let visited = 0
  const count = (): void => {
    visited += 1
    if (visited > roleLimits.files) throw new Error("Codex role inventory exceeds the scan limit")
  }
  const scanned = new Set<string>()
  for (const layer of config.layers) {
    if (layer.disabledReason !== undefined) continue
    const folder = yield* inspectMetadata(() => configFolder(layer.name))
    const managedLayer = layer.name.type === "project" && layer.name.dotCodexFolder === join(target.destination.root, ".codex")
    const declaredFiles = new Set<string>()
    const declarations = yield* inspectMetadata(() => roleDeclarations(layer.config))
    for (const [key, declaration] of declarations) {
      yield* inspectMetadata(count)
      const declaredName = yield* inspectMetadata(() => RoleName.make(key))
      const rawPath = declaration.config_file
      let configFile: ConfigFile | null = null
      if (rawPath !== undefined && rawPath !== null) {
        configFile = yield* inspectMetadata(() => {
          if (typeof rawPath !== "string" || rawPath.length === 0) {
            throw new Error("Codex config_file has no unambiguous absolute location")
          }
          if (isAbsolute(rawPath)) return ConfigFile.make(absolutePath(rawPath))
          if (folder === null) throw new Error("Relative Codex config_file has no defining directory")
          return ConfigFile.make(resolve(folder, rawPath))
        })
        declaredFiles.add(configFile)
      }
      const name = configFile === null ? declaredName : yield* readIdentity(configFile, declaredName)
      const managed = managedLayer && Object.keys(declaration).length === 1 &&
        before.some((binding) => binding.name === declaredName && binding.configFile === configFile)
      observed.push({ type: "declared", source: managed ? "managed" : "foreign", declaredName, name, configFile })
    }
    if (folder === null) continue
    const agents = join(folder, "agents")
    if (scanned.has(agents)) continue
    scanned.add(agents)
    if (!(yield* inspectIO(() => physicalDirectory(agents)))) continue
    const pending = [agents]
    while (pending.length > 0) {
      const directory = pending.pop()
      if (directory === undefined) continue
      yield* inspectMetadata(count)
      if (!(yield* inspectIO(() => physicalDirectory(directory)))) return yield* new InspectionUnavailable({ cause: new Error("Codex role directory disappeared during inspection") })
      const children = (yield* inspectIO(() => readdir(directory))).toSorted(compareUtf8)
      for (const child of children) {
        const path = join(directory, child)
        yield* inspectMetadata(count)
        const info = yield* inspectIO(() => lstat(path))
        if (info.isSymbolicLink()) return yield* new InspectionUnavailable({ cause: new Error("Codex role discovery cannot follow symbolic links") })
        if (info.isDirectory()) {
          pending.push(path)
          continue
        }
        if (!info.isFile()) return yield* new InspectionUnavailable({ cause: new Error("Codex role discovery encountered a special file") })
        if (extname(path) !== ".toml" || declaredFiles.has(path)) continue
        const name = yield* readIdentity(path)
        observed.push({ type: "discovered", name, path: ConfigFile.make(path) })
      }
    }
  }
  const result = reviewProjectRoleAuthority({ previous: before, desired: after, observed })
  if (result.type === "blocked") return result
  if (visited - before.length + after.length > roleLimits.files) {
    return yield* new InspectionUnavailable({ cause: new Error("Proposed project roles exceed the native inventory capacity") })
  }
  const effective = new Map(yield* inspectMetadata(() => roleDeclarations(config.config)))
  for (const binding of before) {
    const declaration = yield* Schema.decodeUnknownEffect(NativeRoleDeclaration)(effective.get(binding.name), { onExcessProperty: "error" }).pipe(
      Effect.mapError((cause) => new InspectionUnavailable({ cause }))
    )
    if (!sameDeclaration(declaration, { config_file: binding.configFile, description: null, nickname_candidates: null })) {
      return yield* new InspectionUnavailable({ cause: new Error("Effective Codex role declaration differs from the owned project activation") })
    }
  }
  return result
})
