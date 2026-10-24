import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Authorization from "../contracts/Authorization.ts"
import { authorize } from "../src/authorization.ts"

type Case = { readonly name: string; readonly request: Authorization.OracleRequest }
type VectorCase = Case & { readonly expected: Authorization.OracleResponse }

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectorPath = fileURLToPath(new URL("../spec/vectors/authorization.ndjson", import.meta.url))
const equivalentResponse = Schema.toEquivalence(Authorization.OracleResponse)
const VectorRow = Schema.Struct({
  name: Schema.String,
  properties: Schema.Array(Schema.String),
  request: Schema.Unknown,
  expected: Schema.Unknown
})

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(): ReadonlyArray<VectorCase> {
  return readFileSync(vectorPath, "utf8").split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const value: unknown = JSON.parse(line)
    const row = decodeStrict(VectorRow, value)
    return {
      name: row.name,
      request: decodeStrict(Authorization.OracleRequest, row.request),
      expected: decodeStrict(Authorization.OracleResponse, row.expected)
    }
  })
}

function request(input: Authorization.AuthorizationInput): Authorization.OracleRequest {
  return { schema: 1, type: "authorize", input }
}

function runOracle(cases: ReadonlyArray<Case>): ReadonlyArray<Authorization.OracleResponse> {
  const lines = cases.map((current) => JSON.stringify(Schema.encodeSync(Authorization.OracleRequest)(current.request)))
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean authorization oracle exited with status ${String(result.status)}: ${result.stderr}`)
  return result.stdout.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const value: unknown = JSON.parse(line)
    return decodeStrict(Authorization.OracleResponse, value)
  })
}

function compareWithOracle(cases: ReadonlyArray<Case>): ReadonlyArray<Authorization.OracleResponse> {
  const outputs = runOracle(cases)
  expect(outputs).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const expected = outputs[index]
    if (expected === undefined) throw new Error(`authorization oracle response ${index} is missing`)
    const output = decodeStrict(Authorization.OracleResponse, {
      schema: 1,
      type: "authorize",
      output: authorize(current.request.input)
    })
    expect(equivalentResponse(output, expected), current.name).toBe(true)
  }
  return outputs
}

const vectors = readVectors()
const first = vectors[0]
if (first === undefined || first.request.input.facts.type !== "ready") throw new Error("authorization baseline is missing")
const baseline = first.request.input
const baselineFacts = first.request.input.facts

function generatedCases(): ReadonlyArray<Case> {
  const cases: Array<Case> = []
  const scopeSets = [baselineFacts.principal.scopes, []]
  const groupSets = [baselineFacts.membership.groups, [], [decodeStrict(Authorization.GroupId, "operators")]]
  const grantSets = [baselineFacts.policy.grants, []]
  const accessValues = Authorization.ApplicationAccess.literals
  const rules = [baselineFacts.policy.tools, []]
  for (const scopes of scopeSets) {
    for (const groups of groupSets) {
      for (const grants of grantSets) {
        for (const tools of rules) {
          for (const applicationAccess of accessValues) {
            cases.push({
              name: `scopes=${scopes.length}/groups=${groups.length}/grants=${grants.length}/tools=${tools.length}/application=${applicationAccess}`,
              request: request({
                ...baseline,
                applicationAccess,
                facts: {
                  ...baselineFacts,
                  principal: { ...baselineFacts.principal, scopes },
                  membership: { ...baselineFacts.membership, groups },
                  policy: { ...baselineFacts.policy, grants, tools }
                }
              })
            })
          }
        }
      }
    }
  }
  for (const policyTime of [899, 900, 1000, 1001]) {
    for (const membershipTime of [899, 900, 1000, 1001]) {
      for (const expiresAt of [999, 1000, 1001]) {
        cases.push({
          name: `policy=${policyTime}/membership=${membershipTime}/expires=${expiresAt}`,
          request: request({
            ...baseline,
            facts: {
              ...baselineFacts,
              principal: { ...baselineFacts.principal, expiresAt: decodeStrict(Authorization.Instant, expiresAt) },
              policy: { ...baselineFacts.policy, observedAt: decodeStrict(Authorization.Instant, policyTime) },
              membership: { ...baselineFacts.membership, observedAt: decodeStrict(Authorization.Instant, membershipTime) }
            }
          })
        })
      }
    }
  }
  return cases
}

it("U1-U8: agrees with independently specified organization authorization vectors", () => {
  const outputs = compareWithOracle(vectors)
  for (const [index, current] of vectors.entries()) {
    const actual = outputs[index]
    if (actual === undefined) throw new Error(`authorization vector response ${index} is missing`)
    expect(equivalentResponse(actual, current.expected), current.name).toBe(true)
  }
})

it("agrees with Lean across interacting permission and freshness restrictions", () => {
  compareWithOracle(generatedCases())
})

it("rechecks direct invocation after revocation without changing the installed contract", () => {
  expect(authorize(baseline).type).toBe("allowed")
  const membershipRevoked: Authorization.AuthorizationInput = {
    ...baseline,
    facts: {
      ...baselineFacts,
      membership: {
        ...baselineFacts.membership,
        revision: decodeStrict(Authorization.MembershipRevision, "groups-10"),
        groups: []
      }
    }
  }
  const policyRevoked: Authorization.AuthorizationInput = {
    ...baseline,
    facts: {
      ...baselineFacts,
      policy: {
        ...baselineFacts.policy,
        revision: decodeStrict(Authorization.PolicyRevision, "policy-13"),
        grants: []
      }
    }
  }
  for (const revoked of [membershipRevoked, policyRevoked]) {
    expect(revoked.invocation).toBe(baseline.invocation)
    expect(authorize(revoked)).toEqual({ type: "denied", reason: "permission_missing" })
  }
  compareWithOracle([
    { name: "before revocation", request: request(baseline) },
    { name: "membership revocation", request: request(membershipRevoked) },
    { name: "policy revocation", request: request(policyRevoked) }
  ])
})

it("does not grant precedence to policy, membership or scope enumeration order", () => {
  for (const vector of vectors) {
    const { input } = vector.request
    if (input.facts.type !== "ready") continue
    const facts = input.facts
    const permuted: Authorization.AuthorizationInput = {
      ...input,
      facts: {
        ...facts,
        principal: { ...facts.principal, scopes: [...facts.principal.scopes].reverse() },
        membership: { ...facts.membership, groups: [...facts.membership.groups].reverse() },
        policy: {
          ...facts.policy,
          tools: [...facts.policy.tools].reverse().map((tool) => ({ ...tool, scopes: [...tool.scopes].reverse() })),
          bindings: [...facts.policy.bindings].reverse(),
          grants: [...facts.policy.grants].reverse()
        }
      }
    }
    expect(authorize(permuted), vector.name).toEqual(authorize(input))
  }
})

it("rejects malformed evidence at the schema boundary", () => {
  for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity, "1", null]) {
    expect(() => decodeStrict(Authorization.AuthorizationInput, { ...baseline, now: invalid })).toThrow()
    expect(() => decodeStrict(Authorization.FreshnessBounds, { policy: invalid, membership: 0 })).toThrow()
  }
  for (const facts of [
    { type: "unverified", role: "admin" },
    { type: "unavailable", reason: "policy_unavailable", principal: baselineFacts.principal },
    { ...baselineFacts, membership: { ...baselineFacts.membership, principal: { ...baselineFacts.membership.principal, role: "admin" } } },
    { ...baselineFacts, policy: { ...baselineFacts.policy, tools: [{ permission: baseline.invocation.permission, contract: "a".repeat(63), scopes: [] }] } }
  ]) {
    expect(() => decodeStrict(Authorization.AuthorizationInput, { ...baseline, facts })).toThrow()
  }
})
