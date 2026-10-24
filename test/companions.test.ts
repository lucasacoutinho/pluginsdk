import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Companions from "../contracts/Companions.ts"
import { parseJson } from "../src/internal/json.ts"
import { reviewCompanions } from "../src/installer/companions/model.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Companions.OracleRequest,
  expected: Companions.OracleResponse
})
const equivalentResponse = Schema.toEquivalence(Companions.OracleResponse)

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(): ReadonlyArray<typeof Vector.Type> {
  return readFileSync(new URL("../spec/vectors/companions.ndjson", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => decode(Vector, parseJson(line)))
}

function evaluateWithoutMutation(input: Companions.ReviewInput): Companions.ReviewResult {
  const before = structuredClone(input)
  const previous = input.previous
  const desired = input.desired
  const observed = input.observed
  const previousEntries = previous.slice()
  const desiredEntries = desired.slice()
  const observedEntries = observed.slice()
  const output = reviewCompanions(input)
  expect(input, "companion input value").toEqual(before)
  expect(input.previous, "previous list reference").toBe(previous)
  expect(input.desired, "desired list reference").toBe(desired)
  expect(input.observed, "observed list reference").toBe(observed)
  for (const [index, file] of previous.entries()) {
    expect(file, `previous file reference ${index}`).toBe(previousEntries[index])
  }
  for (const [index, file] of desired.entries()) {
    expect(file, `desired file reference ${index}`).toBe(desiredEntries[index])
  }
  for (const [index, file] of observed.entries()) {
    expect(file, `observed file reference ${index}`).toBe(observedEntries[index])
  }
  return decode(Companions.ReviewResult, output)
}

function compare(requests: ReadonlyArray<Companions.OracleRequest>): ReadonlyArray<Companions.OracleResponse> {
  const lines = requests.map((request) => {
    const encoded: unknown = Schema.encodeSync(Companions.OracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("companion oracle request could not be encoded as JSON")
    return line
  })
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`Lean companion oracle exited with status ${String(result.status)}: ${result.stderr}`)
  }
  const responses = result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    return decode(Companions.OracleResponse, parseJson(line))
  })
  expect(responses, "Lean companion response count").toHaveLength(requests.length)

  for (const [index, request] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing companion oracle response ${index}`)
    const actual = decode(Companions.OracleResponse, {
      schema: 1,
      type: "review_companions",
      output: evaluateWithoutMutation(request.input)
    })
    expect(equivalentResponse(actual, response), `Lean companion case ${index}`).toBe(true)
  }
  return responses
}

function request(input: unknown): Companions.OracleRequest {
  return decode(Companions.OracleRequest, {
    schema: 1,
    type: "review_companions",
    input
  })
}

function identity(name: string, digest: string) {
  return { name, digest }
}

function observed(name: string, type: "absent" | "conflict" | "unknown") {
  return { name, observed: { type } }
}

function observedFile(name: string, digest: string) {
  return { name, observed: { type: "file", digest } }
}

function generatedRequests(): ReadonlyArray<Companions.OracleRequest> {
  const digestA = "a".repeat(64)
  const digestB = "b".repeat(64)
  const names = ["alpha", "mcp-review", "zulu", "team-kit:", "team-kit:😀"]
  const requests: Companions.OracleRequest[] = []

  for (const name of names) {
    const first = identity(name, digestA)
    const second = identity(name, digestB)
    const scenarios = [
      { previous: [], desired: [first], observed: [observed(name, "absent")] },
      { previous: [first], desired: [], observed: [observedFile(name, digestA)] },
      { previous: [first], desired: [first], observed: [observedFile(name, digestA)] },
      { previous: [first], desired: [second], observed: [observedFile(name, digestA)] },
      { previous: [], desired: [second], observed: [observedFile(name, digestA)] },
      { previous: [first], desired: [second], observed: [observed(name, "absent")] },
      { previous: [first], desired: [], observed: [observedFile(name, digestB)] },
      { previous: [first], desired: [second], observed: [observed(name, "unknown")] },
      { previous: [], desired: [first], observed: [observed(name, "conflict")] },
      { previous: [first], desired: [first], observed: [] },
      { previous: [], desired: [first], observed: [observed(name, "absent"), observed(name, "absent")] },
      { previous: [first], desired: [], observed: [observedFile(name, digestA), observedFile(name, digestB)] }
    ]
    for (const scenario of scenarios) requests.push(request(scenario))

    requests.push(request({
      previous: [first, second],
      desired: [],
      observed: [observed(name, "unknown")]
    }))
    requests.push(request({
      previous: [],
      desired: [first, second],
      observed: [observedFile(name, digestA)]
    }))
    requests.push(request({
      previous: [first, second],
      desired: [second, first],
      observed: []
    }))
  }
  return requests
}

function permutationRequests(): ReadonlyArray<Companions.OracleRequest> {
  const digestA = "a".repeat(64)
  const digestB = "b".repeat(64)
  const previous = [
    identity("zulu", digestA),
    identity("team-kit:😀", digestA),
    identity("team-kit:", digestA),
    identity("alpha", digestA),
    identity("alpha", digestB)
  ]
  const desired = [
    identity("mcp-review", digestB),
    identity("team-kit:😀", digestA),
    identity("team-kit:", digestB),
    identity("alpha", digestA),
    identity("alpha", digestB)
  ]
  const observations = [
    observedFile("zulu", digestA),
    observedFile("team-kit:😀", digestA),
    observedFile("team-kit:", digestA),
    observedFile("alpha", digestA),
    observed("mcp-review", "unknown")
  ]
  const variants = [
    { previous, desired, observed: observations },
    { previous: [...previous].reverse(), desired: [...desired].reverse(), observed: [...observations].reverse() },
    { previous: [...previous.slice(2), ...previous.slice(0, 2)], desired, observed: [...observations].reverse() },
    { previous, desired: [...desired.slice(3), ...desired.slice(0, 3)], observed: observations },
    { previous: [...previous].reverse(), desired: [...desired.slice(2), ...desired.slice(0, 2)], observed: observations },
    { previous, desired: [...desired].reverse(), observed: [...observations.slice(2), ...observations.slice(0, 2)] }
  ]
  return variants.map((variant) => request(variant))
}

const vectors = readVectors()

it("matches all 28 authored companion vectors against the strict Lean oracle", () => {
  expect(vectors).toHaveLength(28)
  const responses = compare(vectors.map(({ request: vectorRequest }) => vectorRequest))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing authored companion response for ${vector.name}`)
    expect(equivalentResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("covers generated transitions, collisions, observation states, and multiple issues", () => {
  const requests = generatedRequests()
  expect(requests).toHaveLength(75)
  compare(requests)
})

it("keeps canonical decisions stable under input permutations and UTF-8 name order", () => {
  const requests = permutationRequests()
  expect(requests).toHaveLength(6)
  const responses = compare(requests)
  const first = responses[0]
  if (first === undefined) throw new Error("Missing companion permutation baseline")
  for (const [index, response] of responses.entries()) {
    expect(equivalentResponse(response, first), `companion permutation ${index}`).toBe(true)
  }
})
