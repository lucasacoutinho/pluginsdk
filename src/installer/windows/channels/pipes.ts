import { randomUUID } from "node:crypto"
import { Effect, Match, Schedule, Schema } from "effect"
import type { Scope } from "effect/Scope"
import { HostUnavailable, type Host } from "../../../../contracts/Installer.ts"
import { ProcessId } from "../../../../contracts/Execution.ts"
import { loadOverlappedIo, type OverlappedRequest } from "./overlapped.ts"

const Handle = Schema.BigInt.check(Schema.makeFilter(
  (value) => value > 0n && value < 0xffff_ffff_ffff_ffffn,
  { expected: "a valid Windows pipe handle" }
))
export const StandardHandles = Schema.Struct({ input: Handle, output: Handle, error: Handle })
export type StandardHandles = typeof StandardHandles.Type
const Dword = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff_ffff }))
const Bool = Schema.Int.check(Schema.isBetween({ minimum: -0x8000_0000, maximum: 0x7fff_ffff }))
const Direction = Schema.Literals(["input", "output"])
type Direction = typeof Direction.Type

export interface WindowsPipes {
  readonly child: StandardHandles
  readonly writeInput: (bytes: Uint8Array) => OverlappedRequest
  readonly readOutput: () => OverlappedRequest
  readonly readError: () => OverlappedRequest
  readonly endInput: () => void
  readonly closeChildren: () => void
}

