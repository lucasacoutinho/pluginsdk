import { lstat, readdir } from "node:fs/promises"
import { dirname, extname, isAbsolute, join, resolve } from "node:path"
import { Effect, Match, Schema } from "effect"
import { AgentName } from "../../../contracts/Plugin.ts"
import { RoleName } from "../../../contracts/Agents.ts"
import type { RoleName as RoleNameType } from "../../../contracts/Agents.ts"
import type { Target } from "../../../contracts/Installer.ts"
import type { CompanionCapture, FileChange, ObservedFile, RoleFile } from "../../../contracts/Companions.ts"
import { RuntimePlatform } from "../../../contracts/Compatibility.ts"
import type { Basis } from "../../../contracts/CompanionFile.ts"
import { PresentSnapshot } from "../../../contracts/ProjectFile.ts"
import { fileDigest } from "../../internal/identity.ts"
import { compareUtf8 } from "../../internal/paths.ts"
import { reviewCompanions } from "./model.ts"
import { admitCompanionFile, observeCompanionFile, reviewCompanionFile } from "./file-policy.ts"
import { InspectionUnavailable, inspectIO } from "../hosts/state.ts"
import { readCodexConfig } from "../hosts/commands.ts"
import { ConfigRead } from "../hosts/codex-config.ts"
import { roleStorage } from "./storage.ts"
import { absolutePath, configFolder, parseRoleIdentity, physicalDirectory, roleDeclarations, roleLimits, sourceLabel } from "../project/codex-role-sources.ts"

export { roleLimits }
const FileKind = Schema.Literals(["absent", "file", "conflict", "unknown", "symlink"])
const ConflictType = Schema.Literals(["declared", "config_file", "discovered", "fixed_path_name_mismatch", "declared_fixed_path"])

type FileKind = typeof FileKind.Type
type ConflictType = typeof ConflictType.Type
const FileState = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({ type: Schema.Literal("unavailable"), kind: Schema.Literals(["unknown", "symlink"]) }),
  Schema.Struct({ type: Schema.Literal("file"), file: PresentSnapshot, name: Schema.NullOr(RoleName) })
]).pipe(Schema.toTaggedUnion("type"))
type FileState = typeof FileState.Type
type ConflictFact = {
  readonly type: ConflictType
  readonly name: string
  readonly origin: string
  readonly path: string
  readonly declaration?: string
}
type NameInventory = {
  readonly fixedPath: string
  readonly conflicts: ConflictFact[]
  current: FileState
}

const isCodexUserTarget = (target: Target): boolean =>
  target.destination.host === "codex" && target.destination.type === "user" &&
  isAbsolute(target.destination.home) && resolve(target.destination.home) === target.destination.home

const isMissing = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT"

const readFixedRole = Effect.fnUntraced(function*(target: Target, path: string): Effect.fn.Return<FileState> {
  const parentExists = yield* inspectIO(() => physicalDirectory(dirname(path))).pipe(
    Effect.catchTag("InspectionUnavailable", () => Effect.succeed(null))
  )
  if (parentExists === null) return { type: "unavailable", kind: "unknown" }
  if (!parentExists) return { type: "absent" }
  const info = yield* inspectIO(() => lstat(path)).pipe(
    Effect.catchTag("InspectionUnavailable", ({ cause }) => isMissing(cause)
      ? Effect.succeed("absent" as const)
      : Effect.succeed("unknown" as const))
  )
  if (info === "absent") return { type: "absent" }
  if (info === "unknown") return { type: "unavailable", kind: "unknown" }
  if (info.isSymbolicLink()) return { type: "unavailable", kind: "symlink" }
  if (!info.isFile()) return { type: "unavailable", kind: "unknown" }
  const file = yield* roleStorage(target.key, roleLimits.bytes).read(path).pipe(
    Effect.catchTag("StateUnavailable", () => Effect.succeed(null))
  )
  if (file === null) return { type: "unavailable", kind: "unknown" }
  if (file.bytes === null) return { type: "absent" }
  return { type: "file", file, name: parseRoleIdentity(file.bytes) }
})

const sortedUniqueNames = (names: ReadonlyArray<RoleNameType>): RoleNameType[] =>
  [...new Set(names)].toSorted(compareUtf8)

