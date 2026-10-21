import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Compiler from "../contracts/Compiler.ts"
import * as CompilerModel from "../contracts/CompilerModel.ts"
import * as Installer from "../contracts/Installer.ts"
import * as Lifecycle from "../contracts/Lifecycle.ts"
import { RemoteMcp } from "../contracts/Plugin.ts"
import { checkBundle, render } from "../src/model/compiler.ts"
import { begin, decide, settle } from "../src/model/lifecycle.ts"

type LifecycleRequest = Lifecycle.OracleRequest
type LifecycleResponse = Lifecycle.OracleResponse
type RenderRequest = CompilerModel.OracleRequest
type RenderResponse = CompilerModel.OracleResponse
type BundleRequest = CompilerModel.BundleOracleRequest
type BundleResponse = CompilerModel.BundleOracleResponse
type Journal = Lifecycle.Journal
type Idle = Lifecycle.Idle
type Pending = Lifecycle.Pending
type Decision = Lifecycle.Decision
type BeginResult = Lifecycle.BeginResult
type Settlement = Lifecycle.Settlement
type Change = Installer.Change
type Desired = Installer.Desired
type Observation = Installer.Observation
type Snapshot = Installer.Snapshot
type PlanId = Installer.PlanId
type BundleDigest = Compiler.BundleDigest
type Fingerprint = Installer.Fingerprint
type RenderFormat = CompilerModel.RenderInput["format"]

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readNdjson(path: string): ReadonlyArray<unknown> {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const value: unknown = JSON.parse(line)
      return value
    })
}

function encodeNdjson(values: ReadonlyArray<unknown>): string {
  const lines: Array<string> = []
  for (const value of values) {
    const line = JSON.stringify(value)
    if (line === undefined) throw new Error("oracle request could not be encoded as JSON")
    lines.push(line)
  }
  return `${lines.join("\n")}\n`
}

function runOracle(requests: ReadonlyArray<unknown>): ReadonlyArray<unknown> {
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: encodeNdjson(requests),
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`Lean oracle exited with status ${String(result.status)}: ${result.stderr}`)
  }
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const value: unknown = JSON.parse(line)
      return value
    })
}

function assertResponseCount(actual: ReadonlyArray<unknown>, expected: number, label: string): void {
  expect(actual.length, `${label}: oracle response count`).toBe(expected)
}

const VectorRow = Schema.Struct({
  name: Schema.String,
  properties: Schema.Array(Schema.String),
  request: Schema.Unknown,
  expected: Schema.Unknown
})

const ExampleFrame = Schema.Struct({ request: Schema.Unknown, expected: Schema.Unknown })
const ExampleScenario = Schema.Struct({
  name: Schema.String,
  properties: Schema.Array(Schema.String),
  frames: Schema.Array(ExampleFrame)
})

type LifecycleCase = {
  readonly name: string
  readonly request: LifecycleRequest
  readonly expected: LifecycleResponse
}

type RenderCase = {
  readonly name: string
  readonly request: RenderRequest
  readonly expected: RenderResponse
}

type BundleCase = {
  readonly name: string
  readonly request: BundleRequest
  readonly expected: BundleResponse
}

function loadLifecycleCases(): ReadonlyArray<LifecycleCase> {
  const cases: Array<LifecycleCase> = []
  const vectorPath = fileURLToPath(new URL("../spec/vectors/lifecycle.ndjson", import.meta.url))
  const examplePath = fileURLToPath(new URL("../docs/examples/replay.ndjson", import.meta.url))
  for (const raw of readNdjson(vectorPath)) {
    const row = decodeStrict(VectorRow, raw)
    cases.push({
      name: row.name,
      request: decodeStrict(Lifecycle.OracleRequest, row.request),
      expected: decodeStrict(Lifecycle.OracleResponse, row.expected)
    })
  }
  for (const raw of readNdjson(examplePath)) {
    const scenario = decodeStrict(ExampleScenario, raw)
    for (const [index, frame] of scenario.frames.entries()) {
      cases.push({
        name: `${scenario.name}[${index}]`,
        request: decodeStrict(Lifecycle.OracleRequest, frame.request),
        expected: decodeStrict(Lifecycle.OracleResponse, frame.expected)
      })
    }
  }
  return cases
}

