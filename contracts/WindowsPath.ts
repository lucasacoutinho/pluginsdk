import { Schema } from "effect"
import { RuntimePlatform } from "./Compatibility.ts"
import { FinalPath } from "./FileRead.ts"
import { PackagePath } from "./Plugin.ts"

export const UnitCapacity = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 0xffff_ffff })
).pipe(Schema.brand("pluginsdk/WindowsPathUnitCapacity"))
export type UnitCapacity = typeof UnitCapacity.Type

export const PathCapacity = Schema.Struct({
  maxComponentUnits: UnitCapacity,
  remainingPathUnits: UnitCapacity
})
export type PathCapacity = typeof PathCapacity.Type

export const RootPathView = Schema.Struct({ root: FinalPath, maxPathBufferUnits: UnitCapacity })
export type RootPathView = typeof RootPathView.Type

export const RootCapacityInput = Schema.Struct({
  maxComponentUnits: UnitCapacity,
  views: Schema.NonEmptyArray(RootPathView)
})
export type RootCapacityInput = typeof RootCapacityInput.Type

export const RootCapacityResolution = Schema.Union([
  Schema.Struct({ type: Schema.Literal("available"), capacity: PathCapacity }),
  Schema.Struct({ type: Schema.Literal("refused") })
]).pipe(Schema.toTaggedUnion("type"))
export type RootCapacityResolution = typeof RootCapacityResolution.Type

export const PathInput = Schema.Struct({ path: PackagePath, capacity: PathCapacity })
export type PathInput = typeof PathInput.Type

export const PathDecision = Schema.Literals([
  "accepted", "syntax", "device", "component_limit", "path_limit"
])
export type PathDecision = typeof PathDecision.Type

export const NativePathInput = Schema.Struct({ platform: RuntimePlatform, expected: FinalPath, reported: FinalPath })
export type NativePathInput = typeof NativePathInput.Type

export const OracleRequest = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("windows_path"), input: PathInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("windows_root_capacity"), input: RootCapacityInput }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("native_path_match"), input: NativePathInput })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleRequest = typeof OracleRequest.Type

export const OracleResponse = Schema.Union([
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("windows_path"), output: PathDecision }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("windows_root_capacity"), output: RootCapacityResolution }),
  Schema.Struct({ schema: Schema.Literal(1), type: Schema.Literal("native_path_match"), output: Schema.Boolean })
]).pipe(Schema.toTaggedUnion("type"))
export type OracleResponse = typeof OracleResponse.Type
