import { Cause, Deferred, Effect, Match, Queue, Schema, Semaphore, Stream } from "effect"
import type { Scope } from "effect/Scope"
import { HostUnavailable, type Host } from "../../../../contracts/Installer.ts"
import { ByteCount, type StreamSignal, type StreamState } from "../../../../contracts/WindowsCommand.ts"
import { windowsStreamStep } from "../protocol.ts"
import { acquireWindowsPipes, type StandardHandles } from "./pipes.ts"
import type { OverlappedRequest } from "./overlapped.ts"

export const ChannelLimits = Schema.Struct({ input: ByteCount, output: ByteCount })
export type ChannelLimits = typeof ChannelLimits.Type

export interface WindowsChannel {
  readonly child: StandardHandles
  readonly closeChildren: Effect.Effect<void, HostUnavailable>
  readonly input: (bytes: Uint8Array) => Effect.Effect<void, HostUnavailable>
  readonly endInput: Effect.Effect<void, HostUnavailable>
  readonly output: Stream.Stream<Uint8Array, HostUnavailable>
  readonly drained: Effect.Effect<void, HostUnavailable>
  readonly pump: Effect.Effect<boolean, HostUnavailable>
}

type ReadSlot =
  | { readonly type: "idle" }
  | { readonly type: "reading"; readonly request: OverlappedRequest }
  | { readonly type: "ready"; readonly bytes: Uint8Array }
  | { readonly type: "ended" }

export const acquireWindowsChannel = Effect.fn("WindowsChannel.acquire")(function*(
  host: Host, limits: ChannelLimits
): Effect.fn.Return<WindowsChannel, HostUnavailable, Scope> {
  const pipes = yield* acquireWindowsPipes(host)
  const output = yield* Queue.bounded<Uint8Array, HostUnavailable | Cause.Done>(8)
  const serial = yield* Semaphore.make(1)
  const drained = yield* Deferred.make<void, HostUnavailable>()
  let ledger: StreamState = { input: { type: "open", remaining: limits.input }, outputRemaining: limits.output }
  let failure: HostUnavailable | null = null
  let writing: {
    readonly source: Uint8Array
    readonly ack: Deferred.Deferred<void, HostUnavailable>
    offset: number
    request: OverlappedRequest | null
  } | null = null
  const unavailable = (detail: string) => new HostUnavailable({ host, cause: new Error(detail) })
  const abort = (error: HostUnavailable): HostUnavailable => {
    if (failure === null) failure = error
    Queue.failCauseUnsafe(output, Cause.fail(failure))
    Deferred.doneUnsafe(drained, Effect.fail(failure))
    if (writing !== null) Deferred.doneUnsafe(writing.ack, Effect.fail(failure))
    return failure
  }
  const attempt = <A>(operation: () => A) => Effect.try({
    try: () => {
      if (failure !== null) throw failure
      return operation()
    },
    catch: (cause) => abort(cause instanceof HostUnavailable ? cause : new HostUnavailable({ host, cause }))
  })
  yield* Effect.addFinalizer(() => Effect.sync(() => { abort(unavailable("Windows channel is closed")) }))

  const advance = (signal: StreamSignal): void => {
    const next = windowsStreamStep({ state: ledger, signal })
    ledger = next.state
    Match.value(next.action).pipe(Match.discriminatorsExhaustive("type")({
      accepted: () => {},
      close_input: pipes.endInput,
      ignore: () => {},
      blocked: ({ reason }) => { throw unavailable(`Windows channel refused bytes: ${reason}`) }
    }))
  }
  const reader = (start: () => OverlappedRequest, stdout: boolean) => {
    let slot: ReadSlot = { type: "idle" }
    const deliver = (bytes: Uint8Array) => {
      slot = stdout && bytes.byteLength > 0 && !Queue.offerUnsafe(output, bytes)
        ? { type: "ready", bytes } : { type: "idle" }
      return slot.type === "idle"
    }
    return {
      get ended() { return slot.type === "ended" },
      pump: (): boolean => Match.value(slot).pipe(Match.discriminatorsExhaustive("type")({
        idle: () => { slot = { type: "reading", request: start() }; return true },
        ready: ({ bytes }) => deliver(bytes),
        ended: () => false,
        reading: ({ request }) => {
          const result = request.poll()
          if (result === null) return false
          request.release()
          Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
            read: ({ bytes }) => {
              advance({ type: "output", bytes: ByteCount.make(bytes.byteLength) })
              deliver(bytes)
            },
            failed: ({ code }) => {
              if (code !== 109) throw unavailable(`ReadFile failed with Win32 error ${code}`)
              slot = { type: "ended" }
              if (stdout) Queue.endUnsafe(output)
            },
            connected: () => { throw unavailable("Unexpected pipe connection result while reading") },
            written: () => { throw unavailable("Unexpected pipe write result while reading") }
          }))
          return true
        }
      }))
    }
  }
  const readOutput = reader(pipes.readOutput, true)
  const readError = reader(pipes.readError, false)
  const writeInput = () => {
    const current = writing
    if (current === null) return false
    let submitted = false
    if (current.request === null) {
      current.request = pipes.writeInput(current.source.subarray(current.offset, current.offset + 65_536))
      submitted = true
    }
    const result = current.request.poll()
    if (result === null) return submitted
    current.request.release()
    current.request = null
    Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
      written: ({ bytes }) => {
        if (bytes === 0) throw unavailable("WriteFile completed without making progress")
        current.offset += bytes
        if (current.offset === current.source.byteLength) {
          writing = null
          Deferred.doneUnsafe(current.ack, Effect.void)
        }
      },
      failed: ({ code }) => { throw unavailable(`WriteFile failed with Win32 error ${code}`) },
      connected: () => { throw unavailable("Unexpected pipe connection result while writing") },
      read: () => { throw unavailable("Unexpected pipe read result while writing") }
    }))
    return true
  }
  const input = Effect.fn("WindowsChannel.input")(function*(bytes: Uint8Array): Effect.fn.Return<void, HostUnavailable> {
    yield* serial.withPermit(Effect.gen(function*() {
      const ack = yield* attempt(() => {
        const size = bytes.byteLength
        advance({ type: "input", bytes: ByteCount.make(size) })
        if (size === 0) return null
        const source = Buffer.from(bytes.subarray(0, size))
        const ack = Deferred.makeUnsafe<void, HostUnavailable>()
        writing = { source, ack, offset: 0, request: null }
        return ack
      })
      if (ack !== null) yield* Deferred.await(ack)
    }).pipe(Effect.onInterrupt(() => Effect.sync(() => { abort(unavailable("Windows channel input was interrupted")) }))))
  })
  return {
    child: pipes.child,
    closeChildren: attempt(pipes.closeChildren),
    input,
    endInput: serial.withPermit(attempt(() => advance({ type: "end_input" }))),
    output: Stream.fromQueue(output),
    drained: Deferred.await(drained),
    pump: attempt(() => {
      const written = writeInput()
      const stdout = readOutput.pump()
      const stderr = readError.pump()
      if (readOutput.ended && readError.ended) Deferred.doneUnsafe(drained, Effect.void)
      return written || stdout || stderr
    })
  }
})
