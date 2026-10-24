import { Match, Schema } from "effect"
import * as Files from "../../../contracts/FileRead.ts"
import * as Trees from "../../../contracts/TreeRead.ts"
import { inside, parseFinalPath } from "./file.ts"

type Physical = Pick<Files.FileInfo, "identity" | "path">
const sameIdentity = Schema.toEquivalence(Files.Identity)
const samePath = Schema.toEquivalence(Files.CanonicalPath)

function plainPath(path: Files.FinalPath): Files.CanonicalPath | null {
  return Match.value(parseFinalPath(path)).pipe(Match.discriminatorsExhaustive("type")({
    plain: ({ path }) => path,
    stream: () => null,
    unsupported: () => null
  }))
}

function samePhysical(left: Physical, right: Physical): boolean {
  const leftPath = plainPath(left.path)
  const rightPath = plainPath(right.path)
  return leftPath !== null && rightPath !== null && sameIdentity(left.identity, right.identity) &&
    samePath(leftPath, rightPath)
}

function sameAnchor(left: Files.Anchor, right: Files.Anchor): boolean {
  return samePhysical(left, right) && left.caseSensitive === right.caseSensitive
}

function contained(root: Files.Anchor, node: Physical, allowRoot: boolean): boolean {
  const rootPath = plainPath(root.path)
  const nodePath = plainPath(node.path)
  return rootPath !== null && nodePath !== null && node.identity.volume === root.identity.volume &&
    (inside(rootPath, nodePath) || (allowRoot && samePath(rootPath, nodePath)))
}

function entryPhysical(entry: Trees.EntryObservation): Physical | null {
  return Match.value(entry).pipe(Match.discriminatorsExhaustive("type")({
    directory: ({ anchor }) => anchor,
    file: ({ info }) => info,
    reparse: ({ info }) => info,
    unavailable: () => null,
    other: () => null
  }))
}

function targetPhysical(target: Files.Observation): Physical | null {
  return Match.value(target).pipe(Match.discriminatorsExhaustive("type")({
    directory: ({ anchor }) => anchor,
    file: ({ info }) => info,
    unavailable: () => null,
    other: () => null
  }))
}

function directoryAnchor(observation: Files.Observation): Files.Anchor | null {
  return Match.value(observation).pipe(Match.discriminatorsExhaustive("type")({
    directory: ({ anchor }) => anchor,
    file: () => null,
    unavailable: () => null,
    other: () => null
  }))
}

function ordinaryBound(input: Trees.EntryInput): boolean {
  return Match.value(input.entry).pipe(Match.discriminatorsExhaustive("type")({
    directory: ({ anchor }) => Match.value(input.target).pipe(Match.discriminatorsExhaustive("type")({
      directory: ({ anchor: target }) => sameAnchor(anchor, target),
      file: () => false,
      unavailable: () => false,
      other: () => false
    })),
    file: ({ info }) => Match.value(input.target).pipe(Match.discriminatorsExhaustive("type")({
      file: ({ info: target }) => samePhysical(info, target),
      directory: () => false,
      unavailable: () => false,
      other: () => false
    })),
    reparse: () => true,
    unavailable: () => false,
    other: () => false
  }))
}

function linkAllowed(input: Trees.EntryInput): boolean {
  return Match.value(input.entry).pipe(Match.discriminatorsExhaustive("type")({
    reparse: ({ info }) => Match.value(input.policy).pipe(
      Match.when("source", () => info.tag === 0xa000_0003 || info.tag === 0xa000_000c),
      Match.when("payload", () => false),
      Match.exhaustive
    ),
    directory: () => true,
    file: () => true,
    unavailable: () => false,
    other: () => false
  }))
}

function cycleFree(input: Trees.EntryInput): boolean {
  const identities = [input.branch.parent, ...input.branch.ancestors].map(({ identity }) => identity)
  if (identities.some((identity, index) => identities.slice(index + 1).some((other) => sameIdentity(identity, other)))) return false
  return Match.value(input.target).pipe(Match.discriminatorsExhaustive("type")({
    directory: ({ anchor }) => !identities.some((identity) => sameIdentity(identity, anchor.identity)),
    file: () => true,
    unavailable: () => true,
    other: () => true
  }))
}

