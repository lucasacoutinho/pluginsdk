import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Files from "../contracts/FileRead.ts"
import { parseJson } from "../src/internal/json.ts"
import { admitRead, inside, parseFinalPath } from "../src/internal/files/file.ts"

const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Files.OracleRequest,
  expected: Files.OracleResponse
})
const decodeResponse = Schema.decodeUnknownSync(Files.OracleResponse, { onExcessProperty: "error" })
const sameResponse = Schema.toEquivalence(Files.OracleResponse)
const guid = Files.VolumeGuid.make("350036da-7c9b-4f8c-b9e8-8d33c80946e6")
const prefix = `\\\\?\\Volume{${guid}}\\`
const root: Files.Anchor = {
  identity: { volume: Files.VolumeId.make("9e6c02086c01dc41"), file: Files.FileId.make("0dc502000000d1000000000000000000") },
  path: Files.FinalPath.make(`${prefix}root`),
  caseSensitive: false
}
const info: Files.FileInfo = {
  identity: { volume: root.identity.volume, file: Files.FileId.make("aaa5080000004a000000000000000000") },
  path: Files.FinalPath.make(`${root.path}\\file.bin`),
  size: Files.Quantity.make("9"),
  modified: Files.Quantity.make("134370895276056742"),
  changed: Files.Quantity.make("134370895276056742")
}
const directory = (anchor: Files.Anchor): Files.Observation => ({ type: "directory", anchor })
const file = (info: Files.FileInfo): Files.Observation => ({ type: "file", info })
const base: Files.ReadInput = {
  root,
  before: { root: directory(root), file: file(info) },
  after: { root: directory(root), file: file(info) },
  read: { type: "complete", length: info.size }
}
const readRequest = (input: Files.ReadInput): Files.OracleRequest => ({ schema: 1, type: "file_read", input })

function evaluate(request: Files.OracleRequest): Files.OracleResponse {
  return Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
    file_path: ({ input }): Files.OracleResponse => ({ schema: 1, type: "file_path", output: parseFinalPath(input.path) }),
    file_containment: ({ input }): Files.OracleResponse => ({ schema: 1, type: "file_containment", output: inside(input.root, input.file) }),
    file_read: ({ input }): Files.OracleResponse => ({ schema: 1, type: "file_read", output: admitRead(input) })
  }))
}

function compare(requests: ReadonlyArray<Files.OracleRequest>): ReadonlyArray<Files.OracleResponse> {
  const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
  const input = requests.map((request) => JSON.stringify(Schema.encodeSync(Files.OracleRequest)(request))).join("\n")
  const result = spawnSync(oracle, [], { input: `${input}\n`, encoding: "utf8", timeout: 10_000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  const expected = result.stdout.trim().split("\n").map((line) => decodeResponse(parseJson(line)))
  expect(expected).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(request)
    const actual = evaluate(request)
    expect(request).toEqual(before)
    const response = expected[index]
    if (response === undefined) throw new Error("Missing file-read oracle response")
    expect(sameResponse(actual, response), `request ${index}: ${JSON.stringify(request)}`).toBe(true)
  }
  return expected
}

it("conforms to independently authored file-read and recorded native cases", () => {
  const decodeVector = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/file-reads.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decodeVector(parseJson(line)))
  const observed = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = observed[index]
    if (response === undefined) throw new Error("Missing authored file-read response")
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms across path grammar, Unicode, exact case and proper containment", () => {
  const namespaces = ["\\\\?\\", "\\\\.\\", "\\??\\", "", "C:\\", "\\\\server\\"]
  const volumes = [`Volume{${guid}}`, `Volume{${guid.toUpperCase()}}`, `volume{${guid}}`, "Volume{bad}"]
  const suffixes = ["", "\\", "\\root", "\\root\\file", "\\root2\\file", "\\Root\\file", "\\é\\😀", "\\a b\\x.",
    "\\root\\file:stream", "\\root\\file::$DATA", "\\.\\file", "\\..\\file", "\\root\\", "\\root\\\\file", "\\root/file", "\\root\nfile"]
  const requests: Array<Files.OracleRequest> = namespaces.flatMap((namespace) => volumes.flatMap((volume) =>
    suffixes.map((suffix): Files.OracleRequest => ({ schema: 1, type: "file_path", input: { path: Files.FinalPath.make(`${namespace}${volume}${suffix}`) } }))))
  const components = [[], ["root"], ["Root"], ["root2"], ["root", "file"], ["root", "sub", "file"], ["é", "😀"]]
  const paths: Array<Files.CanonicalPath> = [guid, Files.VolumeGuid.make("00000000-0000-0000-0000-000000000000")]
    .flatMap((volume) => components.map((parts) => ({ volume, components: parts.map((part) => Files.Component.make(part)) })))
  requests.push(...paths.flatMap((root) => paths.map((file): Files.OracleRequest => ({ schema: 1, type: "file_containment", input: { root, file } }))))
  expect(requests).toHaveLength(580)
  compare(requests)
})

