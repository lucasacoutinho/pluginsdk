import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { chmod, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { Match, Schema } from "effect"
import type { Bundle, Format } from "../../contracts/Compiler.ts"

const manifestPaths = ["plugin.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]
const manifestSet = new Set(manifestPaths)
const expectedSkillCount = 34
const expectedSkillFileCount = 151
const expectedFileCount = 160
const expectedExecutableCount = 9
const Manifest = Schema.Struct({ name: Schema.Literal("lstack"), version: Schema.NonEmptyString, description: Schema.NonEmptyString, license: Schema.Literal("MIT") })
const Receipt = Schema.Struct({ source: Schema.NonEmptyString, sourceRevision: Schema.NonEmptyString, payloadSha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)), skillCount: Schema.Literal(34), scope: Schema.NonEmptyString })

export type PilotHost = "claude_code" | "codex"
export type SourceFile = { readonly path: string; readonly content: Buffer; readonly digest: string; readonly mode: number; readonly executable: boolean }
export type SourceInventory = { readonly files: readonly SourceFile[]; readonly directories: readonly { readonly path: string; readonly mode: number }[] }
export type SourceSnapshot = { readonly root: string; readonly id: "lstack"; readonly version: string; readonly description: string; readonly skills: readonly string[]; readonly files: readonly SourceFile[]; readonly assets: readonly string[]; readonly digest: string; readonly receiptFields: readonly string[]; readonly manifestFields: readonly string[]; readonly brokenNoticeRefs: readonly string[] }
export type BundleProof = { readonly files: number; readonly skillFiles: number; readonly assetFiles: number; readonly executables: number }
export type SkillUpdate = { readonly path: string; readonly content: Buffer; readonly marker: Buffer }

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")
const inside = (root: string, path: string): boolean => {
  const part = relative(root, path)
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}
const ordered = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
const signature = (files: readonly SourceFile[]) => files.map(({ path, digest, mode }) => ({ path, digest, mode }))
const digestInventory = (inventory: SourceInventory): string => sha256(Buffer.from([
  ...inventory.directories.map(({ path, mode }) => `d\0${path}\0${mode}`),
  ...inventory.files.map(({ path, mode, digest }) => `f\0${path}\0${mode}\0${digest}`)
].sort(ordered).join("\n")))
export const inventoryDigest = (inventory: SourceInventory): string => digestInventory(inventory)
export const assertSameInventory = (expected: SourceInventory, actual: SourceInventory): void => {
  assert.deepEqual(signature(actual.files), signature(expected.files))
  assert.deepEqual(actual.directories, expected.directories)
}

export const formatFor = (host: PilotHost): Format => Match.value(host).pipe(
  Match.when("claude_code", (): Format => "claude_code"),
  Match.when("codex", (): Format => "codex"),
  Match.exhaustive
)

export const manifestPathFor = (host: PilotHost): string => Match.value(host).pipe(Match.when("claude_code", () => ".claude-plugin/plugin.json"), Match.when("codex", () => ".codex-plugin/plugin.json"), Match.exhaustive)

