import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as ProjectConfig from "../contracts/ProjectConfig.ts"
import { parseJson } from "../src/internal/json.ts"
import { editProjectConfig } from "../src/installer/project/config/model.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: ProjectConfig.OracleRequest,
  expected: ProjectConfig.OracleResponse
})
const equivalentResponse = Schema.toEquivalence(ProjectConfig.OracleResponse)
const key = ProjectConfig.BlockKey.make("a".repeat(64))
const other = ProjectConfig.BlockKey.make("b".repeat(64))

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function compare(requests: ReadonlyArray<typeof ProjectConfig.OracleRequest.Type>) {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(ProjectConfig.OracleRequest)(request))).join("\n")
  const result = spawnSync(oraclePath, [], { input: `${input}\n`, encoding: "utf8", timeout: 30_000, maxBuffer: 24 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Project-config oracle exited ${String(result.status)}: ${result.stderr}`)
  const responses = result.stdout.split(/\r?\n/).filter((line) => line.length > 0)
    .map((line) => decode(ProjectConfig.OracleResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(request.input)
    const document = request.input.document
    const output = editProjectConfig(request.input)
    expect(request.input).toEqual(before)
    expect(request.input.document).toBe(document)
    const actual = decode(ProjectConfig.OracleResponse, { schema: 1, type: "edit_project_config", output })
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing project-config response ${index}`)
    expect(equivalentResponse(actual, response), `project-config case ${index}`).toBe(true)
  }
  return responses
}

function request(input: ProjectConfig.EditInput): typeof ProjectConfig.OracleRequest.Type {
  return { schema: 1, type: "edit_project_config", input }
}

function foreign(document: ReadonlyArray<ProjectConfig.Segment>) {
  return document.filter((segment) => Match.value(segment).pipe(Match.discriminatorsExhaustive("type")({
    external: () => true,
    managed: (segment) => segment.key !== key
  })))
}

function generatedInputs(): ReadonlyArray<ProjectConfig.EditInput> {
  const alphabet: ReadonlyArray<ProjectConfig.Segment> = [
    { type: "external", content: "" },
    { type: "external", content: "é é\r\n😀" },
    { type: "managed", key, content: "old" },
    { type: "managed", key, content: "" },
    { type: "managed", key: other, content: "unrelated" }
  ]
  const documents: ReadonlyArray<ProjectConfig.Segment>[] = [[]]
  let frontier: ReadonlyArray<ProjectConfig.Segment>[] = [[]]
  for (let length = 1; length <= 3; length++) {
    frontier = frontier.flatMap((prefix) => alphabet.map((segment) => [...prefix, segment]))
    documents.push(...frontier)
  }
  const values = [null, "", "old", "new"]
  return documents.flatMap((document) => values.flatMap((previous) =>
    values.map((desired) => ({ key, previous, desired, document }))))
}

it("matches independently authored project-config cases against Lean", () => {
  const vectors = readFileSync(new URL("../spec/vectors/project-config.ndjson", import.meta.url), "utf8")
    .split(/\r?\n/).filter((line) => line.length > 0).map((line) => decode(Vector, parseJson(line)))
  expect(vectors).toHaveLength(24)
  const responses = compare(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const actual = responses[index]
    if (actual === undefined) throw new Error(`Missing authored case ${vector.name}`)
    expect(equivalentResponse(actual, vector.expected), vector.name).toBe(true)
  }
})

it("conforms on complete small documents and preserves foreign bytes and replay", () => {
  const inputs = generatedInputs()
  expect(inputs).toHaveLength(2_496)
  compare(inputs.map(request))
  for (const input of inputs) {
    const output = editProjectConfig(input)
    Match.value(output).pipe(Match.discriminatorsExhaustive("type")({
      blocked: () => undefined,
      ready: ({ document }) => {
        expect(foreign(document)).toEqual(foreign(input.document))
        expect(editProjectConfig({ ...input, previous: input.desired, document })).toEqual({ type: "ready", document })
        if (input.previous === input.desired) expect(document).toBe(input.document)
      }
    }))
  }
})

it("rejects malformed segments and keys at the Effect schema seam", () => {
  const base = { key, previous: null, desired: "new", document: [] }
  for (const input of [
    { ...base, key: "A".repeat(64) },
    { ...base, key: "a".repeat(63) },
    { ...base, extra: true },
    { ...base, desired: false },
    { ...base, document: [{ type: "external", content: "text", key }] },
    { ...base, document: [{ type: "managed", content: "text" }] },
    { ...base, document: [{ type: "unknown", content: "text" }] }
  ]) expect(() => decode(ProjectConfig.EditInput, input)).toThrow()
})
