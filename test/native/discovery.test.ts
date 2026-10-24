import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative } from "node:path"
import { createInterface } from "node:readline"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { BuildRequest, Compiler, type Format } from "../../contracts/Compiler.ts"
import { ApplyOutcome, Destination, Installer, Planning } from "../../contracts/Installer.ts"
import { Plugin, PluginId, StdioMcp } from "../../contracts/Plugin.ts"
import { PluginSdkLive } from "../../src/node.ts"
import { parseJson } from "../../src/internal/json.ts"
import { startMcpFixture, type McpFixture } from "./mcp-fixture.ts"

type NativeHost = "claude_code" | "codex"

const SkillMetadata = Schema.Struct({
	name: Schema.String,
	description: Schema.String,
	path: Schema.String,
	scope: Schema.String,
	enabled: Schema.Boolean,
	pluginId: Schema.NullOr(Schema.String)
})
const SkillsResponse = Schema.Struct({
	data: Schema.Array(Schema.Struct({
		cwd: Schema.String,
		skills: Schema.Array(SkillMetadata),
		errors: Schema.Array(Schema.Unknown)
	}))
})
const ThreadStartResponse = Schema.Struct({ thread: Schema.Struct({ id: Schema.String }) })
const McpStatusResponse = Schema.Struct({
	data: Schema.Array(Schema.Struct({
		name: Schema.String,
		pluginId: Schema.NullOr(Schema.String),
		serverInfo: Schema.NullOr(Schema.Struct({ name: Schema.String, version: Schema.String })),
		tools: Schema.Record(Schema.String, Schema.Unknown),
		toolsError: Schema.NullOr(Schema.String)
	})),
	nextCursor: Schema.NullOr(Schema.String)
})
const ToolCallResponse = Schema.Struct({
	content: Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.optionalKey(Schema.String) })),
	isError: Schema.optionalKey(Schema.Boolean)
})
const ClaudePlugin = Schema.Struct({
	id: Schema.String,
	version: Schema.String,
	scope: Schema.String,
	enabled: Schema.Boolean,
	installPath: Schema.String
})
const PluginList = Schema.Array(ClaudePlugin)
const ClaudeStdioPluginList = Schema.Array(Schema.Struct({
	id: Schema.String,
	version: Schema.String,
	scope: Schema.String,
	enabled: Schema.Boolean,
	installPath: Schema.String,
	readFromFolder: Schema.String
}))
const CodexStdioPluginList = Schema.Struct({
	installed: Schema.Array(Schema.Struct({
		pluginId: Schema.String,
		name: Schema.String,
		marketplaceName: Schema.String,
		version: Schema.String,
		installed: Schema.Boolean,
		enabled: Schema.Boolean,
		source: Schema.Struct({ source: Schema.Literal("local"), path: Schema.String })
	})),
	available: Schema.Array(Schema.JsonObject)
})
const ProbeSelectedEnvironment = Schema.Struct({
	OPTIND: Schema.String,
	EMPTY: Schema.String,
	IFS: Schema.String,
	PWD: Schema.String,
	_: Schema.String,
	SAFE_MARKER: Schema.String,
	PROBE_LOG: Schema.String,
	PROBE_VERSION: Schema.String
})
const ProbeEvent = Schema.Union([
	Schema.Struct({
		type: Schema.Literal("startup"),
		pid: Schema.Finite,
		version: Schema.String,
		argv: Schema.Array(Schema.String),
		cwd: Schema.String,
		selectedEnv: ProbeSelectedEnvironment,
		internalKeys: Schema.Array(Schema.String)
	}),
	Schema.Struct({ type: Schema.Literal("rpc"), pid: Schema.Finite, version: Schema.String, method: Schema.String }),
	Schema.Struct({ type: Schema.Literal("signal"), pid: Schema.Finite, version: Schema.String, signal: Schema.Literals(["SIGINT", "SIGTERM"]) })
]).pipe(Schema.toTaggedUnion("type"))
type ProbeEvent = typeof ProbeEvent.Type

const AppServerFrame = Schema.Struct({
	jsonrpc: Schema.optionalKey(Schema.Literal("2.0")),
	id: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.String])),
	method: Schema.optionalKey(Schema.String),
	params: Schema.optionalKey(Schema.Unknown),
	result: Schema.optionalKey(Schema.Unknown),
	error: Schema.optionalKey(Schema.Unknown)
})
type AppServerFrame = typeof AppServerFrame.Type

type PendingRequest = {
	readonly resolve: (frame: AppServerFrame) => void
	readonly reject: (error: Error) => void
	readonly timeout: ReturnType<typeof setTimeout>
}

type AppServerClient = {
	readonly request: (method: string, params: unknown) => Promise<unknown>
	readonly notify: (method: string, params: unknown) => void
	readonly stop: () => Promise<void>
}

class NativeProbeFailed extends Schema.TaggedError<NativeProbeFailed, { readonly brand: unique symbol }>()("NativeProbeFailed", {
	operation: Schema.NonEmptyString,
	cause: Schema.Defect()
}) {}

