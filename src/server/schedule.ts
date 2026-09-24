import type { Channel, ScheduleSlot, JellyfinItem } from "../shared/types.js";
import { generateSlots, findCurrentSlot } from "../shared/schedule-core.js";
import { fetchItemsForFilter } from "./jellyfin-client.js";
import db, { rowToChannel, type ChannelRow } from "./db.js";

// In-memory schedule cache: channelId -> { slots, generatedAt }
const scheduleCache = new Map<string, { slots: ScheduleSlot[]; generatedAt: number }>();

const CACHE_TTL_MS = 60 * 60 * 1000; // Regenerate every hour

// IANA zone — controls where day boundaries fall (e.g. for future prime-time
// blocks or daily reshuffles). Override via SCHEDULE_TZ env var.
const SCHEDULE_TZ = process.env.SCHEDULE_TZ || "America/Los_Angeles";

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

// The engine itself lives in shared/schedule-core.ts so it stays pure (and
// runnable outside the server). This wrapper just supplies Jellyfin items.
export async function generateSchedule(channel: Channel): Promise<ScheduleSlot[]> {
  const items = await fetchItemsForFilter(channel.filters);
  return generateSlots(channel, items, { tz: SCHEDULE_TZ, imageUrl: buildImageUrl });
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
  return findCurrentSlot(await getSchedule(channel));
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
