import { Match } from "effect"
import type { WorkerInput, WorkerStep } from "../../../contracts/Worker.ts"

export function admitWorkerRequest({ state, signal }: WorkerInput): WorkerStep {
  return Match.value(state).pipe(
    Match.when("waiting", () => Match.value(signal).pipe(
      Match.when("request", (): WorkerStep => ({ state: "accepted", action: "start" })),
      Match.whenOr("invalid", "disconnect", (): WorkerStep => ({ state: "stopped", action: "stop" })),
      Match.exhaustive
    )),
    Match.when("accepted", (): WorkerStep => ({ state: "accepted", action: "ignore" })),
    Match.when("stopped", (): WorkerStep => ({ state: "stopped", action: "ignore" })),
    Match.exhaustive
  )
}
