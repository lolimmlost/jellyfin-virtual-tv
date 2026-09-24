import type { Channel, ScheduleSlot, JellyfinItem } from "./types.js";

// Pure schedule engine. No I/O, no env, no state — the server feeds it items
// from Jellyfin, and anything else (tests, a browser demo) can feed it fixtures
// and get the exact same slots for the same wall-clock time.

export const SCHEDULE_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours
export const TICKS_PER_MS = 10_000;
const MIN_ITEM_MS = 30_000;

// Fixed instant: 2026-01-01 00:00 in the schedule's zone. The slot index for any
// wall-clock time is `f(now - anchor)` — must never change across regens,
// restarts, or deploys, or imported EPGs will silently desync.
export function scheduleAnchorMs(tz: string): number {
  return zonedTimestamp(2026, 1, 1, 0, 0, 0, tz);
}

export interface GenerateSlotsOptions {
  tz: string;
  nowMs?: number;
  durationMs?: number;
  imageUrl?: (item: JellyfinItem) => string | undefined;
}

export function generateSlots(
  channel: Channel,
  allItems: JellyfinItem[],
  { tz, nowMs = Date.now(), durationMs = SCHEDULE_DURATION_MS, imageUrl }: GenerateSlotsOptions,
): ScheduleSlot[] {
  const items = allItems.filter((it) => it.RunTimeTicks / TICKS_PER_MS >= MIN_ITEM_MS);
  if (items.length === 0) return [];

  const anchorMs = scheduleAnchorMs(tz);

  // Horizon starts at local-midnight today so day boundaries align with tz.
  const startMs = zonedStartOfDay(nowMs, tz);
  const endMs = startMs + durationMs;

  // Pure-function locator: which playlist slot contains startMs?
  let { slotStart, cycleNum, indexInCycle } = locateSlot(channel, items, startMs, anchorMs);
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
      imageUrl: imageUrl?.(item),
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
export function locateSlot(
  channel: Channel,
  items: JellyfinItem[],
  t: number,
  anchorMs: number,
): { slotStart: number; cycleNum: number; indexInCycle: number } {
  const cycleDurMs = items.reduce((s, it) => s + it.RunTimeTicks / TICKS_PER_MS, 0);
  if (cycleDurMs <= 0) {
    return { slotStart: anchorMs, cycleNum: 0, indexInCycle: 0 };
  }

  const elapsed = t - anchorMs;
  if (elapsed < 0) {
    return { slotStart: anchorMs, cycleNum: 0, indexInCycle: 0 };
  }

  const cycleNum = Math.floor(elapsed / cycleDurMs);
  const posInCycle = elapsed - cycleNum * cycleDurMs;
  const playlist = buildPlaylist(channel, items, cycleNum);

  let cum = 0;
  for (let i = 0; i < playlist.length; i++) {
    const dur = playlist[i].RunTimeTicks / TICKS_PER_MS;
    if (cum + dur > posInCycle) {
      return {
        slotStart: anchorMs + cycleNum * cycleDurMs + cum,
        cycleNum,
        indexInCycle: i,
      };
    }
    cum += dur;
  }
  return { slotStart: anchorMs + cycleNum * cycleDurMs, cycleNum, indexInCycle: 0 };
}

export function findCurrentSlot(
  slots: ScheduleSlot[],
  nowMs: number = Date.now(),
): { slot: ScheduleSlot; offsetSeconds: number } | null {
  const now = new Date(nowMs).toISOString();
  for (const slot of slots) {
    if (slot.startTime <= now && slot.endTime > now) {
      const offsetMs = nowMs - new Date(slot.startTime).getTime();
      return { slot, offsetSeconds: Math.floor(offsetMs / 1000) };
    }
  }
  return null;
}

function buildPlaylist(channel: Channel, items: JellyfinItem[], cycleNum: number): JellyfinItem[] {
  if (channel.shuffleMode === "random") {
    return shuffleDeterministic(items, channel.id + ":" + cycleNum);
  }
  return [...items];
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
