import { expect, it } from "@effect/vitest"
import { Match, Schema } from "effect"
import * as ProjectActivation from "../contracts/ProjectActivation.ts"
import * as ProjectConfig from "../contracts/ProjectConfig.ts"
import * as ProjectDocument from "../src/installer/project/config/document.ts"

const key = ProjectConfig.BlockKey.make("a".repeat(64))
const otherKey = ProjectConfig.BlockKey.make("b".repeat(64))

function registration(plugin: string, marketplace: string, root: string): ProjectDocument.Registration {
  return Schema.decodeSync(ProjectDocument.Registration)({ plugin, marketplace, root })
}

function activation(value: ProjectDocument.Registration): ProjectActivation.Activation {
  return Schema.decodeSync(ProjectActivation.Activation)({ registration: value, agents: [] })
}

const first = activation(registration("demo-plugin", "pluginsdk-111111111111111111111111", "/opt/plugins/first"))
const second = activation(registration("demo-plugin", "pluginsdk-222222222222222222222222", "/opt/plugins/second"))
const other = activation(registration("other-plugin", "pluginsdk-333333333333333333333333", "/opt/plugins/other"))

function readyText(result: ProjectDocument.DocumentResult): string {
  return Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
    ready: ({ text }) => text,
    blocked: ({ reason }) => { throw new Error(`Expected a ready document, received ${reason}`) }
  }))
}

function resultReason(result: ProjectDocument.DocumentResult): ProjectDocument.DocumentReason | undefined {
  return Match.value(result).pipe(Match.discriminatorsExhaustive("type")({
    ready: () => undefined,
    blocked: ({ reason }) => reason
  }))
}

function nativeTables(value: ProjectActivation.Activation, extraPluginField = ""): string {
  const { registration: native } = value
  return `[plugins.${JSON.stringify(`${native.plugin}@${native.marketplace}`)}]\n` +
    `enabled = true\n` +
    extraPluginField +
    `[marketplaces.${JSON.stringify(native.marketplace)}]\n` +
    `source_type = "local"\n` +
    `source = ${JSON.stringify(native.root)}\n`
}

it("creates, updates, and removes canonical registrations while retaining raw TOML bytes", () => {
  const original = `# owner's comment\r\ntitle = "café 🪿"\r\ncreated = 1979-05-27T07:32:00Z\r\n`
  expect(ProjectDocument.renderProjectBlock(key, first)).toBe(
    `\n# pluginsdk:${key}:begin\n` +
      `[plugins."demo-plugin@pluginsdk-111111111111111111111111"]\n` +
      `enabled = true\n` +
      `[marketplaces."pluginsdk-111111111111111111111111"]\n` +
      `source_type = "local"\n` +
      `source = "/opt/plugins/first"\n` +
      `# pluginsdk:${key}:end\n`
  )
  const created = readyText(ProjectDocument.editProjectDocument({
    key,
    text: original,
    previous: null,
    desired: first
  }))
  expect(created).toBe(`${original}${ProjectDocument.renderProjectBlock(key, first)}`)

  const updated = readyText(ProjectDocument.editProjectDocument({
    key,
    text: created,
    previous: first,
    desired: second
  }))
  expect(updated).toBe(`${original}${ProjectDocument.renderProjectBlock(key, second)}`)

  const removed = readyText(ProjectDocument.editProjectDocument({
    key,
    text: updated,
    previous: second,
    desired: null
  }))
  expect(removed).toBe(original)

  const withoutFinalNewline = "title = \"no ending newline\""
  expect(readyText(ProjectDocument.editProjectDocument({
    key,
    text: withoutFinalNewline,
    previous: null,
    desired: first
  }))).toBe(`${withoutFinalNewline}${ProjectDocument.renderProjectBlock(key, first)}`)
})

it("leaves an unchanged document byte-for-byte intact and keeps separate SDK keys independent", () => {
  const original = `# retained\r\nname = "é"\r\n`
  const text = `${original}${ProjectDocument.renderProjectBlock(key, first)}${ProjectDocument.renderProjectBlock(otherKey, other)}`
  const unchanged = ProjectDocument.editProjectDocument({ key, text, previous: first, desired: first })
  expect(readyText(unchanged)).toBe(text)

  const removed = ProjectDocument.editProjectDocument({ key, text, previous: first, desired: null })
  expect(readyText(removed)).toBe(`${original}${ProjectDocument.renderProjectBlock(otherKey, other)}`)
})

it("requires the exact previous block and reports duplicate, unowned, and missing ownership", () => {
  const block = ProjectDocument.renderProjectBlock(key, first)
  expect(resultReason(ProjectDocument.editProjectDocument({
    key,
    text: block + block,
    previous: first,
    desired: null
  }))).toBe("duplicate")

  expect(resultReason(ProjectDocument.editProjectDocument({
    key,
    text: block,
    previous: null,
    desired: null
  }))).toBe("unowned")

  expect(resultReason(ProjectDocument.editProjectDocument({
    key,
    text: "title = \"valid\"",
    previous: first,
    desired: null
  }))).toBe("drift")

  expect(resultReason(ProjectDocument.editProjectDocument({
    key,
    text: block.replace("source = \"/opt/plugins/first\"", "source = \"/opt/plugins/changed\""),
    previous: first,
    desired: null
  }))).toBe("drift")

  for (const changed of [block.slice(1), block.slice(0, -1), block.replace(/\n/g, "\r\n")]) {
    expect(resultReason(ProjectDocument.editProjectDocument({
      key,
      text: changed,
      previous: first,
      desired: null
    }))).toBe("drift")
  }
})

