import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { createServer, type Server } from "node:http"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { ArtifactMcpRelease, ArtifactPluginRelease, Admission, McpArchive, McpContract, PackageArchive } from "../contracts/Registry.ts"
import { Bundle } from "../contracts/Compiler.ts"
import { parseJson } from "../src/internal/json.ts"

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const definitionPath = fileURLToPath(new URL("./fixtures/plugins/automation.json", import.meta.url))
const reviewedMcpContract = {
  schema: 1,
  organization: "acme",
  service: "notes-tools",
  protocol: "2025-11-25",
  tools: [
    {
      name: "write_note",
      title: "Write note",
      description: "Store a note.",
      inputSchema: {
        type: "object",
        properties: { content: { type: "string" } },
        required: ["content"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, "example.com/review": "approved" },
      _meta: { "example.com/source": { revision: 4 } },
      "example.com/tool-extension": { visibility: "internal" }
    },
    {
      name: "read_note",
      title: "Read note",
      description: "Read a note.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      _meta: { "example.com/source": { revision: 4 } }
    }
  ]
}

type CliResult = {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

const runCli = (directory: string, args: ReadonlyArray<string>): Promise<CliResult> => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["--experimental-strip-types", cliPath, ...args], {
    cwd: directory,
    stdio: ["ignore", "pipe", "pipe"]
  })
  let stdout = ""
  let stderr = ""
  let timedOut = false
  let settled = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill("SIGKILL")
  }, 15_000)
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
  child.once("error", (cause) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    reject(cause)
  })
  child.once("close", (status) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    if (timedOut) {
      reject(new Error(`CLI child exceeded the 15 second timeout: ${stderr}`))
      return
    }
    resolve({ status, stdout, stderr })
  })
})

const withTempDirectory = async <A>(run: (directory: string) => Promise<A>): Promise<A> => {
  const directory = await mkdtemp(join(tmpdir(), "pluginsdk-catalog-cli-"))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const buildBundles = async (directory: string): Promise<ReadonlyArray<{ readonly bundle: Bundle; readonly path: string }>> => {
  const output = join(directory, "build")
  const result = await runCli(directory, ["build", definitionPath, "--out", output, "--json"])
  expect(result.status, result.stderr).toBe(0)
  const bundles = result.stdout.trim().split("\n").map((line) => Schema.decodeUnknownSync(Bundle)(parseJson(line)))
  expect(bundles.map((bundle) => bundle.format)).toEqual(["claude_code", "codex"])
  return bundles.map((bundle, index) => ({
    bundle,
    path: join(output, index === 0 ? "claude_code.bundle.json" : "codex.bundle.json")
  }))
}

const pack = async (
  directory: string,
  bundles: ReadonlyArray<{ readonly bundle: Bundle; readonly path: string }>,
  location: string,
  name: string
) => {
  const archive = join(directory, `${name}.archive.json`)
  const result = await runCli(directory, [
    "catalog", "pack", ...bundles.map(({ path }) => path),
    "--organization", "acme",
    "--integration", "internal-app",
    "--release", "approved-1",
    "--location", location,
    "--out", archive,
    "--json"
  ])
  expect(result.status, result.stderr).toBe(0)
  const release = Schema.decodeUnknownSync(ArtifactPluginRelease, { onExcessProperty: "error" })(parseJson(result.stdout))
  return { archive, release, result }
}

const withListeningServer = async <A>(server: Server, run: (port: number) => Promise<A>): Promise<A> => {
  await new Promise<void>((resolve, reject) => {
    const onError = (cause: Error) => {
      server.off("listening", onListening)
      reject(cause)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }
    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(0, "127.0.0.1")
  })
  try {
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("HTTP fixture did not bind a TCP port")
    return await run(address.port)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
    })
  }
}

