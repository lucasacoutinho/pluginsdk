import { Schema } from "effect"
import { ProcessText } from "../../../../contracts/Plugin.ts"
import { NativeCommand } from "./native.ts"

const Binary = Schema.Literals(["claude", "codex"])
const Dword = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff_ffff }))
const Capacity = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32_768 }))

const decodeNative = <S extends Schema.ConstraintDecoder<unknown>>(schema: S, operation: string, value: unknown): S["Type"] => {
  try { return Schema.decodeSync(schema)(value) }
  catch { throw new Error(`${operation} returned invalid native data`) }
}

export async function resolveWindowsExecutable(binary: typeof Binary.Type): Promise<NativeCommand["application"]> {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Windows executable discovery requires Windows x64")
  }
  const searchPath = decodeNative(ProcessText, "Windows executable search path", process.env.PATH)
  if (searchPath.length === 0) throw new Error("Windows executable discovery requires PATH")

  const koffi = (await import("koffi")).default
  const kernel = koffi.load("kernel32.dll")
  const search = kernel.func("uint32_t __stdcall SearchPathW(const char16_t *path, const char16_t *file, const char16_t *extension, uint32_t capacity, void *output, void *filePart)")
  const lastError = kernel.func("uint32_t __stdcall GetLastError()")
  const locate = (capacity: number, output: Buffer | null) => {
    const length = decodeNative(Dword, "SearchPathW", search(searchPath, binary, ".exe", capacity, output, null))
    if (length === 0) {
      const code = decodeNative(Dword, "GetLastError", lastError())
      throw new Error(`SearchPathW failed with Win32 error ${code}`)
    }
    return length
  }
  const capacity = decodeNative(Capacity, "SearchPathW required size", locate(0, null))
  const output = Buffer.alloc(capacity * 2)
  const length = locate(capacity, output)
  if (length >= capacity) throw new Error("The Windows executable path changed during discovery")
  return decodeNative(NativeCommand.fields.application, "SearchPathW application path", output.toString("utf16le", 0, length * 2))
}
