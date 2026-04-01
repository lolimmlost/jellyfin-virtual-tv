# Lesson 3: Channel CRUD + SQLite — Persistence, Forms, and Your First Real Feature

## What You'll Learn

By the end of this lesson, your app will create, edit, and delete virtual TV channels — and they'll survive a restart. You'll add a SQLite database, build CRUD routes that actually persist data, and replace the library browser UI with a channel management interface where you configure filters against your Jellyfin libraries. This is where the app stops being a demo and starts being a product.

Along the way you'll learn why SQLite is the right database for this kind of app, how to design a schema that handles nested JSON data, how React forms work (controlled components, state lifting, conditional rendering), and what happens when your database file doesn't exist yet.

## Prerequisites

| Tool | Why | How to check |
|------|-----|--------------|
| **Lesson 2 completed** | Jellyfin proxy routes and library browser must be working | Open your app, see libraries and items from Jellyfin |
| **better-sqlite3** | Already in `package.json` from Lesson 1 | `npm ls better-sqlite3` should show a version |

`better-sqlite3` was listed as a dependency from the start. If you skipped `npm install` or cleaned `node_modules`, run it again now. Nothing else to install.

## Why SQLite?

You need to store channels somewhere. The options:

| Option | Why not (or why yes) |
|--------|---------------------|
| **JSON file** | Works for 3 channels. Falls apart when two requests write simultaneously — you get corrupted data. No query capability. No schema enforcement. |
| **PostgreSQL / MySQL** | A separate server to run, configure, back up, and connect to. For an app that stores maybe 20 rows total, this is absurd overhead. |
| **SQLite** | Single file. No server. ACID transactions. SQL queries. Survives crashes. Ships with the app. Perfect for embedded apps. |

SQLite is not a "toy database." It handles more traffic than most web apps will ever see. It's the most deployed database engine in the world — it's in your phone, your browser, your TV. For a sidecar app with a single user, it's the correct choice.

`better-sqlite3` is a Node.js binding for SQLite. It's synchronous — queries block the event loop. That's fine here. Our database operations are fast (microseconds for 20 rows), and synchronous code is dramatically simpler than async. No `await`, no connection pools, no promise chains. You call a function, you get the result. The `better-sqlite3` README explains the performance rationale in detail.

## Step by Step

### Step 1: The Database Module

Create `src/server/db.ts`:

```typescript
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database lives in the project root (or a Docker volume in production)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/virtual-tv.db");

// Ensure the data directory exists
import { mkdirSync } from "fs";
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
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
```

Let's break this down.

**Database file location**

```typescript
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/virtual-tv.db");
```

In development, the database lives at `data/virtual-tv.db` in your project root. In production (Docker), you'll set `DB_PATH` to a path inside a Docker volume so the data persists across container rebuilds. Without a volume, every `docker compose up --build` would delete your channels. More on this in the deployment section.

The `mkdirSync` call creates the `data/` directory if it doesn't exist. Without this, SQLite would throw `SQLITE_CANTOPEN` on first run — it creates the file but not the parent directory.

**WAL mode**

```typescript
db.pragma("journal_mode = WAL");
```

WAL (Write-Ahead Logging) is a SQLite journaling mode that allows readers and writers to operate concurrently. The default mode (rollback journal) locks the entire database during writes. WAL lets reads continue during writes. For a web server handling multiple requests, this matters — without WAL, a slow write blocks all reads.

You set this once. SQLite remembers it in the database file. But setting it on every startup is harmless and ensures new databases get it too.

**Foreign keys**

```typescript
db.pragma("foreign_keys = ON");
```

SQLite has foreign key support but it's **off by default**. This is a historical quirk — foreign keys were added years after SQLite's initial release, and turning them on by default would break existing apps. You must enable them per-connection. We don't have foreign keys yet, but we will when we add schedule slots. Enabling it now means we won't forget.

**The schema**

```sql
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
```

A few design decisions:

- **`id TEXT PRIMARY KEY`** — we'll use UUIDs, not auto-incrementing integers. UUIDs can be generated client-side, which means the client knows the ID before the server responds. This simplifies optimistic UI updates (which we won't do yet, but the schema supports it). Also, integer IDs leak information — `id=5` tells you "this is the 5th channel ever created." UUIDs don't.

- **`number INTEGER NOT NULL UNIQUE`** — the channel number (1, 2, 3...) that appears in the TV guide. Unique constraint prevents two channels from claiming the same number. This is separate from `id` because channel numbers are user-facing and reassignable — you might want to swap channel 3 and channel 5 without changing their internal IDs.

- **`filters TEXT`** — the `ChannelFilter` object serialized as JSON. Why not separate columns for genres, tags, libraryIds? Because filters are always loaded and saved as a unit. You never query "find all channels that include the Action genre" — you load a channel and use its filter to query Jellyfin. Storing complex objects as JSON in a TEXT column is a legitimate pattern when you don't need to query individual fields. SQLite even has JSON functions (`json_extract`, `json_each`) if you ever need to.

- **`shuffle_mode TEXT`** — `"random"` or `"sequential"`. Could be an enum in PostgreSQL, but SQLite doesn't have enums. We enforce valid values in the application layer.

- **`created_at` / `updated_at`** — timestamps for debugging and sorting. `datetime('now')` is SQLite's built-in UTC timestamp function. We'll update `updated_at` manually on updates.

- **`IF NOT EXISTS`** — makes the `CREATE TABLE` idempotent. Run it a hundred times, the table is created once. This means the app can start without any migration step — the database bootstraps itself.

