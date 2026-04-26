import type { Channel, ScheduleSlot, JellyfinItem } from "../shared/types.js";
import { fetchItemsForFilter } from "./jellyfin-client.js";
import db, { rowToChannel, type ChannelRow } from "./db.js";

// In-memory schedule cache: channelId -> { slots, generatedAt }
const scheduleCache = new Map<string, { slots: ScheduleSlot[]; generatedAt: number }>();

const SCHEDULE_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours
const CACHE_TTL_MS = 60 * 60 * 1000; // Regenerate every hour
const TICKS_PER_MS = 10_000;

// IANA zone — controls where day boundaries fall (e.g. for future prime-time
// blocks or daily reshuffles). Override via SCHEDULE_TZ env var.
const SCHEDULE_TZ = process.env.SCHEDULE_TZ || "America/Los_Angeles";

// Fixed instant: 2026-01-01 00:00 in SCHEDULE_TZ. The slot index for any
// wall-clock time is `f(now - SCHEDULE_ANCHOR_MS)` — must never change across
// regens, restarts, or deploys, or imported EPGs will silently desync.
const SCHEDULE_ANCHOR_MS = zonedTimestamp(2026, 1, 1, 0, 0, 0, SCHEDULE_TZ);

export async function getSchedule(channel: Channel): Promise<ScheduleSlot[]> {
  const cached = scheduleCache.get(channel.id);
  const now = Date.now();

  if (cached && (now - cached.generatedAt) < CACHE_TTL_MS) {
    return cached.slots;
  }

  const slots = await generateSchedule(channel);
  scheduleCache.set(channel.id, { slots, generatedAt: now });
  return slots;
}

export async function generateSchedule(channel: Channel): Promise<ScheduleSlot[]> {
  const items = (await fetchItemsForFilter(channel.filters))
    .filter((it) => it.RunTimeTicks / TICKS_PER_MS >= 30_000);

  if (items.length === 0) return [];

  // Horizon starts at local-midnight today so day boundaries align with SCHEDULE_TZ.
  const startMs = zonedStartOfDay(Date.now(), SCHEDULE_TZ);
  const endMs = startMs + SCHEDULE_DURATION_MS;

  // Pure-function locator: which playlist slot contains startMs?
  let { slotStart, cycleNum, indexInCycle } = locateSlot(channel, items, startMs);
  let playlist = buildPlaylist(channel, items, cycleNum);
  let idx = indexInCycle;
  let t = slotStart;

  const slots: ScheduleSlot[] = [];
  while (t < endMs) {
    const item = playlist[idx];
    const durMs = item.RunTimeTicks / TICKS_PER_MS;

    slots.push({
      channelId: channel.id,
      itemId: item.Id,
      title: formatTitle(item),
      startTime: new Date(t).toISOString(),
      endTime: new Date(t + durMs).toISOString(),
      durationTicks: item.RunTimeTicks,
      filePath: item.Path || "",
      imageUrl: buildImageUrl(item),
    });

    t += durMs;
    idx++;
    if (idx >= playlist.length) {
      idx = 0;
      cycleNum++;
      playlist = buildPlaylist(channel, items, cycleNum);
    }
  }

  return slots;
}

// Deterministic: returns the slot containing time `t`. Same inputs → same output,
// no persistent state. This is what makes the EPG and now-playing pointer agree.
function locateSlot(
  channel: Channel,
  items: JellyfinItem[],
  t: number,
): { slotStart: number; cycleNum: number; indexInCycle: number } {
  const cycleDurMs = items.reduce((s, it) => s + it.RunTimeTicks / TICKS_PER_MS, 0);
  if (cycleDurMs <= 0) {
    return { slotStart: SCHEDULE_ANCHOR_MS, cycleNum: 0, indexInCycle: 0 };
  }

  const elapsed = t - SCHEDULE_ANCHOR_MS;
  if (elapsed < 0) {
    return { slotStart: SCHEDULE_ANCHOR_MS, cycleNum: 0, indexInCycle: 0 };
  }

  const cycleNum = Math.floor(elapsed / cycleDurMs);
  const posInCycle = elapsed - cycleNum * cycleDurMs;
  const playlist = buildPlaylist(channel, items, cycleNum);

  let cum = 0;
  for (let i = 0; i < playlist.length; i++) {
    const dur = playlist[i].RunTimeTicks / TICKS_PER_MS;
    if (cum + dur > posInCycle) {
      return {
        slotStart: SCHEDULE_ANCHOR_MS + cycleNum * cycleDurMs + cum,
        cycleNum,
        indexInCycle: i,
      };
    }
    cum += dur;
  }
  return { slotStart: SCHEDULE_ANCHOR_MS + cycleNum * cycleDurMs, cycleNum, indexInCycle: 0 };
}

