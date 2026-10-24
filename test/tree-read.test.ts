import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as Files from "../contracts/FileRead.ts"
import * as Trees from "../contracts/TreeRead.ts"
import { parseJson } from "../src/internal/json.ts"
import { admitDirectory, admitEntry } from "../src/internal/files/tree.ts"

const Vector = Schema.Struct({
  name: Schema.NonEmptyString, properties: Schema.NonEmptyArray(Schema.NonEmptyString),
  request: Trees.OracleRequest, expected: Trees.OracleResponse
})
const decodeResponse = Schema.decodeUnknownSync(Trees.OracleResponse, { onExcessProperty: "error" })
const sameResponse = Schema.toEquivalence(Trees.OracleResponse)
const volume = Files.VolumeId.make("9e6c02086c01dc41")
const nativeRoot = "\\\\?\\Volume{350036da-7c9b-4f8c-b9e8-8d33c80946e6}\\root"
const identity = (value: number): Files.Identity => ({ volume, file: Files.FileId.make(value.toString(16).padStart(32, "0")) })
const anchor = (value: number, path: string): Files.Anchor => ({ identity: identity(value), path: Files.FinalPath.make(path), caseSensitive: false })
const root = anchor(1, nativeRoot)
const file = (value: number, path: string): Files.FileInfo => ({
  identity: identity(value), path: Files.FinalPath.make(path), size: Files.Quantity.make("9"),
  modified: Files.Quantity.make("10"), changed: Files.Quantity.make("11")
})