**Key concepts:**

- **Synchronous API** — `db.exec()`, `db.prepare().run()`, etc. are all synchronous. No callbacks, no promises, no `await`. This is `better-sqlite3`'s defining characteristic. The SQLite engine itself is synchronous (it reads/writes a local file), and wrapping it in async would add complexity with no benefit.

- **Module-level initialization** — the database is created and the table schema is applied when the module is first imported. This runs once at server startup. Every route handler that imports `db` gets the same connection. This is fine because `better-sqlite3` handles concurrent access within a single process.

### Step 2: A UUID Helper

We need to generate IDs. Create `src/server/utils.ts`:

```typescript
import { randomUUID } from "crypto";

export function newId(): string {
  return randomUUID();
}
```

That's it. Node's built-in `crypto.randomUUID()` generates RFC 4122 v4 UUIDs. No `uuid` npm package needed. One fewer dependency.

Why a wrapper function instead of calling `randomUUID()` directly? Because if you ever want to switch to a different ID format (nanoid, ULID, etc.), you change one function instead of searching for `randomUUID` across the codebase. Also, `newId()` reads better in context than `randomUUID()`.

### Step 3: Replace the Channel Routes

Replace the stubs in `src/server/routes/channels.ts` with the real implementation:

```typescript
import { Router } from "express";
import db from "../db.js";
import { newId } from "../utils.js";
import type { Channel, ChannelFilter } from "../../shared/types.js";

export const channelRouter = Router();

// List all channels
channelRouter.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM channels ORDER BY number ASC").all();
  const channels: Channel[] = rows.map(rowToChannel);
  res.json({ channels });
});

// Get single channel
channelRouter.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM channels WHERE id = ?").get(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }
  res.json({ channel: rowToChannel(row) });
});

// Create channel
channelRouter.post("/", (req, res) => {
  const { name, number, filters, shuffleMode, logoUrl } = req.body;

  // Validation
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!number || typeof number !== "number" || number < 1) {
    res.status(400).json({ error: "number must be a positive integer" });
    return;
  }
  if (shuffleMode && !["random", "sequential"].includes(shuffleMode)) {
    res.status(400).json({ error: "shuffleMode must be 'random' or 'sequential'" });
    return;
  }

  const id = newId();
  const filtersJson = JSON.stringify(filters || {});

  try {
    db.prepare(`
      INSERT INTO channels (id, name, number, filters, shuffle_mode, logo_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, number, filtersJson, shuffleMode || "random", logoUrl || null);

    const row = db.prepare("SELECT * FROM channels WHERE id = ?").get(id);
    res.status(201).json({ channel: rowToChannel(row) });
  } catch (err: any) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      res.status(409).json({ error: `Channel number ${number} is already taken` });
      return;
    }
    throw err;
  }
});

