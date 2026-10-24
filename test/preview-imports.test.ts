import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { Directory } from "../contracts/Plugin.ts"
import { ProjectError } from "../contracts/Project.ts"
import { readImportPreference } from "../src/project/preview/imports.ts"

const preferenceKey = "cursor/thirdPartyExtensibilityEnabled"
const sentinelKey = "fixture/unrelatedSetting"

const databasePath = (storage: string): string => join(storage, "User", "globalStorage", "state.vscdb")

const withTempStorage = async <A>(run: (storage: string) => Promise<A>): Promise<A> => {
  const storage = await mkdtemp(join(tmpdir(), "pluginsdk-preview-imports-"))
  try {
    return await run(storage)
  } finally {
    await rm(storage, { recursive: true, force: true })
  }
}

const createSettingsDatabase = async (storage: string): Promise<DatabaseSync> => {
  const path = databasePath(storage)
  await mkdir(dirname(path), { recursive: true })
  const database = new DatabaseSync(path)
  database.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value)")
  return database
}

const insertItemValue = (database: DatabaseSync, key: string, value: string | number): void => {
  database.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(key, value)
}

const insertPreference = (database: DatabaseSync, value: string | number): void => insertItemValue(database, preferenceKey, value)

const insertSentinel = (database: DatabaseSync): void => insertItemValue(database, sentinelKey, "leave this row unchanged")

const insertMissingTableSentinel = (database: DatabaseSync): void => {
  database.prepare("INSERT INTO SentinelTable (key, value) VALUES (?, ?)").run(sentinelKey, "leave this row unchanged")
}

const readStoredRow = async (storage: string, table: "ItemTable" | "SentinelTable", key: string) => {
  const database = new DatabaseSync(databasePath(storage), { readOnly: true })
  try {
    return database.prepare(`SELECT value FROM ${table} WHERE key = ?`).get(key)
  } finally {
    database.close()
  }
}

const readPreference = (storage: string): Promise<boolean> =>
  Effect.runPromise(readImportPreference(Directory.make(storage)).pipe(Effect.provide(NodeServices.layer)))

const expectProjectError = async (storage: string): Promise<void> => {
  await expect(readPreference(storage)).rejects.toBeInstanceOf(ProjectError)
}

it("defaults to enabled when the database is absent without creating its directories", async () =>
  withTempStorage(async (storage) => {
    expect(await readPreference(storage)).toBe(true)
    expect(await readdir(storage)).toEqual([])
  })
)

it("defaults to enabled when the preference row is absent", async () =>
  withTempStorage(async (storage) => {
    const database = await createSettingsDatabase(storage)
    insertSentinel(database)
    database.close()

    expect(await readPreference(storage)).toBe(true)
    expect(await readStoredRow(storage, "ItemTable", sentinelKey)).toEqual({ value: "leave this row unchanged" })
  })
)

for (const preference of [
  { stored: "true", expected: true },
  { stored: "false", expected: false }
]) {
  it(`preserves the stored ${preference.stored} preference`, async () =>
    withTempStorage(async (storage) => {
      const database = await createSettingsDatabase(storage)
      insertPreference(database, preference.stored)
      insertSentinel(database)
      database.close()

      expect(await readPreference(storage)).toBe(preference.expected)
      expect(await readStoredRow(storage, "ItemTable", preferenceKey)).toEqual({ value: preference.stored })
      expect(await readStoredRow(storage, "ItemTable", sentinelKey)).toEqual({ value: "leave this row unchanged" })
    })
  )
}

it("observes each committed preference through a live WAL writer", async () => {
  await withTempStorage(async (storage) => {
    const database = await createSettingsDatabase(storage)
    try {
      expect(database.prepare("PRAGMA journal_mode = WAL").get()?.journal_mode).toBe("wal")
      database.exec("PRAGMA wal_autocheckpoint = 0")
      insertPreference(database, "false")
      insertSentinel(database)

      expect(await readPreference(storage)).toBe(false)
      expect(await readStoredRow(storage, "ItemTable", preferenceKey)).toEqual({ value: "false" })

      database.prepare("UPDATE ItemTable SET value = ? WHERE key = ?").run("true", preferenceKey)
      expect(await readPreference(storage)).toBe(true)
      expect(await readStoredRow(storage, "ItemTable", preferenceKey)).toEqual({ value: "true" })
      expect(await readStoredRow(storage, "ItemTable", sentinelKey)).toEqual({ value: "leave this row unchanged" })
    } finally {
      database.close()
    }
  })
})

it("rejects a corrupt database without changing its bytes", async () => {
  await withTempStorage(async (storage) => {
    const path = databasePath(storage)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, "not a SQLite database")
    const before = await readFile(path)

    await expectProjectError(storage)

    expect(await readFile(path)).toEqual(before)
  })
})

it("rejects a database without ItemTable without changing its bytes or sentinel row", async () => {
  await withTempStorage(async (storage) => {
    const path = databasePath(storage)
    await mkdir(dirname(path), { recursive: true })
    const database = new DatabaseSync(path)
    database.exec("CREATE TABLE SentinelTable (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    insertMissingTableSentinel(database)
    database.close()
    const before = await readFile(path)

    await expectProjectError(storage)

    expect(await readFile(path)).toEqual(before)
    expect(await readStoredRow(storage, "SentinelTable", sentinelKey)).toEqual({ value: "leave this row unchanged" })
  })
})

it("rejects a malformed preference without changing stored values or database bytes", async () => {
  await withTempStorage(async (storage) => {
    const database = await createSettingsDatabase(storage)
    insertPreference(database, 1)
    insertSentinel(database)
    database.close()
    const path = databasePath(storage)
    const beforeBytes = await readFile(path)
    const beforePreference = await readStoredRow(storage, "ItemTable", preferenceKey)
    const beforeSentinel = await readStoredRow(storage, "ItemTable", sentinelKey)

    await expectProjectError(storage)

    expect(await readFile(path)).toEqual(beforeBytes)
    expect(await readStoredRow(storage, "ItemTable", preferenceKey)).toEqual(beforePreference)
    expect(await readStoredRow(storage, "ItemTable", sentinelKey)).toEqual(beforeSentinel)
  })
})