function loadRenderCases(): ReadonlyArray<RenderCase> {
  const cases: Array<RenderCase> = []
  const vectorPath = fileURLToPath(new URL("../spec/vectors/compiler.ndjson", import.meta.url))
  const examplePath = fileURLToPath(new URL("../docs/examples/compiler.ndjson", import.meta.url))
  for (const raw of readNdjson(vectorPath)) {
    const row = decodeStrict(VectorRow, raw)
    cases.push({
      name: row.name,
      request: decodeStrict(CompilerModel.OracleRequest, row.request),
      expected: decodeStrict(CompilerModel.OracleResponse, row.expected)
    })
  }
  for (const raw of readNdjson(examplePath)) {
    const scenario = decodeStrict(ExampleScenario, raw)
    for (const [index, frame] of scenario.frames.entries()) {
      cases.push({
        name: `${scenario.name}[${index}]`,
        request: decodeStrict(CompilerModel.OracleRequest, frame.request),
        expected: decodeStrict(CompilerModel.OracleResponse, frame.expected)
      })
    }
  }
  return cases
}

function loadBundleCases(): ReadonlyArray<BundleCase> {
  const cases: Array<BundleCase> = []
  const vectorPath = fileURLToPath(new URL("../spec/vectors/bundle.ndjson", import.meta.url))
  const examplePath = fileURLToPath(new URL("../docs/examples/bundle.ndjson", import.meta.url))
  for (const raw of readNdjson(vectorPath)) {
    const row = decodeStrict(VectorRow, raw)
    cases.push({
      name: row.name,
      request: decodeStrict(CompilerModel.BundleOracleRequest, row.request),
      expected: decodeStrict(CompilerModel.BundleOracleResponse, row.expected)
    })
  }
  for (const raw of readNdjson(examplePath)) {
    const scenario = decodeStrict(ExampleScenario, raw)
    for (const [index, frame] of scenario.frames.entries()) {
      cases.push({
        name: `${scenario.name}[${index}]`,
        request: decodeStrict(CompilerModel.BundleOracleRequest, frame.request),
        expected: decodeStrict(CompilerModel.BundleOracleResponse, frame.expected)
      })
    }
  }
  return cases
}

function evaluateLifecycle(request: LifecycleRequest): LifecycleResponse {
  const wire: unknown = Match.type<LifecycleRequest>().pipe(
    Match.discriminatorsExhaustive("type")({
      decide: (current) => ({ schema: 1, type: "decide", output: decide(current.input) }),
      begin: (current) => ({ schema: 1, type: "begin", output: begin(current.input) }),
      settle: (current) => ({ schema: 1, type: "settle", output: settle(current.input) })
    })
  )(request)
  return decodeStrict(Lifecycle.OracleResponse, wire)
}

function evaluateRender(request: RenderRequest): RenderResponse {
  const wire: unknown = { schema: 1, type: "render", output: render(request.input) }
  return decodeStrict(CompilerModel.OracleResponse, wire)
}

function evaluateBundle(request: BundleRequest): BundleResponse {
  const wire: unknown = { schema: 1, type: "check_bundle", output: checkBundle(request.input) }
  return decodeStrict(CompilerModel.BundleOracleResponse, wire)
}

