import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as CompanionFile from "../contracts/CompanionFile.ts"
import { RuntimePlatform } from "../contracts/Compatibility.ts"
import { FileDigest } from "../contracts/CompilerModel.ts"
import { FileBasis, WindowsFileAttributes } from "../contracts/ProjectConfig.ts"
import * as Metadata from "../contracts/ProjectFile.ts"
import { parseJson } from "../src/internal/json.ts"
import { admitCompanionFile, observeCompanionFile, reviewCompanionFile } from "../src/installer/companions/file-policy.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const decodeRequest = Schema.decodeUnknownSync(CompanionFile.OracleRequest, { onExcessProperty: "error" })
const decodeResponse = Schema.decodeUnknownSync(CompanionFile.OracleResponse, { onExcessProperty: "error" })
const sameResponse = Schema.toEquivalence(CompanionFile.OracleResponse)
const digest = FileDigest.make("a".repeat(64))
const other = FileDigest.make("b".repeat(64))
const security = FileDigest.make("c".repeat(64))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: CompanionFile.OracleRequest,
  expected: CompanionFile.OracleResponse
})

function evaluate(request: CompanionFile.OracleRequest): CompanionFile.OracleResponse {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    admit_companion_file: ({ input }): CompanionFile.OracleResponse => ({ schema: 1, type: "admit_companion_file", output: admitCompanionFile(input) }),
    review_companion_file: ({ input }): CompanionFile.OracleResponse => ({ schema: 1, type: "review_companion_file", output: reviewCompanionFile(input) }),
    observe_companion_file: ({ input }): CompanionFile.OracleResponse => ({ schema: 1, type: "observe_companion_file", output: observeCompanionFile(input) })
  }))
}

function compare(requests: ReadonlyArray<CompanionFile.OracleRequest>) {
  const wire = requests.map((request) => JSON.stringify(Schema.encodeSync(CompanionFile.OracleRequest)(request))).join("\n")
  const result = spawnSync(oraclePath, [], { input: wire + "\n", encoding: "utf8", timeout: 30_000, maxBuffer: 24 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toBe("")
  const responses = result.stdout.trim().split("\n").map((line) => decodeResponse(parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(request)
    const actual = decodeResponse(evaluate(request))
    expect(request).toEqual(before)
    const response = responses[index]
    if (response === undefined) throw new Error("Missing companion-file oracle response")
    expect(sameResponse(actual, response), JSON.stringify(request)).toBe(true)
  }
  return responses
}

const platform = (value: string) => RuntimePlatform.make(value)
const posix = (mode: number): Metadata.Observation => ({ type: "file", digest, mode })
const windows = (attributes: number, streams: Metadata.Streams = "default_only"): Metadata.Observation => ({
  type: "windows_file", digest, attributes: WindowsFileAttributes.make(attributes), security, streams
})

it("conforms to the independently authored role metadata expectations", () => {
  const vectors = readFileSync(new URL("../spec/vectors/companion-files.ndjson", import.meta.url), "utf8").trim().split("\n")
    .map((line) => Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })(parseJson(line)))
  expect(vectors).toHaveLength(76)
  const responses = compare(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error("Missing authored companion-file response")
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms across all POSIX modes, Windows attribute bits, streams and platforms", () => {
  const attributes = [...new Set([
    ...Array.from({ length: 256 }, (_, value) => value),
    ...Array.from({ length: 32 }, (_, bit) => 2 ** bit),
    8230, 4294967295
  ])]
  const inputs: CompanionFile.Input[] = [
    ...Array.from({ length: 4096 }, (_, mode) => ({ platform: platform("linux"), observed: posix(mode) })),
    ...["linux", "win32", "darwin"].flatMap((value): CompanionFile.Input[] => [
      { platform: platform(value), observed: { type: "absent" } },
      ...[0, 0o600, 0o644, 0o7777].map((mode) => ({ platform: platform(value), observed: posix(mode) })),
      ...attributes.flatMap((attributes) => Metadata.Streams.literals.map((streams) => ({ platform: platform(value), observed: windows(attributes, streams) })))
    ])
  ]
  const requests = inputs.flatMap((input): CompanionFile.OracleRequest[] => [
    { schema: 1, type: "admit_companion_file", input },
    { schema: 1, type: "observe_companion_file", input }
  ])
  compare(requests)
})

it("conforms when any reviewed content or native metadata changes", () => {
  const reviewed: ReadonlyArray<FileBasis> = [
    { type: "absent" },
    { type: "file", digest, mode: 0o600 },
    { type: "file", digest: other, mode: 0o600 },
    { type: "file", digest, mode: 0o644 },
    { type: "windows_file", digest, attributes: WindowsFileAttributes.make(32), security },
    { type: "windows_file", digest: other, attributes: WindowsFileAttributes.make(32), security },
    { type: "windows_file", digest, attributes: WindowsFileAttributes.make(34), security },
    { type: "windows_file", digest, attributes: WindowsFileAttributes.make(32), security: other }
  ]
  const observations: ReadonlyArray<Metadata.Observation> = [
    { type: "absent" }, posix(0o600), posix(0o644),
    windows(32), windows(34), windows(1), windows(32, "additional"), windows(32, "unavailable")
  ]
  compare(["linux", "win32", "darwin"].flatMap((value) => observations.flatMap((observed) => reviewed.map((reviewed): CompanionFile.OracleRequest => ({
    schema: 1, type: "review_companion_file", input: { current: { platform: platform(value), observed }, reviewed }
  })))))
})

it("rejects the frozen malformed wires at both request boundaries", () => {
  const Malformed = Schema.Struct({ name: Schema.NonEmptyString, wire: Schema.String })
  const vectors = readFileSync(new URL("../spec/vectors/companion-files-malformed.ndjson", import.meta.url), "utf8").trim().split("\n")
    .map((line) => Schema.decodeUnknownSync(Malformed, { onExcessProperty: "error" })(parseJson(line)))
  expect(vectors).toHaveLength(28)
  for (const vector of vectors) {
    expect(() => decodeRequest(parseJson(vector.wire)), vector.name).toThrow()
    const result = spawnSync(oraclePath, [], { input: vector.wire + "\n", encoding: "utf8", timeout: 10_000 })
    if (result.error !== undefined) throw result.error
    expect(result.status, vector.name).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("oracle:")
  }
})

it("requires private POSIX metadata in an admitted role basis", () => {
  expect(() => Schema.decodeUnknownSync(CompanionFile.Basis)({ type: "file", digest, mode: 0o644 })).toThrow()
  expect(Schema.decodeSync(CompanionFile.Basis)({ type: "file", digest, mode: 0o600 })).toEqual({ type: "file", digest, mode: 0o600 })
  expect(Schema.decodeSync(FileBasis)({ type: "file", digest, mode: 0o644 })).toEqual({ type: "file", digest, mode: 0o644 })
})
