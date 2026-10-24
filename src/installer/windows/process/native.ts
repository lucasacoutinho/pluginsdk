import { Match, Schema } from "effect"
import { win32 } from "node:path"
import { JobName as JobNameSchema, ProcessId, type JobName, type ProcessId as ProcessIdType } from "../../../../contracts/Execution.ts"
import { EnvironmentName, ProcessText } from "../../../../contracts/Plugin.ts"
import { Observation as ObservationSchema, Writer, type Observation, type Writer as WriterType } from "../../../../contracts/Writers.ts"
import { quoteWindowsArgument } from "../protocol.ts"
import { prepareWindowsEnvironment } from "./environment.ts"
import { StandardHandles } from "../channels/pipes.ts"

const WindowsPath = Schema.NonEmptyString.check(Schema.makeFilter(
  (value) => value.isWellFormed() && !value.includes("\0") && win32.isAbsolute(value),
  { expected: "an absolute Windows path without NUL" }
)).pipe(Schema.brand("pluginsdk/WindowsNativePath"))
export const NativeCommand = Schema.Struct({
  application: WindowsPath,
  args: Schema.Array(ProcessText),
  directory: WindowsPath,
  environment: Schema.Record(EnvironmentName, ProcessText)
})
export type NativeCommand = typeof NativeCommand.Type
type NativeLaunch = Omit<NativeCommand, "environment"> & {
  readonly environment: Buffer
  readonly standard: StandardHandles
}

const Dword = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff_ffff }))
const ThreadId = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 0xffff_ffff })).pipe(Schema.brand("pluginsdk/WindowsThreadId"))
const eventFields = { pid: ProcessId, tid: ThreadId }
export const NativeEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("create_process"), ...eventFields, writer: Writer }),
  Schema.Struct({ type: Schema.Literal("create_thread"), ...eventFields }),
  Schema.Struct({ type: Schema.Literal("exit_process"), ...eventFields, code: Dword }),
  Schema.Struct({ type: Schema.Literal("exit_thread"), ...eventFields }),
  Schema.Struct({ type: Schema.Literal("load_dll"), ...eventFields }),
  Schema.Struct({ type: Schema.Literal("unload_dll"), ...eventFields }),
  Schema.Struct({ type: Schema.Literal("output"), ...eventFields }),
  Schema.Struct({ type: Schema.Literal("rip"), ...eventFields }),
  Schema.Struct({ type: Schema.Literal("exception"), ...eventFields, code: Dword, firstChance: Schema.Boolean })
]).pipe(Schema.toTaggedUnion("type"))
export type NativeEvent = typeof NativeEvent.Type
export const Disposition = Schema.Literals(["handled", "unhandled"])
export type Disposition = typeof Disposition.Type

export interface NativeSession {
  readonly root: ProcessId
  readonly poll: () => NativeEvent | null
  readonly continueEvent: (event: NativeEvent, disposition: Disposition) => void
  readonly observations: () => ReadonlyArray<Observation>
  readonly terminate: () => void
  readonly finished: () => boolean
  readonly close: () => void
}

const NativeBool = Schema.Int.check(Schema.isBetween({ minimum: -0x8000_0000, maximum: 0x7fff_ffff }))
const NativeHandle = Schema.NullOr(Schema.BigInt)
const NativeEventCode = Schema.Literals([1, 2, 3, 4, 5, 6, 7, 8, 9])
const NativeMemberResult = Schema.Literals([0, 1])
const AttributeListSize = Schema.BigInt.check(Schema.makeFilter(
  (value) => value > 0n && value < 65_536n,
  { expected: "a positive Windows attribute list size below 65536 bytes" }
))
const INVALID_HANDLE = 0xffff_ffff_ffff_ffffn

const decodeNative = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, operation: string, value: unknown): S["Type"] => {
  try {
    return Schema.decodeSync(schema)(value)
  } catch (cause) {
    throw new Error(`${operation} returned invalid native data`, { cause })
  }
}

const nativeFailure = (operation: string, code: number): Error => new Error(`${operation} failed with Win32 error ${code}`)

const throwCollected = (operation: string, errors: ReadonlyArray<unknown>): void => {
  if (errors.length > 0) throw new AggregateError(errors, operation)
}