export const inventorySource = async (root: string): Promise<SourceInventory> => {
  const files: SourceFile[] = []
  const directories: Array<{ path: string; mode: number }> = []
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const info = await lstat(directory)
    assert.equal(info.isSymbolicLink(), false, `Source contains a symbolic link: ${prefix || "."}`)
    assert.equal(info.isDirectory(), true, `Source path is not a directory: ${prefix || "."}`)
    directories.push({ path: prefix, mode: info.mode & 0o7777 })
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => ordered(left.name, right.name))
    for (const entry of entries) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`
      const fullPath = join(directory, entry.name)
      const child = await lstat(fullPath)
      assert.equal(child.isSymbolicLink(), false, `Source contains a symbolic link: ${path}`)
      if (child.isDirectory()) await visit(fullPath, path)
      else {
        assert.equal(child.isFile(), true, `Source contains a non-regular entry: ${path}`)
        const content = await readFile(fullPath)
        const mode = child.mode & 0o7777
        files.push({ path, content, digest: sha256(content), mode, executable: (mode & 0o111) !== 0 })
      }
    }
  }
  await visit(root, "")
  files.sort((left, right) => ordered(left.path, right.path))
  directories.sort((left, right) => ordered(left.path, right.path))
  return { files, directories }
}

export const copySource = async (inventory: SourceInventory, destination: string): Promise<void> => {
  await mkdir(destination, { recursive: true })
  for (const directory of inventory.directories) if (directory.path !== "") await mkdir(join(destination, directory.path), { recursive: true })
  for (const file of inventory.files) {
    const path = join(destination, file.path)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, file.content)
    await chmod(path, file.mode)
  }
  for (const directory of [...inventory.directories].sort((left, right) => right.path.length - left.path.length)) {
    await chmod(directory.path === "" ? destination : join(destination, directory.path), directory.mode)
  }
  const copied = await inventorySource(destination)
  assert.deepEqual(signature(copied.files), signature(inventory.files), "Isolated source copy changed file bytes or modes")
  assert.deepEqual(copied.directories, inventory.directories, "Isolated source copy changed directory modes")
}

const readMetadata = (files: readonly SourceFile[]) => {
  const byPath = new Map(files.map((file) => [file.path, file]))
  const manifests = manifestPaths.map((path) => {
    const file = byPath.get(path)
    assert.ok(file, `Missing lstack source manifest ${path}`)
    const value: unknown = JSON.parse(file.content.toString("utf8"))
    const raw = Schema.decodeUnknownSync(Schema.JsonObject)(value)
    assert.equal(Object.hasOwn(raw, "hooks"), false, `${path} declares hooks`)
    assert.equal(Object.hasOwn(raw, "mcp"), false, `${path} declares MCP`)
    return { path, value: Schema.decodeUnknownSync(Manifest)(raw), raw }
  })
  const [root, claude, codex] = manifests
  assert.ok(root && claude && codex)
  assert.equal(root.value.version, claude.value.version)
  assert.equal(root.value.description, claude.value.description)
  assert.equal(root.value.description, codex.value.description)
  assert.ok(codex.value.version.startsWith(`${root.value.version}+codex.`))
  const receiptFile = byPath.get(".lstack-generated.json")
  const receiptValue: unknown = receiptFile === undefined ? undefined : JSON.parse(receiptFile.content.toString("utf8"))
  const receipt = receiptValue === undefined ? undefined : Schema.decodeUnknownSync(Receipt)(receiptValue)
  if (receipt !== undefined) assert.equal(receipt.skillCount, expectedSkillCount)
  const assets = ["LICENSE", "NOTICE.md", "third_party", ...(receiptFile === undefined ? [] : [".lstack-generated.json"])]
  for (const path of assets) assert.ok(byPath.has(path) || files.some((file) => file.path.startsWith(`${path}/`)), `Missing source asset ${path}`)
  const manifestFields = [...new Set(manifests.flatMap(({ raw }) => Object.keys(raw)))].sort(ordered)
  const receiptFields = receipt === undefined ? [] : Object.keys(receipt).sort(ordered)
  return { root: root.value, receiptFields, manifestFields, assets }
}

const sourceSkills = async (root: string, files: readonly SourceFile[]): Promise<readonly string[]> => {
  const entries = await readdir(join(root, "skills"), { withFileTypes: true })
  const skills = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(ordered)
  assert.equal(entries.length, skills.length, "The skills root must contain only skill directories")
  assert.equal(skills.length, expectedSkillCount)
  for (const skill of skills) assert.ok(files.some((file) => file.path === `skills/${skill}/SKILL.md`), `Skill has no SKILL.md: ${skill}`)
  assert.equal(files.filter((file) => file.path.startsWith("skills/")).length, expectedSkillFileCount)
  assert.equal(files.filter((file) => file.executable).length, expectedExecutableCount)
  assert.equal(files.length, expectedFileCount)
  const extras = files.filter((file) => !manifestSet.has(file.path) && !file.path.startsWith("skills/") && !["LICENSE", "NOTICE.md", ".lstack-generated.json"].includes(file.path) && !file.path.startsWith("third_party/"))
  assert.deepEqual(extras.map((file) => file.path), [], "Found an undeclared non-skill source file")
  const nativeParts = files.filter((file) => {
    const parts = file.path.split("/")
    return parts[0] === "hooks" || parts[0] === "mcp" || (parts[0] !== "skills" && parts.includes("hooks")) || ["mcp.json", ".mcp.json"].includes(parts.at(-1) ?? "")
  })
  assert.deepEqual(nativeParts.map((file) => file.path), [], "Source contains undeclared hooks or MCP files")
  return skills
}

const missingNoticeRefs = async (root: string): Promise<readonly string[]> => {
  const text = await readFile(join(root, "NOTICE.md"), "utf8")
  const links = [...text.matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s+[^)]*)?\)/gu)].map((match) => match[1] ?? "")
  const missing: string[] = []
  for (const link of links) {
    if (/^(?:https?:|mailto:|#)/iu.test(link)) continue
    const path = resolve(root, link.split(/[?#]/u)[0] ?? "")
    if (!inside(root, path)) missing.push(link)
    else try { await lstat(path) } catch (cause) {
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") missing.push(link)
      else throw cause
    }
  }
  return [...new Set(missing)].sort(ordered)
}

export const inspectSource = async (path: string): Promise<{ readonly snapshot: SourceSnapshot; readonly inventory: SourceInventory }> => {
  const root = await realpath(resolve(path))
  const inventory = await inventorySource(root)
  const metadata = readMetadata(inventory.files)
  const skills = await sourceSkills(root, inventory.files)
  const snapshot: SourceSnapshot = {
    root, id: "lstack", version: metadata.root.version, description: metadata.root.description,
    skills, files: inventory.files, assets: metadata.assets, digest: digestInventory(inventory),
    receiptFields: metadata.receiptFields, manifestFields: metadata.manifestFields, brokenNoticeRefs: await missingNoticeRefs(root)
  }
  return { snapshot, inventory }
}

export const verifyBundle = (bundle: Bundle, source: SourceSnapshot, host: PilotHost, version: string, sourceFiles: readonly SourceFile[] = source.files): BundleProof => {
  assert.equal(bundle.plugin, source.id)
  assert.equal(bundle.format, formatFor(host))
  const manifestPath = manifestPathFor(host)
  const manifest = bundle.files.find((file) => file.path === manifestPath)
  assert.ok(manifest, `Compiled bundle is missing ${manifestPath}`)
  const manifestValue: unknown = JSON.parse(Buffer.from(manifest.content).toString("utf8"))
  const outputManifest = Schema.decodeUnknownSync(Schema.JsonObject)(manifestValue)
  assert.deepEqual(Object.keys(outputManifest).sort(ordered), ["description", "name", "version"])
  assert.equal(outputManifest.name, source.id)
  assert.equal(outputManifest.version, version)
  assert.equal(outputManifest.description, source.description)
  assert.equal(Object.hasOwn(outputManifest, "hooks"), false)
  assert.equal(Object.hasOwn(outputManifest, "mcp"), false)
  const expected = sourceFiles.filter((file) => !manifestSet.has(file.path)).map((file) => file.path)
  expected.push(manifestPath)
  expected.sort(ordered)
  const actual = bundle.files.map((file) => file.path).sort(ordered)
  assert.deepEqual(actual, expected, "Bundle must retain all source files while regenerating exactly one target manifest")
  for (const original of sourceFiles) {
    if (manifestSet.has(original.path)) continue
    const output = bundle.files.find((file) => file.path === original.path)
    assert.ok(output, `Bundle dropped source file ${original.path}`)
    assert.deepEqual(Buffer.from(output.content), original.content, `Bundle bytes differ for ${original.path}`)
    assert.equal(output.executable, original.executable, `Bundle executable bit differs for ${original.path}`)
  }
  return {
    files: bundle.files.length,
    skillFiles: bundle.files.filter((file) => file.path.startsWith("skills/")).length,
    assetFiles: bundle.files.filter((file) => !file.path.startsWith("skills/") && file.path !== manifestPath).length,
    executables: bundle.files.filter((file) => file.executable).length
  }
}

export const verifyPayload = async (root: string, bundle: Bundle): Promise<void> => {
  const inventory = await inventorySource(await realpath(root))
  const expected = bundle.files.map((file) => file.path).sort(ordered)
  assert.deepEqual(inventory.files.map((file) => file.path), expected, `Native payload paths differ at ${root}`)
  for (const output of bundle.files) {
    const actual = inventory.files.find((file) => file.path === output.path)
    assert.ok(actual)
    assert.deepEqual(actual.content, Buffer.from(output.content), `Native payload bytes differ for ${output.path}`)
    assert.equal(actual.executable, output.executable, `Native payload executable bit differs for ${output.path}`)
  }
}

export const updateSkill = async (root: string): Promise<SkillUpdate> => {
  const path = join(root, "skills", "lstack", "SKILL.md")
  const info = await stat(path)
  const content = await readFile(path)
  const marker = Buffer.from("\n\n## PluginSDK pilot update\n\nIsolated acceptance update.\n")
  await writeFile(path, Buffer.concat([content, marker]))
  await chmod(path, info.mode & 0o7777)
  return { path: "skills/lstack/SKILL.md", content, marker }
}

export const verifyOnlySkillChanged = (before: SourceInventory, after: SourceInventory, update: SkillUpdate): void => {
  assert.deepEqual(after.files.map((file) => file.path), before.files.map((file) => file.path))
  for (const original of before.files) {
    const changed = after.files.find((file) => file.path === original.path)
    assert.ok(changed)
    assert.equal(changed.mode, original.mode, `Update changed mode on ${original.path}`)
    if (original.path === update.path) {
      assert.deepEqual(changed.content.subarray(0, update.content.length), update.content)
      assert.deepEqual(changed.content.subarray(update.content.length), update.marker)
    } else assert.equal(changed.digest, original.digest, `Update changed unrelated file ${original.path}`)
  }
}
