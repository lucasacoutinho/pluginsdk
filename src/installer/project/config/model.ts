import { Match } from "effect"
import type {
	EditInput,
	EditResult,
	Segment
} from "../../../../contracts/ProjectConfig.ts"

export function editProjectConfig(input: EditInput): EditResult {
  const owned: string[] = []
  const foreign: Segment[] = []

  for (const segment of input.document) {
    Match.value(segment).pipe(
      Match.discriminatorsExhaustive("type")({
        external: () => foreign.push(segment),
        managed: ({ key, content }) => {
          if (key === input.key) owned.push(content)
          else foreign.push(segment)
        }
      })
    )
  }

  const safe = input.previous === null
    ? owned.length === 0
    : owned.length === 1 && owned[0] === input.previous

  if (!safe) {
    if (owned.length > 1) return { type: "blocked", reason: "duplicate" }
    if (input.previous === null) return { type: "blocked", reason: "unowned" }
    return { type: "blocked", reason: "drift" }
  }

  if (input.previous === input.desired) return { type: "ready", document: input.document }

  const document: ReadonlyArray<Segment> = input.desired === null
    ? foreign
    : [...foreign, { type: "managed", key: input.key, content: input.desired }]
  return { type: "ready", document }
}
