import { nativeBool, nativeDword, nativeFailure, nativeHandle } from "./observation.ts"

export interface FileApi {
  readonly createFile: (name: Uint8Array, access: number, share: number, security: Uint8Array | null, disposition: number, flags: number, template: null) => unknown
  readonly close: (handle: bigint) => unknown
  readonly error: () => unknown
  readonly type: (handle: bigint) => unknown
  readonly info: (handle: bigint, kind: number, data: Uint8Array, bytes: number) => unknown
  readonly setInfo: (handle: bigint, kind: number, data: Uint8Array, bytes: number) => unknown
  readonly security: (handle: bigint) => Uint8Array
  readonly setSecurity: (handle: bigint, descriptor: Uint8Array) => void
  readonly finalPath: (handle: bigint, path: Uint8Array | null, capacity: number, flags: number) => unknown
  readonly read: (handle: bigint, bytes: Uint8Array, capacity: number, count: Uint8Array, overlapped: null) => unknown
  readonly write: (handle: bigint, bytes: Uint8Array, length: number, count: Uint8Array, overlapped: null) => unknown
  readonly flush: (handle: bigint) => unknown
  readonly createDirectory: (name: Uint8Array, security: null) => unknown
  readonly seek: (handle: bigint, distance: bigint, position: Uint8Array, method: number) => unknown
  readonly getVolumeInformation: (handle: bigint, volume: Uint8Array, volumeCapacity: number, serial: Uint8Array,
    component: Uint8Array, flags: Uint8Array, fileSystem: Uint8Array, fileSystemCapacity: number) => unknown
}

export const encodeFileRename = ({ name, root, replace }: {
  readonly name: string
  readonly root: bigint | null
  readonly replace: boolean
}): Buffer => {
  if (!name.isWellFormed() || name.includes("\0")) throw new Error("FILE_RENAME_INFO name is not well-formed UTF-16")
  if (root !== null && (typeof root !== "bigint" || root < 0n || root > 0xffff_ffff_ffff_ffffn)) {
    throw new Error("FILE_RENAME_INFO root is outside the unsigned 64-bit pointer range")
  }
  const encoded = Buffer.from(name + "\0", "utf16le")
  const nameBytes = encoded.length - 2
  if (nameBytes > 0xffff_ffff) throw new Error("FILE_RENAME_INFO name exceeds its unsigned 32-bit byte length")
  const data = Buffer.alloc(Math.ceil((20 + encoded.length) / 8) * 8)
  data.writeUInt32LE(replace ? 1 : 0, 0)
  data.writeBigUInt64LE(root ?? 0n, 8)
  data.writeUInt32LE(nameBytes, 16)
  data.set(encoded, 20)
  return data
}

export const DIRECTORY_RECORD_OFFSETS = Object.freeze({
  nextEntryOffset: 0,
  fileIndex: 4,
  creationTime: 8,
  lastAccessTime: 16,
  lastWriteTime: 24,
  changeTime: 32,
  endOfFile: 40,
  allocationSize: 48,
  fileAttributes: 56,
  fileNameLength: 60,
  eaSize: 64,
  reparsePointTag: 68,
  fileId: 72,
  fileName: 88
})

const EXPECTED_DIRECTORY_RECORD_LAYOUT = {
  NextEntryOffset: DIRECTORY_RECORD_OFFSETS.nextEntryOffset,
  FileIndex: DIRECTORY_RECORD_OFFSETS.fileIndex,
  CreationTime: DIRECTORY_RECORD_OFFSETS.creationTime,
  LastAccessTime: DIRECTORY_RECORD_OFFSETS.lastAccessTime,
  LastWriteTime: DIRECTORY_RECORD_OFFSETS.lastWriteTime,
  ChangeTime: DIRECTORY_RECORD_OFFSETS.changeTime,
  EndOfFile: DIRECTORY_RECORD_OFFSETS.endOfFile,
  AllocationSize: DIRECTORY_RECORD_OFFSETS.allocationSize,
  FileAttributes: DIRECTORY_RECORD_OFFSETS.fileAttributes,
  FileNameLength: DIRECTORY_RECORD_OFFSETS.fileNameLength,
  EaSize: DIRECTORY_RECORD_OFFSETS.eaSize,
  ReparsePointTag: DIRECTORY_RECORD_OFFSETS.reparsePointTag,
  FileId: DIRECTORY_RECORD_OFFSETS.fileId,
  FileName: DIRECTORY_RECORD_OFFSETS.fileName
}

