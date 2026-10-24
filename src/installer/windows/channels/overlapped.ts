import { Match, Schema } from "effect"
import { ByteCount } from "../../../../contracts/WindowsCommand.ts"
import { windowsIoStep } from "../protocol.ts"

const Dword = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff_ffff }))
const NativeBool = Schema.Int.check(Schema.isBetween({ minimum: -0x8000_0000, maximum: 0x7fff_ffff }))
const Handle = Schema.BigInt.check(Schema.makeFilter(
  (value) => value > 0n && value < 0xffff_ffff_ffff_ffffn,
  { expected: "a valid Windows x64 handle or native allocation" }
))
const ChunkSize = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_536 }))
const Chunk = Schema.Uint8Array.check(Schema.makeFilter(
  (value) => value.byteLength >= 1 && value.byteLength <= 65_536,
  { expected: "between 1 and 65536 bytes" }
))
const Operation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("connect") }),
  Schema.Struct({ type: Schema.Literal("read"), size: ChunkSize }),
  Schema.Struct({ type: Schema.Literal("write"), bytes: Chunk })
]).pipe(Schema.toTaggedUnion("type"))
type Operation = typeof Operation.Type

export const IoResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("connected") }),
  Schema.Struct({ type: Schema.Literal("read"), bytes: Schema.Uint8Array }),
  Schema.Struct({ type: Schema.Literal("written"), bytes: ByteCount }),
  Schema.Struct({ type: Schema.Literal("failed"), code: Dword })
]).pipe(Schema.toTaggedUnion("type"))
export type IoResult = typeof IoResult.Type
const Status = Schema.Union([
  Schema.Struct({ phase: Schema.Literal("pending") }),
  Schema.Struct({ phase: Schema.Literal("cancelling") }),
  Schema.Struct({ phase: Schema.Literal("terminal"), result: IoResult }),
  Schema.Struct({ phase: Schema.Literal("released") })
]).pipe(Schema.toTaggedUnion("phase"))
type Status = typeof Status.Type

export interface OverlappedRequest {
  readonly file: bigint
  readonly poll: () => IoResult | null
  readonly cancel: () => void
  readonly release: () => void
}

export interface OverlappedIo {
  readonly connect: (file: bigint) => OverlappedRequest
  readonly read: (file: bigint, size: number) => OverlappedRequest
  readonly write: (file: bigint, bytes: Uint8Array) => OverlappedRequest
  readonly owned: () => ReadonlyArray<OverlappedRequest>
}