export const acquireWindowsPipes = Effect.fn("WindowsPipes.acquire")(function*(
  host: Host
): Effect.fn.Return<WindowsPipes, HostUnavailable, Scope> {
  const attempt = <A>(operation: () => A) => Effect.try({ try: operation, catch: (cause) => new HostUnavailable({ host, cause }) })
  const io = yield* Effect.tryPromise({ try: loadOverlappedIo, catch: (cause) => new HostUnavailable({ host, cause }) })
  const { default: koffi } = yield* Effect.tryPromise({ try: () => import("koffi"), catch: (cause) => new HostUnavailable({ host, cause }) })
  const api = yield* attempt(() => {
    const library = koffi.load("kernel32.dll")
    return {
      server: library.func("void * __stdcall CreateNamedPipeW(const char16_t *name, uint32_t mode, uint32_t pipeMode, uint32_t instances, uint32_t outSize, uint32_t inSize, uint32_t timeout, void *security)"),
      client: library.func("void * __stdcall CreateFileW(const char16_t *name, uint32_t access, uint32_t share, void *security, uint32_t creation, uint32_t flags, void *template)"),
      serverPid: library.func("int32_t __stdcall GetNamedPipeServerProcessId(void *pipe, void *pid)"),
      clientPid: library.func("int32_t __stdcall GetNamedPipeClientProcessId(void *pipe, void *pid)"),
      processId: library.func("uint32_t __stdcall GetCurrentProcessId()"),
      inherit: library.func("int32_t __stdcall SetHandleInformation(void *handle, uint32_t mask, uint32_t flags)"),
      close: library.func("int32_t __stdcall CloseHandle(void *handle)"),
      error: library.func("uint32_t __stdcall GetLastError()")
    }
  })
  const files = new Set<bigint>()
  const boolean = (name: string, invoke: () => unknown) => {
    const value = invoke()
    const code = Schema.decodeUnknownSync(Dword)(api.error())
    if (Schema.decodeUnknownSync(Bool)(value) === 0) throw new Error(`${name} failed with Win32 error ${code}`)
  }
  const open = (name: string, invoke: () => unknown) => {
    const value = invoke()
    const code = Schema.decodeUnknownSync(Dword)(api.error())
    if (value === null || value === 0n || value === -1n || value === 0xffff_ffff_ffff_ffffn) {
      throw new Error(`${name} failed with Win32 error ${code}`)
    }
    const handle = Schema.decodeUnknownSync(Handle)(value)
    files.add(handle)
    return handle
  }
  const requireOpen = (file: bigint) => {
    if (!files.has(file)) throw new Error("Windows pipe is closed")
    return file
  }
  const close = (file: bigint) => {
    if (!files.has(file)) return
    if (io.owned().some((request) => request.file === file)) throw new Error("Cannot close a pipe with an owned I/O request")
    boolean("CloseHandle(pipe)", () => api.close(file))
    files.delete(file)
  }
  const closeAll = (handles: Iterable<bigint>) => {
    const errors: Array<unknown> = []
    for (const file of handles) {
      try { close(file) } catch (cause) { errors.push(cause) }
    }
    if (errors.length > 0) throw new AggregateError(errors, "Windows pipe release failed")
  }
  yield* Effect.addFinalizer(() => Effect.gen(function*() {
    while (true) {
      const complete = yield* attempt(() => {
        const errors: Array<unknown> = []
        for (const request of io.owned()) {
          try {
            request.cancel()
            if (request.poll() !== null) request.release()
          } catch (cause) { errors.push(cause) }
        }
        if (errors.length > 0) throw new AggregateError(errors, "Windows pipe request cleanup failed")
        return io.owned().length === 0
      }).pipe(Effect.retry(Schedule.spaced("10 millis")))
      if (complete) break
      yield* Effect.sleep("1 millis")
    }
    yield* attempt(() => closeAll(files))
  }).pipe(Effect.orDie))

  const pair = (direction: Direction) => Effect.gen(function*() {
    const access = Match.value(direction).pipe(
      Match.when("input", () => ({ server: 2, client: 0x8000_0000 })),
      Match.when("output", () => ({ server: 1, client: 0x4000_0000 })),
      Match.exhaustive
    )
    const name = `\\\\.\\pipe\\pluginsdk-${randomUUID()}`
    const server = yield* attempt(() => open("CreateNamedPipeW", () => api.server(
      name, access.server | 0x4000_0000 | 0x0008_0000, 8, 1, 4096, 4096, 0, null
    )))
    yield* attempt(() => boolean("SetHandleInformation(server)", () => api.inherit(server, 1, 0)))
    const connecting = yield* attempt(() => io.connect(server))
    const child = yield* attempt(() => open("CreateFileW(pipe client)", () => api.client(name, access.client, 0, null, 3, 0, null)))
    while (true) {
      const result = yield* attempt(connecting.poll)
      if (result !== null) {
        if (result.type !== "connected") return yield* new HostUnavailable({ host, cause: new Error("Named pipe connection failed") })
        yield* attempt(connecting.release)
        break
      }
      yield* Effect.sleep("1 millis")
    }
    yield* attempt(() => {
      const ownPid = Schema.decodeUnknownSync(ProcessId)(api.processId())
      const peers = [
        { name: "GetNamedPipeServerProcessId", query: (pid: Buffer): unknown => api.serverPid(server, pid) },
        { name: "GetNamedPipeClientProcessId", query: (pid: Buffer): unknown => api.clientPid(server, pid) }
      ]
      for (const peer of peers) {
        const pid = Buffer.alloc(4)
        boolean(peer.name, () => peer.query(pid))
        if (Schema.decodeSync(ProcessId)(pid.readUInt32LE(0)) !== ownPid) throw new Error("Named pipe peer is not the creating process")
      }
      boolean("SetHandleInformation(child)", () => api.inherit(child, 1, 1))
    })
    return { server, child }
  })
  const input = yield* pair("input")
  const output = yield* pair("output")
  const error = yield* pair("output")
  return {
    child: { input: input.child, output: output.child, error: error.child },
    writeInput: (bytes) => io.write(requireOpen(input.server), bytes),
    readOutput: () => io.read(requireOpen(output.server), 65_536),
    readError: () => io.read(requireOpen(error.server), 65_536),
    endInput: () => close(input.server),
    closeChildren: () => closeAll([input.child, output.child, error.child])
  }
})
