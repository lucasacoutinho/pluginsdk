import { join } from "node:path"
import { Effect, Match, Schema } from "effect"
import { ReadyPlan, StateUnavailable } from "../../../contracts/Installer.ts"
import type { Bundle } from "../../../contracts/Compiler.ts"
import type { PlanId, Target } from "../../../contracts/Installer.ts"
import type { RetainedFile } from "../../../contracts/ExecutableIntent.ts"
import * as Files from "../../../contracts/FileRead.ts"
import * as ApprovalRecord from "../../../contracts/LocalApproval.ts"
import type { Approval, Tree } from "../../../contracts/LocalPackage.ts"
import { classifyLocalPackage } from "./package.ts"
import { bindLocalApproval } from "./approval.ts"
import { commitment, fileDigest } from "../../internal/identity.ts"
import { savePlan, validatePlan } from "../lifecycle/plans.ts"
import { qualifiedBundle, sameOwnedTarget } from "../target/profiles.ts"
import { durableWrite, readRecord } from "../storage.ts"
import { targetPaths } from "../target/resolve.ts"

const sameRecord = Schema.toEquivalence(ApprovalRecord.Record)

const recordPath = (target: Target, root: Files.Identity): string =>
  join(targetPaths(target).directory, "physical-claims", `${commitment("local-package-root", root)}.json`)

const planPath = (target: Target, id: PlanId): string =>
  join(targetPaths(target).plans, `${id}.json`)

const changedBundle = (plan: ReadyPlan): Bundle => Match.value(plan.change).pipe(
  Match.discriminatorsExhaustive("type")({
    install: ({ bundle }) => bundle,
    replace: ({ bundle }) => bundle,
    remove: () => { throw new Error("Local package approval cannot retain a removal plan") }
  })
)

const verifiedBundle = (target: Target, plan: ReadyPlan, expectedId: PlanId): Bundle => {
  validatePlan(plan)
  if (plan.id !== expectedId) throw new Error("Retained plan ID differs from the physical claim")
  if (!sameOwnedTarget(target, plan.target)) throw new Error("Retained plan target is not ownership-compatible")
  const bundle = changedBundle(plan)
  if (!qualifiedBundle(target, bundle)) throw new Error("Retained package requirements are unsupported by the target")
  return bundle
}

const descriptorsFor = (bundle: Bundle): ApprovalRecord.Retained["files"] => {
  const descriptor = ({ path, content, executable }: Bundle["files"][number]): RetainedFile => ({
    path,
    digest: fileDigest(content),
    executable
  })
  const [head, ...tail] = bundle.files
  return [descriptor(head), ...tail.map(descriptor)]
}

const unavailable = (key: Target["key"], cause: unknown): StateUnavailable =>
  new StateUnavailable({ key, cause })

const verifyCompleteTree = (approval: Approval, tree: Tree): boolean =>
  Match.value(classifyLocalPackage({ approval, observed: { type: "tree", ...tree } })).pipe(
    Match.discriminatorsExhaustive("type")({
      absent: () => false,
      unknown: () => false,
      foreign: () => false,
      complete: () => true,
      partial: () => false
    })
  )

export const readLocalApproval = Effect.fn("Installer.readLocalApproval")(function*(
  target: Target,
  root: Files.Identity
): Effect.fn.Return<Approval | null, StateUnavailable> {
  const path = recordPath(target, root)
  const record = yield* readRecord(target.key, path, ApprovalRecord.Record)
  if (record === null) return null

  const plan = yield* readRecord(target.key, planPath(target, record.identity.plan), ReadyPlan)
  if (plan === null) return yield* unavailable(target.key, new Error("Physical claim retained plan is missing"))
  const bundle = yield* Effect.try({
    try: () => verifiedBundle(target, plan, record.identity.plan),
    catch: (cause) => unavailable(target.key, cause)
  })
  const retained = {
    owner: plan.target.key,
    identity: { plan: plan.id, bundle: bundle.digest },
    files: descriptorsFor(bundle)
  } satisfies ApprovalRecord.Retained
  const approval = bindLocalApproval({ owner: target.key, root, record, retained })
  if (approval === null) return yield* unavailable(target.key, new Error("Physical claim does not bind its retained plan and root"))
  return approval
})

export const retainLocalApproval = Effect.fn("Installer.retainLocalApproval")(function*(
  plan: ReadyPlan,
  tree: Tree
): Effect.fn.Return<void, StateUnavailable> {
  const target = plan.target
  const bundle = yield* Effect.try({
    try: () => verifiedBundle(target, plan, plan.id),
    catch: (cause) => unavailable(target.key, cause)
  })
  const identity = { plan: plan.id, bundle: bundle.digest }
  const retained = {
    owner: plan.target.key,
    identity,
    files: descriptorsFor(bundle)
  } satisfies ApprovalRecord.Retained
  const record = {
    schema: 1,
    owner: plan.target.key,
    identity,
    root: tree.root
  } satisfies ApprovalRecord.Record
  const approval = bindLocalApproval({ owner: target.key, root: tree.root, record, retained })
  if (approval === null) return yield* unavailable(target.key, new Error("New physical claim failed its owner, plan, or root binding"))
  const complete = verifyCompleteTree(approval, tree)
  if (!complete) return yield* unavailable(target.key, new Error("Physical claim requires a complete captured package tree"))

  const path = recordPath(target, tree.root)
  const existing = yield* readRecord(target.key, path, ApprovalRecord.Record)
  if (existing !== null && !sameRecord(existing, record)) {
    return yield* unavailable(target.key, new Error("A different immutable physical claim already exists for this root"))
  }

  yield* savePlan(plan)
  if (existing === null) {
    const encoded = yield* Schema.encodeEffect(ApprovalRecord.Record, { onExcessProperty: "error" })(record).pipe(
      Effect.mapError((cause) => unavailable(target.key, cause))
    )
    yield* durableWrite(target.key, path, encoded)
  }
})
