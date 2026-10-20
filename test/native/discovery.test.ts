import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createInterface } from "node:readline"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Match, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { BuildRequest, Compiler } from "../../contracts/Compiler.ts"
import { ApplyOutcome, Destination, Installer, Planning } from "../../contracts/Installer.ts"
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

const runClaude = (args: ReadonlyArray<string>, home: string, cwd: string): Promise<string> => {
	const result = spawn("claude", [...args], {
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
			reject(new Error(`claude ${args.join(" ")} timed out`))
		}, 30_000)
		result.once("error", (error) => {
			clearTimeout(timeout)
			reject(error)
		})
		result.once("close", (code, signal) => {
			clearTimeout(timeout)
			if (code === 0) resolve(stdout)
			else reject(new Error(`claude ${args.join(" ")} exited with ${String(code)} (${String(signal)}): ${stderr}`))
		})
	})
}

const runClaudeEffect = (args: ReadonlyArray<string>, home: string, cwd: string) =>
	Effect.tryPromise({
		try: () => runClaude(args, home, cwd),
		catch: operationFailure(`claude ${args.join(" ")}`)
	})

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
