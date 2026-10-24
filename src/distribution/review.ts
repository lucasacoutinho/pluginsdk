import { Match, Schema } from "effect"
import type { PluginRelease } from "../../contracts/Catalog.ts"
import { Format, type Bundle } from "../../contracts/Compiler.ts"
import { ExecutionRecord, Operation, PlanBody, PlanRequest, ReadyPlan, Step, type NativeIntent, type Outcome } from "../../contracts/Distribution.ts"
import { DistributionPlanId, PlanSpec, ProgressRecord, StepDescriptor, StepDigest, type Candidate, type Desired } from "../../contracts/DistributionModel.ts"
import { Identity, Snapshot, type PlanChange, type Target } from "../../contracts/Installer.ts"
import { LocalDestination } from "../../contracts/Distribution.ts"
import { validateBundle } from "../compiler/package/native.ts"
import { commitment, copyBundle, planId } from "../internal/identity.ts"
import { normalizeDistribution } from "./planning.ts"
import { openDistribution } from "./execution.ts"
import { selectDistributionFormat } from "./selection.ts"

const sameSteps = Schema.toEquivalence(Schema.NonEmptyArray(StepDescriptor))
const sameSnapshot = Schema.toEquivalence(Snapshot)
const sameIdentity = Schema.toEquivalence(Identity)

export const declaredFormats = (release: PluginRelease): ReadonlyArray<Format> =>
  Format.literals.filter((format) => release.contents.packages[format] !== undefined)

export const operationTarget = (operation: Operation): Target => Match.value(operation).pipe(
  Match.discriminatorsExhaustive("type")({ apply: ({ plan }) => plan.target, verify: ({ target }) => target })
)

export const describeStep = (step: Step): StepDescriptor => ({
  target: step.target,
  installation: operationTarget(step.operation).key,
  digest: StepDigest.make(commitment("distribution-step", Schema.encodeSync(Step)(step)))
})

export const describePlan = (plan: ReadyPlan): PlanSpec => {
  const [first, ...rest] = plan.steps
  return { id: plan.id, desired: plan.desired, steps: [describeStep(first), ...rest.map(describeStep)] }
}

export const projectProgress = (record: ExecutionRecord): ProgressRecord => {
  const project = (entry: ExecutionRecord["entries"][number]) => ({ step: entry.step, status: entry.outcome.type })
  const [first, ...rest] = record.entries
  return { id: record.id, desired: record.desired, entries: [project(first), ...rest.map(project)] }
}

const reviewId = (body: PlanBody): DistributionPlanId => DistributionPlanId.make(
  commitment("distribution-plan", Schema.encodeSync(PlanBody)({
    schema: body.schema, type: body.type, desired: body.desired, release: body.release, steps: body.steps
  }))
)

const copyStep = (step: Step): Step => ({
  ...step,
  operation: Match.value(step.operation).pipe(Match.discriminatorsExhaustive("type")({
    apply: ({ plan }): Operation => ({
      type: "apply", plan: { ...plan, change: Match.value(plan.change).pipe(Match.discriminatorsExhaustive("type")({
        install: ({ bundle }): PlanChange => ({ type: "install", bundle: copyBundle(bundle) }),
        replace: ({ bundle }): PlanChange => ({ type: "replace", bundle: copyBundle(bundle) }),
        remove: (change) => change
      })) }
    }),
    verify: (operation): Operation => ({
      ...operation, intent: Match.value(operation.intent).pipe(Match.discriminatorsExhaustive("type")({
        absent: (intent) => intent,
        present: ({ bundle }): NativeIntent => ({ type: "present", bundle: copyBundle(bundle) })
      }))
    })
  }))
})

const validateBundleBinding = (release: PluginRelease, format: Format, bundle: Bundle): void => {
  if (format !== bundle.format || bundle.plugin !== release.contents.plugin ||
    bundle.digest !== release.contents.packages[format] || validateBundle(bundle).version !== release.version) {
    throw new Error("Reviewed operation does not bind the approved package")
  }
}

