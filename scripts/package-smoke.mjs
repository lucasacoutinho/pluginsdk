import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import assert from "node:assert/strict"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const artifacts = join(root, ".artifacts")
const consumer = await mkdtemp(join(tmpdir(), "pluginsdk-consumer-"))
const run = (executable, args, cwd = consumer) => execFileSync(executable, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

try {
  await mkdir(artifacts, { recursive: true })
  const [packed] = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", artifacts], root))
  assert.equal(typeof packed.filename, "string")
  const archive = join(artifacts, packed.filename)
  const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  assert(packed.files.some((file) => file.path === "dist/src/installer/native-worker.js"))
  assert(packed.files.some((file) => file.path === "dist/schemas/plugin.schema.json"))
  assert(packed.files.some((file) => file.path === "schemas/LICENSE-APACHE-2.0.txt"))
  assert(packed.files.some((file) => file.path === "spec/PluginSdk/Lifecycle/Proofs.lean"))
  assert(packed.files.some((file) => file.path === "docs/design.md"))
  assert(packed.files.every((file) => !file.path.includes(".lake/")))
  assert(packed.files.every((file) => !file.path.includes(".references") && !file.path.includes(".audit")))
  await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "pluginsdk-consumer", private: true, type: "module" }))
  run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", archive])
  await mkdir(join(consumer, "skills/consumer-skill"), { recursive: true })
  await writeFile(join(consumer, "skills/consumer-skill/SKILL.md"), "---\nname: consumer-skill\ndescription: External package consumer.\n---\nRead fixture.bin.\n")
  await writeFile(join(consumer, "skills/consumer-skill/fixture.bin"), new Uint8Array([0, 255, 1, 128]))
  await writeFile(join(consumer, "definition.json"), JSON.stringify({ id: "consumer-fixture", version: "1.0.0", description: "External package consumer", skills: ["skills/consumer-skill"], mcp: {} }))
  const cli = join(consumer, "node_modules/.bin/pluginsdk")
  assert(run(cli, ["--version"]).includes(metadata.version))
  run(cli, ["build", "definition.json", "--root", consumer, "--out", "bundle.json"])
  const bundle = JSON.parse(await readFile(join(consumer, "bundle.json"), "utf8"))
  assert.equal(bundle.plugin, "consumer-fixture")
  assert.deepEqual(Buffer.from(bundle.files.find((file) => file.path === "skills/consumer-skill/fixture.bin").content, "base64"), Buffer.from([0, 255, 1, 128]))
  await writeFile(join(consumer, "consumer.mjs"), `
import assert from "node:assert/strict"
import { Effect, Schema } from "effect"
import { Compiler, BuildRequest } from "pluginsdk/Compiler"
import { Installer } from "pluginsdk/Installer"
import { Plugin } from "pluginsdk/Plugin"
import { Compiler as RootCompiler, Installer as RootInstaller } from "pluginsdk"
import { PluginSdkLive, devtools } from "pluginsdk/node"
assert.equal(Compiler, RootCompiler)
assert.equal(Installer, RootInstaller)
const author = Schema.decodeSync(Plugin)({ id: "consumer-fixture", version: "1.0.0", description: "External package consumer", skills: ["skills/consumer-skill"], mcp: {} })
assert.equal(author.id, "consumer-fixture")
assert.equal(typeof devtools, "function")
const request = Schema.decodeSync(BuildRequest)({ root: process.cwd(), format: "agent_plugins_v1", plugin: Schema.encodeSync(Plugin)(author) })
const built = await Effect.runPromise(Compiler.use((service) => service.build(request)).pipe(Effect.provide(PluginSdkLive)))
assert.equal(built.plugin, "consumer-fixture")
`)
  run(process.execPath, ["consumer.mjs"])
  await writeFile(join(consumer, "consumer.ts"), `
import { Effect, Schema } from "effect"
import { Compiler, BuildRequest } from "pluginsdk/Compiler"
import { Installer, type Planning, type ReadyPlan, type ReviewedPlan } from "pluginsdk/Installer"
import { PluginSdkLive } from "pluginsdk/node"
const request = Schema.decodeSync(BuildRequest)({ root: ".", format: "agent_plugins_v1", plugin: { id: "consumer-fixture", version: "1", description: "Types", skills: [], mcp: {} } })
export const build = Compiler.use((service) => service.build(request)).pipe(Effect.provide(PluginSdkLive))
export const apply = (reviewed: ReviewedPlan) => Installer.use((service) => service.apply(reviewed)).pipe(Effect.provide(PluginSdkLive))
export const applyReady = (reviewed: ReadyPlan) => apply(reviewed)
export const repair = (pending: ReviewedPlan) => Installer.use((service) => service.plan({
  destination: pending.target.destination,
  intent: { type: "repair", plugin: pending.target.plugin, pending: pending.id }
})).pipe(Effect.provide(PluginSdkLive))
export const invalid = (planning: Planning) => Installer.use((service) => {
  // @ts-expect-error Only a reviewed plan may be applied.
  return service.apply(planning)
})
`)
  run(join(root, "node_modules/.bin/tsc"), ["--noEmit", "--strict", "--skipLibCheck", "--module", "NodeNext", "--target", "ES2024", "consumer.ts"])
  if (process.argv.includes("--native")) {
    for (const host of ["claude_code", "codex"]) {
      const home = join(consumer, "native", host, host === "codex" ? ".codex" : ".claude")
      await mkdir(home, { recursive: true })
      const bundleFile = `${host}.bundle.json`
      const planFile = `${host}.plan.json`
      run(cli, ["build", "definition.json", "--root", consumer, "--format", host === "codex" ? "agent_plugins_v1" : "claude_code_v1", "--out", bundleFile])
      const ready = JSON.parse(run(cli, ["plan", bundleFile, "--host", host, "--home", home, "--out", planFile, "--json"]))
      assert.equal(ready.type, "ready")
      assert.match(run(cli, ["show", planFile]), /skills\/consumer-skill\/fixture.bin/)
      const installed = JSON.parse(run(cli, ["apply", planFile, "--json"]))
      assert.equal(installed.result.type, "installed")
      assert.deepEqual(JSON.parse(run(cli, ["apply", planFile, "--json"])), installed)
      const removal = `${host}.remove.json`
      assert.equal(JSON.parse(run(cli, ["remove", "consumer-fixture", "--host", host, "--home", home, "--out", removal, "--json"])).type, "ready")
      assert.equal(JSON.parse(run(cli, ["apply", removal, "--json"])).result.type, "removed")
    }
    console.log("Installed-package native lifecycle passed: Claude Code and Codex")
  }
  const digest = createHash("sha256").update(await readFile(archive)).digest("hex")
  await writeFile(`${archive}.sha256`, `${digest}  ${packed.filename}\n`)
  console.log(`Package consumer passed: ${packed.filename}\nSHA-256: ${digest}`)
} catch (cause) {
  if (typeof cause === "object" && cause !== null && "stderr" in cause) process.stderr.write(String(cause.stderr))
  throw cause
} finally {
  await rm(consumer, { recursive: true, force: true })
}
