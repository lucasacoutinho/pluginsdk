import { join } from "node:path"
import { Effect, Match, Schema } from "effect"
import type { ReadyPlan } from "../../contracts/Installer.ts"
import { Installed } from "./records.ts"
import { targetPaths } from "./target.ts"
import { durableWrite, ensureDirectory, stageFile } from "./storage.ts"
import { runHost } from "./host.ts"
import type { Json } from "../internal/json.ts"

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
    Match.exhaustive
  )
}

const encodeInstalled = Schema.encodeSync(Installed)

export const executeChange = Effect.fn("Installer.nativeChange")(function*(plan: ReadyPlan) {
  const target = plan.target
  const paths = targetPaths(target)
  const destination = target.destination
  const selector = `${target.plugin}@${paths.marketName}`
  const claude = destination.host === "claude_code"

  if (plan.change.type !== "remove") {
    const payload = join(paths.market, "payloads", plan.id)
    yield* ensureDirectory(target.key, payload)
    for (const file of plan.change.bundle.files) yield* stageFile(target.key, join(payload, file.path), file.content, file.executable)
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
})
