import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { Format, type Format as CompilerFormat } from "../contracts/Compiler.ts"
import {
  LocalHost,
  OracleRequest,
  OracleResponse,
  SelectionInput,
  type LocalHost as DistributionLocalHost,
  type OracleRequest as DistributionRequest,
  type OracleResponse as DistributionResponse,
  type SelectionInput as DistributionSelectionInput
} from "../contracts/DistributionModel.ts"
import { packageClient } from "../src/installer/target/packages.ts"
import { selectDistributionFormat } from "../src/distribution/selection.ts"

type SelectionRequest = Extract<DistributionRequest, { type: "select_distribution_format" }>
type SelectionResponse = Extract<DistributionResponse, { type: "select_distribution_format" }>

const vectorPath = fileURLToPath(new URL("../spec/vectors/distribution.ndjson", import.meta.url))
const oraclePath = process.env["PLUGINSDK_ORACLE"] ??
  fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: OracleRequest,
  expected: OracleResponse
})
type VectorValue = typeof Vector.Type
type SelectionVector = Omit<VectorValue, "request" | "expected"> & {
  readonly request: SelectionRequest
  readonly expected: SelectionResponse
}

const selectedVectors: ReadonlyArray<SelectionVector> = readFileSync(vectorPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const raw: unknown = JSON.parse(line)
    return Schema.decodeUnknownSync(Vector)(raw, { onExcessProperty: "error" })
  })
  .flatMap((vector): SelectionVector[] => {
    if (vector.request.type !== "select_distribution_format") return []
    if (vector.expected.type !== "select_distribution_format") {
      throw new Error(`Selection vector has a different response operation: ${vector.name}`)
    }
    return [{ ...vector, request: vector.request, expected: vector.expected }]
  })

const oracle = (
  requests: ReadonlyArray<DistributionRequest>
): ReadonlyArray<DistributionResponse> => {
  const encode = Schema.encodeSync(OracleRequest)
  const result = spawnSync(oraclePath, [], {
    input: requests.map((request) => JSON.stringify(encode(request)) + "\n").join(""),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Distribution selection oracle failed: ${result.stderr}`)
  return result.stdout.split("\n").filter(Boolean).map((line) => {
    const raw: unknown = JSON.parse(line)
    return Schema.decodeUnknownSync(OracleResponse)(raw, { onExcessProperty: "error" })
  })
}

const selectionInput = (
  host: DistributionLocalHost,
  formats: ReadonlyArray<CompilerFormat>
): DistributionSelectionInput =>
  Schema.decodeSync(SelectionInput)({ host, formats })

const selectionRequest = (
  input: DistributionSelectionInput
): SelectionRequest =>
  Schema.decodeSync(OracleRequest.members[0])({
    schema: 1,
    type: "select_distribution_format",
    input
  })

const evaluate = (request: SelectionRequest): SelectionResponse => ({
  schema: 1,
  type: "select_distribution_format",
  output: selectDistributionFormat(request.input)
})

const evaluateWithoutMutation = (
  request: SelectionRequest,
  label: string
): SelectionResponse => {
  const input = request.input
  const before = structuredClone(input)
  const formatsReference = input.formats
  const formatsBefore = input.formats.slice()
  const response = evaluate(request)
  expect(input, `${label}: selection must preserve its input`).toEqual(before)
  expect(input.formats, `${label}: selection must preserve the format list`).toBe(formatsReference)
  expect(
    input.formats.every((format, index) => format === formatsBefore[index]),
    `${label}: selection must preserve format order and declarations`
  ).toBe(true)
  return response
}

const expectSelected = (
  response: SelectionResponse,
  format: CompilerFormat,
  label: string
): void => {
  Match.value(response.output).pipe(
    Match.discriminatorsExhaustive("type")({
      selected: ({ format: selectedFormat }) => {
        expect(selectedFormat, label).toBe(format)
      },
      blocked: ({ reason }) => {
        throw new Error(`${label}: expected a selected format, received ${reason}`)
      }
    })
  )
}

const generatedRequests = (): Array<{ readonly name: string; readonly request: SelectionRequest }> => {
  const subsets = Array.from({ length: 1 << Format.literals.length }, (_, mask) =>
    Format.literals.filter((_, index) => (mask & (1 << index)) !== 0)
  )

  const generated: Array<{ readonly name: string; readonly request: SelectionRequest }> = []
  for (const host of LocalHost.literals) {
    for (const [index, formats] of subsets.entries()) {
      generated.push({
        name: `${host}_subset_${index}`,
        request: selectionRequest(selectionInput(host, formats))
      })
      const reversed = formats.toReversed()
      if (formats.join("\0") !== reversed.join("\0")) {
        generated.push({
          name: `${host}_subset_${index}_reversed`,
          request: selectionRequest(selectionInput(host, reversed))
        })
      }
    }
    for (const [index, format] of Format.literals.entries()) {
      generated.push({
        name: `${host}_duplicate_${index}`,
        request: selectionRequest(selectionInput(host, [format, format]))
      })
    }
  }
  return generated
}

it("matches every independent distribution selection vector in TypeScript and Lean", () => {
  expect(new Set(selectedVectors.map(({ request }) => request.input.host))).toEqual(new Set(LocalHost.literals))
  const responses = oracle(selectedVectors.map((vector) => vector.request))
  expect(responses).toHaveLength(selectedVectors.length)

  const outcomes = new Set<string>()

  for (const [index, vector] of selectedVectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing Lean response for ${vector.name}`)
    expect(response, `${vector.name}: Lean response`).toEqual(vector.expected)
    const actual = evaluateWithoutMutation(vector.request, vector.name)
    expect(actual, `${vector.name}: TypeScript response`).toEqual(vector.expected)
    outcomes.add(Match.value(actual.output).pipe(Match.discriminatorsExhaustive("type")({
      selected: () => "selected",
      blocked: ({ reason }) => reason
    })))
  }
  expect(outcomes).toEqual(new Set(["selected", "unavailable", "ambiguous"]))
  expect(selectedVectors.some(({ expected }) =>
    expected.output.type === "blocked" && expected.output.reason === "unavailable"
  )).toBe(true)
  expect(selectedVectors.some(({ request, expected }) => {
    const formats = request.input.formats
    return expected.output.type === "blocked" && expected.output.reason === "ambiguous" &&
      new Set(formats).size < formats.length
  })).toBe(true)
  expect(selectedVectors.some(({ request, expected }) =>
    request.input.host === "cursor" && expected.output.type === "selected" &&
    expected.output.format === "claude_code"
  )).toBe(true)
})

