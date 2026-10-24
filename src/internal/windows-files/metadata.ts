import { Schema } from "effect"
import { FileDigest } from "../../../contracts/CompilerModel.ts"
import * as Files from "../../../contracts/FileRead.ts"
import { WindowsFileAttributes } from "../../../contracts/ProjectConfig.ts"
import { fileDigest } from "../identity.ts"
import { compareUtf8 } from "../paths.ts"
import type { FileApi } from "./api.ts"
import { decodeUtf16, nativeBool, nativeDword, nativeFailure } from "./observation.ts"

const StreamName = Schema.NonEmptyString.check(Schema.makeFilter(
  (name) => name.isWellFormed() && !name.includes("\0"),
  { expected: "a nonempty, well-formed Unicode stream name without NUL" }
))

export const Stream = Schema.Struct({
  name: StreamName,
  size: Files.Quantity,
  allocation: Files.Quantity
})
export type Stream = typeof Stream.Type

export const MetadataObservation = Schema.Struct({
  attributes: WindowsFileAttributes,
  security: FileDigest,
  streams: Schema.Array(Stream)
})
export type MetadataObservation = typeof MetadataObservation.Type

export const Metadata = Schema.Struct({
  descriptor: Schema.Uint8Array,
  observed: MetadataObservation
})
export type Metadata = typeof Metadata.Type

const FILE_BASIC_INFO = 0
const FILE_STREAM_INFO = 7
const FILE_BASIC_INFO_BYTES = 40
const FILE_STREAM_INFO_BYTES = 65_536
const FILE_STREAM_INFO_HEADER_BYTES = 24
const ERROR_HANDLE_EOF = 38

export function decodeStreams(bytes: Uint8Array): readonly Stream[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const streams: Stream[] = []
  const names = new Set<string>()
  let offset = 0

  while (true) {
    if (offset % 8 !== 0) throw new Error("FILE_STREAM_INFO record is not eight-byte aligned")
    if (offset > bytes.length - FILE_STREAM_INFO_HEADER_BYTES) {
      throw new Error("FILE_STREAM_INFO record header is outside its buffer")
    }

    const nextEntryOffset = view.getUint32(offset, true)
    const nameLength = view.getUint32(offset + 4, true)
    const remainingBytes = bytes.length - offset - FILE_STREAM_INFO_HEADER_BYTES
    if (nameLength === 0 || nameLength % 2 !== 0 || nameLength > remainingBytes) {
      throw new Error("FILE_STREAM_INFO name length is empty, odd, or outside its buffer")
    }

    const recordBytes = FILE_STREAM_INFO_HEADER_BYTES + nameLength
    if (nextEntryOffset !== 0 &&
      (nextEntryOffset % 8 !== 0 || nextEntryOffset < recordBytes || nextEntryOffset > bytes.length - offset)) {
      throw new Error("FILE_STREAM_INFO next entry offset is unaligned, too short, or outside its buffer")
    }

    const name = decodeUtf16(bytes.subarray(offset + FILE_STREAM_INFO_HEADER_BYTES, offset + recordBytes), nameLength)
    if (names.has(name)) throw new Error("FILE_STREAM_INFO contains duplicate stream names")
    names.add(name)

    const size = view.getBigInt64(offset + 8, true)
    const allocation = view.getBigInt64(offset + 16, true)
    if (size < 0n || allocation < 0n) throw new Error("FILE_STREAM_INFO contains a negative stream size")

    streams.push(Schema.decodeSync(Stream)({
      name,
      size: size.toString(),
      allocation: allocation.toString()
    }))

    if (nextEntryOffset === 0) break
    offset += nextEntryOffset
  }

  return streams
}

export function readMetadata(api: FileApi, handle: bigint): Metadata {
  const basic = Buffer.alloc(FILE_BASIC_INFO_BYTES)
  if (!nativeBool("GetFileInformationByHandleEx(FileBasicInfo)",
    api.info(handle, FILE_BASIC_INFO, basic, FILE_BASIC_INFO_BYTES))) {
    throw nativeFailure(api, "GetFileInformationByHandleEx(FileBasicInfo)")
  }

  const streamBytes = Buffer.alloc(FILE_STREAM_INFO_BYTES)
  const streamResult = api.info(handle, FILE_STREAM_INFO, streamBytes, FILE_STREAM_INFO_BYTES)
  let streams: ReadonlyArray<Stream>
  if (nativeBool("GetFileInformationByHandleEx(FileStreamInfo)", streamResult)) {
    streams = decodeStreams(streamBytes).toSorted((left, right) => compareUtf8(left.name, right.name))
  } else {
    const code = nativeDword("GetFileInformationByHandleEx(FileStreamInfo) GetLastError", api.error())
    if (code !== ERROR_HANDLE_EOF) {
      throw new Error(`GetFileInformationByHandleEx(FileStreamInfo) failed with Win32 error ${code}`)
    }
    streams = []
  }

  const descriptor = api.security(handle)
  const observed = Schema.decodeSync(MetadataObservation)({
    attributes: basic.readUInt32LE(32),
    security: fileDigest(descriptor),
    streams
  })
  return { descriptor, observed }
}
