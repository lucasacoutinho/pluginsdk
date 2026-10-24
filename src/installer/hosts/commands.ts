import { dirname } from "node:path"
import { Effect, Match, Option, Queue, Ref, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner as ProcessSpawner } from "effect/process"
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import { ByteCount } from "../../../contracts/WindowsCommand.ts"
import { HostUnavailable, type Destination, type Host } from "../../../contracts/Installer.ts"
import { canonicalJson, parseJson } from "../../internal/json.ts"
import { resolveWindowsExecutable } from "../windows/process/executable.ts"
import { CommandRequest, WindowsCommands, withWindowsCommands, type CommandChannel } from "../windows/commands.ts"

export type SupportedHost = Extract<Host, "claude_code" | "codex">

export const supportedHost = (host: Host): SupportedHost | null => Match.value(host).pipe(
  Match.when("claude_code", (value) => value),
  Match.when("codex", (value) => value),
  Match.when("cursor", () => null),
  Match.when("grok_bot", () => null),
  Match.when("muse", () => null),
  Match.exhaustive
)

const hostBinary = (host: SupportedHost): "claude" | "codex" => Match.value(host).pipe(
  Match.when("claude_code", (): "claude" => "claude"),
  Match.when("codex", (): "codex" => "codex"),
  Match.exhaustive
)

const hostEnvironment = (home: string) => ({
  HOME: dirname(home),
  CLAUDE_CONFIG_DIR: home,
  CODEX_HOME: home,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
})

const unavailable = (host: Host, detail: string) =>
  new HostUnavailable({ host, cause: new Error(detail) })

const workingDirectory = (destination: Destination): string => Match.value(destination).pipe(
  Match.when({ type: "user" }, (value) => value.home),
  Match.when({ type: "project" }, (value) => value.root),
  Match.exhaustive
)

const ServerEvent = Schema.Union([
  Schema.TaggedStruct("notification", {}),
  Schema.TaggedStruct("response", { id: Schema.Int, result: Schema.JsonObject }),
  Schema.TaggedStruct("protocolError", {}),
  Schema.TaggedStruct("invalid", {}),
  Schema.TaggedStruct("eof", {}),
  Schema.TaggedStruct("failed", {})
]).pipe(Schema.toTaggedUnion("_tag"))
type ServerEvent = typeof ServerEvent.Type

const classifyServerLine = (line: string): ServerEvent => {
  let message: Schema.JsonObject
  try {
    message = Schema.decodeUnknownSync(Schema.JsonObject)(parseJson(line))
  } catch {
    return { _tag: "invalid" }
  }
  if (Object.hasOwn(message, "jsonrpc") && message.jsonrpc !== "2.0") return { _tag: "invalid" }
  if (typeof message.method === "string" && !Object.hasOwn(message, "id")) return { _tag: "notification" }
  if (typeof message.id !== "number" || !Number.isSafeInteger(message.id)) return { _tag: "invalid" }
  if (Object.hasOwn(message, "error")) return { _tag: "protocolError" }
  if (!Object.hasOwn(message, "result")) return { _tag: "invalid" }
  return Option.match(Schema.decodeUnknownOption(ServerEvent)({
    _tag: "response",
    id: message.id,
    result: message.result
  }), {
    onNone: (): ServerEvent => ({ _tag: "invalid" }),
    onSome: (event) => event
  })
}

const waitForResponse = (
  events: Queue.Queue<ServerEvent>,
  host: Host,
  expected: 1 | 2
): Effect.Effect<Schema.JsonObject, HostUnavailable> => Effect.gen(function*() {
  const event = yield* Queue.take(events)
  return yield* Match.value(event).pipe(
    Match.when({ _tag: "notification" }, () => waitForResponse(events, host, expected)),
    Match.when({ _tag: "response" }, (response) =>
      response.id === expected
        ? Effect.succeed(response.result)
        : Effect.fail(unavailable(host, "Codex app-server returned an unexpected response"))),
    Match.when({ _tag: "protocolError" }, () => Effect.fail(unavailable(host, "Codex app-server request failed"))),
    Match.when({ _tag: "invalid" }, () => Effect.fail(unavailable(host, "Codex app-server returned an invalid response"))),
    Match.when({ _tag: "eof" }, () => Effect.fail(unavailable(host, "Codex app-server closed before responding"))),
    Match.when({ _tag: "failed" }, () => Effect.fail(unavailable(host, "Codex app-server communication failed"))),
    Match.exhaustive
  )
})

const codexExchange = (
  host: Host,
  cwd: string,
  stdout: Stream.Stream<Uint8Array, HostUnavailable>,
  send: (message: Schema.JsonObject) => Effect.Effect<void, HostUnavailable>
): Effect.Effect<Schema.JsonObject, HostUnavailable> => Effect.scoped(Effect.gen(function*() {
  const events = yield* Queue.unbounded<ServerEvent>()
  const bytesRead = yield* Ref.make(0)
  const readStdout = stdout.pipe(
    Stream.mapEffect((chunk) => Ref.updateAndGet(bytesRead, (total) => total + chunk.byteLength).pipe(
      Effect.flatMap((total) => total > 8 * 1024 * 1024
        ? Effect.fail(unavailable(host, "Codex app-server output exceeded the limit"))
        : Effect.succeed(chunk))
    )),
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runForEach((line) => {
      if (line.length === 0) return Effect.void
      return Queue.offer(events, classifyServerLine(line)).pipe(Effect.asVoid)
    }),
    Effect.flatMap(() => Queue.offer(events, { _tag: "eof" }).pipe(Effect.asVoid)),
    Effect.catchTag("HostUnavailable", () => Queue.offer(events, { _tag: "failed" }).pipe(Effect.asVoid))
  )
  yield* readStdout.pipe(Effect.forkScoped)

  yield* send({
    id: 1,
    method: "initialize",
    params: {
      clientInfo: { name: "pluginsdk-codex-config", title: "Plugin SDK", version: "1" },
      capabilities: { experimentalApi: true }
    }
  })
  yield* waitForResponse(events, host, 1)
  yield* send({ method: "initialized", params: {} })
  yield* send({
    id: 2,
    method: "config/read",
    params: { includeLayers: true, cwd }
  })
  return yield* waitForResponse(events, host, 2)
}))

