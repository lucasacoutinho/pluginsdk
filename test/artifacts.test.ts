import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { OracleRequest, OracleResponse, PackageSetInput, PackageSetResult } from "../contracts/Artifacts.ts"
import { Format } from "../contracts/Compiler.ts"
import { checkPackages } from "../src/catalog/artifacts/model.ts"

const vectorPath = fileURLToPath(new URL("../spec/vectors/artifacts.ndjson", import.meta.url))
const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: OracleRequest,
  expected: OracleResponse
})
const vectors = readFileSync(vectorPath, "utf8").split("\n").filter(Boolean)
  .map((line) => Schema.decodeUnknownSync(Vector)(JSON.parse(line), { onExcessProperty: "error" }))

const oracle = (requests: ReadonlyArray<OracleRequest>): ReadonlyArray<OracleResponse> => {
  const encode = Schema.encodeSync(OracleRequest)
  const result = spawnSync(oraclePath, [], {
    input: requests.map((request) => JSON.stringify(encode(request)) + "\n").join(""),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Artifact oracle failed: ${result.stderr}`)
  return result.stdout.split("\n").filter(Boolean).map((line) =>
    Schema.decodeUnknownSync(OracleResponse)(JSON.parse(line), { onExcessProperty: "error" })
  )
}

it("matches independently authored package binding vectors in TypeScript and Lean", () => {
  const responses = oracle(vectors.map((vector) => vector.request))
  expect(responses).toHaveLength(vectors.length)
  for (const [index, vector] of vectors.entries()) {
    expect(responses[index], vector.name).toEqual(vector.expected)
    expect(checkPackages(vector.request.input), vector.name).toEqual(vector.expected.output)
  }
})

it("conforms on package identity, digest, version and multiplicity across every format", () => {
  const inputs: PackageSetInput[] = []
  for (const format of Format.literals) {
    for (const count of [0, 1, 2]) {
      for (let differences = 0; differences < 8; differences++) {
        const artifact = {
          plugin: (differences & 1) === 0 ? "team-kit" : "other-app",
          format,
          version: (differences & 2) === 0 ? "1.0.0" : "2.0.0",
          digest: ((differences & 4) === 0 ? "a" : "b").repeat(64)
        }
        inputs.push(Schema.decodeSync(PackageSetInput)({
          plugin: "team-kit", version: "1.0.0", packages: { [format]: "a".repeat(64) },
          artifacts: Array.from({ length: count }, () => artifact)
        }))
      }
    }
  }
  expect(inputs).toHaveLength(Format.literals.length * 24)
  const responses = oracle(inputs.map((input) => ({ schema: 1, type: "check_packages", input })))
  expect(responses).toHaveLength(inputs.length)
  for (const [index, input] of inputs.entries()) {
    const actual = checkPackages(input)
    expect(actual).toEqual(responses[index]?.output)
    expect(checkPackages({ ...input, artifacts: input.artifacts.toReversed() })).toEqual(actual)
  }
})

it("rejects empty package declarations and malformed descriptors or diagnostics", () => {
  const sample = vectors[0]
  if (sample === undefined) throw new Error("Missing authored package-set fixture")
  const input = sample.request.input
  for (const malformed of [
    { ...input, packages: {} },
    { ...input, packages: { unknown: "a".repeat(64) } },
    { ...input, artifacts: [{ plugin: "team-kit", format: "unknown", version: "1", digest: "a".repeat(64) }] },
    { ...input, artifacts: [{ plugin: "team-kit", format: "claude_code_v4", version: "", digest: "a".repeat(64) }] }
  ]) {
    expect(() => Schema.decodeUnknownSync(PackageSetInput)(malformed, { onExcessProperty: "error" })).toThrow()
  }
  expect(() => Schema.decodeUnknownSync(PackageSetResult)({ type: "rejected", issues: [] })).toThrow()
  expect(() => Schema.decodeUnknownSync(PackageSetResult)({
    type: "rejected", issues: [{ type: "unknown", format: "claude_code_v4" }]
  })).toThrow()
})
