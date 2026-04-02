import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import type { Channel, ChannelFilter } from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/virtual-tv.db");

// Ensure the data directory exists
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create tables on first run
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    number INTEGER NOT NULL UNIQUE,
    filters TEXT NOT NULL DEFAULT '{}',
    shuffle_mode TEXT NOT NULL DEFAULT 'random',
    logo_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export default db;

export interface ChannelRow {
  id: string;
  name: string;
  number: number;
  filters: string;
  shuffle_mode: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    number: row.number,
    filters: JSON.parse(row.filters) as ChannelFilter,
    shuffleMode: row.shuffle_mode as Channel["shuffleMode"],
    logoUrl: row.logo_url ?? undefined,
  };
}
