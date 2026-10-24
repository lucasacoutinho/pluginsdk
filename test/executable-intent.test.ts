import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Intent from "../contracts/ExecutableIntent.ts"
import { FileDigest } from "../contracts/CompilerModel.ts"
import { PackagePath } from "../contracts/Plugin.ts"
import { parseJson } from "../src/internal/json.ts"
import { resolvePayloadIntent, resolveSourceIntent, stagePermissions } from "../src/internal/files/executable.ts"

const Frame = Schema.Struct({ name: Schema.NonEmptyString, request: Intent.OracleRequest, expected: Intent.OracleResponse })
type Frame = typeof Frame.Type
const Vector = Schema.Struct({ ...Frame.fields, properties: Schema.NonEmptyArray(Schema.NonEmptyString) })
const decodeResponse = Schema.decodeUnknownSync(Intent.OracleResponse, { onExcessProperty: "error" })
const equal = Schema.toEquivalence(Intent.OracleResponse)
const path = PackagePath.make("tools/run")
const digest = FileDigest.make("a".repeat(64))
const otherDigest = FileDigest.make("b".repeat(64))
const posix = (before: number, after = before): Intent.ModeObservation => ({
  type: "posix", before: Intent.PermissionBits.make(before), after: Intent.PermissionBits.make(after)
})
const sourceFrame = (name: string, input: Intent.SourceInput, output: Intent.SourceResolution): Frame => ({
  name, request: { schema: 1, type: "source_intent", input }, expected: { schema: 1, type: "source_intent", output }
})
const payloadFrame = (name: string, input: Intent.PayloadInput, output: Intent.PayloadResolution): Frame => ({
  name, request: { schema: 1, type: "payload_intent", input }, expected: { schema: 1, type: "payload_intent", output }
})

