import { randomBytes } from "node:crypto"
import { Context, Effect, Layer, Schema } from "effect"
import type { Scope } from "effect/Scope"
import { JobName, type DomainObservation, type ProcessDomain, type ProcessId } from "../../../../contracts/Execution.ts"

const Dword = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff_ffff }))
const HandleResult = Schema.Struct({ value: Schema.NullOr(Schema.BigInt), error: Dword })
const BoolResult = Schema.Struct({
  value: Schema.Int.check(Schema.isBetween({ minimum: -0x8000_0000, maximum: 0x7fff_ffff })),
  error: Dword
})

export class WindowsJobError extends Schema.TaggedError<WindowsJobError, { readonly brand: unique symbol }>()("WindowsJobError", {
  operation: Schema.NonEmptyString,
  code: Schema.NullOr(Dword),
  cause: Schema.Defect()
}) {}

type WindowsDomain = Extract<ProcessDomain, { readonly type: "windows_job" }>
type WindowsObservation = Extract<DomainObservation, { readonly type: "windows_job" }>
type OwnedJob = {
  readonly domain: WindowsDomain
  readonly assign: (pid: ProcessId) => Effect.Effect<void, WindowsJobError>
  readonly observe: Effect.Effect<WindowsObservation, WindowsJobError>
}

export class WindowsJobs extends Context.Service<WindowsJobs, {
  readonly create: Effect.Effect<OwnedJob, WindowsJobError, Scope>
  readonly observe: (name: JobName) => Effect.Effect<WindowsObservation, WindowsJobError>
}>()("pluginsdk/WindowsJobs") {}

const failure = (operation: string, code: number | null, cause: unknown) => new WindowsJobError({ operation, code, cause })
const attempt = <A>(operation: string, evaluate: () => A) => Effect.try({
  try: evaluate,
  catch: (cause) => failure(operation, null, cause)
})