it("packs canonical bundles, admits local packages, acquires exact outputs, and reports replay or conflict", async () => {
  await withTempDirectory(async (directory) => {
    const bundles = await buildBundles(directory)
    const location = "https://artifacts.example.test/internal-app/approved-1.json"
    const first = await pack(directory, bundles, location, "first")
    const second = await pack(directory, [...bundles].reverse(), location, "reversed")
    const firstBytes = await readFile(first.archive)
    const secondBytes = await readFile(second.archive)
    expect(secondBytes).toEqual(firstBytes)
    expect(second.release).toEqual(first.release)

    const independentDigest = createHash("sha256").update(firstBytes).digest("hex")
    expect(first.release.origin).toEqual({ type: "artifact", location, digest: independentDigest })
    const packageArchive = Schema.decodeUnknownSync(PackageArchive, { onExcessProperty: "error" })(
      parseJson(new TextDecoder("utf-8", { fatal: true }).decode(firstBytes))
    )
    expect(packageArchive.bundles.map((bundle) => bundle.format)).toEqual(["claude_code", "codex"])
    expect(packageArchive.bundles).toEqual(bundles.map(({ bundle }) => bundle))

    const rejectedArchive = join(directory, "invalid.archive.json")
    const invalidBundle = join(directory, "invalid.bundle.json")
    await writeFile(invalidBundle, "{}")
    const rejectedPack = await runCli(directory, [
      "catalog", "pack", invalidBundle, "--organization", "acme", "--integration", "internal-app",
      "--release", "approved-1", "--location", location, "--out", rejectedArchive
    ])
    expect(rejectedPack.status).not.toBe(0)
    await expect(readFile(rejectedArchive)).rejects.toThrow()

    const store = join(directory, "catalog-store")
    const initialized = await runCli(directory, ["catalog", "init", "--directory", store, "--json"])
    expect(initialized.status, initialized.stderr).toBe(0)
    expect(parseJson(initialized.stdout)).toEqual({ type: "initialized" })

    const releasePath = join(directory, "approved.release.json")
    await writeFile(releasePath, first.result.stdout)
    const bundleFlags = bundles.flatMap(({ path }) => ["--bundle", path])
    const wrongKindContractPath = join(directory, "wrong-kind.contract.json")
    await writeFile(wrongKindContractPath, JSON.stringify(reviewedMcpContract))
    const wrongKindAdmission = await runCli(directory, [
      "catalog", "admit", releasePath, "--contract", wrongKindContractPath, "--directory", store, "--json"
    ])
    expect(wrongKindAdmission.status).not.toBe(0)
    expect(wrongKindAdmission.stderr).toContain("do not accept --contract")

    const admitted = await runCli(directory, ["catalog", "admit", releasePath, ...bundleFlags, "--directory", store, "--json"])
    expect(admitted.status, admitted.stderr).toBe(0)
    expect(Schema.decodeUnknownSync(Admission)(parseJson(admitted.stdout))).toEqual({ type: "admitted" })

    const unchanged = await runCli(directory, ["catalog", "admit", releasePath, ...bundleFlags, "--directory", store, "--json"])
    expect(unchanged.status, unchanged.stderr).toBe(0)
    expect(Schema.decodeUnknownSync(Admission)(parseJson(unchanged.stdout))).toEqual({ type: "unchanged" })

    for (const { bundle } of bundles) {
      const acquiredPath = join(directory, `${bundle.format}.acquired.json`)
      const acquired = await runCli(directory, [
        "catalog", "acquire", "acme", "internal-app", "approved-1", "--format", bundle.format,
        "--directory", store, "--out", acquiredPath, "--json"
      ])
      expect(acquired.status, acquired.stderr).toBe(0)
      expect(Schema.decodeUnknownSync(Bundle)(parseJson(acquired.stdout))).toEqual(bundle)
      expect(Schema.decodeUnknownSync(Bundle)(parseJson(await readFile(acquiredPath, "utf8")))).toEqual(bundle)
    }

    const conflicting = Schema.decodeSync(ArtifactPluginRelease)({
      ...first.release,
      origin: { ...first.release.origin, location: `${location}?review=changed` }
    })
    const conflictPath = join(directory, "conflict.release.json")
    await writeFile(conflictPath, JSON.stringify(Schema.encodeSync(ArtifactPluginRelease)(conflicting)))
    const conflict = await runCli(directory, ["catalog", "admit", conflictPath, ...bundleFlags, "--directory", store, "--json"])
    expect(conflict.status).not.toBe(0)
    expect(Schema.decodeUnknownSync(Admission)(parseJson(conflict.stdout))).toEqual({ type: "conflict" })
  })
})