const declarationOrigin = (origins: Schema.JsonObject, key: string, fallback: string): string => {
  const value = Reflect.get(origins, `agents.${key}`)
  return typeof value === "string" ? value : fallback
}

const addConflict = (
  entries: Map<string, NameInventory>,
  name: string,
  fact: ConflictFact
): void => {
  const entry = entries.get(name)
  if (entry !== undefined) entry.conflicts.push(fact)
}

const fixedRoleName = (state: FileState): RoleNameType | null => Match.value(state).pipe(
  Match.discriminatorsExhaustive("type")({
    absent: () => null,
    unavailable: () => null,
    file: ({ name }) => name
  })
)

const fileKind = (state: FileState, requiredName: RoleNameType): FileKind => Match.value(state).pipe(
  Match.withReturnType<FileKind>(),
  Match.discriminatorsExhaustive("type")({
    absent: () => "absent",
    unavailable: ({ kind }) => kind,
    file: ({ name }) => {
      if (name === null) return "unknown"
      return name === requiredName ? "file" : "conflict"
    }
  })
)

const physicalFile = (state: FileState): PresentSnapshot | null => Match.value(state).pipe(
  Match.discriminatorsExhaustive("type")({
    absent: () => null,
    unavailable: () => null,
    file: ({ file }) => file
  })
)

const jsonFact = (entry: NameInventory, name: RoleNameType): Schema.JsonObject => {
  const conflicts = entry.conflicts.toSorted((left, right) => {
    const nameOrder = compareUtf8(left.name, right.name)
    if (nameOrder !== 0) return nameOrder
    const pathOrder = compareUtf8(left.path, right.path)
    if (pathOrder !== 0) return pathOrder
    const originOrder = compareUtf8(left.origin, right.origin)
    if (originOrder !== 0) return originOrder
    return compareUtf8(left.type, right.type)
  }).map((conflict) => ({
    type: conflict.type,
    name: conflict.name,
    origin: conflict.origin,
    path: conflict.path,
    ...(conflict.declaration === undefined ? {} : { declaration: conflict.declaration })
  }))
  return {
    path: entry.fixedPath,
    kind: fileKind(entry.current, name),
    ...Match.value(entry.current).pipe(Match.discriminatorsExhaustive("type")({
      absent: () => ({}),
      unavailable: () => ({}),
      file: ({ file, name: declaredName }) => ({
        ...Match.value(file.observed).pipe(Match.discriminatorsExhaustive("type")({
          file: ({ digest, mode }) => ({ digest, mode }),
          windows_file: ({ digest, attributes, security, streams }) => ({ digest, attributes, security, streams })
        })),
        ...(declaredName === null ? {} : { declaredName })
      })
    })),
    conflicts
  }
}

const observedFile = (entry: NameInventory, name: RoleNameType): ObservedFile["observed"] => {
  if (entry.conflicts.length > 0) return { type: "conflict" }
  return Match.value(entry.current).pipe(Match.withReturnType<ObservedFile["observed"]>(), Match.discriminatorsExhaustive("type")({
    absent: () => ({ type: "absent" }),
    unavailable: () => ({ type: "unknown" }),
    file: ({ file, name: declaredName }) => {
      if (declaredName === null) return { type: "unknown" }
      if (declaredName !== name) return { type: "conflict" }
      return observeCompanionFile({ platform: RuntimePlatform.make(process.platform), observed: file.observed })
    }
  }))
}

const inspectMetadata = <A>(operation: () => A) => Effect.try({
  try: operation,
  catch: (cause) => new InspectionUnavailable({ cause })
})

