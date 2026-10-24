import { Array, Match, Schema } from "effect"
import { LocalMcpProblem } from "../../../contracts/Compiler.ts"
import type { ProcessInput, ProcessResult, Word } from "../../../contracts/Process.ts"
import { ProcessText } from "../../../contracts/Plugin.ts"
import type { PackagePath } from "../../../contracts/Plugin.ts"
import { compareUtf8 } from "../../internal/paths.ts"

const sameProblem = Schema.toEquivalence(LocalMcpProblem)

function argumentFilePaths(input: ProcessInput): ReadonlyArray<PackagePath> {
  return input.definition.args.flatMap((argument) => Match.value(argument).pipe(
    Match.discriminatorsExhaustive("type")({
      literal: () => [],
      file: ({ path }) => [path]
    })
  ))
}

function commandFilePaths(input: ProcessInput): ReadonlyArray<PackagePath> {
  return Match.value(input.definition.command).pipe(
    Match.discriminatorsExhaustive("type")({
      external: () => [],
      file: ({ path }) => [path]
    })
  )
}

function missingFileProblems(input: ProcessInput): LocalMcpProblem[] {
  return [...commandFilePaths(input), ...argumentFilePaths(input)]
    .filter((path) => !input.files.some((file) => file.path === path))
    .map((path): LocalMcpProblem => ({ type: "missing_file", path }))
}

function notExecutableProblems(input: ProcessInput): LocalMcpProblem[] {
  return Match.value(input.definition.command).pipe(
    Match.discriminatorsExhaustive("type")({
      external: () => [],
      file: ({ path }) => input.files
        .filter((file) => file.path === path && !file.executable)
        .map((): LocalMcpProblem => ({ type: "not_executable", path }))
    })
  )
}

function missingDirectoryProblems(input: ProcessInput): LocalMcpProblem[] {
  const cwd = input.definition.cwd
  if (cwd === null || input.files.some((file) => file.path.startsWith(`${cwd}/`))) return []
  return [{ type: "missing_directory", path: cwd }]
}

function unsupportedEnvironmentProblems(input: ProcessInput): LocalMcpProblem[] {
  return Match.value(input.host).pipe(
    Match.when("claude_code", (): LocalMcpProblem[] => []),
    Match.when("codex", (): LocalMcpProblem[] => input.definition.environment.flatMap((binding) =>
      Match.value(binding.value).pipe(Match.discriminatorsExhaustive("type")({
        literal: () => [],
        reference: ({ name }): LocalMcpProblem[] => [{ type: "environment_reference_unsupported", name }]
      }))
    )),
    Match.exhaustive
  )
}

function environmentCollisionProblems(input: ProcessInput): LocalMcpProblem[] {
  return input.definition.environment.flatMap(({ name }): LocalMcpProblem[] =>
    input.definition.environment.filter((binding) => binding.name === name).length > 1
      ? [{ type: "environment_collision", name }]
      : []
  )
}

function problemDetail(problem: LocalMcpProblem): string {
  return Match.value(problem).pipe(Match.discriminatorsExhaustive("type")({
    missing_file: ({ path }) => path,
    not_executable: ({ path }) => path,
    missing_directory: ({ path }) => path,
    environment_reference_unsupported: ({ name }) => name,
    environment_collision: ({ name }) => name
  }))
}

function orderedProblems(input: ProcessInput): LocalMcpProblem[] {
  const problems = [
    ...missingFileProblems(input),
    ...notExecutableProblems(input),
    ...missingDirectoryProblems(input),
    ...unsupportedEnvironmentProblems(input),
    ...environmentCollisionProblems(input)
  ]
  return [...Array.dedupeWith(problems, sameProblem)].sort((left, right) =>
    compareUtf8(left.type, right.type) || compareUtf8(problemDetail(left), problemDetail(right))
  )
}

function lowerProgram(input: ProcessInput): Word {
  return Match.value(input.definition.command).pipe(Match.discriminatorsExhaustive("type")({
    external: ({ name }): Word => ({ type: "literal", value: ProcessText.make(name) }),
    file: ({ path }): Word => ({ type: "file", path })
  }))
}

function lowerArgument(input: ProcessInput["definition"]["args"][number]): Word {
  return Match.value(input).pipe(Match.discriminatorsExhaustive("type")({
    literal: ({ value }): Word => ({ type: "literal", value }),
    file: ({ path }): Word => ({ type: "file", path })
  }))
}

function lowerEnvironmentValue(input: ProcessInput["definition"]["environment"][number]["value"]): Word {
  return Match.value(input).pipe(Match.discriminatorsExhaustive("type")({
    literal: ({ value }): Word => ({ type: "literal", value }),
    reference: ({ name }): Word => ({ type: "environment", name })
  }))
}

export const lowerProcess = (input: ProcessInput): ProcessResult => {
  const [first, ...rest] = orderedProblems(input)
  if (first !== undefined) return { type: "rejected", issues: [first, ...rest] }

  const environment = input.definition.environment
    .map(({ name, value }) => ({ name, value: lowerEnvironmentValue(value) }))
    .sort((left, right) => compareUtf8(left.name, right.name))
  return {
    type: "planned",
    plan: {
      command: lowerProgram(input),
      args: input.definition.args.map(lowerArgument),
      environment,
      cwd: input.definition.cwd === null ? { type: "root" } : { type: "file", path: input.definition.cwd }
    }
  }
}

export const quoteProcessText = (text: ProcessText): string => `'${text.replaceAll("'", "'\\''")}'`
