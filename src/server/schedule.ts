import type { Channel, ScheduleSlot, JellyfinItem } from "../shared/types.js";
import { fetchItemsForFilter } from "./jellyfin-client.js";
import db, { rowToChannel, type ChannelRow } from "./db.js";

// In-memory schedule cache: channelId -> { slots, generatedAt }
const scheduleCache = new Map<string, { slots: ScheduleSlot[]; generatedAt: number }>();

const SCHEDULE_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours — covers all timezones
const CACHE_TTL_MS = 60 * 60 * 1000; // Regenerate every hour
const TICKS_PER_MS = 10_000;

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
  const items = await fetchItemsForFilter(channel.filters);

  if (items.length === 0) return [];

  const slots: ScheduleSlot[] = [];

  // Schedule starts at the most recent midnight UTC
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);
  let currentTime = midnight.getTime();
  const endTime = currentTime + SCHEDULE_DURATION_MS;

  // Build a playlist based on shuffle mode
  let playlist: JellyfinItem[];
  if (channel.shuffleMode === "random") {
    playlist = shuffleDeterministic(items, channel.id + dateKey(midnight));
  } else {
    playlist = [...items];
  }

  let idx = 0;

  while (currentTime < endTime) {
    const item = playlist[idx % playlist.length];
    const durationMs = item.RunTimeTicks / TICKS_PER_MS;

    // Skip items with no meaningful duration (< 30s)
    if (durationMs < 30_000) {
      idx++;
      if (idx > playlist.length * 2) break;
      continue;
    }

    const slotStart = new Date(currentTime);
    const slotEnd = new Date(currentTime + durationMs);

    slots.push({
      channelId: channel.id,
      itemId: item.Id,
      title: formatTitle(item),
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString(),
      durationTicks: item.RunTimeTicks,
      filePath: item.Path || "",
      imageUrl: buildImageUrl(item),
    });

    currentTime += durationMs;
    idx++;
  }

  return slots;
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

// Get the first slot in the schedule (for channel logo fallback)
export async function getFirstSlot(channel: Channel): Promise<ScheduleSlot | null> {
  const schedule = await getSchedule(channel);
  return schedule[0] || null;
}

// Get the schedule slot that should be playing right now
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

// Get the current slot + all remaining slots in the schedule
export async function getRemainingSlots(channel: Channel): Promise<{ slot: ScheduleSlot; offsetSeconds: number }[]> {
  const schedule = await getSchedule(channel);
  const now = new Date().toISOString();
  const remaining: { slot: ScheduleSlot; offsetSeconds: number }[] = [];

  for (const slot of schedule) {
    if (slot.endTime <= now) continue;
    if (slot.startTime <= now) {
      const offsetMs = Date.now() - new Date(slot.startTime).getTime();
      remaining.push({ slot, offsetSeconds: Math.floor(offsetMs / 1000) });
    } else {
      remaining.push({ slot, offsetSeconds: 0 });
    }
  }

  return remaining;
}

// Deterministic shuffle based on a seed string
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

function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function buildImageUrl(item: JellyfinItem): string | undefined {
  const jellyfinUrl = process.env.JELLYFIN_URL;
  if (!jellyfinUrl) return undefined;

  // Use the item's own Primary image if available
  if (item.ImageTags?.Primary) {
    return `${jellyfinUrl}/Items/${item.Id}/Images/Primary`;
  }
  // For episodes, fall back to the series image
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
