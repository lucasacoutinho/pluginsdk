import { Match, Schema } from "effect"
import * as Writers from "../../../contracts/Writers.ts"

const sameWriter = Schema.toEquivalence(Writers.Writer)
const sameWriters = Schema.toEquivalence(Schema.Array(Writers.Writer))

function unique(writers: ReadonlyArray<Writers.Writer>): boolean {
  return writers.every((writer, index) => writers.findIndex((actual) => sameWriter(actual, writer)) === index)
}

function validAdmission(writers: ReadonlyArray<Writers.Writer>, writer: Writers.Writer): boolean {
  return unique(writers) && !writers.some((actual) => sameWriter(actual, writer))
}

export function observeWriter({ writer, lookup }: Writers.ObservationInput): Writers.Observation {
  const state = Match.value(lookup).pipe(Match.discriminatorsExhaustive("type")({
    opened: (lookup): Writers.ProcessState => lookup.writer.pid !== writer.pid
      ? "unknown"
      : lookup.writer.creation !== writer.creation ? "terminated" : lookup.state,
    missing: ({ pid }): Writers.ProcessState => pid === writer.pid ? "terminated" : "unknown",
    unavailable: (): Writers.ProcessState => "unknown"
  }))
  return { writer, state }
}

export function writerCompletion({ writers, observed }: Writers.CompletionInput): Writers.Completion {
  if (observed.some((observation) => observation.state === "active" &&
    writers.some((writer) => sameWriter(writer, observation.writer)))) return "active"
  if (unique(writers) && writers.every((writer) => {
    const matches = observed.filter((observation) => sameWriter(writer, observation.writer))
    return matches.length === 1 && matches[0]?.state === "terminated"
  })) return "complete"
  return "unknown"
}

export function priorOwnerCompletion({ current, owners, observed }: Writers.PriorOwnersInput): Writers.Completion {
  return writerCompletion({ writers: owners.filter((owner) => !sameWriter(owner, current)), observed })
}

function stop(writers: ReadonlyArray<Writers.Writer>): Writers.GateStep {
  return { state: { type: "stopped", writers }, action: { type: "stop" } }
}

export function writerStep({ state, signal }: Writers.GateInput): Writers.GateStep {
  return Match.value(state).pipe(Match.discriminatorsExhaustive("type")({
    open: (state) => Match.value(signal).pipe(Match.discriminatorsExhaustive("type")({
      birth: ({ writer }): Writers.GateStep => validAdmission(state.writers, writer)
        ? { state: { type: "retaining", writers: state.writers, writer }, action: { type: "retain", writers: [...state.writers, writer] } }
        : stop(state.writers),
      retained: (): Writers.GateStep => stop(state.writers),
      failed: (): Writers.GateStep => stop(state.writers),
      close: ({ observed }) => Match.value(writerCompletion({ writers: state.writers, observed })).pipe(
        Match.when("complete", (): Writers.GateStep => ({ state: { type: "closed", writers: state.writers }, action: { type: "complete" } })),
        Match.when("active", (): Writers.GateStep => ({ state, action: { type: "wait", reason: "active" } })),
        Match.when("unknown", (): Writers.GateStep => ({ state, action: { type: "wait", reason: "unknown" } })),
        Match.exhaustive
      ),
      stop: (): Writers.GateStep => stop(state.writers)
    })),
    retaining: (state) => Match.value(signal).pipe(Match.discriminatorsExhaustive("type")({
      birth: (): Writers.GateStep => stop(state.writers),
      retained: ({ writers }): Writers.GateStep => {
        const next = [...state.writers, state.writer]
        return validAdmission(state.writers, state.writer) && sameWriters(writers, next)
          ? { state: { type: "open", writers: next }, action: { type: "resume", writer: state.writer } }
          : stop(state.writers)
      },
      failed: (): Writers.GateStep => stop(state.writers),
      close: (): Writers.GateStep => stop(state.writers),
      stop: (): Writers.GateStep => stop(state.writers)
    })),
    closed: (state): Writers.GateStep => ({ state, action: { type: "stop" } }),
    stopped: (state): Writers.GateStep => ({ state, action: { type: "stop" } })
  }))
}