const PluginSdkTestLive = Layer.provideMerge(PluginSdkLive, NodeServices.layer)

const operationFailure = (operation: string) => (cause: unknown) => new NativeProbeFailed({ operation, cause })

const decodeJson = (text: string) => Effect.try({
	try: () => parseJson(text),
	catch: operationFailure("parse native host JSON")
})

const preserveEnvironment = Effect.acquireRelease(
	Effect.sync(() => {
		const saved = Object.entries(process.env)
		const inherited = new Set(["PATH", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "TZ"])
		for (const key of Object.keys(process.env)) {
			if (!inherited.has(key)) delete process.env[key]
		}
		return saved
	}),
	(saved) => Effect.sync(() => {
		for (const key of Object.keys(process.env)) delete process.env[key]
		for (const [key, value] of saved) {
			if (value !== undefined) process.env[key] = value
		}
	})
)

const destinationFormat = (host: NativeHost): "agent_plugins_v1" | "claude_code_v1" => Match.value(host).pipe(
	Match.when("claude_code", () => "claude_code_v1" as const),
	Match.when("codex", () => "agent_plugins_v1" as const),
	Match.exhaustive
)

const pluginIdFor = (host: NativeHost): string => Match.value(host).pipe(
	Match.when("claude_code", () => "pluginsdk-claude-probe"),
	Match.when("codex", () => "pluginsdk-codex-probe"),
	Match.exhaustive
)

const isolatedEnvironment = (home: string): NodeJS.ProcessEnv => ({
	PATH: process.env.PATH ?? "/usr/bin:/bin",
	HOME: dirname(home),
	CLAUDE_CONFIG_DIR: home,
	CODEX_HOME: home,
	CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
	CI: "1",
	NO_COLOR: "1",
	TERM: "dumb"
})

const runQuery = (binary: string, args: ReadonlyArray<string>, home: string, cwd: string): Promise<string> => {
	const result = spawn(binary, [...args], {
		cwd,
		env: isolatedEnvironment(home),
		stdio: ["ignore", "pipe", "pipe"]
	})
	let stdout = ""
	let stderr = ""
	result.stdout?.setEncoding("utf8")
	result.stderr?.setEncoding("utf8")
	result.stdout?.on("data", (chunk: string) => { stdout += chunk })
	result.stderr?.on("data", (chunk: string) => { stderr += chunk })
	return new Promise<string>((resolve, reject) => {
		const timeout = setTimeout(() => {
			result.kill("SIGKILL")
			reject(new Error(`${binary} ${args.join(" ")} timed out`))
		}, 30_000)
		result.once("error", (error) => {
			clearTimeout(timeout)
			reject(error)
		})
		result.once("close", (code, signal) => {
			clearTimeout(timeout)
			if (code === 0) resolve(stdout)
			else reject(new Error(`${binary} ${args.join(" ")} exited with ${String(code)} (${String(signal)}): ${stderr}`))
		})
	})
}

const queryEffect = (binary: string) => (args: ReadonlyArray<string>, home: string, cwd: string) =>
  Effect.tryPromise({
    try: () => runQuery(binary, args, home, cwd),
    catch: operationFailure(`${binary} ${args.join(" ")}`)
  })

const runClaudeEffect = queryEffect("claude")
const runCodexEffect = queryEffect("codex")

const startCodexAppServer = (home: string, cwd: string): AppServerClient => {
	const child = spawn("codex", ["app-server", "--stdio"], {
		cwd,
		env: isolatedEnvironment(home),
		stdio: ["pipe", "pipe", "pipe"]
	})
	if (child.stdin === null || child.stdout === null || child.stderr === null) {
		child.kill("SIGKILL")
		throw new Error("Codex app-server did not expose all stdio streams")
	}
	const lines = createInterface({ input: child.stdout })
	const pending = new Map<number, PendingRequest>()
	let nextId = 1
	let stderr = ""
	let resolveClosed: (() => void) | undefined
	const closed = new Promise<void>((resolve) => { resolveClosed = resolve })
	const failPending = (error: Error): void => {
		for (const item of pending.values()) {
			clearTimeout(item.timeout)
			item.reject(error)
		}
		pending.clear()
	}
	child.stderr.setEncoding("utf8")
	child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_000) })
	lines.on("line", (line) => {
		try {
			const input: unknown = JSON.parse(line)
			const frame = Schema.decodeUnknownSync(AppServerFrame)(input)
			if (typeof frame.id !== "number") return
			const item = pending.get(frame.id)
			if (item === undefined) return
			pending.delete(frame.id)
			clearTimeout(item.timeout)
			if (frame.error !== undefined) item.reject(new Error(`Codex app-server ${JSON.stringify(frame.error)}`))
			else item.resolve(frame)
		} catch (cause) {
			failPending(new NativeProbeFailed({ operation: "decode Codex app-server frame", cause }))
		}
	})
	child.once("close", (code, signal) => {
		lines.close()
		failPending(new Error(`Codex app-server exited with ${String(code)} (${String(signal)}): ${stderr}`))
		resolveClosed?.()
	})
	child.once("error", (error) => failPending(error))

	const send = (frame: unknown): void => {
		child.stdin.write(`${JSON.stringify(frame)}\n`)
	}

	return {
		request: (method, params) => new Promise((resolve, reject) => {
			const id = nextId
			nextId += 1
			const timeout = setTimeout(() => {
				pending.delete(id)
				reject(new Error(`Codex app-server request ${method} timed out: ${stderr}`))
			}, 30_000)
			pending.set(id, {
				resolve: (frame) => resolve(frame.result),
				reject,
				timeout
			})
			try {
				send({ jsonrpc: "2.0", id, method, params })
			} catch (cause) {
				pending.delete(id)
				clearTimeout(timeout)
				reject(cause instanceof Error ? cause : new Error(String(cause)))
			}
		}),
		notify: (method, params) => send({ jsonrpc: "2.0", method, params }),
		stop: async () => {
			if (child.exitCode !== null || child.signalCode !== null) {
				await closed
				return
			}
			child.kill("SIGTERM")
			let timeout: ReturnType<typeof setTimeout> | undefined
			const stopped = await Promise.race([
				closed.then(() => true),
				new Promise<boolean>((resolve) => { timeout = setTimeout(() => resolve(false), 1_500) })
			])
			if (timeout !== undefined) clearTimeout(timeout)
			if (!stopped) {
				child.kill("SIGKILL")
				await closed
			}
		}
	}
}

