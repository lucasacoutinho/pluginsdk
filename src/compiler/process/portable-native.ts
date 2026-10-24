import { Match, Schema } from "effect"
import { LauncherPath, Script } from "../../../contracts/Launcher.ts"
import type { PackageFile } from "../../../contracts/Compiler.ts"
import { ProcessData } from "../../../contracts/PortableProcess.ts"
import type { ProcessInput, ProcessPlan, Word } from "../../../contracts/Process.ts"
import type { Result } from "../../../contracts/PortableLauncher.ts"
import { parseJsonBytes } from "../../internal/json.ts"
import { compilePortableLauncher, runtimePath } from "./portable.ts"

export const PackagedProcess = Schema.Struct({ path: LauncherPath, script: Script })
export type PackagedProcess = typeof PackagedProcess.Type

const sameScript = Schema.toEquivalence(Script)

function packaged(files: ReadonlyMap<string, PackageFile>, path: string, executable: boolean): PackageFile {
  const file = files.get(path)
  if (file === undefined || file.executable !== executable || file.content.length === 0) {
    throw new Error(`Missing or invalid portable process file: ${path}`)
  }
  return file
}

function checkedProgram(
  host: ProcessInput["host"],
  path: LauncherPath,
  script: Script
): Extract<Result, { type: "rendered" }> {
  const words: Word[] = [{ type: "root" }, ...script.snapshot.map((word) => Match.value(word).pipe(
    Match.discriminatorsExhaustive("type")({
      literal: (word) => word,
      root: (word) => word,
      file: (word) => word,
      captured: ({ capture }): Word => ({ type: "environment", name: capture.source })
    })
  ))]
  const at = (index: number): Word => {
    const word = words[index]
    if (word === undefined) throw new Error("Portable process instruction index is out of range")
    return word
  }
  const plan: ProcessPlan = {
    command: at(script.command), cwd: at(script.cwd), args: script.args.map(at),
    environment: script.environment.map(({ name, index }) => ({ name, value: at(index) }))
  }
  return Match.value(compilePortableLauncher({ host, path, plan })).pipe(Match.discriminatorsExhaustive("type")({
    rejected: () => { throw new Error("Portable process instructions are not representable") },
    rendered: (program) => {
      if (!sameScript(script, program.script)) throw new Error("Portable process instructions differ from their canonical encoding")
      return program
    }
  }))
}

export function validatePortableProcess(
  host: ProcessInput["host"],
  descriptor: LauncherPath,
  sidecar: LauncherPath,
  files: ReadonlyMap<string, PackageFile>
): {
  readonly program: Extract<Result, { type: "rendered" }>
  readonly paths: ReadonlySet<string>
} {
  const data = Schema.decodeUnknownSync(ProcessData)(
    parseJsonBytes(packaged(files, descriptor, false).content),
    { onExcessProperty: "error" }
  )
  if (data.posix !== sidecar) throw new Error("Portable process data differs from its canonical sidecar path")
  const program = checkedProgram(host, descriptor, data.script)
  const shell = new TextDecoder("utf-8", { fatal: true }).decode(packaged(files, sidecar, true).content)
  if (shell !== program.posix) throw new Error("Portable sidecar differs from its checked process instructions")
  packaged(files, runtimePath, false)
  return { program, paths: new Set([descriptor, sidecar, runtimePath]) }
}
