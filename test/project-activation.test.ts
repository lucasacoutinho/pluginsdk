import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Project from "../contracts/ProjectActivation.ts"
import { parseJson } from "../src/internal/json.ts"
import { buildProjectActivation, reviewProjectRoleAuthority } from "../src/installer/project/activation-model.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({ name: Schema.NonEmptyString, properties: Schema.Array(Schema.NonEmptyString),
  request: Project.OracleRequest, expected: Project.OracleResponse })
const equivalent = Schema.toEquivalence(Project.OracleResponse)

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function evaluate(request: Project.OracleRequest): Project.OracleResponse {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    build_project_activation: ({ input }): Project.OracleResponse =>
      ({ schema: 1, type: "build_project_activation", output: buildProjectActivation(input) }),
    review_project_role_authority: ({ input }): Project.OracleResponse =>
      ({ schema: 1, type: "review_project_role_authority", output: reviewProjectRoleAuthority(input) })
  }))
}

function compare(requests: ReadonlyArray<Project.OracleRequest>): ReadonlyArray<Project.OracleResponse> {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(Project.OracleRequest)(request))).join("\n") + "\n"
  const run = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`Project activation oracle exited ${String(run.status)}: ${run.stderr}`)
  const responses = run.stdout.trimEnd().split("\n").map((line) => decode(Project.OracleResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(request)
    const actual = decode(Project.OracleResponse, evaluate(request))
    expect(request).toEqual(before)
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing project activation response ${index}`)
    expect(equivalent(actual, response), `project activation case ${index}`).toBe(true)
  }
  return responses
}

const marketplace = `pluginsdk-${"a".repeat(24)}`
const registration = { plugin: "team.plugin", marketplace, root: "/retained/market" }
const basic = { platform: "linux", home: "/home/team/.codex", version: "1.0.0", registration, agents: [] }
const buildRequest = (input: unknown): Project.OracleRequest =>
  decode(Project.OracleRequest, { schema: 1, type: "build_project_activation", input })
const authorityRequest = (input: Project.AuthorityInput): Project.OracleRequest =>
  ({ schema: 1, type: "review_project_role_authority", input })

function generatedBuilds(): ReadonlyArray<Project.OracleRequest> {
  const alphabet = ["audit", "data-sync", "review"]
  const agents: ReadonlyArray<string>[] = [[]]
  let frontier: ReadonlyArray<string>[] = [[]]
  for (let length = 1; length <= 3; length++) {
    frontier = frontier.flatMap((prefix) => alphabet.map((name) => [...prefix, name]))
    agents.push(...frontier)
  }
  const homes = [
    { platform: "linux", home: "/home/team/.codex" }, { platform: "linux", home: "/" },
    { platform: "linux", home: "/home/日本語 team///" },
    { platform: "win32", home: "C:\\Users\\team\\" }, { platform: "win32", home: "C:\\" },
    { platform: "win32", home: "\\\\server\\share\\" }
  ]
  return homes.flatMap((home) => ["1.0.0", "2.0.0-beta+meta"].flatMap((version) =>
    [marketplace, `pluginsdk-${"b".repeat(24)}`].flatMap((market) =>
      agents.map((names) => buildRequest({ ...basic, ...home, version,
        registration: { ...registration, marketplace: market }, agents: names })))))
}

function generatedAuthority(): ReadonlyArray<Project.OracleRequest> {
  const binding = (name: string, configFile: string) => decode(Project.Binding, { name, configFile })
  const a = binding("team.plugin:audit", "/cache/a.toml")
  const updated = binding(a.name, "/cache/a-new.toml")
  const b = binding("team.plugin:review", "/cache/b.toml")
  const samePath = binding(b.name, a.configFile)
  const previous = [[], [a], [b], [a, b], [a, a], [a, updated], [a, samePath]]
  const desired = [[], [a], [updated], [b], [a, b], [a, a], [a, updated], [a, samePath]]
  const alphabet: ReadonlyArray<Project.Observation> = [
    { type: "declared", source: "managed", declaredName: a.name, name: a.name, configFile: a.configFile },
    { type: "declared", source: "managed", declaredName: b.name, name: b.name, configFile: b.configFile },
    { type: "declared", source: "managed", declaredName: b.name, name: a.name, configFile: a.configFile },
    { type: "declared", source: "managed", declaredName: a.name, name: b.name, configFile: a.configFile },
    { type: "declared", source: "managed", declaredName: a.name, name: a.name, configFile: updated.configFile },
    { type: "declared", source: "managed", declaredName: a.name, name: a.name, configFile: null },
    { type: "declared", source: "foreign", declaredName: a.name, name: a.name, configFile: a.configFile },
    { type: "declared", source: "foreign", declaredName: b.name, name: a.name, configFile: b.configFile },
    { type: "declared", source: "foreign", declaredName: a.name, name: b.name, configFile: b.configFile },
    { type: "declared", source: "foreign", declaredName: b.name, name: b.name, configFile: a.configFile },
    { type: "declared", source: "foreign", declaredName: b.name, name: b.name, configFile: null },
    { type: "discovered", name: a.name, path: a.configFile },
    { type: "discovered", name: b.name, path: a.configFile },
    { type: "unknown" }
  ]
  const observations: ReadonlyArray<Project.Observation>[] = [[], ...alphabet.map((entry) => [entry]),
    ...alphabet.flatMap((left) => alphabet.map((right) => [left, right]))]
  return previous.flatMap((before) => desired.flatMap((after) => observations.map((observed) =>
    authorityRequest({ previous: before, desired: after, observed }))))
}

it("matches independent activation examples and recorded native cache paths", () => {
  const cases = readFileSync(new URL("../spec/vectors/project-activation.ndjson", import.meta.url), "utf8")
    .trimEnd().split("\n").map((line) => decode(Vector, parseJson(line)))
  expect(cases).toHaveLength(53)
  const responses = compare(cases.map((row) => row.request))
  for (const [index, row] of cases.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing independent case ${row.name}`)
    expect(equivalent(response, row.expected), row.name).toBe(true)
  }
})

