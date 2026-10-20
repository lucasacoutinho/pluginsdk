import { Schema } from "effect"
import { visit } from "jsonc-parser"

export type Json = Schema.Json

const validString = (value: string): string => {
  if (!value.isWellFormed()) throw new SyntaxError("JSON contains an unpaired Unicode surrogate")
  return value
}

export const parseJson = (text: string): Json => {
  const objects: Array<Set<string>> = []
  visit(text, {
    onObjectBegin: () => { objects.push(new Set()) },
    onObjectEnd: () => { objects.pop() },
    onObjectProperty: (name) => {
      validString(name)
      const current = objects.at(-1)
      if (current?.has(name)) throw new SyntaxError(`Duplicate JSON property: ${name}`)
      current?.add(name)
    },
    onLiteralValue: (value: unknown) => {
      if (typeof value === "string") validString(value)
      if (typeof value === "number" && !Number.isFinite(value)) throw new SyntaxError("JSON number is not finite")
    },
    onError: (_error, offset) => { throw new SyntaxError(`Invalid JSON at offset ${offset}`) }
  }, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false })
  return Schema.decodeUnknownSync(Schema.Json)(JSON.parse(text))
}

export const canonicalJson = (value: Json): string => {
  if (value === null) return "null"
  if (typeof value === "string") return JSON.stringify(validString(value))
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SyntaxError("JSON number is not finite")
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  return `{${Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(validString(key))}:${canonicalJson(entry)}`).join(",")}}`
}

export const jsonBytes = (value: Json): Uint8Array => new TextEncoder().encode(canonicalJson(value))

export const parseJsonBytes = (bytes: Uint8Array): Json =>
  parseJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