function compareLifecycleCases(cases: ReadonlyArray<LifecycleCase>): void {
  const wireResponses = runOracle(cases.map((current) => current.request))
  assertResponseCount(wireResponses, cases.length, "lifecycle")
  for (const [index, current] of cases.entries()) {
    const raw = wireResponses[index]
    if (raw === undefined) throw new Error(`lifecycle[${index}] has no oracle response`)
    const oracle = decodeStrict(Lifecycle.OracleResponse, raw)
    const model = evaluateLifecycle(current.request)
    expect(oracle, `${current.name}: oracle response matches committed expected result`).toStrictEqual(current.expected)
    expect(model, `${current.name}: TypeScript model matches Lean oracle`).toStrictEqual(oracle)
  }
}

function compareRenderCases(cases: ReadonlyArray<RenderCase>): ReadonlyArray<RenderResponse> {
  const wireResponses = runOracle(cases.map((current) => current.request))
  assertResponseCount(wireResponses, cases.length, "render")
  const responses: Array<RenderResponse> = []
  for (const [index, current] of cases.entries()) {
    const raw = wireResponses[index]
    if (raw === undefined) throw new Error(`render[${index}] has no oracle response`)
    const oracle = decodeStrict(CompilerModel.OracleResponse, raw)
    const model = evaluateRender(current.request)
    expect(oracle, `${current.name}: oracle response matches committed expected result`).toStrictEqual(current.expected)
    expect(model, `${current.name}: TypeScript model matches Lean oracle`).toStrictEqual(oracle)
    responses.push(oracle)
  }
  return responses
}

function compareBundleCases(cases: ReadonlyArray<BundleCase>): void {
  const wireResponses = runOracle(cases.map((current) => current.request))
  assertResponseCount(wireResponses, cases.length, "check_bundle")
  for (const [index, current] of cases.entries()) {
    const raw = wireResponses[index]
    if (raw === undefined) throw new Error(`check_bundle[${index}] has no oracle response`)
    const oracle = decodeStrict(CompilerModel.BundleOracleResponse, raw)
    const model = evaluateBundle(current.request)
    expect(oracle, `${current.name}: oracle response matches committed expected result`).toStrictEqual(current.expected)
    expect(model, `${current.name}: TypeScript model matches Lean oracle`).toStrictEqual(oracle)
  }
}

function lifecycleDecision(response: LifecycleResponse): Decision {
  return Match.type<LifecycleResponse>().pipe(
    Match.discriminatorsExhaustive("type")({
      decide: (current) => current.output,
      begin: () => {
        throw new Error("expected a decide response")
      },
      settle: () => {
        throw new Error("expected a decide response")
      }
    })
  )(response)
}

function lifecycleBegin(response: LifecycleResponse): BeginResult {
  return Match.type<LifecycleResponse>().pipe(
    Match.discriminatorsExhaustive("type")({
      decide: () => {
        throw new Error("expected a begin response")
      },
      begin: (current) => current.output,
      settle: () => {
        throw new Error("expected a begin response")
      }
    })
  )(response)
}

function lifecycleSettlement(response: LifecycleResponse): Settlement {
  return Match.type<LifecycleResponse>().pipe(
    Match.discriminatorsExhaustive("type")({
      decide: () => {
        throw new Error("expected a settle response")
      },
      begin: () => {
        throw new Error("expected a settle response")
      },
      settle: (current) => current.output
    })
  )(response)
}

function pendingFromBegin(result: BeginResult): Pending {
  return Match.type<BeginResult>().pipe(
    Match.discriminatorsExhaustive("type")({
      start: (current) => current.journal,
      resume: (current) => current.journal,
      completed: () => {
        throw new Error("expected begin to return a pending journal")
      },
      rejected: () => {
        throw new Error("expected begin to return a pending journal")
      }
    })
  )(result)
}

function journalFromSettlement(result: Settlement): Journal {
  return Match.type<Settlement>().pipe(
    Match.discriminatorsExhaustive("type")({
      completed: (current) => current.journal,
      uncertain: (current) => current.journal
    })
  )(result)
}

