import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as Assembly from "../contracts/Assembly.ts"
import * as CompilerModel from "../contracts/CompilerModel.ts"
import { PackagePath } from "../contracts/Plugin.ts"
import { assemble, reservedAssetPath } from "../src/model/assembly.ts"

type AssemblyRequest = Assembly.OracleRequest
type AssemblyResponse = Assembly.OracleResponse
type Asset = CompilerModel.Asset
const equivalentResponse = Schema.toEquivalence(Assembly.OracleResponse)

const oraclePath = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
const vectorPath = fileURLToPath(new URL("../spec/vectors/assembly.ndjson", import.meta.url))

const VectorRow = Schema.Struct({
  name: Schema.String,
  request: Schema.Unknown,
  expected: Schema.Unknown
})

function decodeStrict<S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)
}

function readVectors(): ReadonlyArray<{ readonly name: string; readonly request: AssemblyRequest; readonly expected: AssemblyResponse }> {
  const cases: Array<{ readonly name: string; readonly request: AssemblyRequest; readonly expected: AssemblyResponse }> = []
  for (const line of readFileSync(vectorPath, "utf8").split(/\r?\n/)) {
    if (line.length === 0) continue
    const row = decodeStrict(VectorRow, JSON.parse(line))
    cases.push({
      name: row.name,
      request: decodeStrict(Assembly.OracleRequest, row.request),
      expected: decodeStrict(Assembly.OracleResponse, row.expected)
    })
  }
  return cases
}

