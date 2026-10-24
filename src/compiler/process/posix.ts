import { Array as EffectArray, Match, Schema } from "effect"
import type { Capture, CaptureKind, LauncherInput, LauncherOutput, Native, Script, SnapshotWord } from "../../../contracts/Launcher.ts"
import { EnvironmentName, ProcessText } from "../../../contracts/Plugin.ts"
import type { ProcessPlan, Word } from "../../../contracts/Process.ts"
import { compareUtf8 } from "../../internal/paths.ts"
import { quoteProcessText } from "./model.ts"

const fallback = "PSDK_ABSENT"
const sameEnvironmentName = Schema.toEquivalence(EnvironmentName)

function words(plan: ProcessPlan): ReadonlyArray<Word> {
  return [plan.command, plan.cwd, ...plan.args, ...plan.environment.map(({ value }) => value)]
}

function referenceNames(values: ReadonlyArray<Word>): ReadonlyArray<EnvironmentName> {
  return values.flatMap((word) => Match.value(word).pipe(
    Match.discriminatorsExhaustive("type")({
      literal: () => [],
      root: () => [],
      file: () => [],
      environment: ({ name }) => [name]
    })
  ))
}

function requestedNames(plan: ProcessPlan): ReadonlyArray<EnvironmentName> {
  return [...plan.environment.map(({ name }) => name), ...referenceNames(words(plan))]
}

function sourceNames(values: ReadonlyArray<Word>): ReadonlyArray<EnvironmentName> {
  return [...EffectArray.dedupeWith(referenceNames(values), sameEnvironmentName)]
    .sort(compareUtf8)
}

function bound(names: ReadonlyArray<EnvironmentName>): number {
  return names.reduce((longest, name) => Math.max(longest, name.length), 0)
}

function marker(kind: CaptureKind): string {
  return Match.value(kind).pipe(
    Match.when("raw", () => "A"),
    Match.when("check", () => "B"),
    Match.exhaustive
  )
}

function freshName(
  names: ReadonlyArray<EnvironmentName>,
  kind: CaptureKind,
  source: EnvironmentName
): string {
  return `PSDK_${"_".repeat(bound(names))}${marker(kind)}_${source}`
}

function captureFor(names: ReadonlyArray<EnvironmentName>, source: EnvironmentName): Capture {
  return {
    source,
    raw: EnvironmentName.make(freshName(names, "raw", source)),
    check: EnvironmentName.make(freshName(names, "check", source))
  }
}

function snapshotWord(names: ReadonlyArray<EnvironmentName>, word: Word): SnapshotWord {
  return Match.value(word).pipe(Match.discriminatorsExhaustive("type")({
    literal: ({ value }): SnapshotWord => ({ type: "literal", value }),
    root: (): SnapshotWord => ({ type: "root" }),
    file: ({ path }): SnapshotWord => ({ type: "file", path }),
    environment: ({ name }): SnapshotWord => ({ type: "captured", capture: captureFor(names, name) })
  }))
}

function slots(start: number, count: number): ReadonlyArray<number> {
  return Array.from({ length: count }, (_, offset) => start + offset)
}

function exports(start: number, plan: ProcessPlan): Script["environment"] {
  return plan.environment.map((binding, offset) => ({ name: binding.name, index: start + offset }))
}

export function compileLauncher(plan: ProcessPlan): Script {
  const requested = requestedNames(plan)
  const processWords = words(plan)
  return {
    names: requested,
    captures: sourceNames(processWords).map((source) => captureFor(requested, source)),
    snapshot: processWords.map((word) => snapshotWord(requested, word)),
    command: 1,
    args: slots(3, plan.args.length),
    environment: exports(3 + plan.args.length, plan),
    cwd: 2
  }
}

function shellVariable(name: string): string {
  return "\"${" + name + "}\""
}

function parameter(index: number): string {
  return shellVariable(String(index + 1))
}

function placeholder(name: EnvironmentName): string {
  return "$" + "{" + name + "}"
}

function renderWord(word: SnapshotWord): string {
  return Match.value(word).pipe(Match.discriminatorsExhaustive("type")({
    literal: ({ value }) => quoteProcessText(value),
    root: () => parameter(0),
    file: ({ path }) => parameter(0) + "/" + quoteProcessText(ProcessText.make(path)),
    captured: ({ capture }) => shellVariable(capture.raw)
  }))
}

