import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Destination, Host } from "../contracts/Installer.ts"
import { LockSubjects, OracleRequest, OracleResponse } from "../contracts/InstallationLocks.ts"
import { parseJson } from "../src/internal/json.ts"
import { installationLockSubjects } from "../src/installer/target/lock-policy.ts"

const directories = ["/tmp/home-a", "/tmp/home-b", "C:\\Users\\Dev Team\\.claude", "/tmp/ação-🚀", "/tmp/shared"]
const decodeDestination = Schema.decodeUnknownSync(Destination, { onExcessProperty: "error" })

it("IL1–IL4: selects the same ordered lock subjects as Lean for every host and scope", () => {
  const inputs = Host.literals.flatMap((host) => directories.flatMap((home) => [
    decodeDestination({ type: "user", host, home }),
    ...directories.map((root) => decodeDestination({ type: "project", host, home, root }))
  ]))
  const requests = inputs.map((input) => Schema.encodeSync(OracleRequest)({ schema: 1, type: "installation_lock_subjects", input }))
  const oracle = fileURLToPath(new URL("../spec/.lake/build/bin/oracle", import.meta.url))
  const result = spawnSync(oracle, [], { input: `${requests.map((request) => JSON.stringify(request)).join("\n")}\n`, encoding: "utf8", timeout: 10_000 })
  if (result.error !== undefined) throw result.error
  expect(result.status, result.stderr).toBe(0)
  const decode = Schema.decodeUnknownSync(OracleResponse, { onExcessProperty: "error" })
  const responses = result.stdout.trim().split("\n").map((line) => decode(parseJson(line)))
  expect(responses).toHaveLength(inputs.length)
  for (const [index, input] of inputs.entries()) {
    const before = structuredClone(input)
    expect(installationLockSubjects(input)).toEqual(responses[index]?.output)
    expect(input).toEqual(before)
  }
})

it("rejects malformed destinations and impossible lock sequences", () => {
  const decode = Schema.decodeUnknownSync(OracleRequest, { onExcessProperty: "error" })
  for (const input of [
    { type: "user", host: "claude_code", home: "" },
    { type: "project", host: "claude_code", home: "/home/a" },
    { type: "project", host: "claude_code", home: "/home/a", root: "" },
    { type: "user", host: "unknown", home: "/home/a" },
    { type: "user", host: "claude_code", home: "/home/a", root: "/project" }
  ]) expect(() => decode({ schema: 1, type: "installation_lock_subjects", input })).toThrow()
  const subjects = Schema.decodeUnknownSync(LockSubjects, { onExcessProperty: "error" })
  for (const input of [[], [{ type: "project", root: "/project" }], [
    { type: "project", root: "/project" }, { type: "home", root: "/home/a" }
  ], [
    { type: "home", root: "/home/a" }, { type: "home", root: "/home/b" }
  ]]) expect(() => subjects(input)).toThrow()
})
