import { constants } from "node:fs"
import { lstat, open, readdir, realpath } from "node:fs/promises"
import { basename, join } from "node:path"
import { Effect, Exit, Match, Schema } from "effect"
import { PackageFile } from "../../contracts/Compiler.ts"
import { PlanId, ReadyPlan, Target, type Observation } from "../../contracts/Installer.ts"
import { PackagePath } from "../../contracts/Plugin.ts"
import { inside } from "../compiler/capture.ts"
import { validateBundle } from "../compiler/native.ts"
import { bundleDigest, commitment, fileDigest, fingerprint, planId } from "../internal/identity.ts"
import { profiles, supportedHost } from "./host.ts"
import { InspectionUnavailable, inspectIO, nativeState, readInventory, sameJson, type NativeState } from "./native-state.ts"
import { Installed } from "./records.ts"
import { catalogFor } from "./recipe.ts"
import { readRecord } from "./storage.ts"
import { targetPaths } from "./target.ts"

type Facts = Schema.JsonObject
const sameTarget = Schema.toEquivalence(Target)
const sameBundle = Schema.toEquivalence(Installed.fields.bundle)
const sameFiles = Schema.toEquivalence(Schema.Array(PackageFile))
const encodeTarget = Schema.encodeSync(Target)

const readTree = async (root: string): Promise<PackageFile[]> => {
  if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error("Payload root is not a physical directory")
  const files: PackageFile[] = []
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name)
      const logical = prefix === "" ? name : `${prefix}/${name}`
      const info = await lstat(path)
      if (info.isSymbolicLink()) throw new Error("Native payload contains a symbolic link")
      if (info.isDirectory()) { await walk(path, logical); continue }
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        if (!inside(root, await realpath(`/proc/self/fd/${file.fd}`))) throw new Error("Native payload escaped its root")
        const before = await file.stat({ bigint: true })
        if (!before.isFile()) throw new Error("Native payload contains a special file")
        const content = new Uint8Array(await file.readFile())
        const after = await file.stat({ bigint: true })
        if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("Native payload changed during inspection")
        files.push({ path: PackagePath.make(logical), content, executable: (before.mode & 0o111n) !== 0n })
      } finally { await file.close() }
    }
  }
  await walk(root, "")
  return files.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))
}

const verifyCandidate = Effect.fnUntraced(function*(target: Target, native: Extract<NativeState, { type: "candidate" }>) {
  const paths = targetPaths(target)
  const id = Schema.decodeExit(PlanId)(basename(native.source))
  if (Exit.isFailure(id) || native.source !== join(paths.market, "payloads", basename(native.source))) return { identity: null, facts: native.facts }
  const marker = yield* readRecord(target.key, join(paths.markers, `${id.value}.json`), Installed)
  const plan = yield* readRecord(target.key, join(paths.plans, `${id.value}.json`), ReadyPlan)
  const facts: Facts = { ...native.facts, candidate: id.value, marker: marker === null ? null : { target: encodeTarget(marker.target), identity: marker.identity, bundle: marker.bundle.digest }, retainedPlan: plan?.id ?? null }
  if (marker === null || plan === null || plan.change.type === "remove") return { identity: null, facts }
  const approvedBundle = plan.change.bundle
  const binding = yield* Effect.try({
    try: () => {
      validateBundle(marker.bundle)
      return plan.id === id.value && planId(plan) === id.value && sameTarget(plan.target, target) && sameTarget(marker.target, target) &&
        marker.identity.plan === id.value && marker.identity.bundle === marker.bundle.digest && sameBundle(approvedBundle, marker.bundle) &&
        sameJson(catalogFor(plan), native.facts.catalog ?? null)
    },
    catch: (cause) => new InspectionUnavailable({ cause })
  })
  const actual = yield* inspectIO(async () => {
    const staged = await readTree(native.source)
    const loaded = native.loaded === native.source ? staged : await readTree(native.loaded)
    const treeIdentity = (files: PackageFile[]) => commitment("native-tree", files.map((file) => ({ path: file.path, digest: fileDigest(file.content), executable: file.executable })))
    const [head, ...tail] = loaded
    const digest = head === undefined ? null : bundleDigest({ ...marker.bundle, files: [head, ...tail] })
    return { matches: sameFiles(staged, marker.bundle.files) && sameFiles(loaded, marker.bundle.files) && digest === marker.bundle.digest, staged: treeIdentity(staged), loaded: treeIdentity(loaded) }
  })
  return { identity: binding && actual.matches ? marker.identity : null, facts: { ...facts, payload: { staged: actual.staged, loaded: actual.loaded } } }
})

export const observe = Effect.fnUntraced(function*(target: Target) {
  const host = supportedHost(target.destination.host)
  if (host === null || target.profile !== profiles[host].revision || target.version !== profiles[host].version) return { type: "unknown" } satisfies Observation
  return yield* Effect.gen(function*() {
    const native = yield* nativeState(target, yield* readInventory(target))
    return yield* Match.value(native).pipe(Match.discriminatorsExhaustive("type")({
      absent: () => Effect.succeed<Observation>({ type: "absent" }),
      unverified: (native) => Effect.succeed<Observation>({ type: "present", identity: null, fingerprint: fingerprint(target.profile, native.facts) }),
      candidate: (native) => verifyCandidate(target, native).pipe(Effect.map((verified): Observation => ({ type: "present", identity: verified.identity, fingerprint: fingerprint(target.profile, verified.facts) })))
    }))
  }).pipe(Effect.catchTags({
    InspectionUnavailable: () => Effect.succeed<Observation>({ type: "unknown" }),
    HostUnavailable: () => Effect.succeed<Observation>({ type: "unknown" }),
    StateUnavailable: () => Effect.succeed<Observation>({ type: "unknown" })
  }))
})
