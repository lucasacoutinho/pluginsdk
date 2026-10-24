import { Schema } from "effect"
import * as Files from "../../../contracts/FileRead.ts"
import * as Trees from "../../../contracts/TreeRead.ts"
import { decodeUtf16, nativeBool, nativeDword, nativeFailure } from "./observation.ts"
import type { FileApi } from "./api.ts"
import { DIRECTORY_RECORD_OFFSETS } from "./api.ts"

const BUFFER_BYTES = 65_536
const HEADER_BYTES = DIRECTORY_RECORD_OFFSETS.fileName
const FILE_ID_EXTD_DIRECTORY_INFO = 19
const FILE_ID_EXTD_DIRECTORY_RESTART_INFO = 20
const ERROR_NO_MORE_FILES = 18

const dword = (buffer: Uint8Array, offset: number): number =>
  new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(offset, true)

const align8 = (value: number): number => Math.ceil(value / 8) * 8

function readRecord(buffer: Uint8Array, offset: number, names: Array<Files.Component>): number {
  if (offset > buffer.length - HEADER_BYTES) throw new Error("Directory record header exceeds the native buffer")
  const nextOffset = dword(buffer, offset + DIRECTORY_RECORD_OFFSETS.nextEntryOffset)
  const nameBytes = dword(buffer, offset + DIRECTORY_RECORD_OFFSETS.fileNameLength)
  const nameOffset = offset + HEADER_BYTES
  if (nameBytes % 2 !== 0 || nameBytes > buffer.length - nameOffset) {
    throw new Error("Directory record name length is odd or exceeds the native buffer")
  }
  const name = decodeUtf16(buffer.subarray(nameOffset, nameOffset + nameBytes), nameBytes)
  if (name !== "." && name !== "..") names.push(Schema.decodeSync(Files.Component)(name))
  if (nextOffset === 0) return 0
  const minimumNextOffset = align8(HEADER_BYTES + nameBytes)
  if (nextOffset % 8 !== 0 || nextOffset < minimumNextOffset ||
    nextOffset > buffer.length - offset - HEADER_BYTES) {
    throw new Error("Directory record next offset is misaligned or outside the native buffer")
  }
  return nextOffset
}

export function enumerate(api: FileApi, handle: bigint): Trees.Enumeration {
  const operation = "GetFileInformationByHandleEx(directory)"
  const names: Array<Files.Component> = []
  let informationClass = FILE_ID_EXTD_DIRECTORY_RESTART_INFO
  for (;;) {
    const buffer = new Uint8Array(BUFFER_BYTES)
    if (!nativeBool(operation, api.info(handle, informationClass, buffer, BUFFER_BYTES))) {
      if (nativeDword(`${operation} GetLastError`, api.error()) === ERROR_NO_MORE_FILES) {
        return Schema.decodeSync(Trees.Enumeration)({ type: "complete", names })
      }
      throw nativeFailure(api, operation)
    }
    let offset = 0
    for (;;) {
      const nextOffset = readRecord(buffer, offset, names)
      if (nextOffset === 0) break
      offset += nextOffset
    }
    informationClass = FILE_ID_EXTD_DIRECTORY_INFO
  }
}
