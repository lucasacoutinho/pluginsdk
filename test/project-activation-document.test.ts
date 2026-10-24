import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import { parse as parseToml } from "smol-toml"
import * as ProjectActivation from "../contracts/ProjectActivation.ts"
import * as ProjectConfig from "../contracts/ProjectConfig.ts"
import * as ProjectDocument from "../src/installer/project/config/document.ts"

const key = ProjectConfig.BlockKey.make("c".repeat(64))

function registration(plugin: string, marketplace: string, root: string): ProjectDocument.Registration {
  return Schema.decodeSync(ProjectDocument.Registration)({ plugin, marketplace, root })
}

function binding(name: string, configFile: string): ProjectActivation.Binding {
  return Schema.decodeSync(ProjectActivation.Binding)({ name, configFile })
}

function activation(
  native: ProjectDocument.Registration,
  agents: ReadonlyArray<ProjectActivation.Binding> = []
): ProjectActivation.Activation {
  return Schema.decodeSync(ProjectActivation.Activation)({ registration: native, agents })
}

function readyText(result: ProjectDocument.DocumentResult): string {
  return Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
    ready: ({ text }) => text,
    blocked: ({ reason }) => { throw new Error(`Expected a ready document, received ${reason}`) }
  }))
}

function reason(result: ProjectDocument.DocumentResult): ProjectDocument.DocumentReason | undefined {
  return Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
    ready: () => undefined,
    blocked: ({ reason: blockedReason }) => blockedReason
  }))
}

it("stores plugin, marketplace, and agent bindings in one canonical block", () => {
  const desired = activation(
    registration("demo-plugin", "pluginsdk-666666666666666666666666", "/opt/plugins/demo"),
    [binding("reviewer", "/opt/plugins/demo/agents/reviewer.md"), binding("writer", "/opt/plugins/demo/agents/writer.md")]
  )
  const block = ProjectDocument.renderProjectBlock(key, desired)
  expect(block).toBe(
    `\n# pluginsdk:${key}:begin\n` +
      `[plugins."demo-plugin@pluginsdk-666666666666666666666666"]\n` +
      `enabled = true\n` +
      `[marketplaces."pluginsdk-666666666666666666666666"]\n` +
      `source_type = "local"\n` +
      `source = "/opt/plugins/demo"\n` +
      `[agents."reviewer"]\nconfig_file = "/opt/plugins/demo/agents/reviewer.md"\n` +
      `[agents."writer"]\nconfig_file = "/opt/plugins/demo/agents/writer.md"\n` +
      `# pluginsdk:${key}:end\n`
  )
  expect(ProjectDocument.inspectProjectDocument({ key, text: block }))
    .toEqual({ type: "present", activation: desired, block })
})

it("preserves outside bytes, agent limits, and unrelated roles across install, update, and removal", () => {
  const original = `# user config\r\ntitle = "Codex project"\r\n[agents]\r\nmax_threads = 4\r\nmax_depth = 2\r\n[agents."external-reviewer"]\r\nconfig_file = "/home/user/.codex/agents/reviewer.toml"\r\ndescription = "owned elsewhere"\r\n`
  const native = registration("demo-plugin", "pluginsdk-777777777777777777777777", "/opt/plugins/demo")
  const first = activation(native, [binding("worker", "/opt/plugins/demo/agents/worker.md")])
  const second = activation(native, [binding("worker", "/opt/plugins/demo/agents/worker-v2.md")])
  const installed = readyText(ProjectDocument.editProjectDocument({ key, text: original, previous: null, desired: first }))
  expect(installed.slice(0, original.length)).toBe(original)
  expect(parseToml(installed)).toMatchObject({
    agents: {
      max_threads: 4,
      max_depth: 2,
      "external-reviewer": {
        config_file: "/home/user/.codex/agents/reviewer.toml",
        description: "owned elsewhere"
      }
    }
  })

  const updated = readyText(ProjectDocument.editProjectDocument({ key, text: installed, previous: first, desired: second }))
  expect(updated.slice(0, original.length)).toBe(original)
  const removed = readyText(ProjectDocument.editProjectDocument({ key, text: updated, previous: second, desired: null }))
  expect(removed).toBe(original)
  expect(parseToml(removed)).toEqual(parseToml(original))
})

