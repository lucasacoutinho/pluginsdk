import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Match, Schema } from "effect"
import { ContractDigest } from "../contracts/Authorization.ts"
import { ArtifactDigest, FormatDigests, ReleaseKey } from "../contracts/Catalog.ts"
import { BuildRequest, Bundle, Compiler } from "../contracts/Compiler.ts"
import {
  Admission as AdmissionSchema,
  AdmissionRequest,
  ArtifactMcpRelease,
  ArtifactRejected,
  CatalogInputRejected,
  ContractRejected,
  McpAdmissionRequest,
  McpArchive,
  McpRelease,
  PluginAdmissionRequest,
  PluginRelease,
  ReleaseCatalog
} from "../contracts/Registry.ts"
import type { Acquisition, Admission } from "../contracts/Registry.ts"
import { ContractBindingIssue, McpContract, McpProtocol, McpTool } from "../contracts/ToolContract.ts"
import { Directory } from "../contracts/Plugin.ts"
import { CompilerLive } from "../src/compiler/index.ts"
import { ReleaseCatalogLive } from "../src/catalog/index.ts"
import { packContractArtifact } from "../src/catalog/artifacts/import.ts"

const compilerLayer = Layer.provideMerge(CompilerLive, NodeServices.layer)
const writerPath = fileURLToPath(new URL("./fixtures/catalog-writer.ts", import.meta.url))
const CatalogRecord = Schema.Struct({ schema: Schema.Literal(2), entries: Schema.Array(AdmissionRequest) })

type Json = Schema.Json
type JsonObject = Readonly<Record<string, Json>>
type BindingCase = {
  readonly name: string
  readonly organization: string
  readonly service: string
  readonly digest: ContractDigest
  readonly issues: ReadonlyArray<ContractBindingIssue>
}

const withDirectory = async <A>(run: (root: string) => Promise<A>): Promise<A> => {
  const root = await mkdtemp(join(tmpdir(), "pluginsdk-catalog-contract-"))
  try {
    return await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const catalogLayer = (directory: string) => Layer.provideMerge(
  ReleaseCatalogLive(Directory.make(directory)),
  NodeServices.layer
)

const runCatalog = <A, E>(
  directory: string,
  run: (catalog: typeof ReleaseCatalog.Service) => Effect.Effect<A, E>
): Promise<A> => Effect.runPromise(ReleaseCatalog.use(run).pipe(Effect.provide(catalogLayer(directory))))

const makeKey = (integration: string, release: string, organization = "acme") => Schema.decodeSync(ReleaseKey)({
  organization,
  integration,
  release
})

const makeTool = (service: string, access: "read" | "admin"): McpTool => {
  const name = `${access}_${service}`
  return Schema.decodeSync(McpTool)({
    name,
    title: `${service} ${access} tool`,
    description: `Reviewed ${access} access for ${service}.`,
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", minLength: 1, "x-input-rule": "reviewed" },
        includeHistory: { type: "boolean", default: false }
      },
      required: ["accountId"],
      additionalProperties: false,
      "x-input-extension": { policy: "account-scope", revision: 3 }
    },
    outputSchema: {
      type: "object",
      properties: {
        result: {
          type: "object",
          properties: {
            id: { type: "string" },
            revision: { type: "integer", minimum: 0 }
          },
          required: ["id", "revision"],
          additionalProperties: false
        },
        warnings: { type: "array", items: { type: "string" } }
      },
      required: ["result"],
      additionalProperties: false,
      "x-output-extension": { classification: "reviewed", service }
    },
    annotations: {
      title: `${service} ${access}`,
      readOnlyHint: access === "read",
      destructiveHint: access === "admin",
      idempotentHint: access === "read",
      openWorldHint: false,
      "x-review": { owner: `team-${service}`, status: "approved" }
    },
    icons: [{
      src: `https://icons.example.test/${service}/${access}.svg`,
      mimeType: "image/svg+xml",
      "x-icon-extension": { contrast: "high" }
    }],
    _meta: {
      "com.example.audit": { policy: `${service}:${access}`, revision: 7 },
      "x-meta-extension": ["preserved", 2, true]
    },
    "x-tool-extension": { reviewedBy: "security", scope: [service, access] }
  })
}