// Update channel
channelRouter.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM channels WHERE id = ?").get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const { name, number, filters, shuffleMode, logoUrl } = req.body;

  if (shuffleMode && !["random", "sequential"].includes(shuffleMode)) {
    res.status(400).json({ error: "shuffleMode must be 'random' or 'sequential'" });
    return;
  }

  const updated = {
    name: name ?? (existing as any).name,
    number: number ?? (existing as any).number,
    filters: filters !== undefined ? JSON.stringify(filters) : (existing as any).filters,
    shuffle_mode: shuffleMode ?? (existing as any).shuffle_mode,
    logo_url: logoUrl !== undefined ? logoUrl : (existing as any).logo_url,
  };

  try {
    db.prepare(`
      UPDATE channels
      SET name = ?, number = ?, filters = ?, shuffle_mode = ?, logo_url = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(updated.name, updated.number, updated.filters, updated.shuffle_mode, updated.logo_url, req.params.id);

    const row = db.prepare("SELECT * FROM channels WHERE id = ?").get(req.params.id);
    res.json({ channel: rowToChannel(row) });
  } catch (err: any) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      res.status(409).json({ error: `Channel number ${number} is already taken` });
      return;
    }
    throw err;
  }
});

// Delete channel
channelRouter.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM channels WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }
  res.json({ deleted: req.params.id });
});

// Convert a database row to a Channel object
function rowToChannel(row: any): Channel {
  return {
    id: row.id,
    name: row.name,
    number: row.number,
    filters: JSON.parse(row.filters) as ChannelFilter,
    shuffleMode: row.shuffle_mode,
    logoUrl: row.logo_url,
  };
}
```

There's a lot here. Let's go route by route.

**`GET /` — List All Channels**

```typescript
const rows = db.prepare("SELECT * FROM channels ORDER BY number ASC").all();
const channels: Channel[] = rows.map(rowToChannel);
```

`db.prepare()` compiles a SQL statement. `.all()` executes it and returns every row as a JavaScript object. `ORDER BY number ASC` sorts channels by their channel number — channel 1 first, channel 5 last. The result is always in a predictable order.

`rowToChannel` converts the database row format (snake_case, JSON strings) to the `Channel` interface format (camelCase, parsed objects). This translation layer is two inches thick — just field renaming and one `JSON.parse`. But it's essential because the database schema and the API contract serve different masters. The database uses SQL conventions (snake_case). The API uses JavaScript conventions (camelCase). Trying to make them match would compromise one or the other.

**`POST /` — Create a Channel**

The validation block checks three things: name exists, number is positive, shuffleMode is valid. This is our system boundary — data coming from the outside world. Inside the app we trust our own types. At the boundary we verify everything.

```typescript
try {
  db.prepare(`INSERT INTO channels ...`).run(...);
} catch (err: any) {
  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    res.status(409).json({ error: `Channel number ${number} is already taken` });
    return;
  }
  throw err;
}
```

The `try/catch` handles the unique constraint on `number`. If two channels try to claim channel number 3, SQLite throws `SQLITE_CONSTRAINT_UNIQUE`. We catch that specific error and return a human-readable 409 Conflict. Any other error gets re-thrown — it's unexpected and should crash loudly so you notice.

Why `409 Conflict` instead of `400 Bad Request`? A 400 means "your request is malformed." A 409 means "your request is valid but conflicts with existing data." The distinction matters for the frontend — a 400 means "fix your form," a 409 means "someone else already has that number."

After inserting, we read the row back (`SELECT * WHERE id = ?`) and return it. Why not just return the input? Because the database might add things — `created_at` and `updated_at` get their defaults from SQLite, not from our code. The returned object is the truth.

**`PUT /:id` — Update a Channel**

Partial updates. The client can send just `{ name: "New Name" }` without providing every field. We merge the incoming data with the existing row:

```typescript
const updated = {
  name: name ?? (existing as any).name,
  number: number ?? (existing as any).number,
  ...
};
```

The `??` (nullish coalescing) operator means "use the new value if it's not null/undefined, otherwise keep the old value." This is different from `||`, which would treat `0`, `""`, and `false` as "missing." If someone sends `{ number: 0 }`, `??` preserves the 0; `||` would discard it.

Note the `filters !== undefined` check instead of `??`. For filters, we want to distinguish between "didn't send filters" (keep existing) and "sent filters as null" (clear them). The `??` operator can't distinguish these because `null ?? existing` returns `existing`. The explicit `undefined` check handles both cases.

**`DELETE /:id` — Delete a Channel**

```typescript
const result = db.prepare("DELETE FROM channels WHERE id = ?").run(req.params.id);
if (result.changes === 0) {
  res.status(404).json({ error: "Channel not found" });
  return;
}
```

`result.changes` tells you how many rows the DELETE affected. If it's 0, nothing was deleted — the ID didn't match. We return 404 instead of pretending it worked. Some APIs return 200 on "delete something that doesn't exist" (idempotent deletes). That's a valid design. We chose explicit errors because this is a learning project and silent successes hide bugs.

**The `rowToChannel` Helper**

```typescript
function rowToChannel(row: any): Channel {
  return {
    id: row.id,
    name: row.name,
    number: row.number,
    filters: JSON.parse(row.filters) as ChannelFilter,
    shuffleMode: row.shuffle_mode,
    logoUrl: row.logo_url,
  };
}
```

This function is the boundary between "database world" and "API world." It handles three translations:

1. **snake_case to camelCase** — `shuffle_mode` becomes `shuffleMode`, `logo_url` becomes `logoUrl`
2. **JSON string to object** — `row.filters` is a string like `'{"genres":["Action"]}'`. `JSON.parse` turns it back into an object.
3. **Type casting** — the `as ChannelFilter` tells TypeScript "trust me, this parsed JSON matches the ChannelFilter shape." It's a pragmatic lie — `JSON.parse` returns `any`. We could add runtime validation (zod, ajv), but for data we wrote to the database ourselves, it's unnecessary.

### Step 4: Update the Server Entry Point

The server already imports `channelRouter` from Lesson 1. But now we need the database to initialize before any routes run. Since `db.ts` runs its schema creation at import time, we just need to make sure it's imported early. Add it to `src/server/index.ts`:

```typescript
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import "./db.js"; // Initialize database on startup
import { jellyfinRouter } from "./routes/jellyfin.js";
import { iptvRouter } from "./routes/iptv.js";
import { channelRouter } from "./routes/channels.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/jellyfin", jellyfinRouter);
app.use("/api/channels", channelRouter);
app.use("/iptv", iptvRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../client")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Virtual TV server running on port ${PORT}`);
});
```

The only change is the `import "./db.js"` line. This looks like a side-effect import — it doesn't import any named exports. Its purpose is to run the module: create the database file, enable WAL mode, create the table. The channel routes also import `db`, but having an explicit import here makes the initialization order visible. Someone reading `index.ts` can see: "the database is set up before any routes are registered."

### Step 5: The Channel Management UI

Now the big one. Replace `src/client/App.tsx` with a two-panel layout: channel list on the left, channel editor on the right. This replaces the library browser from Lesson 2 — that was a stepping stone to prove Jellyfin connectivity. Now we build the real UI.

```tsx
import { useState, useEffect } from "react";
import type { Channel, ChannelFilter, JellyfinLibrary } from "../shared/types";

const theme = {
  bg: "#0f0f0f",
  surface: "#1a1a1a",
  surfaceHover: "#222",
  accent: "#7C3AED",
  accentHover: "#6D28D9",
  text: "#e4e4e4",
  textDim: "#888",
  border: "#2a2a2a",
  danger: "#ef4444",
  dangerHover: "#dc2626",
  success: "#22c55e",
};