it("conforms on cache geometry and the complete small role-authority matrix", () => {
  const builds = generatedBuilds(), authority = generatedAuthority()
  expect(builds).toHaveLength(960)
  expect(authority).toHaveLength(11_816)
  compare([...builds, ...authority])
})

it("refuses malformed activation and authority requests in both decoders", () => {
  const build = { schema: 1, type: "build_project_activation", input: basic }
  const role = { name: "team.plugin:audit", configFile: "/cache/a.toml" }
  const authority = { schema: 1, type: "review_project_role_authority", input: { previous: [], desired: [role], observed: [] } }
  const invalid: unknown[] = [
    ...[0, 2, true, null].map((schema) => ({ ...build, schema })),
    { ...build, extra: true }, { ...build, type: "project_activation" },
    ...["darwin", "windows", null].map((platform) => ({ ...build, input: { ...basic, platform } })),
    ...["", "\0", "\ud800"].map((home) => ({ ...build, input: { ...basic, home } })),
    ...["", ".", "..", "a/b", "a\\b", "a\0", "\ud800"].map((version) => ({ ...build, input: { ...basic, version } })),
    ...["", "A", "a--b", "a..b", "-a", "a-", "a".repeat(65)].map((plugin) =>
      ({ ...build, input: { ...basic, registration: { ...registration, plugin } } })),
    ...["pluginsdk-a", `pluginsdk-${"A".repeat(24)}`, `pluginsdk-${"a".repeat(25)}`].map((marketplace) =>
      ({ ...build, input: { ...basic, registration: { ...registration, marketplace } } })),
    ...["", "Audit", "a--b", "../a", "audit\n", "a".repeat(65)].map((name) =>
      ({ ...build, input: { ...basic, agents: [name] } })),
    { ...build, input: { ...basic, agents: null } }, { ...build, input: { ...basic, scope: "project" } },
    { ...authority, input: { ...authority.input, desired: [{ ...role, name: "" }] } },
    { ...authority, input: { ...authority.input, desired: [{ ...role, configFile: "\ud800" }] } },
    ...[
      { type: "unknown", name: role.name }, { type: "declared", source: "unknown", declaredName: role.name, ...role },
      { type: "declared", source: "managed", declaredName: role.name, name: role.name },
      { type: "declared", source: "managed", declaredName: role.name, name: role.name, configFile: 1 },
      { type: "discovered", ...role }, { type: "discovered", name: "", path: role.configFile },
      { type: "unavailable" }
    ].map((observation) => ({ ...authority, input: { ...authority.input, observed: [observation] } })),
    { ...authority, input: { ...authority.input, extra: true } }
  ]
  expect(invalid).toHaveLength(47)
  for (const request of invalid) {
    expect(() => decode(Project.OracleRequest, request)).toThrow()
    const run = spawnSync(oracle, [], { input: JSON.stringify(request) + "\n", encoding: "utf8", timeout: 10_000 })
    expect(run.error).toBeUndefined()
    expect(run.status).toBe(1)
    expect(run.stdout).toBe("")
  }
})