function idleFromCompletedSettlement(result: Settlement): Idle {
  return Match.type<Settlement>().pipe(
    Match.discriminatorsExhaustive("type")({
      completed: (current) => current.journal,
      uncertain: () => {
        throw new Error("expected settlement to complete")
      }
    })
  )(result)
}

function installedJournal(journal: Idle): Extract<Idle, { type: "installed" }> {
  return Match.type<Idle>().pipe(
    Match.discriminatorsExhaustive("type")({
      empty: () => {
        throw new Error("expected an installed journal")
      },
      installed: (current) => current,
      not_applied: () => {
        throw new Error("expected an installed journal")
      }
    })
  )(journal)
}

function notAppliedJournal(journal: Idle): Extract<Idle, { type: "not_applied" }> {
  return Match.type<Idle>().pipe(
    Match.discriminatorsExhaustive("type")({
      empty: () => {
        throw new Error("expected a not_applied journal")
      },
      installed: () => {
        throw new Error("expected a not_applied journal")
      },
      not_applied: (current) => current
    })
  )(journal)
}

function changeFromDecision(decision: Decision): Extract<Decision, { type: "change" }> {
  return Match.type<Decision>().pipe(
    Match.discriminatorsExhaustive("type")({
      change: (current) => current,
      unchanged: () => {
        throw new Error("expected planning to request a change")
      },
      blocked: () => {
        throw new Error("expected planning to request a change")
      },
      pending: () => {
        throw new Error("expected planning to request a change")
      }
    })
  )(decision)
}

type SequenceOutcome = "success" | "not_applied" | "unknown" | "drift"

type InstalledState = {
  readonly journal: Extract<Idle, { type: "installed" }>
  readonly plan: PlanId
  readonly change: Change
  readonly observed: Observation
}

function lifecycleRequest(input: unknown): LifecycleRequest {
  return decodeStrict(Lifecycle.OracleRequest, input)
}

function decideRequest(journal: Journal, observed: Observation, desired: Desired): LifecycleRequest {
  return lifecycleRequest({ schema: 1, type: "decide", input: { journal, observed, desired } })
}

function beginRequest(
  journal: Journal,
  observed: Observation,
  plan: PlanId,
  before: Snapshot,
  change: Change
): LifecycleRequest {
  return lifecycleRequest({ schema: 1, type: "begin", input: { journal, observed, plan, before, change } })
}

function settleRequest(journal: Pending, observed: Observation): LifecycleRequest {
  return lifecycleRequest({ schema: 1, type: "settle", input: { journal, observed } })
}

function successfulObservation(plan: PlanId, bundle: BundleDigest, fingerprint: Fingerprint): Observation {
  return decodeStrict(Installer.Observation, {
    type: "present",
    fingerprint,
    identity: { plan, bundle }
  })
}