const makeContract = (
  organization: string,
  service: string,
  tools: ReadonlyArray<McpTool>,
  protocol: McpProtocol = "2026-07-28"
): McpContract => Schema.decodeSync(McpContract)({
  schema: 1,
  organization,
  service,
  protocol,
  tools: [...tools]
})

const applicationContract = (
  organization: string,
  service: string,
  order: ReadonlyArray<"read" | "admin"> = ["read", "admin"]
): McpContract => makeContract(organization, service, order.map((access) => makeTool(service, access)))

const repositoryMcpRelease = (
  key: ReleaseKey,
  service: string,
  digest: ContractDigest,
  version = "1.0.0"
) => Schema.decodeSync(McpRelease)({
  key,
  version,
  origin: { type: "repository", repository: "https://example.test/mcp-contracts", commit: "b".repeat(40), path: "." },
  contents: { type: "mcp", service, contract: digest }
})

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

const quote = (value: string): string => {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error("Could not encode a JSON string")
  return encoded
}

const isJsonObject = (value: Json): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const canonicalJson = (value: Json): string => {
  if (value === null) return "null"
  if (typeof value === "string") return quote(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new Error("Could not encode a JSON number")
    return encoded
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (!isJsonObject(value)) throw new Error("Expected a JSON object")
  return `{${Object.keys(value).sort().map((key) => {
    const entry = value[key]
    if (entry === undefined) throw new Error(`Missing JSON entry ${key}`)
    return `${quote(key)}:${canonicalJson(entry)}`
  }).join(",")}}`
}

const independentDomainDigest = (domain: string, body: Json): string =>
  createHash("sha256")
    .update(`pluginsdk:${domain}:1\0`)
    .update(canonicalJson(body))
    .digest("hex")

const unpackMcpArchive = (bytes: Uint8Array) => Schema.decodeUnknownSync(McpArchive)(
  JSON.parse(new TextDecoder().decode(bytes)),
  { onExcessProperty: "error" }
)

const contractFrom = (acquisition: Acquisition): McpContract => Match.value(acquisition).pipe(
  Match.discriminatorsExhaustive("type")({
    mcp: ({ contract }) => contract,
    plugin: () => { throw new Error("Expected MCP acquisition, received plugin content") },
    blocked: ({ reason }) => { throw new Error(`Expected MCP acquisition, received blocked result ${reason}`) }
  })
)

const mutateContract = (contract: McpContract): void => {
  const tool = contract.tools[0]
  if (tool === undefined) throw new Error("Mutation fixture requires a tool")
  Object.assign(tool.inputSchema, { "x-after-admission": true })
  const properties = tool.inputSchema.properties
  if (properties === undefined || !isJsonObject(properties)) {
    throw new Error("Mutation fixture requires input schema properties")
  }
  Object.assign(properties, { accountId: { type: "integer" }, mutatedField: { type: "boolean" } })
  const icon = tool.icons?.[0]
  if (icon !== undefined) Object.assign(icon, { src: "https://mutated.example.test/icon.svg" })
  if (tool.annotations !== undefined) Object.assign(tool.annotations, { readOnlyHint: !tool.annotations.readOnlyHint })
  if (tool._meta !== undefined) Object.assign(tool._meta, { "x-after-admission": "mutated" })
}

const makePluginBundle = async (root: string) => {
  const source = join(root, "plugin-source")
  const skill = join(source, "skills", "overview")
  const assets = join(source, "assets")
  await mkdir(skill, { recursive: true })
  await mkdir(assets, { recursive: true })
  await writeFile(join(skill, "SKILL.md"), [
    "---", "name: overview", "description: Catalog contract fixture.", "---",
    "# Catalog fixture", "A small package used for mixed-kind catalog tests.", ""
  ].join("\n"))
  await writeFile(join(assets, "reference.txt"), "catalog contract fixture\n")
  const request = Schema.decodeSync(BuildRequest)({
    root: Directory.make(source),
    format: "claude_code_v4",
    plugin: {
      id: "contract-plugin",
      version: "1.0.0",
      description: "Catalog contract fixture.",
      skills: ["skills/overview"],
      assets: ["assets"],
      mcp: {}
    }
  })
  return Effect.runPromise(Compiler.use((compiler) => compiler.build(request)).pipe(Effect.provide(compilerLayer)))
}

const makePluginRelease = (key: ReleaseKey, bundle: Bundle) => Schema.decodeSync(PluginRelease)({
  key,
  version: "1.0.0",
  origin: { type: "repository", repository: "https://example.test/plugins", commit: "a".repeat(40), path: "." },
  contents: {
    type: "plugin",
    plugin: bundle.plugin,
    packages: Schema.decodeSync(FormatDigests)({ [bundle.format]: bundle.digest })
  }
})

const launchWriter = (directory: string, requestPath: string): Promise<Admission> => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["--experimental-strip-types", writerPath, directory, requestPath], {
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stdout = ""
  let stderr = ""
  const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000)
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
  child.once("error", (cause) => {
    clearTimeout(timeout)
    reject(cause)
  })
  child.once("close", (code) => {
    clearTimeout(timeout)
    if (code !== 0) {
      reject(new Error(`Catalog writer exited ${String(code)}: ${stderr}`))
      return
    }
    try {
      resolve(Schema.decodeUnknownSync(AdmissionSchema)(JSON.parse(stdout)))
    } catch (cause) {
      reject(cause)
    }
  })
})

