import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Target } from "../contracts/Installer.ts"
import { inventoryFacts, marketplaceMatches, type NativeInventory } from "../src/installer/hosts/state.ts"
import { matchesTargetPath, targetPaths } from "../src/installer/target/resolve.ts"

const target = Schema.decodeSync(Target)({
  key: "native-metadata", plugin: "team.plugin", profile: "codex-local-marketplace:1", version: "0.163.0",
  destination: { type: "user", host: "codex", home: "/isolated/.codex" }
})
const paths = targetPaths(target)
const inventory: NativeInventory = {
  markets: [{ name: paths.marketName, root: paths.market }],
  declaration: { source_type: "local", source: paths.market },
  related: [], entries: {}, consumers: [], configuredConsumers: {}
}

it("binds a Codex marketplace summary through its root and exact local declaration", () => {
  expect(marketplaceMatches(target, inventory)).toBe(true)
  expect(marketplaceMatches(target, { ...inventory, markets: [{ ...inventory.markets[0], marketplaceSource: { sourceType: "local", source: paths.market } }] })).toBe(true)
  expect(marketplaceMatches(target, { ...inventory, markets: [] })).toBe(false)
  expect(marketplaceMatches(target, { ...inventory, markets: [...inventory.markets, ...inventory.markets] })).toBe(false)
  expect(marketplaceMatches(target, { ...inventory, markets: [{ name: paths.marketName, root: paths.market + "-neighbor" }] })).toBe(false)
  expect(marketplaceMatches(target, { ...inventory, declaration: { source_type: "local", source: paths.market + "-neighbor" } })).toBe(false)
  expect(marketplaceMatches(target, { ...inventory, markets: [{ root: paths.market, marketplaceSource: { sourceType: "local", source: paths.market + "-neighbor" } }] })).toBe(false)
})

it("requires valid source metadata when supplied and an exact declaration shape", () => {
  for (const marketplaceSource of [null, {}, { sourceType: "git", source: paths.market }, { sourceType: "local" }]) {
    expect(() => marketplaceMatches(target, { ...inventory, markets: [{ root: paths.market, marketplaceSource }] })).toThrow()
  }
  for (const declaration of [{ source_type: "local" }, { source_type: "git", source: paths.market },
    { source_type: "local", source: paths.market, extra: true }]) {
    expect(() => marketplaceMatches(target, { ...inventory, declaration })).toThrow()
  }
})

it("preserves raw native path spellings in fingerprint facts", () => {
  const reported = "\\\\?\\C:\\owned\\market"
  const input: NativeInventory = {
    ...inventory,
    related: [{ marketplaceSource: { sourceType: "local", source: reported } }],
    declaration: { source_type: "local", source: reported }
  }
  const before = structuredClone(input)
  const facts = inventoryFacts(input, null)
  expect(facts.plugins).toEqual(input.related)
  expect(facts.config).toEqual({ plugins: {}, marketplace: input.declaration })
  expect(input).toEqual(before)
})

it("rejects invalid observed path strings at the runtime adapter", () => {
  expect(matchesTargetPath(paths.market, paths.market)).toBe(true)
  expect(matchesTargetPath(paths.market, paths.market + "-neighbor")).toBe(false)
  for (const path of ["a\0b", "\ud800", "\udfff"]) expect(matchesTargetPath(path, path)).toBe(false)
})