const inspectInventory = Effect.fn("Installer.inspectRoleInventory")(function*(
  target: Target,
  names: ReadonlyArray<RoleNameType>,
  readResult: unknown
) {
  if (!isCodexUserTarget(target)) return yield* new InspectionUnavailable({ cause: new Error("Codex companion roles require a canonical user destination") })
  const response = yield* Schema.decodeUnknownEffect(ConfigRead)(readResult, { onExcessProperty: "ignore" }).pipe(
    Effect.mapError((cause) => new InspectionUnavailable({ cause }))
  )
  if (response.layers.length > roleLimits.files) return yield* new InspectionUnavailable({ cause: new Error("Codex config layers exceed the inventory limit") })
  const required = sortedUniqueNames(names)
  if (required.length > roleLimits.files) return yield* new InspectionUnavailable({ cause: new Error("Requested Codex roles exceed the inventory limit") })
  const entries = new Map<string, NameInventory>()
  const expectedByPath = new Map<string, string>()
  const fixedStates = new Map<string, FileState>()
  const readFixedOnce = Effect.fnUntraced(function*(path: string) {
    const cached = fixedStates.get(path)
    if (cached !== undefined) return cached
    const current = yield* readFixedRole(target, path)
    fixedStates.set(path, current)
    return current
  })
  const storage = roleStorage(target.key, roleLimits.bytes)
  const readPresent = Effect.fnUntraced(function*(path: string) {
    const snapshot = yield* storage.read(path).pipe(Effect.mapError((cause) => new InspectionUnavailable({ cause })))
    if (snapshot.bytes === null) return yield* new InspectionUnavailable({ cause: new Error("Codex role disappeared during inspection") })
    return snapshot
  })
  for (const name of required) {
    const fixedPath = yield* inspectMetadata(() => roleFilePath(target, name))
    entries.set(name, { fixedPath, conflicts: [], current: { type: "absent" } })
    expectedByPath.set(fixedPath, name)
  }

  let visited = 0
  const visitedPaths = new Set<string>()
  const countPath = (path: string): void => {
    if (visitedPaths.has(path)) return
    visitedPaths.add(path)
    visited += 1
    if (visited > roleLimits.files) throw new Error("Codex role inventory exceeds the scan limit")
  }
  const declarationPaths = new Set<string>()
  const referencedRoleNames = new Map<string, string>()
  const scannedAgentsFolders = new Set<string>()
  let declarationCount = 0
  for (const layer of response.layers) {
    if (layer.disabledReason !== undefined) continue
    const source = layer.name
    const folder = yield* inspectMetadata(() => configFolder(source))
    const originBase = sourceLabel(source)
    for (const [declaredName, declaration] of yield* inspectMetadata(() => roleDeclarations(layer.config))) {
      declarationCount += 1
      if (declarationCount > roleLimits.files) return yield* new InspectionUnavailable({ cause: new Error("Codex role declarations exceed the inventory limit") })
      const configPathValue = Reflect.get(declaration, "config_file")
      let configPath: string | null = null
      if (configPathValue !== undefined && configPathValue !== null) {
        if (typeof configPathValue !== "string" || configPathValue.length === 0) return yield* new InspectionUnavailable({ cause: new Error("Unsupported Codex config_file value") })
        configPath = yield* inspectMetadata(() => absolutePath(configPathValue))
        declarationPaths.add(configPath)
      }
      const origin = declarationOrigin(response.origins, declaredName, `${originBase}:agents.${declaredName}`)
      if (entries.has(declaredName)) {
        addConflict(entries, declaredName, {
          type: "declared",
          name: declaredName,
          origin,
          path: configPath ?? originBase,
          declaration: declaredName
        })
      }
      if (configPath !== null) {
        yield* inspectMetadata(() => countPath(configPath))
        let fileDefinedName = referencedRoleNames.get(configPath)
        if (fileDefinedName === undefined) {
          const referenced = yield* readPresent(configPath)
          fileDefinedName = parseRoleIdentity(referenced.bytes, declaredName) ?? undefined
          if (fileDefinedName === undefined) return yield* new InspectionUnavailable({ cause: new Error("Referenced Codex role file has no valid name") })
          referencedRoleNames.set(configPath, fileDefinedName)
        }
        if (entries.has(fileDefinedName)) {
          addConflict(entries, fileDefinedName, {
            type: "config_file",
            name: fileDefinedName,
            origin,
            path: configPath,
            declaration: declaredName
          })
        }
      }
    }
    if (folder === null) continue
    const agentsFolder = join(folder, "agents")
    if (scannedAgentsFolders.has(agentsFolder)) continue
    scannedAgentsFolders.add(agentsFolder)
    if (!(yield* inspectIO(() => physicalDirectory(agentsFolder)))) continue
    const pending = [agentsFolder]
    while (pending.length > 0) {
      const directory = pending.pop()
      if (directory === undefined) continue
      yield* inspectMetadata(() => countPath(directory))
      if (!(yield* inspectIO(() => physicalDirectory(directory)))) return yield* new InspectionUnavailable({ cause: new Error("Codex role directory disappeared during inspection") })
      const children = (yield* inspectIO(() => readdir(directory))).toSorted(compareUtf8)
      for (const child of children) {
        const path = join(directory, child)
        yield* inspectMetadata(() => countPath(path))
        const fixedOwner = expectedByPath.get(path)
        if (fixedOwner !== undefined) {
          const fixed = entries.get(fixedOwner)
          if (fixed === undefined) return yield* new InspectionUnavailable({ cause: new Error("Fixed role inventory entry is unavailable") })
          fixed.current = yield* readFixedOnce(path)
          const declaredName = fixedRoleName(fixed.current)
          if (declaredName !== null && declaredName !== fixedOwner && entries.has(declaredName)) {
            addConflict(entries, declaredName, {
              type: "discovered",
              name: declaredName,
              origin: originBase + ":agents",
              path
            })
          }
          continue
        }
        const info = yield* inspectIO(() => lstat(path))
        if (info.isSymbolicLink()) {
          return yield* new InspectionUnavailable({ cause: new Error("Codex role inventory cannot follow symbolic links") })
        }
        if (info.isDirectory()) {
          pending.push(path)
          continue
        }
        if (!info.isFile()) return yield* new InspectionUnavailable({ cause: new Error("Codex role inventory encountered a special file") })
        if (extname(path) !== ".toml") continue
        const physical = yield* readPresent(path)
        const roleName = parseRoleIdentity(physical.bytes)
        if (roleName === null) return yield* new InspectionUnavailable({ cause: new Error("Discovered Codex role file has no valid name") })
        if (entries.has(roleName)) {
          addConflict(entries, roleName, {
            type: "discovered",
            name: roleName,
            origin: `${originBase}:agents`,
            path
          })
        }
      }
    }
  }

  for (const [name, entry] of entries) {
    entry.current = yield* readFixedOnce(entry.fixedPath)
    const declaredName = fixedRoleName(entry.current)
    if (declaredName !== null && declaredName !== name) {
      addConflict(entries, name, {
        type: "fixed_path_name_mismatch",
        name: declaredName,
        origin: "codexUserAgents",
        path: entry.fixedPath
      })
    }
  }

  for (const path of declarationPaths) {
    const owner = expectedByPath.get(path)
    if (owner !== undefined && entries.has(owner)) {
      addConflict(entries, owner, {
        type: "declared_fixed_path",
        name: owner,
        origin: "codexConfig",
        path,
        declaration: path
      })
    }
  }

  const observed: ObservedFile[] = []
  const files: RoleFile[] = []
  const facts: Array<readonly [string, Schema.JsonObject]> = []
  const bases = new Map<RoleNameType, Basis>()
  for (const name of required) {
    const entry = entries.get(name)
    if (entry === undefined) return yield* new InspectionUnavailable({ cause: new Error("Requested role inventory entry is unavailable") })
    const file = physicalFile(entry.current)
    if (file !== null) files.push({ name, content: file.bytes })
    const observation = observedFile(entry, name)
    observed.push({ name, observed: observation })
    if (observation.type === "absent") bases.set(name, { type: "absent" })
    if (observation.type === "file" && file !== null) {
      Match.value(admitCompanionFile({ platform: RuntimePlatform.make(process.platform), observed: file.observed })).pipe(
        Match.discriminatorsExhaustive("type")({
          blocked: () => undefined,
          ready: ({ basis }) => { bases.set(name, basis) }
        })
      )
    }
    facts.push([name, jsonFact(entry, name)])
  }
  return {
    observed,
    files,
    bases,
    facts: Object.fromEntries(facts)
  }
})