const requestEffect = (client: AppServerClient, method: string, params: unknown) =>
	Effect.tryPromise({
		try: () => client.request(method, params),
		catch: operationFailure(`Codex app-server ${method}`)
	})

const takeReadyPlan = (planning: Planning) => Match.value(planning).pipe(
	Match.discriminatorsExhaustive("type")({
		ready: (plan) => Effect.succeed(plan),
		repair_ready: () => Effect.fail(new NativeProbeFailed({ operation: "plan native installation", cause: new Error("Fresh native destination unexpectedly planned repair") })),
		unchanged: () => Effect.fail(new NativeProbeFailed({ operation: "plan native installation", cause: new Error("Fresh native destination unexpectedly reported unchanged") })),
		blocked: (plan) => Effect.fail(new NativeProbeFailed({ operation: "plan native installation", cause: new Error(`Native destination is blocked: ${plan.reason}`) })),
		pending: () => Effect.fail(new NativeProbeFailed({ operation: "plan native installation", cause: new Error("Fresh native destination unexpectedly has a pending plan") }))
	})
)

const takeInstalledReceipt = (outcome: ApplyOutcome) => Match.value(outcome).pipe(
	Match.discriminatorsExhaustive("type")({
		uncertain: () => Effect.fail(new NativeProbeFailed({ operation: "apply native installation", cause: new Error("Native installation returned an uncertain outcome") })),
		completed: (completion) => Match.value(completion.result).pipe(Match.discriminatorsExhaustive("type")({
			installed: (result) => Effect.succeed(result.receipt),
			removed: () => Effect.fail(new NativeProbeFailed({ operation: "apply native installation", cause: new Error("Native installation completed as a removal") })),
			not_applied: () => Effect.fail(new NativeProbeFailed({ operation: "apply native installation", cause: new Error("Native installation completed without applying the change") }))
		}))
	})
)

type NativeCheck = {
	readonly host: NativeHost
	readonly home: string
	readonly root: string
	readonly pluginId: string
	readonly skillName: string
	readonly assetText: string
	readonly fixture: McpFixture
}

const verifyClaudeDiscovery = (input: NativeCheck) => Effect.gen(function*() {
	const listed = yield* runClaudeEffect(["plugin", "list", "--json"], input.home, input.root)
	const plugins = yield* Schema.decodeUnknownEffect(PluginList)(yield* decodeJson(listed))
	const installed = plugins.find((entry) => entry.id.startsWith(`${input.pluginId}@pluginsdk-`))
	if (installed === undefined) return yield* new NativeProbeFailed({ operation: "discover Claude plugin", cause: new Error(`Claude Code did not list the installed plugin: ${listed}`) })
	expect(installed.scope).toBe("user")
	expect(installed.enabled).toBe(true)
	const details = yield* runClaudeEffect(["plugin", "details", installed.id], input.home, input.root)
	expect(details).toContain(input.skillName)
	const installedAsset = yield* Effect.tryPromise({
		try: () => readFile(join(installed.installPath, "skills", input.skillName, "reference.md"), "utf8"),
		catch: operationFailure("read Claude installed skill support asset")
	})
	expect(installedAsset).toBe(input.assetText)

	const mcpDetails = yield* runClaudeEffect(["mcp", "get", `plugin:${input.pluginId}:probe`], input.home, input.root)
	expect(mcpDetails).toContain("Connected")
	expect(input.fixture.events()).toContain("initialize")
	expect(input.fixture.events()).toContain("tools/list")
	expect(input.fixture.toolCalls()).toEqual([])
})

