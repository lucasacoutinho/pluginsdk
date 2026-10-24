import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Match, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { parse as parseToml } from "smol-toml"
import { BuildRequest, Bundle as BundleSchema, Compiler } from "../../contracts/Compiler.ts"
import {
	type ApplyOutcome as ApplyOutcomeValue,
	type Planning as PlanningValue,
	type ReadyPlan
} from "../../contracts/Installer.ts"
import { CompilerLive } from "../../src/compiler/index.ts"
import { startMcpFixture, type McpFixture } from "./mcp-fixture.ts"
import { withProjectFixture, type ProjectFixture } from "./project-fixture.ts"

const pluginSkill = "project-remote-mcp"
const compilerLayer = Layer.provideMerge(CompilerLive, NodeServices.layer)

const SkillsResponse = Schema.Struct({
	data: Schema.Array(Schema.Struct({
		cwd: Schema.String,
		skills: Schema.Array(Schema.Struct({
			name: Schema.String,
			description: Schema.String,
			path: Schema.String,
			scope: Schema.String,
			enabled: Schema.Boolean,
			pluginId: Schema.NullOr(Schema.String)
		})),
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
	content: Schema.Array(Schema.Struct({
		type: Schema.String,
		text: Schema.optionalKey(Schema.String)
	})),
	isError: Schema.optionalKey(Schema.Boolean)
})

const ProjectConfig = Schema.Struct({
	plugins: Schema.Record(Schema.String, Schema.Struct({ enabled: Schema.Boolean })),
	marketplaces: Schema.Record(Schema.String, Schema.Struct({
		source_type: Schema.Literal("local"),
		source: Schema.String
	}))
})

const requireReadyPlan = (planning: PlanningValue | null): ReadyPlan => {
	if (planning === null) throw new Error("Project CLI emitted no planning JSON")
	return Match.value(planning).pipe(Match.discriminatorsExhaustive("type")({
		ready: (plan) => plan,
		repair_ready: () => { throw new Error("Project SDK plan unexpectedly requires repair") },
		unchanged: () => { throw new Error("Project SDK plan unexpectedly reported unchanged") },
		blocked: (result) => { throw new Error(`Project SDK plan was blocked: ${result.reason}`) },
		pending: () => { throw new Error("Project SDK plan unexpectedly has a pending change") }
	}))
}

const requireInstalled = (outcome: ApplyOutcomeValue | null, digest: string): void => {
	if (outcome === null) throw new Error("Project CLI emitted no installation outcome JSON")
	Match.value(outcome).pipe(Match.discriminatorsExhaustive("type")({
		uncertain: () => { throw new Error("Project SDK installation outcome is uncertain") },
		completed: (completion) => Match.value(completion.result).pipe(Match.discriminatorsExhaustive("type")({
			installed: (result) => expect(result.receipt.identity.bundle).toBe(digest),
			removed: () => { throw new Error("Project SDK installation completed as a removal") },
			not_applied: () => { throw new Error("Project SDK installation was not applied") }
		}))
	}))
}

const requireRemoved = (outcome: ApplyOutcomeValue | null): void => {
	if (outcome === null) throw new Error("Project CLI emitted no removal outcome JSON")
	Match.value(outcome).pipe(Match.discriminatorsExhaustive("type")({
		uncertain: () => { throw new Error("Project SDK removal outcome is uncertain") },
		completed: (completion) => Match.value(completion.result).pipe(Match.discriminatorsExhaustive("type")({
			installed: () => { throw new Error("Project SDK removal completed as an installation") },
			removed: () => undefined,
			not_applied: () => { throw new Error("Project SDK removal was not applied") }
		}))
	}))
}

const buildRemoteMcpBundle = async (
	fixture: ProjectFixture,
	mcp: McpFixture
): Promise<{ readonly bundlePath: string; readonly digest: string }> => {
	const sourceRoot = join(fixture.source, "remote-http-plugin")
	const skillRoot = join(sourceRoot, "skills", pluginSkill)
	await mkdir(skillRoot, { recursive: true })
	await writeFile(join(skillRoot, "SKILL.md"), [
		"---",
		`name: ${pluginSkill}`,
		"description: Verify project scoped remote MCP loading.",
		"---",
		`# ${pluginSkill}`,
		"",
		"Use the project scoped loopback MCP server for this acceptance probe.",
		""
	].join("\n"))

  const request = Schema.decodeSync(BuildRequest)({
		root: sourceRoot,
		format: "codex",
		plugin: {
			id: fixture.pluginId,
			version: "1.0.0",
			description: "Project scoped remote HTTP MCP acceptance fixture.",
			skills: [`skills/${pluginSkill}`],
      mcp: { probe: { url: mcp.url, headers: {} } }
		}
	})
	const bundle = await Effect.runPromise(Compiler.use((compiler) => compiler.build(request)).pipe(
		Effect.provide(compilerLayer)
	))
	const bundlePath = join(fixture.source, "remote-http-plugin.bundle.json")
	await writeFile(bundlePath, JSON.stringify(Schema.encodeSync(BundleSchema)(bundle)))
	expect(bundle.format).toBe("codex")
	expect(bundle.plugin).toBe(fixture.pluginId)
	return { bundlePath, digest: bundle.digest }
}

const expectedProjectPluginId = async (projectConfig: string, pluginId: string): Promise<string> => {
	const document = Schema.decodeUnknownSync(ProjectConfig)(parseToml(await readFile(projectConfig, "utf8")))
	const enabled = Object.entries(document.plugins).filter(([, config]) => config.enabled)
	if (enabled.length !== 1) throw new Error(`Expected one enabled SDK plugin in project config, found ${enabled.length}`)
	const selector = enabled[0]?.[0]
	const marketplaces = Object.keys(document.marketplaces)
	if (selector === undefined || marketplaces.length !== 1 || selector !== `${pluginId}@${marketplaces[0]}`) {
		throw new Error("Project plugin selector does not match its single local marketplace")
	}
	return selector
}

const assertUserConfigUnchanged = async (path: string, before: Buffer): Promise<void> => {
	const after = await readFile(path)
	expect(after.equals(before)).toBe(true)
}

const expectNoProbe = (status: typeof McpStatusResponse.Type): void => {
	expect(status.data.filter((server) => server.name === "probe")).toEqual([])
}

it("Codex project MCP activates only in its project and removes from a fresh session", async () =>
	withProjectFixture(async (fixture) => {
		const userConfigBefore = await readFile(fixture.userConfig)
		const mcp = await startMcpFixture()
		try {
			const { bundlePath, digest } = await buildRemoteMcpBundle(fixture, mcp)
			const installation = await fixture.plan(bundlePath, fixture.projectA, fixture.home)
			expect(installation.result.code).toBe(0)
			requireReadyPlan(installation.planning)
			const applied = await fixture.apply(installation.path)
			expect(applied.result.code).toBe(0)
			requireInstalled(applied.outcome, digest)

			const pluginId = await expectedProjectPluginId(fixture.projectConfig, String(fixture.pluginId))
			await fixture.withServer(fixture.projectA, async (server) => {
				const skills = Schema.decodeUnknownSync(SkillsResponse)(await server.request("skills/list", {
					cwds: [fixture.projectA],
					forceReload: true
				}))
				const projectSkillEntry = skills.data.flatMap((entry) => entry.skills).find((entry) =>
          entry.name.endsWith(`:${pluginSkill}`) && entry.enabled && entry.pluginId === pluginId
				)
				expect(projectSkillEntry).toBeDefined()

				const thread = Schema.decodeUnknownSync(ThreadStartResponse)(await server.request("thread/start", {
					cwd: fixture.projectA,
					ephemeral: true
				}))
				const status = Schema.decodeUnknownSync(McpStatusResponse)(await server.request("mcpServerStatus/list", {
					detail: "full",
					threadId: thread.thread.id,
					serverName: "probe"
				}))
				expect(status.data).toHaveLength(1)
				const probe = status.data[0]
				if (probe === undefined) throw new Error("Codex omitted the project MCP status entry")
				expect(probe.pluginId).toBe(pluginId)
				expect(probe.serverInfo).toEqual({ name: "pluginsdk-loopback-mcp", version: "1.0.0" })
				expect(probe.toolsError).toBeNull()
				expect(probe.tools).toHaveProperty("fixture_echo")

				const call = Schema.decodeUnknownSync(ToolCallResponse)(await server.request("mcpServer/tool/call", {
					threadId: thread.thread.id,
					server: "probe",
					tool: "fixture_echo",
					arguments: { value: "project-a-remote-http" }
				}))
				expect(call.isError ?? false).toBe(false)
				expect(call.content.some((part) => part.text === "loopback:project-a-remote-http")).toBe(true)
			})
			expect(mcp.events()).toContain("initialize")
			expect(mcp.events()).toContain("tools/list")
			expect(mcp.events()).toContain("tools/call")
			expect(mcp.toolCalls()).toEqual(["project-a-remote-http"])
			await assertUserConfigUnchanged(fixture.userConfig, userConfigBefore)

			await fixture.withServer(fixture.projectB, async (server) => {
				const skills = Schema.decodeUnknownSync(SkillsResponse)(await server.request("skills/list", {
					cwds: [fixture.projectB],
					forceReload: true
				}))
				expect(skills.data.flatMap((entry) => entry.skills).some((entry) => entry.pluginId === pluginId)).toBe(false)
				const thread = Schema.decodeUnknownSync(ThreadStartResponse)(await server.request("thread/start", {
					cwd: fixture.projectB,
					ephemeral: true
				}))
				const status = Schema.decodeUnknownSync(McpStatusResponse)(await server.request("mcpServerStatus/list", {
					detail: "full",
					threadId: thread.thread.id,
					serverName: "probe"
				}))
				expectNoProbe(status)
			})
			expect(mcp.toolCalls()).toEqual(["project-a-remote-http"])
			await assertUserConfigUnchanged(fixture.userConfig, userConfigBefore)

			const removal = await fixture.plan(null, fixture.projectA, fixture.home)
			expect(removal.result.code).toBe(0)
			requireReadyPlan(removal.planning)
			const removed = await fixture.apply(removal.path)
			expect(removed.result.code).toBe(0)
			requireRemoved(removed.outcome)

			await fixture.withServer(fixture.projectA, async (server) => {
				const skills = Schema.decodeUnknownSync(SkillsResponse)(await server.request("skills/list", {
					cwds: [fixture.projectA],
					forceReload: true
				}))
				expect(skills.data.flatMap((entry) => entry.skills).some((entry) => entry.pluginId === pluginId)).toBe(false)
				const thread = Schema.decodeUnknownSync(ThreadStartResponse)(await server.request("thread/start", {
					cwd: fixture.projectA,
					ephemeral: true
				}))
				const status = Schema.decodeUnknownSync(McpStatusResponse)(await server.request("mcpServerStatus/list", {
					detail: "full",
					threadId: thread.thread.id,
					serverName: "probe"
				}))
				expectNoProbe(status)
			})
			expect(mcp.toolCalls()).toEqual(["project-a-remote-http"])
			await assertUserConfigUnchanged(fixture.userConfig, userConfigBefore)
		} finally {
			await mcp.close()
		}
	})
)