const attempt = (errors: Array<unknown>, action: () => void): void => {
  try {
    action()
  } catch (cause) {
    errors.push(cause)
  }
}

const requireWindows = () => {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Windows native execution requires Windows x64")
  }
}

async function openSession(launch: NativeLaunch, job: JobName): Promise<NativeSession> {
  const checkedJob = decodeNative(JobNameSchema, "Windows native job name", job)

  const koffiModule = await import("koffi").catch((cause: unknown) => {
    throw new Error("Could not load Koffi for Windows native execution", { cause })
  })
  const koffi = koffiModule.default
  const kernel32 = koffi.load("kernel32.dll")

  const startupInfo = koffi.struct({
    cb: "uint32_t", reserved: "void *", desktop: "void *", title: "void *",
    x: "uint32_t", y: "uint32_t", xSize: "uint32_t", ySize: "uint32_t",
    xCountChars: "uint32_t", yCountChars: "uint32_t", fillAttribute: "uint32_t", flags: "uint32_t",
    showWindow: "uint16_t", reserved2Size: "uint16_t", reserved2: "void *",
    stdInput: "void *", stdOutput: "void *", stdError: "void *"
  })
  const startupInfoEx = koffi.struct({ startupInfo, attributeList: "void *" })
  const processInformation = koffi.struct({ process: "void *", thread: "void *", pid: "uint32_t", tid: "uint32_t" })
  const debugEventType = koffi.struct({
    code: "uint32_t", pid: "uint32_t", tid: "uint32_t", padding: "uint32_t",
    payload: koffi.array("uintptr_t", 20)
  })
  const nativeSize = (operation: string, value: unknown): number => decodeNative(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), operation, value)
  const startupInfoSize = nativeSize("sizeof(STARTUPINFOEXW)", koffi.sizeof(startupInfoEx))
  const processInformationSize = nativeSize("sizeof(PROCESS_INFORMATION)", koffi.sizeof(processInformation))
  const debugEventSize = nativeSize("sizeof(DEBUG_EVENT)", koffi.sizeof(debugEventType))
  const payloadOffset = nativeSize("offsetof(DEBUG_EVENT.payload)", koffi.offsetof(debugEventType, "payload"))
  const startupInfoOffset = nativeSize("offsetof(STARTUPINFOEXW.startupInfo)", koffi.offsetof(startupInfoEx, "startupInfo"))
  const startupAttributeOffset = nativeSize("offsetof(STARTUPINFOEXW.attributeList)", koffi.offsetof(startupInfoEx, "attributeList"))
  const startupFlagsOffset = startupInfoOffset + nativeSize("offsetof(STARTUPINFO.flags)", koffi.offsetof(startupInfo, "flags"))
  const startupStdInputOffset = startupInfoOffset + nativeSize("offsetof(STARTUPINFO.stdInput)", koffi.offsetof(startupInfo, "stdInput"))
  const startupStdOutputOffset = startupInfoOffset + nativeSize("offsetof(STARTUPINFO.stdOutput)", koffi.offsetof(startupInfo, "stdOutput"))
  const startupStdErrorOffset = startupInfoOffset + nativeSize("offsetof(STARTUPINFO.stdError)", koffi.offsetof(startupInfo, "stdError"))
  const processHandleOffset = nativeSize("offsetof(PROCESS_INFORMATION.process)", koffi.offsetof(processInformation, "process"))
  const threadHandleOffset = nativeSize("offsetof(PROCESS_INFORMATION.thread)", koffi.offsetof(processInformation, "thread"))
  const processIdOffset = nativeSize("offsetof(PROCESS_INFORMATION.pid)", koffi.offsetof(processInformation, "pid"))
  const threadIdOffset = nativeSize("offsetof(PROCESS_INFORMATION.tid)", koffi.offsetof(processInformation, "tid"))
  if (startupInfoSize !== 112 || processInformationSize !== 24 || debugEventSize !== 176 || payloadOffset !== 16) {
    throw new Error("Koffi reported an unexpected Windows x64 native structure layout")
  }

  const api = {
    initializeAttributes: kernel32.func("int32_t __stdcall InitializeProcThreadAttributeList(void *list, uint32_t count, uint32_t flags, void *size)"),
    updateAttribute: kernel32.func("int32_t __stdcall UpdateProcThreadAttribute(void *list, uint32_t flags, uintptr_t key, void *value, uintptr_t size, void *previous, void *returned)"),
    deleteAttributes: kernel32.func("void __stdcall DeleteProcThreadAttributeList(void *list)"),
    createProcess: kernel32.func("int32_t __stdcall CreateProcessW(const char16_t *application, void *command, void *processSecurity, void *threadSecurity, int32_t inherit, uint32_t flags, void *environment, const char16_t *directory, void *startup, void *information)"),
    openJob: kernel32.func("void * __stdcall OpenJobObjectW(uint32_t access, int32_t inherit, const char16_t *name)"),
    waitForDebugEvent: kernel32.func("int32_t __stdcall WaitForDebugEvent(void *event, uint32_t timeout)"),
    continueDebugEvent: kernel32.func("int32_t __stdcall ContinueDebugEvent(uint32_t pid, uint32_t tid, uint32_t status)"),
    currentThreadId: kernel32.func("uint32_t __stdcall GetCurrentThreadId()"),
    currentProcess: kernel32.func("void * __stdcall GetCurrentProcess()"),
    duplicateHandle: kernel32.func("int32_t __stdcall DuplicateHandle(void *sourceProcess, void *source, void *targetProcess, void *target, uint32_t access, int32_t inherit, uint32_t options)"),
    processIdForHandle: kernel32.func("uint32_t __stdcall GetProcessId(void *process)"),
    processInJob: kernel32.func("int32_t __stdcall IsProcessInJob(void *process, void *job, void *member)"),
    processTimes: kernel32.func("int32_t __stdcall GetProcessTimes(void *process, void *created, void *exited, void *kernel, void *user)"),
    waitForSingleObject: kernel32.func("uint32_t __stdcall WaitForSingleObject(void *handle, uint32_t timeout)"),
    terminateJob: kernel32.func("int32_t __stdcall TerminateJobObject(void *job, uint32_t code)"),
    terminateProcess: kernel32.func("int32_t __stdcall TerminateProcess(void *process, uint32_t code)"),
    closeHandle: kernel32.func("int32_t __stdcall CloseHandle(void *handle)"),
    lastError: kernel32.func("uint32_t __stdcall GetLastError()")
  }

  const lastError = (operation: string): number => decodeNative(Dword, `GetLastError after ${operation}`, api.lastError())
  const boolResult = (operation: string, invoke: () => unknown): number => decodeNative(NativeBool, operation, invoke())
  const requireSuccess = (operation: string, invoke: () => unknown): void => {
    if (boolResult(operation, invoke) === 0) throw nativeFailure(operation, lastError(operation))
  }
  const pointerResult = (operation: string, invoke: () => unknown): bigint => {
    const value = decodeNative(NativeHandle, operation, invoke())
    if (value === null || value === 0n || value === -1n || value === INVALID_HANDLE) {
      throw nativeFailure(operation, lastError(operation))
    }
    return value
  }
  const uintResult = (operation: string, invoke: () => unknown): number => {
    const value = decodeNative(Dword, operation, invoke())
    if (value === 0) throw nativeFailure(operation, lastError(operation))
    return value
  }
  const closeHandle = (handle: bigint, operation: string): void => requireSuccess(operation, () => api.closeHandle(handle))
  const waitStatus = (handle: bigint, operation: string): 0 | 258 => {
    const result = decodeNative(Dword, operation, api.waitForSingleObject(handle, 0))
    if (result === 0 || result === 258) return result
    if (result === 0xffff_ffff) throw nativeFailure(operation, lastError(operation))
    throw new Error(`${operation} returned unexpected wait status ${result}`)
  }
  const currentThread = (): typeof ThreadId.Type => decodeNative(ThreadId, "GetCurrentThreadId", api.currentThreadId())
  const currentProcess = decodeNative(Schema.BigInt, "GetCurrentProcess", api.currentProcess())
  const ownerThreadId = currentThread()

  let jobHandle: bigint | null = null
  let attributeList: bigint | null = null
  let attributeListInitialized = false
  let startupBuffer: Buffer | null = null
  const attributeAllocations: Array<bigint> = []
  let processInformationBuffer: Buffer | null = null
  let commandLineBuffer: Buffer | null = null

  const allocateAttribute = (size: number) => {
    const pointer = decodeNative(Schema.BigInt.check(Schema.isGreaterThanBigInt(0n)), "koffi.alloc(startup attribute)", koffi.alloc("uint8_t", size))
    attributeAllocations.push(pointer)
    const bytes = Buffer.from(koffi.view(pointer, size))
    bytes.fill(0)
    return { pointer, bytes }
  }

  const releaseAttributes = (): void => {
    if (attributeListInitialized && attributeList !== null) {
      decodeNative(Schema.Void, "DeleteProcThreadAttributeList", api.deleteAttributes(attributeList))
      attributeListInitialized = false
    }
    for (const pointer of attributeAllocations) decodeNative(Schema.Void, "koffi.free(startup attribute)", koffi.free(pointer))
    attributeAllocations.length = 0
    attributeList = null
  }

  const cleanupAcquired = (): Array<unknown> => {
    const errors: Array<unknown> = []
    attempt(errors, releaseAttributes)
    const acquiredJob = jobHandle
    if (acquiredJob !== null) attempt(errors, () => closeHandle(acquiredJob, "CloseHandle(job lease)"))
    return errors
  }

  try {
    const openedJob = pointerResult("OpenJobObjectW", () => api.openJob(0x000f, 0, checkedJob))
    jobHandle = openedJob

    const standard = launch.standard

    const requestedSize = Buffer.alloc(8)
    const initializedProbe = boolResult("InitializeProcThreadAttributeList(size probe)", () => api.initializeAttributes(null, 2, 0, requestedSize))
    if (initializedProbe !== 0 || lastError("InitializeProcThreadAttributeList(size probe)") !== 122) {
      throw new Error("InitializeProcThreadAttributeList did not report the expected size probe")
    }
    const requiredBytes = decodeNative(AttributeListSize, "InitializeProcThreadAttributeList size", requestedSize.readBigUInt64LE(0))
    const initializedAttributes = allocateAttribute(Number(requiredBytes))
    attributeList = initializedAttributes.pointer
    requireSuccess("InitializeProcThreadAttributeList", () => api.initializeAttributes(initializedAttributes.pointer, 2, 0, requestedSize))
    attributeListInitialized = true

    const jobValue = allocateAttribute(8)
    jobValue.bytes.writeBigUInt64LE(openedJob)
    requireSuccess("UpdateProcThreadAttribute(job list)", () => api.updateAttribute(initializedAttributes.pointer, 0, 0x2000d, jobValue.pointer, jobValue.bytes.length, null, null))

    const inheritedHandles = allocateAttribute(24)
    for (const [index, handle] of [standard.input, standard.output, standard.error].entries()) {
      inheritedHandles.bytes.writeBigUInt64LE(handle, index * 8)
    }
    requireSuccess("UpdateProcThreadAttribute(handle list)", () => api.updateAttribute(initializedAttributes.pointer, 0, 0x20002, inheritedHandles.pointer, inheritedHandles.bytes.length, null, null))

    const createdStartupBuffer = Buffer.alloc(startupInfoSize)
    startupBuffer = createdStartupBuffer
    createdStartupBuffer.writeUInt32LE(startupInfoSize, startupInfoOffset)
    createdStartupBuffer.writeBigUInt64LE(initializedAttributes.pointer, startupAttributeOffset)
    createdStartupBuffer.writeUInt32LE(0x100, startupFlagsOffset)
    createdStartupBuffer.writeBigUInt64LE(standard.input, startupStdInputOffset)
    createdStartupBuffer.writeBigUInt64LE(standard.output, startupStdOutputOffset)
    createdStartupBuffer.writeBigUInt64LE(standard.error, startupStdErrorOffset)

    const commandWords = [launch.application, ...launch.args]
    commandLineBuffer = Buffer.from(`${commandWords.map(quoteWindowsArgument).join(" ")}\0`, "utf16le")
    const createdProcessInformation = Buffer.alloc(processInformationSize)
    processInformationBuffer = createdProcessInformation
  } catch (cause) {
    const cleanupErrors = cleanupAcquired()
    if (cleanupErrors.length > 0) throw new AggregateError([cause, ...cleanupErrors], "Windows native session acquisition and cleanup failed")
    throw cause
  }

  const prepareSession = (): {
    readonly session: NativeSession
    readonly startup: Buffer
    readonly commandLine: Buffer
    readonly processInformation: Buffer
  } => {
    const retainedJob = jobHandle
    if (retainedJob === null) throw new Error("The Windows job lease was not retained")
    const startup = startupBuffer
    if (startup === null) throw new Error("STARTUPINFOEXW was not prepared")
    const commandLine = commandLineBuffer
    if (commandLine === null) throw new Error("CreateProcessW command line was not prepared")
    const processInformation = processInformationBuffer
    if (processInformation === null) throw new Error("PROCESS_INFORMATION was not prepared")

    const processInfoBuffer = (): Buffer => {
      const value = processInformationBuffer
      if (value === null) throw new Error("PROCESS_INFORMATION is unavailable")
      return value
    }
    const creatorProcessHandle = (): bigint => decodeNative(Schema.BigInt, "PROCESS_INFORMATION.hProcess", processInfoBuffer().readBigUInt64LE(processHandleOffset))
    const creatorThreadHandle = (): bigint => decodeNative(Schema.BigInt, "PROCESS_INFORMATION.hThread", processInfoBuffer().readBigUInt64LE(threadHandleOffset))
    const rawRootPid = (): number => decodeNative(Dword, "PROCESS_INFORMATION.dwProcessId", processInfoBuffer().readUInt32LE(processIdOffset))
    const rootProcessId = (): ProcessIdType => decodeNative(ProcessId, "PROCESS_INFORMATION.dwProcessId", rawRootPid())
    const creatorTid = (): typeof ThreadId.Type => decodeNative(ThreadId, "PROCESS_INFORMATION.dwThreadId", processInfoBuffer().readUInt32LE(threadIdOffset))

    const duplicates: Array<{ readonly handle: bigint; readonly pid: number; readonly rootProcess: boolean; writer: WriterType | null; member: boolean }> = []
    let rootDebugProcessSeen = false
    let pending: { readonly pid: number; readonly tid: number } | null = null
    let closed = false
    const ensureOpen = (): void => {
      if (closed) throw new Error("Windows native session is closed")
    }
    const ensureOwnerThread = (): void => {
      if (currentThread() !== ownerThreadId) throw new Error("Windows debug calls must remain on the creating thread")
    }
    const continueRaw = (pid: number, tid: number, status: number): void => {
      requireSuccess("ContinueDebugEvent", () => api.continueDebugEvent(pid, tid, status))
    }
    const closeDebugFile = (events: Buffer, offset: number, operation: string): void => {
      const raw = events.readBigUInt64LE(offset)
      if (raw === 0n) return
      if (raw === -1n || raw === INVALID_HANDLE) throw new Error(`${operation} received an invalid debug file handle`)
      closeHandle(decodeNative(Schema.BigInt, operation, raw), operation)
    }
    const writerForProcessEvent = (events: Buffer, pid: number, tid: number): WriterType => {
      let fileCloseAttempted = false
      let failure: unknown = undefined
      let writer: WriterType | null = null
      const closeImageFile = (): void => {
        fileCloseAttempted = true
        closeDebugFile(events, payloadOffset, "CloseHandle(create process image)")
      }
      try {
        const rootProcess = !rootDebugProcessSeen && pid === rawRootPid()
        if (rootProcess && tid !== creatorTid()) throw new Error("Root CREATE_PROCESS_DEBUG_EVENT thread did not match PROCESS_INFORMATION")
        const source = decodeNative(Schema.BigInt, "CREATE_PROCESS_DEBUG_EVENT.hProcess", events.readBigUInt64LE(payloadOffset + 8))
        if (source === 0n || source === -1n || source === INVALID_HANDLE) throw new Error("CREATE_PROCESS_DEBUG_EVENT supplied an invalid process handle")
        const duplicateBuffer = Buffer.alloc(8)
        const self = currentProcess
        requireSuccess("DuplicateHandle(debug process)", () => api.duplicateHandle(self, source, self, duplicateBuffer, 0, 0, 2))
        const duplicate = decodeNative(Schema.BigInt, "DuplicateHandle output", duplicateBuffer.readBigUInt64LE(0))
        if (duplicate === 0n || duplicate === -1n || duplicate === INVALID_HANDLE) throw new Error("DuplicateHandle returned an invalid process handle")
        const retained: { readonly handle: bigint; readonly pid: number; readonly rootProcess: boolean; writer: WriterType | null; member: boolean } = { handle: duplicate, pid, rootProcess, writer: null, member: false }
        duplicates.push(retained)
        if (rootProcess) rootDebugProcessSeen = true
        closeImageFile()
        waitStatus(duplicate, "WaitForSingleObject(new debug process)")

        const eventPid = decodeNative(ProcessId, "CREATE_PROCESS_DEBUG_EVENT.dwProcessId", pid)
        const actualPid = decodeNative(ProcessId, "GetProcessId", uintResult("GetProcessId(debug process)", () => api.processIdForHandle(duplicate)))
        if (actualPid !== eventPid) throw new Error("CREATE_PROCESS_DEBUG_EVENT process id did not match its process handle")
        const member = Buffer.alloc(4)
        requireSuccess("IsProcessInJob", () => api.processInJob(duplicate, retainedJob, member))
        retained.member = decodeNative(NativeMemberResult, "IsProcessInJob membership", member.readInt32LE(0)) === 1
        if (!retained.member) throw new Error("CREATE_PROCESS_DEBUG_EVENT process is outside the retained job")
        const times = Array.from({ length: 4 }, () => Buffer.alloc(8))
        requireSuccess("GetProcessTimes(debug process)", () => api.processTimes(duplicate, ...times))
        const createdAt = times.at(0)
        if (createdAt === undefined) throw new Error("GetProcessTimes did not return a creation time")
        const creation = createdAt.readBigUInt64LE(0).toString(16).padStart(16, "0")
        writer = decodeNative(Writer, "CREATE_PROCESS_DEBUG_EVENT writer", { pid: actualPid, creation })
        retained.writer = writer
      } catch (cause) {
        failure = cause
      }
      if (!fileCloseAttempted) {
        try {
          closeImageFile()
        } catch (cause) {
          failure = failure === undefined ? cause : new AggregateError([failure, cause], "CREATE_PROCESS_DEBUG_EVENT handling failed")
        }
      }
      if (failure !== undefined) throw failure
      if (writer === null) throw new Error("CREATE_PROCESS_DEBUG_EVENT did not produce a writer")
      return writer
    }
    const eventFields = (pid: number, tid: number): { readonly pid: ProcessIdType; readonly tid: typeof ThreadId.Type } => ({
      pid: decodeNative(ProcessId, "DEBUG_EVENT.dwProcessId", pid),
      tid: decodeNative(ThreadId, "DEBUG_EVENT.dwThreadId", tid)
    })
    const eventFrom = (code: typeof NativeEventCode.Type, pid: number, tid: number, events: Buffer): NativeEvent => {
      return Match.value(code).pipe(
        Match.when(1, () => {
          const fields = eventFields(pid, tid)
          const firstChance = decodeNative(Schema.Literals([0, 1]), "EXCEPTION_DEBUG_INFO.dwFirstChance", events.readUInt32LE(payloadOffset + 152)) === 1
          return decodeNative(NativeEvent, "EXCEPTION_DEBUG_EVENT", {
            type: "exception", ...fields, code: decodeNative(Dword, "EXCEPTION_RECORD.ExceptionCode", events.readUInt32LE(payloadOffset)), firstChance
          })
        }),
        Match.when(2, () => decodeNative(NativeEvent, "CREATE_THREAD_DEBUG_EVENT", { type: "create_thread", ...eventFields(pid, tid) })),
        Match.when(3, () => {
          const writer = writerForProcessEvent(events, pid, tid)
          return decodeNative(NativeEvent, "CREATE_PROCESS_DEBUG_EVENT", { type: "create_process", ...eventFields(pid, tid), writer })
        }),
        Match.when(4, () => decodeNative(NativeEvent, "EXIT_THREAD_DEBUG_EVENT", { type: "exit_thread", ...eventFields(pid, tid) })),
        Match.when(5, () => decodeNative(NativeEvent, "EXIT_PROCESS_DEBUG_EVENT", {
          type: "exit_process", ...eventFields(pid, tid), code: decodeNative(Dword, "EXIT_PROCESS_DEBUG_EVENT.dwExitCode", events.readUInt32LE(payloadOffset))
        })),
        Match.when(6, () => {
          closeDebugFile(events, payloadOffset, "CloseHandle(loaded DLL image)")
          return decodeNative(NativeEvent, "LOAD_DLL_DEBUG_EVENT", { type: "load_dll", ...eventFields(pid, tid) })
        }),
        Match.when(7, () => decodeNative(NativeEvent, "UNLOAD_DLL_DEBUG_EVENT", { type: "unload_dll", ...eventFields(pid, tid) })),
        Match.when(8, () => decodeNative(NativeEvent, "OUTPUT_DEBUG_STRING_EVENT", { type: "output", ...eventFields(pid, tid) })),
        Match.when(9, () => decodeNative(NativeEvent, "RIP_EVENT", { type: "rip", ...eventFields(pid, tid) })),
        Match.exhaustive
      )
    }
    const allProcessHandlesSignalled = (): boolean => {
      const errors: Array<unknown> = []
      let allTerminated = true
      const inspect = (handle: bigint, operation: string): void => {
        try {
          if (waitStatus(handle, operation) !== 0) allTerminated = false
        } catch (cause) {
          errors.push(cause)
        }
      }
      inspect(creatorProcessHandle(), "WaitForSingleObject(root process)")
      for (const duplicate of duplicates) inspect(duplicate.handle, "WaitForSingleObject(debug process)")
      throwCollected("Could not determine whether every debug process has finished", errors)
      return allTerminated
    }

    const session: NativeSession = {
      get root() {
        return rootProcessId()
      },
      poll: () => {
        ensureOpen()
        ensureOwnerThread()
        if (pending !== null) throw new Error("Continue the pending debug event before polling again")
        const events = Buffer.alloc(debugEventSize)
        const result = boolResult("WaitForDebugEvent", () => api.waitForDebugEvent(events, 0))
        if (result === 0) {
          const code = lastError("WaitForDebugEvent")
          if (code === 121) return null
          throw nativeFailure("WaitForDebugEvent", code)
        }
        const rawPid = events.readUInt32LE(4)
        const rawTid = events.readUInt32LE(8)
        pending = { pid: rawPid, tid: rawTid }
        const code = decodeNative(NativeEventCode, "DEBUG_EVENT.dwDebugEventCode", events.readUInt32LE(0))
        return eventFrom(code, rawPid, rawTid, events)
      },
      continueEvent: (event, disposition) => {
        ensureOpen()
        ensureOwnerThread()
        const checkedEvent = decodeNative(NativeEvent, "ContinueDebugEvent event", event)
        const checkedDisposition = decodeNative(Disposition, "ContinueDebugEvent disposition", disposition)
        if (pending === null || pending.pid !== checkedEvent.pid || pending.tid !== checkedEvent.tid) {
          throw new Error("ContinueDebugEvent does not match the pending debug event")
        }
        const status = Match.value(checkedDisposition).pipe(
          Match.when("handled", () => 0x0001_0002),
          Match.when("unhandled", () => 0x8001_0001),
          Match.exhaustive
        )
        continueRaw(pending.pid, pending.tid, status)
        pending = null
      },
      observations: () => {
        ensureOpen()
        ensureOwnerThread()
        return duplicates.map((duplicate) => {
          if (duplicate.writer === null) throw new Error("A CREATE_PROCESS_DEBUG_EVENT process witness is incomplete")
          const state = waitStatus(duplicate.handle, "WaitForSingleObject(debug process)") === 0 ? "terminated" : "active"
          return decodeNative(ObservationSchema, "debug process observation", { writer: duplicate.writer, state })
        })
      },
      terminate: () => {
        ensureOpen()
        ensureOwnerThread()
        const errors: Array<unknown> = []
        let jobTerminated = false
        try {
          requireSuccess("TerminateJobObject", () => api.terminateJob(retainedJob, 0xc000_013a))
          jobTerminated = true
        } catch (cause) {
          errors.push(cause)
        }

        const rootHandles: Array<bigint> = [creatorProcessHandle()]
        const processes: Array<{ readonly handles: Array<bigint>; readonly member: boolean }> = [{ handles: rootHandles, member: true }]
        for (const duplicate of duplicates) {
          if (duplicate.rootProcess) {
            rootHandles.push(duplicate.handle)
          } else {
            processes.push({ handles: [duplicate.handle], member: duplicate.member })
          }
        }

        for (const process of processes) {
          if (jobTerminated && process.member) continue
          let satisfied = false
          const failures: Array<unknown> = []
          for (const handle of process.handles) {
            let waitFailure: unknown = undefined
            try {
              if (waitStatus(handle, "WaitForSingleObject(before terminate)") === 0) {
                satisfied = true
                break
              }
            } catch (cause) {
              waitFailure = cause
            }
            try {
              requireSuccess("TerminateProcess", () => api.terminateProcess(handle, 0xc000_013a))
              satisfied = true
              break
            } catch (cause) {
              try {
                if (waitStatus(handle, "WaitForSingleObject(after terminate)") === 0) {
                  satisfied = true
                  break
                }
                failures.push(cause)
                if (waitFailure !== undefined) failures.push(waitFailure)
              } catch (waitCause) {
                failures.push(cause)
                if (waitFailure !== undefined) failures.push(waitFailure)
                failures.push(waitCause)
              }
            }
          }
          if (!satisfied) {
            errors.push(new AggregateError(failures, "Could not terminate a known process or observe its held handle signalled"))
          }
        }
        if (errors.length > 0) throwCollected("Windows process termination did not complete safely", errors)
        if (pending !== null) {
          continueRaw(pending.pid, pending.tid, 0x8001_0001)
          pending = null
        }
      },
      finished: () => {
        ensureOpen()
        ensureOwnerThread()
        return allProcessHandlesSignalled()
      },
      close: () => {
        ensureOpen()
        ensureOwnerThread()
        if (pending !== null) throw new Error("Cannot close a Windows native session with a pending debug event")
        if (!allProcessHandlesSignalled()) throw new Error("Cannot close a Windows native session while a process is active")
        closed = true
        const errors: Array<unknown> = []
        attempt(errors, releaseAttributes)
        attempt(errors, () => closeHandle(creatorThreadHandle(), "CloseHandle(root thread)"))
        attempt(errors, () => closeHandle(creatorProcessHandle(), "CloseHandle(root process)"))
        for (const duplicate of duplicates) attempt(errors, () => closeHandle(duplicate.handle, "CloseHandle(debug process duplicate)"))
        attempt(errors, () => closeHandle(retainedJob, "CloseHandle(job lease)"))
        startupBuffer = null
        duplicates.length = 0
        throwCollected("Windows native session cleanup failed", errors)
      }
    }
    return { session, startup, commandLine, processInformation }
  }

  const createParameters = (() => {
    try {
      return prepareSession()
    } catch (cause) {
      const cleanupErrors = cleanupAcquired()
      if (cleanupErrors.length > 0) throw new AggregateError([cause, ...cleanupErrors], "Windows native session preparation and cleanup failed")
      throw cause
    }
  })()
  try {
    requireSuccess("CreateProcessW", () => api.createProcess(
      launch.application, createParameters.commandLine, null, null, 1,
      0x0808_0401, launch.environment,
      launch.directory, createParameters.startup, createParameters.processInformation
    ))
  } catch (cause) {
    const cleanupErrors = cleanupAcquired()
    if (cleanupErrors.length > 0) throw new AggregateError([cause, ...cleanupErrors], "Windows native process creation and cleanup failed")
    throw cause
  }
  return createParameters.session
}

export async function openCommandSession(command: NativeCommand, job: JobName, standard: StandardHandles): Promise<NativeSession> {
  requireWindows()
  const checked = Match.value(Schema.decodeResult(NativeCommand, { onExcessProperty: "error" })(command)).pipe(
    Match.tagsExhaustive({
      Failure: (): NativeCommand => { throw new Error("Invalid Windows command specification") },
      Success: ({ success }) => success
    })
  )
  const checkedStandard = decodeNative(StandardHandles, "Windows command standard handles", standard)
  const environment = await prepareWindowsEnvironment(checked.environment)
  return openSession({ ...checked, environment, standard: checkedStandard }, job)
}