it("imports over loopback HTTP, rejects a wrong pin and malformed metadata, and leaves blocked acquisition output absent", async () => {
  await withTempDirectory(async (directory) => {
    const bundles = await buildBundles(directory)
    const claudeBundle = bundles.find(({ bundle }) => bundle.format === "claude_code")
    if (claudeBundle === undefined) throw new Error("Compiler fixture has no Claude package")
    let archiveBytes: Uint8Array | undefined
    const server = createServer((request, response) => {
      if (request.url !== "/artifact.json" || archiveBytes === undefined) {
        response.writeHead(404)
        response.end()
        return
      }
      response.writeHead(200, { "content-type": "application/json" })
      response.end(archiveBytes)
    })

    await withListeningServer(server, async (port) => {
      const location = `http://127.0.0.1:${port}/artifact.json`
      const packed = await pack(directory, [claudeBundle], location, "http")
      archiveBytes = await readFile(packed.archive)
      const store = join(directory, "http-catalog")
      const initialized = await runCli(directory, ["catalog", "init", "--directory", store])
      expect(initialized.status, initialized.stderr).toBe(0)

      const releasePath = join(directory, "http.release.json")
      await writeFile(releasePath, packed.result.stdout)
      const imported = await runCli(directory, ["catalog", "import", releasePath, "--directory", store, "--json"])
      expect(imported.status, imported.stderr).toBe(0)
      expect(Schema.decodeUnknownSync(Admission)(parseJson(imported.stdout))).toEqual({ type: "admitted" })

      const replayed = await runCli(directory, ["catalog", "import", releasePath, "--directory", store, "--json"])
      expect(replayed.status, replayed.stderr).toBe(0)
      expect(Schema.decodeUnknownSync(Admission)(parseJson(replayed.stdout))).toEqual({ type: "unchanged" })

      const availableOutput = join(directory, "available.bundle.json")
      const available = await runCli(directory, [
        "catalog", "acquire", "acme", "internal-app", "approved-1", "--format", "claude_code",
        "--directory", store, "--out", availableOutput, "--json"
      ])
      expect(available.status, available.stderr).toBe(0)
      expect(Schema.decodeUnknownSync(Bundle)(parseJson(available.stdout))).toEqual(claudeBundle.bundle)

      const catalogPath = join(store, "catalog.json")
      const retainedBeforeRejection = await readFile(catalogPath)
      const wrongDigest = packed.release.origin.digest === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64)
      const wrongPin = Schema.decodeSync(ArtifactPluginRelease)({
        ...packed.release,
        origin: { ...packed.release.origin, digest: wrongDigest }
      })
      const wrongPinPath = join(directory, "wrong-pin.release.json")
      await writeFile(wrongPinPath, JSON.stringify(Schema.encodeSync(ArtifactPluginRelease)(wrongPin)))
      const rejectedPin = await runCli(directory, ["catalog", "import", wrongPinPath, "--directory", store])
      expect(rejectedPin.status).not.toBe(0)
      expect(rejectedPin.stderr).toContain("digest mismatch")
      expect(await readFile(catalogPath)).toEqual(retainedBeforeRejection)

      const malformedPath = join(directory, "malformed.release.json")
      await writeFile(malformedPath, "{\"key\": {}}")
      const malformed = await runCli(directory, ["catalog", "import", malformedPath, "--directory", store])
      expect(malformed.status).not.toBe(0)
      expect(await readFile(catalogPath)).toEqual(retainedBeforeRejection)

      const blockedOutput = join(directory, "blocked.bundle.json")
      const blocked = await runCli(directory, [
        "catalog", "acquire", "acme", "internal-app", "approved-1", "--format", "codex",
        "--directory", store, "--out", blockedOutput, "--json"
      ])
      expect(blocked.status).not.toBe(0)
      expect(blocked.stderr).toContain("format_unavailable")
      await expect(readFile(blockedOutput)).rejects.toThrow()
    })
  })
})