const withWindowsHostCommand = <A, E, R>(
  host: SupportedHost,
  destination: Destination,
  args: ReadonlyArray<string>,
  inExecution: boolean,
  protocol: (channel: CommandChannel) => Effect.Effect<A, E, R>
): Effect.Effect<A, E | HostUnavailable, R> => Effect.gen(function*() {
  const current = yield* Effect.serviceOption(WindowsCommands)
  if (Option.isNone(current) && inExecution) {
    return yield* unavailable(host, "Windows host command requires the retained command owner")
  }

  const application = yield* Effect.tryPromise({
    try: () => resolveWindowsExecutable(hostBinary(host)),
    catch: () => unavailable(host, "Windows host executable could not be resolved")
  })
  const request = yield* Schema.decodeEffect(CommandRequest, { onExcessProperty: "error" })({
    launch: {
      application,
      args: [...args],
      directory: workingDirectory(destination),
      environment: hostEnvironment(destination.home)
    },
    limits: {
      input: ByteCount.make(1024 * 1024),
      output: ByteCount.make(8 * 1024 * 1024)
    }
  }).pipe(Effect.mapError(() => unavailable(host, "Windows host command request is invalid")))

  return yield* Option.match(current, {
    onNone: () => withWindowsCommands(host, () => Effect.void, Effect.gen(function*() {
      const commands = yield* WindowsCommands
      return yield* commands.run(request, protocol)
    })),
    onSome: (commands) => commands.run(request, protocol)
  })
})

export const readCodexConfig = Effect.fn("Installer.readCodexConfig")(function*(
  destination: Destination,
  inExecution = false
): Effect.fn.Return<Schema.JsonObject, HostUnavailable, ChildProcessSpawner> {
  const host = supportedHost(destination.host)
  if (host !== "codex") return yield* unavailable(destination.host, "Codex app-server is unavailable for this host")

  const cwd = workingDirectory(destination)
  const operation = process.platform === "win32"
    ? withWindowsHostCommand(host, destination, ["-c", "features.plugins=false", "app-server", "--stdio"], inExecution, (channel) =>
      Effect.gen(function*() {
        const config = yield* codexExchange(host, cwd, channel.output, (message) =>
          channel.input(new TextEncoder().encode(`${canonicalJson(message)}\n`))
        )
        yield* channel.endInput
        return config
      })
    )
    : Effect.scoped(Effect.gen(function*() {
      const spawner = yield* ProcessSpawner.ChildProcessSpawner
      const input = yield* Queue.unbounded<string>()
      const handle = yield* spawner.spawn(ChildProcess.make("codex", ["-c", "features.plugins=false", "app-server", "--stdio"], {
        cwd,
        env: hostEnvironment(destination.home),
        extendEnv: true,
        stdin: Stream.fromQueue(input).pipe(Stream.encodeText),
        stdout: "pipe",
        stderr: "pipe",
        detached: !inExecution,
        forceKillAfter: "1 second"
      }))

      yield* handle.stderr.pipe(Stream.runDrain, Effect.forkScoped)
      const stdout = handle.stdout.pipe(Stream.mapError(() =>
        unavailable(host, "Codex app-server communication failed")
      ))
      const send = (message: Schema.JsonObject) => Queue.offer(input, `${canonicalJson(message)}\n`).pipe(Effect.asVoid)
      return yield* codexExchange(host, cwd, stdout, send)
    })).pipe(Effect.catchTag("PlatformError", () => Effect.fail(unavailable(host, "Codex app-server could not be started"))))

  const result = yield* operation.pipe(Effect.timeoutOption("10 seconds"))
  return yield* Effect.fromOption(result, () => unavailable(host, "Codex app-server timed out"))
})

export const runHost = Effect.fnUntraced(function*(destination: Destination, args: ReadonlyArray<string>, inExecution = false) {
  const host = supportedHost(destination.host)
  if (host === null) return yield* unavailable(destination.host, "Unsupported native host")
  const binary = hostBinary(host)
  if (process.platform === "win32") {
    return yield* withWindowsHostCommand(host, destination, args, inExecution, (channel) => Effect.gen(function*() {
      yield* channel.endInput
      const [stdout, code] = yield* Effect.all([
        channel.output.pipe(Stream.decodeText(), Stream.mkString),
        channel.exitCode
      ], { concurrency: "unbounded" })
      if (Number(code) !== 0) return yield* unavailable(host, `${binary} exited with code ${code}`)
      return stdout
    }))
  }

  const spawner = yield* ProcessSpawner.ChildProcessSpawner
  return yield* Effect.scoped(Effect.gen(function*() {
    const handle = yield* spawner.spawn(ChildProcess.make(binary, args, {
      cwd: workingDirectory(destination),
      env: hostEnvironment(destination.home),
      extendEnv: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      detached: !inExecution,
      forceKillAfter: "1 second"
    }))
    const [stdout, , code] = yield* Effect.all([
      handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
      handle.stderr.pipe(Stream.runDrain),
      handle.exitCode
    ], { concurrency: "unbounded" })
    if (Number(code) !== 0) return yield* unavailable(host, `${binary} exited with code ${code}`)
    return stdout
  })).pipe(Effect.catchTag("PlatformError", (cause) => new HostUnavailable({ host, cause })))
})
