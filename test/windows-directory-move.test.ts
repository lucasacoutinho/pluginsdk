import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { encodeFileRename } from "../src/internal/windows-files/api.ts"
import type { FileApi } from "../src/internal/windows-files/api.ts"
import { makeWindowsDirectoryMover, MoveRequest } from "../src/internal/windows-files/directory-move.ts"

it("matches independent x64 FILE_RENAME_INFO byte vectors", () => {
  const vectors = [
    { name: "λ", root: 0x1122334455667788n, replace: false,
      expected: "0000000000000000887766554433221102000000bb030000" },
    { name: "🙂", root: 0n, replace: true,
      expected: "01000000000000000000000000000000040000003dd842de0000000000000000" },
    { name: "file", root: 0n, replace: false,
      expected: "0000000000000000000000000000000008000000660069006c00650000000000" }
  ]
  for (const vector of vectors) {
    expect(Buffer.from(encodeFileRename(vector)).toString("hex")).toBe(vector.expected)
  }
})

it("refuses malformed Unicode and out-of-range native pointers", () => {
  for (const name of ["bad\0name", "\ud800"]) {
    expect(() => encodeFileRename({ name, root: 0n, replace: false })).toThrow()
  }
  for (const root of [-1n, 1n << 64n]) {
    expect(() => encodeFileRename({ name: "valid", root, replace: false })).toThrow()
  }
})

it("constructs the service without calling the native file API", () => {
  const unexpected = (): never => { throw new Error("Service construction performed native I/O") }
  const api: FileApi = {
    createFile: unexpected, close: unexpected, error: unexpected, type: unexpected,
    info: unexpected, setInfo: unexpected, security: unexpected, setSecurity: unexpected,
    finalPath: unexpected, read: unexpected, write: unexpected, flush: unexpected,
    createDirectory: unexpected, seek: unexpected, getVolumeInformation: unexpected
  }
  const service = makeWindowsDirectoryMover(api)
  expect(typeof service.move).toBe("function")
})

it("parses move requests with exact path and physical identity fields", () => {
  const decode = Schema.decodeUnknownSync(MoveRequest, { onExcessProperty: "error" })
  const value = {
    root: "C:\\isolated\\.cursor", from: ".pluginsdk/staged", to: "plugins/local/example",
    expected: { volume: "1".repeat(16), file: "2".repeat(32) }
  }
  expect(decode(value)).toEqual(value)
  for (const invalid of [
    { ...value, overwrite: true },
    { ...value, from: "../outside" },
    { ...value, root: "" },
    { ...value, expected: { ...value.expected, file: "not-an-identity" } },
    { ...value, expected: { ...value.expected, path: "other" } }
  ]) {
    expect(() => decode(invalid)).toThrow()
  }
})