it("blocks drift when a previous binding is added, removed, or changed", () => {
  const worker = binding("worker", "/opt/plugins/demo/agents/worker.md")
  const previous = activation(
    registration("demo-plugin", "pluginsdk-888888888888888888888888", "/opt/plugins/demo"),
    [worker]
  )
  const block = ProjectDocument.renderProjectBlock(key, previous)
  const end = `# pluginsdk:${key}:end\n`
  const added = block.replace(end, `[agents."extra"]\nconfig_file = "/opt/plugins/demo/agents/extra.md"\n${end}`)
  const removed = block.replace(`[agents."worker"]\nconfig_file = ${JSON.stringify(worker.configFile)}\n`, "")
  const changed = block.replace(`config_file = ${JSON.stringify(worker.configFile)}`, `config_file = "/elsewhere/worker.md"`)
  for (const text of [added, removed, changed]) {
    expect(reason(ProjectDocument.editProjectDocument({ key, text, previous, desired: null }))).toBe("drift")
  }
})

it("rejects a fresh desired role that already exists with the same file path", () => {
  const desired = activation(
    registration("demo-plugin", "pluginsdk-999999999999999999999999", "/opt/plugins/demo"),
    [binding("worker", "/opt/plugins/demo/agents/worker.md")]
  )
  const existing = `[agents."worker"]\nconfig_file = "/opt/plugins/demo/agents/worker.md"\n`
  expect(reason(ProjectDocument.editProjectDocument({ key, text: existing, previous: null, desired })))
    .toBe("native_conflict")
})

it("rejects foreign agent aliases of previous and desired config files", () => {
  const native = registration("demo-plugin", "pluginsdk-aaaaaaaaaaaaaaaaaaaaaaaa", "/opt/plugins/demo")
  const previous = activation(native, [binding("worker", "/opt/plugins/demo/agents/worker.md")])
  const alias = `[agents."local-worker"]\nconfig_file = "/opt/plugins/demo/agents/worker.md"\n`
  const previousDocument = `${ProjectDocument.renderProjectBlock(key, previous)}${alias}`
  expect(reason(ProjectDocument.editProjectDocument({ key, text: previousDocument, previous, desired: null })))
    .toBe("native_conflict")

  const desired = activation(native, [binding("next-worker", "/opt/plugins/demo/agents/next-worker.md")])
  const desiredAlias = `[agents."local-next-worker"]\nconfig_file = "/opt/plugins/demo/agents/next-worker.md"\n`
  expect(reason(ProjectDocument.editProjectDocument({ key, text: desiredAlias, previous: null, desired })))
    .toBe("native_conflict")
})

it("keeps escaped marker text inside strings and rejects sealed inline TOML", () => {
  const desired = activation(registration("demo-plugin", "pluginsdk-bbbbbbbbbbbbbbbbbbbbbbbb", "/opt/plugins/demo"))
  const original = `note = "text\\n# pluginsdk:${key}:begin\\nforeign value\\n# pluginsdk:${key}:end"\n`
  const installed = readyText(ProjectDocument.editProjectDocument({ key, text: original, previous: null, desired }))
  const removed = readyText(ProjectDocument.editProjectDocument({ key, text: installed, previous: desired, desired: null }))
  expect(removed).toBe(original)
  expect(parseToml(removed)).toEqual(parseToml(original))

  expect(reason(ProjectDocument.editProjectDocument({
    key,
    text: `plugins = {}\nmarketplaces = {}\n`,
    previous: null,
    desired
  }))).toBe("invalid_config")
})

it("renders bindings in canonical order", () => {
  const native = registration("demo-plugin", "pluginsdk-cccccccccccccccccccccccc", "/opt/plugins/demo")
  const alpha = binding("alpha \"reviewer\" é", "/opt/plugins/demo/agents/alpha.md")
  const zeta = binding("zeta", "/opt/plugins/demo/agents/zeta.md")
  const unsorted = activation(native, [zeta, alpha])
  const sorted = activation(native, [alpha, zeta])
  expect(ProjectDocument.renderProjectBlock(key, unsorted)).toBe(ProjectDocument.renderProjectBlock(key, sorted))
})

it("round-trips quoted Unicode role keys and rejects extra role fields", () => {
  const native = registration("demo-plugin", "pluginsdk-cccccccccccccccccccccccc", "/opt/plugins/demo")
  const alpha = binding("alpha \"reviewer\" é", "/opt/plugins/demo/agents/alpha.md")
  const zeta = binding("zeta", "/opt/plugins/demo/agents/zeta.md")
  const sorted = activation(native, [alpha, zeta])
  const block = ProjectDocument.renderProjectBlock(key, sorted)
  expect(ProjectDocument.inspectProjectDocument({ key, text: block }))
    .toEqual({ type: "present", activation: sorted, block })
  const extraField = block.replace(
    `config_file = ${JSON.stringify(alpha.configFile)}`,
    `config_file = ${JSON.stringify(alpha.configFile)}\ndescription = "outside field"`
  )
  expect(ProjectDocument.inspectProjectDocument({ key, text: extraField }))
    .toEqual({ type: "blocked", reason: "drift" })
})
