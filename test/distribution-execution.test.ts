import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import {
  AttemptStatus,
  Desired,
  DistributionPlanId,
  OracleRequest,
  OracleResponse,
  ProgressRecord,
  RecordInput,
  ScheduleInput,
  StepDescriptor,
  TargetId
} from "../contracts/DistributionModel.ts"
import type { ProgressEntry } from "../contracts/DistributionModel.ts"
import {
  openDistribution,
  recordDistribution,
  scheduleDistribution,
  summarizeDistribution
} from "../src/distribution/execution.ts"

type ExecutionRequest = Extract<OracleRequest, {
  type: "open_distribution" | "schedule_distribution" | "record_distribution" | "summarize_distribution"
}>

const vectorPath = fileURLToPath(new URL("../spec/vectors/distribution.ndjson", import.meta.url))
const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: OracleRequest,
  expected: OracleResponse
})
const vectors = readFileSync(vectorPath, "utf8").split("\n").filter(Boolean).map((line) => {
  const raw: unknown = JSON.parse(line)
  return Schema.decodeUnknownSync(Vector)(raw, { onExcessProperty: "error" })
})

const isExecutionRequest = (request: OracleRequest): request is ExecutionRequest =>
  Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    select_distribution_format: () => false,
    normalize_distribution: () => false,
    open_distribution: () => true,
    schedule_distribution: () => true,
    record_distribution: () => true,
    summarize_distribution: () => true
  }))

type ExecutionVector = typeof vectors[number] & { request: ExecutionRequest }
const executionVectors = vectors.filter((vector): vector is ExecutionVector =>
  isExecutionRequest(vector.request)
)

const oracle = (requests: ReadonlyArray<ExecutionRequest>): ReadonlyArray<OracleResponse> => {
  const encode = Schema.encodeSync(OracleRequest)
  const result = spawnSync(oraclePath, [], {
    input: requests.map((request) => JSON.stringify(encode(request)) + "\n").join(""),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Distribution execution oracle failed: ${result.stderr}`)
  return result.stdout.split("\n").filter(Boolean).map((line) => {
    const raw: unknown = JSON.parse(line)
    return Schema.decodeUnknownSync(OracleResponse)(raw, { onExcessProperty: "error" })
  })
}

const evaluate = (request: ExecutionRequest): OracleResponse =>
  Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    open_distribution: ({ input }): OracleResponse => ({
      schema: 1,
      type: "open_distribution",
      output: openDistribution(input)
    }),
    schedule_distribution: ({ input }): OracleResponse => ({
      schema: 1,
      type: "schedule_distribution",
      output: scheduleDistribution(input)
    }),
    record_distribution: ({ input }): OracleResponse => ({
      schema: 1,
      type: "record_distribution",
      output: recordDistribution(input)
    }),
    summarize_distribution: ({ input }): OracleResponse => ({
      schema: 1,
      type: "summarize_distribution",
      output: summarizeDistribution(input)
    })
  }))

it("matches every authored execution vector in TypeScript and Lean without mutating input", () => {
  const responses = oracle(executionVectors.map(({ request }) => request))
  expect(responses).toHaveLength(executionVectors.length)

  for (const [index, vector] of executionVectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing Lean response for ${vector.name}`)
    const before = structuredClone(vector.request.input)
    expect(response, vector.name).toEqual(vector.expected)
    expect(evaluate(vector.request), vector.name).toEqual(vector.expected)
    expect(vector.request.input, `${vector.name} input`).toEqual(before)
  }
})

const target = (value: string) => Schema.decodeSync(TargetId)(value)
const step = (targetValue: string, digestCharacter: string) => Schema.decodeSync(StepDescriptor)({
  target: target(targetValue),
  installation: `physical-${targetValue}`,
  digest: digestCharacter.repeat(64)
})
const planId = Schema.decodeSync(DistributionPlanId)("d".repeat(64))
const scheduleRequest = (input: ScheduleInput): OracleRequest =>
  Schema.decodeSync(OracleRequest)({ schema: 1, type: "schedule_distribution", input })

it("matches Lean across generated status and visited combinations, including repeated targets", () => {
  const alpha = target("alpha")
  const beta = target("beta")
  const statuses: ReadonlyArray<ProgressEntry["status"]> = [
    "pending", "installed", "removed", "unchanged", "not_applied", "blocked", "uncertain", "unavailable"
  ]
  const desiredValues: ReadonlyArray<Desired> = [
    Schema.decodeSync(Desired)("present"), Schema.decodeSync(Desired)("absent")
  ]
  const visitedValues: ReadonlyArray<ScheduleInput["visited"]> = [
    [], [alpha], [beta], [alpha, beta]
  ]

  const requests = desiredValues.flatMap((desired) =>
    statuses.flatMap((firstStatus) =>
      statuses.flatMap((secondStatus) =>
        visitedValues.map((visited) => scheduleRequest(Schema.decodeSync(ScheduleInput)({
          record: Schema.decodeSync(ProgressRecord)({
            id: planId,
            desired,
            entries: [
              { step: step("alpha", "a"), status: firstStatus },
              { step: step("beta", "b"), status: secondStatus }
            ]
          }),
          visited
        })))
      )
    )
  )

  const duplicateTargetRecord: RecordInput = Schema.decodeSync(RecordInput)({
    record: Schema.decodeSync(ProgressRecord)({
      id: planId,
      desired: "present",
      entries: [
        { step: step("alpha", "a"), status: "pending" },
        { step: step("alpha", "b"), status: "unavailable" },
        { step: step("beta", "c"), status: "removed" }
      ]
    }),
    target: alpha,
    status: Schema.decodeSync(AttemptStatus)("installed")
  })
  requests.push(Schema.decodeSync(OracleRequest)({
    schema: 1,
    type: "record_distribution",
    input: duplicateTargetRecord
  }))

  const generatedRequests = requests.filter(isExecutionRequest)
  const responses = oracle(generatedRequests)
  expect(responses).toHaveLength(generatedRequests.length)
  for (const [index, request] of generatedRequests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing Lean response for generated case ${index}`)
    const before = structuredClone(request.input)
    expect(evaluate(request), `generated case ${index}`).toEqual(response)
    expect(request.input, `generated case ${index} input`).toEqual(before)
  }
})
