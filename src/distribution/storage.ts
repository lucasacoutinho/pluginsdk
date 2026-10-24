import { Effect, Schema } from "effect"
import {
  DistributionUnavailable,
  ExecutionRecord,
  ReadyPlan
} from "../../contracts/Distribution.ts"
import { DistributionPlanId } from "../../contracts/DistributionModel.ts"
import type { Directory } from "../../contracts/Plugin.ts"
import { parseJsonBytes } from "../internal/json.ts"
import { createRecordDirectory, readRecordBytes, writeRecordJson } from "../internal/records/files.ts"
import { recordLock } from "../internal/records/lock.ts"
import { snapshotPlan, validateExecutionRecord } from "./review.ts"

export const StoredJob = Schema.Struct({ plan: ReadyPlan, record: ExecutionRecord })
export type StoredJob = typeof StoredJob.Type

export const StoredDistribution = Schema.Struct({ schema: Schema.Literal(1), jobs: Schema.Array(StoredJob) })
export type StoredDistribution = typeof StoredDistribution.Type

const samePlanId = Schema.toEquivalence(DistributionPlanId)

const distributionIO = <A>(directory: Directory, operation: () => Promise<A>) =>
  Effect.tryPromise({ try: operation, catch: (cause) => new DistributionUnavailable({ directory, cause }) })

export const createDirectory = (directory: Directory) =>
  distributionIO(directory, () => createRecordDirectory(directory)).pipe(Effect.uninterruptible)

export const distributionLock = (directory: Directory) => recordLock(directory).pipe(
  Effect.mapError(({ cause }) => new DistributionUnavailable({ directory, cause }))
)

export const readDistribution = (directory: Directory) => distributionIO(directory, async (): Promise<StoredDistribution> => {
  const decoded = Schema.decodeUnknownSync(StoredDistribution)(parseJsonBytes(await readRecordBytes(directory, "distribution.json")), { onExcessProperty: "error" })
  const jobs: Array<StoredJob> = []
  for (const job of decoded.jobs) {
    if (jobs.some((prior) => samePlanId(prior.plan.id, job.plan.id))) {
      throw new Error("Distribution record contains duplicate job IDs")
    }
    const plan = snapshotPlan(job.plan)
    validateExecutionRecord(plan, job.record)
    jobs.push({ plan, record: job.record })
  }
  return { schema: 1, jobs }
})

export const writeDistribution = (directory: Directory, record: StoredDistribution) => distributionIO(directory, () =>
  writeRecordJson(directory, "distribution.json", Schema.encodeSync(StoredDistribution)(record))
).pipe(Effect.uninterruptible)
