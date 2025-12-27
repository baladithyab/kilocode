import { defineConfig } from "drizzle-kit"
import * as path from "path"
import * as os from "os"

export default defineConfig({
	out: "./src/shared/evolution/db/migrations",
	schema: "./src/shared/evolution/db/schema.ts",
	dialect: "sqlite",
	dbCredentials: {
		url: path.join(os.homedir(), ".kilocode", "evolution", "darwin.db"),
	},
	verbose: true,
	strict: true,
})
