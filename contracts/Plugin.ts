import { Schema } from "effect"

export const PluginId = Schema.String.check(
  Schema.isBetweenLength(1, 64),
  Schema.isPattern(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/)
).pipe(Schema.brand("pluginsdk/PluginId"))
export type PluginId = typeof PluginId.Type

export const Directory = Schema.NonEmptyString.pipe(Schema.brand("pluginsdk/Directory"))
export type Directory = typeof Directory.Type

export const PackagePath = Schema.String.check(
  Schema.isPattern(/^(?![A-Za-z]:)[^/\\\u0000]+(?:\/[^/\\\u0000]+)*$/),
  Schema.makeFilter(
    (path) => path.split("/").every((segment) => segment !== "." && segment !== ".."),
    { expected: "a package path without dot segments" }
  )
).pipe(Schema.brand("pluginsdk/PackagePath"))
export type PackagePath = typeof PackagePath.Type

export const HeaderName = Schema.String.check(
  Schema.isPattern(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/)
).pipe(Schema.brand("pluginsdk/HeaderName"))
export type HeaderName = typeof HeaderName.Type

export const HeaderText = Schema.String.check(Schema.isPattern(/^[\t\x20-\x7e\x80-\xff]*$/))
export type HeaderText = typeof HeaderText.Type

export const EnvironmentName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/)
).pipe(Schema.brand("pluginsdk/EnvironmentName"))
export type EnvironmentName = typeof EnvironmentName.Type

export const EnvironmentHeader = Schema.Struct({
  type: Schema.Literal("environment"),
  name: EnvironmentName,
  prefix: HeaderText
})
export type EnvironmentHeader = typeof EnvironmentHeader.Type

export const HeaderValue = Schema.Union([HeaderText, EnvironmentHeader])
export type HeaderValue = typeof HeaderValue.Type

export const RemoteMcp = Schema.Struct({
  url: Schema.URLFromString.check(
    Schema.makeFilter(
      (url) => url.username === "" && url.password === "" && !url.href.includes("#") && !url.href.includes("${"),
      { expected: "a literal endpoint without credentials or a fragment" }
    ),
    Schema.makeFilter(
      (url) => url.protocol === "https:" || (url.protocol === "http:" && (
        url.hostname === "localhost" || url.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
      )),
      { expected: "an HTTPS or loopback HTTP URL" }
    ),
  ),
  headers: Schema.Record(HeaderName, HeaderValue)
})
export type RemoteMcp = typeof RemoteMcp.Type

export const Plugin = Schema.Struct({
  id: PluginId,
  version: Schema.NonEmptyString,
  description: Schema.NonEmptyString,
  skills: Schema.Array(PackagePath),
  assets: Schema.optionalKey(Schema.Array(PackagePath)),
  mcp: Schema.Record(Schema.NonEmptyString, RemoteMcp)
})
export type Plugin = typeof Plugin.Type
export type PluginDefinition = typeof Plugin.Encoded
