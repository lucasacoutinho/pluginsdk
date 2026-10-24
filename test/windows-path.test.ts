import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { PackagePath } from "../contracts/Plugin.ts"
import * as Windows from "../contracts/WindowsPath.ts"
import { parseJson } from "../src/internal/json.ts"
import { classifyWindowsPath, deriveWindowsPathCapacity, matchesNativePath } from "../src/internal/windows-files/path.ts"

const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  properties: Schema.Array(Schema.NonEmptyString),
  request: Windows.OracleRequest,
  expected: Windows.OracleResponse
})
const decodeResponse = Schema.decodeUnknownSync(Windows.OracleResponse, { onExcessProperty: "error" })
const sameResponse = Schema.toEquivalence(Windows.OracleResponse)

const request = (path: string, component: number, remaining: number): Extract<Windows.OracleRequest, { type: "windows_path" }> => ({
  schema: 1,
  type: "windows_path",
  input: {
    path: PackagePath.make(path),
    capacity: {
      maxComponentUnits: Windows.UnitCapacity.make(component),
      remainingPathUnits: Windows.UnitCapacity.make(remaining)
    }
  }
})

function compare(requests: ReadonlyArray<Windows.OracleRequest>): ReadonlyArray<Windows.OracleResponse> {
  const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
  const input = requests.map((value) => JSON.stringify(Schema.encodeSync(Windows.OracleRequest)(value))).join("\n")
  const result = spawnSync(oracle, [], { input: input + "\n", encoding: "utf8", timeout: 10_000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toBe("")
  const responses = result.stdout.trim().split("\n").map((line) => decodeResponse(parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, value] of requests.entries()) {
    const before = structuredClone(value)
    const actual: Windows.OracleResponse = Match.value(value).pipe(Match.discriminatorsExhaustive("type")({
      windows_path: ({ input }): Windows.OracleResponse => ({ schema: 1, type: "windows_path", output: classifyWindowsPath(input) }),
      windows_root_capacity: ({ input }): Windows.OracleResponse => ({ schema: 1, type: "windows_root_capacity", output: deriveWindowsPathCapacity(input) }),
      native_path_match: ({ input }): Windows.OracleResponse => ({ schema: 1, type: "native_path_match", output: matchesNativePath(input) })
    }))
    expect(value).toEqual(before)
    const response = responses[index]
    if (response === undefined) throw new Error("Missing Windows path oracle response")
    expect(sameResponse(actual, response), JSON.stringify(value.input)).toBe(true)
  }
  return responses
}

it("conforms to independently authored Windows filename decisions", () => {
  const decodeVector = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/windows-paths.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decodeVector(parseJson(line)))
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error("Missing authored Windows path response")
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms to authored complete-name capacities and the native expansion counterexample", () => {
  const decodeVector = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/windows-root-capacities.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decodeVector(parseJson(line)))
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error("Missing authored Windows capacity response")
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms to authored native path spellings and the retained Codex counterexample", () => {
  const decodeVector = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/native-paths.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decodeVector(parseJson(line)))
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error("Missing native path oracle response")
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms across native platform bindings, device families and neighboring paths", () => {
  const decodeInput = Schema.decodeUnknownSync(Windows.NativePathInput, { onExcessProperty: "error" })
  const names = ["market", ".pluginsdk", " leading", "é", "é", "😀", "名字", "NULled", "con", "CON .txt", "aux", "conout$",
    ".", "..", "", "tail.", "tail ", "file:stream", "a/b", "a?b", "a\u0001b",
    ...["com", "lpt"].flatMap((prefix) => [..."123456789¹²³"].map((digit) => prefix + digit + ".txt"))]
  const paths = names.flatMap((name) => ["C:\\owned\\" + name, "z:\\" + name + "\\payloads"])
  const requests = ["win32", "linux", "darwin", "other"].flatMap((platform) => paths.flatMap((expected) =>
    [expected, "\\\\?\\" + expected, "\\\\?\\" + expected + "-neighbor", expected.toLowerCase(), "\\\\?\\\\\\?\\" + expected].map((reported): Windows.OracleRequest => ({
      schema: 1, type: "native_path_match", input: decodeInput({ platform, expected, reported })
    }))))
  compare(requests)
})