const withHttpServer = async <A>(
  bodies: ReadonlyMap<string, Uint8Array>,
  run: (origin: string) => Promise<A>
): Promise<A> => {
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const bytes = bodies.get(request.url ?? "/")
    if (bytes === undefined) {
      response.statusCode = 404
      response.end()
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(bytes)
  })
  await new Promise<void>((resolve, reject) => {
    const onError = (cause: Error) => reject(cause)
    server.once("error", onError)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("Loopback fixture did not bind to TCP")
  try {
    return await run(`http://127.0.0.1:${address.port}`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      server.close((cause) => cause === undefined ? resolve() : reject(cause))
    })
  }
}

const withArtifactLocation = (
  release: ArtifactMcpRelease,
  location: string,
  digest: string
) => Schema.decodeSync(ArtifactMcpRelease)({
  ...release,
  origin: { ...release.origin, location, digest: ArtifactDigest.make(digest) }
})

it("packs two complete reviewed application contracts in canonical order with independent commitment domains", () => {
  const applications = [
    {
      organization: "acme",
      service: "billing",
      input: applicationContract("acme", "billing", ["read", "admin"]),
      expected: applicationContract("acme", "billing", ["admin", "read"])
    },
    {
      organization: "acme",
      service: "payroll",
      input: applicationContract("acme", "payroll", ["read", "admin"]),
      expected: applicationContract("acme", "payroll", ["admin", "read"])
    },
    {
      organization: "acme",
      service: "empty-audit",
      input: makeContract("acme", "empty-audit", []),
      expected: makeContract("acme", "empty-audit", [])
    }
  ]

  for (const application of applications) {
    const packed = packContractArtifact(
      makeKey(application.service, "approved-1", application.organization),
      "1.0.0",
      `https://artifacts.example.test/${application.service}/approved-1.json`,
      application.input
    )
    const archive = unpackMcpArchive(packed.bytes)
    const expectedContractDigest = independentDomainDigest(
      "mcp-contract",
      Schema.encodeSync(McpContract)(application.expected)
    )

    expect(archive).toEqual({ schema: 1, type: "mcp", contract: application.expected })
    expect(packed.release.contents).toEqual({
      type: "mcp",
      service: application.service,
      contract: expectedContractDigest
    })
    expect(packed.release.origin.digest).toBe(sha256(packed.bytes))
    expect(packed.release.origin.digest).not.toBe(expectedContractDigest)
  }

  const source = applicationContract("acme", "billing", ["read", "admin"])
  const packed = packContractArtifact(
    makeKey("billing", "mutation-check"), "1.0.0", "https://artifacts.example.test/billing/mutation-check.json", source
  )
  const originalBytes = new Uint8Array(packed.bytes)
  mutateContract(source)
  expect(packed.bytes).toEqual(originalBytes)
})

