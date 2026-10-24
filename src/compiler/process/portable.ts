import { Array as EffectArray, Match, Schema } from "effect"
import type { Capture, Native, Script, SnapshotWord } from "../../../contracts/Launcher.ts"
import { EnvironmentName, ProcessText } from "../../../contracts/Plugin.ts"
import { Issue, type Input, type Result } from "../../../contracts/PortableLauncher.ts"
import { asciiFold, compareUtf8 } from "../../internal/paths.ts"
import { compileLauncher, serializeLauncher } from "./posix.ts"

export const runtimePath = ".psdk/runtime/process.mjs"

function compileScript(input: Input): Script {
  const script = compileLauncher(input.plan)
  const sources = script.captures.map(({ source }) => source)
  const bound = script.names.reduce((longest, name) => Math.max(longest, name.length), 0)
  const prefix = `PSDK_${"_".repeat(bound)}`
  const rename = (capture: Capture): Capture => {
    const position = sources.indexOf(capture.source)
    const index = position < 0 ? sources.length : position
    return {
      source: capture.source,
      raw: EnvironmentName.make(`${prefix}A_${index}`),
      check: EnvironmentName.make(`${prefix}B_${index}`)
    }
  }
  return {
    ...script,
    captures: script.captures.map(rename),
    snapshot: script.snapshot.map((word) => Match.value(word).pipe(
      Match.discriminatorsExhaustive("type")({
        literal: (word): SnapshotWord => word,
        root: (word): SnapshotWord => word,
        file: (word): SnapshotWord => word,
        captured: ({ capture }): SnapshotWord => ({ type: "captured", capture: rename(capture) })
      })
    ))
  }
}

function issues(input: Input, script: Script): ReadonlyArray<Issue> {
  const sameIssue = Schema.toEquivalence(Issue)
  const keys = input.plan.environment.map(({ name }) => EnvironmentName.make(asciiFold(name)))
  const collisions: ReadonlyArray<Issue> = keys
    .filter((name) => keys.filter((other) => other === name).length > 1)
    .map((name) => ({ type: "environment_collision", name }))
  const references = Match.value(input.host).pipe(
    Match.when("claude_code", (): ReadonlyArray<Issue> => []),
    Match.when("codex", (): ReadonlyArray<Issue> => script.captures.map(({ source }) => ({
      type: "environment_reference_unsupported",
      name: source
    }))),
    Match.exhaustive
  )
  return [...EffectArray.dedupeWith([...collisions, ...references], sameIssue)]
    .sort((left, right) => compareUtf8(left.type, right.type) || compareUtf8(left.name, right.name))
}

function native(input: Input, script: Script): Native {
  const binding = Match.value(input.host).pipe(
    Match.when("claude_code", () => ({
      entry: ProcessText.make(`\${CLAUDE_PLUGIN_ROOT}/${runtimePath}`),
      root: ProcessText.make("${CLAUDE_PLUGIN_ROOT}"),
      cwd: null
    })),
    Match.when("codex", () => ({
      entry: ProcessText.make(runtimePath),
      root: ProcessText.make("."),
      cwd: ProcessText.make(".")
    })),
    Match.exhaustive
  )
  const bindings = script.captures.flatMap(({ source, raw, check }):
    ReadonlyArray<readonly [EnvironmentName, ProcessText]> => [
    [raw, ProcessText.make("${" + source + "}")],
    [check, ProcessText.make("${" + source + ":-PSDK_ABSENT}")]
  ])
  return {
    command: ProcessText.make("node"),
    args: [binding.entry, binding.root, ProcessText.make(input.path)],
    env: Object.fromEntries(bindings),
    cwd: binding.cwd
  }
}

export function compilePortableLauncher(input: Input): Result {
  const script = compileScript(input)
  const [head, ...tail] = issues(input, script)
  if (head !== undefined) return { type: "rejected", issues: [head, ...tail] }
  return {
    type: "rendered",
    script,
    native: native(input, script),
    posix: ProcessText.make(serializeLauncher(script))
  }
}