// ─── Main App ────────────────────────────────────────────────

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<{ connected: boolean; serverName?: string } | null>(null);

  const selectedChannel = channels.find((c) => c.id === selectedId) || null;

  // Load channels and Jellyfin status on mount
  useEffect(() => {
    loadChannels();
    fetch("/api/jellyfin/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, []);

  function loadChannels() {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data) => setChannels(data.channels || []))
      .catch((err) => console.error("Failed to load channels:", err));
  }

  async function createChannel() {
    // Find the next available channel number
    const maxNum = channels.reduce((max, ch) => Math.max(max, ch.number), 0);
    const body = {
      name: `Channel ${maxNum + 1}`,
      number: maxNum + 1,
      filters: {},
      shuffleMode: "random",
    };
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      setChannels((prev) => [...prev, data.channel]);
      setSelectedId(data.channel.id);
      setEditing(true);
    }
  }

  async function saveChannel(updated: Channel) {
    const res = await fetch(`/api/channels/${updated.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: updated.name,
        number: updated.number,
        filters: updated.filters,
        shuffleMode: updated.shuffleMode,
        logoUrl: updated.logoUrl,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setChannels((prev) => prev.map((ch) => (ch.id === data.channel.id ? data.channel : ch)));
      setEditing(false);
    }
  }

  async function deleteChannel(id: string) {
    const res = await fetch(`/api/channels/${id}`, { method: "DELETE" });
    if (res.ok) {
      setChannels((prev) => prev.filter((ch) => ch.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setEditing(false);
      }
    }
  }

  return (
    <div style={{ background: theme.bg, color: theme.text, minHeight: "100vh", fontFamily: "system-ui" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${theme.border}` }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Virtual TV</h1>
        <StatusPill status={status} />
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 57px)" }}>
        {/* Left panel: Channel list */}
        <div style={{ width: 280, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 16 }}>
            <button onClick={createChannel} style={{
              width: "100%", padding: "10px 16px", background: theme.accent, color: "#fff",
              border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600,
            }}>
              + New Channel
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {channels.map((ch) => (
              <div
                key={ch.id}
                onClick={() => { setSelectedId(ch.id); setEditing(false); }}
                style={{
                  padding: "12px 16px", cursor: "pointer",
                  background: selectedId === ch.id ? theme.surface : "transparent",
                  borderLeft: selectedId === ch.id ? `3px solid ${theme.accent}` : "3px solid transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: theme.textDim, fontSize: 13, fontVariantNumeric: "tabular-nums", minWidth: 24 }}>
                    {ch.number}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{ch.name}</span>
                </div>
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 4, marginLeft: 34 }}>
                  {ch.shuffleMode} · {summarizeFilters(ch.filters)}
                </div>
              </div>
            ))}
            {channels.length === 0 && (
              <div style={{ padding: 16, color: theme.textDim, fontSize: 13, textAlign: "center" }}>
                No channels yet. Click "+ New Channel" to create one.
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Channel detail / editor */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {selectedChannel && !editing && (
            <ChannelDetail
              channel={selectedChannel}
              onEdit={() => setEditing(true)}
              onDelete={() => deleteChannel(selectedChannel.id)}
            />
          )}
          {selectedChannel && editing && (
            <ChannelEditor
              channel={selectedChannel}
              onSave={saveChannel}
              onCancel={() => setEditing(false)}
            />
          )}
          {!selectedChannel && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: theme.textDim }}>
              Select a channel or create a new one
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Channel Detail (Read-Only View) ────────────────────────

function ChannelDetail({ channel, onEdit, onDelete }: {
  channel: Channel;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24 }}>{channel.name}</h2>
          <span style={{ color: theme.textDim, fontSize: 14 }}>Channel {channel.number} · {channel.shuffleMode}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onEdit} style={{
            padding: "8px 16px", background: theme.accent, color: "#fff",
            border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13,
          }}>
            Edit
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{
              padding: "8px 16px", background: theme.surface, color: theme.danger,
              border: `1px solid ${theme.border}`, borderRadius: 6, cursor: "pointer", fontSize: 13,
            }}>
              Delete
            </button>
          ) : (
            <button onClick={() => { onDelete(); setConfirmDelete(false); }} style={{
              padding: "8px 16px", background: theme.danger, color: "#fff",
              border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13,
            }}>
              Confirm Delete
            </button>
          )}
        </div>
      </div>

      <Section title="Filters">
        <FilterSummary filters={channel.filters} />
      </Section>
    </div>
  );
}

// ─── Channel Editor (Form) ──────────────────────────────────

