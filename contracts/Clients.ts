import { Schema } from "effect"

export const Host = Schema.Literals(["claude_code", "codex", "cursor", "grok_bot", "muse"])
export type Host = typeof Host.Type

export const LocalClient = Host.pick(["claude_code", "codex", "cursor"])
export type LocalClient = typeof LocalClient.Type

export const PackageClient = Host.pick(["claude_code", "codex"])
export type PackageClient = typeof PackageClient.Type
