import { Match, Result, Schema } from "effect"
import { ProcessText, type EnvironmentName } from "../../../../contracts/Plugin.ts"

const Dword = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff_ffff }))
const NativeBoolean = Schema.Int.check(Schema.isBetween({ minimum: -0x8000_0000, maximum: 0x7fff_ffff }))
const NativePointer = Schema.NullOr(Schema.BigInt)
const CodeUnit = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff }))
const CompareResult = Schema.Literals([0, 1, 2, 3])
const CompareLength = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0x7fff_ffff }))
const InheritedName = Schema.String.check(Schema.makeFilter(
  (name) => name.length > 0 && name.isWellFormed() && !name.includes("\0") && !name.includes("="),
  { expected: "a valid Windows environment name" }
))
const DriveName = Schema.String.check(Schema.isPattern(/^=[A-Za-z]:$/))
const NativeName = Schema.Union([InheritedName, DriveName])
const NativeEntry = Schema.Struct({ name: NativeName, value: ProcessText })
type EnvironmentAssignment = typeof NativeEntry.Type

const decodeNative = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  operation: string,
  value: unknown
): S["Type"] => {
  try {
    return Schema.decodeSync(schema)(value)
  } catch {
    throw new Error(`${operation} returned invalid native data`)
  }
}

const nativeFailure = (operation: string, code: number): Error =>
  new Error(`${operation} failed with Win32 error ${code}`)

export async function prepareWindowsEnvironment(
  overrides: Readonly<Record<EnvironmentName, ProcessText>>
): Promise<Buffer> {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Windows environment preparation requires Windows x64")
  }

  const koffiModule = await import("koffi").catch((cause: unknown) => {
    throw new Error("Could not load Koffi for Windows environment preparation", { cause })
  })
  const koffi = koffiModule.default
  const kernel32 = koffi.load("kernel32.dll")
  const api = {
    getEnvironmentStrings: kernel32.func("void * __stdcall GetEnvironmentStringsW()"),
    freeEnvironmentStrings: kernel32.func("int32_t __stdcall FreeEnvironmentStringsW(void *environment)"),
    compareStringOrdinal: kernel32.func("int32_t __stdcall CompareStringOrdinal(const char16_t *left, int32_t leftLength, const char16_t *right, int32_t rightLength, int32_t ignoreCase)"),
    lastError: kernel32.func("uint32_t __stdcall GetLastError()")
  }
  const lastError = (): number => decodeNative(Dword, "GetLastError", api.lastError())
  const generated: ReadonlyArray<EnvironmentAssignment> = Object.entries(overrides).map(([name, value]) => ({
    name,
    value
  }))

  const compareOrdinal = (left: string, right: string): number => {
    const leftLength = decodeNative(CompareLength, "CompareStringOrdinal input length", left.length)
    const rightLength = decodeNative(CompareLength, "CompareStringOrdinal input length", right.length)
    const result = decodeNative(CompareResult, "CompareStringOrdinal", api.compareStringOrdinal(left, leftLength, right, rightLength, 1))
    if (result === 0) throw nativeFailure("CompareStringOrdinal", lastError())
    return result - 2
  }

  const readEntries = (environment: bigint): Array<EnvironmentAssignment> => {
    const entries: Array<EnvironmentAssignment> = []
    let units: Array<number> = []
    let previousWasTerminator = false
    let offset = 0
    while (true) {
      if (offset > 0x7fff_fffd) throw new Error("GetEnvironmentStringsW returned an oversized environment block")
      const unit = decodeNative(CodeUnit, "GetEnvironmentStringsW code unit", koffi.decode(environment, offset, "uint16_t"))
      offset += 2
      if (unit === 0) {
        if (units.length === 0) {
          if (previousWasTerminator) return entries
          previousWasTerminator = true
          continue
        }
        const entryBytes = Buffer.alloc(units.length * 2)
        for (const [index, codeUnit] of units.entries()) entryBytes.writeUInt16LE(codeUnit, index * 2)
        const entry = decodeNative(ProcessText, "GetEnvironmentStringsW entry", entryBytes.toString("utf16le"))
        const separator = entry.indexOf("=", entry.startsWith("=") ? 1 : 0)
        if (separator < 1) throw new Error("GetEnvironmentStringsW returned an invalid environment entry")
        const parsed = decodeNative(NativeEntry, "GetEnvironmentStringsW entry", {
          name: entry.slice(0, separator),
          value: entry.slice(separator + 1)
        })
        entries.push({ name: parsed.name, value: parsed.value })
        units = []
        previousWasTerminator = true
        continue
      }
      previousWasTerminator = false
      units.push(unit)
    }
  }

  const mergeAndEncode = (environment: bigint): Buffer => {
    const inherited = readEntries(environment)
    const remaining = inherited.filter((entry) => !generated.some((override) => compareOrdinal(entry.name, override.name) === 0))
    const assignments = [...remaining, ...generated]
    assignments.sort((left, right) => compareOrdinal(left.name, right.name))
    for (const [index, entry] of assignments.entries()) {
      const previous = assignments[index - 1]
      if (previous !== undefined && compareOrdinal(previous.name, entry.name) === 0) {
        throw new Error("GetEnvironmentStringsW returned ambiguous environment names")
      }
    }
    const parts = assignments.map(({ name, value }) => Buffer.from(`${name}=${value}\0`, "utf16le"))
    return Buffer.concat([...parts, Buffer.alloc(assignments.length === 0 ? 4 : 2)])
  }

  const environment = decodeNative(NativePointer, "GetEnvironmentStringsW", api.getEnvironmentStrings())
  if (environment === null || environment === 0n) throw nativeFailure("GetEnvironmentStringsW", lastError())
  const prepared = Result.try(() => mergeAndEncode(environment))
  const released = Result.try(() => {
    const result = decodeNative(NativeBoolean, "FreeEnvironmentStringsW", api.freeEnvironmentStrings(environment))
    if (result === 0) throw nativeFailure("FreeEnvironmentStringsW", lastError())
  })
  return Match.value(prepared).pipe(Match.tagsExhaustive({
    Success: ({ success }) => Match.value(released).pipe(Match.tagsExhaustive({
      Success: () => success,
      Failure: ({ failure }) => { throw failure }
    })),
    Failure: ({ failure }) => Match.value(released).pipe(Match.tagsExhaustive({
      Success: (): Buffer => { throw failure },
      Failure: ({ failure: cleanup }): Buffer => {
        throw new AggregateError([failure, cleanup], "Windows environment preparation and release failed")
      }
    }))
  }))
}
