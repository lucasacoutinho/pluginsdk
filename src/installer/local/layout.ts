import { win32 } from "node:path"
import type { Target } from "../../../contracts/Installer.ts"
import { PackagePath } from "../../../contracts/Plugin.ts"
import { targetPaths } from "../target/resolve.ts"

export const isLocalTarget = (target: Target): boolean =>
  target.destination.host === "cursor" && target.destination.type === "user"

export const localPaths = (target: Target) => {
  const home = target.destination.home
  const local = win32.join(targetPaths(target).directory, "local")
  const relative = (path: string) => PackagePath.make(win32.relative(home, path).replaceAll("\\", "/"))
  return {
    home,
    live: PackagePath.make(`plugins/local/${target.plugin}`),
    staged: relative(win32.join(local, "staged")),
    retired: relative(win32.join(local, "retired")),
    allocations: relative(win32.join(local, "allocations")),
    history: relative(win32.join(local, "history"))
  }
}
export type LocalPaths = ReturnType<typeof localPaths>
