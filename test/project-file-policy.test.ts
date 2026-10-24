import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { RuntimePlatform } from "../contracts/Compatibility.ts"
import { FileDigest } from "../contracts/CompilerModel.ts"
import { FileBasis, WindowsFileAttributes } from "../contracts/ProjectConfig.ts"
import * as ProjectFile from "../contracts/ProjectFile.ts"
import { parseJson } from "../src/internal/json.ts"
import { admitProjectFile, reviewProjectFile } from "../src/internal/files/ownership.ts"

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const decodeRequest = Schema.decodeUnknownSync(ProjectFile.OracleRequest, { onExcessProperty: "error" })
const decodeResponse = Schema.decodeUnknownSync(ProjectFile.OracleResponse, { onExcessProperty: "error" })
const sameResponse = Schema.toEquivalence(ProjectFile.OracleResponse)
const digest = FileDigest.make("a".repeat(64))
const other = FileDigest.make("b".repeat(64))
const security = FileDigest.make("c".repeat(64))
const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: ProjectFile.OracleRequest,
  expected: ProjectFile.OracleResponse
})

function evaluate(request: ProjectFile.OracleRequest): ProjectFile.OracleResponse {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    admit_project_file: ({ input }): ProjectFile.OracleResponse => ({ schema: 1, type: "admit_project_file", output: admitProjectFile(input) }),
    review_project_file: ({ input }): ProjectFile.OracleResponse => ({ schema: 1, type: "review_project_file", output: reviewProjectFile(input) })
  }))
}

function compare(requests: ReadonlyArray<ProjectFile.OracleRequest>) {
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(ProjectFile.OracleRequest)(request))).join("\n")
  const result = spawnSync(oraclePath, [], { input: input + "\n", encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
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
    if (response === undefined) throw new Error("Missing project-file oracle response")
    expect(sameResponse(actual, response), JSON.stringify(request)).toBe(true)
  }
  return responses
}

const admission = (platform: string, observed: ProjectFile.Observation): ProjectFile.OracleRequest => ({
  schema: 1,
  type: "admit_project_file",
  input: { platform: RuntimePlatform.make(platform), observed }
})

const windows = (attributes: number, streams: ProjectFile.Streams = "default_only"): ProjectFile.Observation => ({
  type: "windows_file", digest, attributes: WindowsFileAttributes.make(attributes), security, streams
})

it("conforms to authored metadata cases and the native POSIX-mode counterexample", () => {
  const vectors = readFileSync(new URL("../spec/vectors/project-files.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })(parseJson(line)))
  expect(vectors).toHaveLength(53)
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error("Missing authored project-file response")
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms across Windows attribute bits, streams, platforms and POSIX modes", () => {
  const attributes = [...new Set([
    ...Array.from({ length: 256 }, (_, value) => value),
    ...Array.from({ length: 32 }, (_, bit) => 2 ** bit),
    ...Array.from({ length: 32 }, (_, bit) => 2 ** bit + (bit === 5 ? 0 : 32)),
    ...Array.from({ length: 16 }, (_, bits) => 8192 + bits * 2),
    8230, 0xffff_ffff
  ])]
  const requests: ProjectFile.OracleRequest[] = ["linux", "win32", "darwin", "win32\0"].flatMap((platform) => [
    admission(platform, { type: "absent" }),
    ...[0, 1, 0o400, 0o600, 0o640, 0o666, 0o777, 0o4751, 0o7777].map((mode) =>
      admission(platform, { type: "file", digest, mode })),
    ...attributes.flatMap((attributes) => ProjectFile.Streams.literals.map((streams) => admission(platform, windows(attributes, streams))))
  ])
  compare(requests)
})

it("conforms when content, attributes, permissions, representation or existence changes", () => {
  const reviewed: ReadonlyArray<FileBasis> = [
    { type: "absent" },
    { type: "file", digest, mode: 0o600 },
    { type: "file", digest: other, mode: 0o600 },
    { type: "file", digest, mode: 0o640 },
    { type: "windows_file", digest, attributes: WindowsFileAttributes.make(32), security },
    { type: "windows_file", digest: other, attributes: WindowsFileAttributes.make(32), security },
    { type: "windows_file", digest, attributes: WindowsFileAttributes.make(34), security },
    { type: "windows_file", digest, attributes: WindowsFileAttributes.make(32), security: other }
  ]
  const observations: ReadonlyArray<ProjectFile.Observation> = [
    { type: "absent" },
    { type: "file", digest, mode: 0o600 },
    { type: "file", digest: other, mode: 0o600 },
    { type: "file", digest, mode: 0o640 },
    windows(32), windows(34), windows(33), windows(32, "additional"), windows(32, "unavailable")
  ]
  const requests: ProjectFile.OracleRequest[] = ["linux", "win32", "darwin"].flatMap((platform) =>
    observations.flatMap((observed) => reviewed.map((reviewed): ProjectFile.OracleRequest => ({
      schema: 1, type: "review_project_file", input: { current: { platform: RuntimePlatform.make(platform), observed }, reviewed }
    }))))
  compare(requests)
})

it("retains the existing Linux and absent wire forms", () => {
  const decode = Schema.decodeUnknownSync(FileBasis, { onExcessProperty: "error" })
  const encode = Schema.encodeSync(FileBasis)
  for (const input of [{ type: "absent" }, { type: "file", digest, mode: 0o4751 }]) {
    expect(encode(decode(input))).toEqual(input)
  }
})

it("rejects malformed metadata and excess fields at both wire boundaries", () => {
  const observed = { type: "windows_file", digest, attributes: 32, security, streams: "default_only" }
  const base = { schema: 1, type: "admit_project_file", input: { platform: "win32", observed } }
  const malformed: unknown[] = [
    { ...base, schema: 2 }, { ...base, extra: true }, { ...base, type: "unknown_project_file" },
    { ...base, input: { ...base.input, extra: true } },
    { ...base, input: { ...base.input, platform: "" } },
    { ...base, input: { ...base.input, platform: "\ud800" } },
    { ...base, input: { ...base.input, observed: { ...observed, extra: true } } },
    { ...base, input: { ...base.input, observed: { ...observed, streams: "default" } } },
    ...[-1, 0.5, 0x1_0000_0000, "32", null].map((attributes) =>
      ({ ...base, input: { ...base.input, observed: { ...observed, attributes } } })),
    ...["", "A".repeat(64), "a".repeat(63), null].flatMap((value) => [
      { ...base, input: { ...base.input, observed: { ...observed, digest: value } } },
      { ...base, input: { ...base.input, observed: { ...observed, security: value } } }
    ]),
    ...[-1, 0.5, 4096, "384", null].map((mode) =>
      ({ ...base, input: { ...base.input, observed: { type: "file", digest, mode } } })),
    { schema: 1, type: "review_project_file", input: { current: base.input, reviewed: { ...observed } } },
    { schema: 1, type: "review_project_file", input: { current: base.input, reviewed: { type: "file", digest, mode: 0o600, extra: true } } }
  ]
  for (const request of malformed) {
    expect(() => decodeRequest(request)).toThrow()
    const result = spawnSync(oraclePath, [], { input: JSON.stringify(request) + "\n", encoding: "utf8", timeout: 10_000 })
    if (result.error !== undefined) throw result.error
    expect(result.status, JSON.stringify(request)).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("oracle:")
  }
})
