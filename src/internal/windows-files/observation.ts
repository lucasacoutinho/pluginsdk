import { Match, Schema } from "effect"
import * as Files from "../../../contracts/FileRead.ts"
import * as Trees from "../../../contracts/TreeRead.ts"
import * as Windows from "../../../contracts/WindowsPath.ts"
import type { FileApi } from "./api.ts"

export const FINAL_NAME_BUFFER_UNITS = 32_768
export const COUNTED_NAME_BUFFER_UNITS = 32_768

const FILE_ID_INFO = 18
const FILE_STANDARD_INFO = 1
const FILE_BASIC_INFO = 0
const FILE_ATTRIBUTE_TAG_INFO = 9
const FILE_CASE_SENSITIVE_INFO = 23
const FILE_NAME_INFO = 2
const FILE_NORMALIZED_NAME_INFO = 24
const FILE_ATTRIBUTE_REPARSE_POINT = 0x0000_0400
const FILE_NAME_INFO_HEADER_BYTES = 4

export const NativeSnapshot = Schema.Struct({
  observation: Files.Observation,
  entry: Trees.EntryObservation,
  directory: Trees.DirectoryObservation,
  names: Schema.Struct({
    normalizedGUID: Files.FinalPath,
    openedGUID: Files.FinalPath,
    volumeOpened: Files.FinalPath,
    volumeNormalized: Files.FinalPath
  })
})
export type NativeSnapshot = typeof NativeSnapshot.Type

export function nativeDword(operation: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${operation} returned an invalid DWORD`)
  }
  return value
}

export function nativeBool(operation: string, value: unknown): boolean {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new Error(`${operation} returned an invalid BOOL`)
  }
  return value !== 0
}

export function nativeHandle(operation: string, value: unknown): bigint {
  if (typeof value !== "bigint" || value <= 0n || value >= 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${operation} returned an invalid handle`)
  }
  return value
}

export function nativeFailure(api: FileApi, operation: string): Error {
  const code = nativeDword(`${operation} GetLastError`, api.error())
  return new Error(`${operation} failed with Win32 error ${code}`)
}

function byteAt(buffer: Uint8Array, offset: number, operation: string): number {
  if (!Number.isInteger(offset) || offset < 0 || offset >= buffer.length) {
    throw new Error(`${operation} read exceeded its native buffer`)
  }
  const value = buffer[offset]
  if (value === undefined) throw new Error(`${operation} read exceeded its native buffer`)
  return value
}

function uint16At(buffer: Uint8Array, offset: number, operation: string): number {
  if (!Number.isInteger(offset) || offset < 0 || offset > buffer.length - 2) {
    throw new Error(`${operation} read exceeded its native buffer`)
  }
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint16(offset, true)
}

function uint32At(buffer: Uint8Array, offset: number, operation: string): number {
  if (!Number.isInteger(offset) || offset < 0 || offset > buffer.length - 4) {
    throw new Error(`${operation} read exceeded its native buffer`)
  }
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(offset, true)
}

function int64At(buffer: Uint8Array, offset: number, operation: string): bigint {
  if (!Number.isInteger(offset) || offset < 0 || offset > buffer.length - 8) {
    throw new Error(`${operation} read exceeded its native buffer`)
  }
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getBigInt64(offset, true)
}

function uint64At(buffer: Uint8Array, offset: number, operation: string): bigint {
  if (!Number.isInteger(offset) || offset < 0 || offset > buffer.length - 8) {
    throw new Error(`${operation} read exceeded its native buffer`)
  }
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getBigUint64(offset, true)
}

