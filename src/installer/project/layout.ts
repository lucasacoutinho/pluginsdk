import { join } from "node:path"
import { Match, Schema } from "effect"
import type { Bundle } from "../../../contracts/Compiler.ts"
import { Destination, Target, type PlanId, type ReadyPlan } from "../../../contracts/Installer.ts"
import { AgentName, Directory } from "../../../contracts/Plugin.ts"
import { CacheVersion, Platform } from "../../../contracts/ProjectActivation.ts"
import { BlockKey, MarketplaceName, Registration } from "../../../contracts/ProjectConfig.ts"
import { validateBundle } from "../../compiler/package/native.ts"
import { commitment } from "../../internal/identity.ts"
import { buildProjectActivation } from "./activation-model.ts"
import { targetPaths } from "../target/resolve.ts"
import { roleLimits } from "./codex-role-sources.ts"

export const ProjectTarget = Schema.Struct({
  ...Target.fields,
  destination: Schema.Struct({ ...Destination.members[1].fields, host: Schema.Literal("codex") })
})
export type ProjectTarget = typeof ProjectTarget.Type
const sameRegistration = Schema.toEquivalence(Schema.NullOr(Registration))

export const isCodexProject = (target: Target): target is ProjectTarget =>
  target.destination.host === "codex" && target.destination.type === "project"

export const projectBlockKey = (target: ProjectTarget): BlockKey => BlockKey.make(target.key)

export const projectRevision = (target: ProjectTarget, id: PlanId) => {
  const directory = join(targetPaths(target).directory, "revisions", id)
  const market = Directory.make(join(directory, "market"))
  const marketplace = MarketplaceName.make(`pluginsdk-${commitment("project-revision", { target: target.key, plan: id }).slice(0, 24)}`)
  return { directory, market, marketplace, payload: join(market, "payload") }
}

export const projectRegistration = (target: ProjectTarget, id: PlanId): Registration => {
  const revision = projectRevision(target, id)
  return { plugin: target.plugin, marketplace: revision.marketplace, root: revision.market }
}

export const projectActivation = (target: ProjectTarget, id: PlanId, bundle: Bundle) => {
  if (bundle.plugin !== target.plugin || bundle.format !== "codex") {
    throw new Error("Project activation requires the target's complete Codex package")
  }
  const metadata = validateBundle(bundle)
  const roles = bundle.files.filter((file) => file.path.startsWith("agents/"))
  if (roles.length > roleLimits.files || roles.some((file) => file.content.length > roleLimits.bytes)) {
    throw new Error("Project agents exceed the native inventory's role count or file size limit")
  }
  const agents = roles.map((file) => AgentName.make(file.path.slice("agents/".length, -".toml".length)))
  return Match.value(buildProjectActivation({
    platform: Schema.decodeUnknownSync(Platform)(process.platform),
    home: target.destination.home,
    version: CacheVersion.make(metadata.version),
    registration: projectRegistration(target, id),
    agents
  })).pipe(Match.discriminatorsExhaustive("type")({
    rendered: (result) => result,
    rejected: () => { throw new Error("Project activation has duplicate agent names") }
  }))
}

export const projectCatalog = (target: ProjectTarget, id: PlanId) => ({
  name: projectRevision(target, id).marketplace,
  plugins: [{
    name: target.plugin,
    source: { source: "local", path: "./payload" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity"
  }]
})

export const validateProjectPlan = (plan: ReadyPlan): void => {
  if (!isCodexProject(plan.target)) {
    if (plan.project !== undefined) throw new Error("Project capture belongs to a Codex project destination")
    return
  }
  if (plan.project === undefined || plan.companions !== undefined) throw new Error("Codex project plan requires its config capture")
  if (plan.change.type !== "remove" && plan.change.bundle.format !== "codex") {
    throw new Error("Codex project plan requires a qualified project package")
  }
  const previous = plan.before.receipt === null ? null : projectRegistration(plan.target, plan.before.receipt.identity.plan)
  if (!sameRegistration(plan.project.previous, previous)) throw new Error("Project capture does not bind the previous revision")
}