it("rejects malformed native path observations at both wire boundaries", () => {
  const decodeRequest = Schema.decodeUnknownSync(Windows.OracleRequest, { onExcessProperty: "error" })
  const good = { schema: 1, type: "native_path_match", input: { platform: "win32", expected: "C:\\owned", reported: "C:\\owned" } }
  const malformed = [
    { ...good, schema: 2 }, { ...good, extra: true }, { ...good, input: { ...good.input, extra: true } },
    ...["platform", "expected", "reported"].flatMap((field) => [null, true, 1, [], {}, "\ud800"].map((value) =>
      ({ ...good, input: { ...good.input, [field]: value } }))),
    { ...good, input: { ...good.input, platform: "" } },
    ...["expected", "reported"].map((field) => ({ ...good, input: { ...good.input, [field]: "a\0b" } }))
  ].map((value) => JSON.stringify(value))
  malformed.push('{"schema":1,"type":"native_path_match","input":{"platform":"win32","expected":"a","expected":"b","reported":"a"}}')
  const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
  for (const line of malformed) {
    expect(() => decodeRequest(parseJson(line))).toThrow()
    const result = spawnSync(oracle, [], { input: line + "\n", encoding: "utf8", timeout: 10_000 })
    if (result.error !== undefined) throw result.error
    expect(result.status, line).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("oracle:")
  }
})

const decodeRootInput = Schema.decodeUnknownSync(Windows.RootCapacityInput, { onExcessProperty: "error" })
const sameRootResolution = Schema.toEquivalence(Windows.RootCapacityResolution)
const completeName = (root: string, relative: string): string =>
  root + (root.endsWith("\\") ? "" : "\\") + relative.replaceAll("/", "\\") + "\0"
const utf16BufferUnits = (value: string): number => Buffer.byteLength(value, "utf16le") / 2

it("conforms across native views and satisfies fit, maximality, ordering and increasing limits", () => {
  const roots = ["", "C:", "C:\\", "C:\\work", "C:\\work\\", "C:\\😀", "C:\\é", "C:\\é", "C:/", "C:\\x\n"]
  const inputs: Array<Windows.RootCapacityInput> = []
  for (const [index, root] of roots.entries()) {
    const overhead = utf16BufferUnits(completeName(root, ""))
    const limits = new Set([0, 1, 2, 4, 8, 16, 32_767, 32_768, 0xffff_ffff, overhead - 1, overhead, overhead + 1])
    for (const limit of limits) {
      for (const component of [0, 255, 0xffff_ffff]) {
        const view = { root, maxPathBufferUnits: limit }
        const other = { root: roots[(index + 1) % roots.length], maxPathBufferUnits: Math.min(limit + 3, 0xffff_ffff) }
        for (const views of [[view], [view, other], [other, view], [view, view, other]]) {
          inputs.push(decodeRootInput({ maxComponentUnits: component, views }))
        }
      }
    }
  }
  expect(inputs).toHaveLength(1_320)
  compare(inputs.map((input) => ({ schema: 1, type: "windows_root_capacity", input })))
  for (const input of inputs) {
    const result = deriveWindowsPathCapacity(input)
    const reversed = decodeRootInput({ ...input, views: input.views.toReversed() })
    expect(sameRootResolution(result, deriveWindowsPathCapacity(reversed))).toBe(true)
    Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
      refused: () => {
        expect(input.views.some((view) => utf16BufferUnits(completeName(view.root, "")) > view.maxPathBufferUnits)).toBe(true)
      },
      available: ({ capacity }) => {
        expect(capacity.maxComponentUnits).toBe(input.maxComponentUnits)
        const used = input.views.map((view) => utf16BufferUnits(completeName(view.root, "")) + capacity.remainingPathUnits)
        expect(used.every((units, index) => {
          const view = input.views[index]
          return view !== undefined && units <= view.maxPathBufferUnits
        })).toBe(true)
        expect(used.some((units, index) => units === input.views[index]?.maxPathBufferUnits)).toBe(true)
        for (const path of ["a", "é", "😀", "dir/é😀"]) {
          if (classifyWindowsPath({ path: PackagePath.make(path), capacity }) === "accepted") {
            for (const view of input.views) {
              expect(utf16BufferUnits(completeName(view.root, path))).toBeLessThanOrEqual(view.maxPathBufferUnits)
            }
          }
        }
        const increased = decodeRootInput({
          maxComponentUnits: Math.min(input.maxComponentUnits + 1, 0xffff_ffff),
          views: input.views.map((view) => ({ ...view, maxPathBufferUnits: Math.min(view.maxPathBufferUnits + 1, 0xffff_ffff) }))
        })
        Match.value(deriveWindowsPathCapacity(increased)).pipe(Match.discriminatorsExhaustive("type")({
          refused: () => { throw new Error("Increasing native limits refused an available capacity") },
          available: ({ capacity: next }) => {
            expect(next.maxComponentUnits).toBeGreaterThanOrEqual(capacity.maxComponentUnits)
            expect(next.remainingPathUnits).toBeGreaterThanOrEqual(capacity.remainingPathUnits)
          }
        }))
      }
    }))
  }
})