it("matches Lean for all host and declared-format subsets, reversals, and duplicates", () => {
  const cases = generatedRequests()
  expect(new Set(cases.map(({ request }) => request.input.host))).toEqual(new Set(LocalHost.literals))
  expect(new Set(cases.map(({ request }) => request.input.formats.toSorted().join("\0"))))
    .toEqual(new Set([
      "",
      "claude_code",
      "codex",
      "claude_code\0codex",
      "claude_code\0claude_code",
      "codex\0codex"
    ]))
  const responses = oracle(cases.map(({ request }) => request))
  expect(responses).toHaveLength(cases.length)

  const outcomes = new Set<string>()

  for (const [index, testCase] of cases.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing Lean response for ${testCase.name}`)
    const actual = evaluateWithoutMutation(testCase.request, testCase.name)
    expect(actual, `${testCase.name}: TypeScript response`).toEqual(response)
    outcomes.add(actual.output.type === "selected" ? "selected" : actual.output.reason)
  }
  expect(outcomes).toEqual(new Set(["selected", "unavailable", "ambiguous"]))
})

it("selects the package format compatible with each local host", () => {
  expect(packageClient("cursor")).toBe("claude_code")
  const cases = LocalHost.literals.map((host) => {
    const format = packageClient(host)
    return {
      host,
      format,
      request: selectionRequest(selectionInput(host, [format]))
    }
  })
  const responses = oracle(cases.map(({ request }) => request))
  expect(responses).toHaveLength(LocalHost.literals.length)

  for (const [index, testCase] of cases.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing Lean response for ${testCase.host}`)
    expect(response).toEqual({
      schema: 1,
      type: "select_distribution_format",
      output: { type: "selected", format: testCase.format }
    })
    const actual = evaluateWithoutMutation(testCase.request, testCase.host)
    expect(actual).toEqual(response)
    expectSelected(actual, testCase.format, testCase.host)
  }
})
