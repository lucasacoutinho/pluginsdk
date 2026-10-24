import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import { Effect, Match, Schema, Stream } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import type { HttpClientResponse } from "effect/http/HttpClientResponse"
import { ArtifactDigest, FormatDigests, ReleaseKey } from "../../../contracts/Catalog.ts"
import { Bundle, type Bundle as BundleType } from "../../../contracts/Compiler.ts"
import {
  ArtifactMcpRelease,
  ArtifactPluginRelease,
  ArtifactRejected,
  ArtifactUnavailable,
  CatalogInputRejected,
  McpArchive,
  PackageArchive,
  type AdmissionRequest,
  type ArtifactRelease,
  type ArtifactPluginRelease as ArtifactPluginReleaseType,
  type PackageArchive as PackageArchiveType
} from "../../../contracts/Registry.ts"
import { McpContract } from "../../../contracts/ToolContract.ts"
import { validateBundle } from "../../compiler/package/native.ts"
import { copyBundle, sha256 } from "../../internal/identity.ts"
import { jsonBytes, parseJsonBytes } from "../../internal/json.ts"
import { captureRelease, rejectAdmission } from "../entries.ts"
import { captureContract } from "../tools/contracts.ts"

export const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024

const ARTIFACT_TIMEOUT = "30 seconds"

const ArtifactPackInput = Schema.Struct({
  key: ReleaseKey,
  location: Schema.NonEmptyString,
  bundles: Schema.Array(Bundle)
})
const ContractPackInput = Schema.Struct({ key: ReleaseKey, version: Schema.NonEmptyString, location: Schema.NonEmptyString, contract: McpContract })

const validateArtifactLocation = (location: string): URL => {
  if (location.trim() !== location || location.includes("${") || location.includes("#")) {
    throw new TypeError("Artifact location is not an absolute HTTPS or loopback HTTP URL")
  }
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(location)) {
    throw new TypeError("Artifact location must be an absolute URL")
  }
  const authority = location.slice(location.indexOf("://") + 3).split(/[/?#]/, 1)[0]
  if (authority?.includes("@")) throw new TypeError("Artifact location cannot contain user information")
  const url = new URL(location)
  if (url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new TypeError("Artifact location cannot contain credentials or a fragment")
  }
  const hostname = url.hostname.toLowerCase()
  const loopback = hostname === "localhost" || hostname === "[::1]" ||
    /^127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new TypeError("Artifact location must use HTTPS or loopback HTTP")
  }
  return url
}

export const rejectArtifact = (
  cause: unknown
): ArtifactRejected | ReturnType<typeof rejectAdmission> =>
  cause instanceof ArtifactRejected ? cause : rejectAdmission(cause)

const collectBytes = (response: HttpClientResponse, location: string) =>
  Stream.runFoldEffect(
    Stream.mapError(response.stream, (cause) => new ArtifactUnavailable({ location, cause })),
    (): { chunks: Array<Uint8Array>; length: number } => ({ chunks: [], length: 0 }),
    (accumulator, chunk) => {
      if (chunk.byteLength > MAX_ARTIFACT_BYTES - accumulator.length) {
        return Effect.fail(new ArtifactRejected({ reason: "too_large" }))
      }
      return Effect.sync(() => {
        accumulator.chunks.push(new Uint8Array(chunk))
        accumulator.length += chunk.byteLength
        return accumulator
      })
    }
  ).pipe(Effect.map(({ chunks, length }) => {
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  }))

const decodeArchive = (bytes: Uint8Array, release: ArtifactRelease): AdmissionRequest => {
  const json = parseJsonBytes(bytes)
  return Match.value(release.contents).pipe(Match.discriminatorsExhaustive("type")({
    plugin: (contents): AdmissionRequest => {
      const archive = Schema.decodeUnknownSync(PackageArchive, { onExcessProperty: "error" })(json)
      return { type: "plugin", release: { ...release, contents }, bundles: archive.bundles.map(copyBundle) }
    },
    mcp: (contents): AdmissionRequest => {
      const archive = Schema.decodeUnknownSync(McpArchive, { onExcessProperty: "error" })(json)
      return { type: "mcp", release: { ...release, contents }, contract: archive.contract }
    }
  }))
}

