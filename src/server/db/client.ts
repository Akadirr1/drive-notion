import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

let writerDb: ReturnType<typeof drizzle> | null = null;
let readerDb: ReturnType<typeof drizzle> | null = null;

function getDbPath(): string {
  return process.env.DATABASE_PATH || "./data/app.db";
}

/**
 * Worker (read-write) database client.
 * Opens the database in read-write mode, sets WAL and busy timeout,
 * and runs migrations. Caches the instance.
 */
export function getWriterDb(): ReturnType<typeof drizzle> {
  if (writerDb) {
    return writerDb;
  }

  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });

  migrate(db, {
    migrationsFolder: path.join(process.cwd(), "src/server/db/migrations"),
  });

  writerDb = db;
  return db;
}

/**
 * Web (read-only) database client.
 * Opens the database in read-only mode if the file exists.
 * Does NOT cache null if the file does not exist, so a newly created DB
 * is picked up on subsequent calls without restarting.
 */
export function getReaderDb(): ReturnType<typeof drizzle> | null {
  if (readerDb) {
    return readerDb;
  }

  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  const sqlite = new Database(dbPath, { readonly: true });
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });
  readerDb = db;
  return db;
}