export function roleFilePath(target: Target, name: RoleNameType): string {
  if (!isCodexUserTarget(target)) throw new Error("Codex companion roles require a canonical user destination")
  const prefix = `${target.plugin}:`
  if (!name.startsWith(prefix)) throw new Error("Role identity must be qualified by the target plugin")
  const agent = AgentName.make(name.slice(prefix.length))
  return join(target.destination.home, "agents", `psdk_${target.plugin}_${agent}.toml`)
}

export const inspectRoles = Effect.fnUntraced(function*(
  target: Target,
  names: ReadonlyArray<RoleNameType>,
  inExecution = false
) {
  if (!isCodexUserTarget(target)) return yield* new InspectionUnavailable({ cause: new Error("Codex companion roles require a canonical user destination") })
  if (names.length === 0) {
    const facts: Schema.JsonObject = {}
    return { observed: [], files: [], bases: new Map<RoleNameType, Basis>(), facts }
  }
  const readResult = yield* readCodexConfig(target.destination, inExecution)
  return yield* inspectInventory(target, names, readResult)
})

const capturedFile = (files: ReadonlyArray<RoleFile>, name: RoleNameType): RoleFile | null =>
  files.find((file) => file.name === name) ?? null

const applyChange = Effect.fnUntraced(function*(target: Target, change: FileChange, capture: CompanionCapture, basis: Basis) {
  const path = yield* inspectMetadata(() => roleFilePath(target, change.name))
  const storage = roleStorage(target.key, roleLimits.bytes)
  return yield* Match.value(change).pipe(Match.discriminatorsExhaustive("type")({
    create: ({ name, after }) => Effect.gen(function*() {
      const desired = capturedFile(capture.desired, name)
      if (desired === null || fileDigest(desired.content) !== after || desired.content.byteLength > roleLimits.bytes) {
        return yield* new InspectionUnavailable({ cause: new Error("Reviewed create bytes are unavailable") })
      }
      if (basis.type !== "absent") return yield* new InspectionUnavailable({ cause: new Error("Reviewed create basis is not absent") })
      yield* storage.write(path, basis, desired.content)
    }),
    replace: ({ name, before, after }) => Effect.gen(function*() {
      const previous = capturedFile(capture.previous, name)
      const desired = capturedFile(capture.desired, name)
      if (
        previous === null || desired === null || fileDigest(previous.content) !== before ||
        fileDigest(desired.content) !== after || desired.content.byteLength > roleLimits.bytes
      ) return yield* new InspectionUnavailable({ cause: new Error("Reviewed replacement bytes are unavailable") })
      if (basis.type === "absent" || basis.digest !== before) return yield* new InspectionUnavailable({ cause: new Error("Reviewed replacement basis differs") })
      yield* storage.write(path, basis, desired.content)
    }),
    remove: ({ before }) => Effect.gen(function*() {
      if (basis.type === "absent" || basis.digest !== before) return yield* new InspectionUnavailable({ cause: new Error("Reviewed removal basis differs") })
      yield* storage.remove(path, basis)
    }),
    keep: ({ digest }) => Effect.gen(function*() {
      if (basis.type === "absent" || basis.digest !== digest) return yield* new InspectionUnavailable({ cause: new Error("Reviewed unchanged role basis differs") })
      const current = yield* storage.read(path)
      yield* Match.value(reviewCompanionFile({
        current: { platform: RuntimePlatform.make(process.platform), observed: current.observed },
        reviewed: basis
      })).pipe(Match.discriminatorsExhaustive("type")({
        ready: () => Effect.void,
        blocked: () => Effect.fail(new InspectionUnavailable({ cause: new Error("Owned Codex role changed after review") }))
      }))
    })
  }))
})

