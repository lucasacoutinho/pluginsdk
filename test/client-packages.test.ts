import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { LocalClient, type LocalClient as Client } from "../contracts/Clients.ts"
import { OracleRequest, OracleResponse } from "../contracts/ClientPackages.ts"
import { buildClients, packageClient } from "../src/installer/target/packages.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({ request: OracleRequest, response: OracleResponse })

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

const evaluate = (request: OracleRequest): OracleResponse => Match.value(request).pipe(
  Match.discriminatorsExhaustive("type")({
    client_package_host: ({ input }): OracleResponse => ({
      schema: 1, type: "client_package_host", output: packageClient(input.client)
    }),
    normalize_build_clients: ({ input }): OracleResponse => ({
      schema: 1, type: "normalize_build_clients", output: buildClients(input.clients)
    })
  })
)

const oracle = (requests: ReadonlyArray<OracleRequest>): ReadonlyArray<OracleResponse> => {
  const result = spawnSync(oraclePath, [], {
    input: requests.map((request) => JSON.stringify(Schema.encodeSync(OracleRequest)(request)) + "\n").join(""),
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Client-package oracle failed: ${result.stderr}`)
  return result.stdout.trimEnd().split("\n").map((line) => decode(OracleResponse, JSON.parse(line)))
}

it("matches independent package-family and canonical build-client examples", () => {
  const vectors = readFileSync(new URL("../spec/vectors/client-packages.ndjson", import.meta.url), "utf8")
    .trimEnd().split("\n").map((line) => decode(Vector, JSON.parse(line)))
  expect(vectors).toHaveLength(24)
  const responses = oracle(vectors.map(({ request }) => request))
  expect(responses).toHaveLength(vectors.length)
  vectors.forEach(({ request, response }, index) => {
    expect(responses[index], `example ${index}: Lean`).toEqual(response)
    expect(evaluate(request), `example ${index}: TypeScript`).toEqual(response)
  })
})

it("matches Lean for all client sequences of length one through six without mutating inputs", () => {
  const requests: OracleRequest[] = LocalClient.literals.map((client) => ({
    schema: 1, type: "client_package_host", input: { client }
  }))
  let sequences: ReadonlyArray<ReadonlyArray<Client>> = [[]]
  for (let length = 1; length <= 6; length++) {
    sequences = sequences.flatMap((prefix) => LocalClient.literals.map((client) => [...prefix, client]))
    for (const clients of sequences) {
      requests.push(decode(OracleRequest, { schema: 1, type: "normalize_build_clients", input: { clients } }))
    }
  }
  expect(requests).toHaveLength(1095)
  const responses = oracle(requests)
  expect(responses).toHaveLength(requests.length)
  requests.forEach((request, index) => {
    const before = structuredClone(request)
    expect(evaluate(request), `generated case ${index}`).toEqual(responses[index])
    expect(request).toEqual(before)
  })
})

it("refuses malformed client-package requests in both strict decoders", () => {
  const requests: unknown = JSON.parse(readFileSync(
    new URL("./fixtures/client-packages-invalid.json", import.meta.url), "utf8"
  ))
  const malformed = decode(Schema.Array(Schema.Unknown), requests)
  expect(malformed).toHaveLength(54)
  for (const request of malformed) {
    expect(() => decode(OracleRequest, request)).toThrow()
    const result = spawnSync(oraclePath, [], { input: JSON.stringify(request) + "\n", encoding: "utf8", timeout: 10_000 })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stdout).toBe("")
  }
})
