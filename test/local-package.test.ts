import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Local from "../contracts/LocalPackage.ts"
import { parseJson } from "../src/internal/json.ts"
import { classifyLocalPackage } from "../src/installer/local/package.ts"

const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const Vector = Schema.Struct({ request: Local.OracleRequest, expected: Local.OracleResponse })
const sameResponse = Schema.toEquivalence(Local.OracleResponse)
const sameRequest = Schema.toEquivalence(Local.OracleRequest)

function decode<S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value)
}

function request(approval: unknown, observed: unknown): Local.OracleRequest {
  return decode(Local.OracleRequest, { schema: 1, type: "classify_local_package", input: { approval, observed } })
}

function compare(requests: ReadonlyArray<Local.OracleRequest>): ReadonlyArray<Local.OracleResponse> {
  const input = requests.map((value) => JSON.stringify(Schema.encodeSync(Local.OracleRequest)(value))).join("\n") + "\n"
  const run = spawnSync(oracle, [], { input, encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024 })
  if (run.error !== undefined) throw run.error
  if (run.status !== 0) throw new Error(`Package oracle exited ${String(run.status)}: ${run.stderr}`)
  const responses = run.stdout.trimEnd().split("\n").map((line) => decode(Local.OracleResponse, parseJson(line)))
  expect(responses).toHaveLength(requests.length)
  for (const [index, value] of requests.entries()) {
    const before = structuredClone(value)
    const actual = decode(Local.OracleResponse, {
      schema: 1, type: "classify_local_package", output: classifyLocalPackage(value.input)
    })
    expect(sameRequest(value, before), `mutated package request ${index}`).toBe(true)
    const expected = responses[index]
    if (expected === undefined) throw new Error(`Missing package response ${index}`)
    expect(sameResponse(actual, expected), `package case ${index}: ${JSON.stringify(value)}`).toBe(true)
  }
  return responses
}

const physical = { volume: "1".repeat(16), file: "2".repeat(32) }
const approval = decode(Local.Approval, {
  owner: "engineering-α", identity: { plan: "a".repeat(64), bundle: "b".repeat(64) }, root: physical,
  files: [
    { path: "manifest.json", digest: "0".repeat(64), executable: false },
    { path: "mcp/server.mjs", digest: "1".repeat(64), executable: true },
    { path: "skills/triage/SKILL.md", digest: "2".repeat(64), executable: false }
  ]
})
const tree = decode(Local.Tree, {
  root: physical, basis: "e".repeat(64), directories: ["mcp", "skills", "skills/triage"],
  files: approval.files.map(({ path, digest }) => ({ path, digest, mode: { type: "unrepresented" } }))
})

function generatedRequests(): ReadonlyArray<Local.OracleRequest> {
  const approvals = [approval, null,
    decode(Local.Approval, { ...approval, owner: "another-owner" }),
    decode(Local.Approval, { ...approval, identity: { ...approval.identity, bundle: "c".repeat(64) } }),
    decode(Local.Approval, { ...approval, files: [approval.files[0], approval.files[0]] })
  ]
  const roots = [physical, { ...physical, volume: "f".repeat(16) }, { ...physical, file: "f".repeat(32) }]
  const modes = [
    () => ({ type: "unrepresented" }),
    (index: number) => ({ type: "posix", before: index === 1 ? 493 : 420, after: index === 1 ? 493 : 420 }),
    (index: number) => ({ type: "posix", before: index === 1 ? 420 : 493, after: index === 1 ? 420 : 493 }),
    () => ({ type: "unavailable" }),
    () => ({ type: "posix", before: 420, after: 384 }),
    (index: number) => ({ type: "posix", before: index === 1 ? 448 : 384, after: index === 1 ? 448 : 384 })
  ]
  const masks = Array.from({ length: 8 }, (_, index) => index)
  return approvals.flatMap((approved) => roots.flatMap((root) => masks.flatMap((fileMask) =>
    masks.flatMap((directoryMask) => modes.map((mode) => request(approved, {
      type: "tree", ...tree, root,
      files: tree.files.map((file, index) => ({ ...file, mode: mode(index) })).filter((_, index) => (fileMask & (1 << index)) !== 0),
      directories: tree.directories.filter((_, index) => (directoryMask & (1 << index)) !== 0)
    }))))))
}

function permutations<A>(values: ReadonlyArray<A>): ReadonlyArray<ReadonlyArray<A>> {
  if (values.length === 0) return [[]]
  return values.flatMap((value, index) => permutations(values.filter((_, position) => position !== index))
    .map((rest) => [value, ...rest]))
}

