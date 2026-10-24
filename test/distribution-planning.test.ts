import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import {
  OracleRequest,
  OracleResponse,
  NormalizationInput,
  type OracleRequest as DistributionRequest,
  type OracleResponse as DistributionResponse,
  type Candidate
} from "../contracts/DistributionModel.ts"
import { normalizeDistribution } from "../src/distribution/planning.ts"

type PlanningRequest = Extract<DistributionRequest, { type: "normalize_distribution" }>
type PlanningResponse = Extract<DistributionResponse, { type: "normalize_distribution" }>

const vectorPath = fileURLToPath(new URL("../spec/vectors/distribution.ndjson", import.meta.url))
const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: OracleRequest,
  expected: OracleResponse
})
type VectorValue = typeof Vector.Type

const vectors: ReadonlyArray<VectorValue> = readFileSync(vectorPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const raw: unknown = JSON.parse(line)
    return Schema.decodeUnknownSync(Vector)(raw, { onExcessProperty: "error" })
  })

const isPlanningRequest = (request: DistributionRequest): request is PlanningRequest =>
  Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    select_distribution_format: () => false,
    normalize_distribution: () => true,
    open_distribution: () => false,
    schedule_distribution: () => false,
    record_distribution: () => false,
    summarize_distribution: () => false
  }))

type PlanningVector = VectorValue & { readonly request: PlanningRequest }
const planningVectors = vectors.filter((vector): vector is PlanningVector =>
  isPlanningRequest(vector.request)
)

const oracle = (requests: ReadonlyArray<PlanningRequest>): ReadonlyArray<PlanningResponse> => {
  const encode = Schema.encodeSync(OracleRequest)
  const result = spawnSync(oraclePath, [], {
    input: requests.map((request) => JSON.stringify(encode(request)) + "\n").join(""),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Distribution planning oracle failed: ${result.stderr}`)
  return result.stdout.split("\n").filter(Boolean).map((line) => {
    const raw: unknown = JSON.parse(line)
    return Schema.decodeUnknownSync(OracleResponse)(raw, { onExcessProperty: "error" })
  }).filter(isPlanningResponse)
}

const isPlanningResponse = (response: DistributionResponse): response is PlanningResponse =>
  Match.value(response).pipe(Match.discriminatorsExhaustive("type")({
    select_distribution_format: () => false,
    normalize_distribution: () => true,
    open_distribution: () => false,
    schedule_distribution: () => false,
    record_distribution: () => false,
    summarize_distribution: () => false
  }))

const evaluate = (request: PlanningRequest): PlanningResponse => ({
  schema: 1,
  type: "normalize_distribution",
  output: normalizeDistribution(request.input)
})

const requestForCandidates = (candidates: ReadonlyArray<Candidate>): PlanningRequest => ({
  schema: 1,
  type: "normalize_distribution",
  input: Schema.decodeUnknownSync(NormalizationInput)({ candidates })
})

const permutations = <A>(values: ReadonlyArray<A>): Array<Array<A>> =>
  values.length === 0
    ? [[]]
    : values.flatMap((value, index) =>
      permutations([...values.slice(0, index), ...values.slice(index + 1)])
        .map((remaining) => [value, ...remaining])
    )

const planningVector = (name: string): PlanningVector => {
  const vector = planningVectors.find((candidate) => candidate.name === name)
  if (vector === undefined) throw new Error(`Missing authored planning vector ${name}`)
  return vector
}

const readyDescriptors = (candidates: PlanningRequest["input"]["candidates"]): ReadonlyArray<Candidate & { type: "ready" }> =>
  candidates.filter((candidate): candidate is Candidate & { type: "ready" } =>
    Match.value(candidate).pipe(Match.discriminatorsExhaustive("type")({
      ready: () => true,
      blocked: () => false
    }))
  )

const evaluateWithoutMutation = (request: PlanningRequest, label: string): PlanningResponse => {
  const input = request.input
  const before = structuredClone(input)
  const candidatesReference = input.candidates
  const candidateReferences = input.candidates.slice()
  const descriptorReferences = readyDescriptors(input.candidates).map(({ step }) => step)
  const response = evaluate(request)

  expect(input, `${label}: planning must preserve its input`).toEqual(before)
  expect(input.candidates, `${label}: planning must preserve the candidate list`).toBe(candidatesReference)
  expect(
    input.candidates.every((candidate, index) => candidate === candidateReferences[index]),
    `${label}: planning must preserve candidate order and references`
  ).toBe(true)
  Match.value(response.output).pipe(Match.discriminatorsExhaustive("type")({
    ready: ({ steps }) => {
      expect(steps, `${label}: ready output must preserve every descriptor`).toHaveLength(descriptorReferences.length)
      expect(
        steps.every((step) => descriptorReferences.some((descriptor) => descriptor === step)),
        `${label}: ready output must retain descriptor references`
      ).toBe(true)
    },
    blocked: () => undefined
  }))
  return response
}

it("matches every authored normalization vector in TypeScript and Lean", () => {
  expect(planningVectors).toHaveLength(12)
  const responses = oracle(planningVectors.map((vector) => vector.request))
  expect(responses).toHaveLength(planningVectors.length)

  for (const [index, vector] of planningVectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing Lean response for ${vector.name}`)
    expect(response, `${vector.name}: Lean response`).toEqual(vector.expected)
    expect(
      evaluateWithoutMutation(vector.request, vector.name),
      `${vector.name}: TypeScript response`
    ).toEqual(vector.expected)
  }
})

it("matches Lean for bounded blocked, collision, and Unicode candidate permutations", () => {
  const sources = [
    planningVector("all_issue_kinds_canonical").request.input.candidates,
    planningVector("blocked_prevents_subset").request.input.candidates,
    planningVector("utf8_label_order").request.input.candidates.slice(0, 4)
  ]
  const cases = sources.flatMap((candidates, sourceIndex) =>
    permutations(candidates).map((permutation, permutationIndex) => ({
      name: `source_${sourceIndex}_permutation_${permutationIndex}`,
      request: requestForCandidates(permutation)
    }))
  )
  const responses = oracle(cases.map(({ request }) => request))
  expect(responses).toHaveLength(cases.length)

  for (const [index, testCase] of cases.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing Lean response for ${testCase.name}`)
    expect(
      evaluateWithoutMutation(testCase.request, testCase.name),
      `${testCase.name}: TypeScript response`
    ).toEqual(response)
  }
})