export async function loadOverlappedIo(): Promise<OverlappedIo> {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Overlapped pipe I/O requires Windows x64")
  }
  const { default: koffi } = await import("koffi")
  const library = koffi.load("kernel32.dll")
  const overlappedType = koffi.struct({
    internal: "uintptr_t", internalHigh: "uintptr_t", offset: "uint32_t", offsetHigh: "uint32_t", event: "void *"
  })
  if (koffi.sizeof(overlappedType) !== 32 || koffi.offsetof(overlappedType, "event") !== 24) {
    throw new Error("Unexpected Windows x64 OVERLAPPED layout")
  }
  const api = {
    createEvent: library.func("void * __stdcall CreateEventW(void *security, int32_t manual, int32_t initial, const char16_t *name)"),
    close: library.func("int32_t __stdcall CloseHandle(void *handle)"),
    connect: library.func("int32_t __stdcall ConnectNamedPipe(void *file, void *overlapped)"),
    read: library.func("int32_t __stdcall ReadFile(void *file, void *buffer, uint32_t size, void *count, void *overlapped)"),
    write: library.func("int32_t __stdcall WriteFile(void *file, const void *buffer, uint32_t size, void *count, void *overlapped)"),
    result: library.func("int32_t __stdcall GetOverlappedResult(void *file, void *overlapped, void *count, int32_t wait)"),
    cancel: library.func("int32_t __stdcall CancelIoEx(void *file, void *overlapped)"),
    wait: library.func("uint32_t __stdcall WaitForSingleObject(void *handle, uint32_t milliseconds)"),
    error: library.func("uint32_t __stdcall GetLastError()")
  }
  const owned = new Set<OverlappedRequest>()
  const call = (invoke: () => unknown) => {
    const value = invoke()
    const code = Schema.decodeUnknownSync(Dword)(api.error())
    return { ok: Schema.decodeUnknownSync(NativeBool)(value) !== 0, code }
  }
  const failure = (operation: string, code: number) => new Error(`${operation} failed with Win32 error ${code}`)

  const start = (file: bigint, operation: Operation): OverlappedRequest => {
    const handle = Schema.decodeSync(Handle)(file)
    const allocations = new Set<bigint>()
    let event: bigint | null = null
    const allocate = (size: number) => {
      const pointer = Schema.decodeUnknownSync(Handle)(koffi.alloc("uint8_t", size))
      allocations.add(pointer)
      const bytes = Buffer.from(koffi.view(pointer, size))
      bytes.fill(0)
      return { pointer, bytes }
    }
    const freeResources = () => {
      const errors: Array<unknown> = []
      if (event !== null) {
        try {
          const closed = call(() => api.close(event))
          if (!closed.ok) throw failure("CloseHandle(overlapped event)", closed.code)
          event = null
        } catch (cause) { errors.push(cause) }
      }
      for (const pointer of allocations) {
        try { koffi.free(pointer); allocations.delete(pointer) }
        catch (cause) { errors.push(cause) }
      }
      if (errors.length > 0) throw new AggregateError(errors, "Overlapped request resource release failed")
    }
    const acquire = () => {
      try {
        const overlapped = allocate(32)
        const value: unknown = api.createEvent(null, 1, 0, null)
        const code = Schema.decodeUnknownSync(Dword)(api.error())
        if (value === null || value === 0n) throw failure("CreateEventW", code)
        event = Schema.decodeUnknownSync(Handle)(value)
        overlapped.bytes.writeBigUInt64LE(event, 24)
        const prepared = Match.value(operation).pipe(Match.discriminatorsExhaustive("type")({
          connect: () => ({
            submit: (): unknown => api.connect(handle, overlapped.pointer),
            completed: (): IoResult => ({ type: "connected" })
          }),
          read: ({ size }) => {
            const data = allocate(size)
            return {
              submit: (): unknown => api.read(handle, data.pointer, size, null, overlapped.pointer),
              completed: (count: number): IoResult => {
                if (count > size) throw new Error("Invalid ReadFile byte count")
                return { type: "read", bytes: Buffer.from(data.bytes.subarray(0, count)) }
              }
            }
          },
          write: ({ bytes }) => {
            const data = allocate(bytes.byteLength)
            data.bytes.set(bytes)
            const size = data.bytes.byteLength
            return {
              submit: (): unknown => api.write(handle, data.pointer, size, null, overlapped.pointer),
              completed: (count: number): IoResult => {
                if (count > size) throw new Error("Invalid WriteFile byte count")
                return { type: "written", bytes: ByteCount.make(count) }
              }
            }
          }
        }))
        return { overlapped, event, ...prepared }
      } catch (cause) {
        try { freeResources() }
        catch (cleanup) { throw new AggregateError([cause, cleanup], "Overlapped request acquisition failed") }
        throw cause
      }
    }
    const resources = acquire()
    let status: Status = { phase: "pending" }
    const complete = (result: IoResult): IoResult => {
      status = { phase: "terminal", result }
      return result
    }
    const query = (): IoResult | null => {
      const count = Buffer.alloc(4)
      const result = call(() => api.result(handle, resources.overlapped.pointer, count, 0))
      if (!result.ok) return result.code === 996 ? null : complete({ type: "failed", code: result.code })
      return complete(resources.completed(count.readUInt32LE(0)))
    }
    const pollPending = () => {
      const value: unknown = api.wait(resources.event, 0)
      const code = Schema.decodeUnknownSync(Dword)(api.error())
      const waited = Schema.decodeUnknownSync(Dword)(value)
      if (waited === 258) return null
      if (waited !== 0) throw failure("WaitForSingleObject(overlapped event)", code)
      return query()
    }
    const request: OverlappedRequest = {
      file: handle,
      poll: () => Match.value(status).pipe(Match.discriminatorsExhaustive("phase")({
        pending: pollPending,
        cancelling: pollPending,
        terminal: ({ result }) => result,
        released: (): IoResult => { throw new Error("Overlapped request is released") }
      })),
      cancel: () => {
        if (windowsIoStep({ phase: status.phase, signal: "cancel" }).action !== "cancel") return
        status = { phase: "cancelling" }
        const result = call(() => api.cancel(handle, resources.overlapped.pointer))
        if (!result.ok && result.code !== 1168) throw failure("CancelIoEx", result.code)
      },
      release: () => {
        const step = windowsIoStep({ phase: status.phase, signal: "release" })
        if (step.action === "ignore") return
        if (step.action !== "release") throw new Error("Cannot release an incomplete overlapped request")
        freeResources()
        status = { phase: "released" }
        owned.delete(request)
      }
    }
    owned.add(request)
    const submitted = call(resources.submit)
    if (submitted.ok) {
      if (operation.type === "connect") complete({ type: "connected" })
      else query()
    } else if (submitted.code !== 997) {
      complete(operation.type === "connect" && submitted.code === 535
        ? { type: "connected" } : { type: "failed", code: submitted.code })
    }
    return request
  }
  return {
    connect: (file) => start(file, { type: "connect" }),
    read: (file, size) => start(file, { type: "read", size: Schema.decodeSync(ChunkSize)(size) }),
    write: (file, bytes) => start(file, { type: "write", bytes: Schema.decodeSync(Chunk)(bytes) }),
    owned: () => Array.from(owned)
  }
}
