import { isDeepStrictEqual } from "node:util"
import { Match, Schema } from "effect"
import { parse as parseToml, type TomlTable, type TomlValue } from "smol-toml"
import { BlockKey as BlockKeySchema, Registration } from "../../../../contracts/ProjectConfig.ts"
import type { BlockKey, Segment } from "../../../../contracts/ProjectConfig.ts"
import { Activation, Binding } from "../../../../contracts/ProjectActivation.ts"
import { compareUtf8 } from "../../../internal/paths.ts"
import { editProjectConfig } from "./model.ts"

export { Registration, MarketplaceName } from "../../../../contracts/ProjectConfig.ts"
export type { BlockKey } from "../../../../contracts/ProjectConfig.ts"

export const DocumentInput = Schema.Struct({
  key: BlockKeySchema,
  text: Schema.String,
  previous: Schema.NullOr(Activation),
  desired: Schema.NullOr(Activation)
})
export type DocumentInput = typeof DocumentInput.Type

export const DocumentReason = Schema.Literals([
  "duplicate",
  "unowned",
  "drift",
  "invalid_config",
  "native_conflict",
  "semantic_change"
])
export type DocumentReason = typeof DocumentReason.Type

export const DocumentResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready"), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: DocumentReason })
]).pipe(Schema.toTaggedUnion("type"))
export type DocumentResult = typeof DocumentResult.Type

export const InspectionInput = Schema.Struct({ key: BlockKeySchema, text: Schema.String })
export type InspectionInput = typeof InspectionInput.Type

export const InspectionResult = Schema.Union([
  Schema.Struct({ type: Schema.Literal("absent") }),
  Schema.Struct({ type: Schema.Literal("present"), activation: Activation, block: Schema.String }),
  Schema.Struct({ type: Schema.Literal("blocked"), reason: DocumentReason })
]).pipe(Schema.toTaggedUnion("type"))
export type InspectionResult = typeof InspectionResult.Type

type Marker =
  | { readonly type: "begin", readonly key: BlockKey }
  | { readonly type: "end", readonly key: BlockKey }

type OpenBlock = { readonly key: BlockKey, readonly start: number }

const decode = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, input: unknown): S["Type"] =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(input)

const blocked = (reason: DocumentReason): DocumentResult => ({ type: "blocked", reason })
const inspectBlocked = (reason: DocumentReason): InspectionResult => ({ type: "blocked", reason })

const selectorFor = (registration: Registration): string => `${registration.plugin}@${registration.marketplace}`

export function renderProjectBlock(key: BlockKey, activation: Activation): string {
  const { registration, agents } = activation
  return `\n# pluginsdk:${key}:begin\n` +
    `[plugins.${JSON.stringify(selectorFor(registration))}]\n` +
    `enabled = true\n` +
    `[marketplaces.${JSON.stringify(registration.marketplace)}]\n` +
    `source_type = "local"\n` +
    `source = ${JSON.stringify(registration.root)}\n` +
    agents.toSorted((left, right) => compareUtf8(left.name, right.name))
      .map(({ name, configFile }) => `[agents.${JSON.stringify(name)}]\nconfig_file = ${JSON.stringify(configFile)}\n`).join("") +
    `# pluginsdk:${key}:end\n`
}

function parseDocument(text: string): TomlTable | undefined {
  if (!text.isWellFormed()) return undefined
  try {
    return parseToml(text, {
      integersAsBigInt: "asNeeded",
      useLegacyDate: true
    })
  } catch {
    return undefined
  }
}

function markerFromLine(line: string): Marker | null | undefined {
  if (!line.trimStart().startsWith("# pluginsdk:")) return undefined
  const match = /^# pluginsdk:([a-f0-9]{64}):(begin|end)$/.exec(line)
  if (match === null) return null
  const rawKey = match[1]
  const kind = match[2]
  if (rawKey === undefined || kind === undefined) return null
  const key = decode(BlockKeySchema, rawKey)
  if (kind === "begin") return { type: "begin", key }
  if (kind === "end") return { type: "end", key }
  return null
}

function priorLineEndingStart(text: string, lineStart: number): number | undefined {
  if (lineStart === 0 || text.charCodeAt(lineStart - 1) !== 10) return undefined
  return lineStart > 1 && text.charCodeAt(lineStart - 2) === 13 ? lineStart - 2 : lineStart - 1
}