export const executeCompanions = Effect.fn("Installer.executeCompanions")(function*(target: Target, capture: CompanionCapture) {
  if (!isCodexUserTarget(target)) return yield* new InspectionUnavailable({ cause: new Error("Codex companion roles require a canonical user destination") })
  if ([...capture.previous, ...capture.desired].some((file) => file.content.byteLength > roleLimits.bytes)) {
    return yield* new InspectionUnavailable({ cause: new Error("Captured Codex role exceeds the inspection limit") })
  }
  const names = sortedUniqueNames([...capture.previous, ...capture.desired].map((file) => file.name))
  if (names.length === 0) return
  const fresh = yield* inspectRoles(target, names, true)
  const previous = capture.previous.map((file) => ({ name: file.name, digest: fileDigest(file.content) }))
  const desired = capture.desired.map((file) => ({ name: file.name, digest: fileDigest(file.content) }))
  const result = reviewCompanions({ previous, desired, observed: fresh.observed })
  const changes = yield* Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
    ready: ({ changes }) => Effect.succeed(changes),
    blocked: () => Effect.fail(new InspectionUnavailable({ cause: new Error("Codex companion transition is blocked by the current inventory") }))
  }))
  for (const change of changes) {
    const basis = fresh.bases.get(change.name)
    if (basis === undefined) return yield* new InspectionUnavailable({ cause: new Error("Reviewed role metadata is unavailable") })
    yield* applyChange(target, change, capture, basis)
  }
})
