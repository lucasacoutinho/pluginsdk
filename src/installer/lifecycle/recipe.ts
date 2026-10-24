import { join } from "node:path"
import { Effect, Match, Schema } from "effect"
import { StateUnavailable, type ReadyPlan, type ReviewedPlan } from "../../../contracts/Installer.ts"
import { Installed } from "./records.ts"
import { targetPaths } from "../target/resolve.ts"
import { durableWrite } from "../storage.ts"
import { materializePayload } from "../payload/materialize.ts"
import { runHost } from "../hosts/commands.ts"
import type { Json } from "../../internal/json.ts"
import { reviewCapturedCompanions } from "../companions/capture.ts"
import { executeCompanions } from "../companions/files.ts"
import { isCodexProject } from "../project/layout.ts"
import { executeProjectChange } from "../project/execute.ts"
import { isLocalTarget } from "../local/layout.ts"
import { LocalInstallation, LocalInstallationLive } from "../local/install.ts"

export const catalogFor = (plan: ReadyPlan): Json => {
  const paths = targetPaths(plan.target)
  const source = `./payloads/${plan.id}`
  return Match.value(plan.target.destination.host).pipe(
    Match.when("claude_code", () => ({
      name: paths.marketName,
      owner: { name: "pluginsdk" },
      plugins: [{ name: plan.target.plugin, source }]
    })),
    Match.when("codex", () => ({
      name: paths.marketName,
      plugins: [{ name: plan.target.plugin, source: { source: "local", path: source }, policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }]
    })),
    Match.when("grok_bot", () => { throw new Error("Unqualified host in approved plan") }),
    Match.when("muse", () => { throw new Error("Unqualified host in approved plan") }),
    Match.when("cursor", () => { throw new Error("Cursor has no marketplace catalog") }),
    Match.exhaustive
  )
}

const encodeInstalled = Schema.encodeSync(Installed)

const executeOrdinaryChange = Effect.fn("Installer.nativeChange")(function*(plan: ReadyPlan) {
  const target = plan.target
  const paths = targetPaths(target)
  const destination = target.destination
  const selector = `${target.plugin}@${paths.marketName}`
  const claude = destination.host === "claude_code"

  const reviewed = yield* reviewCapturedCompanions(target, plan.companions, true)
  if (reviewed.type === "blocked") return yield* new StateUnavailable({ key: target.key, cause: new Error("Companion ownership changed before native execution") })

  if (plan.change.type !== "remove") {
    const payload = join(paths.market, "payloads", plan.id)
    yield* materializePayload(target.key, payload, plan.change.bundle.files)
    const catalogFile = join(paths.market, claude ? ".claude-plugin/marketplace.json" : ".agents/plugins/marketplace.json")
    yield* durableWrite(target.key, catalogFile, catalogFor(plan))
    yield* durableWrite(target.key, join(paths.markers, `${plan.id}.json`), encodeInstalled({
      schema: 1,
      target,
      identity: { plan: plan.id, bundle: plan.change.bundle.digest },
      bundle: plan.change.bundle
    }))
  }

  const remove = Effect.fnUntraced(function*() {
    yield* runHost(destination, claude
      ? ["plugin", "uninstall", selector, "--scope", destination.type, "--keep-data", "--json"]
      : ["plugin", "remove", selector, "--json"], true)
  })
  const install = Effect.fnUntraced(function*() {
    yield* runHost(destination, claude
      ? ["plugin", "install", selector, "--scope", destination.type, "--json"]
      : ["plugin", "add", selector, "--json"], true)
  })

  yield* Match.value(plan.change).pipe(Match.discriminatorsExhaustive("type")({
    install: () => Effect.gen(function*() {
      yield* runHost(destination, claude
        ? ["plugin", "marketplace", "add", paths.market, "--scope", destination.type, "--json"]
        : ["plugin", "marketplace", "add", paths.market, "--json"], true)
      yield* install()
    }),
    replace: () => Effect.gen(function*() {
      yield* remove()
      yield* install()
    }),
    remove: () => Effect.gen(function*() {
      yield* remove()
      yield* runHost(destination, claude
        ? ["plugin", "marketplace", "remove", paths.marketName, "--scope", destination.type, "--json"]
        : ["plugin", "marketplace", "remove", paths.marketName, "--json"], true)
    })
  }))
  if (plan.companions !== undefined) yield* executeCompanions(target, plan.companions)
})

const executeRepair = Effect.fn("Installer.nativeRepair")(function*(plan: Extract<ReviewedPlan, { readonly type: "repair_ready" }>) {
  const reviewed = yield* reviewCapturedCompanions(plan.target, plan.companions, true)
  if (reviewed.type === "blocked") return yield* new StateUnavailable({ key: plan.target.key, cause: new Error("Companion cleanup changed before native execution") })
  const removeMarketplace = () => {
    const destination = plan.target.destination
    const market = targetPaths(plan.target).marketName
    return runHost(destination, destination.host === "claude_code"
      ? ["plugin", "marketplace", "remove", market, "--scope", destination.type, "--json"]
      : ["plugin", "marketplace", "remove", market, "--json"], true).pipe(Effect.asVoid)
  }
  const removeCompanions = () => plan.companions === undefined
    ? Effect.fail(new StateUnavailable({ key: plan.target.key, cause: new Error("Companion cleanup has no captured owned files") }))
    : executeCompanions(plan.target, plan.companions)
  yield* Match.value(plan.before.observed.residual).pipe(
    Match.when("absent", () => Effect.void),
    Match.when("marketplace", () => removeMarketplace()),
    Match.when("companions", () => removeCompanions()),
    Match.when("local", () => Effect.fail(new StateUnavailable({ key: plan.target.key, cause: new Error("Local package cleanup requires the local installer") }))),
    Match.when("marketplace_and_companions", () => Effect.gen(function*() {
      yield* removeMarketplace()
      yield* removeCompanions()
    })),
    Match.exhaustive
  )
})

export const executeChange = (plan: ReviewedPlan) => isLocalTarget(plan.target)
  ? LocalInstallation.use((local) => Match.value(plan).pipe(Match.discriminatorsExhaustive("type")({
    ready: (plan) => local.execute(plan),
    repair_ready: (plan) => local.recover(plan)
  }))).pipe(Effect.provide(LocalInstallationLive), Effect.mapError((cause) => new StateUnavailable({ key: plan.target.key, cause })))
  : Match.value(plan).pipe(Match.discriminatorsExhaustive("type")({
  ready: (plan) => isCodexProject(plan.target) ? executeProjectChange(plan) : executeOrdinaryChange(plan),
  repair_ready: (plan) => executeRepair(plan)
}))