function ChannelEditor({ channel, onSave, onCancel }: {
  channel: Channel;
  onSave: (ch: Channel) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(channel.name);
  const [number, setNumber] = useState(channel.number);
  const [shuffleMode, setShuffleMode] = useState(channel.shuffleMode);
  const [filters, setFilters] = useState<ChannelFilter>(channel.filters);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...channel, name, number, shuffleMode, filters });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Edit Channel</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancel} style={{
            padding: "8px 16px", background: theme.surface, color: theme.text,
            border: `1px solid ${theme.border}`, borderRadius: 6, cursor: "pointer", fontSize: 13,
          }}>
            Cancel
          </button>
          <button type="submit" style={{
            padding: "8px 16px", background: theme.accent, color: "#fff",
            border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>
            Save
          </button>
        </div>
      </div>

      {/* Basic fields */}
      <Section title="General">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Cartoon Network"
          />
        </Field>
        <Field label="Channel Number">
          <input
            type="number"
            value={number}
            onChange={(e) => setNumber(parseInt(e.target.value, 10) || 1)}
            style={{ ...inputStyle, width: 100 }}
            min={1}
          />
        </Field>
        <Field label="Shuffle Mode">
          <div style={{ display: "flex", gap: 8 }}>
            {(["random", "sequential"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setShuffleMode(mode)}
                style={{
                  padding: "8px 16px",
                  background: shuffleMode === mode ? theme.accent : theme.surface,
                  color: shuffleMode === mode ? "#fff" : theme.text,
                  border: `1px solid ${shuffleMode === mode ? theme.accent : theme.border}`,
                  borderRadius: 6, cursor: "pointer", fontSize: 13,
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {/* Filter configuration */}
      <Section title="Content Filters">
        <p style={{ color: theme.textDim, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Define what media this channel pulls from your Jellyfin library.
          Leave a filter empty to include everything.
        </p>
        <FilterEditor filters={filters} onChange={setFilters} />
      </Section>
    </form>
  );
}

// ─── Filter Editor ──────────────────────────────────────────

function FilterEditor({ filters, onChange }: {
  filters: ChannelFilter;
  onChange: (f: ChannelFilter) => void;
}) {
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([]);

  useEffect(() => {
    fetch("/api/jellyfin/libraries")
      .then((r) => r.json())
      .then((data) => setLibraries(data.libraries || []))
      .catch(() => {});
  }, []);

  function updateFilter<K extends keyof ChannelFilter>(key: K, value: ChannelFilter[K]) {
    onChange({ ...filters, [key]: value });
  }

  function toggleLibrary(itemId: string) {
    const current = filters.libraryIds || [];
    const next = current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId];
    updateFilter("libraryIds", next.length > 0 ? next : undefined);
  }

  function toggleItemType(type: "Movie" | "Episode") {
    const current = filters.itemTypes || [];
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    updateFilter("itemTypes", next.length > 0 ? next : undefined);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Libraries */}
      <Field label="Libraries">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {libraries.map((lib) => {
            const selected = (filters.libraryIds || []).includes(lib.ItemId);
            return (
              <button
                key={lib.ItemId}
                type="button"
                onClick={() => toggleLibrary(lib.ItemId)}
                style={{
                  padding: "6px 14px", fontSize: 13, borderRadius: 6, cursor: "pointer",
                  background: selected ? theme.accent : theme.surface,
                  color: selected ? "#fff" : theme.text,
                  border: `1px solid ${selected ? theme.accent : theme.border}`,
                }}
              >
                {lib.Name}
              </button>
            );
          })}
          {libraries.length === 0 && (
            <span style={{ color: theme.textDim, fontSize: 13 }}>
              No libraries found — check Jellyfin connection
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: theme.textDim, marginTop: 4, display: "block" }}>
          {filters.libraryIds?.length ? `${filters.libraryIds.length} selected` : "All libraries (none selected)"}
        </span>
      </Field>

      {/* Item types */}
      <Field label="Item Types">
        <div style={{ display: "flex", gap: 8 }}>
          {(["Movie", "Episode"] as const).map((type) => {
            const selected = (filters.itemTypes || []).includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleItemType(type)}
                style={{
                  padding: "6px 14px", fontSize: 13, borderRadius: 6, cursor: "pointer",
                  background: selected ? theme.accent : theme.surface,
                  color: selected ? "#fff" : theme.text,
                  border: `1px solid ${selected ? theme.accent : theme.border}`,
                }}
              >
                {type === "Episode" ? "TV Episodes" : "Movies"}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 12, color: theme.textDim, marginTop: 4, display: "block" }}>
          {filters.itemTypes?.length ? filters.itemTypes.join(", ") : "All types"}
        </span>
      </Field>

      {/* Genres */}
      <Field label="Genres">
        <TagInput
          values={filters.genres || []}
          onChange={(v) => updateFilter("genres", v.length > 0 ? v : undefined)}
          placeholder="Type a genre and press Enter (e.g. Action, Comedy)"
        />
      </Field>

      {/* Tags */}
      <Field label="Tags">
        <TagInput
          values={filters.tags || []}
          onChange={(v) => updateFilter("tags", v.length > 0 ? v : undefined)}
          placeholder="Type a tag and press Enter"
        />
      </Field>

      {/* Title match */}
      <Field label="Title Match">
        <input
          value={filters.titleMatch || ""}
          onChange={(e) => updateFilter("titleMatch", e.target.value || undefined)}
          style={inputStyle}
          placeholder="Substring match (e.g. 'Star Wars')"
        />
      </Field>
    </div>
  );
}

// ─── Tag Input Component ────────────────────────────────────

function TagInput({ values, onChange, placeholder }: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !values.includes(trimmed)) {
        onChange([...values, trimmed]);
      }
      setInput("");
    }
    if (e.key === "Backspace" && input === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    onChange(values.filter((v) => v !== tag));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: values.length > 0 ? 8 : 0 }}>
        {values.map((tag) => (
          <span key={tag} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: theme.accent, color: "#fff", padding: "3px 10px",
            borderRadius: 4, fontSize: 12,
          }}>
            {tag}
            <span onClick={() => removeTag(tag)} style={{ cursor: "pointer", opacity: 0.7, marginLeft: 2 }}>×</span>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        style={inputStyle}
        placeholder={values.length === 0 ? placeholder : "Add another..."}
      />
    </div>
  );
}

// ─── Shared UI Components ───────────────────────────────────

function StatusPill({ status }: { status: { connected: boolean; serverName?: string } | null }) {
  if (!status) return <span style={{ color: theme.textDim, fontSize: 13 }}>Connecting...</span>;
  const dotColor = status.connected ? theme.success : theme.danger;
  const label = status.connected ? status.serverName || "Connected" : "Disconnected";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }} />
      <span style={{ color: theme.textDim }}>{label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.05em", color: theme.textDim }}>
        {title}
      </h3>
      <div style={{ background: theme.surface, borderRadius: 8, padding: 20, border: `1px solid ${theme.border}` }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, color: theme.textDim, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function FilterSummary({ filters }: { filters: ChannelFilter }) {
  const parts: string[] = [];
  if (filters.libraryIds?.length) parts.push(`${filters.libraryIds.length} libraries`);
  if (filters.itemTypes?.length) parts.push(filters.itemTypes.join(", "));
  if (filters.genres?.length) parts.push(`Genres: ${filters.genres.join(", ")}`);
  if (filters.tags?.length) parts.push(`Tags: ${filters.tags.join(", ")}`);
  if (filters.titleMatch) parts.push(`Title: "${filters.titleMatch}"`);

  if (parts.length === 0) {
    return <span style={{ color: theme.textDim, fontSize: 14 }}>No filters — all media included</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {parts.map((p, i) => (
        <span key={i} style={{ fontSize: 14 }}>{p}</span>
      ))}
    </div>
  );
}

function summarizeFilters(filters: ChannelFilter): string {
  const parts: string[] = [];
  if (filters.genres?.length) parts.push(filters.genres.slice(0, 2).join(", "));
  if (filters.itemTypes?.length) parts.push(filters.itemTypes.join("/"));
  if (filters.titleMatch) parts.push(`"${filters.titleMatch}"`);
  return parts.length > 0 ? parts.join(" · ") : "no filters";
}

// ─── Styles ─────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: theme.bg,
  color: theme.text,
  border: `1px solid ${theme.border}`,
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
```

That's the largest file in the project so far. Let's walk through the architecture.

**The Component Tree**

```
App
├── StatusPill           (Jellyfin connection indicator)
├── Channel List         (left sidebar, list of channels)
├── ChannelDetail        (right panel, read-only view)
│   └── FilterSummary    (displays current filters)
├── ChannelEditor        (right panel, edit form)
│   ├── FilterEditor     (library/type/genre/tag/title pickers)
│   │   └── TagInput     (reusable tag input for genres, tags)
│   └── Section/Field    (layout helpers)
└── "Select a channel"   (empty state)
```

Five real components, two layout helpers. That's not a lot for a full CRUD UI. The key insight is the **state machine** at the top level:

```
No channel selected  →  Click channel  →  Detail view (read-only)
                                               ↓ Click "Edit"
                                          Editor view (form)
                                               ↓ Click "Save"
                                          Detail view (updated)
```

The `selectedId` and `editing` state variables together determine which panel is shown. This is a simple state machine — two booleans give you four states, of which we use three (no selection, selected+viewing, selected+editing). The fourth state (no selection + editing) is impossible because you can't edit nothing.

**Controlled Components**

Every form input is "controlled" — its value comes from React state, and changes flow through `onChange`:

```tsx
<input
  value={name}
  onChange={(e) => setName(e.target.value)}
/>
```

The input displays `name`. When the user types, `onChange` fires, updates `name`, React re-renders, and the input shows the new value. The React state is the source of truth, not the DOM.

The alternative is "uncontrolled" — let the DOM manage the value, read it when you need it (via refs). Controlled is more code but gives you instant access to form values for validation, conditional UI, and data flow. It's the React convention for forms.

**Lifting State**

The `ChannelEditor` component owns the form state (`name`, `number`, `shuffleMode`, `filters`). When the user clicks Save, it packages everything into a `Channel` object and calls `onSave(...)`, which lives in `App`. The editor doesn't know about `fetch` or the API — it just reports "here's what the user wants." `App` decides what to do with it.

This is "lifting state up." The parent (`App`) owns the data and passes callbacks down. The child (`ChannelEditor`) owns the form state and calls the callbacks. Data flows down, events flow up. This pattern avoids the situation where two components both think they own the same data.

**The Filter Editor**

`FilterEditor` is the most complex component. It handles five different filter types:

1. **Libraries** — toggle buttons from the Jellyfin API
2. **Item types** — Movie/Episode toggle buttons
3. **Genres** — free-text tag input
4. **Tags** — free-text tag input
5. **Title match** — text input

It fetches the library list from `/api/jellyfin/libraries` on mount — this is the first time a non-root component makes its own API call. The library list is specific to the filter editor and not needed elsewhere, so it's not lifted to `App`.

The `updateFilter` function uses a generic to ensure type safety:

```typescript
function updateFilter<K extends keyof ChannelFilter>(key: K, value: ChannelFilter[K]) {
  onChange({ ...filters, [key]: value });
}
```

The `K extends keyof ChannelFilter` constraint means you can only pass keys that exist on `ChannelFilter`, and the value must match the type of that key. Call `updateFilter("genres", ["Action"])` and TypeScript is happy. Call `updateFilter("genres", 42)` and it's a type error.

**The TagInput Component**

This is a reusable component used for both genres and tags. It handles:

- Pressing Enter adds the current text as a tag
- Pressing Backspace with empty input removes the last tag
- Clicking the × on a tag removes it
- Duplicate tags are ignored

It's the first component in this project that manages its own ephemeral state (`input`) while also reporting changes to a parent via `onChange`. The `input` state is purely UI — it's the text the user is currently typing, before they press Enter. The `values` prop is the committed data that the parent cares about.

### Step 6: Update the Dockerfile

The existing Dockerfile builds a C# plugin. We need to switch it to a Node.js build, and add a volume for the SQLite database:

```dockerfile
# Multi-stage Dockerfile for Virtual TV sidecar
# Stage 1: Build (TypeScript + Vite)
# Stage 2: Run (Node.js + ffmpeg)

# ── Build Stage ──────────────────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Runtime Stage ────────────────────────────────────────────
FROM node:22-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built output
COPY --from=build /app/dist ./dist

# Database volume — data persists across rebuilds
VOLUME ["/app/data"]
ENV DB_PATH=/app/data/virtual-tv.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/server/index.js"]
```

**Key changes from the Lesson 1 Dockerfile:**

- **`VOLUME ["/app/data"]`** — declares that `/app/data` should be a persistent volume. Docker won't delete this directory when the container is rebuilt. Without a volume, every `docker compose up --build` wipes the database.

- **`ENV DB_PATH=/app/data/virtual-tv.db`** — tells our `db.ts` module where to create the SQLite file. This matches the volume mount.

- **Two-stage `npm ci`** — the build stage installs all dependencies (including devDependencies like TypeScript and Vite). The runtime stage installs only production dependencies (`--omit=dev`). This keeps the final image smaller — you don't need the TypeScript compiler in production.

### Step 7: Update Docker Compose

Replace `docker-compose.yml` to match the sidecar architecture:

```yaml
services:
  virtual-tv:
    build: .
    container_name: virtual-tv
    ports:
      - "3336:3000"
    volumes:
      - vtv-data:/app/data
    environment:
      - JELLYFIN_URL=${JELLYFIN_URL}
      - JELLYFIN_API_KEY=${JELLYFIN_API_KEY}
      - PORT=3000
      - NODE_ENV=production
      - DB_PATH=/app/data/virtual-tv.db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

volumes:
  vtv-data:
```

**The `vtv-data` volume** is a Docker named volume. It survives container rebuilds, image pulls, and `docker compose down`. The only thing that deletes it is `docker compose down -v` (the `-v` flag means "also delete volumes"). Your SQLite database lives here.

**`${JELLYFIN_URL}` and `${JELLYFIN_API_KEY}`** are read from Coolify's environment variables (or from a `.env` file for local testing). Docker Compose substitutes these at runtime. If the variable isn't set, it becomes an empty string — our code handles that in the route guards.

## Build, Deploy, and Verify

### Local Development

```bash
# Start dev servers (Express + Vite)
npm run dev

# In another terminal, test the API
curl -s http://localhost:3000/api/channels | jq
# → { "channels": [] }

# Create a channel
curl -s -X POST http://localhost:3000/api/channels \
  -H "Content-Type: application/json" \
  -d '{"name":"Cartoon Network","number":1,"filters":{"genres":["Animation"]},"shuffleMode":"random"}' | jq

# List channels again
curl -s http://localhost:3000/api/channels | jq
# → { "channels": [{ "id": "...", "name": "Cartoon Network", ... }] }

# Stop the server, start it again — the channel is still there
```

That last step is the payoff. Stop the process, restart it, and your data is still there. The SQLite file persists on disk. No database server to restart, no connection to re-establish.

### Deploy Checklist

```bash
# Build locally first
npm run build

# If it compiles, commit and push
git add -A
git commit -m "Lesson 3: Channel CRUD with SQLite persistence"
git push origin main
```

### Verification Steps

1. **API**: `curl http://your-server:3336/api/channels` → empty array (fresh deploy)
2. **Create via UI**: Open the app, click "+ New Channel", name it, save
3. **Verify persistence**: Restart the container (`docker compose restart virtual-tv`), reload the page — your channel is still there
4. **Delete via UI**: Click a channel, click Delete, confirm — it's gone
5. **Verify the database file**: `docker exec virtual-tv ls -la /app/data/` — you should see `virtual-tv.db` and `virtual-tv.db-wal` (the WAL file)

## Real Bugs We Hit

### Bug 1: `SQLITE_CANTOPEN` on First Startup

**What happened:** The server crashed immediately with `SqliteError: unable to open database file` when first starting.

**Why:** `better-sqlite3` creates the database file automatically, but it doesn't create parent directories. Our `DB_PATH` was `/app/data/virtual-tv.db`, but `/app/data/` didn't exist yet. On the second startup it worked because Docker had already created the volume mount.

**The fix:** Add `mkdirSync(path.dirname(DB_PATH), { recursive: true })` before creating the database connection. The `{ recursive: true }` flag means "create all missing parent directories" and doesn't throw if the directory already exists.

**The lesson:** Always ensure the parent directory exists before writing a file. This is easy to forget because in development, you usually create the directory manually or it already exists. Docker containers start with a clean filesystem — nothing exists unless your Dockerfile creates it or a volume mount provides it.

### Bug 2: `better-sqlite3` Fails to Build in Docker

**What happened:** `npm ci` in the Docker build failed with a long C++ compilation error mentioning `node-gyp`, `g++`, and `better-sqlite3`.

**Why:** `better-sqlite3` is a native module — it compiles C/C++ code during `npm install` to create a Node.js binding for the SQLite C library. The `node:22-slim` Docker image doesn't include a C++ compiler.

**The fix:** Two options:

1. Use `node:22` instead of `node:22-slim` (includes build tools but is ~300MB larger)
2. Install build tools in the slim image:

```dockerfile
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
```

We went with option 2 — install build tools in the build stage only. The runtime stage doesn't need them because it copies the pre-built `node_modules` (with the compiled native module).

Actually, there's a third option that's even better: `better-sqlite3` ships prebuilt binaries for common platforms (linux-x64, darwin-arm64, etc.) via `prebuild-install`. If the prebuilt binary matches your platform, `npm ci` skips compilation entirely. On `node:22-slim` for linux-x64, this usually works out of the box. The compilation error only hits if the prebuilt binary isn't available for your platform — which can happen on ARM servers or unusual Node versions.

**The lesson:** Native modules need compilation. Slim Docker images don't have compilers. Either use a full image, install build tools explicitly, or rely on prebuilt binaries and add a fallback.

### Bug 3: Database Lost After Rebuild

**What happened:** Created channels, pushed a code update, Coolify rebuilt the container, all channels were gone.

**Why:** No Docker volume was configured. The database file lived inside the container's filesystem, which is destroyed on rebuild. Each `docker compose up --build` creates a fresh container with a fresh filesystem.

**The fix:** Add the `vtv-data` volume in `docker-compose.yml` and set `DB_PATH` to point inside it. Named volumes persist across container lifecycles.

**The lesson:** Anything you want to survive a container rebuild must live in a Docker volume. This includes databases, uploaded files, configuration that changes at runtime — anything not baked into the image. If you didn't configure a volume and you're wondering where your data went after a rebuild, this is why.

### Bug 4: Channel Number Conflict Returns 500 Instead of 409

**What happened:** Creating two channels with the same number returned a 500 Internal Server Error with a SQLite stack trace instead of a clean error message.

**Why:** The initial code didn't catch `SQLITE_CONSTRAINT_UNIQUE`. The error propagated to Express's default error handler, which returns 500 with the raw error.

**The fix:** Wrap the INSERT in try/catch, check for `err.code === "SQLITE_CONSTRAINT_UNIQUE"`, and return a 409 with a human-readable message:

```typescript
catch (err: any) {
  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    res.status(409).json({ error: `Channel number ${number} is already taken` });
    return;
  }
  throw err;
}
```

**The lesson:** Database constraint violations are expected errors, not bugs. Handle them at the application layer and return useful messages. The alternative — checking for conflicts with a SELECT before INSERT — has a race condition (two requests could check simultaneously, both see no conflict, both insert). Let the database enforce the constraint and handle the error.

### Bug 5: Form Doesn't Reset When Switching Channels

**What happened:** Click channel 1, click Edit, change the name, click channel 2 — the editor still shows channel 1's edited (but unsaved) name.

**Why:** React doesn't unmount and remount a component when its props change — it updates it. The `ChannelEditor` component was initialized with `useState(channel.name)`, which only runs on mount. When the `channel` prop changed, the state kept the old value.

**The fix:** Add a `key` prop to force remounting:

```tsx
{selectedChannel && editing && (
  <ChannelEditor
    key={selectedChannel.id}   // ← forces remount when channel changes
    channel={selectedChannel}
    onSave={saveChannel}
    onCancel={() => setEditing(false)}
  />
)}
```

The `key={selectedChannel.id}` tells React: "this is a new component instance when the ID changes." React unmounts the old `ChannelEditor` and mounts a new one, which re-runs all the `useState` initializers with the new channel's data.

**The lesson:** When a component's initial state depends on props, use `key` to control when it resets. This is a well-known React pattern — the React docs call it "resetting state with a key." The alternative is `useEffect` that syncs state from props, which is harder to get right and has timing issues.

## Concepts Covered

- SQLite as an embedded database: WAL mode, foreign keys, CREATE TABLE IF NOT EXISTS
- `better-sqlite3` synchronous API: prepare, run, all, get
- JSON storage in SQL columns for nested objects
- Database module initialization pattern (side-effect import)
- CRUD route implementation: validation, error handling, constraint conflicts
- Row-to-model translation (snake_case → camelCase, JSON.parse)
- Controlled components in React: inputs whose value comes from state
- Form state management: local state in editor, callbacks to parent
- The `key` prop for resetting component state
- Two-panel layout: list + detail/editor
- Reusable components: TagInput, Section, Field
- Docker volumes for data persistence
- Environment-based database path configuration

## Exercises

1. **Add channel reordering.** The channel list is sorted by `number`. Add "Move Up" and "Move Down" buttons to the channel detail view that swap the current channel's number with the one above or below it. This requires two PUT requests (update both channels). Think about edge cases — what happens at the top or bottom of the list?

2. **Add a channel count preview.** When editing a channel's filters, show a live count of how many items in Jellyfin match the current filter configuration. This means calling `/api/jellyfin/items` with the filter parameters and showing `totalCount`. Debounce the request so it doesn't fire on every keystroke. Hint: `setTimeout` in a `useEffect` with a cleanup function.

3. **Add import/export.** Add "Export All" and "Import" buttons that serialize all channels to JSON and deserialize them back. The export should download a `.json` file (use `URL.createObjectURL` with a Blob). The import should accept a file upload, parse the JSON, and create channels via the API. Handle conflicts — what if an imported channel has the same number as an existing one?

4. **Add validation feedback in the UI.** Currently, if you save a channel with an empty name or a duplicate number, the save silently fails (the API returns an error but the UI ignores it). Show error messages below the relevant form fields. Read the error response from `fetch` and display it.

5. **Explore the database directly.** Install `sqlite3` CLI (`apt install sqlite3` or `brew install sqlite3`) and open the database file: `sqlite3 data/virtual-tv.db`. Run `.tables`, `.schema channels`, `SELECT * FROM channels;`. Try inserting a row directly via SQL and verify it shows up in the UI. Try `PRAGMA journal_mode;` to confirm WAL is set. Understanding the database outside of your app is a debugging superpower.

## What's Next

**Lesson 4: The Schedule Engine** — your channels have filters that describe what content they should play. Now you need to turn that into a timeline: what plays at 6:00 PM, what follows it, what fills the next 24 hours. You'll build the scheduling algorithm that queries Jellyfin for matching media and arranges it into a continuous stream. The sidecar starts doing its actual job.
