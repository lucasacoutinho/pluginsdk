import { Match } from "effect"
import type { SnapshotWord } from "../../contracts/Launcher.ts"
import { ProcessText, type EnvironmentName } from "../../contracts/Plugin.ts"
import type { CaptureInput, ExecutionInput, Invocation } from "../../contracts/ProcessRuntime.ts"

export function readProcessCapture(input: CaptureInput): ProcessText | null {
  const { source, raw, check } = input
  if (raw === null || check === null) return null
  return raw === "${" + source + "}" && check !== raw ? null : raw
}

function resolve(word: SnapshotWord, input: ExecutionInput): ProcessText | null {
  return Match.value(word).pipe(Match.discriminatorsExhaustive("type")({
    literal: ({ value }) => value,
    root: () => input.root,
    file: ({ path }) => ProcessText.make(`${input.root}/${path}`),
    captured: ({ capture }) => capturedValue(input, capture.source)
  }))
}

function capturedValue(input: ExecutionInput, source: EnvironmentName): ProcessText | null {
  return Object.hasOwn(input.captures, source) ? input.captures[source] ?? null : null
}

export function executeProcess(input: ExecutionInput): Invocation | null {
  const { script, root } = input
  if (script.captures.some(({ source }) => capturedValue(input, source) === null)) return null
  const parameters: ProcessText[] = [root]
  for (const word of script.snapshot) {
    const value = resolve(word, input)
    if (value === null) return null
    parameters.push(value)
  }
  const command = parameters[script.command]
  const cwd = parameters[script.cwd]
  if (command === undefined || cwd === undefined) return null
  const args: ProcessText[] = []
  for (const index of script.args) {
    const value = parameters[index]
    if (value === undefined) return null
    args.push(value)
  }
  const environment: Array<Invocation["environment"][number]> = []
  for (const binding of script.environment) {
    const value = parameters[binding.index]
    if (value === undefined) return null
    environment.push({ name: binding.name, value })
  }
  return { command, args, environment, cwd }
}