function generatedLifecycleTrace(salt: number, outcome: SequenceOutcome): ReadonlyArray<LifecycleCase> {
  const planA = decodeStrict(Installer.PlanId, "a".repeat(64))
  const planB = decodeStrict(Installer.PlanId, "b".repeat(64))
  const bundleA = decodeStrict(Compiler.BundleDigest, "1".repeat(64))
  const bundleB = decodeStrict(Compiler.BundleDigest, "2".repeat(64))
  const fingerprintA = decodeStrict(Installer.Fingerprint, "3".repeat(64))
  const fingerprintB = decodeStrict(Installer.Fingerprint, "4".repeat(64))
  const planOne = salt % 2 === 0 ? planA : planB
  const planTwo = salt % 2 === 0 ? planB : planA
  const bundleOne = Math.floor(salt / 2) % 2 === 0 ? bundleA : bundleB
  const bundleTwo = Math.floor(salt / 2) % 2 === 0 ? bundleB : bundleA
  const fingerprintOne = Math.floor(salt / 4) % 2 === 0 ? fingerprintA : fingerprintB
  const fingerprintTwo = Math.floor(salt / 4) % 2 === 0 ? fingerprintB : fingerprintA
  const empty = decodeStrict(Lifecycle.Journal, { type: "empty", last: null })
  const absent = decodeStrict(Installer.Observation, { type: "absent" })
  const unknown = decodeStrict(Installer.Observation, { type: "unknown" })
  const desiredOne = decodeStrict(Installer.Desired, { type: "present", bundle: bundleOne })
  const desiredTwo = decodeStrict(Installer.Desired, { type: "present", bundle: bundleTwo })
  const desiredAbsent = decodeStrict(Installer.Desired, { type: "absent" })
  const installOne = decodeStrict(Installer.Change, { type: "install", bundle: bundleOne })
  const installedOne = successfulObservation(planOne, bundleOne, fingerprintOne)
  const installedTwoUnderFirstPlan = successfulObservation(planOne, bundleTwo, fingerprintTwo)
  const installedTwoUnderSecondPlan = successfulObservation(planTwo, bundleTwo, fingerprintTwo)
  const drifted = decodeStrict(Installer.Observation, {
    type: "present",
    fingerprint: fingerprintTwo,
    identity: null
  })
  const changedObservation = decodeStrict(Installer.Observation, {
    type: "present",
    fingerprint: fingerprintTwo,
    identity: { plan: planTwo, bundle: bundleTwo }
  })
  const generated: Array<LifecycleCase> = []
  const requests: Array<LifecycleRequest> = []
  const responses: Array<LifecycleResponse> = []

  const step = (name: string, request: LifecycleRequest): LifecycleResponse => {
    const response = evaluateLifecycle(request)
    requests.push(request)
    responses.push(response)
    generated.push({ name: `generated_lifecycle_${salt}_${name}`, request, expected: response })
    return response
  }

  const firstDecision = lifecycleDecision(step(
    "plan_install",
    decideRequest(empty, absent, desiredOne)
  ))
  const firstChange = changeFromDecision(firstDecision)
  const initialBefore = firstChange.before
  const firstPlan = step(
    "begin_install",
    beginRequest(empty, absent, planOne, initialBefore, firstChange.change)
  )
  const pendingOne = pendingFromBegin(lifecycleBegin(firstPlan))
  step("decide_while_pending", decideRequest(pendingOne, unknown, desiredAbsent))
  step("different_pending_plan", beginRequest(pendingOne, absent, planTwo, initialBefore, installOne))
  const resumed = pendingFromBegin(lifecycleBegin(step(
    "resume_pending_plan",
    beginRequest(pendingOne, absent, planOne, initialBefore, installOne)
  )))

  const firstSettlementObservation = Match.value(outcome).pipe(
    Match.when("success", () => installedOne),
    Match.when("not_applied", () => absent),
    Match.when("unknown", () => unknown),
    Match.when("drift", () => drifted),
    Match.exhaustive
  )
  const firstSettlement = lifecycleSettlement(step(
    "settle_first_outcome",
    settleRequest(resumed, firstSettlementObservation)
  ))
  const firstSettledJournal = journalFromSettlement(firstSettlement)

  const installed = Match.value(outcome).pipe(
    Match.when("success", (): InstalledState => {
      const idle = idleFromCompletedSettlement(firstSettlement)
      const owned = installedJournal(idle)
      step("replay_completed_install", beginRequest(owned, installedOne, planOne, initialBefore, installOne))
      return { journal: owned, plan: planOne, change: installOne, observed: installedOne }
    }),
    Match.when("not_applied", (): InstalledState => {
      const idle = idleFromCompletedSettlement(firstSettlement)
      const notApplied = notAppliedJournal(idle)
      const stored = decodeStrict(Lifecycle.Journal, notApplied)
      step("replay_not_applied", beginRequest(stored, absent, planOne, initialBefore, installOne))
      const replan = changeFromDecision(lifecycleDecision(step(
        "replan_after_not_applied",
        decideRequest(stored, absent, desiredOne)
      )))
      const resumedPlan = pendingFromBegin(lifecycleBegin(step(
        "begin_after_not_applied",
        beginRequest(stored, absent, planTwo, replan.before, replan.change)
      )))
      const completed = lifecycleSettlement(step(
        "settle_replanned_install",
        settleRequest(resumedPlan, successfulObservation(planTwo, bundleOne, fingerprintOne))
      ))
      const owned = installedJournal(idleFromCompletedSettlement(completed))
      return {
        journal: owned,
        plan: planTwo,
        change: installOne,
        observed: successfulObservation(planTwo, bundleOne, fingerprintOne)
      }
    }),
    Match.when("unknown", (): InstalledState => {
      const waiting = pendingFromBegin(lifecycleBegin(step(
        "resume_after_unknown",
        beginRequest(firstSettledJournal, unknown, planOne, initialBefore, installOne)
      )))
      const completed = lifecycleSettlement(step(
        "settle_after_unknown",
        settleRequest(waiting, installedOne)
      ))
      const owned = installedJournal(idleFromCompletedSettlement(completed))
      return { journal: owned, plan: planOne, change: installOne, observed: installedOne }
    }),
    Match.when("drift", (): InstalledState => {
      const waiting = pendingFromBegin(lifecycleBegin(step(
        "resume_after_drift",
        beginRequest(firstSettledJournal, drifted, planOne, initialBefore, installOne)
      )))
      const completed = lifecycleSettlement(step(
        "settle_after_drift",
        settleRequest(waiting, installedOne)
      ))
      const owned = installedJournal(idleFromCompletedSettlement(completed))
      return { journal: owned, plan: planOne, change: installOne, observed: installedOne }
    }),
    Match.exhaustive
  )

  step("replay_installed_plan", beginRequest(installed.journal, installed.observed, installed.plan, initialBefore, installed.change))
  step("stale_installed_replay", beginRequest(installed.journal, changedObservation, installed.plan, initialBefore, installed.change))
  step("detect_owned_drift", decideRequest(installed.journal, drifted, desiredAbsent))
  const replacement = changeFromDecision(lifecycleDecision(step(
    "plan_replacement",
    decideRequest(installed.journal, installed.observed, desiredTwo)
  )))
  const replacementPlan = installed.plan === planOne ? planTwo : planOne
  const replacementPending = pendingFromBegin(lifecycleBegin(step(
    "begin_replacement",
    beginRequest(installed.journal, installed.observed, replacementPlan, replacement.before, replacement.change)
  )))
  step("decide_during_replacement", decideRequest(replacementPending, absent, desiredAbsent))
  const replacementObservation = replacementPlan === planOne
    ? installedTwoUnderFirstPlan
    : installedTwoUnderSecondPlan
  const replacementSettlement = lifecycleSettlement(step(
    "settle_replacement",
    settleRequest(replacementPending, replacementObservation)
  ))
  const replacementJournal = installedJournal(idleFromCompletedSettlement(replacementSettlement))
  step("replay_replacement", beginRequest(
    replacementJournal,
    replacementObservation,
    replacementPlan,
    replacement.before,
    replacement.change
  ))

  expect(requests.length, `generated lifecycle trace ${salt}: captured steps`).toBe(responses.length)
  return generated
}