function tokenize(text: string): ReadonlyArray<Segment> | undefined {
  const segments: Array<Segment> = []
  let cursor = 0
  let open: OpenBlock | undefined

  for (let lineStart = 0; lineStart < text.length;) {
    const newline = text.indexOf("\n", lineStart)
    const lineEnd = newline < 0 ? text.length : newline + 1
    let contentEnd = newline < 0 ? text.length : newline
    if (contentEnd > lineStart && text.charCodeAt(contentEnd - 1) === 13) contentEnd -= 1
    const marker = markerFromLine(text.slice(lineStart, contentEnd))

    if (marker === null) return undefined
    if (marker !== undefined) {
      const accepted = Match.value(marker).pipe(Match.discriminatorsExhaustive("type")({
        begin: ({ key }) => {
          if (open !== undefined) return false
          const precedingEnding = priorLineEndingStart(text, lineStart)
          const start = precedingEnding !== undefined && precedingEnding >= cursor ? precedingEnding : lineStart
          if (start < cursor) return false
          if (cursor < start) segments.push({ type: "external", content: text.slice(cursor, start) })
          open = { key, start }
          return true
        },
        end: ({ key }) => {
          if (open === undefined || open.key !== key) return false
          segments.push({ type: "managed", key, content: text.slice(open.start, lineEnd) })
          cursor = lineEnd
          open = undefined
          return true
        }
      }))
      if (!accepted) return undefined
    }

    lineStart = lineEnd
  }

  if (open !== undefined) return undefined
  if (cursor < text.length) segments.push({ type: "external", content: text.slice(cursor) })
  if (segments.length === 0 && text.length > 0) segments.push({ type: "external", content: text })
  return segments
}