export function admitEntry(input: Trees.EntryInput): Trees.EntryDecision {
  if (input.entry.type === "unavailable" || input.target.type === "unavailable") return "unavailable"
  const entry = entryPhysical(input.entry)
  const target = targetPhysical(input.target)
  if (entry === null || target === null) return "not_regular"
  const branch = [input.branch.parent, ...input.branch.ancestors]
  const paths = [input.root.path, ...branch.map(({ path }) => path), entry.path, target.path].map(parseFinalPath)
  if (paths.some(({ type }) => type === "unsupported")) return "unavailable"
  if (paths.some(({ type }) => type === "stream")) return "stream"
  if (!sameAnchor(input.root, input.branch.ancestors.at(-1) ?? input.branch.parent) || !ordinaryBound(input)) return "changed"
  if (!branch.every((anchor) => contained(input.root, anchor, true)) ||
    entry.identity.volume !== input.root.identity.volume || !contained(input.root, target, false)) return "outside"
  const parentPath = plainPath(input.branch.parent.path)
  const entryPath = plainPath(entry.path)
  if (parentPath === null || entryPath === null ||
    !samePath(entryPath, { volume: parentPath.volume, components: [...parentPath.components, input.name] })) return "name_mismatch"
  if (!linkAllowed(input)) return "reparse"
  if (!cycleFree(input)) return "cycle"
  return "accepted"
}

function directoryInfo(observation: Trees.DirectoryObservation): Trees.DirectoryInfo | null {
  return Match.value(observation).pipe(Match.discriminatorsExhaustive("type")({
    directory: ({ info }) => info,
    unavailable: () => null,
    other: () => null
  }))
}

function enumerationNames(enumeration: Trees.Enumeration): ReadonlyArray<Files.Component> | null {
  return Match.value(enumeration).pipe(Match.discriminatorsExhaustive("type")({
    complete: ({ names }) => names,
    failed: () => null
  }))
}

const unique = (names: ReadonlyArray<Files.Component>): boolean => new Set(names).size === names.length
const sameMembers = (left: ReadonlyArray<Files.Component>, right: ReadonlyArray<Files.Component>): boolean =>
  left.length === right.length && left.every((name) => right.includes(name))

export function admitDirectory(input: Trees.DirectoryInput): Trees.DirectoryDecision {
  const beforeRoot = directoryAnchor(input.before.root)
  const afterRoot = directoryAnchor(input.after.root)
  const beforeNames = enumerationNames(input.enumeratedBefore)
  const afterNames = enumerationNames(input.enumeratedAfter)
  if (beforeRoot === null || afterRoot === null || beforeNames === null || afterNames === null ||
    input.before.directory.type === "unavailable" || input.after.directory.type === "unavailable") return "unavailable"
  const before = directoryInfo(input.before.directory)
  const after = directoryInfo(input.after.directory)
  if (before === null || after === null) return "not_directory"
  const paths = [input.root.path, input.directory.path, beforeRoot.path, afterRoot.path,
    before.anchor.path, after.anchor.path].map(parseFinalPath)
  if (paths.some(({ type }) => type === "unsupported")) return "unavailable"
  if (paths.some(({ type }) => type === "stream")) return "stream"
  if (!sameAnchor(input.root, beforeRoot) || !sameAnchor(input.root, afterRoot) ||
    !sameAnchor(input.directory, before.anchor) || !sameAnchor(input.directory, after.anchor) ||
    before.modified !== after.modified || before.changed !== after.changed) return "changed"
  if (!contained(input.root, input.directory, true)) return "outside"
  if (!unique(beforeNames) || !unique(afterNames) || !unique(input.visited)) return "duplicate"
  if (!sameMembers(beforeNames, afterNames)) return "changed"
  if (!sameMembers(beforeNames, input.visited)) return "incomplete"
  return "accepted"
}
