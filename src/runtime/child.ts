import { spawn, type ChildProcess } from "node:child_process"
import { Effect } from "effect"
import type { Scope } from "effect/Scope"
import type { Invocation } from "../../contracts/ProcessRuntime.ts"
import { ProcessRuntimeFailure } from "./failure.ts"

type ChildCompletion = {
  readonly failed: boolean
  readonly code: number | null
}

type ChildOwner = {
  readonly child: ChildProcess
  readonly completion: Promise<ChildCompletion>
  readonly status: { closed: boolean; failed: boolean }
}

function startChild(invocation: Invocation, environment: NodeJS.ProcessEnv): ChildOwner {
  const child = spawn(invocation.command, invocation.args, {
    shell: false,
    stdio: "inherit",
    cwd: invocation.cwd,
    env: environment,
    windowsHide: true,
    detached: false
  })
  const status = { closed: false, failed: false }
  const completion = new Promise<ChildCompletion>((resolve) => {
    child.on("error", () => {
      status.failed = true
    })
    child.once("close", (code) => {
      status.closed = true
      resolve({ failed: status.failed, code })
    })
  })
  return { child, completion, status }
}

const processRuntimeFailure = () => new ProcessRuntimeFailure({ detail: "Child process could not be started" })

export const runChild = Effect.fn("ProcessRuntime.runChild")(function*(
  invocation: Invocation,
  environment: NodeJS.ProcessEnv
): Effect.fn.Return<number, ProcessRuntimeFailure, Scope> {
  const owner = yield* Effect.acquireRelease(
    Effect.try({
      try: () => startChild(invocation, environment),
      catch: () => processRuntimeFailure()
    }),
    (current) => Effect.promise(async () => {
      if (!current.status.closed && current.child.pid !== undefined) current.child.kill("SIGKILL")
      await current.completion
    })
  )
  const completion = yield* Effect.promise(() => owner.completion)
  if (completion.failed) return yield* processRuntimeFailure()
  return completion.code ?? 1
}, Effect.scoped)