it("retains complete tool metadata across catalog reopen and isolates caller and acquired-output mutations", async () => {
  await withDirectory(async (root) => {
    const directory = join(root, "catalog")
    const billingInput = applicationContract("acme", "billing", ["read", "admin"])
    const billingExpected = applicationContract("acme", "billing", ["admin", "read"])
    const payrollInput = applicationContract("acme", "payroll", ["read", "admin"])
    const payrollExpected = applicationContract("acme", "payroll", ["admin", "read"])
    const billing = packContractArtifact(
      makeKey("billing", "approved-1"), "1.0.0", "https://artifacts.example.test/billing/approved-1.json", billingInput
    )
    const payroll = packContractArtifact(
      makeKey("payroll", "approved-2"), "2.0.0", "https://artifacts.example.test/payroll/approved-2.json", payrollInput
    )

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      expect(yield* catalog.admit({ type: "mcp", release: billing.release, contract: billingInput })).toEqual({ type: "admitted" })
      expect(yield* catalog.admit({ type: "mcp", release: payroll.release, contract: payrollInput })).toEqual({ type: "admitted" })
    }))

    mutateContract(billingInput)
    mutateContract(payrollInput)

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      const billingResult = yield* catalog.acquire({ key: billing.release.key, target: { type: "mcp" } })
      expect(billingResult).toEqual({ type: "mcp", release: billing.release, contract: billingExpected })
      mutateContract(contractFrom(billingResult))

      const billingAgain = yield* catalog.acquire({ key: billing.release.key, target: { type: "mcp" } })
      expect(contractFrom(billingAgain)).toEqual(billingExpected)

      const payrollResult = yield* catalog.acquire({ key: payroll.release.key, target: { type: "mcp" } })
      expect(payrollResult).toEqual({ type: "mcp", release: payroll.release, contract: payrollExpected })
    }))
  })
})

it("reports every exact binding mismatch and rejects duplicate names before binding", async () => {
  await withDirectory(async (root) => {
    const directory = join(root, "catalog")
    const contract = applicationContract("acme", "billing")
    const packed = packContractArtifact(
      makeKey("billing", "approved-1"), "1.0.0", "https://artifacts.example.test/billing/approved-1.json", contract
    )
    const correctDigest = packed.release.contents.contract
    const wrongDigest = ContractDigest.make("f".repeat(64))
    const cases: ReadonlyArray<BindingCase> = [
      {
        name: "organization",
        organization: "other-org",
        service: "billing",
        digest: correctDigest,
        issues: ["organization_mismatch"]
      },
      {
        name: "service",
        organization: "acme",
        service: "other-service",
        digest: correctDigest,
        issues: ["service_mismatch"]
      },
      {
        name: "digest",
        organization: "acme",
        service: "billing",
        digest: wrongDigest,
        issues: ["digest_mismatch"]
      },
      {
        name: "all",
        organization: "other-org",
        service: "other-service",
        digest: wrongDigest,
        issues: ["digest_mismatch", "organization_mismatch", "service_mismatch"]
      }
    ]

    await runCatalog(directory, (catalog) => catalog.initialize)
    const before = await readFile(join(directory, "catalog.json"))
    for (const candidate of cases) {
      const release = repositoryMcpRelease(
        makeKey("billing", `binding-${candidate.name}`, candidate.organization),
        candidate.service,
        candidate.digest
      )
      const error = await runCatalog(directory, (catalog) => Effect.flip(catalog.admit({
        type: "mcp",
        release,
        contract
      })))
      expect(error).toBeInstanceOf(ContractRejected)
      if (!(error instanceof ContractRejected)) throw error
      expect(error.reason).toEqual({ type: "binding", issues: candidate.issues })
    }

    const duplicates = makeContract("acme", "billing", [
      makeTool("billing", "read"),
      makeTool("billing", "admin"),
      makeTool("billing", "read"),
      makeTool("billing", "admin")
    ])
    const invalidBinding = repositoryMcpRelease(
      makeKey("billing", "duplicate-binding", "other-org"),
      "other-service",
      wrongDigest
    )
    const duplicateError = await runCatalog(directory, (catalog) => Effect.flip(catalog.admit({
      type: "mcp",
      release: invalidBinding,
      contract: duplicates
    })))
    expect(duplicateError).toBeInstanceOf(ContractRejected)
    if (!(duplicateError instanceof ContractRejected)) throw duplicateError
    expect(duplicateError.reason).toEqual({ type: "duplicate_tools", tools: ["admin_billing", "read_billing"] })
    expect(await readFile(join(directory, "catalog.json"))).toEqual(before)
  })
})

