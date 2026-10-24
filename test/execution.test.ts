import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Execution from "../contracts/Execution.ts"
import { executionDomainStatus } from "../src/installer/execution/model.ts"
import { parseJson } from "../src/internal/json.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Execution.OracleRequest,
  expected: Execution.OracleResponse
})
const sameResponse = Schema.toEquivalence(Execution.OracleResponse)
const decodeRequest = Schema.decodeUnknownSync(Execution.OracleRequest, { onExcessProperty: "error" })
const decodeResponse = Schema.decodeUnknownSync(Execution.OracleResponse, { onExcessProperty: "error" })

function compare(requests: ReadonlyArray<Execution.OracleRequest>): ReadonlyArray<Execution.OracleResponse> {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(Execution.OracleRequest)(request))).join("\n")
  const result = spawnSync(oracle, [], { input: `${input}\n`, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Execution oracle exited ${String(result.status)}: ${result.stderr}`)
  const responses = result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => decodeResponse(parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(request)
    const actual = decodeResponse({ schema: 1, type: "execution_domain_status", output: executionDomainStatus(request.input) })
    expect(request).toEqual(before)
    const expected = responses[index]
    if (expected === undefined) throw new Error(`Missing execution oracle response ${index}`)
    expect(sameResponse(actual, expected), `execution case ${index}`).toBe(true)
  }
  return responses
}

it("conforms to the authored bound-evidence cases", () => {
  const decodeVector = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/execution.ndjson", import.meta.url), "utf8")
    .split(/\r?\n/).filter((line) => line.length > 0).map((line) => decodeVector(parseJson(line)))
  expect(vectors).toHaveLength(22)
  const responses = compare(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing authored execution case ${vector.name}`)
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms across process domains, epochs, identities and observations", () => {
  const groups = [1, 17, 0xffff_ffff].map((value) => Execution.ProcessId.make(value))
  const boots = ["boot-a", "boot-b", "epoch-é-😀"].map((value) => Execution.BootId.make(value))
  const names = ["a", "b"].map((character) => Execution.JobName.make(`Global\\pluginsdk-${character.repeat(64)}`))
  const domains: ReadonlyArray<Execution.ProcessDomain> = [
    ...groups.flatMap((group) => boots.map((boot): Execution.ProcessDomain => ({ type: "process_group", group, boot }))),
    ...names.map((name): Execution.ProcessDomain => ({ type: "windows_job", name }))
  ]
  const observations: ReadonlyArray<Execution.DomainObservation> = [
    { type: "unknown" },
    ...boots.map((boot): Execution.DomainObservation => ({ type: "boot", boot })),
    ...domains.flatMap((domain) => Match.value(domain).pipe(Match.discriminatorsExhaustive("type")({
      process_group: (domain): ReadonlyArray<Execution.DomainObservation> => [
        { ...domain, state: "present" }, { ...domain, state: "absent" }
      ],
      windows_job: (domain): ReadonlyArray<Execution.DomainObservation> => [
        { ...domain, state: "active" }, { ...domain, state: "empty" }, { ...domain, state: "absent" }
      ]
    })))
  ]
  const requests = domains.flatMap((domain) => observations.map((observed): Execution.OracleRequest => ({
    schema: 1, type: "execution_domain_status", input: { domain, observed }
  })))
  expect(requests).toHaveLength(308)
  compare(requests)
})

it("rejects malformed process identities and observation variants", () => {
  const name = `Global\\pluginsdk-${"a".repeat(64)}`
  const group = { type: "process_group", group: 17, boot: "boot-a" }
  const job = { type: "windows_job", name }
  const request = (domain: unknown, observed: unknown) => ({ schema: 1, type: "execution_domain_status", input: { domain, observed } })
  for (const value of [0, -1, 1.5, 0x1_0000_0000, true, null, "17"]) {
    expect(() => decodeRequest(request({ ...group, group: value }, { type: "unknown" }))).toThrow()
    expect(() => decodeRequest(request(group, { ...group, group: value, state: "absent" }))).toThrow()
  }
  for (const value of ["", "\0", "\ud800", false, null]) {
    expect(() => decodeRequest(request({ ...group, boot: value }, { type: "unknown" }))).toThrow()
    expect(() => decodeRequest(request(group, { type: "boot", boot: value }))).toThrow()
  }
  for (const value of ["", name.replace("Global", "Local"), name.toUpperCase(), name.slice(1), `${name}a`, name.slice(0, -1), `${name}\n`, `${name}\r\n`, `${name}\u2028`, `${name}\u2029`, false, null]) {
    expect(() => decodeRequest(request({ ...job, name: value }, { type: "unknown" }))).toThrow()
    expect(() => decodeRequest(request(job, { ...job, name: value, state: "empty" }))).toThrow()
  }
  for (const observed of [
    { type: "unknown", state: "absent" }, { ...group, state: "empty" },
    { ...job, state: "present" }, { ...job }, { type: "other" }
  ]) expect(() => decodeRequest(request(group, observed))).toThrow()
})