function compare(requests: ReadonlyArray<Trees.OracleRequest>): ReadonlyArray<Trees.OracleResponse> {
  const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
  const result = spawnSync(oracle, [], {
    input: requests.map((request) => JSON.stringify(Schema.encodeSync(Trees.OracleRequest)(request))).join("\n") + "\n",
    encoding: "utf8", timeout: 20_000, maxBuffer: 4 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr).toBe("")
  const responses = result.stdout.trim().split("\n").map((line) => decodeResponse(parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, request] of requests.entries()) {
    const before = structuredClone(request)
    const actual = Match.value(request).pipe(Match.discriminatorsExhaustive("type")({
      tree_entry: ({ input }): Trees.OracleResponse => ({ schema: 1, type: "tree_entry", output: admitEntry(input) }),
      tree_directory: ({ input }): Trees.OracleResponse => ({ schema: 1, type: "tree_directory", output: admitDirectory(input) })
    }))
    expect(request).toEqual(before)
    const expected = responses[index]
    if (expected === undefined) throw new Error("Missing tree-read oracle response")
    expect(sameResponse(actual, expected), JSON.stringify(request)).toBe(true)
  }
  return responses
}

it("matches independent traversal cases for TR1-TR13", () => {
  const decode = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
  const vectors = readFileSync(new URL("../spec/vectors/tree-reads.ndjson", import.meta.url), "utf8")
    .trim().split("\n").map((line) => decode(parseJson(line)))
  expect(new Set(vectors.flatMap(({ properties }) => properties))).toEqual(new Set(Array.from({ length: 13 }, (_, i) => `TR${i + 1}`)))
  const responses = compare(vectors.map(({ request }) => request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error("Missing authored tree-read response")
    expect(sameResponse(response, vector.expected), vector.name).toBe(true)
  }
})

it("conforms across policies, branches, physical bindings and target kinds", () => {
  const child = anchor(2, nativeRoot + "\\dir")
  const outside = anchor(3, nativeRoot + "-sibling\\dir")
  const branches: ReadonlyArray<Trees.Branch> = [
    { parent: root, ancestors: [] }, { parent: child, ancestors: [root] },
    { parent: outside, ancestors: [root] }, { parent: child, ancestors: [child, root] }
  ]
  const roots = [root, { ...root, identity: identity(99) },
    { ...root, path: Files.FinalPath.make(nativeRoot.replace("350036da-7c9b-4f8c-b9e8-8d33c80946e6", "350036DA-7C9B-4F8C-B9E8-8D33C80946E6")) }]
  const requests: Trees.OracleRequest[] = []
  for (const policy of Trees.Policy.literals) {
    for (const retainedRoot of roots) {
      for (const branch of branches) {
        for (const rawName of ["file.bin", "FILE.bin", "é", "é"]) {
          const name = Files.Component.make(rawName)
          const path = branch.parent.path + "\\" + name
          const leaf = file(4, path)
          const directory = anchor(5, path)
          const reparse = (tag: number): Trees.EntryObservation => ({ type: "reparse", info: {
            identity: identity(6), path: Files.FinalPath.make(path), tag: Trees.ReparseTag.make(tag)
          } })
          const entries: ReadonlyArray<Trees.EntryObservation> = [
            { type: "unavailable" }, { type: "other" }, { type: "file", info: leaf },
            { type: "directory", anchor: directory }, reparse(0xa000_0003), reparse(0xa000_000c), reparse(0)
          ]
          const targets: ReadonlyArray<Files.Observation> = [
            { type: "unavailable" }, { type: "other" }, { type: "file", info: leaf },
            { type: "file", info: { ...leaf, identity: identity(99) } },
            { type: "file", info: file(7, nativeRoot + "\\resolved\\" + name) },
            { type: "directory", anchor: directory }, { type: "directory", anchor: branch.parent }
          ]
          for (const entry of entries) {
            for (const target of targets) requests.push({ schema: 1, type: "tree_entry", input: { policy, root: retainedRoot, branch, name, entry, target } })
          }
        }
      }
    }
  }
  expect(requests).toHaveLength(4_704)
  compare(requests)
}, 30_000)

it("conforms across complete, changed, duplicate, omitted and reordered directory members", () => {
  const names = [[], ["a"], ["a", "b"], ["b", "a"], ["é", "é"], ["😀", "a"], ["A", "a"], ["a", "a"]]
    .map((list) => list.map((name) => Files.Component.make(name)))
  const enumerations: Trees.Enumeration[] = [...names.map((list): Trees.Enumeration => ({ type: "complete", names: list })), { type: "failed" }]
  const info: Trees.DirectoryInfo = { anchor: root, modified: Files.Quantity.make("10"), changed: Files.Quantity.make("11") }
  const before: Trees.DirectorySnapshot = { root: { type: "directory", anchor: root }, directory: { type: "directory", info } }
  const outside = anchor(2, nativeRoot + "-sibling")
  const outsideSnapshot: Trees.DirectorySnapshot = { ...before, directory: { type: "directory", info: { ...info, anchor: outside } } }
  const variants: ReadonlyArray<Pick<Trees.DirectoryInput, "directory" | "before" | "after">> = [
    { directory: root, before, after: before },
    { directory: root, before, after: { ...before, root: { type: "directory", anchor: { ...root, identity: identity(99) } } } },
    { directory: root, before, after: { ...before, directory: { type: "directory", info: { ...info, modified: Files.Quantity.make("12") } } } },
    { directory: root, before, after: { ...before, directory: { type: "directory", info: { ...info, anchor: { ...root, caseSensitive: true } } } } },
    { directory: outside, before: outsideSnapshot, after: outsideSnapshot }
  ]
  const requests: Trees.OracleRequest[] = []
  for (const variant of variants) {
    for (const enumeratedBefore of enumerations) {
      for (const enumeratedAfter of enumerations) {
        for (const visited of names) requests.push({ schema: 1, type: "tree_directory", input: { root, ...variant, enumeratedBefore, enumeratedAfter, visited } })
      }
    }
  }
  expect(requests).toHaveLength(3_240)
  compare(requests)
}, 30_000)

it("rejects invalid tags, component names and excess observation fields at the schema boundary", () => {
  const decode = Schema.decodeUnknownSync(Trees.OracleRequest, { onExcessProperty: "error" })
  const leaf = file(2, nativeRoot + "\\file.bin")
  const input: Trees.EntryInput = {
    policy: "source", root, branch: { parent: root, ancestors: [] }, name: Files.Component.make("file.bin"),
    entry: { type: "file", info: leaf }, target: { type: "file", info: leaf }
  }
  for (const tag of [-1, 0.1, 0x1_0000_0000, Number.NaN, Number.POSITIVE_INFINITY, "1", null, true, [], {}]) {
    expect(() => decode({ schema: 1, type: "tree_entry", input: { ...input, entry: { type: "reparse", info: { identity: leaf.identity, path: leaf.path, tag } } } })).toThrow()
  }
  for (const name of ["", ".", "..", "a/b", "a\\b", "a:b", "a\0b", "\ud800", "\udfff"]) {
    expect(() => decode({ schema: 1, type: "tree_entry", input: { ...input, name } })).toThrow()
  }
  expect(() => decode({ schema: 1, type: "tree_entry", input: { ...input, branch: { ...input.branch, extra: true } } })).toThrow()
  expect(() => decode({ schema: 1, type: "tree_entry", input: { ...input, target: { type: "file", info: { ...leaf, extra: true } } } })).toThrow()
})