it("validates JSON Schema structures and protocol-specific output roots", () => {
  const invalidInput = makeContract("acme", "invalid-input", [Schema.decodeSync(McpTool)({
    ...makeTool("invalid-input", "read"),
    inputSchema: { type: "object", properties: true }
  })])
  expect(() => packContractArtifact(
    makeKey("invalid-input", "release-1"),
    "1.0.0",
    "https://artifacts.example.test/invalid-input/release-1.json",
    invalidInput
  )).toThrow(CatalogInputRejected)

  const legacyOutput = makeContract("acme", "legacy-output", [Schema.decodeSync(McpTool)({
    ...makeTool("legacy-output", "read"),
    outputSchema: { type: "string" }
  })], "2025-11-25")
  expect(() => packContractArtifact(
    makeKey("legacy-output", "release-1"),
    "1.0.0",
    "https://artifacts.example.test/legacy-output/release-1.json",
    legacyOutput
  )).toThrow(CatalogInputRejected)

  const currentOutput = makeContract("acme", "current-output", [Schema.decodeSync(McpTool)({
    ...makeTool("current-output", "read"),
    outputSchema: { type: "string" }
  })], "2026-07-28")
  const packed = packContractArtifact(
    makeKey("current-output", "release-1"),
    "1.0.0",
    "https://artifacts.example.test/current-output/release-1.json",
    currentOutput
  )
  expect(unpackMcpArchive(packed.bytes).contract).toEqual(currentOutput)
})

it("reads a raw schema 1 plugin store without rewriting it, then upgrades atomically on MCP admission", async () => {
  await withDirectory(async (root) => {
    const bundle = await makePluginBundle(root)
    const key = makeKey("shared-application", "release-1")
    const pluginRelease = makePluginRelease(key, bundle)
    const inputContract = applicationContract("acme", "billing", ["read", "admin"])
    const packed = packContractArtifact(
      key,
      "1.0.0",
      "https://artifacts.example.test/billing/shared.json",
      inputContract
    )
    const sameKeyMcpRelease = repositoryMcpRelease(
      key,
      "billing",
      packed.release.contents.contract
    )
    const nextMcpKey = makeKey("billing", "release-2")
    const nextMcp = packContractArtifact(
      nextMcpKey,
      "1.0.0",
      "https://artifacts.example.test/billing/release-2.json",
      inputContract
    )
    const expectedContract = unpackMcpArchive(nextMcp.bytes).contract
    const directory = join(root, "catalog")
    const file = join(directory, "catalog.json")
    const legacyBytes = new TextEncoder().encode(JSON.stringify({
      schema: 1,
      entries: [{
        release: Schema.encodeSync(PluginRelease)(pluginRelease),
        bundles: [Schema.encodeSync(Bundle)(bundle)]
      }]
    }))
    await mkdir(directory)
    await writeFile(file, legacyBytes)

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      const plugin = yield* catalog.acquire({ key, target: { type: "plugin", format: "claude_code_v4" } })
      expect(plugin).toEqual({ type: "plugin", release: pluginRelease, bundle })
      expect(yield* catalog.acquire({ key, target: { type: "mcp" } })).toEqual({
        type: "blocked", reason: "kind_mismatch"
      })
      expect(yield* catalog.acquire({
        key: makeKey("shared-application", "release-1", "other-org"),
        target: { type: "plugin", format: "claude_code_v4" }
      })).toEqual({ type: "blocked", reason: "release_missing" })
      expect(yield* catalog.admit({ type: "plugin", release: pluginRelease, bundles: [bundle] })).toEqual({
        type: "unchanged"
      })
      expect(yield* catalog.admit({ type: "mcp", release: sameKeyMcpRelease, contract: inputContract })).toEqual({
        type: "conflict"
      })
    }))
    expect(await readFile(file)).toEqual(Buffer.from(legacyBytes))

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      expect(yield* catalog.admit({ type: "mcp", release: nextMcp.release, contract: inputContract })).toEqual({
        type: "admitted"
      })
      expect(yield* catalog.acquire({ key: nextMcpKey, target: { type: "plugin", format: "claude_code_v4" } })).toEqual({
        type: "blocked", reason: "kind_mismatch"
      })
      const acquired = yield* catalog.acquire({ key: nextMcpKey, target: { type: "mcp" } })
      expect(acquired).toEqual({ type: "mcp", release: nextMcp.release, contract: expectedContract })
    }))

    const actualRecord = Schema.decodeUnknownSync(CatalogRecord)(
      JSON.parse(await readFile(file, "utf8")),
      { onExcessProperty: "error" }
    )
    const expectedEntries = [
      Schema.decodeSync(Schema.toType(PluginAdmissionRequest))({ type: "plugin", release: pluginRelease, bundles: [bundle] }),
      Schema.decodeSync(Schema.toType(McpAdmissionRequest))({ type: "mcp", release: nextMcp.release, contract: expectedContract })
    ]
    expect(actualRecord.entries).toEqual(expectedEntries)
  })
})

