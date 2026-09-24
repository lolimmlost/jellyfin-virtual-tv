import type { Channel, ScheduleSlot } from "../shared/types";

// Endpoints the guide components read from. Kept in one module so anything
// embedding NowPlaying / ScheduleGuide outside this app can swap the data source.

export interface NowPlayingData {
  channel: string;
  nowPlaying: string | null;
  offsetSeconds?: number;
  startTime?: string;
  endTime?: string;
}

export async function getNowPlaying(channelId: string): Promise<NowPlayingData> {
  const r = await fetch(`/iptv/now/${channelId}`);
  return r.json();
}

export async function getSchedule(channelId: string, signal?: AbortSignal): Promise<{ slots?: ScheduleSlot[] }> {
  const r = await fetch(`/iptv/schedule/${channelId}`, { signal });
  return r.json();
}

export async function getSchedulePreview(channel: Channel, signal?: AbortSignal): Promise<{ slots?: ScheduleSlot[] }> {
  const r = await fetch("/iptv/schedule/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
    signal,
  });
  return r.json();
}
