import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { delimiter, join } from "node:path"
import { tmpdir } from "node:os"
import { expect, it } from "vitest"
import { NodeServices } from "@effect/platform-node"
import { Cause, Effect, Exit, Option, Schema } from "effect"
import { Destination, type HostUnavailable } from "../contracts/Installer.ts"
import { parseJson } from "../src/internal/json.ts"
import { readCodexConfig } from "../src/installer/hosts/commands.ts"

type FakeMode = "success" | "protocolError" | "eof" | "invalidJson" | "invalidResult" | "wrongVersion" | "versionedSuccess"

interface FakePaths {
  readonly root: string
  readonly requests: string
  readonly stopped: string
}

const fakeSource = (mode: FakeMode, requests: string, stopped: string) => `#!/usr/bin/env node
import { appendFileSync } from "node:fs"
import { createInterface } from "node:readline"

const mode = ${JSON.stringify(mode)}
const requestsPath = ${JSON.stringify(requests)}
const stoppedPath = ${JSON.stringify(stopped)}
const version = mode === "versionedSuccess" ? { jsonrpc: "2.0" } : {}
const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n")

process.on("SIGTERM", () => {
  appendFileSync(stoppedPath, "stopped\\n")
  process.exit(0)
})

input.on("line", (line) => {
  appendFileSync(requestsPath, line + "\\n")
  let request
  try {
    request = JSON.parse(line)
  } catch {
    process.exit(21)
  }
  if (mode === "eof" && request.id === 1) process.exit(0)
  if (mode === "invalidJson" && request.id === 1) {
    process.stdout.write("not-json\\n")
    return
  }
  if (mode === "protocolError" && request.id === 1) {
    send({ id: 1, error: { code: -1, message: "TOP_SECRET_PROMPT" } })
    return
  }
  if (mode === "wrongVersion" && request.id === 1) {
    send({ jsonrpc: "1.0", id: 1, result: { serverInfo: { name: "fake" }, capabilities: {} } })
    return
  }
  if (request.id === 1) {
    send({ ...version, id: 1, result: { serverInfo: { name: "fake" }, capabilities: {} } })
    return
  }
  if (request.id === 2) {
    const result = mode === "invalidResult"
      ? []
      : { config: { agents: { reviewer: { description: "fixture role" } } }, layers: [{ name: "User" }], origins: {} }
    send({ ...version, id: 2, result })
  }
})
`

const withFakeCodex = async (mode: FakeMode, verify: (paths: FakePaths) => Promise<void>): Promise<void> => {
  const root = mkdtempSync(join(tmpdir(), "pluginsdk-host-config-"))
  const bin = join(root, "bin")
  const home = join(root, "codex-home")
  const workspace = join(root, "workspace")
  const requests = join(root, "requests.jsonl")
  const stopped = join(root, "stopped")
  mkdirSync(bin, { recursive: true })
  mkdirSync(home, { recursive: true })
  mkdirSync(workspace, { recursive: true })
  const executable = join(bin, "codex")
  writeFileSync(executable, fakeSource(mode, requests, stopped))
  chmodSync(executable, 0o755)
  const previousPath = process.env.PATH
  process.env.PATH = previousPath === undefined ? bin : `${bin}${delimiter}${previousPath}`
  try {
    await verify({ root, requests, stopped })
  } finally {
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
    rmSync(root, { recursive: true, force: true })
  }
}

const destination = (type: "user" | "project", root: string) => Schema.decodeUnknownSync(Destination)(
  type === "user"
    ? { type, host: "codex", home: join(root, "codex-home") }
    : { type, host: "codex", home: join(root, "codex-home"), root: join(root, "workspace") }
)

const read = (target: ReturnType<typeof destination>) =>
  Effect.runPromise(readCodexConfig(target).pipe(Effect.provide(NodeServices.layer)))

