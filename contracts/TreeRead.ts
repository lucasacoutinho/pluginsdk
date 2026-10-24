import { Schema } from "effect"
import * as Files from "./FileRead.ts"

export const Policy = Schema.Literals(["source", "payload"])
export type Policy = typeof Policy.Type
export const ReparseTag = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 0xffff_ffff })
).pipe(Schema.brand("pluginsdk/TreeReparseTag"))
export type ReparseTag = typeof ReparseTag.Type
export const ReparseInfo = Schema.Struct({ identity: Files.Identity, path: Files.FinalPath, tag: ReparseTag })
export type ReparseInfo = typeof ReparseInfo.Type
export const EntryObservation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("unavailable") }),
  Schema.Struct({ type: Schema.Literal("directory"), anchor: Files.Anchor }),
  Schema.Struct({ type: Schema.Literal("file"), info: Files.FileInfo }),
  Schema.Struct({ type: Schema.Literal("reparse"), info: ReparseInfo }),
  Schema.Struct({ type: Schema.Literal("other") })
]).pipe(Schema.toTaggedUnion("type"))
export type EntryObservation = typeof EntryObservation.Type
export const Branch = Schema.Struct({ parent: Files.Anchor, ancestors: Schema.Array(Files.Anchor) })
export type Branch = typeof Branch.Type
export const EntryInput = Schema.Struct({
  policy: Policy, root: Files.Anchor, branch: Branch, name: Files.Component,
  entry: EntryObservation, target: Files.Observation
})
export type EntryInput = typeof EntryInput.Type
export const EntryDecision = Schema.Literals([
  "accepted", "unavailable", "not_regular", "stream", "changed", "outside", "name_mismatch", "reparse", "cycle"
])
export type EntryDecision = typeof EntryDecision.Type

export const DirectoryInfo = Schema.Struct({ anchor: Files.Anchor, modified: Files.Quantity, changed: Files.Quantity })
export type DirectoryInfo = typeof DirectoryInfo.Type
export const DirectoryObservation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("unavailable") }),
  Schema.Struct({ type: Schema.Literal("directory"), info: DirectoryInfo }),
  Schema.Struct({ type: Schema.Literal("other") })
]).pipe(Schema.toTaggedUnion("type"))
export type DirectoryObservation = typeof DirectoryObservation.Type
export const DirectorySnapshot = Schema.Struct({ root: Files.Observation, directory: DirectoryObservation })
export type DirectorySnapshot = typeof DirectorySnapshot.Type
export const Enumeration = Schema.Union([
  Schema.Struct({ type: Schema.Literal("complete"), names: Schema.Array(Files.Component) }),
  Schema.Struct({ type: Schema.Literal("failed") })
]).pipe(Schema.toTaggedUnion("type"))
export type Enumeration = typeof Enumeration.Type
export const DirectoryInput = Schema.Struct({
  root: Files.Anchor, directory: Files.Anchor, before: DirectorySnapshot, after: DirectorySnapshot,
  enumeratedBefore: Enumeration, enumeratedAfter: Enumeration, visited: Schema.Array(Files.Component)
})
export type DirectoryInput = typeof DirectoryInput.Type
export const DirectoryDecision = Schema.Literals([
  "accepted", "unavailable", "not_directory", "stream", "changed", "outside", "duplicate", "incomplete"
])
export type DirectoryDecision = typeof DirectoryDecision.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("tree_entry"), input: EntryInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("tree_directory"), input: DirectoryInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type
export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("tree_entry"), output: EntryDecision }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("tree_directory"), output: DirectoryDecision })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
