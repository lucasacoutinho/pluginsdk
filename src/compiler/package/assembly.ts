import { Array, Schema } from "effect"
import { AssemblyIssue, ReservedAssetRoot, type AssemblyInput, type AssemblyResult } from "../../../contracts/Assembly.ts"
import type { Asset } from "../../../contracts/CompilerModel.ts"
import { asciiFold, compareUtf8, pathCollisionKeys } from "../../internal/paths.ts"

const sameIssue = Schema.toEquivalence(AssemblyIssue)

export const reservedAssetPath = (path: string): boolean => {
  const key = asciiFold(path)
  return ReservedAssetRoot.literals.some((root) => key === root || key.startsWith(`${root}/`))
}

export const assemble = (input: AssemblyInput): AssemblyResult => {
  const [head, ...tail] = input.base
  const requested: [Asset, ...Asset[]] = [head, ...tail, ...input.assets]
  const collisions: AssemblyIssue[] = pathCollisionKeys(requested.map((file) => file.path)).map(
    (path) => ({ type: "path_collision", path })
  )
  const reserved: AssemblyIssue[] = input.assets.filter((file) => reservedAssetPath(file.path)).map(
    (file) => ({ type: "reserved_asset", path: file.path })
  )
  const issues = Array.dedupeWith([...collisions, ...reserved], sameIssue).sort(
    (left, right) => compareUtf8(left.type, right.type) || compareUtf8(left.path, right.path)
  )
  const [issue, ...rest] = issues
  if (issue !== undefined) return { type: "rejected", issues: [issue, ...rest] }
  return { type: "assembled", files: requested.sort((left, right) => compareUtf8(left.path, right.path)) }
}
