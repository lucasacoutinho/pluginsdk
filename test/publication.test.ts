import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Publication from "../contracts/Publication.ts"
import { parseJson } from "../src/internal/json.ts"
import { publishRelease } from "../src/project/publication.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Publication.OracleRequest,
  expected: Publication.OracleResponse
})
const sameResponse = Schema.toEquivalence(Publication.OracleResponse)
const decodeRequest = Schema.decodeUnknownSync(Publication.OracleRequest, { onExcessProperty: "error" })
const decodeResponse = Schema.decodeUnknownSync(Publication.OracleResponse, { onExcessProperty: "error" })

function compare(requests: ReadonlyArray<typeof Publication.OracleRequest.Type>) {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(Publication.OracleRequest)(request))).join("\n")
  const result = spawnSync(oracle, [], { input: `${input}\n`, encoding: "utf8", timeout: 30_000, maxBuffer: 24 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Publication oracle exited ${String(result.status)}: ${result.stderr}`)
  const responses = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => decodeResponse(parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(request.input)
    const output = publishRelease(request.input)
    expect(request.input).toEqual(before)
    const actual = decodeResponse({ schema: 1, type: "publish_release", output })
    const expected = responses[index]
    if (expected === undefined) throw new Error(`Missing publication response ${index}`)
    expect(sameResponse(actual, expected), `publication case ${index}`).toBe(true)
  }
  return responses
}

it("matches independently authored publication cases against Lean", () => {
  const vectors = readFileSync(new URL("../spec/vectors/publication.ndjson", import.meta.url), "utf8")
    .split(/\r?\n/).filter(Boolean).map((line) => Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })(parseJson(line)))
  expect(vectors).toHaveLength(16)
  const responses = compare(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing authored publication case ${vector.name}`)
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms across small histories and keeps completed releases stable", () => {
  const alphabet = [
    { plugin: "demo", version: "1", digest: "a".repeat(64) },
    { plugin: "demo", version: "1", digest: "b".repeat(64) },
    { plugin: "demo", version: "2", digest: "c".repeat(64) },
    { plugin: "other", version: "1", digest: "a".repeat(64) },
    { plugin: "other", version: "版本 😀", digest: "d".repeat(64) }
  ].map((entry) => Schema.decodeUnknownSync(Publication.Publication)(entry))
  const histories: ReadonlyArray<Publication.Publication>[] = [[]]
  let frontier: ReadonlyArray<Publication.Publication>[] = [[]]
  for (let length = 1; length <= 3; length++) {
    frontier = frontier.flatMap((prefix) => alphabet.map((entry) => [...prefix, entry]))
    histories.push(...frontier)
  }
  const requests = histories.flatMap((history) => alphabet.map((desired) => decodeRequest({
    schema: 1, type: "publish_release", input: { history, desired }
  })))
  expect(requests).toHaveLength(780)
  compare(requests)
  for (const { input } of requests) {
    Match.value(publishRelease(input)).pipe(Match.discriminatorsExhaustive("type")({
      published: ({ history }) => {
        expect(publishRelease({ ...input, history })).toEqual({ type: "unchanged", history })
        expect(history.slice(0, -1)).toEqual(input.history)
      },
      unchanged: ({ history }) => expect(history).toBe(input.history),
      blocked: () => undefined
    }))
  }
})

it("rejects malformed publication records at the Effect seam", () => {
  const entry = { plugin: "demo", version: "1", digest: "a".repeat(64) }
  const base = { schema: 1, type: "publish_release", input: { history: [entry], desired: entry } }
  for (const desired of [
    { ...entry, plugin: "bad--id" }, { ...entry, version: "" },
    { ...entry, digest: "A".repeat(64) }, { ...entry, extra: true }
  ]) expect(() => decodeRequest({ ...base, input: { ...base.input, desired } })).toThrow()
  expect(() => decodeRequest({ ...base, extra: true })).toThrow()
})
