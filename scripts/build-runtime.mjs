import { fileURLToPath } from "node:url"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { build } from "rolldown"

const root = fileURLToPath(new URL("../", import.meta.url))
const result = await build({
  cwd: root,
  input: "src/runtime/process.ts",
  platform: "node",
  resolve: { mainFields: ["module", "main"] },
  write: false,
  external: (id) => id.startsWith("node:"),
  output: {
    file: fileURLToPath(new URL("../runtime/process.mjs", import.meta.url)),
    format: "esm",
    codeSplitting: false,
    comments: { legal: true, annotation: false, jsdoc: false }
  }
})

if (result.output.length !== 1) throw new Error("The process runtime must contain exactly one module")
const licenseFiles = {
  "@effect/platform-node": "LICENSE",
  "@effect/platform-node-shared": "LICENSE",
  effect: "LICENSE",
  "jsonc-parser": "LICENSE.md"
}
for (const output of result.output) {
  if (output.type !== "chunk" || output.imports.some((id) => !id.startsWith("node:")) || output.dynamicImports.length !== 0) {
    throw new Error("The process runtime must be one self-contained module with Node builtins only")
  }
  for (const id of Object.keys(output.modules)) {
    const dependency = /\/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id)?.[1]
    if (dependency !== undefined && !Object.hasOwn(licenseFiles, dependency)) {
      throw new Error(`Missing runtime dependency notice: ${dependency}`)
    }
  }
  const notices = await Promise.all(Object.entries(licenseFiles).map(async ([name, file]) => {
    const license = await readFile(new URL(`../node_modules/${name}/${file}`, import.meta.url), "utf8")
    return `${name}\n${license.trim()}`
  }))
  await mkdir(new URL("../runtime/", import.meta.url), { recursive: true })
  await writeFile(new URL("../runtime/process.mjs", import.meta.url), `/*!\n${notices.join("\n\n")}\n*/\n${output.code}`)
}
