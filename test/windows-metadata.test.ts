import { readFileSync } from "node:fs"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import type { FileApi } from "../src/internal/windows-files/api.ts"
import { decodeStreams, Metadata, MetadataObservation, readMetadata, Stream } from "../src/internal/windows-files/metadata.ts"
import { parseJson } from "../src/internal/json.ts"

const Vector = Schema.Struct({
  name: Schema.NonEmptyString,
  kind: Schema.Literals(["file", "directory"]),
  basicHex: Schema.String,
  streamHex: Schema.String,
  eof: Schema.Boolean,
  attributes: MetadataObservation.fields.attributes,
  decoded: Schema.Array(Stream),
  canonical: Schema.Array(Stream)
})
type Vector = typeof Vector.Type
const vectors = Schema.decodeUnknownSync(Schema.Array(Vector), { onExcessProperty: "error" })(
  parseJson(readFileSync(new URL("./fixtures/windows-metadata.json", import.meta.url), "utf8"))
)
const sameStreams = Schema.toEquivalence(Schema.Array(Stream))
const sameObservation = Schema.toEquivalence(MetadataObservation)
const descriptor = Uint8Array.of(1, 2, 3)
const descriptorDigest = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81"
const unexpected = (): never => { throw new Error("Unexpected native call") }

function native(vector: Vector, options: { basicError?: number; streamError?: number; emptySuccess?: boolean } = {}) {
  const calls: string[] = []
  let error = 0
  const api: FileApi = {
    createFile: unexpected, close: unexpected, type: unexpected, setInfo: unexpected,
    setSecurity: unexpected, finalPath: unexpected, read: unexpected, write: unexpected,
    flush: unexpected, createDirectory: unexpected, seek: unexpected, getVolumeInformation: unexpected,
    error: () => { calls.push("error"); return error },
    security: (handle) => { expect(handle).toBe(1n); calls.push("security"); return descriptor },
    info: (handle, kind, bytes, length) => {
      expect(handle).toBe(1n)
      expect(bytes.length).toBe(length)
      if (kind === 0) {
        calls.push("basic")
        expect(length).toBe(40)
        if (options.basicError !== undefined) { error = options.basicError; return 0 }
        bytes.set(Buffer.from(vector.basicHex, "hex"))
        return 1
      }
      if (kind === 7) {
        calls.push("streams")
        expect(length).toBe(65_536)
        if (options.streamError !== undefined) { error = options.streamError; return 0 }
        if (options.emptySuccess) return 1
        if (vector.eof) { error = 38; return 0 }
        bytes.set(Buffer.from(vector.streamHex, "hex"))
        return 1
      }
      return unexpected()
    }
  }
  return { api, calls }
}

it("decodes the seven recorded stream chains without mutating their bytes", () => {
  const recorded = vectors.filter((vector) => !vector.eof)
  expect(recorded).toHaveLength(7)
  for (const vector of recorded) {
    const input = Buffer.from(vector.streamHex, "hex")
    const before = Buffer.from(input)
    expect(sameStreams(decodeStreams(input), vector.decoded), vector.name).toBe(true)
    expect(input).toEqual(before)
  }
})

it("captures all nine native metadata vectors with canonical streams and the descriptor digest", () => {
  expect(vectors).toHaveLength(9)
  for (const vector of vectors) {
    const { api, calls } = native(vector)
    const actual = readMetadata(api, 1n)
    const expected = Schema.decodeSync(MetadataObservation)({
      attributes: vector.attributes, security: descriptorDigest, streams: vector.canonical
    })
    expect(Schema.is(Metadata)(actual), vector.name).toBe(true)
    expect(sameObservation(actual.observed, expected), vector.name).toBe(true)
    expect(actual.descriptor).toEqual(descriptor)
    expect(calls).toEqual(vector.eof ? ["basic", "streams", "error", "security"] : ["basic", "streams", "security"])
  }
})

it("rejects malformed stream buffers and duplicate names", () => {
  const ordinary = vectors.find((vector) => vector.name.startsWith("ordinary-file/"))
  if (ordinary === undefined) throw new Error("Missing native ordinary-file vector")
  const raw = Buffer.from(ordinary.streamHex, "hex")
  const changed = (edit: (bytes: Buffer) => void) => { const bytes = Buffer.from(raw); edit(bytes); return bytes }
  const first = Buffer.alloc(40)
  first.set(raw)
  first.writeUInt32LE(40, 0)
  const duplicate = Buffer.concat([first, raw])
  const invalid = [
    Buffer.alloc(0), Buffer.alloc(23),
    changed((bytes) => bytes.writeUInt32LE(0, 4)),
    changed((bytes) => bytes.writeUInt32LE(13, 4)),
    changed((bytes) => bytes.writeUInt32LE(1000, 4)),
    changed((bytes) => bytes.writeUInt32LE(8, 0)),
    changed((bytes) => bytes.writeUInt32LE(38, 0)),
    changed((bytes) => bytes.writeUInt32LE(64, 0)),
    changed((bytes) => bytes.writeUInt16LE(0, 24)),
    changed((bytes) => bytes.writeUInt16LE(0xd800, 24)),
    changed((bytes) => bytes.writeBigInt64LE(-1n, 8)),
    changed((bytes) => bytes.writeBigInt64LE(-1n, 16)),
    duplicate
  ]
  expect(invalid).toHaveLength(13)
  for (const bytes of invalid) expect(() => decodeStreams(bytes)).toThrow()
})

it("preserves native query failures and rejects a successful zero-filled result", () => {
  const vector = vectors.find((value) => !value.eof)
  if (vector === undefined) throw new Error("Missing successful native vector")
  const basic = native(vector, { basicError: 5 })
  expect(() => readMetadata(basic.api, 1n)).toThrow("5")
  expect(basic.calls).toEqual(["basic", "error"])
  const streams = native(vector, { streamError: 234 })
  expect(() => readMetadata(streams.api, 1n)).toThrow("234")
  expect(streams.calls).toEqual(["basic", "streams", "error"])
  const empty = native(vector, { emptySuccess: true })
  expect(() => readMetadata(empty.api, 1n)).toThrow()
  expect(empty.calls).toEqual(["basic", "streams"])
})