it("rejects orphan, nested, and malformed marker lines", () => {
  const begin = `# pluginsdk:${key}:begin\n`
  const end = `# pluginsdk:${key}:end\n`
  const malformed = "# pluginsdk:NOT-A-BLOCK:begin\n"
  for (const text of [end, begin + `# pluginsdk:${otherKey}:begin\n` + `# pluginsdk:${otherKey}:end\n` + end, malformed]) {
    expect(resultReason(ProjectDocument.editProjectDocument({ key, text, previous: null, desired: first })))
      .toBe("invalid_config")
  }
})

it("preserves ordinary comments that mention PluginSDK", () => {
  const text = "# pluginsdk settings are managed by the platform team\nmodel = \"sample\"\n"
  const installed = readyText(ProjectDocument.editProjectDocument({ key, text, previous: null, desired: first }))
  expect(readyText(ProjectDocument.editProjectDocument({ key, text: installed, previous: first, desired: null })))
    .toBe(text)
})

it("does not treat marker-looking lines inside a TOML multiline string as owned text", () => {
  const text = `note = """${ProjectDocument.renderProjectBlock(key, first)}"""\n`
  expect(resultReason(ProjectDocument.editProjectDocument({ key, text, previous: null, desired: first })))
    .toBe("unowned")

  const externalConfig = nativeTables(first)
  const embedded = `note = """${ProjectDocument.renderProjectBlock(key, first)}\n"""\n\n${externalConfig}`
  expect(resultReason(ProjectDocument.editProjectDocument({ key, text: embedded, previous: first, desired: null })))
    .toBe("semantic_change")
})

it("rejects unknown or changed controlled values and pre-existing native registrations", () => {
  expect(resultReason(ProjectDocument.editProjectDocument({
    key,
    text: nativeTables(first, "unexpected = true\n"),
    previous: null,
    desired: first
  }))).toBe("native_conflict")

  const changed = ProjectDocument.renderProjectBlock(key, first).replace("enabled = true", "enabled = false")
  expect(resultReason(ProjectDocument.editProjectDocument({ key, text: changed, previous: first, desired: null })))
    .toBe("drift")
})

it("rejects another plugin selector that consumes an owned marketplace", () => {
  const foreignConsumer = `[plugins.${JSON.stringify(`someone-else@${first.registration.marketplace}`)}]\nenabled = true\n`
  const text = `${ProjectDocument.renderProjectBlock(key, first)}${foreignConsumer}`
  expect(resultReason(ProjectDocument.editProjectDocument({ key, text, previous: first, desired: second })))
    .toBe("native_conflict")
})

it("quotes unusual project roots as TOML strings and inspects canonical registrations", () => {
  const quoted = activation(registration("demo-plugin", "pluginsdk-444444444444444444444444", "/tmp/π/\"quoted\"\\folder\nnext"))
  const block = ProjectDocument.renderProjectBlock(key, quoted)
  expect(block).toContain(`source = ${JSON.stringify(quoted.registration.root)}\n`)
  const text = `title = "outside"${block}`
  const inspection = ProjectDocument.inspectProjectDocument({ key, text })
  expect(inspection).toEqual({ type: "present", activation: quoted, block })
})

it("blocks sealed inline tables and malformed TOML without returning source text", () => {
  expect(resultReason(ProjectDocument.editProjectDocument({
    key,
    text: "plugins = {}\nmarketplaces = {}\n",
    previous: null,
    desired: first
  }))).toBe("invalid_config")

  expect(resultReason(ProjectDocument.editProjectDocument({
    key,
    text: "title = [\n",
    previous: null,
    desired: first
  }))).toBe("invalid_config")
})

it("uses inspection only for one canonical block and reports malformed ownership", () => {
  expect(ProjectDocument.inspectProjectDocument({ key, text: "title = \"empty\"\n" }))
    .toEqual({ type: "absent" })

  const block = ProjectDocument.renderProjectBlock(key, first)
  expect(ProjectDocument.inspectProjectDocument({ key, text: block + block }))
    .toEqual({ type: "blocked", reason: "duplicate" })
  expect(ProjectDocument.inspectProjectDocument({ key, text: block.replace("enabled = true", "enabled = false") }))
    .toEqual({ type: "blocked", reason: "drift" })

  const foreignConsumer = `[plugins.${JSON.stringify(`someone-else@${first.registration.marketplace}`)}]\nenabled = true\n`
  expect(ProjectDocument.inspectProjectDocument({ key, text: `${block}${foreignConsumer}` }))
    .toEqual({ type: "blocked", reason: "native_conflict" })
})

it("validates marketplace and root identifiers at the schema boundary", () => {
  expect(() => registration("demo-plugin", "wrong-market", "/tmp/root")).toThrow()
  expect(() => registration("demo-plugin", "pluginsdk-555555555555555555555555", "/tmp/\0root")).toThrow()
  expect(() => registration("demo-plugin", "pluginsdk-555555555555555555555555", "/tmp/\ud800root")).toThrow()
})