const verifyCodexDiscovery = (input: NativeCheck) => Effect.gen(function*() {
	const appServer = yield* Effect.acquireRelease(
		Effect.sync(() => startCodexAppServer(input.home, input.root)),
		(client) => Effect.promise(() => client.stop())
	)
	const initialize = yield* requestEffect(appServer, "initialize", {
		clientInfo: { name: "pluginsdk-native-acceptance", title: "Plugin SDK native acceptance", version: "1.0.0" },
		capabilities: null
	})
	yield* Schema.decodeUnknownEffect(Schema.Struct({ userAgent: Schema.String }))(initialize)
	appServer.notify("initialized", {})

	const skillInventory = yield* Schema.decodeUnknownEffect(SkillsResponse)(yield* requestEffect(appServer, "skills/list", {
		cwds: [input.root],
		forceReload: true
	}))
	const discoveredSkill = skillInventory.data.flatMap((entry) => entry.skills).find((entry) =>
		entry.name.endsWith(`:${input.skillName}`) && entry.pluginId?.startsWith(`${input.pluginId}@pluginsdk-`)
	)
	if (discoveredSkill === undefined) return yield* new NativeProbeFailed({ operation: "discover Codex skill", cause: new Error(`Codex app-server did not discover ${input.pluginId}:${input.skillName}`) })
	expect(discoveredSkill.enabled).toBe(true)
	const codexAsset = yield* Effect.tryPromise({
		try: () => readFile(join(dirname(discoveredSkill.path), "reference.md"), "utf8"),
		catch: operationFailure("read Codex installed skill support asset")
	})
	expect(codexAsset).toBe(input.assetText)

	const thread = yield* Schema.decodeUnknownEffect(ThreadStartResponse)(yield* requestEffect(appServer, "thread/start", {
		cwd: input.root,
		ephemeral: true
	}))
	const mcpStatus = yield* Schema.decodeUnknownEffect(McpStatusResponse)(yield* requestEffect(appServer, "mcpServerStatus/list", {
		detail: "full",
		threadId: thread.thread.id,
		serverName: "probe"
	}))
	const server = mcpStatus.data.find((entry) => entry.name === "probe")
	if (server === undefined) return yield* new NativeProbeFailed({ operation: "discover Codex MCP server", cause: new Error("Codex app-server did not discover the installed loopback MCP server") })
	expect(server.pluginId).toContain(`${input.pluginId}@pluginsdk-`)
	expect(server.serverInfo?.name).toBe("pluginsdk-loopback-mcp")
	expect(server.toolsError).toBeNull()
	expect(server.tools).toHaveProperty("fixture_echo")

	const toolCall = yield* Schema.decodeUnknownEffect(ToolCallResponse)(yield* requestEffect(appServer, "mcpServer/tool/call", {
		threadId: thread.thread.id,
		server: "probe",
		tool: "fixture_echo",
		arguments: { value: "codex-app-server-native-call" }
	}))
	expect(toolCall.isError ?? false).toBe(false)
	expect(toolCall.content.some((content) => content.text === "loopback:codex-app-server-native-call")).toBe(true)
	expect(input.fixture.events()).toContain("initialize")
	expect(input.fixture.events()).toContain("tools/list")
	expect(input.fixture.events()).toContain("tools/call")
	expect(input.fixture.toolCalls()).toEqual(["codex-app-server-native-call"])
})

const verifyNativeDiscovery = (input: NativeCheck) => Match.value(input.host).pipe(
	Match.when("claude_code", () => verifyClaudeDiscovery(input)),
	Match.when("codex", () => verifyCodexDiscovery(input)),
	Match.exhaustive
)

const registerNativeDiscovery = (host: NativeHost): void => {
	it.effect(`${host} discovers an SDK-installed skill, asset, and loopback MCP server`, () =>
		Effect.gen(function*() {
			yield* preserveEnvironment
			const fs = yield* FileSystem.FileSystem
			const root = yield* fs.makeTempDirectoryScoped({ prefix: `pluginsdk-native-${host}-` })
			const source = join(root, "source")
			const home = join(root, "native-home")
			const skillName = "native-discovery"
			const assetText = `native-support-asset-for-${host}\n`
			yield* fs.makeDirectory(join(source, "skills", skillName), { recursive: true })
			yield* fs.makeDirectory(home, { recursive: true })
			yield* Match.value(host).pipe(
				Match.when("claude_code", () => Effect.void),
				Match.when("codex", () => fs.makeDirectory(join(home, "bin"), { recursive: true })),
				Match.exhaustive
			)
			yield* fs.writeFileString(join(source, "skills", skillName, "SKILL.md"), [
				"---",
				`name: ${skillName}`,
				"description: Verify native skill discovery and its packaged reference asset.",
				"---",
				`# ${skillName}`,
				"",
				"Read `reference.md` when this skill is used.",
				""
			].join("\n"))
			yield* fs.writeFileString(join(source, "skills", skillName, "reference.md"), assetText)

			const fixture = yield* Effect.acquireRelease(
				Effect.tryPromise({
					try: startMcpFixture,
					catch: operationFailure("start loopback MCP fixture")
				}),
				(value) => Effect.promise(() => value.close())
			)
			const pluginId = pluginIdFor(host)
			const plugin = {
				id: pluginId,
				version: "1.0.0",
				description: "Isolated native process discovery acceptance fixture",
				skills: [`skills/${skillName}`],
				mcp: { probe: { url: fixture.url, headers: {} } }
			}
			const request = yield* Schema.decodeEffect(BuildRequest)({
				root: source,
				format: destinationFormat(host),
				plugin
			})
			const bundle = yield* Compiler.use((compiler) => compiler.build(request))
			const destination = yield* Schema.decodeEffect(Destination)({ type: "user", host, home })
			const installer = yield* Installer
			const planning = yield* installer.plan({ destination, intent: { type: "present", bundle } })
			const plan = yield* takeReadyPlan(planning)
			const receipt = yield* takeInstalledReceipt(yield* installer.apply(plan))
			expect(receipt.identity.bundle).toBe(bundle.digest)
			yield* verifyNativeDiscovery({ host, home, root, pluginId, skillName, assetText, fixture })
		}).pipe(Effect.provide(PluginSdkTestLive))
	)
}

