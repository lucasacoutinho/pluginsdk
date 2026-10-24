import { Match } from "effect"
import type { LocalClient, PackageClient } from "../../../contracts/Clients.ts"
import type { BuildInput, PackageClients } from "../../../contracts/ClientPackages.ts"

export const packageClient = (client: LocalClient): PackageClient => Match.value(client).pipe(
  Match.when("claude_code", (): PackageClient => "claude_code"),
  Match.when("codex", (): PackageClient => "codex"),
  Match.when("cursor", (): PackageClient => "claude_code"),
  Match.exhaustive
)

export const buildClients = (clients: BuildInput["clients"]): PackageClients => {
  const packages = clients.map(packageClient)
  if (!packages.includes("claude_code")) return ["codex"]
  return packages.includes("codex") ? ["claude_code", "codex"] : ["claude_code"]
}