it("rejects malformed native view inputs and root-capacity responses", () => {
  const good = { maxComponentUnits: 255, views: [{ root: "C:\\work", maxPathBufferUnits: 32_767 }] }
  for (const views of [[], null, {}, "root", [null], [{ root: "C:\\work" }], [{ maxPathBufferUnits: 1 }]]) {
    expect(() => decodeRootInput({ ...good, views })).toThrow()
  }
  for (const root of ["a\0b", "\ud800", "\udfff", null, true, 1, [], {}]) {
    expect(() => decodeRootInput({ ...good, views: [{ root, maxPathBufferUnits: 10 }] })).toThrow()
  }
  for (const value of [-1, 0.5, 0x1_0000_0000, Number.NaN, Number.POSITIVE_INFINITY, "1", null, true, [], {}]) {
    expect(() => decodeRootInput({ ...good, maxComponentUnits: value })).toThrow()
    expect(() => decodeRootInput({ ...good, views: [{ root: "C:\\", maxPathBufferUnits: value }] })).toThrow()
  }
  expect(() => decodeRootInput({ ...good, extra: true })).toThrow()
  expect(() => decodeRootInput({ ...good, views: [{ root: "C:\\", maxPathBufferUnits: 8, extra: true }] })).toThrow()
  for (const output of [{ type: "unknown" }, { type: "available" }, { type: "refused", capacity: {} },
    { type: "available", capacity: { maxComponentUnits: 255, remainingPathUnits: -1 } }]) {
    expect(() => decodeResponse({ schema: 1, type: "windows_root_capacity", output })).toThrow()
  }
})

it("conforms across Unicode, device families, syntax and both capacity boundaries", () => {
  const names = ["file", "FILE", ".config", "a..b", "a b", " leading", "trailing ", "trailing.",
    "é", "é", "😀", "é😀", "名字", "a\u00a0", "con", "CoN.txt", "CON .txt", "prn", "AUX.tar.gz", "nul", "NULled",
    "CONIN$", "conout$.txt", "com0", "com10", "lpt0", "lpt10", "x:stream", "x::$DATA", "a<b", "a>b", 'a"b', "a|b", "a?b", "a*b",
    ...Array.from({ length: 31 }, (_, index) => "a" + String.fromCharCode(index + 1) + "b"),
    ...["com", "lpt"].flatMap((prefix) => [..."123456789¹²³"].map((digit) => prefix + digit + ".txt"))]
  const paths = [...names.map((name) => "assets/" + name), "😀", "😀/é", "Case/file", "case/file",
    "a".repeat(255), "a".repeat(256), "😀".repeat(127) + "a", "😀".repeat(128)]
  const requests = paths.flatMap((path) => [0, 1, 2, 4, 8, 255, 0xffff_ffff].flatMap((component) =>
    [0, 1, 2, 4, 8, 12, 255, 256, 0xffff_ffff].map((remaining) => request(path, component, remaining))))
  expect(requests).toHaveLength(6_174)
  compare(requests)
})

it("rejects malformed capacities, package paths and excess wire fields", () => {
  const decodeInput = Schema.decodeUnknownSync(Windows.PathInput, { onExcessProperty: "error" })
  const good = request("file", 255, 1024).input
  for (const value of [-1, 0.5, 0x1_0000_0000, Number.NaN, Number.POSITIVE_INFINITY, "1", null, true, [], {}]) {
    for (const field of ["maxComponentUnits", "remainingPathUnits"]) {
      expect(() => decodeInput({ ...good, capacity: { ...good.capacity, [field]: value } })).toThrow()
    }
  }
  for (const path of ["", "/a", "a/", "a//b", "a/../b", "a/./b", "a\\b", "C:relative", "a\0b", "\ud800"]) {
    expect(() => decodeInput({ ...good, path })).toThrow()
  }
  expect(() => decodeInput({ ...good, extra: 1 })).toThrow()
  expect(() => decodeInput({ ...good, capacity: { ...good.capacity, extra: 1 } })).toThrow()
  const decodeRequest = Schema.decodeUnknownSync(Windows.OracleRequest, { onExcessProperty: "error" })
  expect(() => decodeRequest({ ...request("file", 255, 1024), extra: true })).toThrow()
  expect(() => decodeResponse({ schema: 1, type: "windows_path", output: "accepted", extra: true })).toThrow()
  expect(() => decodeResponse({ schema: 1, type: "windows_path", output: "unknown" })).toThrow()
})
