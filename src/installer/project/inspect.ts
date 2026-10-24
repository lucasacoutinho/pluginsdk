import { readdir } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { Effect, Exit, Match, Schema } from "effect"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import { PlanId, ReadyPlan, Target, type HostUnavailable, type Observation, type Snapshot, type StateUnavailable } from "../../../contracts/Installer.ts"
import { FileBasis, ProjectCapture, Registration } from "../../../contracts/ProjectConfig.ts"
import { Activation } from "../../../contracts/ProjectActivation.ts"
import { validateBundle } from "../../compiler/package/native.ts"
import { fingerprint, planId } from "../../internal/identity.ts"
import { ConfigRead } from "../hosts/codex-config.ts"
import { readCodexConfig, runHost } from "../hosts/commands.ts"
import { InspectionUnavailable, inspectIO, sameJson } from "../hosts/state.ts"
import { readPayload } from "../payload/read.ts"
import { qualifiedBundle, sameOwnedTarget } from "../target/profiles.ts"
import { editProjectDocument, inspectProjectDocument, type DocumentResult } from "./config/document.ts"
import { readProjectFile } from "./files/file.ts"
import { isCodexProject, projectActivation, projectBlockKey, projectCatalog, projectRegistration, projectRevision, validateProjectPlan, type ProjectTarget } from "./layout.ts"
import { inspectProjectRoles } from "./roles.ts"
import { Installed } from "../lifecycle/records.ts"
import { readRecord } from "../storage.ts"
import { targetPaths } from "../target/resolve.ts"

const sameBasis = Schema.toEquivalence(FileBasis)
const sameRegistration = Schema.toEquivalence(Registration)
const sameActivation = Schema.toEquivalence(Activation)
const sameTarget = Schema.toEquivalence(Target)
const sameBundle = Schema.toEquivalence(Installed.fields.bundle)
const encodeRegistration = Schema.encodeSync(Registration)
const encodeBasis = Schema.encodeSync(FileBasis)

const jsonTable = (value: Schema.Json | undefined): Schema.JsonObject =>
  value === undefined || value === null ? {} : Schema.decodeUnknownSync(Schema.JsonObject)(value)

const nativeMarketplace = (registration: Registration) => ({
  source_type: "local",
  source: registration.root,
  ref: null,
  sparse_paths: null,
  last_updated: null,
  last_revision: null
})

const readProjectView = Effect.fn("Installer.readProjectView")(function*(target: ProjectTarget, inExecution = false) {
  const file = yield* readProjectFile(target)
  const response = yield* readCodexConfig(target.destination, inExecution)
  const features = yield* runHost(target.destination, ["features", "list"], inExecution)
  const view = yield* inspectIO(async () => {
    const parsed = Schema.decodeUnknownSync(ConfigRead)(response)
    const layer = parsed.layers.filter((layer) => layer.name.type === "project" &&
      layer.name.dotCodexFolder === join(target.destination.root, ".codex"))
    if (layer.length !== 1 || layer[0]?.disabledReason !== undefined) throw new Error("Codex project configuration is not trusted")
    const pluginsFeature = features.split(/\r?\n/).filter((line) => /^plugins\s/.test(line))
    if (pluginsFeature.length !== 1 || !/^plugins\s+\S+\s+true\s*$/.test(pluginsFeature[0] ?? "")) {
      throw new Error("Codex plugins feature is unavailable for this project")
    }
    const allPlugins = jsonTable(parsed.config.plugins)
    const plugins = Object.fromEntries(Object.entries(allPlugins).filter(([selector]) => selector.startsWith(`${target.plugin}@`)))
    return { plugins, marketplaces: jsonTable(parsed.config.marketplaces), config: parsed }
  })
  const after = yield* readProjectFile(target)
  if (!sameBasis(file.basis, after.basis)) return yield* new InspectionUnavailable({ cause: new Error("Project config changed during inspection") })
  return { ...view, file, document: inspectProjectDocument({ key: projectBlockKey(target), text: file.text }) }
})

