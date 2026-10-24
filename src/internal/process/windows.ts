import { Effect, Match, Schema } from "effect"
import { ProcessId } from "../../../contracts/Execution.ts"
import { Writer, type Lookup, type Observation, type Writer as WriterType } from "../../../contracts/Writers.ts"
import { observeWriter } from "./model.ts"

export class WindowsProcessUnavailable extends Schema.TaggedError<WindowsProcessUnavailable, { readonly brand: unique symbol }>()(
  "WindowsProcessUnavailable", { cause: Schema.Defect() }
) {}

const Dword = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff_ffff }))
const NativeBool = Schema.Int.check(Schema.isBetween({ minimum: -0x8000_0000, maximum: 0x7fff_ffff }))
const NativeHandle = Schema.NullOr(Schema.BigInt)
const decodeDword = Schema.decodeUnknownSync(Dword)
const decodeBool = Schema.decodeUnknownSync(NativeBool)
const decodeHandle = Schema.decodeUnknownSync(NativeHandle)
const decodeWriter = Schema.decodeUnknownSync(Writer)
const QUERY_AND_SYNCHRONIZE = 0x0010_1000
const ERROR_INVALID_PARAMETER = 87

const makeWriterLookup = Effect.fn("WindowsProcess.makeWriterLookup")(function*(): Effect.fn.Return<(pid: ProcessId) => Effect.Effect<Lookup, WindowsProcessUnavailable>, WindowsProcessUnavailable> {
  const unavailable = (cause: unknown) => new WindowsProcessUnavailable({ cause })
  const io = <A>(operation: () => A) => Effect.try({ try: operation, catch: unavailable })
  if (process.platform !== "win32" || process.arch !== "x64") {
    return yield* unavailable(new Error("Windows writer observation requires Windows x64"))
  }
  const { default: koffi } = yield* Effect.tryPromise({ try: () => import("koffi"), catch: unavailable })
  const api = yield* io(() => {
    const kernel32 = koffi.load("kernel32.dll")
    return {
      open: kernel32.func("void * __stdcall OpenProcess(uint32_t access, int32_t inherit, uint32_t pid)"),
      pid: kernel32.func("uint32_t __stdcall GetProcessId(void *process)"),
      times: kernel32.func("int32_t __stdcall GetProcessTimes(void *process, void *created, void *exited, void *kernel, void *user)"),
      wait: kernel32.func("uint32_t __stdcall WaitForSingleObject(void *handle, uint32_t timeout)"),
      close: kernel32.func("int32_t __stdcall CloseHandle(void *handle)"),
      error: kernel32.func("uint32_t __stdcall GetLastError()")
    }
  })
  const failure = (operation: string, code: unknown) => new Error(`${operation} failed with Win32 error ${decodeDword(code)}`)
  const requireSuccess = (operation: string, invoke: () => unknown): void => {
    const result = invoke()
    const error: unknown = api.error()
    if (decodeBool(result) === 0) throw failure(operation, error)
  }
  return (pid: ProcessId) => Effect.acquireUseRelease(
    io(() => {
      const rawHandle: unknown = api.open(QUERY_AND_SYNCHRONIZE, 0, pid)
      const rawError: unknown = api.error()
      const handle = decodeHandle(rawHandle)
      if (handle !== null && (handle < 0n || handle === 0xffff_ffff_ffff_ffffn)) throw new Error("OpenProcess returned an invalid handle")
      return { handle, error: decodeDword(rawError) }
    }),
    ({ handle, error }) => io((): Lookup => {
      if (handle === null || handle === 0n) {
        return error === ERROR_INVALID_PARAMETER ? { type: "missing", pid } : { type: "unavailable" }
      }
      const rawPid: unknown = api.pid(handle)
      const pidError: unknown = api.error()
      const actualPid = decodeDword(rawPid)
      if (actualPid === 0) throw failure("GetProcessId", pidError)
      const created = Buffer.alloc(8)
      const exited = Buffer.alloc(8)
      const kernel = Buffer.alloc(8)
      const user = Buffer.alloc(8)
      requireSuccess("GetProcessTimes", () => api.times(handle, created, exited, kernel, user))
      const writer = decodeWriter({ pid: actualPid, creation: created.readBigUInt64LE(0).toString(16).padStart(16, "0") })
      const rawWait: unknown = api.wait(handle, 0)
      const waitError: unknown = api.error()
      const wait = decodeDword(rawWait)
      if (wait === 0xffff_ffff) throw failure("WaitForSingleObject", waitError)
      if (wait !== 0 && wait !== 258) throw new Error(`Unexpected Windows process wait status ${wait}`)
      return { type: "opened", writer, state: wait === 0 ? "terminated" : "active" }
    }),
    ({ handle }) => handle === null || handle === 0n
      ? Effect.void
      : io(() => requireSuccess("CloseHandle(process observation)", () => api.close(handle)))
  )
})

export const observeWindowsWriters = Effect.fn("WindowsProcess.observeWriters")(function*(
  writers: ReadonlyArray<WriterType>
): Effect.fn.Return<ReadonlyArray<Observation>, WindowsProcessUnavailable> {
  const lookup = yield* makeWriterLookup()
  return yield* Effect.forEach(writers, (writer) => lookup(writer.pid).pipe(
    Effect.map((lookup) => observeWriter({ writer, lookup }))
  ))
})

export const currentWindowsWriter = Effect.fn("WindowsProcess.currentWriter")(function*(): Effect.fn.Return<WriterType, WindowsProcessUnavailable> {
  const lookup = yield* makeWriterLookup()
  const pid = yield* Schema.decodeEffect(ProcessId)(process.pid).pipe(
    Effect.mapError((cause) => new WindowsProcessUnavailable({ cause }))
  )
  const result = yield* lookup(pid)
  const unavailable = new WindowsProcessUnavailable({ cause: new Error("The current Windows process identity could not be established") })
  return yield* Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
    opened: ({ writer, state }) => writer.pid === pid && state === "active" ? Effect.succeed(writer) : Effect.fail(unavailable),
    missing: () => Effect.fail(unavailable),
    unavailable: () => Effect.fail(unavailable)
  }))
})