function remoteMcp(url: string, headers: unknown): Schema.Codec.Encoded<typeof RemoteMcp> {
  const decoded = decodeStrict(RemoteMcp, { url, headers })
  return Schema.encodeSync(RemoteMcp)(decoded)
}

function renderRequest(input: unknown): RenderRequest {
  return decodeStrict(CompilerModel.OracleRequest, input)
}

function renderHeaders(pattern: number, reverse: boolean): Record<string, unknown> {
  if (pattern === 2) {
    return reverse
      ? { "x-tenant": "shadow", "X-Tenant": "public" }
      : { "X-Tenant": "public", "x-tenant": "shadow" }
  }
  if (pattern === 3) {
    return { Authorization: { type: "environment", name: "DOCS_TOKEN", prefix: "Bearer " } }
  }
  if (pattern === 4) return { Authorization: "literal ${TOKEN}" }
  return reverse
    ? { "X-Tenant": "public", Accept: "application/json" }
    : { Accept: "application/json", "X-Tenant": "public" }
}

function assetPaths(pattern: number): ReadonlyArray<string> {
  if (pattern === 0) return ["a.md", "é.md", "\ue000.md", "😀.md"]
  if (pattern === 1) return ["a", "a-b", "a/c", "z.txt"]
  return ["readme.md", "references/rules.md", "scripts/check.sh", "é.md"]
}

