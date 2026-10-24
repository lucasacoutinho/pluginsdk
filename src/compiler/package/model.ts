import { Match } from "effect"
import { HeaderName, PackagePath } from "../../../contracts/Plugin.ts"
import { asciiFold, compareUtf8, pathCollisionKeys } from "../../internal/paths.ts"
import type { BundleCheckIssue, McpProblem } from "../../../contracts/Compiler.ts"
import type {
  BundleCheckInput,
  BundleCheckResult,
  RenderInput,
  RenderIssue,
  RenderResult,
  RenderedFile
} from "../../../contracts/CompilerModel.ts"

type NonEmpty<A> = [A, ...A[]]
type JsonObject = Extract<RenderedFile, { type: "json" }>["value"]
type JsonValue = JsonObject[string]
type McpSource = RenderInput["mcp"][string]
type HeaderValue = McpSource["headers"][string]
type RenderedFiles = Extract<RenderResult, { type: "rendered" }>["files"]

type FormatRules = {
  readonly manifestPath: string
  readonly mcpPath: string
  readonly transport: string
  readonly headerKey: string
  readonly includeTransport: boolean
  readonly environmentReference: boolean
  readonly literalExpansion: boolean
}

const formatRules: Record<RenderInput["format"], FormatRules> = {
  claude_code: {
    manifestPath: ".claude-plugin/plugin.json",
    mcpPath: ".mcp.json",
    transport: "http",
    headerKey: "headers",
    includeTransport: true,
    environmentReference: false,
    literalExpansion: true
  },
  codex: {
    manifestPath: ".codex-plugin/plugin.json",
    mcpPath: ".mcp.json",
    transport: "http",
    headerKey: "http_headers",
    includeTransport: false,
    environmentReference: true,
    literalExpansion: false
  }
}

export function nativeLocations(format: RenderInput["format"]) {
  const rules = formatRules[format]
  return { host: format, manifest: rules.manifestPath, mcp: rules.mcpPath }
}

function compareKey(left: readonly string[], right: readonly string[]): number {
  const leftSegments = left[Symbol.iterator]()
  const rightSegments = right[Symbol.iterator]()
  while (true) {
    const leftSegment = leftSegments.next()
    const rightSegment = rightSegments.next()
    if (leftSegment.done) return rightSegment.done ? 0 : -1
    if (rightSegment.done) return 1
    const comparison = compareUtf8(leftSegment.value, rightSegment.value)
    if (comparison !== 0) return comparison
  }
}

function equalKey(left: readonly string[], right: readonly string[]): boolean {
  let index = 0
  for (const segment of left) {
    const rightSegment = right[index]
    if (rightSegment === undefined || segment !== rightSegment) return false
    index += 1
  }
  return index === right.length
}

function uniqueByKey<A>(values: readonly A[], keyOf: (value: A) => readonly string[]): A[] {
  const unique: A[] = []
  const seen: Array<readonly string[]> = []
  for (const value of values) {
    const key = keyOf(value)
    if (!seen.some((candidate) => equalKey(candidate, key))) {
      seen.push(key)
      unique.push(value)
    }
  }
  return unique
}

function orderByKey<A>(values: readonly A[], keyOf: (value: A) => readonly string[]): A[] {
  return [...values].sort((left, right) => compareKey(keyOf(left), keyOf(right)))
}

function pathCollisionIssues(paths: readonly PackagePath[]): RenderIssue[] {
  return pathCollisionKeys(paths).map((path) => ({ type: "path_collision", path }))
}

function renderIssueKey(issue: RenderIssue): readonly string[] {
  return Match.value(issue).pipe(
    Match.discriminatorsExhaustive("type")({
      path_collision: (value) => ["path_collision", value.path],
      unsupported_mcp: (value) => ["unsupported_mcp", value.server, ...mcpProblemKey(value.reason)]
    })
  )
}

