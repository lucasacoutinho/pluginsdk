import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Agents from "../contracts/Agents.ts"
import { parseJson } from "../src/internal/json.ts"
import { renderAgents } from "../src/compiler/agents/model.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Agents.OracleRequest,
  expected: Agents.OracleResponse
})
const equivalentResponse = Schema.toEquivalence(Agents.OracleResponse)

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(): ReadonlyArray<typeof Vector.Type> {
  return readFileSync(new URL("../spec/vectors/agents.ndjson", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => decode(Vector, parseJson(line)))
}

function evaluateWithoutMutation(input: Agents.AgentsInput): Agents.AgentsResult {
  const before = structuredClone(input)
  const agents = input.agents
  const agentReferences = agents.slice()
  const output = renderAgents(input)
  expect(input, "agent input value").toEqual(before)
  expect(input.agents, "agent list reference").toBe(agents)
  for (const [index, agent] of agents.entries()) {
    expect(agent, `agent reference ${index}`).toBe(agentReferences[index])
  }
  return decode(Agents.AgentsResult, output)
}

function compare(requests: ReadonlyArray<Agents.OracleRequest>): ReadonlyArray<Agents.OracleResponse> {
  const lines = requests.map((request) => {
    const encoded: unknown = Schema.encodeSync(Agents.OracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("agent oracle request could not be encoded as JSON")
    return line
  })
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean agent oracle exited with status ${String(result.status)}: ${result.stderr}`)
  const responses = result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const raw: unknown = parseJson(line)
    return decode(Agents.OracleResponse, raw)
  })
  expect(responses, "Lean agent response count").toHaveLength(requests.length)

  for (const [index, request] of requests.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing agent oracle response ${index}`)
    const actual = decode(Agents.OracleResponse, {
      schema: 1,
      type: "render_agents",
      output: evaluateWithoutMutation(request.input)
    })
    expect(equivalentResponse(actual, response), `agent oracle case ${index}`).toBe(true)
  }
  return responses
}

function generatedRequests(): ReadonlyArray<Agents.OracleRequest> {
  const hosts: ReadonlyArray<Agents.AgentsInput["host"]> = ["claude_code", "codex"]
  const models: ReadonlyArray<unknown> = [null, "selected-model"]
  const shells: ReadonlyArray<Agents.Agent["shell"]> = ["host_default", "deny"]
  const nameSets: ReadonlyArray<ReadonlyArray<string>> = [
    [],
    ["solo"],
    ["zulu", "alpha", "mcp-review"],
    ["mcp-review", "alpha", "zulu"],
    ["second", "first", "second", "first"],
    ["first", "second", "first", "second"],
    ["same", "same", "same"],
    ["zulu", "alpha", "zulu", "alpha"],
    ["alpha", "zulu", "alpha", "zulu"]
  ]
  const requests: Agents.OracleRequest[] = []

  for (const host of hosts) {
    for (const model of models) {
      for (const shell of shells) {
        for (const names of nameSets) {
          const agents = names.map((name, ordinal) => ({
            name,
            description: `Review ${name} (${ordinal}) — café 日本語 😀`,
            prompt: `Instructions ${ordinal}: preserve "quotes", tabs\tand \${literal}.\n日本語 雪 😀`,
            model,
            shell
          }))
          requests.push(decode(Agents.OracleRequest, {
            schema: 1,
            type: "render_agents",
            input: { host, plugin: "team-kit", agents }
          }))
        }
      }
    }
  }
  return requests
}

const vectors = readVectors()

it("matches all 24 authored agent vectors against the strict Lean oracle", () => {
  expect(vectors).toHaveLength(24)
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing authored agent response for ${vector.name}`)
    expect(equivalentResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("matches generated hosts, models, shell policies, canonical order and duplicate sets without mutation", () => {
  const requests = generatedRequests()
  expect(requests).toHaveLength(72)
  compare(requests)
})