export function decodeUtf16(buffer: Uint8Array, bytes: number): string {
  if (!Number.isInteger(bytes) || bytes < 0 || bytes % 2 !== 0 || bytes > buffer.length) {
    throw new Error("UTF-16 byte length is odd or outside its native buffer")
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  let value = ""
  for (let offset = 0; offset < bytes; offset += 2) {
    const first = view.getUint16(offset, true)
    if (first === 0) throw new Error("UTF-16 contains NUL")
    if (first >= 0xd800 && first <= 0xdbff) {
      if (offset + 2 >= bytes) throw new Error("UTF-16 contains an unpaired surrogate")
      const second = view.getUint16(offset + 2, true)
      if (second < 0xdc00 || second > 0xdfff) throw new Error("UTF-16 contains an unpaired surrogate")
      const codePoint = 0x1_0000 + ((first - 0xd800) << 10) + (second - 0xdc00)
      value += String.fromCodePoint(codePoint)
      offset += 2
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      throw new Error("UTF-16 contains an unpaired surrogate")
    } else {
      value += String.fromCodePoint(first)
    }
  }
  return value
}

function decodeTerminatedUtf16(buffer: Uint8Array, capacityUnits: number, operation: string): string {
  if (!Number.isInteger(capacityUnits) || capacityUnits < 1 || capacityUnits * 2 > buffer.length) {
    throw new Error(`${operation} has an invalid UTF-16 capacity`)
  }
  for (let offset = 0; offset < capacityUnits * 2; offset += 2) {
    if (uint16At(buffer, offset, operation) === 0) return decodeUtf16(buffer, offset)
  }
  throw new Error(`${operation} did not terminate inside its native buffer`)
}

function queryInfo(api: FileApi, handle: bigint, informationClass: number, bytes: number, operation: string): Uint8Array {
  const buffer = new Uint8Array(bytes)
  if (!nativeBool(operation, api.info(handle, informationClass, buffer, bytes))) throw nativeFailure(api, operation)
  return buffer
}

export function finalName(api: FileApi, handle: bigint, flags: number): Files.FinalPath {
  const validHandle = nativeHandle("GetFinalPathNameByHandleW", handle)
  const nativeFlags = nativeDword("GetFinalPathNameByHandleW flags", flags)
  const operation = "GetFinalPathNameByHandleW"
  const required = nativeDword(`${operation} size`, api.finalPath(validHandle, null, 0, nativeFlags))
  if (required === 0) throw nativeFailure(api, operation)
  if (required > FINAL_NAME_BUFFER_UNITS) throw new Error(`${operation} exceeded the bounded UTF-16 path capacity`)
  const buffer = new Uint8Array(required * 2).fill(0x5a)
  const length = nativeDword(operation, api.finalPath(validHandle, buffer, required, nativeFlags))
  if (length === 0) throw nativeFailure(api, operation)
  if (length >= required) throw new Error(`${operation} returned a length outside its allocated buffer`)
  if (uint16At(buffer, length * 2, operation) !== 0) throw new Error(`${operation} did not NUL-terminate its returned path`)
  const path = decodeUtf16(buffer, length * 2)
  return Schema.decodeSync(Files.FinalPath)(path)
}

function countedName(api: FileApi, handle: bigint, informationClass: number, operation: string): Files.FinalPath {
  const capacity = FILE_NAME_INFO_HEADER_BYTES + COUNTED_NAME_BUFFER_UNITS * 2
  const buffer = queryInfo(api, handle, informationClass, capacity, operation)
  const bytes = uint32At(buffer, 0, operation)
  if (bytes % 2 !== 0 || bytes > buffer.length - FILE_NAME_INFO_HEADER_BYTES) {
    throw new Error(`${operation} returned an odd or out-of-bounds UTF-16 byte length`)
  }
  const name = decodeUtf16(buffer.subarray(FILE_NAME_INFO_HEADER_BYTES, FILE_NAME_INFO_HEADER_BYTES + bytes), bytes)
  return Schema.decodeSync(Files.FinalPath)(name)
}

export function snapshot(api: FileApi, handle: bigint): NativeSnapshot {
  const validHandle = nativeHandle("GetFileInformationByHandleEx", handle)
  const id = queryInfo(api, validHandle, FILE_ID_INFO, 24, "FileIdInfo")
  const standard = queryInfo(api, validHandle, FILE_STANDARD_INFO, 24, "FileStandardInfo")
  const basic = queryInfo(api, validHandle, FILE_BASIC_INFO, 40, "FileBasicInfo")
  const tag = queryInfo(api, validHandle, FILE_ATTRIBUTE_TAG_INFO, 8, "FileAttributeTagInfo")

  const deletePendingByte = byteAt(standard, 20, "FileStandardInfo")
  const directoryByte = byteAt(standard, 21, "FileStandardInfo")
  if ((deletePendingByte !== 0 && deletePendingByte !== 1) || (directoryByte !== 0 && directoryByte !== 1)) {
    throw new Error("FileStandardInfo returned a malformed BOOLEAN")
  }
  if (deletePendingByte === 1) throw new Error("FileStandardInfo reports a delete-pending handle")
  const isDirectory = directoryByte === 1
  const tagAttributes = uint32At(tag, 0, "FileAttributeTagInfo")
  const reparseTag = uint32At(tag, 4, "FileAttributeTagInfo")
  const isReparse = (tagAttributes & FILE_ATTRIBUTE_REPARSE_POINT) !== 0
  const caseFlags = isDirectory && !isReparse
    ? uint32At(queryInfo(api, validHandle, FILE_CASE_SENSITIVE_INFO, 4, "FileCaseSensitiveInfo"), 0, "FileCaseSensitiveInfo")
    : null
  const normalizedGUID = finalName(api, validHandle, 1)
  const openedGUID = finalName(api, validHandle, 9)
  const volumeOpened = countedName(api, validHandle, FILE_NAME_INFO, "FileNameInfo")
  const volumeNormalized = countedName(api, validHandle, FILE_NORMALIZED_NAME_INFO, "FileNormalizedNameInfo")

  const volumeSerial = uint64At(id, 0, "FileIdInfo")
  const fileBytes = id.subarray(8, 24)
  const fileId = Array.from(fileBytes, (part) => part.toString(16).padStart(2, "0")).join("")
  const identity = Schema.decodeSync(Files.Identity)({
    volume: volumeSerial.toString(16).padStart(16, "0"),
    file: fileId
  })
  const size = Schema.decodeSync(Files.Quantity)(int64At(standard, 8, "FileStandardInfo").toString())
  const modified = Schema.decodeSync(Files.Quantity)(int64At(basic, 16, "FileBasicInfo").toString())
  const changed = Schema.decodeSync(Files.Quantity)(int64At(basic, 24, "FileBasicInfo").toString())
  const caseSensitive = caseFlags !== null && (caseFlags & 0x1) !== 0
  const entry = Schema.decodeUnknownSync(Trees.EntryObservation)(isReparse
    ? { type: "reparse", info: { identity, path: normalizedGUID, tag: reparseTag } }
    : isDirectory
      ? { type: "directory", anchor: { identity, path: normalizedGUID, caseSensitive } }
      : { type: "file", info: { identity, path: normalizedGUID, size, modified, changed } })
  type Projections = Pick<NativeSnapshot, "observation" | "directory">
  const projections = Match.value(entry).pipe(Match.discriminatorsExhaustive("type")({
    unavailable: (): Projections => ({
      observation: { type: "unavailable" },
      directory: { type: "unavailable" }
    }),
    directory: ({ anchor }): Projections => ({
      observation: { type: "directory", anchor },
      directory: { type: "directory", info: { anchor, modified, changed } }
    }),
    file: ({ info }): Projections => ({
      observation: { type: "file", info },
      directory: { type: "other" }
    }),
    reparse: (): Projections => ({
      observation: { type: "other" },
      directory: { type: "other" }
    }),
    other: (): Projections => ({
      observation: { type: "other" },
      directory: { type: "other" }
    })
  }))
  return {
    ...projections,
    entry,
    names: { normalizedGUID, openedGUID, volumeOpened, volumeNormalized }
  }
}

export function volume(api: FileApi, handle: bigint): { readonly maxComponentUnits: Windows.UnitCapacity; readonly fileSystem: string } {
  const validHandle = nativeHandle("GetVolumeInformationByHandleW", handle)
  const volumeName = new Uint8Array(260 * 2).fill(0x5a)
  const serial = new Uint8Array(4)
  const component = new Uint8Array(4)
  const flags = new Uint8Array(4)
  const fileSystemName = new Uint8Array(260 * 2).fill(0x5a)
  const operation = "GetVolumeInformationByHandleW"
  if (!nativeBool(operation, api.getVolumeInformation(validHandle, volumeName, 260, serial, component, flags, fileSystemName, 260))) {
    throw nativeFailure(api, operation)
  }
  decodeTerminatedUtf16(volumeName, 260, "GetVolumeInformationByHandleW volume name")
  const fileSystem = decodeTerminatedUtf16(fileSystemName, 260, "GetVolumeInformationByHandleW file system name")
  const maxComponentUnits = Schema.decodeSync(Windows.UnitCapacity)(uint32At(component, 0, operation))
  return { maxComponentUnits, fileSystem }
}