registerNativeDiscovery("claude_code")
registerNativeDiscovery("codex")

const bundledStdioArguments: ReadonlyArray<string> = [
  "",
  "apostrophe ' inside",
  "line one\nline two",
  "Unicode Ω/雪/☃",
  "${SAFE_OTHER}",
  "literal-${SAFE_OTHER}",
  "space\tand tab",
  "double \" quotes",
  "backslash \\ value",
  "argument-10"
]

const bundledStdioFormat = (host: NativeHost): Format => Match.value(host).pipe(
  Match.when("claude_code", (): Format => "claude_code_v3"),
  Match.when("codex", (): Format => "agent_plugins_v3"),
  Match.exhaustive
)

const bundledStdioShutdownSignal = (host: NativeHost): ProbeSignal["signal"] => Match.value(host).pipe(
  Match.when("claude_code", (): ProbeSignal["signal"] => "SIGINT"),
  Match.when("codex", (): ProbeSignal["signal"] => "SIGTERM"),
  Match.exhaustive
)

const bundledStdioEnvironment = (version: string, logPath: string) => ({
  OPTIND: "chosen-value",
  EMPTY: "",
  IFS: "ifs ' value\n${SAFE_OTHER}",
  PWD: "pwd marker ${SAFE_OTHER}",
  _: "underscore ' Ω",
  SAFE_MARKER: "safe-marker ${SAFE_OTHER}\n'雪",
  PROBE_LOG: logPath,
  PROBE_VERSION: version
})

const bundledStdioProbeSource = (logPath: string): string => [
  'import { appendFileSync } from "node:fs"',
  "",
  `const logPath = ${JSON.stringify(logPath)}`,
  'const selectedNames = ["OPTIND", "EMPTY", "IFS", "PWD", "_", "SAFE_MARKER", "PROBE_LOG", "PROBE_VERSION"]',
  'const version = process.env.PROBE_VERSION',
  'const record = (event) => appendFileSync(logPath, `${JSON.stringify(event)}\\n`, "utf8")',
  'const selectedEnv = Object.fromEntries(selectedNames.map((name) => [name, process.env[name]]))',
  'record({ type: "startup", pid: process.pid, version, argv: process.argv.slice(2), cwd: process.cwd(), selectedEnv, internalKeys: Object.keys(process.env).filter((name) => /^(?:PSDK_|SPSDK_)/.test(name)) })',
  "let buffered = \"\"",
  'process.stdin.setEncoding("utf8")',
  'process.stdin.on("data", (chunk) => {',
  "  buffered += chunk",
  '  for (let newline = buffered.indexOf("\\n"); newline >= 0; newline = buffered.indexOf("\\n")) {',
  "    const line = buffered.slice(0, newline)",
  "    buffered = buffered.slice(newline + 1)",
  "    try {",
  "      const frame = JSON.parse(line)",
  '      if (typeof frame?.method === "string") record({ type: "rpc", pid: process.pid, version, method: frame.method })',
  "    } catch {}",
  "  }",
  "})",
  'process.stdin.pause()',
  'for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { record({ type: "signal", pid: process.pid, version, signal }); process.exit(0) })',
  'await import("./echo.mjs")',
  ""
].join("\n")

const readOptionalProbeLog = (path: string) => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  if (!(yield* fs.exists(path))) return null
  return yield* fs.readFileString(path)
})

const readProbeEvents = (path: string) => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const raw = yield* fs.readFileString(path)
  const lines = raw.split("\n").filter((line) => line.length > 0)
  return yield* Effect.forEach(lines, (line) => Effect.gen(function*() {
    const value = yield* decodeJson(line)
    return yield* Schema.decodeUnknownEffect(ProbeEvent)(value)
  }))
})

