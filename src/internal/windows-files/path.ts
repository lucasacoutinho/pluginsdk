import { UnitCapacity } from "../../../contracts/WindowsPath.ts"
import type { NativePathInput, PathDecision, PathInput, RootCapacityInput, RootCapacityResolution, RootPathView } from "../../../contracts/WindowsPath.ts"
import { asciiFold } from "../paths.ts"

const devices = new Set(["con", "prn", "aux", "nul", "conin$", "conout$"])

const remainingUnits = (view: RootPathView): number =>
  view.maxPathBufferUnits - view.root.length - (view.root.endsWith("\\") ? 0 : 1) - 1

export const deriveWindowsPathCapacity = (input: RootCapacityInput): RootCapacityResolution => {
  const [first, ...rest] = input.views
  const remaining = rest.reduce((minimum, view) => Math.min(minimum, remainingUnits(view)), remainingUnits(first))
  return remaining < 0
    ? { type: "refused" }
    : { type: "available", capacity: {
      maxComponentUnits: input.maxComponentUnits,
      remainingPathUnits: UnitCapacity.make(remaining)
    } }
}

const isDevice = (component: string): boolean => {
  const extension = component.indexOf(".")
  const stem = asciiFold((extension < 0 ? component : component.slice(0, extension)).replace(/ +$/, ""))
  return devices.has(stem) || /^(?:com|lpt)[1-9¹²³](?![\s\S])/.test(stem)
}

const badSyntaxComponent = (component: string): boolean =>
  component.endsWith(" ") || component.endsWith(".") || /[<>:"\\|?*]/.test(component) ||
    [...component].some((character) => character.charCodeAt(0) < 32)

const ordinaryDosPath = (path: string): boolean => {
  if (!/^[A-Za-z]:\\/.test(path)) return false
  const tail = path.slice(3)
  return tail === "" || tail.split("\\").every((component) =>
    component !== "" && !component.includes("/") && !badSyntaxComponent(component) && !isDevice(component))
}

export const matchesNativePath = (input: NativePathInput): boolean =>
  input.reported === input.expected || input.platform === "win32" && ordinaryDosPath(input.expected) &&
    input.reported === "\\\\?\\" + input.expected

export const classifyWindowsPath = (input: PathInput): PathDecision => {
  const components = input.path.split("/")
  if (components.some(badSyntaxComponent)) return "syntax"
  if (components.some(isDevice)) return "device"
  if (components.some((component) => component.length > input.capacity.maxComponentUnits)) return "component_limit"
  if (input.path.length > input.capacity.remainingPathUnits) return "path_limit"
  return "accepted"
}
