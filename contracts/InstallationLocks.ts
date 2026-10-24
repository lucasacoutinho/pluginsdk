import { Schema } from "effect"
import { Destination } from "./Installer.ts"
import { Directory } from "./Plugin.ts"

const Home = Schema.Struct({ type: Schema.Literal("home"), root: Directory })
const Project = Schema.Struct({ type: Schema.Literal("project"), root: Directory })

export const LockSubject = Schema.Union([Home, Project]).pipe(Schema.toTaggedUnion("type"))
export type LockSubject = typeof LockSubject.Type

export const LockSubjects = Schema.Union([Schema.Tuple([Home]), Schema.Tuple([Home, Project])])
export type LockSubjects = typeof LockSubjects.Type

export const OracleRequest = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("installation_lock_subjects"), input: Destination })
export const OracleResponse = Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("installation_lock_subjects"), output: LockSubjects })