type ProbeStartup = Extract<ProbeEvent, { readonly type: "startup" }>
type ProbeRpc = Extract<ProbeEvent, { readonly type: "rpc" }>
type ProbeSignal = Extract<ProbeEvent, { readonly type: "signal" }>

const traceForVersion = (events: ReadonlyArray<ProbeEvent>, version: string) => {
  const startups: ProbeStartup[] = []
  const rpcs: ProbeRpc[] = []
  const signals: ProbeSignal[] = []
  for (const event of events) {
    if (event.version !== version) continue
    Match.value(event).pipe(Match.discriminatorsExhaustive("type")({
      startup: (event) => { startups.push(event) },
      rpc: (event) => { rpcs.push(event) },
      signal: (event) => { signals.push(event) }
    }))
  }
  return { startups, rpcs, signals }
}

const pathIsWithin = (root: string, candidate: string): boolean => {
  const fromRoot = relative(root, candidate)
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith("../") && !isAbsolute(fromRoot))
}

const assertBundledStdioEvents = (
  events: ReadonlyArray<ProbeEvent>,
  host: NativeHost,
  version: string,
  packageRoot: string,
  sourceRoot: string,
  logPath: string
) => {
  const { startups, rpcs: rpcEvents, signals } = traceForVersion(events, version)
  const expectedEnvironment = bundledStdioEnvironment(version, logPath)
  const expectedCwd = join(packageRoot, "server", "work")
  const expectedSignal = bundledStdioShutdownSignal(host)
  const rpcMethods = rpcEvents.map((event) => event.method)

  expect(isAbsolute(logPath)).toBe(true)
  expect(pathIsWithin(sourceRoot, logPath)).toBe(false)
  expect(pathIsWithin(packageRoot, logPath)).toBe(false)
  expect(startups.length).toBeGreaterThan(0)
  expect(new Set(startups.map((event) => event.pid)).size).toBe(startups.length)
  for (const event of startups) {
    expect(event.pid).toBeGreaterThan(1)
    expect(event.version).toBe(version)
    expect(event.argv).toEqual(bundledStdioArguments)
    expect(event.cwd).toBe(expectedCwd)
    expect(event.selectedEnv).toEqual(expectedEnvironment)
    expect(event.internalKeys).toEqual([])
    const processMethods = rpcEvents.filter((rpc) => rpc.pid === event.pid).map((rpc) => rpc.method)
    expect(processMethods).toContain("initialize")
    expect(processMethods).toContain("notifications/initialized")
    expect(processMethods).toContain("tools/list")
    const stopped = signals.filter((signal) => signal.pid === event.pid)
    expect(stopped).toHaveLength(1)
    expect(stopped[0]?.signal).toBe(expectedSignal)
  }
  expect(signals).toHaveLength(startups.length)
  Match.value(host).pipe(
    Match.when("claude_code", () => expect(rpcMethods).not.toContain("tools/call")),
    Match.when("codex", () => expect(rpcMethods).toContain("tools/call")),
    Match.exhaustive
  )
}

const waitForBundledStdioProcessesToStop = (path: string, version: string) => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const events = yield* readProbeEvents(path)
    const pids = traceForVersion(events, version).startups.map((event) => event.pid)
    let allStopped = pids.length > 0
    for (const pid of pids) {
      if (yield* fs.exists(`/proc/${pid}`)) allStopped = false
    }
    if (allStopped) return
    const remaining = deadline - Date.now()
    if (remaining > 0) yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, Math.min(25, remaining))))
  }
  return yield* new NativeProbeFailed({ operation: "wait for bundled stdio shutdown", cause: new Error(`A ${version} MCP process remained alive after 2 seconds`) })
})

const bundledStdioRequest = (source: string, version: string, logPath: string, host: NativeHost) => Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const exampleText = yield* fs.readFileString(join(process.cwd(), "test", "fixtures", "plugins", "mcp", "definition.json"))
  const example = yield* Schema.decodeUnknownEffect(Plugin)(yield* decodeJson(exampleText))
  expect(example.id).toBe("organization-tools")
  expect(example.assets).toEqual(["server"])
  const app = yield* Schema.decodeUnknownEffect(StdioMcp)(example.mcp["app"])
  const encoded = yield* Schema.encodeEffect(Plugin)(example)
  const encodedApp = yield* Schema.encodeEffect(StdioMcp)(app)
  const plugin = {
    ...encoded,
    version,
    mcp: {
      ...encoded.mcp,
      app: {
        ...encodedApp,
        args: [{ file: "server/probe.mjs" }, ...bundledStdioArguments],
        cwd: "server/work",
        env: bundledStdioEnvironment(version, logPath)
      }
    }
  }
  return yield* Schema.decodeEffect(BuildRequest)({ root: source, format: bundledStdioFormat(host), plugin })
})