export const captureProject = Effect.fn("Installer.captureProject")(function*(target: Target, before: Snapshot) {
  if (!isCodexProject(target)) return undefined
  const file = yield* readProjectFile(target)
  return {
    before: file.basis,
    previous: before.receipt === null ? null : projectRegistration(target, before.receipt.identity.plan)
  } satisfies ProjectCapture
})

export const reviewProjectPlan = Effect.fn("Installer.reviewProjectPlan")(function*(plan: ReadyPlan, inExecution = false) {
  if (!isCodexProject(plan.target)) return { type: "ready", text: "" } satisfies DocumentResult
  const target = plan.target
  const capture = plan.project
  if (capture === undefined) return { type: "blocked", reason: "unowned" } satisfies DocumentResult
  const view = yield* readProjectView(plan.target, inExecution)
  if (!sameBasis(view.file.basis, capture.before)) return { type: "blocked", reason: "drift" } satisfies DocumentResult
  const previousSelector = capture.previous === null ? null : `${capture.previous.plugin}@${capture.previous.marketplace}`
  if (Object.keys(view.plugins).some((selector) => selector !== previousSelector)) {
    return { type: "blocked", reason: "native_conflict" } satisfies DocumentResult
  }
  if (capture.previous !== null && (!sameJson(view.plugins[`${capture.previous.plugin}@${capture.previous.marketplace}`] ?? null, { enabled: true }) ||
    !sameJson(view.marketplaces[capture.previous.marketplace] ?? null, nativeMarketplace(capture.previous)))) {
    return { type: "blocked", reason: "native_conflict" } satisfies DocumentResult
  }
  let previous: Activation | null = null
  if (plan.before.receipt !== null) {
    const owned = yield* verifyProjectRevision(plan.target, plan.before.receipt.identity.plan)
    if (owned === null || owned.identity.bundle !== plan.before.receipt.identity.bundle) return { type: "blocked", reason: "drift" } satisfies DocumentResult
    previous = owned.activation
  }
  const bundle = plan.change.type === "remove" ? null : plan.change.bundle
  const desired = bundle === null ? null : yield* Effect.try({
    try: () => projectActivation(target, plan.id, bundle).activation,
    catch: (cause) => new InspectionUnavailable({ cause })
  })
  const edited = editProjectDocument({
    key: projectBlockKey(plan.target),
    text: view.file.text,
    previous,
    desired
  })
  if (edited.type === "blocked") return edited
  const roles = yield* inspectProjectRoles(plan.target, view.config, previous, desired)
  return Match.value(roles).pipe(Match.discriminatorsExhaustive("type")({
    ready: () => edited,
    blocked: ({ reason }) => ({ type: "blocked", reason: Match.value(reason).pipe(
      Match.when("duplicate", () => "invalid_config" as const),
      Match.whenOr("unknown", "unowned", () => "native_conflict" as const),
      Match.when("drift", () => "drift" as const),
      Match.exhaustive
    ) } satisfies DocumentResult)
  }))
})

export const verifyProjectRevision = Effect.fn("Installer.verifyProjectRevision")(function*(target: ProjectTarget, id: PlanId) {
  const paths = targetPaths(target)
  const revision = projectRevision(target, id)
  const marker = yield* readRecord(target.key, join(paths.markers, `${id}.json`), Installed)
  const plan = yield* readRecord(target.key, join(paths.plans, `${id}.json`), ReadyPlan)
  if (marker === null || plan === null || plan.change.type === "remove") return null
  const bundle = plan.change.bundle
  const metadata = yield* Effect.try({
    try: () => {
      validateProjectPlan(plan)
      return validateBundle(bundle)
    },
    catch: (cause) => new InspectionUnavailable({ cause })
  })
  if (plan.id !== id || planId(plan) !== id || !sameTarget(plan.target, marker.target) || !sameOwnedTarget(target, plan.target) ||
    marker.identity.plan !== id || marker.identity.bundle !== bundle.digest || !sameBundle(marker.bundle, bundle) || !qualifiedBundle(target, bundle)) return null
  const catalog = yield* readRecord(target.key, join(revision.market, ".agents/plugins/marketplace.json"), Schema.Json)
  if (!sameJson(catalog, projectCatalog(target, id))) return null
  const activation = yield* Effect.try({
    try: () => projectActivation(target, id, bundle),
    catch: (cause) => new InspectionUnavailable({ cause })
  })
  const cacheRoot = activation.cache.directory
  const cache = activation.cache.payload
  const cacheMatches = yield* inspectIO(async () => {
    const plugins = await readdir(cacheRoot)
    const versions = await readdir(join(cacheRoot, target.plugin))
    return plugins.length === 1 && plugins[0] === target.plugin && versions.length === 1 && versions[0] === metadata.version
  })
  if (!cacheMatches) return null
  const staged = yield* readPayload(revision.payload, bundle.files).pipe(Effect.mapError((cause) => new InspectionUnavailable({ cause })))
  const loaded = yield* readPayload(cache, bundle.files).pipe(Effect.mapError((cause) => new InspectionUnavailable({ cause })))
  if (!staged.matches || !loaded.matches) return null
  const payload = loaded.fingerprint
  return { plan, bundle, identity: marker.identity, activation: activation.activation, cacheRoot, facts: { revision: id, catalog, payload } }
})

