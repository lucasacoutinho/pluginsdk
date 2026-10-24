import { Match } from "effect"
import * as Command from "../../../contracts/WindowsCommand.ts"

export const quoteWindowsArgument = (text: string): string => {
  const output = ['"']
  let slashes = 0
  for (const character of text) {
    if (character === "\\") { slashes += 1; continue }
    output.push("\\".repeat(character === '"' ? 2 * slashes + 1 : slashes), character)
    slashes = 0
  }
  output.push("\\".repeat(2 * slashes), '"')
  return output.join("")
}

export function windowsStreamStep({ state, signal }: Command.StreamInput): Command.StreamStep {
  return Match.value(signal).pipe(Match.discriminatorsExhaustive("type")({
    input: ({ bytes }) => Match.value(state.input).pipe(Match.discriminatorsExhaustive("type")({
      open: ({ remaining }): Command.StreamStep => bytes <= remaining
        ? {
            state: { input: { type: "open", remaining: Command.ByteCount.make(remaining - bytes) }, outputRemaining: state.outputRemaining },
            action: { type: "accepted" }
          }
        : { state, action: { type: "blocked", reason: "input_limit" } },
      closed: (): Command.StreamStep => ({ state, action: { type: "blocked", reason: "input_closed" } })
    })),
    output: ({ bytes }): Command.StreamStep => bytes <= state.outputRemaining
      ? {
          state: { input: state.input, outputRemaining: Command.ByteCount.make(state.outputRemaining - bytes) },
          action: { type: "accepted" }
        }
      : { state, action: { type: "blocked", reason: "output_limit" } },
    end_input: (): Command.StreamStep => ({
      state: { input: { type: "closed", remaining: state.input.remaining }, outputRemaining: state.outputRemaining },
      action: Match.value(state.input).pipe(Match.discriminatorsExhaustive("type")({
        open: (): Command.StreamAction => ({ type: "close_input" }),
        closed: (): Command.StreamAction => ({ type: "ignore" })
      }))
    })
  }))
}

export function windowsIoStep({ phase, signal }: Command.IoInput): Command.IoStep {
  return Match.value(phase).pipe(
    Match.when("pending", () => Match.value(signal).pipe(
      Match.when("cancel", (): Command.IoStep => ({ phase: "cancelling", action: "cancel" })),
      Match.when("completed", (): Command.IoStep => ({ phase: "terminal", action: "wait" })),
      Match.when("release", (): Command.IoStep => ({ phase: "pending", action: "wait" })),
      Match.exhaustive
    )),
    Match.when("cancelling", () => Match.value(signal).pipe(
      Match.when("cancel", (): Command.IoStep => ({ phase: "cancelling", action: "wait" })),
      Match.when("completed", (): Command.IoStep => ({ phase: "terminal", action: "wait" })),
      Match.when("release", (): Command.IoStep => ({ phase: "cancelling", action: "wait" })),
      Match.exhaustive
    )),
    Match.when("terminal", () => Match.value(signal).pipe(
      Match.when("cancel", (): Command.IoStep => ({ phase: "terminal", action: "ignore" })),
      Match.when("completed", (): Command.IoStep => ({ phase: "terminal", action: "ignore" })),
      Match.when("release", (): Command.IoStep => ({ phase: "released", action: "release" })),
      Match.exhaustive
    )),
    Match.when("released", (): Command.IoStep => ({ phase: "released", action: "ignore" })),
    Match.exhaustive
  )
}