const bundledStdioPackageRoot = (host: NativeHost, home: string, cwd: string, version: string, pluginId: string) => Match.value(host).pipe(
  Match.when("claude_code", () => Effect.gen(function*() {
    const listed = yield* runClaudeEffect(["plugin", "list", "--json"], home, cwd)
    const plugins = yield* Schema.decodeUnknownEffect(ClaudeStdioPluginList)(yield* decodeJson(listed))
    const plugin = plugins.find((entry) => entry.id.startsWith(`${pluginId}@`))
    if (plugin === undefined) return yield* new NativeProbeFailed({ operation: "locate bundled stdio package", cause: new Error(`Claude Code did not list ${pluginId}`) })
    expect(plugin.version).toBe(version)
    expect(plugin.scope).toBe("user")
    expect(plugin.enabled).toBe(true)
    return plugin.readFromFolder
  })),
  Match.when("codex", () => Effect.gen(function*() {
    const listed = yield* runCodexEffect(["plugin", "list", "--available", "--json"], home, cwd)
    const inventory = yield* Schema.decodeUnknownEffect(CodexStdioPluginList)(yield* decodeJson(listed))
    const plugin = inventory.installed.find((entry) => entry.pluginId.startsWith(`${pluginId}@`))
    if (plugin === undefined) return yield* new NativeProbeFailed({ operation: "locate bundled stdio package", cause: new Error(`Codex did not list ${pluginId}`) })
    expect(plugin.name).toBe(pluginId)
    expect(plugin.version).toBe(version)
    expect(plugin.installed).toBe(true)
    expect(plugin.enabled).toBe(true)
    return join(home, "plugins", "cache", plugin.marketplaceName, plugin.name, plugin.version)
  })),
  Match.exhaustive
)

const verifyClaudeBundledStdio = (home: string, root: string, pluginId: string) => Effect.gen(function*() {
  const output = yield* runClaudeEffect(["mcp", "get", `plugin:${pluginId}:app`], home, root)
  expect(output).toContain("Connected")
})

const verifyCodexBundledStdio = (home: string, root: string, pluginId: string, version: string) => Effect.scoped(Effect.gen(function*() {
  const appServer = yield* Effect.acquireRelease(
    Effect.sync(() => startCodexAppServer(home, root)),
    (client) => Effect.promise(() => client.stop())
  )
  const initialize = yield* requestEffect(appServer, "initialize", {
    clientInfo: { name: "pluginsdk-bundled-stdio", title: "Plugin SDK bundled stdio acceptance", version },
    capabilities: null
  })
  yield* Schema.decodeUnknownEffect(Schema.Struct({ userAgent: Schema.String }))(initialize)
  appServer.notify("initialized", {})
  const thread = yield* Schema.decodeUnknownEffect(ThreadStartResponse)(yield* requestEffect(appServer, "thread/start", {
    cwd: root,
    ephemeral: true
  }))
  const inventory = yield* Schema.decodeUnknownEffect(McpStatusResponse)(yield* requestEffect(appServer, "mcpServerStatus/list", {
    detail: "full",
    threadId: thread.thread.id
  }))
  const server = inventory.data.find((entry) => entry.pluginId?.startsWith(`${pluginId}@`))
  if (server === undefined) return yield* new NativeProbeFailed({ operation: "discover bundled stdio MCP server", cause: new Error(`Codex app-server did not inventory ${pluginId}`) })
  expect(server.name).toBe("app")
  expect(server.toolsError).toBeNull()
  expect(server.tools).toHaveProperty("echo")
  const safeMarker = `safe-${version}`
  const toolCall = yield* Schema.decodeUnknownEffect(ToolCallResponse)(yield* requestEffect(appServer, "mcpServer/tool/call", {
    threadId: thread.thread.id,
    server: server.name,
    tool: "echo",
    arguments: { value: safeMarker }
  }))
  expect(toolCall.isError ?? false).toBe(false)
  expect(toolCall.content.some((content) => content.text === `echo:${safeMarker}`)).toBe(true)
}))

const verifyBundledStdioRuntime = (host: NativeHost, home: string, root: string, pluginId: string, version: string) => Match.value(host).pipe(
  Match.when("claude_code", () => verifyClaudeBundledStdio(home, root, pluginId)),
  Match.when("codex", () => verifyCodexBundledStdio(home, root, pluginId, version)),
  Match.exhaustive
)