function renderGuard(capture: Capture): string {
  return `if [ ${shellVariable(capture.raw)} = ${quoteProcessText(ProcessText.make(placeholder(capture.source)))} ] && [ ${shellVariable(capture.check)} != ${shellVariable(capture.raw)} ]; then\n` +
    `  printf '%s\\n' ${quoteProcessText(ProcessText.make(`Missing environment variable: ${capture.source}`))} >&2\n` +
    "  exit 1\nfi\n"
}

function transferName(script: Script, name: EnvironmentName): EnvironmentName {
  return EnvironmentName.make(`S${freshName(script.names, "raw", name)}`)
}

function nativeBindings(script: Script): Native["env"] {
  const entries = script.captures.flatMap((capture) => captureBindings(capture))
  return Object.fromEntries(entries)
}

function captureBindings(capture: Capture): ReadonlyArray<readonly [EnvironmentName, ProcessText]> {
  return [
    [capture.raw, ProcessText.make(placeholder(capture.source))],
    [capture.check, ProcessText.make("$" + "{" + capture.source + ":-" + fallback + "}")]
  ]
}

function rootVariable(host: LauncherInput["host"]): ProcessText {
  return Match.value(host).pipe(
    Match.when("claude_code", () => ProcessText.make("$" + "{CLAUDE_PLUGIN_ROOT}")),
    Match.when("codex", () => ProcessText.make("$" + "{PLUGIN_ROOT}")),
    Match.exhaustive
  )
}

function native(host: LauncherInput["host"], path: LauncherInput["path"], script: Script): Native | null {
  return Match.value(host).pipe(
    Match.when("claude_code", () => ({
      command: ProcessText.make(`${rootVariable(host)}/${path}`),
      args: [rootVariable(host)],
      env: nativeBindings(script),
      cwd: null
    })),
    Match.when("codex", () => script.captures.length === 0 ? ({
      command: ProcessText.make(`./${path}`),
      args: [rootVariable(host)],
      env: nativeBindings(script),
      cwd: rootVariable(host)
    }) : null),
    Match.exhaustive
  )
}

const launcherHeader = "#!/bin/sh\nset -eu\n"
const cwdRootPrelude =
  "set -- \"$(/bin/pwd -P && printf .)\"\n" +
  "[ \"${1%.}\" != \"$1\" ]\n" +
  "set -- \"${1%.}\"\n" +
  "set -- \"${1%?}\"\n"

function serializeLauncherBody(script: Script): string {
  const captureGuards = script.captures.map(renderGuard).join("")
  const snapshot = [parameter(0), ...script.snapshot.map(renderWord)].join(" ")
  const removeCaptures = script.captures.length === 0
    ? ""
    : `unset ${script.captures.flatMap(({ raw, check }) => [raw, check]).join(" ")}\n`
  const transfers = script.environment.map((binding) =>
    `export ${transferName(script, binding.name)}=${parameter(binding.index)}\n`
  ).join("")
  const execEnvironment = script.environment.length === 0
    ? ""
    : "/usr/bin/env " +
      script.environment.map((binding) => `-u ${transferName(script, binding.name)} `).join("") +
      "-S " + quoteProcessText(ProcessText.make(script.environment.map((binding) =>
        `${binding.name}=` + "$" + "{" + transferName(script, binding.name) + "}"
      ).join(" "))) + " "
  const command = [parameter(script.command), ...script.args.map(parameter)].join(" ")
  return captureGuards +
    `set -- ${snapshot}\n` + removeCaptures +
    `cd ${parameter(script.cwd)}\n` + transfers +
    `exec ${execEnvironment}${command}\n`
}

export function serializeLauncher(script: Script): string {
  return launcherHeader + serializeLauncherBody(script)
}

export function serializeCwdLauncher(script: Script): string {
  return launcherHeader + cwdRootPrelude + serializeLauncherBody(script)
}

export const renderLauncher = (input: LauncherInput): LauncherOutput => {
  const script = compileLauncher(input.plan)
  return {
    script: ProcessText.make(serializeLauncher(script)),
    native: native(input.host, input.path, script)
  }
}