it("keeps mixed plugin and MCP admissions atomic across independent writers", async () => {
  await withDirectory(async (root) => {
    const bundle = await makePluginBundle(root)
    const pluginUnique = {
      type: "plugin",
      release: makePluginRelease(makeKey("writer-plugin", "release-1"), bundle),
      bundles: [bundle]
    } satisfies AdmissionRequest
    const mcpUniqueContract = applicationContract("acme", "writer-mcp")
    const mcpUniqueExpected = applicationContract("acme", "writer-mcp", ["admin", "read"])
    const mcpUnique = {
      type: "mcp",
      release: packContractArtifact(
        makeKey("writer-mcp", "release-1"),
        "1.0.0",
        "https://artifacts.example.test/writer-mcp/release-1.json",
        mcpUniqueContract
      ).release,
      contract: mcpUniqueContract
    } satisfies AdmissionRequest
    const sharedKey = makeKey("writer-shared", "release-1")
    const sharedContract = applicationContract("acme", "writer-shared")
    const sharedPacked = packContractArtifact(
      sharedKey,
      "1.0.0",
      "https://artifacts.example.test/writer-shared/release-1.json",
      sharedContract
    )
    const pluginConflict = {
      type: "plugin",
      release: makePluginRelease(sharedKey, bundle),
      bundles: [bundle]
    } satisfies AdmissionRequest
    const mcpConflict = {
      type: "mcp",
      release: sharedPacked.release,
      contract: sharedContract
    } satisfies AdmissionRequest
    const requests: ReadonlyArray<AdmissionRequest> = [pluginUnique, mcpUnique, pluginConflict, mcpConflict]
    const directory = join(root, "catalog")
    await runCatalog(directory, (catalog) => catalog.initialize)
    const requestPaths = await Promise.all(requests.map(async (request, index) => {
      const path = join(root, `admission-${index}.json`)
      await writeFile(path, JSON.stringify(Schema.encodeSync(AdmissionRequest)(request)))
      return path
    }))
    const admissions = await Promise.all(requestPaths.map((path) => launchWriter(directory, path)))
    const [pluginUniqueResult, mcpUniqueResult, pluginConflictResult, mcpConflictResult] = admissions
    if (pluginUniqueResult === undefined || mcpUniqueResult === undefined ||
      pluginConflictResult === undefined || mcpConflictResult === undefined) {
      throw new Error("A catalog writer result is missing")
    }
    expect([pluginUniqueResult, mcpUniqueResult]).toEqual([{ type: "admitted" }, { type: "admitted" }])
    expect([pluginConflictResult.type, mcpConflictResult.type].sort()).toEqual(["admitted", "conflict"])

    const persisted = Schema.decodeUnknownSync(CatalogRecord)(
      JSON.parse(await readFile(join(directory, "catalog.json"), "utf8")),
      { onExcessProperty: "error" }
    )
    expect(persisted.entries).toHaveLength(3)

    await runCatalog(directory, (catalog) => Effect.gen(function*() {
      yield* catalog.initialize
      expect(yield* catalog.acquire({ key: pluginUnique.release.key, target: { type: "plugin", format: "claude_code_v4" } }))
        .toEqual({ type: "plugin", release: pluginUnique.release, bundle })
      expect(yield* catalog.acquire({ key: mcpUnique.release.key, target: { type: "mcp" } }))
        .toEqual({ type: "mcp", release: mcpUnique.release, contract: mcpUniqueExpected })
      const shared = pluginConflictResult.type === "admitted"
        ? yield* catalog.acquire({ key: sharedKey, target: { type: "plugin", format: "claude_code_v4" } })
        : yield* catalog.acquire({ key: sharedKey, target: { type: "mcp" } })
      expect(shared.type).toBe(pluginConflictResult.type === "admitted" ? "plugin" : "mcp")
    }))
  })
})