function runOracle(requests: ReadonlyArray<AssemblyRequest>): ReadonlyArray<AssemblyResponse> {
  const lines: Array<string> = []
  for (const request of requests) {
    const encoded: unknown = Schema.encodeSync(Assembly.OracleRequest)(request)
    const line = JSON.stringify(encoded)
    if (line === undefined) throw new Error("assembly oracle request could not be encoded as JSON")
    lines.push(line)
  }
  const result = spawnSync(oraclePath, [], {
    encoding: "utf8",
    input: `${lines.join("\n")}\n`,
    maxBuffer: 24 * 1024 * 1024,
    timeout: 30_000
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Lean assembly oracle exited with status ${String(result.status)}: ${result.stderr}`)

  const responses: Array<AssemblyResponse> = []
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.length === 0) continue
    const raw: unknown = JSON.parse(line)
    responses.push(decodeStrict(Assembly.OracleResponse, raw))
  }
  return responses
}

function asset(path: string, digest = "1".repeat(64), executable = false): Asset {
  return Schema.decodeSync(CompilerModel.Asset)({
    path: Schema.decodeSync(PackagePath)(path),
    digest: Schema.decodeSync(CompilerModel.FileDigest)(digest),
    executable
  })
}

function input(base: ReadonlyArray<Asset>, assets: ReadonlyArray<Asset>): Assembly.AssemblyInput {
  return Schema.decodeUnknownSync(Assembly.AssemblyInput)({ base, assets })
}

function request(value: Assembly.AssemblyInput): AssemblyRequest {
  return Schema.decodeSync(Assembly.OracleRequest)({ schema: 1, type: "assemble", input: value })
}

function evaluate(value: AssemblyRequest): AssemblyResponse {
  const untrusted: unknown = { schema: 1, type: "assemble", output: assemble(value.input) }
  const decoded = decodeStrict(Assembly.OracleResponse, untrusted)
  const encoded: unknown = Schema.encodeSync(Assembly.OracleResponse)(decoded)
  return decodeStrict(Assembly.OracleResponse, encoded)
}

function permutations<A>(values: ReadonlyArray<A>): ReadonlyArray<ReadonlyArray<A>> {
  if (values.length === 0) return [[]]
  const result: Array<ReadonlyArray<A>> = []
  for (const [index, head] of values.entries()) {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)]
    for (const tail of permutations(rest)) result.push([head, ...tail])
  }
  return result
}

function compareOracleBatch(cases: ReadonlyArray<{ readonly name: string; readonly request: AssemblyRequest; readonly expected: AssemblyResponse }>): void {
  const roundTripped = cases.map((current) => {
    const encoded: unknown = Schema.encodeSync(Assembly.OracleRequest)(current.request)
    return decodeStrict(Assembly.OracleRequest, encoded)
  })
  const oracle = runOracle(roundTripped)
  expect(oracle).toHaveLength(cases.length)
  for (const [index, current] of cases.entries()) {
    const response = oracle[index]
    if (response === undefined) throw new Error(`assembly oracle response ${index} is missing`)
    expect(equivalentResponse(response, current.expected), `${current.name}: Lean matches committed expected output`).toBe(true)
    expect(equivalentResponse(evaluate(current.request), response), `${current.name}: TypeScript matches strict Lean output`).toBe(true)
  }
}

it("matches all committed assembly vectors against the strict Lean oracle", () => {
  const cases = readVectors()
  expect(cases).toHaveLength(6)
  compareOracleBatch(cases)
})

it("preserves each requested asset exactly and orders by UTF-8 path bytes", () => {
  const first = asset("z/base.sh", "1".repeat(64), true)
  const second = asset("é/base.txt", "2".repeat(64), false)
  const third = asset("a/readme.md", "3".repeat(64), false)
  const fourth = asset("😀/tool.sh", "4".repeat(64), true)
  const result = assemble(input([first, second], [third, fourth]))
  expect(result).toStrictEqual({
    type: "assembled",
    files: [third, first, second, fourth]
  })
  expect(result.type).toBe("assembled")
})

it("reports duplicate, case-folded and ancestor conflicts without discarding equal-byte requests", () => {
  const repeated = asset("Same.bin", "a".repeat(64), true)
  const sameBytes = asset("same.bin", "a".repeat(64), true)
  const ancestor = asset("tree/child.bin", "b".repeat(64), false)
  const ancestorRoot = asset("TREE", "c".repeat(64), false)
  expect(assemble(input([repeated, ancestor], [sameBytes, ancestorRoot]))).toStrictEqual({
    type: "rejected",
    issues: [
      { type: "path_collision", path: PackagePath.make("same.bin") },
      { type: "path_collision", path: PackagePath.make("tree") }
    ]
  })
})

it("reserves every native root under ASCII case folding, including descendants", () => {
  const roots = [
    "plugin.json", "mcp.json", ".mcp.json", ".lsp.json", ".claude-plugin", ".codex-plugin",
    ".claude", ".codex", "skills", "commands", "agents", "hooks"
  ]
  const base = [asset("base.txt")]
  for (const root of roots) {
    for (const path of [root, root.toUpperCase(), `${root.toUpperCase()}/nested/file.bin`]) {
      expect(reservedAssetPath(path), `${path} is reserved`).toBe(true)
      expect(assemble(input(base, [asset(path)])), `${path} is rejected at its original path`).toStrictEqual({
        type: "rejected",
        issues: [{ type: "reserved_asset", path: PackagePath.make(path) }]
      })
    }
  }
})

it("allows near-miss names and native-looking names below an unrelated root", () => {
  const roots = [
    "plugin.json", "mcp.json", ".mcp.json", ".lsp.json", ".claude-plugin", ".codex-plugin",
    ".claude", ".codex", "skills", "commands", "agents", "hooks"
  ]
  const base = [asset("base.txt")]
  const allowed = roots.flatMap((root) => [`${root}x`, `prefix/${root}`])
  allowed.push("plugín.json", "ＳＫＩＬＬＳ/alpha/SKILL.md")
  for (const path of allowed) {
    expect(reservedAssetPath(path), `${path} is a near-miss`).toBe(false)
    expect(assemble(input(base, [asset(path)])), `${path} remains an asset`).toMatchObject({ type: "assembled" })
  }
})

it("preserves results across independently permuted base and asset requests", () => {
  const validBase = [asset("z.txt", "1".repeat(64)), asset("é.txt", "2".repeat(64)), asset("a.txt", "3".repeat(64))]
  const validAssets = [asset("tools/😀.sh", "4".repeat(64), true), asset("docs/readme.md", "5".repeat(64))]
  const rejectedBase = [asset("Dir/child", "6".repeat(64)), asset("README.md", "7".repeat(64))]
  const rejectedAssets = [asset("DIR", "8".repeat(64)), asset("hooks/run.sh", "9".repeat(64), true)]
  const generated: Array<{ readonly name: string; readonly request: AssemblyRequest; readonly expected: AssemblyResponse }> = []

  const samples: ReadonlyArray<{ readonly label: string; readonly base: ReadonlyArray<Asset>; readonly assets: ReadonlyArray<Asset> }> = [
    { label: "valid", base: validBase, assets: validAssets },
    { label: "rejected", base: rejectedBase, assets: rejectedAssets }
  ]
  for (const sample of samples) {
    const expected = evaluate(request(input(sample.base, sample.assets)))
    for (const baseOrder of permutations(sample.base)) {
      for (const assetOrder of permutations(sample.assets)) {
        generated.push({
          name: `${sample.label} base/asset permutation ${generated.length}`,
          request: request(input(baseOrder, assetOrder)),
          expected
        })
      }
    }
  }
  compareOracleBatch(generated)
})

it("rejects excess properties on both strict oracle wire directions", () => {
  const validRequest = request(input([asset("base.txt")], []))
  const validResponse = decodeStrict(Assembly.OracleResponse, {
    schema: 1,
    type: "assemble",
    output: { type: "assembled", files: [asset("base.txt")] }
  })
  expect(() => decodeStrict(Assembly.OracleRequest, { ...validRequest, extra: true })).toThrow()
  expect(() => decodeStrict(Assembly.OracleRequest, {
    ...validRequest,
    input: { ...validRequest.input, extra: true }
  })).toThrow()
  expect(() => decodeStrict(Assembly.OracleResponse, { ...validResponse, extra: true })).toThrow()
  expect(() => decodeStrict(Assembly.OracleResponse, {
    ...validResponse,
    output: { type: "assembled", files: [asset("base.txt")], extra: true }
  })).toThrow()
})
