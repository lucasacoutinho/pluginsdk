import { Match, Schema } from "effect"
import * as Files from "../../../contracts/FileRead.ts"
import type { ModeObservation, ObservedFile } from "../../../contracts/ExecutableIntent.ts"
import type { Approval, Input, Tree } from "../../../contracts/LocalPackage.ts"
import type { Observation as SlotObservation } from "../../../contracts/LocalSlot.ts"
import { pathCollisionKeys } from "../../internal/paths.ts"
import { resolvePayloadIntent } from "../../internal/files/executable.ts"

const sameIdentity = Schema.toEquivalence(Files.Identity)

const parentPaths = (path: string): string[] => {
  const segments = path.split("/")
  const parents: string[] = []
  for (let length = 1; length < segments.length; length += 1) {
    parents.push(segments.slice(0, length).join("/"))
  }
  return parents
}

const usableMode = (mode: ModeObservation): boolean => Match.value(mode).pipe(
  Match.discriminatorsExhaustive("type")({
    unavailable: () => false,
    unrepresented: () => true,
    posix: ({ before, after }) => before === after
  })
)

const payloadMatches = (approval: Approval, observed: ObservedFile): boolean =>
  approval.files.some((retained) => Match.value(resolvePayloadIntent({ retained, observed })).pipe(
    Match.discriminatorsExhaustive("type")({
      resolved: () => true,
      refused: () => false
    })
  ))

const captureConsistent = (approval: Approval, tree: Tree): boolean => {
  const observedFilePaths = tree.files.map(({ path }) => path)
  const capturedDirectories = new Set<string>(tree.directories)
  const approvedParents = new Set(approval.files.flatMap(({ path }) => parentPaths(path)))
  const observedEntries = [...observedFilePaths, ...tree.directories]

  return new Set(observedFilePaths).size === observedFilePaths.length &&
    capturedDirectories.size === tree.directories.length &&
    tree.directories.every((directory) => approvedParents.has(directory)) &&
    observedEntries.every((path) => parentPaths(path).every((parent) => capturedDirectories.has(parent))) &&
    tree.files.every((observed) => payloadMatches(approval, observed))
}

const classifyTree = (approval: Approval | null, tree: Tree): SlotObservation => {
  if (tree.files.some(({ mode }) => !usableMode(mode))) return { type: "unknown" }
  if (approval === null) return { type: "foreign", basis: tree.basis }
  if (pathCollisionKeys(approval.files.map(({ path }) => path)).length !== 0) {
    return { type: "unknown" }
  }
  if (!sameIdentity(tree.root, approval.root)) return { type: "foreign", basis: tree.basis }
  if (!captureConsistent(approval, tree)) return { type: "foreign", basis: tree.basis }

  const observedFilePaths = new Set(tree.files.map(({ path }) => path))
  const complete = approval.files.every(({ path }) => observedFilePaths.has(path))
  return complete
    ? { type: "complete", owner: approval.owner, identity: approval.identity, basis: tree.basis }
    : { type: "partial", owner: approval.owner, identity: approval.identity, basis: tree.basis }
}

export function classifyLocalPackage(input: Input): SlotObservation {
  return Match.value(input.observed).pipe(
    Match.discriminatorsExhaustive("type")({
      absent: (): SlotObservation => ({ type: "absent" }),
      unknown: (): SlotObservation => ({ type: "unknown" }),
      tree: (tree) => classifyTree(input.approval, tree)
    })
  )
}
