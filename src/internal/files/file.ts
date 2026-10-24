import { Match, Schema } from "effect"
import * as Files from "../../../contracts/FileRead.ts"

const sameIdentity = Schema.toEquivalence(Files.Identity)
const samePath = Schema.toEquivalence(Files.CanonicalPath)
const sameStamp = Schema.toEquivalence(Files.FileStamp)

export function parseFinalPath(raw: Files.FinalPath): Files.ParsedPath {
  const [first, second, namespace, volume, ...parts] = raw.split("\\")
  if (first !== "" || second !== "" || namespace !== "?" || volume === undefined ||
    !volume.startsWith("Volume{") || !volume.endsWith("}") || volume.length !== 44 || parts.length === 0) {
    return { type: "unsupported" }
  }
  const guid = volume.slice(7, -1).toLowerCase()
  if (!Schema.is(Files.VolumeGuid)(guid)) return { type: "unsupported" }
  if (parts.some((part) => part.includes(":"))) return { type: "stream" }
  const components = parts.length === 1 && parts[0] === "" ? [] : parts
  const valid = components.filter(Schema.is(Files.Component))
  if (valid.length !== components.length) return { type: "unsupported" }
  return { type: "plain", path: { volume: guid, components: valid } }
}

export function inside(root: Files.CanonicalPath, file: Files.CanonicalPath): boolean {
  return root.volume === file.volume && root.components.length < file.components.length &&
    root.components.every((component, index) => component === file.components[index])
}

function directoryOf(observation: Files.Observation): Files.Anchor | null {
  return Match.value(observation).pipe(Match.discriminatorsExhaustive("type")({
    directory: ({ anchor }) => anchor,
    file: () => null,
    unavailable: () => null,
    other: () => null
  }))
}

function fileOf(observation: Files.Observation): Files.FileInfo | null | undefined {
  return Match.value(observation).pipe(Match.discriminatorsExhaustive("type")({
    file: ({ info }) => info,
    directory: () => null,
    other: () => null,
    unavailable: () => undefined
  }))
}

function readLength(read: Files.ReadResult): Files.Quantity | null {
  return Match.value(read).pipe(Match.discriminatorsExhaustive("type")({
    complete: ({ length }) => length,
    failed: () => null
  }))
}

function canonical(path: Files.ParsedPath): Files.CanonicalPath | null | undefined {
  return Match.value(path).pipe(Match.discriminatorsExhaustive("type")({
    plain: ({ path }) => path,
    stream: () => null,
    unsupported: () => undefined
  }))
}

export function admitRead(input: Files.ReadInput): Files.ReadDecision {
  const beforeRoot = directoryOf(input.before.root)
  const afterRoot = directoryOf(input.after.root)
  const before = fileOf(input.before.file)
  const after = fileOf(input.after.file)
  const length = readLength(input.read)
  if (beforeRoot === null || afterRoot === null || before === undefined || after === undefined || length === null) {
    return "unavailable"
  }
  if (before === null || after === null) return "not_regular"

  const rootPath = canonical(parseFinalPath(input.root.path))
  const beforeRootPath = canonical(parseFinalPath(beforeRoot.path))
  const afterRootPath = canonical(parseFinalPath(afterRoot.path))
  const beforePath = canonical(parseFinalPath(before.path))
  const afterPath = canonical(parseFinalPath(after.path))
  if (rootPath === undefined || beforeRootPath === undefined || afterRootPath === undefined ||
    beforePath === undefined || afterPath === undefined) return "unavailable"
  if (rootPath === null || beforeRootPath === null || afterRootPath === null ||
    beforePath === null || afterPath === null) return "stream"

  if (!sameIdentity(input.root.identity, beforeRoot.identity) || !sameIdentity(input.root.identity, afterRoot.identity) ||
    input.root.caseSensitive !== beforeRoot.caseSensitive || input.root.caseSensitive !== afterRoot.caseSensitive ||
    !samePath(rootPath, beforeRootPath) || !samePath(rootPath, afterRootPath)) return "changed"
  if (before.identity.volume !== input.root.identity.volume || after.identity.volume !== input.root.identity.volume ||
    !inside(rootPath, beforePath) || !inside(rootPath, afterPath)) return "outside"
  if (!sameStamp(before, after) || !samePath(beforePath, afterPath) || length !== before.size) return "changed"
  return "accepted"
}