it("conforms across observation states, root bindings and competing refusal reasons", () => {
  const otherId = Files.FileId.make("ffffffffffffffffffffffffffffffff")
  const otherVolume = Files.VolumeId.make("ffffffffffffffff")
  const observations: ReadonlyArray<Files.Observation> = [
    { type: "unavailable" }, { type: "other" }, directory(root), file(info),
    file({ ...info, identity: { ...info.identity, file: otherId } }),
    file({ ...info, identity: { ...info.identity, volume: otherVolume } }),
    file({ ...info, path: Files.FinalPath.make(`${root.path}\\other.bin`) }),
    file({ ...info, path: Files.FinalPath.make(`${prefix}root2\\file.bin`) }),
    file({ ...info, path: root.path }),
    file({ ...info, path: Files.FinalPath.make(`${info.path}:stream`) }),
    file({ ...info, path: Files.FinalPath.make("C:\\root\\file.bin") }),
    file({ ...info, size: Files.Quantity.make("0") }),
    file({ ...info, modified: Files.Quantity.make("0") }),
    file({ ...info, changed: Files.Quantity.make("0") })
  ]
  const reads: ReadonlyArray<Files.ReadResult> = [
    { type: "failed" }, { type: "complete", length: Files.Quantity.make("0") },
    { type: "complete", length: info.size }, { type: "complete", length: Files.Quantity.make("9223372036854775807") }
  ]
  const requests = observations.flatMap((before) => observations.flatMap((after) => reads.map((read) => readRequest({
    ...base, before: { ...base.before, file: before }, after: { ...base.after, file: after }, read
  }))))
  const roots: ReadonlyArray<Files.Observation> = [
    directory(root), directory({ ...root, identity: { ...root.identity, file: otherId } }),
    directory({ ...root, identity: { ...root.identity, volume: otherVolume } }),
    directory({ ...root, path: Files.FinalPath.make(`${prefix}other-root`) }),
    directory({ ...root, caseSensitive: true }),
    directory({ ...root, path: Files.FinalPath.make(`${root.path}:stream`) }),
    directory({ ...root, path: Files.FinalPath.make("C:\\root") }),
    { type: "unavailable" }, { type: "other" }, file(info)
  ]
  requests.push(...roots.flatMap((before) => roots.flatMap((after) => observations.map((observed) => readRequest({
    ...base, before: { root: before, file: observed }, after: { root: after, file: file(info) }
  })))))
  for (const quantity of ["0", "9007199254740993", "9223372036854775807"]) {
    const exact = { ...info, size: Files.Quantity.make(quantity), modified: Files.Quantity.make(quantity), changed: Files.Quantity.make(quantity) }
    requests.push(readRequest({ ...base, before: { ...base.before, file: file(exact) }, after: { ...base.after, file: file(exact) }, read: { type: "complete", length: exact.size } }))
  }
  expect(requests).toHaveLength(2187)
  compare(requests)
})

it("rejects malformed identity, quantity, path and nested schema data", () => {
  const decode = Schema.decodeUnknownSync(Files.ReadInput, { onExcessProperty: "error" })
  for (const quantity of ["", "00", "01", "-0", "-1", "+1", "1.0", "1e0", " 1", "1\n", "9223372036854775808", "9".repeat(100), 1, null, true]) {
    for (const field of ["size", "modified", "changed"]) {
      expect(() => decode({ ...base, before: { ...base.before, file: { type: "file", info: { ...info, [field]: quantity } } } })).toThrow()
    }
    expect(() => decode({ ...base, read: { type: "complete", length: quantity } })).toThrow()
  }
  for (const volume of ["", "0".repeat(15), "0".repeat(17), "A".repeat(16), `${root.identity.volume}\n`, null, 1]) {
    expect(() => decode({ ...base, root: { ...root, identity: { ...root.identity, volume } } })).toThrow()
  }
  for (const file of ["", "0".repeat(31), "0".repeat(33), "A".repeat(32), `${info.identity.file}\n`, null, 1]) {
    expect(() => decode({ ...base, after: { ...base.after, file: { type: "file", info: { ...info, identity: { ...info.identity, file } } } } })).toThrow()
  }
  for (const path of ["bad\0path", "\ud800", "\udfff", null, 1]) {
    expect(() => decode({ ...base, root: { ...root, path } })).toThrow()
  }
  const decodeComponent = Schema.decodeUnknownSync(Files.Component)
  for (const component of ["", ".", "..", "a/b", "a\\b", "a:b", "a\0b", "\ud800", null]) expect(() => decodeComponent(component)).toThrow()
  for (const invalid of [
    { ...base, extra: true }, { ...base, root: { ...root, extra: true } },
    { ...base, before: { ...base.before, root: { type: "unavailable", anchor: root } } },
    { ...base, after: { ...base.after, file: { type: "other", info } } },
    { ...base, read: { type: "failed", length: "0" } }, { ...base, read: { type: "complete" } }
  ]) expect(() => decode(invalid)).toThrow()
})