function mcpProblemKey(problem: McpProblem): readonly string[] {
  return Match.value(problem).pipe(
    Match.discriminatorsExhaustive("type")({
      environment_reference: (value) => ["environment_reference", value.header],
      literal_expansion: (value) => ["literal_expansion", value.header],
      header_collision: (value) => ["header_collision", value.header]
    })
  )
}

function bundleIssueKey(issue: BundleCheckIssue): readonly string[] {
  return Match.value(issue).pipe(
    Match.discriminatorsExhaustive("type")({
      digest_mismatch: () => ["digest_mismatch"],
      noncanonical_order: () => ["noncanonical_order"],
      path_collision: (value) => ["path_collision", value.path]
    })
  )
}

function hasExpansion(value: string): boolean {
  return value.includes("${")
}

function headerValueProblems(format: RenderInput["format"], name: string, value: HeaderValue): McpProblem[] {
  const header = HeaderName.make(asciiFold(name))
  const rules = formatRules[format]
  return Match.value(value).pipe(
    Match.when(Match.string, (text): McpProblem[] => rules.literalExpansion && hasExpansion(text)
      ? [{ type: "literal_expansion", header }]
      : []),
    Match.when({ type: "environment" }, (environment): McpProblem[] => {
      if (rules.environmentReference) return [{ type: "environment_reference", header }]
      return rules.literalExpansion && hasExpansion(environment.prefix)
        ? [{ type: "literal_expansion", header }]
        : []
    }),
    Match.exhaustive
  )
}

function headerProblems(format: RenderInput["format"], source: McpSource): McpProblem[] {
  const headers = Object.entries(source.headers)
  const problems: McpProblem[] = []
  for (const [name, value] of headers) {
    problems.push(...headerValueProblems(format, name, value))
  }
  for (const [leftName] of headers) {
    for (const [rightName] of headers) {
      if (leftName !== rightName && asciiFold(leftName) === asciiFold(rightName)) {
        problems.push({ type: "header_collision", header: HeaderName.make(asciiFold(leftName)) })
      }
    }
  }
  return problems
}

function manifestPath(format: RenderInput["format"]): PackagePath {
  return PackagePath.make(formatRules[format].manifestPath)
}

function mcpPath(format: RenderInput["format"]): PackagePath {
  return PackagePath.make(formatRules[format].mcpPath)
}

function transport(format: RenderInput["format"]): string {
  return formatRules[format].transport
}

function jsonObject(rows: readonly (readonly [string, JsonValue])[]): JsonObject {
  const sortedRows = [...rows].sort((left, right) => compareUtf8(left[0], right[0]))
  let object: JsonObject = {}
  for (const [key, value] of sortedRows) object = { ...object, [key]: value }
  return object
}

function headerText(value: HeaderValue): string {
  return Match.value(value).pipe(
    Match.when(Match.string, (text) => text),
    Match.when({ type: "environment" }, (environment) => environment.prefix + "${" + environment.name + "}"),
    Match.exhaustive
  )
}

function manifest(input: RenderInput): RenderedFile {
  const rows: Array<readonly [string, JsonValue]> = [
    ["name", input.metadata.id],
    ["version", input.metadata.version],
    ["description", input.metadata.description]
  ]
  return {
    type: "json",
    path: manifestPath(input.format),
    value: jsonObject(rows)
  }
}

export function remoteServer(format: RenderInput["format"], source: McpSource): JsonObject {
  const headers: Array<readonly [string, JsonValue]> = Object.entries(source.headers).map(
    ([headerName, value]) => [headerName, headerText(value)]
  )
  const rules = formatRules[format]
  const rows: Array<readonly [string, JsonValue]> = []
  if (rules.includeTransport) rows.push(["type", transport(format)])
  rows.push(["url", source.url], [rules.headerKey, jsonObject(headers)])
  return jsonObject(rows)
}

