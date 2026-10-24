import { Schema } from "effect"
import { Bundle } from "./Compiler.ts"
import { FileDigest } from "./CompilerModel.ts"
import { Plugin } from "./Plugin.ts"
import { LocalClient as ManagedClient } from "./Clients.ts"

export const LocalClient = ManagedClient
export type LocalClient = typeof LocalClient.Type

const gitRepository = (value: string): boolean => {
  if (!value.isWellFormed() || value.trim() !== value) return false
  for (const character of value) if (character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) return false
  if (value.startsWith("/")) return true
  if (/^[A-Za-z0-9_-]+@[A-Za-z0-9.-]+:[A-Za-z0-9_./~-]+$/.test(value)) return true
  try {
    const url = new URL(value)
    if (url.password !== "" || url.search !== "" || url.hash !== "") return false
    if (url.protocol === "https:") return url.username === "" && url.hostname !== "" && url.pathname !== "/"
    if (url.protocol === "ssh:") return url.hostname !== "" && /^\/[A-Za-z0-9_./~-]+$/.test(url.pathname)
    return url.protocol === "file:" && url.username === "" && (url.hostname === "" || url.hostname === "localhost")
  } catch {
    return false
  }
}

export const GitRepository = Schema.NonEmptyString.check(Schema.makeFilter(gitRepository, {
  expected: "an HTTPS or SSH Git URL without embedded credentials, or an absolute local repository path"
})).pipe(Schema.brand("pluginsdk/GitRepository"))
export type GitRepository = typeof GitRepository.Type

export const GitBranch = Schema.NonEmptyString.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/),
  Schema.makeFilter((value) => !value.includes("..") && !value.includes("//") &&
    value.split("/").every((part) => part !== "" && !part.startsWith(".") && !part.endsWith(".") && !part.endsWith(".lock")),
  { expected: "a Git branch name" })
).pipe(Schema.brand("pluginsdk/GitBranch"))
export type GitBranch = typeof GitBranch.Type

export const MarketplaceName = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), Schema.isBetweenLength(1, 64)
).pipe(Schema.brand("pluginsdk/MarketplaceName"))
export type MarketplaceName = typeof MarketplaceName.Type

export const GitPublication = Schema.Struct({
  type: Schema.Literal("git"),
  repository: GitRepository,
  branch: GitBranch,
  marketplace: MarketplaceName
})
export type GitPublication = typeof GitPublication.Type

export const ProjectDefinition = Schema.Struct({ ...Plugin.fields, publish: Schema.optionalKey(GitPublication) })
export type ProjectDefinition = typeof ProjectDefinition.Type

export const BuildSnapshot = Schema.Struct({
  schema: Schema.Literal(1),
  definition: FileDigest,
  plugin: Plugin.fields.id,
  version: Plugin.fields.version,
  bundles: Schema.NonEmptyArray(Bundle)
})
export type BuildSnapshot = typeof BuildSnapshot.Type

export const LocalPreviewStatus = Schema.Literals(["missing", "unchanged", "installed", "removed", "not_applied", "uncertain"])
export type LocalPreviewStatus = typeof LocalPreviewStatus.Type

export const DirectPreviewClient = Schema.Struct({
  client: LocalClient,
  home: Schema.String,
  status: LocalPreviewStatus
})
export type DirectPreviewClient = typeof DirectPreviewClient.Type

export const InheritedPreviewClient = Schema.Struct({
  client: Schema.Literal("cursor"),
  home: Schema.String,
  status: Schema.Literal("inherited"),
  provider: Schema.Struct({ client: Schema.Literal("claude_code"), home: Schema.String })
})
export type InheritedPreviewClient = typeof InheritedPreviewClient.Type

export const PreviewClient = Schema.Union([DirectPreviewClient, InheritedPreviewClient])
export type PreviewClient = typeof PreviewClient.Type

export const PreviewResult = Schema.Struct({ plugin: Plugin.fields.id, clients: Schema.Array(PreviewClient) })
export type PreviewResult = typeof PreviewResult.Type

export class ProjectError extends Schema.TaggedError<ProjectError, { readonly brand: unique symbol }>()("ProjectError", {
  detail: Schema.NonEmptyString
}) {}