it("imports pinned MCP archives strictly and leaves the catalog untouched on every rejected input", async () => {
  await withDirectory(async (root) => {
    const contract = applicationContract("acme", "http-billing")
    const packed = packContractArtifact(
      makeKey("http-billing", "approved-1"),
      "1.0.0",
      "https://artifacts.example.test/http-billing/template.json",
      contract
    )
    const correctBytes = new Uint8Array(packed.bytes)
    const wrongKindBytes = new TextEncoder().encode(JSON.stringify({ schema: 1, bundles: [] }))
    const bodies = new Map<string, Uint8Array>([
      ["/valid", correctBytes],
      ["/wrong-kind", wrongKindBytes],
      ["/bad-pin", correctBytes],
      ["/wrong-binding", correctBytes]
    ])
    const directory = join(root, "catalog")
    await withHttpServer(bodies, async (origin) => {
      await runCatalog(directory, (catalog) => catalog.initialize)
      const file = join(directory, "catalog.json")
      const before = await readFile(file)
      const validRelease = withArtifactLocation(packed.release, `${origin}/valid`, sha256(correctBytes))
      const wrongKindRelease = withArtifactLocation(packed.release, `${origin}/wrong-kind`, sha256(wrongKindBytes))
      const badPinRelease = withArtifactLocation(packed.release, `${origin}/bad-pin`, "f".repeat(64))
      const wrongBindingRelease = Schema.decodeSync(ArtifactMcpRelease)({
        ...withArtifactLocation(packed.release, `${origin}/wrong-binding`, sha256(correctBytes)),
        contents: { ...packed.release.contents, service: "other-service" }
      })

      const wrongKindError = await runCatalog(directory, (catalog) => Effect.flip(catalog.import(wrongKindRelease)))
      expect(wrongKindError).toBeInstanceOf(ArtifactRejected)
      if (!(wrongKindError instanceof ArtifactRejected)) throw wrongKindError
      expect(wrongKindError.reason).toBe("invalid_archive")
      expect(await readFile(file)).toEqual(before)

      const badPinError = await runCatalog(directory, (catalog) => Effect.flip(catalog.import(badPinRelease)))
      expect(badPinError).toBeInstanceOf(ArtifactRejected)
      if (!(badPinError instanceof ArtifactRejected)) throw badPinError
      expect(badPinError.reason).toBe("digest_mismatch")
      expect(await readFile(file)).toEqual(before)

      const bindingError = await runCatalog(directory, (catalog) => Effect.flip(catalog.import(wrongBindingRelease)))
      expect(bindingError).toBeInstanceOf(ContractRejected)
      if (!(bindingError instanceof ContractRejected)) throw bindingError
      expect(bindingError.reason).toEqual({ type: "binding", issues: ["service_mismatch"] })
      expect(await readFile(file)).toEqual(before)

      expect(await runCatalog(directory, (catalog) => catalog.import(validRelease))).toEqual({ type: "admitted" })
      await runCatalog(directory, (catalog) => Effect.gen(function*() {
        yield* catalog.initialize
        const acquired = yield* catalog.acquire({ key: validRelease.key, target: { type: "mcp" } })
        expect(acquired).toEqual({ type: "mcp", release: validRelease, contract: unpackMcpArchive(correctBytes).contract })
      }))
    })
  })
})
