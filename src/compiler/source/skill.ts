import { basename } from "node:path"
import { Schema } from "effect"
import { parseDocument } from "yaml"
import { SkillName } from "../../../contracts/CompilerModel.ts"
import type { Format } from "../../../contracts/Compiler.ts"

const Frontmatter = Schema.Struct({
  name: SkillName,
  description: Schema.String.check(Schema.isBetweenLength(1, 1024)),
  license: Schema.optionalKey(Schema.String),
  compatibility: Schema.optionalKey(Schema.String.check(Schema.isBetweenLength(1, 500))),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  "allowed-tools": Schema.optionalKey(Schema.String)
})

const ExtendedFrontmatter = Schema.Struct({
  ...Frontmatter.fields,
  metadata: Schema.optionalKey(Schema.JsonObject)
})
const frontmatterByFormat = {
  agent_plugins_v1: Frontmatter,
  claude_code_v1: Frontmatter,
  agent_plugins_v2: ExtendedFrontmatter,
  claude_code_v2: ExtendedFrontmatter,
  agent_plugins_v3: ExtendedFrontmatter,
  claude_code_v3: ExtendedFrontmatter,
  claude_code_v4: ExtendedFrontmatter,
  codex_plugin_v1: ExtendedFrontmatter,
  claude_code_v5: ExtendedFrontmatter,
  codex_plugin_v2: ExtendedFrontmatter,
  claude_code_portable_v1: ExtendedFrontmatter,
  codex_plugin_portable_v1: ExtendedFrontmatter,
  claude_code_portable_v2: ExtendedFrontmatter,
  codex_plugin_portable_v2: ExtendedFrontmatter
} satisfies Record<Format, Schema.Constraint>

export const skillName = (directory: string, bytes: Uint8Array, format: Format): SkillName => {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  if (!text.isWellFormed()) throw new SyntaxError("Skill contains invalid Unicode")
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1]
  if (frontmatter === undefined) throw new SyntaxError("SKILL.md must begin with YAML frontmatter")
  const document = parseDocument(frontmatter, { uniqueKeys: true, strict: true })
  if (document.errors.length > 0) throw new SyntaxError(document.errors.map((error) => error.message).join("; "))
  const metadata: unknown = document.toJS({ maxAliasCount: 0 })
  const decoded = Schema.decodeUnknownSync(frontmatterByFormat[format])(metadata)
  if (decoded.name !== basename(directory)) throw new SyntaxError("Skill name must match its directory name")
  return decoded.name
}