const validateOperation = (release: PluginRelease, desired: Desired, operation: Operation): void => {
  const target = operationTarget(operation)
  const destination = Schema.decodeUnknownSync(Schema.toType(LocalDestination))(target.destination, { onExcessProperty: "error" })
  if (target.plugin !== release.contents.plugin) throw new Error("Reviewed operation names another plugin")
  const format = Match.value(selectDistributionFormat({ host: destination.host, formats: declaredFormats(release) })).pipe(
    Match.discriminatorsExhaustive("type")({
      selected: ({ format }) => format,
      blocked: () => { throw new Error("Reviewed release does not select one package for its host") }
    })
  )
  Match.value(operation).pipe(Match.discriminatorsExhaustive("type")({
    apply: ({ plan }) => {
      if (plan.id !== planId(plan)) throw new Error("Native plan commitment differs")
      const validatePresent = ({ bundle }: { readonly bundle: Bundle }): void => {
        if (desired !== "present") throw new Error("Native mutation does not satisfy reviewed removal")
        validateBundleBinding(release, format, bundle)
      }
      Match.value(plan.change).pipe(Match.discriminatorsExhaustive("type")({
        install: validatePresent,
        replace: validatePresent,
        remove: () => { if (desired !== "absent") throw new Error("Removal does not satisfy reviewed installation") }
      }))
    },
    verify: ({ before, intent }) => Match.value(intent).pipe(Match.discriminatorsExhaustive("type")({
      absent: ({ plugin }) => {
        if (desired !== "absent" || plugin !== target.plugin || before.observed.type !== "absent" || before.receipt !== null) {
          throw new Error("Unchanged removal has no qualified absence")
        }
      },
      present: ({ bundle }) => {
        validateBundleBinding(release, format, bundle)
        const observed = before.observed
        if (desired !== "present" || before.receipt === null || observed.type !== "present" ||
          observed.identity === null || !sameIdentity(before.receipt.identity, observed.identity) ||
          observed.fingerprint !== before.receipt.fingerprint || before.receipt.identity.bundle !== bundle.digest) {
          throw new Error("Unchanged installation has no matching owned package")
        }
      }
    }))
  }))
}

export const snapshotRequest = (input: PlanRequest): PlanRequest =>
  Schema.decodeSync(Schema.toType(PlanRequest))(structuredClone(input), { onExcessProperty: "error" })

export const snapshotPlan = (input: ReadyPlan): ReadyPlan => {
  const captured = Schema.decodeSync(Schema.toType(ReadyPlan))(structuredClone(input), { onExcessProperty: "error" })
  const [first, ...rest] = captured.steps
  const plan: ReadyPlan = { ...captured, steps: [copyStep(first), ...rest.map(copyStep)] }
  Match.value(plan.release.contents).pipe(Match.discriminatorsExhaustive("type")({
    mcp: () => { throw new Error("MCP contracts are not installable plugin releases") },
    plugin: (contents) => {
      const release = { ...plan.release, contents }
      for (const step of plan.steps) validateOperation(release, plan.desired, step.operation)
    }
  }))
  const specification = describePlan(plan)
  const [firstDescriptor, ...restDescriptors] = specification.steps
  const candidate = (step: StepDescriptor): Candidate => ({ type: "ready", step })
  Match.value(normalizeDistribution({ candidates: [
    candidate(firstDescriptor), ...restDescriptors.map(candidate)
  ] })).pipe(
    Match.discriminatorsExhaustive("type")({
      blocked: () => { throw new Error("Reviewed destinations are not distinct") },
      ready: ({ steps }) => { if (!sameSteps(steps, specification.steps)) throw new Error("Reviewed destinations are not canonical") }
    })
  )
  if (plan.id !== reviewId(plan)) throw new Error("Distribution plan commitment differs")
  return plan
}

export const reviewPlan = (body: PlanBody): ReadyPlan => snapshotPlan({ ...body, id: reviewId(body) })

const validateOutcome = (step: Step, outcome: Outcome): void => Match.value(outcome).pipe(
  Match.discriminatorsExhaustive("type")({
    pending: () => undefined,
    blocked: () => undefined,
    unavailable: () => undefined,
    uncertain: () => { if (step.operation.type !== "apply") throw new Error("Verification cannot retain native execution uncertainty") },
    not_applied: () => { if (step.operation.type !== "apply") throw new Error("Verification cannot retain a native completion") },
    removed: () => {
      if (step.operation.type !== "apply" || step.operation.plan.change.type !== "remove") throw new Error("Removal outcome differs from its operation")
    },
    installed: ({ receipt }) => {
      if (step.operation.type !== "apply") throw new Error("Installation outcome differs from its operation")
      const { plan } = step.operation
      Match.value(plan.change).pipe(Match.discriminatorsExhaustive("type")({
        remove: () => { throw new Error("Removal cannot retain an installed receipt") },
        install: ({ bundle }) => {
          if (receipt.identity.plan !== plan.id || receipt.identity.bundle !== bundle.digest) throw new Error("Installed receipt differs from its review")
        },
        replace: ({ bundle }) => {
          if (receipt.identity.plan !== plan.id || receipt.identity.bundle !== bundle.digest) throw new Error("Replacement receipt differs from its review")
        }
      }))
    },
    unchanged: ({ state }) => {
      if (step.operation.type !== "verify" || !sameSnapshot(state, step.operation.before)) throw new Error("Unchanged result differs from its reviewed basis")
    }
  })
)

export const validateExecutionRecord = (plan: ReadyPlan, record: ExecutionRecord): void => {
  const opened = openDistribution({ plan: describePlan(plan), prior: projectProgress(record) })
  Match.value(opened).pipe(Match.discriminatorsExhaustive("type")({
    rejected: () => { throw new Error("Distribution progress does not bind its complete review") },
    opened: () => {
      for (const [index, step] of plan.steps.entries()) {
        const entry = record.entries[index]
        if (entry === undefined) throw new Error("Distribution progress is missing a destination")
        validateOutcome(step, entry.outcome)
      }
    }
  }))
}