function compare(frames: ReadonlyArray<Frame>): void {
  const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
  const result = spawnSync(oracle, [], {
    input: frames.map(({ request }) => JSON.stringify(Schema.encodeSync(Intent.OracleRequest)(request))).join("\n") + "\n",
    encoding: "utf8", timeout: 20_000, maxBuffer: 4 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toBe("")
  const responses = result.stdout.trim().split("\n").map((line) => decodeResponse(parseJson(line)))
  expect(responses).toHaveLength(frames.length)
  for (const [index, frame] of frames.entries()) {
    const before = structuredClone(frame.request)
    const actual = Match.value(frame.request).pipe(Match.discriminatorsExhaustive("type")({
      source_intent: ({ input }): Intent.OracleResponse => ({ schema: 1, type: "source_intent", output: resolveSourceIntent(input) }),
      payload_intent: ({ input }): Intent.OracleResponse => ({ schema: 1, type: "payload_intent", output: resolvePayloadIntent(input) }),
      stage_permissions: ({ input }): Intent.OracleResponse => ({ schema: 1, type: "stage_permissions", output: stagePermissions(input) })
    }))
    expect(frame.request).toEqual(before)
    expect(equal(actual, frame.expected), frame.name + ": TypeScript").toBe(true)
    const response = responses[index]
    if (response === undefined) throw new Error("Missing executable-intent oracle response")
    expect(equal(response, frame.expected), frame.name + ": Lean").toBe(true)
  }
}

function permutations<A>(values: ReadonlyArray<A>): A[][] {
  if (values.length === 0) return [[]]
  return values.flatMap((value, index) => permutations(values.filter((_, other) => index !== other))
    .map((tail) => [value, ...tail]))
}

it("matches the independent EI1-EI16 source and payload cases", () => {
  const decode = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/executable-intents.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decode(parseJson(line)))
  expect(vectors).toHaveLength(57)
  expect(new Set(vectors.flatMap(({ properties }) => properties)))
    .toEqual(new Set(Array.from({ length: 16 }, (_, index) => `EI${index + 1}`)))
  compare(vectors)
})

it("conforms for every permission combination, retained intent and a mode transition", () => {
  const frames: Frame[] = []
  for (let bits = 0; bits < 512; bits++) {
    const executable = Math.floor(bits / 64) % 2 === 1 || Math.floor(bits / 8) % 2 === 1 || bits % 2 === 1
    const stable = posix(bits)
    const changed = posix(bits, (bits + 1) % 512)
    frames.push(sourceFrame(`native stable ${bits}`, { type: "filesystem", files: [{ path, mode: stable }] }, {
      type: "resolved", files: [{ path, executable }]
    }))
    frames.push(sourceFrame(`native changed ${bits}`, { type: "filesystem", files: [{ path, mode: changed }] }, {
      type: "refused", reason: "changed", path
    }))
    for (const retained of [true, false]) {
      const file = { path, digest, executable: retained }
      frames.push(payloadFrame(`payload stable ${bits} ${retained}`, { retained: file, observed: { path, digest, mode: stable } },
        retained === executable ? { type: "resolved", executable: retained } : { type: "refused", reason: "intent" }))
      frames.push(payloadFrame(`payload changed ${bits} ${retained}`, { retained: file, observed: { path, digest, mode: changed } }, {
        type: "refused", reason: "changed"
      }))
    }
  }
  expect(frames).toHaveLength(3072)
  compare(frames)
})

it("preserves explicit intent through every source and declaration ordering", () => {
  const frames: Frame[] = []
  for (const first of [true, false]) for (const second of [true, false]) for (const third of [true, false]) {
    const assigned: Intent.FileIntent[] = [
      { path: PackagePath.make("Tools/Run"), executable: first },
      { path: PackagePath.make("é"), executable: second },
      { path: PackagePath.make("é"), executable: third }
    ]
    for (const inventory of permutations(assigned)) {
      for (const declarations of permutations(assigned.filter(({ executable }) => executable))) {
        frames.push(sourceFrame(`declared ${frames.length}`, {
          type: "declared", files: inventory.map(({ path }) => path), executables: declarations.map(({ path }) => path)
        }, { type: "resolved", files: inventory }))
      }
    }
  }
  expect(frames).toHaveLength(96)
  compare(frames)
})

it("binds retained intent before interpreting native mode evidence", () => {
  const frames: Frame[] = []
  for (const executable of [true, false]) {
    const retained = { path, digest, executable }
    const modes: ReadonlyArray<{ mode: Intent.ModeObservation; output: Intent.PayloadResolution }> = [
      { mode: { type: "unrepresented" }, output: { type: "resolved", executable } },
      { mode: { type: "unavailable" }, output: { type: "refused", reason: "unavailable" } },
      { mode: posix(executable ? 0o755 : 0o644), output: { type: "resolved", executable } },
      { mode: posix(executable ? 0o644 : 0o755), output: { type: "refused", reason: "intent" } },
      { mode: posix(0o755, 0o700), output: { type: "refused", reason: "changed" } }
    ]
    for (const { mode, output } of modes) {
      frames.push(payloadFrame(`bound ${frames.length}`, { retained, observed: { path, digest, mode } }, output))
      frames.push(payloadFrame(`path ${frames.length}`, {
        retained, observed: { path: PackagePath.make("Tools/run"), digest, mode }
      }, { type: "refused", reason: "path" }))
      frames.push(payloadFrame(`content ${frames.length}`, {
        retained, observed: { path, digest: otherDigest, mode }
      }, { type: "refused", reason: "content" }))
      frames.push(payloadFrame(`path before content ${frames.length}`, {
        retained, observed: { path: PackagePath.make("Tools/run"), digest: otherDigest, mode }
      }, { type: "refused", reason: "path" }))
    }
  }
  expect(frames).toHaveLength(40)
  compare(frames)
})

it("rejects malformed external intent facts with the authoritative schemas", () => {
  const decode = Schema.decodeUnknownSync(Intent.OracleRequest, { onExcessProperty: "error" })
  const invalid: unknown[] = [
    { schema: 2, type: "source_intent", input: { type: "declared", files: [], executables: [] } },
    { schema: 1, type: "source_intent", input: { type: "declared", files: [] } },
    { schema: 1, type: "source_intent", input: { type: "declared", files: [], executables: [], extra: true } },
    { schema: 1, type: "payload_intent", input: {
      retained: { path, digest, executable: true }, observed: { path, digest, mode: { type: "unrepresented", before: 0 } }
    } },
    { schema: 1, type: "payload_intent", input: {
      retained: { path, digest: "A".repeat(64), executable: true }, observed: { path, digest, mode: { type: "unrepresented" } }
    } }
  ]
  for (const before of [-1, 512, 0.5, "420", null, true]) invalid.push({
    schema: 1, type: "source_intent", input: { type: "filesystem", files: [{ path, mode: { type: "posix", before, after: 0 } }] }
  })
  for (const path of ["", "a/../b", "a\\b", "C:/drive", "/absolute", "a\0b", "\ud800"]) invalid.push({
    schema: 1, type: "source_intent", input: { type: "declared", files: [path], executables: [] }
  })
  for (const value of invalid) expect(() => decode(value)).toThrow()
})

it("preserves staging intent and read/write restrictions for every permission combination", () => {
  const decode = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const authored = readFileSync(new URL("../spec/vectors/staging-permissions.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decode(parseJson(line)))
  expect(authored).toHaveLength(18)
  expect(new Set(authored.flatMap(({ properties }) => properties))).toEqual(new Set(["EI17", "EI18", "EI19", "EI20"]))
  const frames: Frame[] = [...authored]
  for (let current = 0; current < 512; current++) for (const executable of [true, false]) {
    const hasExecute = [64, 8, 1].some((position) => Math.floor(current / position) % 2 === 1)
    const data = [128, 16, 2].reduce((sum, position) => sum + Math.floor(current / position) % 4 * position, 0)
    const expected = executable ? (hasExecute ? current : current + 64) : data
    frames.push({
      name: `stage ${current} ${executable}`,
      request: { schema: 1, type: "stage_permissions", input: { current: Intent.PermissionBits.make(current), executable } },
      expected: { schema: 1, type: "stage_permissions", output: Intent.PermissionBits.make(expected) }
    })
  }
  expect(frames).toHaveLength(1042)
  compare(frames)
})