function permutations<A>(values: ReadonlyArray<A>): ReadonlyArray<ReadonlyArray<A>> {
  if (values.length === 0) return [[]]
  const result: Array<ReadonlyArray<A>> = []
  for (const [index, value] of values.entries()) {
    const remaining = values.filter((_candidate, candidateIndex) => candidateIndex !== index)
    for (const tail of permutations(remaining)) result.push([value, ...tail])
  }
  return result
}

function makeRenderRequest(format: RenderFormat, pattern: number, assetOrder: ReadonlyArray<string>, ordering: number): RenderRequest {
  const assets = assetOrder.map((path) => ({
    path,
    digest: "2".repeat(64),
    executable: false
  }))
  const review = {
    name: "review",
    entry: { digest: "1".repeat(64), executable: false },
    assets
  }
  const check = {
    name: "check",
    entry: { digest: "4".repeat(64), executable: true },
    assets: []
  }
  const reverseSkills = ordering % 2 === 1
  const reverseServers = Math.floor(ordering / 2) % 2 === 1
  const reverseHeaders = Math.floor(ordering / 4) % 2 === 1
  const skills = reverseSkills ? [check, review] : [review, check]
  const docs = remoteMcp(
    "HTTPS://EXAMPLE.test:443/mcp",
    renderHeaders(pattern, reverseHeaders)
  )
  const local = remoteMcp(
    "http://127.0.0.1:80/local",
    reverseHeaders
      ? { "X-Local": "loopback", Accept: "application/json" }
      : { Accept: "application/json", "X-Local": "loopback" }
  )
  const mcp = reverseServers ? { local, docs } : { docs, local }
  return renderRequest({
    schema: 1,
    type: "render",
    input: {
      format,
      metadata: { id: "team-kit", version: "0.1.0", description: "Generated conformance input" },
      skills,
      mcp
    }
  })
}