it("matches the 46 reviewed ownership, content and subset vectors", () => {
  const path = new URL("../spec/vectors/local-package.ndjson", import.meta.url)
  const vectors = readFileSync(path, "utf8").trimEnd().split("\n").map((line) => decode(Vector, parseJson(line)))
  expect(vectors).toHaveLength(46)
  const responses = compare(vectors.map((vector) => vector.request))
  for (const [index, vector] of vectors.entries()) {
    const response = responses[index]
    if (response === undefined) throw new Error(`Missing reviewed package vector ${index}`)
    expect(sameResponse(response, vector.expected), `reviewed package vector ${index}`).toBe(true)
  }
})

it("agrees with Lean on 5760 root, approval, file, directory and mode combinations", () => {
  const requests = generatedRequests()
  expect(requests).toHaveLength(5760)
  compare(requests)
}, 60_000)

it("preserves classification across all 216 independent full-tree permutations", () => {
  const requests = permutations(approval.files).flatMap((files) => permutations(tree.files).flatMap((observed) =>
    permutations(tree.directories).map((directories) => request({ ...approval, files }, { type: "tree", ...tree, files: observed, directories }))))
  expect(requests).toHaveLength(216)
  const responses = compare(requests)
  const first = responses[0]
  if (first === undefined) throw new Error("Missing permutation baseline")
  expect(first.output.type).toBe("complete")
  expect(responses.every((response) => sameResponse(first, response))).toBe(true)
})

it("rejects 28 malformed requests at both strict wire boundaries", () => {
  const file = approval.files[0]
  const approved = { ...approval, files: [file] }
  const observedFile = { path: file.path, digest: file.digest, mode: { type: "unrepresented" } }
  const observed = { type: "tree", ...tree, directories: [], files: [observedFile] }
  const baseline = { schema: 1, type: "classify_local_package", input: { approval: approved, observed } }
  decode(Local.OracleRequest, baseline)
  const wire = (approval: unknown, observed: unknown) => JSON.stringify({ ...baseline, input: { approval, observed } })
  const raw = JSON.stringify(baseline)
  const invalid = [
    JSON.stringify({ ...baseline, schema: 2 }),
    JSON.stringify({ ...baseline, type: "unknown_package" }),
    JSON.stringify({ ...baseline, force: true }),
    wire({ ...approved, files: [] }, observed),
    wire({ ...approved, owner: "" }, observed),
    wire({ ...approved, owner: "\ud800" }, observed),
    wire({ ...approved, root: { ...physical, volume: "1".repeat(15) } }, observed),
    wire(approved, { ...observed, root: { ...physical, file: "A".repeat(32) } }),
    wire({ ...approved, root: { ...physical, path: "trusted" } }, observed),
    wire({ ...approved, identity: { ...approved.identity, plan: "a".repeat(64) + "\n" } }, observed),
    wire({ ...approved, identity: { ...approved.identity, bundle: "b".repeat(64) + "\n" } }, observed),
    wire(approved, { ...observed, basis: "e".repeat(64) + "\n" }),
    wire({ ...approved, files: [{ ...file, digest: "0".repeat(64) + "\n" }] }, observed),
    wire({ ...approved, files: [{ ...file, path: "../escape" }] }, observed),
    wire(approved, { ...observed, directories: ["mcp//sub"] }),
    wire(approved, { ...observed, files: [{ ...observedFile, path: "mcp\\server" }] }),
    wire(approved, { ...observed, files: [{ ...observedFile, path: "bad/\udc00" }] }),
    wire(approved, { type: "directory" }),
    wire(approved, { type: "absent", basis: tree.basis }),
    wire(approved, { ...observed, files: [{ ...observedFile, mode: { type: "windows" } }] }),
    wire(approved, { ...observed, files: [{ ...observedFile, mode: { type: "unrepresented", executable: false } }] }),
    wire(approved, { ...observed, files: [{ ...observedFile, mode: { type: "posix", before: 512, after: 512 } }] }),
    wire(approved, { ...observed, files: [{ ...observedFile, mode: { type: "posix", before: -1, after: 0 } }] }),
    wire(approved, { ...observed, files: [{ ...observedFile, mode: { type: "posix", before: 1.5, after: 1.5 } }] }),
    wire({ ...approved, files: [{ ...file, executable: "false" }] }, observed),
    JSON.stringify({ ...baseline, input: { observed } }),
    wire(approved, { type: "tree", basis: tree.basis, directories: [], files: [observedFile] }),
    raw.replace('"schema":1', '"schema":1,"schema":1')
  ]
  expect(invalid).toHaveLength(28)
  for (const input of invalid) {
    expect(() => decode(Local.OracleRequest, parseJson(input))).toThrow()
    const run = spawnSync(oracle, [], { input: input + "\n", encoding: "utf8", timeout: 10_000 })
    if (run.error !== undefined) throw run.error
    expect(run.status).toBe(1)
    expect(run.stdout).toBe("")
    expect(run.stderr).toContain("oracle:")
  }
})
