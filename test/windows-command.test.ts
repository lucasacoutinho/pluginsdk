import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { ProcessText } from "../contracts/Plugin.ts"
import { QuotingOracleRequest, QuotingOracleResponse } from "../contracts/WindowsCommand.ts"
import { parseJson } from "../src/internal/json.ts"
import { quoteWindowsArgument } from "../src/installer/windows/protocol.ts"

const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  request: QuotingOracleRequest,
  expected: QuotingOracleResponse
})
const decodeVector = Schema.decodeUnknownSync(Vector, { onExcessProperty: "error" })
const decodeResponse = Schema.decodeUnknownSync(QuotingOracleResponse, { onExcessProperty: "error" })
const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))

const evaluate = (texts: ReadonlyArray<ProcessText>) => {
  const result = spawnSync(oracle, [], {
    input: texts.map((text) => JSON.stringify({ schema: 1, type: "quote_windows_argument", input: { text } })).join("\n") + "\n",
    encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024
  })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  const responses = result.stdout.trim().split(/\r?\n/).map((line) => decodeResponse(parseJson(line)))
  expect(responses).toHaveLength(texts.length)
  return responses
}

it("matches independent Windows quoting vectors and the Lean executable", () => {
  const vectors = readFileSync(new URL("../spec/vectors/windows-quoting.ndjson", import.meta.url), "utf8")
    .trim().split(/\r?\n/).map((line) => decodeVector(parseJson(line)))
  expect(new Set(vectors.map(({ name }) => name)).size).toBe(vectors.length)
  const responses = evaluate(vectors.map(({ request }) => request.input.text))
  for (const [index, vector] of vectors.entries()) {
    expect(responses[index], vector.name).toEqual(vector.expected)
    expect(quoteWindowsArgument(vector.request.input.text), vector.name).toBe(vector.expected.output.quoted)
  }
})

it("conforms for generated backslash, quote, whitespace and Unicode combinations", () => {
  const alphabet = ["\\", '"', " ", "\t", "a", "é", "😀", "\n"]
  const texts = [""]
  let level = [""]
  for (let length = 1; length <= 4; length += 1) {
    level = level.flatMap((prefix) => alphabet.map((character) => prefix + character))
    texts.push(...level)
  }
  texts.push(...Array.from({ length: 127 }, (_, index) => String.fromCharCode(index + 1)))
  texts.push("\\".repeat(128) + '"', "\\".repeat(128), "a".repeat(4096))
  const inputs = texts.map((text) => ProcessText.make(text))
  const responses = evaluate(inputs)
  for (const [index, text] of inputs.entries()) {
    expect(quoteWindowsArgument(text)).toBe(responses[index]?.output.quoted)
  }
})
