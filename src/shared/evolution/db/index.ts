// Database connection (lazy initialization)
export {
	db,
	getDb,
	closeDb,
	isDatabaseInitialized,
	getDefaultDbPath,
	__setTestDb,
	type DarwinDatabase,
	type Database,
} from "./db"

// Schema
export * from "./schema"

// Queries
export * from "./queries/traces"
export * from "./queries/proposals"
export * from "./queries/skills"
export * from "./queries/council"