export const acquireArtifact = Effect.fn("ReleaseCatalog.acquireArtifact")(function*(release: ArtifactRelease) {
  const url = yield* Effect.try({
    try: () => validateArtifactLocation(release.origin.location),
    catch: (cause) => new CatalogInputRejected({ cause })
  })
  const unavailable = (cause: unknown) => new ArtifactUnavailable({ location: release.origin.location, cause })
  const program = Effect.gen(function*() {
    const response = yield* HttpClient.get(url).pipe(Effect.mapError(unavailable))
    if (response.status !== 200) {
      return yield* unavailable(new Error(`Unexpected HTTP status ${response.status}`))
    }
    const contentLength = response.headers["content-length"]
    if (contentLength !== undefined && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_ARTIFACT_BYTES) {
      return yield* new ArtifactRejected({ reason: "too_large" })
    }
    const bytes = yield* collectBytes(response, release.origin.location)
    if (sha256(bytes) !== release.origin.digest) {
      return yield* new ArtifactRejected({ reason: "digest_mismatch" })
    }
    return yield* Effect.try({
      try: () => decodeArchive(bytes, release),
      catch: () => new ArtifactRejected({ reason: "invalid_archive" })
    })
  })
  const configured = Effect.provideService(program, NodeHttpClient.UndiciOptions, {})
  const withClient = Effect.provide(configured, NodeHttpClient.layerUndici)
  return yield* withClient.pipe(
    Effect.timeoutOrElse({
      duration: ARTIFACT_TIMEOUT,
      orElse: () => Effect.fail(unavailable(new Error(`Artifact acquisition timed out after ${ARTIFACT_TIMEOUT}`)))
    }),
    Effect.scoped
  )
})

export const packArtifact = (
  key: ReleaseKey,
  location: string,
  bundles: ReadonlyArray<BundleType>
): { readonly release: ArtifactPluginReleaseType; readonly bytes: Uint8Array } => {
  try {
    const input = Schema.decodeSync(Schema.toType(ArtifactPackInput), { onExcessProperty: "error" })(
      structuredClone({ key, location, bundles })
    )
    validateArtifactLocation(input.location)
    const sortedBundles = input.bundles.map(copyBundle).sort((left, right) =>
      left.format < right.format ? -1 : left.format > right.format ? 1 : 0
    )
    const [firstBundle, ...remainingBundles] = sortedBundles
    if (firstBundle === undefined) throw new TypeError("Artifact bundle list must be nonempty")
    const archive: PackageArchiveType = { schema: 1, bundles: [firstBundle, ...remainingBundles] }
    const bytes = jsonBytes(Schema.encodeSync(Schema.toCodecJson(PackageArchive))(archive))
    if (bytes.byteLength > MAX_ARTIFACT_BYTES) throw new ArtifactRejected({ reason: "too_large" })
    const packages = Schema.decodeSync(FormatDigests)(
      Object.fromEntries(sortedBundles.map((bundle) => [bundle.format, bundle.digest]))
    )
    const release = Schema.decodeSync(Schema.toType(ArtifactPluginRelease), { onExcessProperty: "error" })({
      key: input.key,
      version: validateBundle(firstBundle).version,
      origin: { type: "artifact", location: input.location, digest: ArtifactDigest.make(sha256(bytes)) },
      contents: { type: "plugin", plugin: firstBundle.plugin, packages }
    })
    captureRelease({ type: "plugin", release, bundles: sortedBundles })
    return { release, bytes }
  } catch (cause) {
    throw rejectArtifact(cause)
  }
}

export const packContractArtifact = (
  key: ReleaseKey,
  version: string,
  location: string,
  contract: McpContract
): { readonly release: ArtifactMcpRelease; readonly bytes: Uint8Array } => {
  try {
    const input = Schema.decodeSync(Schema.toType(ContractPackInput), { onExcessProperty: "error" })(
      structuredClone({ key, version, location, contract })
    )
    validateArtifactLocation(input.location)
    const captured = captureContract(input.contract)
    const archive: McpArchive = { schema: 1, type: "mcp", contract: captured.contract }
    const bytes = jsonBytes(Schema.encodeSync(McpArchive)(archive))
    if (bytes.byteLength > MAX_ARTIFACT_BYTES) throw new ArtifactRejected({ reason: "too_large" })
    const release = Schema.decodeSync(Schema.toType(ArtifactMcpRelease), { onExcessProperty: "error" })({
      key: input.key,
      version: input.version,
      origin: { type: "artifact", location: input.location, digest: ArtifactDigest.make(sha256(bytes)) },
      contents: { type: "mcp", service: captured.contract.service, contract: captured.digest }
    })
    captureRelease({ type: "mcp", release, contract: captured.contract })
    return { release, bytes }
  } catch (cause) {
    throw rejectArtifact(cause)
  }
}
