import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"

// Ensure directory exists
const dbPath = path.join(os.homedir(), ".kilocode", "evolution")
if (!fs.existsSync(dbPath)) {
	fs.mkdirSync(dbPath, { recursive: true })
}

const sqlite = new Database(path.join(dbPath, "darwin.db"))
export const db = drizzle(sqlite, { schema })

export type Database = typeof db
