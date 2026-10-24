import { Match } from "effect"
import type { Observation } from "../../../contracts/Installer.ts"
import type { Input } from "../../../contracts/LocalObservation.ts"
import type { Observation as SlotObservation } from "../../../contracts/LocalSlot.ts"

const isAbsent = (observed: SlotObservation): boolean => Match.value(observed).pipe(
  Match.discriminatorsExhaustive("type")({
    absent: () => true,
    unknown: () => false,
    foreign: () => false,
    complete: () => false,
    partial: () => false
  })
)

export const observeLocalSlots = ({ owner, slots }: Input): Observation => {
  if (!isAbsent(slots.staged) || !isAbsent(slots.retired)) return { type: "unknown" }
  return Match.value(slots.live).pipe(Match.discriminatorsExhaustive("type")({
    absent: (): Observation => ({ type: "absent" }),
    unknown: (): Observation => ({ type: "unknown" }),
    foreign: ({ basis }): Observation => ({ type: "present", fingerprint: basis, identity: null }),
    partial: ({ basis }): Observation => ({ type: "present", fingerprint: basis, identity: null }),
    complete: (claim): Observation => ({
      type: "present", fingerprint: claim.basis, identity: claim.owner === owner ? claim.identity : null
    })
  }))
}