export const projectRolesReleased = Effect.fn("Installer.projectRolesReleased")(function*(plan: ReadyPlan, retired: Activation) {
  if (retired.agents.length === 0) return true
  if (!isCodexProject(plan.target)) return false
  const target = plan.target
  const bundle = plan.change.type === "remove" ? null : plan.change.bundle
  const active = bundle === null ? null : yield* Effect.try({
    try: () => projectActivation(target, plan.id, bundle).activation,
    catch: (cause) => new InspectionUnavailable({ cause })
  })
  const view = yield* readProjectView(target, true)
  if (active === null) {
    if (view.document.type !== "absent" || Object.keys(view.plugins).length !== 0) return false
  } else if (view.document.type !== "present" || !sameActivation(view.document.activation, active)) return false
  return (yield* inspectProjectRoles(target, view.config, active, retired)).type === "ready"
})

export const observeProject = Effect.fn("Installer.observeProject")(function*(target: ProjectTarget, inExecution = false): Effect.fn.Return<Observation, InspectionUnavailable | StateUnavailable | HostUnavailable, ChildProcessSpawner> {
  const view = yield* readProjectView(target, inExecution)
  const facts = { plugins: view.plugins, document: view.document.type }
  return yield* Match.value(view.document).pipe(Match.discriminatorsExhaustive("type")({
    blocked: ({ reason }) => Effect.succeed<Observation>({
      type: "present", identity: null,
      fingerprint: fingerprint(target.profile, { ...facts, reason, file: encodeBasis(view.file.basis) })
    }),
    absent: () => Effect.succeed<Observation>(Object.keys(view.plugins).length === 0
      ? { type: "absent" }
      : { type: "present", identity: null, fingerprint: fingerprint(target.profile, facts) }),
    present: ({ activation, block }) => Effect.gen(function*() {
      const { registration } = activation
      const decodedId = Schema.decodeExit(PlanId)(basename(dirname(registration.root)))
      const selector = `${target.plugin}@${registration.marketplace}`
      const native = {
        ...facts,
        registration: encodeRegistration(registration),
        block,
        marketplace: view.marketplaces[registration.marketplace] ?? null
      }
      const unowned: Observation = { type: "present", identity: null, fingerprint: fingerprint(target.profile, native) }
      if (Exit.isFailure(decodedId) || !sameRegistration(registration, projectRegistration(target, decodedId.value)) ||
        Object.keys(view.plugins).length !== 1 || !sameJson(view.plugins[selector] ?? null, { enabled: true }) ||
        !sameJson(view.marketplaces[registration.marketplace] ?? null, nativeMarketplace(registration))) return unowned
      const verified = yield* verifyProjectRevision(target, decodedId.value)
      if (verified === null || !sameActivation(activation, verified.activation)) return unowned
      const roles = yield* inspectProjectRoles(target, view.config, verified.activation, null)
      return roles.type === "blocked" ? unowned : {
        type: "present", identity: verified.identity,
        fingerprint: fingerprint(target.profile, { ...native, ...verified.facts })
      } satisfies Observation
    })
  }))
})
