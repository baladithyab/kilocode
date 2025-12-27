import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

/**
 * Database type for the Darwin evolution system
 */
export type DarwinDatabase = BetterSQLite3Database<typeof schema>

/**
 * Lazy database connection - only initialized when first accessed.
 * This prevents:
 * - Database creation when Darwin is disabled
 * - Test failures from native module loading issues
 * - Side effects at module import time
 */
let _db: DarwinDatabase | null = null
let _sqlite: Database.Database | null = null

/**
 * Get the default database path
 */
export function getDefaultDbPath(): string {
	return path.join(os.homedir(), ".kilocode", "evolution")
}

/**
 * Get the database instance (lazy initialization)
 * @throws Error if database cannot be initialized
 */
export function getDb(): DarwinDatabase {
	if (_db === null) {
		const dbPath = getDefaultDbPath()
		if (!fs.existsSync(dbPath)) {
			fs.mkdirSync(dbPath, { recursive: true })
		}
		_sqlite = new Database(path.join(dbPath, "darwin.db"))
		_db = drizzle(_sqlite, { schema })
	}
	return _db
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
	return _db !== null
}

/**
 * Close the database connection (for cleanup/testing)
 */
export function closeDb(): void {
	if (_sqlite) {
		_sqlite.close()
		_sqlite = null
		_db = null
	}
}

/**
 * Reset database for testing - allows setting a mock database
 * @internal - Only for testing
 */
export function __setTestDb(testDb: DarwinDatabase | null): void {
	_db = testDb
}

/**
 * Legacy export for backwards compatibility
 * @deprecated Use getDb() instead for lazy initialization
 */
export const db = new Proxy({} as DarwinDatabase, {
	get(_, prop) {
		return (getDb() as unknown as Record<string | symbol, unknown>)[prop]
	},
})

// Re-export Database type for compatibility
export type Database = DarwinDatabase
