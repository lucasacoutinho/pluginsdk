import { Context, Deferred, Effect, Fiber, Layer, Match, Schedule, Schema } from "effect"
import type { Stream } from "effect"
import { HostUnavailable, type Host } from "../../../contracts/Installer.ts"
import type { ProcessId } from "../../../contracts/Execution.ts"
import type { GateSignal, GateState, Observation, Writer } from "../../../contracts/Writers.ts"
import { writerCompletion, writerStep } from "../../internal/process/model.ts"
import { acquireWindowsChannel, ChannelLimits } from "./channels/channel.ts"
import { WindowsJobs, WindowsJobsLive } from "./process/jobs.ts"
import { NativeCommand, openCommandSession, type NativeEvent, type NativeSession } from "./process/native.ts"

export const CommandRequest = Schema.Struct({ launch: NativeCommand, limits: ChannelLimits })
export type CommandRequest = typeof CommandRequest.Type

export interface CommandChannel {
  readonly input: (bytes: Uint8Array) => Effect.Effect<void, HostUnavailable>
  readonly endInput: Effect.Effect<void, HostUnavailable>
  readonly output: Stream.Stream<Uint8Array, HostUnavailable>
  readonly exitCode: Effect.Effect<number, HostUnavailable>
}

export class WindowsCommands extends Context.Service<WindowsCommands, {
  readonly run: <A, E, R>(
    request: CommandRequest,
    protocol: (channel: CommandChannel) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | HostUnavailable, R>
}>()("pluginsdk/WindowsCommands") {}

type RootState =
  | { readonly type: "unseen" }
  | { readonly type: "running" }
  | { readonly type: "exited"; readonly code: Extract<NativeEvent, { readonly type: "exit_process" }>["code"] }
  | { readonly type: "complete" }

type RetainWriters = (writers: ReadonlyArray<Writer>) => Effect.Effect<void, HostUnavailable>

const makeCommands = Effect.fn("WindowsCommands.make")(function*(host: Host, retain: RetainWriters) {
  const jobs = yield* WindowsJobs
  let gate: GateState = { type: "open", writers: [] }
  let completed: ReadonlyArray<Observation> = []
  let busy = false
  const unavailable = (detail: string) => new HostUnavailable({ host, cause: new Error(detail) })
  const nativeIO = <A>(operation: () => A) => Effect.try({
    try: operation, catch: (cause) => cause instanceof HostUnavailable ? cause : new HostUnavailable({ host, cause })
  })
  const advance = (signal: GateSignal) => {
    const next = writerStep({ state: gate, signal })
    gate = next.state
    return next.action
  }
  yield* Effect.addFinalizer(() => Effect.sync(() => { advance({ type: "stop" }) }))

  const releaseNative = (native: NativeSession) => Effect.gen(function*() {
    yield* Effect.gen(function*() {
      yield* nativeIO(native.terminate)
      while (true) {
        const event = yield* nativeIO(() => native.poll())
        if (event !== null) yield* nativeIO(() => native.continueEvent(event, "unhandled"))
        else if (yield* nativeIO(native.finished)) break
        yield* Effect.yieldNow
      }
    }).pipe(Effect.retry(Schedule.spaced("10 millis")))
    const observed = yield* nativeIO(native.observations)
    yield* nativeIO(native.close)
    completed = [...completed, ...observed]
  }).pipe(Effect.uninterruptible, Effect.orDie)

  const command = <A, E, R>(request: CommandRequest, protocol: (channel: CommandChannel) => Effect.Effect<A, E, R>) =>
    Effect.scoped(Effect.gen(function*() {
      const job = yield* jobs.create.pipe(Effect.mapError((cause) => new HostUnavailable({ host, cause })))
      const channel = yield* acquireWindowsChannel(host, request.limits)
      const native = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => openCommandSession(request.launch, job.domain.name, channel.child),
          catch: (cause) => new HostUnavailable({ host, cause })
        }),
        releaseNative
      )
      yield* channel.closeChildren
      const exited = yield* Deferred.make<number, HostUnavailable>()
      let root: RootState = { type: "unseen" }
      const live = new Set<ProcessId>()
      const breakpoints = new Set<ProcessId>()
      const refused = () => unavailable("Native event disagrees with the command writer protocol")
      const known = (event: NativeEvent, operation: Effect.Effect<void, HostUnavailable>) =>
        live.has(event.pid) ? operation : Effect.fail(refused())

      const admit = (event: Extract<NativeEvent, { readonly type: "create_process" }>) => Effect.gen(function*() {
        yield* Match.value(root).pipe(Match.discriminatorsExhaustive("type")({
          unseen: () => event.pid !== native.root ? Effect.fail(refused()) : Effect.sync(() => { root = { type: "running" } }),
          running: () => Effect.void,
          exited: () => Effect.void,
          complete: () => Effect.fail(refused())
        }))
        live.add(event.pid)
        const acknowledge = (writers: ReadonlyArray<Writer>) => Effect.gen(function*() {
          yield* retain(writers).pipe(Effect.onError(() => Effect.sync(() => { advance({ type: "failed" }) })))
          yield* Match.value(advance({ type: "retained", writers })).pipe(Match.discriminatorsExhaustive("type")({
            resume: () => nativeIO(() => native.continueEvent(event, "handled")),
            retain: () => Effect.fail(refused()),
            wait: () => Effect.fail(refused()),
            complete: () => Effect.fail(refused()),
            stop: () => Effect.fail(refused())
          }))
        })
        yield* Match.value(advance({ type: "birth", writer: event.writer })).pipe(Match.discriminatorsExhaustive("type")({
          retain: ({ writers }) => acknowledge(writers),
          resume: () => Effect.fail(refused()),
          wait: () => Effect.fail(refused()),
          complete: () => Effect.fail(refused()),
          stop: () => Effect.fail(refused())
        }))
      })

      const dispatch = (event: NativeEvent) => {
        const continued = () => known(event, nativeIO(() => native.continueEvent(event, "handled")))
        return Match.value(event).pipe(Match.discriminatorsExhaustive("type")({
          create_process: admit,
          create_thread: continued,
          exit_process: (event) => continued().pipe(Effect.tap(() => Effect.sync(() => {
            live.delete(event.pid)
            breakpoints.delete(event.pid)
            if (event.pid === native.root) root = { type: "exited", code: event.code }
          }))),
          exit_thread: continued,
          load_dll: continued,
          unload_dll: continued,
          output: continued,
          rip: continued,
          exception: (event) => {
            const initial = event.code === 0x8000_0003 && event.firstChance && !breakpoints.has(event.pid)
            if (initial) breakpoints.add(event.pid)
            return known(event, nativeIO(() => native.continueEvent(event, initial ? "handled" : "unhandled")))
          }
        }))
      }

      const complete = () => Match.value(root).pipe(Match.discriminatorsExhaustive("type")({
        unseen: () => Effect.void,
        running: () => Effect.void,
        complete: () => Effect.void,
        exited: ({ code }) => Effect.gen(function*() {
          if (live.size > 0) return
          const observed = yield* nativeIO(native.observations)
          const completion = writerCompletion({ writers: gate.writers, observed: [...completed, ...observed] })
          if (completion !== "complete" || !(yield* nativeIO(native.finished))) return
          root = { type: "complete" }
          Deferred.doneUnsafe(exited, Effect.succeed(code))
        })
      }))

      const controller = Effect.forever(Effect.gen(function*() {
        const event = yield* Match.value(root).pipe(Match.discriminatorsExhaustive("type")({
          unseen: () => nativeIO(() => native.poll()),
          running: () => nativeIO(() => native.poll()),
          exited: () => nativeIO(() => native.poll()),
          complete: () => Effect.succeed(null)
        }))
        if (event !== null) yield* dispatch(event)
        const progressed = yield* channel.pump
        yield* complete()
        yield* (event !== null || progressed ? Effect.yieldNow : Effect.sleep("1 millis"))
      }))
      const owner = yield* Effect.forkScoped(controller)
      return yield* Effect.raceFirst(protocol({
        input: channel.input, endInput: channel.endInput, output: channel.output,
        exitCode: Deferred.await(exited).pipe(Effect.tap(() => channel.drained))
      }), Fiber.join(owner))
    })).pipe(Effect.onError(() => Effect.sync(() => { advance({ type: "failed" }) })))

  const run = <A, E, R>(request: CommandRequest, protocol: (channel: CommandChannel) => Effect.Effect<A, E, R>): Effect.Effect<A, E | HostUnavailable, R> =>
    Effect.acquireUseRelease(nativeIO(() => {
      const open = Match.value(gate).pipe(Match.discriminatorsExhaustive("type")({
        open: () => true, retaining: () => false, closed: () => false, stopped: () => false
      }))
      if (busy || !open) throw unavailable("The Windows command owner cannot accept another command")
      busy = true
    }), () => command(request, protocol), () => Effect.sync(() => { busy = false }))

  const finish = Effect.suspend(() => Match.value(advance({ type: "close", observed: completed })).pipe(
    Match.discriminatorsExhaustive("type")({
      complete: () => Effect.void,
      retain: () => Effect.fail(unavailable("The Windows command owner has an incomplete writer ledger")),
      resume: () => Effect.fail(unavailable("The Windows command owner has an incomplete writer ledger")),
      wait: () => Effect.fail(unavailable("The Windows command owner has an incomplete writer ledger")),
      stop: () => Effect.fail(unavailable("The Windows command owner has stopped"))
    })
  ))
  return { commands: WindowsCommands.of({ run }), finish }
})

export const withWindowsCommands = <A, E, R>(
  host: Host,
  retain: RetainWriters,
  program: Effect.Effect<A, E, R | WindowsCommands>
): Effect.Effect<A, E | HostUnavailable, R> => Effect.scoped(Effect.gen(function*() {
  const dependencies = yield* Layer.build(WindowsJobsLive).pipe(Effect.mapError((cause) => new HostUnavailable({ host, cause })))
  const owner = yield* makeCommands(host, retain).pipe(Effect.provideContext(dependencies))
  const result = yield* program.pipe(Effect.provideService(WindowsCommands, owner.commands))
  yield* owner.finish
  return result
})).pipe(
  Effect.withSpan("WindowsCommands.with")
)