const verifyBundledStdioRemoved = (host: NativeHost, home: string, root: string, pluginId: string) => Match.value(host).pipe(
  Match.when("claude_code", () => Effect.gen(function*() {
    const listed = yield* runClaudeEffect(["plugin", "list", "--json"], home, root)
    const plugins = yield* Schema.decodeUnknownEffect(ClaudeStdioPluginList)(yield* decodeJson(listed))
    expect(plugins.filter((entry) => entry.id.startsWith(`${pluginId}@`))).toEqual([])
  })),
  Match.when("codex", () => Effect.gen(function*() {
    const listed = yield* runCodexEffect(["plugin", "list", "--available", "--json"], home, root)
    const inventory = yield* Schema.decodeUnknownEffect(CodexStdioPluginList)(yield* decodeJson(listed))
    expect(inventory.installed.filter((entry) => entry.pluginId.startsWith(`${pluginId}@`))).toEqual([])
    yield* Effect.scoped(Effect.gen(function*() {
      const appServer = yield* Effect.acquireRelease(
        Effect.sync(() => startCodexAppServer(home, root)),
        (client) => Effect.promise(() => client.stop())
      )
      const initialized = yield* requestEffect(appServer, "initialize", {
        clientInfo: { name: "pluginsdk-bundled-stdio-removal", title: "Plugin SDK removal acceptance", version: "1.0.0" },
        capabilities: null
      })
      yield* Schema.decodeUnknownEffect(Schema.Struct({ userAgent: Schema.String }))(initialized)
      appServer.notify("initialized", {})
      const thread = yield* Schema.decodeUnknownEffect(ThreadStartResponse)(yield* requestEffect(appServer, "thread/start", {
        cwd: root,
        ephemeral: true
      }))
      const status = yield* Schema.decodeUnknownEffect(McpStatusResponse)(yield* requestEffect(appServer, "mcpServerStatus/list", {
        detail: "full",
        threadId: thread.thread.id
      }))
      expect(status.data.filter((entry) => entry.pluginId?.startsWith(`${pluginId}@`) || entry.name === "app")).toEqual([])
    }))
  })),
  Match.exhaustive
)

const registerBundledStdio = (host: NativeHost): void => {
  it.effect(`${host} user bundled stdio application builds, connects, updates, and removes`, () => Effect.gen(function*() {
    yield* preserveEnvironment
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: `pluginsdk-bundled-stdio-${host}-` })
    const source = join(root, "source")
    const home = join(root, "native-home")
    const logPath = join(root, `${host}-probe.jsonl`)
    const exampleRoot = join(process.cwd(), "test", "fixtures", "plugins", "mcp")
    const pluginId = PluginId.make("organization-tools")
    const destination = yield* Schema.decodeEffect(Destination)({ type: "user", host, home })
    const installer = yield* Installer

    yield* fs.makeDirectory(join(source, "server", "work"), { recursive: true })
    yield* fs.makeDirectory(home, { recursive: true })
    yield* fs.writeFile(join(source, "server", "echo.mjs"), yield* fs.readFile(join(exampleRoot, "server", "echo.mjs")))
    yield* fs.writeFileString(join(source, "server", "probe.mjs"), bundledStdioProbeSource(logPath))
    yield* fs.writeFileString(join(source, "server", "work", "captured.txt"), "captured cwd descendant\n")

    for (const version of ["1.0.0", "2.0.0"]) {
      const beforeBuild = yield* readOptionalProbeLog(logPath)
      if (version === "1.0.0") expect(beforeBuild).toBeNull()
      const request = yield* bundledStdioRequest(source, version, logPath, host)
      const bundle = yield* Compiler.use((compiler) => compiler.build(request))
      expect(bundle.format).toBe(bundledStdioFormat(host))
      expect(yield* readOptionalProbeLog(logPath)).toBe(beforeBuild)

      const ready = yield* takeReadyPlan(yield* installer.plan({ destination, intent: { type: "present", bundle } }))
      expect(yield* readOptionalProbeLog(logPath)).toBe(beforeBuild)
      const installed = yield* installer.apply(ready)
      const receipt = yield* takeInstalledReceipt(installed)
      expect(receipt.identity.bundle).toBe(bundle.digest)
      expect(yield* installer.apply(ready)).toEqual(installed)
      expect(yield* readOptionalProbeLog(logPath)).toBe(beforeBuild)
      expect((yield* installer.plan({ destination, intent: { type: "present", bundle } })).type).toBe("unchanged")
      expect(yield* readOptionalProbeLog(logPath)).toBe(beforeBuild)

      const packageRoot = yield* bundledStdioPackageRoot(host, home, root, version, pluginId)
      expect(yield* fs.exists(join(packageRoot, "server", "echo.mjs"))).toBe(true)
      expect(yield* fs.exists(join(packageRoot, "server", "probe.mjs"))).toBe(true)
      yield* verifyBundledStdioRuntime(host, home, root, pluginId, version)
      yield* waitForBundledStdioProcessesToStop(logPath, version)
      const events = yield* readProbeEvents(logPath)
      assertBundledStdioEvents(events, host, version, packageRoot, source, logPath)
    }

    const beforeRemoval = yield* fs.readFileString(logPath)
    const removalPlan = yield* takeReadyPlan(yield* installer.plan({ destination, intent: { type: "absent", plugin: pluginId } }))
    const removal = yield* installer.apply(removalPlan)
    expect(removal).toEqual({ type: "completed", result: { type: "removed" } })
    yield* verifyBundledStdioRemoved(host, home, root, pluginId)
    expect(yield* fs.readFileString(logPath)).toBe(beforeRemoval)
    expect((yield* installer.plan({ destination, intent: { type: "absent", plugin: pluginId } })).type).toBe("unchanged")
  }).pipe(Effect.provide(PluginSdkTestLive)))
}

registerBundledStdio("claude_code")
registerBundledStdio("codex")