function generatedRendererCases(): ReadonlyArray<{ readonly group: string; readonly request: RenderRequest }> {
  const cases: Array<{ readonly group: string; readonly request: RenderRequest }> = []
  const formats: ReadonlyArray<RenderFormat> = ["agent_plugins_v1", "claude_code_v1"]
  for (const format of formats) {
    for (const pattern of [0, 1, 2, 3, 4]) {
      const group = `${format}/pattern-${pattern}`
      const assetOrders = permutations(assetPaths(pattern))
      for (const [assetIndex, assetOrder] of assetOrders.entries()) {
        for (let ordering = 0; ordering < 8; ordering += 1) {
          const interleavedOrder = ordering + (assetIndex % 2) * 8
          cases.push({
            group,
            request: makeRenderRequest(format, pattern, assetOrder, interleavedOrder)
          })
        }
      }
    }
  }
  return cases
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function bundleRequest(input: unknown): BundleRequest {
  return decodeStrict(CompilerModel.BundleOracleRequest, input)
}

function pathCombinations(alphabet: ReadonlyArray<string>, length: number): ReadonlyArray<ReadonlyArray<string>> {
  if (length === 1) return alphabet.map((path) => [path])
  const result: Array<ReadonlyArray<string>> = []
  for (const prefix of pathCombinations(alphabet, length - 1)) {
    for (const path of alphabet) result.push([...prefix, path])
  }
  return result
}

function generatedBundleCases(): ReadonlyArray<BundleCase> {
  const cases: Array<BundleCase> = []
  const alphabet = ["a", "A", "a-b", "a/c", "b", "É", "é", "\ue000", "😀"]
  const digestOne = "1".repeat(64)
  const computedDigests = [digestOne, "2".repeat(64)]
  for (const length of [1, 2, 3]) {
    for (const paths of pathCombinations(alphabet, length)) {
      for (const computed of computedDigests) {
        const request = bundleRequest({
          schema: 1,
          type: "check_bundle",
          input: { digest: digestOne, computed, paths }
        })
        cases.push({
          name: `generated_bundle_length_${length}_${cases.length}`,
          request,
          expected: decodeStrict(CompilerModel.BundleOracleResponse, {
            schema: 1,
            type: "check_bundle",
            output: evaluateBundle(request).output
          })
        })
      }
    }
  }
  return cases
}

it("matches lifecycle examples and committed vectors with the Lean oracle", () => {
  const cases = loadLifecycleCases()
  expect(cases.length).toBe(24)
  compareLifecycleCases(cases)
})

it("matches renderer examples and committed vectors with the Lean oracle", () => {
  const cases = loadRenderCases()
  expect(cases.length).toBe(30)
  compareRenderCases(cases)
})

it("matches bundle examples and committed vectors with the Lean oracle", () => {
  const cases = loadBundleCases()
  expect(cases.length).toBe(30)
  compareBundleCases(cases)
})

it("matches deterministic generated lifecycle traces with the Lean oracle", () => {
  const outcomes: ReadonlyArray<SequenceOutcome> = ["success", "not_applied", "unknown", "drift"]
  const cases: Array<LifecycleCase> = []
  for (let salt = 0; salt < 32; salt += 1) {
    const outcome = outcomes[modulo(salt, outcomes.length)]
    if (outcome === undefined) throw new Error(`missing lifecycle outcome for seed ${salt}`)
    cases.push(...generatedLifecycleTrace(salt, outcome))
  }
  expect(cases.length).toBe(520)
  compareLifecycleCases(cases)
})

it("matches renderer permutations, path and header collisions, and UTF-8 ordering", () => {
  const cases = generatedRendererCases()
  expect(cases.length).toBe(1920)
  const responses = compareRenderCases(cases.map((current) => ({
    name: current.group,
    request: current.request,
    expected: evaluateRender(current.request)
  })))
  const canonical = new Map<string, RenderResponse>()
  for (const [index, current] of cases.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`render permutation ${index} has no result`)
    const prior = canonical.get(current.group)
    if (prior === undefined) canonical.set(current.group, response)
    else expect(response, `${current.group}: enumeration permutation`).toStrictEqual(prior)
  }
})

it.prop(
  "matches Schema-generated normalized renderer inputs with the Lean oracle",
  {
    format: CompilerModel.RenderInput.fields.format,
    pattern: Schema.Int,
    ordering: Schema.Int
  },
  ({ format, pattern, ordering }) => {
    const selectedPattern = modulo(pattern, 5)
    const selectedAssets = assetPaths(selectedPattern)
    const request = makeRenderRequest(format, selectedPattern, selectedAssets, modulo(ordering, 16))
    const model = evaluateRender(request)
    const raw = runOracle([request])[0]
    if (raw === undefined) throw new Error("Schema-generated renderer case has no oracle response")
    const oracle = decodeStrict(CompilerModel.OracleResponse, raw)
    expect(model, "Schema-generated render result matches Lean oracle").toStrictEqual(oracle)
  },
  { arbitrary: { runs: 48, size: 8, seed: 20261020 } }
)

it("matches generated digest, order, Unicode, and path collision combinations", () => {
  const cases = generatedBundleCases()
  expect(cases.length).toBe(1638)
  compareBundleCases(cases)
})