it("packs, admits, imports, and acquires reviewed MCP contracts while rejecting mixed CLI inputs", async () => {
  await withTempDirectory(async (directory) => {
    const contractPath = join(directory, "reviewed-contract.json")
    await writeFile(contractPath, JSON.stringify(reviewedMcpContract))
    let archiveBytes: Uint8Array | undefined
    const server = createServer((request, response) => {
      if (request.url !== "/mcp.json" || archiveBytes === undefined) {
        response.writeHead(404)
        response.end()
        return
      }
      response.writeHead(200, { "content-type": "application/json" })
      response.end(archiveBytes)
    })

    await withListeningServer(server, async (port) => {
      const location = `http://127.0.0.1:${port}/mcp.json`
      const archivePath = join(directory, "notes-tools.archive.json")
      const packed = await runCli(directory, [
        "catalog", "pack-contract", contractPath,
        "--integration", "notes-app", "--release", "approved-1", "--version", "1.2.0",
        "--location", location, "--out", archivePath, "--json"
      ])
      expect(packed.status, packed.stderr).toBe(0)
      const release = Schema.decodeUnknownSync(ArtifactMcpRelease, { onExcessProperty: "error" })(parseJson(packed.stdout))
      expect(release.key).toEqual({ organization: "acme", integration: "notes-app", release: "approved-1" })
      expect(release.version).toBe("1.2.0")
      expect(release.contents).toMatchObject({ type: "mcp", service: "notes-tools" })

      archiveBytes = await readFile(archivePath)
      const archive = Schema.decodeUnknownSync(McpArchive, { onExcessProperty: "error" })(
        parseJson(new TextDecoder("utf-8", { fatal: true }).decode(archiveBytes))
      )
      expect(archive.type).toBe("mcp")
      expect(archive.contract.tools.map((tool) => tool.name)).toEqual(["read_note", "write_note"])
      expect(archive.contract.tools[1]).toMatchObject({
        annotations: { readOnlyHint: false, "example.com/review": "approved" },
        _meta: { "example.com/source": { revision: 4 } },
        "example.com/tool-extension": { visibility: "internal" }
      })

      const releasePath = join(directory, "notes-tools.release.json")
      await writeFile(releasePath, packed.stdout)
      const localStore = join(directory, "local-mcp-catalog")
      const initialized = await runCli(directory, ["catalog", "init", "--directory", localStore, "--json"])
      expect(initialized.status, initialized.stderr).toBe(0)
      const admitted = await runCli(directory, [
        "catalog", "admit", releasePath, "--contract", contractPath, "--directory", localStore, "--json"
      ])
      expect(admitted.status, admitted.stderr).toBe(0)
      expect(Schema.decodeUnknownSync(Admission)(parseJson(admitted.stdout))).toEqual({ type: "admitted" })

      const acquiredPath = join(directory, "local-mcp-contract.json")
      const acquired = await runCli(directory, [
        "catalog", "acquire", "acme", "notes-app", "approved-1", "--contract",
        "--directory", localStore, "--out", acquiredPath, "--json"
      ])
      expect(acquired.status, acquired.stderr).toBe(0)
      const acquiredContract = Schema.decodeUnknownSync(McpContract, { onExcessProperty: "error" })(parseJson(acquired.stdout))
      expect(acquiredContract).toEqual(archive.contract)
      expect(Schema.decodeUnknownSync(McpContract, { onExcessProperty: "error" })(parseJson(await readFile(acquiredPath, "utf8"))))
        .toEqual(archive.contract)

      const mixedAdmit = await runCli(directory, [
        "catalog", "admit", releasePath, "--bundle", contractPath, "--contract", contractPath,
        "--directory", localStore, "--json"
      ])
      expect(mixedAdmit.status).not.toBe(0)
      expect(mixedAdmit.stderr).toContain("do not accept --bundle")

      const mixedAcquirePath = join(directory, "mixed-acquire.json")
      const mixedAcquire = await runCli(directory, [
        "catalog", "acquire", "acme", "notes-app", "approved-1", "--format", "codex", "--contract",
        "--directory", localStore, "--out", mixedAcquirePath
      ])
      expect(mixedAcquire.status).not.toBe(0)
      expect(mixedAcquire.stderr).toContain("Choose exactly one")
      await expect(readFile(mixedAcquirePath)).rejects.toThrow()

      const missingAcquireTarget = await runCli(directory, [
        "catalog", "acquire", "acme", "notes-app", "approved-1", "--directory", localStore,
        "--out", join(directory, "missing-target.json")
      ])
      expect(missingAcquireTarget.status).not.toBe(0)
      expect(missingAcquireTarget.stderr).toContain("Choose exactly one")

      const missingMcpContract = await runCli(directory, [
        "catalog", "admit", releasePath, "--directory", localStore, "--json"
      ])
      expect(missingMcpContract.status).not.toBe(0)
      expect(missingMcpContract.stderr).toContain("MCP releases require --contract")

      const importedStore = join(directory, "imported-mcp-catalog")
      const importedInit = await runCli(directory, ["catalog", "init", "--directory", importedStore, "--json"])
      expect(importedInit.status, importedInit.stderr).toBe(0)
      const imported = await runCli(directory, ["catalog", "import", releasePath, "--directory", importedStore, "--json"])
      expect(imported.status, imported.stderr).toBe(0)
      expect(Schema.decodeUnknownSync(Admission)(parseJson(imported.stdout))).toEqual({ type: "admitted" })

      const importedOutputPath = join(directory, "imported-mcp-contract.json")
      const importedAcquire = await runCli(directory, [
        "catalog", "acquire", "acme", "notes-app", "approved-1", "--contract",
        "--directory", importedStore, "--out", importedOutputPath, "--json"
      ])
      expect(importedAcquire.status, importedAcquire.stderr).toBe(0)
      expect(Schema.decodeUnknownSync(McpContract, { onExcessProperty: "error" })(parseJson(importedAcquire.stdout)))
        .toEqual(archive.contract)
      expect(Schema.decodeUnknownSync(McpContract, { onExcessProperty: "error" })(parseJson(await readFile(importedOutputPath, "utf8"))))
        .toEqual(archive.contract)
    })
  })
})
