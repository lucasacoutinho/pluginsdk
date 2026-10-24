import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import {
  ContractBindingInput,
  ContractBindingResult,
  ContractIdentity,
  NormalizeToolsInput,
  OracleRequest,
  OracleResponse,
  ToolDescriptor
} from "../contracts/ToolContract.ts"
import { checkContractBinding, normalizeTools } from "../src/catalog/tools/model.ts"

const vectorPath = fileURLToPath(new URL("../spec/vectors/tool-contracts.ndjson", import.meta.url))
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

const oracle = (requests: ReadonlyArray<OracleRequest>): ReadonlyArray<OracleResponse> => {
  const encode = Schema.encodeSync(OracleRequest)
  const result = spawnSync(oraclePath, [], {
    input: requests.map((request) => JSON.stringify(encode(request)) + "\n").join(""),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Tool contract oracle failed: ${result.stderr}`)
  return result.stdout.split("\n").filter(Boolean).map((line) => {
    const raw: unknown = JSON.parse(line)
    return Schema.decodeUnknownSync(OracleResponse)(raw, { onExcessProperty: "error" })
  })
}

const evaluate = (request: OracleRequest): OracleResponse =>
  Match.value(request).pipe(
    Match.discriminatorsExhaustive("type")({
      normalize_tools: ({ input }): OracleResponse => ({
        schema: 1,
        type: "normalize_tools",
        output: normalizeTools(input)
      }),
      check_contract_binding: ({ input }): OracleResponse => ({
        schema: 1,
        type: "check_contract_binding",
        output: checkContractBinding(input)
      })
    })
  )

const tool = (name: string, digestCharacter: string): ToolDescriptor =>
  Schema.decodeSync(ToolDescriptor)({ name, digest: digestCharacter.repeat(64) })

const normalizeRequest = (tools: ReadonlyArray<ToolDescriptor>) => {
  const input = Schema.decodeSync(NormalizeToolsInput)({ tools })
  return Schema.decodeSync(OracleRequest.members[0])({ schema: 1, type: "normalize_tools", input })
}

const identity = (organization: string, service: string, digestCharacter: string) =>
  Schema.decodeSync(ContractIdentity)({
    organization,
    service,
    digest: digestCharacter.repeat(64)
  })

const bindingRequest = (
  expected: ContractIdentity,
  actual: ContractIdentity
) =>
  Schema.decodeSync(OracleRequest.members[1])({
    schema: 1,
    type: "check_contract_binding",
    input: { expected, actual }
  })

it("matches all 27 independent tool contract vectors in TypeScript and Lean", () => {
  expect(vectors).toHaveLength(27)
  const responses = oracle(vectors.map((vector) => vector.request))
  expect(responses).toHaveLength(vectors.length)
  for (const [index, vector] of vectors.entries()) {
    expect(responses[index], vector.name).toEqual(vector.expected)
    expect(evaluate(vector.request), vector.name).toEqual(vector.expected)
  }
})

it("normalizes generated descriptor lists without mutation or metadata loss", () => {
  const generatedUnique = ["read", "Read", "é", "e\u0301", "中", "😀", "a", "z"]
    .map((name, index) => tool(name, index.toString(16)))
  const prefixes = Array.from({ length: generatedUnique.length + 1 }, (_, length) =>
    generatedUnique.slice(0, length)
  )
  const reorderedPrefixes = prefixes.toReversed().map((tools) => tools.toReversed())
  const repeatedNames = [
    [tool("read", "a"), tool("write", "b"), tool("read", "c"), tool("Read", "d")],
    [tool("é", "a"), tool("中", "b"), tool("e\u0301", "c"), tool("é", "d"), tool("中", "e")],
    [...generatedUnique, ...generatedUnique.toReversed()]
  ]
  const generatedLists = [...prefixes, ...reorderedPrefixes, ...repeatedNames]
  const requests = generatedLists.flatMap((tools) => [
    normalizeRequest(tools),
    normalizeRequest(tools.toReversed())
  ])
  const responses = oracle(requests)
  expect(responses).toHaveLength(requests.length)

  for (const [index, request] of requests.entries()) {
    const expected = responses[index]
    if (expected === undefined) throw new Error("Missing tool normalization oracle response")
    expect(evaluate(request), `generated tool list ${index}`).toEqual(expected)

    const input = request.input
    const before = structuredClone(input)
    const inputTools = input.tools
    const toolObjects = input.tools.slice()
    const result = normalizeTools(input)
    expect(input).toEqual(before)
    expect(input.tools).toBe(inputTools)
    expect(input.tools.every((descriptor, toolIndex) => descriptor === toolObjects[toolIndex])).toBe(true)

    Match.value(result).pipe(
      Match.discriminatorsExhaustive("type")({
        accepted: ({ tools }) => {
          for (const normalized of tools) {
            const original = input.tools.find((descriptor) => descriptor.name === normalized.name)
            if (original === undefined) throw new Error(`Missing descriptor for ${normalized.name}`)
            expect(normalized).toBe(original)
            expect(normalized.digest).toBe(original.digest)
          }
        },
        rejected: () => undefined
      })
    )
  }
})

it("checks every exact organization, service and digest binding combination", () => {
  const expectedIdentity = identity("Acme", "é", "a")
  const truthTable = [
    { organization: false, service: false, digest: false, issues: [] },
    { organization: true, service: false, digest: false, issues: ["organization_mismatch"] },
    { organization: false, service: true, digest: false, issues: ["service_mismatch"] },
    { organization: true, service: true, digest: false, issues: ["organization_mismatch", "service_mismatch"] },
    { organization: false, service: false, digest: true, issues: ["digest_mismatch"] },
    { organization: true, service: false, digest: true, issues: ["digest_mismatch", "organization_mismatch"] },
    { organization: false, service: true, digest: true, issues: ["digest_mismatch", "service_mismatch"] },
    {
      organization: true,
      service: true,
      digest: true,
      issues: ["digest_mismatch", "organization_mismatch", "service_mismatch"]
    }
  ]
  const cases = truthTable.map((row) => {
    const actualIdentity = identity(
      row.organization ? "acme" : "Acme",
      row.service ? "e\u0301" : "é",
      row.digest ? "b" : "a"
    )
    const input = Schema.decodeSync(ContractBindingInput)({ expected: expectedIdentity, actual: actualIdentity })
    const request = bindingRequest(input.expected, input.actual)
    const expected = row.issues.length === 0
      ? Schema.decodeSync(ContractBindingResult)({ type: "accepted" })
      : Schema.decodeUnknownSync(ContractBindingResult)({ type: "rejected", issues: row.issues })
    return { input, request, expected }
  })
  const responses = oracle(cases.map(({ request }) => request))
  expect(responses).toHaveLength(truthTable.length)

  for (const [index, testCase] of cases.entries()) {
    const before = structuredClone(testCase.input)
    const actual = checkContractBinding(testCase.input)
    expect(actual).toEqual(testCase.expected)
    expect(testCase.input).toEqual(before)
    expect(evaluate(testCase.request)).toEqual(responses[index])
    expect(evaluate(testCase.request)).toEqual({
      schema: 1,
      type: "check_contract_binding",
      output: testCase.expected
    })
  }
})