const failedRead = async (target: ReturnType<typeof destination>): Promise<HostUnavailable> => {
  const exit = await Effect.runPromiseExit(readCodexConfig(target).pipe(Effect.provide(NodeServices.layer)))
  if (Exit.isSuccess(exit)) throw new Error("Expected Codex config read to fail")
  const failure = Cause.findErrorOption(exit.cause)
  if (Option.isNone(failure)) throw new Error("Expected a typed HostUnavailable failure")
  return failure.value
}

const requestsFrom = (path: string): ReadonlyArray<Schema.JsonObject> =>
  readFileSync(path, "utf8").trim().split("\n").map((line) =>
    Schema.decodeUnknownSync(Schema.JsonObject)(parseJson(line))
  )

it("reads Codex config after initialization for user and project cwd, then reaps the child", async () => {
  await withFakeCodex("success", async ({ root, requests, stopped }) => {
    const user = await read(destination("user", root))
    expect(user.config).toEqual({ agents: { reviewer: { description: "fixture role" } } })
    expect(user.layers).toEqual([{ name: "User" }])

    const project = await read(destination("project", root))
    expect(project.config).toEqual({ agents: { reviewer: { description: "fixture role" } } })
    expect(project.layers).toEqual([{ name: "User" }])

    const messages = requestsFrom(requests)
    expect(messages.map((message) => message.method)).toEqual([
      "initialize", "initialized", "config/read",
      "initialize", "initialized", "config/read"
    ])
    expect(messages.every((message) => !Object.hasOwn(message, "jsonrpc"))).toBe(true)
    expect(messages[0]?.params).toEqual({
      clientInfo: { name: "pluginsdk-codex-config", title: "Plugin SDK", version: "1" },
      capabilities: { experimentalApi: true }
    })
    expect(messages[2]?.params).toEqual({ includeLayers: true, cwd: join(root, "codex-home") })
    expect(messages[5]?.params).toEqual({ includeLayers: true, cwd: join(root, "workspace") })
    expect(readFileSync(stopped, "utf8").trim().split("\n")).toHaveLength(2)
  })
})

it("turns protocol errors into generic HostUnavailable failures without retaining their message", async () => {
  await withFakeCodex("protocolError", async ({ root, requests, stopped }) => {
    const failure = await failedRead(destination("user", root))
    expect(failure._tag).toBe("HostUnavailable")
    expect(String(failure.cause)).not.toContain("TOP_SECRET_PROMPT")
    expect(requestsFrom(requests).map((message) => message.method)).toEqual(["initialize"])
    expect(existsSync(stopped)).toBe(true)
  })
})

it("rejects premature EOF", async () => {
  await withFakeCodex("eof", async ({ root, requests }) => {
    const failure = await failedRead(destination("user", root))
    expect(failure._tag).toBe("HostUnavailable")
    expect(requestsFrom(requests).map((message) => message.method)).toEqual(["initialize"])
  })
})

it("rejects invalid JSON and non-object config/read results", async () => {
  await withFakeCodex("invalidJson", async ({ root, stopped }) => {
    const failure = await failedRead(destination("user", root))
    expect(failure._tag).toBe("HostUnavailable")
    expect(String(failure.cause)).not.toContain("not-json")
    expect(existsSync(stopped)).toBe(true)
  })

  await withFakeCodex("invalidResult", async ({ root, requests, stopped }) => {
    const failure = await failedRead(destination("user", root))
    expect(failure._tag).toBe("HostUnavailable")
    expect(requestsFrom(requests).map((message) => message.method)).toEqual(["initialize", "initialized", "config/read"])
    expect(existsSync(stopped)).toBe(true)
  })
})

it("rejects an incorrect optional protocol version field", async () => {
  await withFakeCodex("wrongVersion", async ({ root, stopped }) => {
    const failure = await failedRead(destination("user", root))
    expect(failure._tag).toBe("HostUnavailable")
    expect(existsSync(stopped)).toBe(true)
  })
})

it("accepts the optional native protocol version when it is correct", async () => {
  await withFakeCodex("versionedSuccess", async ({ root }) => {
    const result = await read(destination("user", root))
    expect(result.config).toEqual({ agents: { reviewer: { description: "fixture role" } } })
  })
})