export const WindowsJobsLive = Layer.effect(WindowsJobs, Effect.gen(function*() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    return yield* failure("load", null, new Error("Windows jobs require Windows x64"))
  }
  const koffi = yield* Effect.tryPromise({
    try: () => import("koffi"),
    catch: (cause) => failure("load", null, cause)
  })
  const api = yield* attempt("bind", () => {
    const library = koffi.load("kernel32.dll")
    const basicLimit = koffi.struct({
      PerProcessUserTimeLimit: "int64_t", PerJobUserTimeLimit: "int64_t", LimitFlags: "uint32_t",
      MinimumWorkingSetSize: "uintptr_t", MaximumWorkingSetSize: "uintptr_t", ActiveProcessLimit: "uint32_t",
      Affinity: "uintptr_t", PriorityClass: "uint32_t", SchedulingClass: "uint32_t"
    })
    const limits = koffi.struct({
      BasicLimitInformation: basicLimit, IoInfo: koffi.array("uint64_t", 6),
      ProcessMemoryLimit: "uintptr_t", JobMemoryLimit: "uintptr_t", PeakProcessMemoryUsed: "uintptr_t", PeakJobMemoryUsed: "uintptr_t"
    })
    const accounting = koffi.struct({
      TotalUserTime: "int64_t", TotalKernelTime: "int64_t", ThisPeriodTotalUserTime: "int64_t", ThisPeriodTotalKernelTime: "int64_t",
      TotalPageFaultCount: "uint32_t", TotalProcesses: "uint32_t", ActiveProcesses: "uint32_t", TotalTerminatedProcesses: "uint32_t"
    })
    const limitBuffer = Buffer.alloc(koffi.sizeof(limits))
    limitBuffer.writeUInt32LE(0x2000, koffi.offsetof(limits, "BasicLimitInformation") + koffi.offsetof(basicLimit, "LimitFlags"))
    return {
      create: library.func("void * __stdcall CreateJobObjectW(void *attributes, const char16_t *name)"),
      open: library.func("void * __stdcall OpenJobObjectW(uint32_t access, int32_t inherit, const char16_t *name)"),
      configure: library.func("int32_t __stdcall SetInformationJobObject(void *job, int32_t infoClass, void *info, uint32_t size)"),
      query: library.func("int32_t __stdcall QueryInformationJobObject(void *job, int32_t infoClass, void *info, uint32_t size, void *returned)"),
      assign: library.func("int32_t __stdcall AssignProcessToJobObject(void *job, void *process)"),
      process: library.func("void * __stdcall OpenProcess(uint32_t access, int32_t inherit, uint32_t pid)"),
      close: library.func("int32_t __stdcall CloseHandle(void *handle)"),
      lastError: library.func("uint32_t __stdcall GetLastError()"),
      resetError: library.func("void __stdcall SetLastError(uint32_t error)"),
      limitBuffer, accountingSize: koffi.sizeof(accounting), activeOffset: koffi.offsetof(accounting, "ActiveProcesses")
    }
  })

  const call = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, operation: string, invoke: () => unknown): Effect.Effect<S["Type"], WindowsJobError> =>
    attempt(operation, () => {
      const value: unknown = invoke()
      const error: unknown = api.lastError()
      return Schema.decodeSync(schema)({ value, error })
    })

  const boolean = Effect.fnUntraced(function*(operation: string, invoke: () => unknown) {
    const result = yield* call(BoolResult, operation, invoke)
    if (result.value === 0) return yield* failure(operation, result.error, new Error("Windows API call failed"))
  })
  const close = (handle: bigint) => boolean("CloseHandle", () => api.close(handle)).pipe(Effect.orDie)
  const release = (result: typeof HandleResult.Type) => result.value === null ? Effect.void : close(result.value)
  const requireHandle = (operation: string, result: typeof HandleResult.Type) => result.value === null
    ? Effect.fail(failure(operation, result.error, new Error("Windows API returned no handle")))
    : Effect.succeed(result.value)

  const query = Effect.fnUntraced(function*(handle: bigint, name: JobName): Effect.fn.Return<WindowsObservation, WindowsJobError> {
    const accounting = Buffer.alloc(api.accountingSize)
    const returned = Buffer.alloc(4)
    yield* boolean("QueryInformationJobObject", () => api.query(handle, 1, accounting, accounting.length, returned))
    if (returned.readUInt32LE(0) !== accounting.length) {
      return yield* failure("QueryInformationJobObject", null, new Error("Unexpected job accounting length"))
    }
    return { type: "windows_job", name, state: accounting.readUInt32LE(api.activeOffset) === 0 ? "empty" : "active" }
  })

  return WindowsJobs.of({
    create: Effect.gen(function*() {
      let closed = false
      const name = yield* attempt("name", () => JobName.make(`Global\\pluginsdk-${randomBytes(32).toString("hex")}`))
      const created = yield* Effect.acquireRelease(call(HandleResult, "CreateJobObjectW", () => {
        api.resetError(0)
        return api.create(null, name)
      }), (result) => Effect.suspend(() => { closed = true; return release(result) }))
      const handle = yield* requireHandle("CreateJobObjectW", created)
      if (created.error === 183) return yield* failure("CreateJobObjectW", 183, new Error("Job name already exists"))
      yield* boolean("SetInformationJobObject", () => api.configure(handle, 9, api.limitBuffer, api.limitBuffer.length))
      const domain: WindowsDomain = { type: "windows_job", name }
      return {
        domain,
        observe: Effect.suspend(() => closed
          ? Effect.fail(failure("QueryInformationJobObject", null, new Error("Job scope has closed")))
          : query(handle, name)),
        assign: Effect.fnUntraced(function*(pid: ProcessId) {
          if (closed) return yield* failure("AssignProcessToJobObject", null, new Error("Job scope has closed"))
          const opened = yield* Effect.acquireRelease(call(HandleResult, "OpenProcess", () => api.process(0x0101, 0, pid)), release)
          const processHandle = yield* requireHandle("OpenProcess", opened)
          yield* boolean("AssignProcessToJobObject", () => api.assign(handle, processHandle))
        }, Effect.scoped)
      }
    }).pipe(Effect.withSpan("WindowsJobs.create")),
    observe: Effect.fn("WindowsJobs.observe")(function*(name: JobName): Effect.fn.Return<WindowsObservation, WindowsJobError, Scope> {
      const opened = yield* Effect.acquireRelease(call(HandleResult, "OpenJobObjectW", () => api.open(0x0004, 0, name)), release)
      if (opened.value === null && opened.error === 2) return { type: "windows_job", name, state: "absent" }
      const handle = yield* requireHandle("OpenJobObjectW", opened)
      return yield* query(handle, name)
    }, Effect.scoped)
  })
}))