function buildPlaylist(channel: Channel, items: JellyfinItem[], cycleNum: number): JellyfinItem[] {
  if (channel.shuffleMode === "random") {
    return shuffleDeterministic(items, channel.id + ":" + cycleNum);
  }
  return [...items];
}

export function invalidateSchedule(channelId: string) {
  scheduleCache.delete(channelId);
}

export function invalidateAllSchedules() {
  scheduleCache.clear();
}

export function getScheduleCacheStats() {
  const now = Date.now();
  let oldestAgeMs = 0;
  for (const entry of scheduleCache.values()) {
    const age = now - entry.generatedAt;
    if (age > oldestAgeMs) oldestAgeMs = age;
  }
  return { cached: scheduleCache.size, oldestAgeMs };
}

export function getAllChannels(): Channel[] {
  const rows = db.prepare("SELECT * FROM channels ORDER BY number ASC").all() as ChannelRow[];
  return rows.map(rowToChannel);
}

export async function getFirstSlot(channel: Channel): Promise<ScheduleSlot | null> {
  const schedule = await getSchedule(channel);
  return schedule[0] || null;
}

export async function getCurrentSlot(channel: Channel): Promise<{ slot: ScheduleSlot; offsetSeconds: number } | null> {
  const schedule = await getSchedule(channel);
  const now = new Date().toISOString();

  for (const slot of schedule) {
    if (slot.startTime <= now && slot.endTime > now) {
      const offsetMs = Date.now() - new Date(slot.startTime).getTime();
      return { slot, offsetSeconds: Math.floor(offsetMs / 1000) };
    }
  }

  return null;
}

function shuffleDeterministic(items: JellyfinItem[], seed: string): JellyfinItem[] {
  const arr = [...items];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }

  for (let i = arr.length - 1; i > 0; i--) {
    hash = ((hash << 5) - hash + i) | 0;
    const j = Math.abs(hash) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildImageUrl(item: JellyfinItem): string | undefined {
  const jellyfinUrl = process.env.JELLYFIN_URL;
  if (!jellyfinUrl) return undefined;

  if (item.ImageTags?.Primary) {
    return `${jellyfinUrl}/Items/${item.Id}/Images/Primary`;
  }
  if (item.Type === "Episode" && item.SeriesId) {
    return `${jellyfinUrl}/Items/${item.SeriesId}/Images/Primary`;
  }
  return undefined;
}

function formatTitle(item: JellyfinItem): string {
  if (item.Type === "Episode" && item.SeriesName) {
    const s = item.ParentIndexNumber;
    const e = item.IndexNumber;
    const tag = s != null && e != null
      ? `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`
      : "";
    return [item.SeriesName, tag, item.Name].filter(Boolean).join(" - ");
  }
  return item.Name;
}

// --- Timezone utilities ---
// Project a UTC instant into the wall-clock fields of `tz`. Round-trip via
// Intl, then back to UTC to find the offset; works correctly across DST.

function zonedTimestamp(Y: number, M: number, D: number, h: number, m: number, s: number, tz: string): number {
  const guess = Date.UTC(Y, M - 1, D, h, m, s);
  const projected = projectIntoZone(guess, tz);
  const projectedAsUtc = Date.UTC(projected.Y, projected.M - 1, projected.D, projected.h, projected.m, projected.s);
  const offsetMs = projectedAsUtc - guess;
  return guess - offsetMs;
}

function zonedStartOfDay(ms: number, tz: string): number {
  const p = projectIntoZone(ms, tz);
  return zonedTimestamp(p.Y, p.M, p.D, 0, 0, 0, tz);
}

function projectIntoZone(ms: number, tz: string): { Y: number; M: number; D: number; h: number; m: number; s: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => +(parts.find((p) => p.type === t)?.value ?? "0");
  const h = get("hour");
  return {
    Y: get("year"),
    M: get("month"),
    D: get("day"),
    h: h === 24 ? 0 : h, // some Intl impls report 24 for midnight
    m: get("minute"),
    s: get("second"),
  };
}
