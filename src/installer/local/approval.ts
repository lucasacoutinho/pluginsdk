import { Schema } from "effect"
import { Identity as PhysicalIdentity } from "../../../contracts/FileRead.ts"
import { Identity } from "../../../contracts/Installer.ts"
import type { Input, Output } from "../../../contracts/LocalApproval.ts"

const sameRoot = Schema.toEquivalence(PhysicalIdentity)
const sameIdentity = Schema.toEquivalence(Identity)

export const bindLocalApproval = ({ owner, root, record, retained }: Input): Output => {
  if (record.owner !== owner || retained.owner !== owner ||
    !sameRoot(record.root, root) || !sameIdentity(record.identity, retained.identity)) return null
  return { owner, root, identity: retained.identity, files: retained.files }
}