function isTomlTable(value: unknown): value is TomlTable {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function tableAt(table: TomlTable, key: string): TomlTable | undefined {
  const value = table[key]
  return isTomlTable(value) ? value : undefined
}

function hasOwn(table: TomlTable, key: string): boolean {
  return Object.hasOwn(table, key)
}

function exactPluginEntry(document: TomlTable, registration: Registration): boolean {
  const plugins = tableAt(document, "plugins")
  const entry = plugins === undefined ? undefined : tableAt(plugins, selectorFor(registration))
  return entry !== undefined && Object.keys(entry).length === 1 && entry.enabled === true
}

function exactMarketplaceEntry(document: TomlTable, registration: Registration): boolean {
  const marketplaces = tableAt(document, "marketplaces")
  const entry = marketplaces === undefined ? undefined : tableAt(marketplaces, registration.marketplace)
  return entry !== undefined && Object.keys(entry).length === 2 &&
    entry.source_type === "local" && entry.source === registration.root
}

function exactRegistration(document: TomlTable, registration: Registration): boolean {
  return exactPluginEntry(document, registration) && exactMarketplaceEntry(document, registration)
}

function exactActivation(document: TomlTable, activation: Activation): boolean {
  if (!exactRegistration(document, activation.registration)) return false
  const agents = tableAt(document, "agents")
  return activation.agents.every(({ name, configFile }) => {
    const entry = agents === undefined ? undefined : tableAt(agents, name)
    return entry !== undefined && Object.keys(entry).length === 1 && entry.config_file === configFile
  })
}

function hasPathOrUnusableContainer(document: TomlTable, container: string, path: string): boolean {
  if (!hasOwn(document, container)) return false
  const table = tableAt(document, container)
  return table === undefined || hasOwn(table, path)
}

function hasUnownedDesiredEntry(document: TomlTable, previous: Activation | null, desired: Activation): boolean {
  const previousSelector = previous === null ? undefined : selectorFor(previous.registration)
  const previousMarketplace = previous?.registration.marketplace
  const pluginConflict = selectorFor(desired.registration) !== previousSelector &&
    hasPathOrUnusableContainer(document, "plugins", selectorFor(desired.registration))
  const marketplaceConflict = desired.registration.marketplace !== previousMarketplace &&
    hasPathOrUnusableContainer(document, "marketplaces", desired.registration.marketplace)
  const names = new Set(previous?.agents.map((binding) => binding.name) ?? [])
  const agentConflict = desired.agents.some(({ name }) => !names.has(name) && hasPathOrUnusableContainer(document, "agents", name))
  return pluginConflict || marketplaceConflict || agentConflict
}

function hasForeignConsumer(document: TomlTable, activations: ReadonlyArray<Activation>): boolean {
  const plugins = tableAt(document, "plugins")
  const registrations = activations.map((activation) => activation.registration)
  for (const selector of Object.keys(plugins ?? {})) {
    const belongsToOwnedMarketplace = registrations.some(({ marketplace }) =>
      selector.endsWith(`@${marketplace}`)
    )
    const isOwnedSelector = registrations.some((registration) => selector === selectorFor(registration))
    if (belongsToOwnedMarketplace && !isOwnedSelector) return true
  }
  const bindings = activations.flatMap((activation) => activation.agents)
  const names = new Set<string>(bindings.map((binding) => binding.name))
  const paths = new Set<string>(bindings.map((binding) => binding.configFile))
  const agents = tableAt(document, "agents")
  for (const [name, value] of Object.entries(agents ?? {})) {
    if (!names.has(name) && isTomlTable(value) && typeof value.config_file === "string" && paths.has(value.config_file)) return true
  }
  return false
}

function cloneTomlValue(value: TomlValue): TomlValue {
  if (Array.isArray(value)) return value.map(cloneTomlValue)
  if (isTomlTable(value)) return cloneTomlTable(value)
  return value
}

function cloneTomlTable(table: TomlTable): TomlTable {
  const copy: TomlTable = {}
  for (const [key, value] of Object.entries(table)) {
    Object.defineProperty(copy, key, {
      value: cloneTomlValue(value),
      configurable: true,
      enumerable: true,
      writable: true
    })
  }
  return copy
}

function withoutControlledEntries(
  document: TomlTable,
  activations: ReadonlyArray<Activation>
): TomlTable {
  const copy = cloneTomlTable(document)
  const plugins = tableAt(copy, "plugins")
  const marketplaces = tableAt(copy, "marketplaces")
  const agents = tableAt(copy, "agents")
  for (const { registration, agents: bindings } of activations) {
    if (plugins !== undefined) delete plugins[selectorFor(registration)]
    if (marketplaces !== undefined) delete marketplaces[registration.marketplace]
    if (agents !== undefined) for (const { name } of bindings) delete agents[name]
  }
  if (plugins !== undefined && Object.keys(plugins).length === 0) delete copy.plugins
  if (marketplaces !== undefined && Object.keys(marketplaces).length === 0) delete copy.marketplaces
  if (agents !== undefined && Object.keys(agents).length === 0) delete copy.agents
  return copy
}

function ownedBlocks(segments: ReadonlyArray<Segment>, key: BlockKey): ReadonlyArray<string> {
  const blocks: Array<string> = []
  for (const segment of segments) {
    Match.value(segment).pipe(Match.discriminatorsExhaustive("type")({
      external: () => undefined,
      managed: (managed) => {
        if (managed.key === key) blocks.push(managed.content)
      }
    }))
  }
  return blocks
}

function segmentContent(segment: Segment): string {
  return Match.value(segment).pipe(Match.discriminatorsExhaustive("type")({
    external: ({ content }) => content,
    managed: ({ content }) => content
  }))
}

function activationFromBlock(block: string): Activation | undefined {
  const parsed = parseDocument(block)
  if (parsed === undefined || Object.keys(parsed).some((key) => key !== "plugins" && key !== "marketplaces" && key !== "agents")) return undefined
  const plugins = tableAt(parsed, "plugins")
  const marketplaces = tableAt(parsed, "marketplaces")
  if (plugins === undefined || marketplaces === undefined ||
    Object.keys(plugins).length !== 1 || Object.keys(marketplaces).length !== 1) return undefined

  const selector = Object.keys(plugins)[0]
  const marketplace = Object.keys(marketplaces)[0]
  if (selector === undefined || marketplace === undefined) return undefined
  const selectorMatch = /^(.+)@(pluginsdk-[a-f0-9]{24})$/.exec(selector)
  if (selectorMatch === null || selectorMatch[2] !== marketplace) return undefined
  const plugin = selectorMatch[1]
  if (plugin === undefined) return undefined

  const raw: unknown = {
    plugin,
    marketplace,
    root: tableAt(marketplaces, marketplace)?.source
  }
  try {
    const registration = decode(Registration, raw)
    const agents: Binding[] = []
    if (hasOwn(parsed, "agents")) {
      const table = tableAt(parsed, "agents")
      if (table === undefined) return undefined
      for (const name of Object.keys(table).toSorted(compareUtf8)) {
        const entry = tableAt(table, name)
        if (entry === undefined || Object.keys(entry).length !== 1) return undefined
        agents.push(decode(Binding, { name, configFile: entry.config_file }))
      }
    }
    const activation = { registration, agents }
    if (!exactActivation(parsed, activation)) return undefined
    return activation
  } catch {
    return undefined
  }
}

function oldEntryRemains(document: TomlTable, previous: Activation, desired: Activation | null): boolean {
  const previousSelector = selectorFor(previous.registration)
  const desiredSelector = desired === null ? undefined : selectorFor(desired.registration)
  const previousPluginRemains = previousSelector !== desiredSelector &&
    hasPathOrUnusableContainer(document, "plugins", previousSelector)
  const previousMarketplaceRemains = previous.registration.marketplace !== desired?.registration.marketplace &&
    hasPathOrUnusableContainer(document, "marketplaces", previous.registration.marketplace)
  const desiredNames = new Set(desired?.agents.map((binding) => binding.name) ?? [])
  const previousAgentRemains = previous.agents.some(({ name }) => !desiredNames.has(name) && hasPathOrUnusableContainer(document, "agents", name))
  return previousPluginRemains || previousMarketplaceRemains || previousAgentRemains
}

function relevantActivations(input: DocumentInput): ReadonlyArray<Activation> {
  const activations: Array<Activation> = []
  if (input.previous !== null) activations.push(input.previous)
  if (input.desired !== null) activations.push(input.desired)
  return activations
}

export function editProjectDocument(input: DocumentInput): DocumentResult {
  let decoded: DocumentInput
  try {
    decoded = decode(DocumentInput, input)
  } catch {
    return blocked("invalid_config")
  }

  const document = tokenize(decoded.text)
  if (document === undefined) return blocked("invalid_config")

  const previous = decoded.previous === null ? null : renderProjectBlock(decoded.key, decoded.previous)
  const desired = decoded.desired === null ? null : renderProjectBlock(decoded.key, decoded.desired)
  const modelResult = editProjectConfig({ key: decoded.key, previous, desired, document })
  const before = parseDocument(decoded.text)
  if (before === undefined) {
    return Match.value(modelResult).pipe(Match.discriminatorsExhaustive("type")({
      blocked: ({ reason }) => blocked(reason === "duplicate" ? reason : "invalid_config"),
      ready: () => blocked("invalid_config")
    }))
  }

  return Match.value(modelResult).pipe(Match.discriminatorsExhaustive("type")({
    blocked: ({ reason }) => blocked(reason),
    ready: ({ document: edited }) => {
      if (decoded.previous !== null && !exactActivation(before, decoded.previous)) return blocked("drift")
      if (decoded.desired !== null && hasUnownedDesiredEntry(before, decoded.previous, decoded.desired)) {
        return blocked("native_conflict")
      }

      const relevantBefore = relevantActivations(decoded)
      if (hasForeignConsumer(before, relevantBefore)) return blocked("native_conflict")

      const text = edited.map(segmentContent).join("")
      const after = parseDocument(text)
      if (after === undefined) return blocked("invalid_config")
      if (decoded.desired !== null && !exactActivation(after, decoded.desired)) {
        return blocked("semantic_change")
      }
      if (decoded.previous !== null && oldEntryRemains(after, decoded.previous, decoded.desired)) {
        return blocked("semantic_change")
      }
      if (decoded.desired !== null && hasForeignConsumer(after, [decoded.desired])) {
        return blocked("native_conflict")
      }

      const activations = relevantActivations(decoded)
      const preservedBefore = withoutControlledEntries(before, activations)
      const preservedAfter = withoutControlledEntries(after, activations)
      if (!isDeepStrictEqual(preservedBefore, preservedAfter)) return blocked("semantic_change")
      const result: DocumentResult = { type: "ready", text }
      return result
    }
  }))
}

export function inspectProjectDocument(input: InspectionInput): InspectionResult {
  let decoded: InspectionInput
  try {
    decoded = decode(InspectionInput, input)
  } catch {
    return inspectBlocked("invalid_config")
  }

  const segments = tokenize(decoded.text)
  if (segments === undefined) return inspectBlocked("invalid_config")

  const blocks = ownedBlocks(segments, decoded.key)
  if (blocks.length > 1) return inspectBlocked("duplicate")
  const parsed = parseDocument(decoded.text)
  if (parsed === undefined) return inspectBlocked("invalid_config")
  if (blocks.length === 0) return { type: "absent" }
  const block = blocks[0]
  if (block === undefined) return inspectBlocked("duplicate")
  const activation = activationFromBlock(block)
  if (activation === undefined || block !== renderProjectBlock(decoded.key, activation)) {
    return inspectBlocked("drift")
  }
  if (!exactActivation(parsed, activation)) return inspectBlocked("drift")
  if (hasForeignConsumer(parsed, [activation])) return inspectBlocked("native_conflict")
  return { type: "present", activation, block }
}