let cachedFileApi: FileApi | undefined
let pendingFileApi: Promise<FileApi> | undefined

async function initializeFileApi(): Promise<FileApi> {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Windows file API requires Windows x64")
  }

  const { default: koffi } = await import("koffi")
  if (koffi.version !== "3.3.3") {
    throw new Error("Windows file API requires Koffi 3.3.3")
  }

  const fileId128 = koffi.struct({
    Identifier: koffi.array("uint8_t", 16)
  })
  const fileIdExtdDirInfo = koffi.struct({
    NextEntryOffset: "uint32_t",
    FileIndex: "uint32_t",
    CreationTime: "int64_t",
    LastAccessTime: "int64_t",
    LastWriteTime: "int64_t",
    ChangeTime: "int64_t",
    EndOfFile: "int64_t",
    AllocationSize: "int64_t",
    FileAttributes: "uint32_t",
    FileNameLength: "uint32_t",
    EaSize: "uint32_t",
    ReparsePointTag: "uint32_t",
    FileId: fileId128,
    FileName: koffi.array("uint16_t", 1)
  })

  const actualLayout = Object.entries(EXPECTED_DIRECTORY_RECORD_LAYOUT).map(([name, expected]) => ({
    name,
    expected,
    actual: koffi.offsetof(fileIdExtdDirInfo, name)
  }))
  const fileId128Size = koffi.sizeof(fileId128)
  const fileId128Alignment = koffi.alignof(fileId128)
  const fileIdExtdDirInfoSize = koffi.sizeof(fileIdExtdDirInfo)
  const fileIdExtdDirInfoAlignment = koffi.alignof(fileIdExtdDirInfo)
  const layoutValid = fileId128Size === 16 &&
    fileIdExtdDirInfoSize === 96 &&
    fileIdExtdDirInfoAlignment === 8 &&
    actualLayout.every(({ expected, actual }) => actual === expected)
  if (!layoutValid) {
    throw new Error("Koffi FILE_ID_EXTD_DIR_INFO layout did not match the required Windows SDK layout: " + JSON.stringify({
      expectedLayout: EXPECTED_DIRECTORY_RECORD_LAYOUT,
      actualLayout,
      fileIdExtdDirInfoSize,
      fileIdExtdDirInfoAlignment,
      fileId128Size,
      fileId128Alignment
    }))
  }

  const securityAttributes = koffi.struct({ length: "uint32_t", descriptor: "void *", inherit: "int32_t" })
  const renameInfo = koffi.struct({ replace: "uint32_t", root: "void *", length: "uint32_t", name: koffi.array("uint16_t", 1) })
  if (koffi.sizeof(securityAttributes) !== 24 || koffi.offsetof(securityAttributes, "descriptor") !== 8 ||
    koffi.offsetof(securityAttributes, "inherit") !== 16 || koffi.sizeof(renameInfo) !== 24 ||
    koffi.offsetof(renameInfo, "root") !== 8 || koffi.offsetof(renameInfo, "length") !== 16 ||
    koffi.offsetof(renameInfo, "name") !== 20) {
    throw new Error("Koffi security or rename layout did not match Windows x64")
  }

  const kernel = koffi.load("kernel32.dll")
  const securityLibrary = koffi.load("advapi32.dll")
  const createFileCall = kernel.func("__stdcall", "CreateFileW", "void *", [
    "const uint16_t *", "uint32_t", "uint32_t", koffi.pointer(securityAttributes), "uint32_t", "uint32_t", "void *"
  ])
  const closeCall = kernel.func("int32_t __stdcall CloseHandle(void *handle)")
  const errorCall = kernel.func("uint32_t __stdcall GetLastError()")
  const typeCall = kernel.func("uint32_t __stdcall GetFileType(void *file)")
  const infoCall = kernel.func("int32_t __stdcall GetFileInformationByHandleEx(void *file, uint32_t kind, void *data, uint32_t bytes)")
  const setInfoCall = kernel.func("int32_t __stdcall SetFileInformationByHandle(void *file, uint32_t kind, void *data, uint32_t bytes)")
  const securityCall = securityLibrary.func("uint32_t __stdcall GetSecurityInfo(void *file, uint32_t type, uint32_t information, void *owner, void *group, void *dacl, void *sacl, void *descriptor)")
  const setSecurityCall = securityLibrary.func("uint32_t __stdcall SetSecurityInfo(void *file, uint32_t type, uint32_t information, void *owner, void *group, void *dacl, void *sacl)")
  const getDaclCall = securityLibrary.func("int32_t __stdcall GetSecurityDescriptorDacl(void *descriptor, void *present, void *dacl, void *defaulted)")
  const aclInfoCall = securityLibrary.func("int32_t __stdcall GetAclInformation(void *acl, void *information, uint32_t length, uint32_t kind)")
  const controlCall = securityLibrary.func("int32_t __stdcall GetSecurityDescriptorControl(void *descriptor, void *control, void *revision)")
  const securityLengthCall = securityLibrary.func("uint32_t __stdcall GetSecurityDescriptorLength(void *descriptor)")
  const freeCall = kernel.func("void * __stdcall LocalFree(void *memory)")
  const releaseSecurity = (pointer: bigint): void => {
    const result: unknown = freeCall(pointer)
    if (result !== null && result !== 0n && result !== 0) throw new Error("LocalFree did not release the native security descriptor")
  }
  const finalPathCall = kernel.func("uint32_t __stdcall GetFinalPathNameByHandleW(void *file, void *path, uint32_t capacity, uint32_t flags)")
  const readCall = kernel.func("int32_t __stdcall ReadFile(void *file, void *bytes, uint32_t capacity, void *read, void *overlapped)")
  const writeCall = kernel.func("int32_t __stdcall WriteFile(void *file, const void *bytes, uint32_t length, void *written, void *overlapped)")
  const flushCall = kernel.func("int32_t __stdcall FlushFileBuffers(void *file)")
  const createDirectoryCall = kernel.func("int32_t __stdcall CreateDirectoryW(const uint16_t *name, void *security)")
  const seekCall = kernel.func("int32_t __stdcall SetFilePointerEx(void *file, int64_t distance, void *position, uint32_t method)")
  const getVolumeInformationCall = kernel.func("int32_t __stdcall GetVolumeInformationByHandleW(void *file, uint16_t *volumeName, uint32_t volumeNameSize, uint32_t *serial, uint32_t *maxComponentLength, uint32_t *flags, uint16_t *fileSystemName, uint32_t fileSystemNameSize)")

  const api: FileApi = {
    createFile: (name, access, share, security, disposition, flags, template): unknown =>
      createFileCall(name, access, share, security === null ? null : { length: 24, descriptor: security, inherit: 0 }, disposition, flags, template),
    close: (handle): unknown => closeCall(handle),
    error: (): unknown => errorCall(),
    type: (handle): unknown => typeCall(handle),
    info: (handle, kind, data, bytes): unknown => infoCall(handle, kind, data, bytes),
    setInfo: (handle, kind, data, bytes): unknown => setInfoCall(handle, kind, data, bytes),
    security: (handle) => {
      const output = Buffer.alloc(8)
      const code = nativeDword("GetSecurityInfo", securityCall(handle, 1, 4, null, null, null, null, output))
      if (code !== 0) throw new Error(`GetSecurityInfo failed with Win32 error ${code}`)
      const pointer = nativeHandle("GetSecurityInfo descriptor", output.readBigUInt64LE(0))
      try {
        const length = nativeDword("GetSecurityDescriptorLength", securityLengthCall(pointer))
        if (length < 20 || length > 1_048_576) throw new Error("Native security descriptor length is unsupported")
        const descriptor = Buffer.from(new Uint8Array(koffi.view(pointer, length)))
        if ((descriptor.readUInt16LE(2) & 0x8004) !== 0x8004) {
          throw new Error("Native DACL descriptor is not self-relative and present")
        }
        return descriptor
      } finally {
        releaseSecurity(pointer)
      }
    },
    setSecurity: (handle, descriptor) => {
      const bytes = Buffer.from(descriptor)
      const present = Buffer.alloc(4)
      const output = Buffer.alloc(8)
      const defaulted = Buffer.alloc(4)
      if (!nativeBool("GetSecurityDescriptorDacl", getDaclCall(bytes, present, output, defaulted))) {
        throw nativeFailure(api, "GetSecurityDescriptorDacl")
      }
      if (!nativeBool("DACL presence", present.readInt32LE(0))) throw new Error("Source descriptor has no DACL")
      const pointer = output.readBigUInt64LE(0)
      let dacl: Uint8Array | null = null
      if (pointer !== 0n) {
        const acl = nativeHandle("Source DACL", pointer)
        const size = Buffer.alloc(12)
        if (!nativeBool("GetAclInformation", aclInfoCall(acl, size, size.length, 2))) {
          throw nativeFailure(api, "GetAclInformation")
        }
        const length = size.readUInt32LE(4) + size.readUInt32LE(8)
        if (length < 8 || length > 65_536) throw new Error("Native DACL size is unsupported")
        dacl = Buffer.from(new Uint8Array(koffi.view(acl, length)))
      }
      const control = Buffer.alloc(2)
      const revision = Buffer.alloc(4)
      if (!nativeBool("GetSecurityDescriptorControl", controlCall(bytes, control, revision))) {
        throw nativeFailure(api, "GetSecurityDescriptorControl")
      }
      const information = (control.readUInt16LE(0) & 0x1000) !== 0 ? 0x8000_0004 : 0x2000_0004
      const code = nativeDword("SetSecurityInfo", setSecurityCall(handle, 1, information, null, null, dacl, null))
      if (code !== 0) throw new Error(`SetSecurityInfo failed with Win32 error ${code}`)
    },
    finalPath: (handle, path, capacity, flags): unknown => finalPathCall(handle, path, capacity, flags),
    read: (handle, bytes, capacity, count, overlapped): unknown => readCall(handle, bytes, capacity, count, overlapped),
    write: (handle, bytes, length, count, overlapped): unknown => writeCall(handle, bytes, length, count, overlapped),
    flush: (handle): unknown => flushCall(handle),
    createDirectory: (name, security): unknown => createDirectoryCall(name, security),
    seek: (handle, distance, position, method): unknown => seekCall(handle, distance, position, method),
    getVolumeInformation: (handle, volume, volumeCapacity, serial, component, flags, fileSystem, fileSystemCapacity): unknown =>
      getVolumeInformationCall(handle, volume, volumeCapacity, serial, component, flags, fileSystem, fileSystemCapacity)
  }
  return Object.freeze(api)
}

export async function getFileApi(): Promise<FileApi> {
  if (cachedFileApi !== undefined) return cachedFileApi
  if (pendingFileApi !== undefined) return pendingFileApi

  const initialization = initializeFileApi()
  pendingFileApi = initialization
  try {
    const api = await initialization
    cachedFileApi = api
    return api
  } finally {
    if (pendingFileApi === initialization) pendingFileApi = undefined
  }
}