function mcpFile(input: RenderInput): RenderedFile {
  const serverRows: Array<readonly [string, JsonValue]> = Object.entries(input.mcp).map(
    ([name, source]) => [name, remoteServer(input.format, source)]
  )
  const rows: Array<readonly [string, JsonValue]> = [
    ["mcpServers", jsonObject(serverRows)]
  ]
  return {
    type: "json",
    path: mcpPath(input.format),
    value: jsonObject(rows)
  }
}

function requestedPaths(input: RenderInput): PackagePath[] {
  const paths: PackagePath[] = [manifestPath(input.format)]
  if (Object.keys(input.mcp).length > 0) paths.push(mcpPath(input.format))
  for (const skill of input.skills) {
    paths.push(PackagePath.make(`skills/${skill.name}/SKILL.md`))
    for (const asset of skill.assets) {
      paths.push(PackagePath.make(`skills/${skill.name}/${asset.path}`))
    }
  }
  return paths
}

function unsupportedMcpIssues(input: RenderInput): RenderIssue[] {
  const issues: RenderIssue[] = []
  for (const [server, source] of Object.entries(input.mcp)) {
    for (const reason of headerProblems(input.format, source)) {
      issues.push({ type: "unsupported_mcp", server, reason })
    }
  }
  return issues
}

function renderIssues(input: RenderInput): RenderIssue[] {
  const raw = [
    ...pathCollisionIssues(requestedPaths(input)),
    ...unsupportedMcpIssues(input)
  ]
  return orderByKey(uniqueByKey(raw, renderIssueKey), renderIssueKey)
}

function skillCopies(skill: RenderInput["skills"][number]): RenderedFile[] {
  const files: RenderedFile[] = [{
    type: "copy",
    path: PackagePath.make(`skills/${skill.name}/SKILL.md`),
    digest: skill.entry.digest,
    executable: skill.entry.executable
  }]
  for (const asset of skill.assets) {
    files.push({
      type: "copy",
      path: PackagePath.make(`skills/${skill.name}/${asset.path}`),
      digest: asset.digest,
      executable: asset.executable
    })
  }
  return files
}

function rawFiles(input: RenderInput): NonEmpty<RenderedFile> {
  const files: NonEmpty<RenderedFile> = [manifest(input)]
  if (Object.keys(input.mcp).length > 0) files.push(mcpFile(input))
  for (const skill of input.skills) files.push(...skillCopies(skill))
  return files
}

export function render(input: RenderInput): RenderResult {
  const issues = renderIssues(input)
  const [firstIssue, ...restIssues] = issues
  if (firstIssue !== undefined) {
    return { type: "rejected", issues: [firstIssue, ...restIssues] }
  }

  const files = rawFiles(input)
  files.sort((left, right) => compareUtf8(left.path, right.path))
  const renderedFiles: RenderedFiles = files
  return { type: "rendered", files: renderedFiles }
}

function pathsStrictlyOrdered(paths: readonly PackagePath[]): boolean {
  let previous: PackagePath | null = null
  for (const path of paths) {
    if (previous !== null && compareUtf8(previous, path) >= 0) return false
    previous = path
  }
  return true
}

function bundleIssues(input: BundleCheckInput): BundleCheckIssue[] {
  const raw: BundleCheckIssue[] = []
  if (input.digest !== input.computed) raw.push({ type: "digest_mismatch" })
  if (!pathsStrictlyOrdered(input.paths)) raw.push({ type: "noncanonical_order" })
  for (const path of pathCollisionKeys(input.paths)) {
    raw.push({ type: "path_collision", path })
  }
  return orderByKey(uniqueByKey(raw, bundleIssueKey), bundleIssueKey)
}

export function checkBundle(input: BundleCheckInput): BundleCheckResult {
  const issues = bundleIssues(input)
  const [firstIssue, ...restIssues] = issues
  return firstIssue === undefined
    ? { type: "valid" }
    : { type: "rejected", issues: [firstIssue, ...restIssues] }
}
