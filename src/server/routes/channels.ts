import { Router } from "express";
import db, { rowToChannel, type ChannelRow } from "../db.js";
import { newId } from "../utils.js";
import type { Channel } from "../../shared/types.js";

export const channelRouter = Router();

const VALID_SHUFFLE_MODES = ["random", "sequential"] as const;

// List all channels
channelRouter.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM channels ORDER BY number ASC").all() as ChannelRow[];
  const channels: Channel[] = rows.map(rowToChannel);
  res.json({ channels });
});

// Get single channel
channelRouter.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM channels WHERE id = ?").get(req.params.id) as ChannelRow | undefined;
  if (!row) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }
  res.json({ channel: rowToChannel(row) });
});

// Create channel
channelRouter.post("/", (req, res) => {
  const { name, number, filters, shuffleMode, logoUrl } = req.body;

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!number || typeof number !== "number" || number < 1) {
    res.status(400).json({ error: "number must be a positive integer" });
    return;
  }
  if (shuffleMode && !(VALID_SHUFFLE_MODES as readonly string[]).includes(shuffleMode)) {
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

    const row = db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRow;
    res.status(201).json({ channel: rowToChannel(row) });
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      res.status(409).json({ error: `Channel number ${number} is already taken` });
      return;
    }
    throw err;
  }
});

// Update channel
channelRouter.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM channels WHERE id = ?").get(req.params.id) as ChannelRow | undefined;
  if (!existing) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const { name, number, filters, shuffleMode, logoUrl } = req.body;

  if (shuffleMode && !(VALID_SHUFFLE_MODES as readonly string[]).includes(shuffleMode)) {
    res.status(400).json({ error: "shuffleMode must be 'random' or 'sequential'" });
    return;
  }

  const updated = {
    name: name ?? existing.name,
    number: number ?? existing.number,
    filters: filters !== undefined ? JSON.stringify(filters) : existing.filters,
    shuffle_mode: shuffleMode ?? existing.shuffle_mode,
    logo_url: logoUrl !== undefined ? logoUrl : existing.logo_url,
  };

  try {
    db.prepare(`
      UPDATE channels
      SET name = ?, number = ?, filters = ?, shuffle_mode = ?, logo_url = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(updated.name, updated.number, updated.filters, updated.shuffle_mode, updated.logo_url, req.params.id);

    const row = db.prepare("SELECT * FROM channels WHERE id = ?").get(req.params.id) as ChannelRow;
    res.json({ channel: rowToChannel(row) });
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
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

