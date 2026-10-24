import { Match } from "effect"
import type { SnapshotWord } from "../../../contracts/Launcher.ts"
import type { Admission, Input } from "../../../contracts/ProcessDirectory.ts"

export function admitProcessDirectory({ root, script }: Input): Admission {
  const word: SnapshotWord | undefined = script.cwd === 0 ? { type: "root" } : script.snapshot[script.cwd - 1]
  if (word === undefined) return { type: "unresolved" }
  const directory = Match.value(word).pipe(Match.discriminatorsExhaustive("type")({
    root: () => root,
    file: ({ path }) => `${root}/${path}`,
    literal: () => null,
    captured: () => null
  }))
  if (directory === null) return { type: "unresolved" }
  return directory.length + 2 <= 260
    ? { type: "accepted", directory }
    : { type: "too_long", units: directory.length }
}
