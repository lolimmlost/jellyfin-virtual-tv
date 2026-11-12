import { Router, type Request, type Response } from "express";
import { spawn, execSync, type ChildProcess } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync, rmdirSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { getAllChannels, getSchedule, generateSchedule, getCurrentSlot, getFirstSlot } from "../schedule.js";
import { getAudioStreamIndex } from "../jellyfin-client.js";
import { trackStreamStart, trackStreamEnd, trackError } from "../runtime-stats.js";
import type { Channel, ScheduleSlot } from "../../shared/types.js";

export const iptvRouter = Router();

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── HLS session management ──────────────────────────────────────────────
// One HLS session per channel. ffmpeg writes .ts segments + .m3u8 playlist
// to a temp directory. Multiple clients can read the same segments.
interface HlsSession {
  channelId: string;
  dir: string;
  ffmpeg: ChildProcess | null;
  streamId: number | null;
  clients: number;
  lastAccess: number;
  stopping: boolean;
  loopRunning: boolean;
}

const hlsSessions = new Map<string, HlsSession>();
const HLS_IDLE_TIMEOUT_MS = 120_000; // Kill ffmpeg after 2min with no clients
const HLS_SEGMENT_TIME = 6; // seconds per segment
const HLS_LIST_SIZE = 0; // 0 = keep all segments in playlist (event mode)

// Per-channel PTS base time. Each batch's ffmpeg uses -output_ts_offset
// derived from (now - base) so PTS keeps climbing across batch restarts and
// reconnects, instead of resetting to 0 each time. Without this, every
// reconnect makes the player jump to t=0.
const channelPtsBase = new Map<string, number>();
// Wrap every 12h to stay well inside mpegts' 33-bit PTS budget (~26.5h @ 90kHz).
const PTS_WRAP_SEC = 12 * 3600;
const PTS_BATCH_GAP_SEC = 1;
function getPtsOffsetSeconds(channelId: string): number {
  let base = channelPtsBase.get(channelId);
  if (base === undefined) {
    base = Date.now();
    channelPtsBase.set(channelId, base);
  }
  const elapsedSec = (Date.now() - base) / 1000;
  return elapsedSec % PTS_WRAP_SEC;
}

// Stop a piped ffmpeg for a client that went away. SIGTERM alone isn't
// enough: if the client stopped reading first, we've paused stdout and ffmpeg
// is blocked in write() on a full pipe — the signal only sets a flag and the
// write restarts, so it never exits. Resuming stdout (callers discard the
// data once the client is gone) lets that write complete so ffmpeg sees the
// flag and exits cleanly. Don't destroy the pipe instead: ffmpeg ignores
// SIGPIPE, and 5.1 segfaults tearing down on EPIPE + SIGTERM (a 300MB+ core
// dump per disconnect). SIGKILL is the backstop.
const FFMPEG_KILL_GRACE_MS = 5000;
const stoppingFfmpeg = new WeakSet<ChildProcess>();
function stopFfmpeg(proc: ChildProcess) {
  if (proc.exitCode !== null || proc.signalCode !== null || stoppingFfmpeg.has(proc)) return;
  stoppingFfmpeg.add(proc);
  proc.stdout?.resume();
  proc.kill("SIGTERM");
  const timer = setTimeout(() => proc.kill("SIGKILL"), FFMPEG_KILL_GRACE_MS);
  timer.unref();
  proc.once("exit", () => clearTimeout(timer));
}

// Re-encode every concat boundary to libx264/aac with fixed parameters.
// Without this, -c copy passes through whatever SPS/PPS/profile/resolution
// each Jellyfin transcode produced, and consecutive episodes can have
// mismatched headers — decoder stalls video while audio keeps playing.
const TRANSCODE_VIDEO_ARGS = [
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-tune", "zerolatency",
  "-profile:v", "high",
  "-level", "4.1",
  "-pix_fmt", "yuv420p",
  "-g", "60",
  "-keyint_min", "60",
  "-sc_threshold", "0",
  "-b:v", "6000k",
  "-maxrate", "8000k",
  "-bufsize", "12000k",
];
const TRANSCODE_AUDIO_ARGS = [
  "-c:a", "aac",
  "-b:a", "192k",
  "-ar", "48000",
  "-ac", "2",
];

// Periodic cleanup of idle HLS sessions
setInterval(() => {
  const now = Date.now();
  for (const [channelId, session] of hlsSessions) {
    if ((now - session.lastAccess) > HLS_IDLE_TIMEOUT_MS) {
      stopHlsSession(channelId);
    }
  }
}, 10_000);

function stopHlsSession(channelId: string) {
  const session = hlsSessions.get(channelId);
  if (!session) return;
  session.stopping = true;
  if (session.ffmpeg) {
    session.ffmpeg.kill("SIGTERM");
    session.ffmpeg = null;
  }
  // Clean up temp files
  try {
    if (existsSync(session.dir)) {
      for (const f of readdirSync(session.dir)) {
        try { unlinkSync(join(session.dir, f)); } catch {}
      }
      rmdirSync(session.dir);
    }
  } catch {}
  hlsSessions.delete(channelId);
  console.log(`[hls] ${channelId}: session stopped and cleaned up`);
}

function getOrCreateHlsSession(channel: Channel): HlsSession {
  let session = hlsSessions.get(channel.id);
  if (session && !session.stopping) {
    session.lastAccess = Date.now();
    return session;
  }

  const dir = mkdtempSync(join(tmpdir(), `vtv-hls-${channel.id.slice(0, 8)}-`));
  session = {
    channelId: channel.id,
    dir,
    ffmpeg: null,
    streamId: null,
    clients: 0,
    lastAccess: Date.now(),
    stopping: false,
    loopRunning: false,
  };
  hlsSessions.set(channel.id, session);
  console.log(`[hls] ${channel.name}: session created at ${dir}`);
  return session;
}

// ── Batch planning ──────────────────────────────────────────────────────
// Both loops (HLS and raw TS) track a *content cursor*: the schedule instant
// that the last emitted frame corresponds to. ffmpeg pulls from Jellyfin
// faster than real time, so when a batch ends — normally or because one of
// its files failed to open — the cursor is usually ahead of the wall clock.
// Resuming from wall-clock "now" in that case replays the tail of the episode
// that was just shown instead of moving on to the next one. Resuming from
// max(cursor, now) continues exactly where the output stopped, while still
// snapping forward to the EPG if the stream ever fell behind it.

const BATCH_SIZE = 3;
// A batch that produced less than this is treated as a failed start.
const MIN_PRODUCED_SEC = 1;
// Skip a slot after this many consecutive failed starts on it, so one
// unplayable item can't wedge the channel into an endless retry loop.
const MAX_FAILED_STARTS = 2;

interface BatchPlan {
  slots: ScheduleSlot[];
  /** Seek into slots[0], in seconds. */
  offsetSeconds: number;
  /** Schedule instant of the first frame this batch emits. */
  contentStartMs: number;
  /** Schedule instant at which the last slot ends. */
  contentEndMs: number;
}

const toMs = (iso: string) => new Date(iso).getTime();

async function planBatch(channel: Channel, cursorMs: number): Promise<BatchPlan | null> {
  const schedule = await getSchedule(channel);
  const startMs = Math.max(cursorMs, Date.now());
  let idx = schedule.findIndex((s) => toMs(s.startTime) <= startMs && toMs(s.endTime) > startMs);
  if (idx < 0) return null;

  let offsetMs = startMs - toMs(schedule[idx].startTime);
  // Almost over — start the next slot cleanly rather than seeking to its last seconds.
  if (toMs(schedule[idx].endTime) - startMs < 5000) {
    if (idx + 1 >= schedule.length) return null;
    idx++;
    offsetMs = 0;
  }

  const slots = schedule.slice(idx, idx + BATCH_SIZE);
  const offsetSeconds = Math.floor(offsetMs / 1000);
  return {
    slots,
    offsetSeconds,
    contentStartMs: toMs(slots[0].startTime) + offsetSeconds * 1000,
    contentEndMs: toMs(slots[slots.length - 1].endTime),
  };
}

function batchCapSeconds(plan: BatchPlan): number {
  return Math.max(1, Math.floor((plan.contentEndMs - plan.contentStartMs) / 1000));
}

async function writeConcatFile(
  channel: Channel,
  plan: BatchPlan,
  concatFile: string,
  opts: { jellyfinUrl: string; apiKey: string; staticStream: boolean; logTag: string },
) {
  let concatContent = "";
  for (let i = 0; i < plan.slots.length; i++) {
    const bSlot = plan.slots[i];
    // Jellyfin keys transcode jobs on media + device + PlaySessionId, not on
    // StartTimeTicks. Without a unique session, a second request for an
    // episode already being transcoded is served the existing job from its
    // original start point — the tune lands minutes behind the EPG.
    const params = new URLSearchParams({ api_key: opts.apiKey, PlaySessionId: randomUUID() });
    if (opts.staticStream) {
      // Passthrough: serve original file, let ffmpeg remux to mpegts
      params.set("Static", "true");
    } else {
      // Transcode: normalize to H.264+AAC for smooth transitions
      params.set("VideoCodec", "h264");
      params.set("AudioCodec", "aac");
      params.set("AudioChannels", "2");
      params.set("MaxStreamingBitrate", "20000000");
      params.set("VideoBitRate", "8000000");
      params.set("AudioBitRate", "192000");
      params.set("MaxWidth", "1920");
      params.set("MaxHeight", "1080");
    }
    const audioIdx = await getAudioStreamIndex(bSlot.itemId, channel.audioLanguage);
    if (audioIdx != null) {
      params.set("AudioStreamIndex", String(audioIdx));
    } else {
      console.log(`[${opts.logTag}] ${channel.name}: no '${channel.audioLanguage}' audio track on ${bSlot.title} — using Jellyfin default`);
    }
    // Only seek into the first slot (it's already in progress)
    if (i === 0 && plan.offsetSeconds > 0) {
      params.set("StartTimeTicks", String(Math.floor(plan.offsetSeconds * 10_000_000)));
    }
    const url = `${opts.jellyfinUrl}/Videos/${bSlot.itemId}/stream.ts?${params.toString()}`;
    concatContent += `file '${url.replace(/'/g, "'\\''")}'\n`;
  }
  writeFileSync(concatFile, concatContent);
}

// Parses ffmpeg's stderr stats ("time=HH:MM:SS.xx") to learn how much content
// a batch has emitted. That value excludes -output_ts_offset, so it maps
// directly onto the batch's schedule timeline.
function createProgressParser() {
  let carry = "";
  let seconds = 0;
  const re = /time=(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g;
  return {
    push(chunk: Buffer) {
      const text = carry + chunk.toString("latin1");
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (m[1]) continue; // negative time during startup
        seconds = Math.max(seconds, Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]));
      }
      carry = text.slice(-64);
    },
    get seconds() { return seconds; },
  };
}

// Works out where the next batch should resume after ffmpeg exits.
function advanceCursor(
  channel: Channel,
  plan: BatchPlan,
  producedSec: number,
  state: { failedStarts: number },
  logTag: string,
): number {
  const produced = Math.min(producedSec, batchCapSeconds(plan));
  if (produced >= MIN_PRODUCED_SEC) {
    state.failedStarts = 0;
    return plan.contentStartMs + produced * 1000;
  }
  state.failedStarts++;
  if (state.failedStarts >= MAX_FAILED_STARTS) {
    state.failedStarts = 0;
    console.error(`[${logTag}] ${channel.name}: ${plan.slots[0].title} failed to start ${MAX_FAILED_STARTS}x — skipping to next slot`);
    return toMs(plan.slots[0].endTime);
  }
  return plan.contentStartMs;
}

async function ensureHlsLoop(channel: Channel, session: HlsSession) {
  if (session.loopRunning || session.stopping) return;
  session.loopRunning = true;

  const jellyfinUrl = process.env.JELLYFIN_URL;
  const apiKey = process.env.JELLYFIN_API_KEY;
  if (!jellyfinUrl || !apiKey) return;

  let cursorMs = Date.now();
  const failState = { failedStarts: 0 };

  try {
    while (!session.stopping && (Date.now() - session.lastAccess) < HLS_IDLE_TIMEOUT_MS) {
      const plan = await planBatch(channel, cursorMs);
      if (!plan) {
        await sleep(5000);
        continue;
      }

      const concatFile = join(session.dir, "concat.txt");
      await writeConcatFile(channel, plan, concatFile, { jellyfinUrl, apiKey, staticStream: false, logTag: "hls" });

      const batchDurationSec = batchCapSeconds(plan);
      const titles = plan.slots.map((s) => s.title).join(" → ");
      console.log(`[hls] ${channel.name}: batch of ${plan.slots.length} — ${titles} (offset ${plan.offsetSeconds}s, cap ${batchDurationSec}s)`);

      const m3u8Path = join(session.dir, "stream.m3u8");
      const segmentPattern = join(session.dir, "seg_%05d.ts");
      const ptsOffset = getPtsOffsetSeconds(channel.id);
      const progress = createProgressParser();

      const exitCode = await new Promise<number | null>((resolve) => {
        const ffmpegArgs = [
          "-fflags", "+igndts+genpts+discardcorrupt",
          "-f", "concat",
          "-safe", "0",
          "-protocol_whitelist", "file,http,https,tcp,tls",
          "-probesize", "1048576",
          "-analyzeduration", "2000000",
          "-i", concatFile,
          "-map", "0:v:0",
          "-map", "0:a:0",
          ...TRANSCODE_VIDEO_ARGS,
          ...TRANSCODE_AUDIO_ARGS,
          "-t", String(batchDurationSec),
          "-output_ts_offset", String(ptsOffset),
          "-f", "hls",
          "-hls_time", String(HLS_SEGMENT_TIME),
          "-hls_list_size", String(HLS_LIST_SIZE),
          "-hls_flags", "append_list+omit_endlist+program_date_time",
          "-hls_segment_filename", segmentPattern,
          m3u8Path,
        ];

        const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
          stdio: ["ignore", "pipe", "pipe"],
        });
        session.ffmpeg = ffmpeg;
        session.streamId = trackStreamStart(channel.id);

        const stderrChunks: Buffer[] = [];
        let stderrLen = 0;
        const STDERR_MAX = 8192;

        ffmpeg.stdout?.on("data", () => {}); // drain

        ffmpeg.stderr?.on("data", (chunk: Buffer) => {
          progress.push(chunk);
          stderrChunks.push(chunk);
          stderrLen += chunk.length;
          while (stderrLen > STDERR_MAX && stderrChunks.length > 1) {
            stderrLen -= stderrChunks.shift()!.length;
          }
        });

        ffmpeg.on("close", (code) => {
          if (session.streamId != null) trackStreamEnd(session.streamId, code);
          session.ffmpeg = null;
          session.streamId = null;
          const stderrTail = Buffer.concat(stderrChunks).toString("utf8").slice(-500);
          if (code !== 0 && code !== null && !session.stopping) {
            const errMsg = `ffmpeg exited ${code} for ${channel.name} (HLS) after ${Math.round(progress.seconds)}s of ${batchDurationSec}s`;
            console.error(`[hls] ${errMsg}\n[hls] stderr: ${stderrTail}`);
            trackError(`${errMsg} — ${stderrTail}`);
          } else {
            console.log(`[hls] ${channel.name}: ffmpeg exited code=${code} after ${Math.round(progress.seconds)}s of ${batchDurationSec}s\n[hls] stderr tail: ${stderrTail.slice(-200)}`);
          }
          try { unlinkSync(concatFile); } catch {}
          resolve(code);
        });
      });

      cursorMs = advanceCursor(channel, plan, progress.seconds, failState, "hls");
      if (exitCode !== 0 && !session.stopping) await sleep(2000);

      // ffmpeg writes segments faster than real time — wait until the wall
      // clock reaches the content we've already produced before starting the
      // next batch. Keep lastAccess fresh so idle cleanup doesn't kill us.
      const waitMs = cursorMs - Date.now();
      if (waitMs > 0 && !session.stopping) {
        console.log(`[hls] ${channel.name}: batch content ready, waiting ${Math.round(waitMs / 1000)}s until next batch`);
        const waitEnd = Date.now() + waitMs;
        while (Date.now() < waitEnd && !session.stopping) {
          session.lastAccess = Date.now();
          await sleep(Math.min(30_000, waitEnd - Date.now()));
        }
      }
    }
  } catch (err) {
    console.error(`[hls] loop error for ${channel.name}:`, err);
  } finally {
    session.loopRunning = false;
  }
}

// Debug endpoint — check ffmpeg capabilities
iptvRouter.get("/debug/ffmpeg", (_req, res) => {
  try {
    const version = execSync("ffmpeg -version 2>&1").toString().split("\n")[0];
    const decoders = execSync("ffmpeg -decoders 2>/dev/null").toString();
    const encoders = execSync("ffmpeg -encoders 2>/dev/null").toString();
    const hevcDec = decoders.split("\n").filter(l => /hevc|h265/i.test(l));
    const h264Dec = decoders.split("\n").filter(l => /h264|h\.264/i.test(l));
    const h264Enc = encoders.split("\n").filter(l => /libx264/i.test(l));
    res.json({ version, hevcDecoders: hevcDec, h264Decoders: h264Dec, h264Encoders: h264Enc });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function findChannel(req: Request, res: Response): Channel | null {
  // Strip .ts extension if present (used in M3U URLs for Jellyfin format detection)
  const channelId = req.params.channelId.replace(/\.ts$/, "");
  const channel = getAllChannels().find((c) => c.id === channelId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return null;
  }
  return channel;
}

// M3U playlist — Jellyfin adds this as an IPTV tuner
iptvRouter.get("/channels.m3u", async (req, res) => {
  const channels = getAllChannels();

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

  let m3u = "#EXTM3U\n\n";

  for (const ch of channels) {
    // Use custom logo, or fall back to the currently-playing item's image
    let logoUrl = ch.logoUrl;
    if (!logoUrl) {
      const current = await getCurrentSlot(ch);
      const img = current?.slot.imageUrl || (await getFirstSlot(ch))?.imageUrl;
      if (img) logoUrl = img;
    }
    const logoParam = logoUrl ? ` tvg-logo="${escapeAttr(logoUrl)}"` : "";
    m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-chno="${ch.number}" tvg-name="${escapeAttr(ch.name)}"${logoParam} group-title="Virtual TV",${escapeAttr(ch.name)}\n`;
    // Raw TS pipe — Jellyfin's IPTV tuner expects a direct video stream.
    // Jellyfin handles re-transcoding/HLS conversion for each client device.
    // HLS is also available at /iptv/hls/{id}/stream.m3u8 for direct playback.
    m3u += `${baseUrl}/iptv/stream/${ch.id}.ts?f=4\n\n`;
  }

  res.setHeader("Content-Type", "audio/x-mpegurl");
  res.send(m3u);
});

// XMLTV EPG — Jellyfin adds this as a guide provider
iptvRouter.get("/epg.xml", async (_req, res) => {
  const channels = getAllChannels();

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<!DOCTYPE tv SYSTEM "xmltv.dtd">\n';
  xml += '<tv generator-info-name="virtual-tv">\n';

  // Channel definitions
  for (const ch of channels) {
    xml += `  <channel id="${ch.id}">\n`;
    xml += `    <display-name>${escapeXml(ch.name)}</display-name>\n`;
    xml += `    <display-name>${ch.number}</display-name>\n`;
    if (ch.logoUrl) {
      xml += `    <icon src="${escapeXml(ch.logoUrl)}" />\n`;
    }
    xml += `  </channel>\n`;
  }

  // Programme listings
  for (const ch of channels) {
    const slots = await getSchedule(ch);
    for (const slot of slots) {
      const start = formatXmltvDate(new Date(slot.startTime));
      const stop = formatXmltvDate(new Date(slot.endTime));
      xml += `  <programme start="${start}" stop="${stop}" channel="${ch.id}">\n`;
      xml += `    <title>${escapeXml(slot.title)}</title>\n`;
      if (slot.imageUrl) {
        xml += `    <icon src="${escapeXml(slot.imageUrl)}" />\n`;
      }
      xml += `  </programme>\n`;
    }
  }

  xml += "</tv>\n";

  res.setHeader("Content-Type", "application/xml");
  res.send(xml);
});

// Schedule API — preview what's on
iptvRouter.get("/schedule/:channelId", async (req, res) => {
  const channel = findChannel(req, res);
  if (!channel) return;

  const slots = await getSchedule(channel);
  res.json({ channel: channel.name, slots });
});

// Live preview for the channel editor — runs generateSchedule against an
// in-progress (unsaved) channel shape. Bypasses the schedule cache so previews
// don't displace real channels' cached schedules.
iptvRouter.post("/schedule/preview", async (req, res) => {
  const ch = req.body?.channel as Channel | undefined;
  if (!ch || typeof ch !== "object" || !ch.filters) {
    res.status(400).json({ error: "channel with filters required" });
    return;
  }
  // Synthesize a stable id for deterministic shuffle without touching real channels.
  const previewChannel: Channel = {
    id: ch.id || "preview",
    name: ch.name || "preview",
    number: ch.number || 0,
    filters: ch.filters,
    shuffleMode: ch.shuffleMode || "random",
    streamMode: ch.streamMode || "transcode",
    audioLanguage: ch.audioLanguage || "eng",
    logoUrl: ch.logoUrl,
  };
  try {
    const slots = await generateSchedule(previewChannel);
    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── HLS endpoints ───────────────────────────────────────────────────────

// HLS playlist — clients poll this for new segments
iptvRouter.get("/hls/:channelId/stream.m3u8", async (req, res) => {
  const channel = findChannel(req, res);
  if (!channel) return;

  const jellyfinUrl = process.env.JELLYFIN_URL;
  const apiKey = process.env.JELLYFIN_API_KEY;
  if (!jellyfinUrl || !apiKey) {
    res.status(503).json({ error: "Jellyfin not configured" });
    return;
  }

  const session = getOrCreateHlsSession(channel);
  session.lastAccess = Date.now();

  // Start the ffmpeg loop if not already running
  ensureHlsLoop(channel, session);

  // Wait for the m3u8 to appear (ffmpeg needs a moment to produce first segment)
  const m3u8Path = join(session.dir, "stream.m3u8");
  const maxWait = 15_000;
  const start = Date.now();
  while (!existsSync(m3u8Path) && (Date.now() - start) < maxWait) {
    await sleep(500);
  }

  if (!existsSync(m3u8Path)) {
    res.status(503).json({ error: "HLS stream not ready" });
    return;
  }

  let content = readFileSync(m3u8Path, "utf8");
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

  // Rewrite segment paths to absolute URLs
  content = content.replace(/(seg_\d+\.ts)/g, `${baseUrl}/iptv/hls/${channel.id}/$1`);

  // Add EXT-X-START so client begins near the live edge instead of the batch start.
  // Negative offset = seconds before the end of the playlist.
  if (!content.includes("#EXT-X-START")) {
    content = content.replace("#EXTM3U\n", "#EXTM3U\n#EXT-X-START:TIME-OFFSET=-30,PRECISE=NO\n");
  }

  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.send(content);
});

// HLS segment files
iptvRouter.get("/hls/:channelId/:segment", (req, res) => {
  const channelId = req.params.channelId;
  const segment = req.params.segment;

  // Sanitize segment name
  if (!/^seg_\d+\.ts$/.test(segment)) {
    res.status(400).json({ error: "Invalid segment name" });
    return;
  }

  const session = hlsSessions.get(channelId);
  if (!session) {
    res.status(404).json({ error: "No active HLS session" });
    return;
  }

  // Each segment fetch keeps the session alive
  session.lastAccess = Date.now();
  const segPath = join(session.dir, segment);

  if (!existsSync(segPath)) {
    res.status(404).json({ error: "Segment not found" });
    return;
  }

  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Cache-Control", "max-age=60");
  res.sendFile(segPath);
});

// What's on now
iptvRouter.get("/now/:channelId", async (req, res) => {
  const channel = findChannel(req, res);
  if (!channel) return;

  const current = await getCurrentSlot(channel);
  if (!current) {
    res.json({ channel: channel.name, nowPlaying: null });
    return;
  }

  res.json({
    channel: channel.name,
    nowPlaying: current.slot.title,
    offsetSeconds: current.offsetSeconds,
    startTime: current.slot.startTime,
    endTime: current.slot.endTime,
  });
});

// Stream endpoint — continuously chains episodes for seamless live TV
// Uses a hybrid approach: concat demuxer for gapless transitions (current + next episodes),
// then resumes from the content cursor (see planBatch) for the next batch. This avoids the
// stream-ending gap of single-episode ffmpeg processes while still self-correcting drift.

// How far ahead of the wall clock the TS pipe may run. ffmpeg bursts this
// much on tune-in (fast startup), then is held to real time by pausing its
// stdout, so we don't pull hours of transcode out of Jellyfin up front.
const STREAM_MAX_LEAD_MS = 90_000;

iptvRouter.get("/stream/:channelId", async (req, res) => {
  const channel = findChannel(req, res);
  if (!channel) return;

  const jellyfinUrl = process.env.JELLYFIN_URL;
  const apiKey = process.env.JELLYFIN_API_KEY;
  if (!jellyfinUrl || !apiKey) {
    res.status(503).json({ error: "Jellyfin not configured" });
    return;
  }

  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Transfer-Encoding", "chunked");

  let closed = false;
  req.on("close", () => { closed = true; });

  const streamLoop = async () => {
    let cursorMs = Date.now();
    const failState = { failedStarts: 0 };
    // PTS for this connection's next batch. Seeded from the channel clock so
    // reconnects keep climbing, then advanced by what each batch actually
    // emitted — the pipe runs up to STREAM_MAX_LEAD_MS ahead of the wall
    // clock, so re-reading the clock per batch would jump PTS backwards.
    let ptsOffset = getPtsOffsetSeconds(channel.id);

    while (!closed && !res.writableEnded) {
      const plan = await planBatch(channel, cursorMs);
      if (!plan) {
        await sleep(5000);
        continue;
      }

      const tempDir = mkdtempSync(join(tmpdir(), "vtv-"));
      const concatFile = join(tempDir, "playlist.txt");
      await writeConcatFile(channel, plan, concatFile, {
        jellyfinUrl,
        apiKey,
        staticStream: channel.streamMode === "copy",
        logTag: "stream",
      });

      // Cap ffmpeg at the batch's scheduled length so the stream stays in
      // sync with the EPG — without it, transcoding timing differences
      // accumulate across episodes.
      const batchDurationSec = batchCapSeconds(plan);
      const titles = plan.slots.map((s) => s.title).join(" → ");
      const leadSec = Math.round((plan.contentStartMs - Date.now()) / 1000);
      console.log(`[stream] ${channel.name}: batch of ${plan.slots.length} — ${titles} (offset ${plan.offsetSeconds}s, cap ${batchDurationSec}s, lead ${leadSec}s, pts +${Math.round(ptsOffset)}s)`);

      const progress = createProgressParser();

      // Stream this batch via ffmpeg concat — gapless transitions between episodes
      const exitCode = await new Promise<number | null>((resolve) => {
        const ffmpegArgs = [
          "-fflags", "+igndts+genpts+discardcorrupt",
          "-f", "concat",
          "-safe", "0",
          "-protocol_whitelist", "file,http,https,tcp,tls",
          "-probesize", "1048576",
          "-analyzeduration", "2000000",
          "-i", concatFile,
          "-map", "0:v:0",
          "-map", "0:a:0",
          ...TRANSCODE_VIDEO_ARGS,
          ...TRANSCODE_AUDIO_ARGS,
          "-t", String(batchDurationSec),
          "-output_ts_offset", String(ptsOffset),
          "-f", "mpegts",
          "-mpegts_flags", "resend_headers",
          "-flush_packets", "1",
          "pipe:1",
        ];

        const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
          stdio: ["ignore", "pipe", "pipe"],
        });
        const streamId = trackStreamStart(channel.id);
        const stderrChunks: Buffer[] = [];
        let stderrLen = 0;
        const STDERR_MAX = 8192;

        // Flow control: pause ffmpeg's stdout (which blocks ffmpeg, which
        // stops it reading from Jellyfin) while the client socket is backed
        // up or we're too far ahead of the wall clock.
        let paused = false;
        let resBlocked = false;
        const updateFlow = () => {
          const leadMs = plan.contentStartMs + progress.seconds * 1000 - Date.now();
          // Never re-pause an ffmpeg we're stopping — it must drain to exit.
          const shouldPause = !stoppingFfmpeg.has(ffmpeg) && (resBlocked || leadMs > STREAM_MAX_LEAD_MS);
          if (shouldPause && !paused) {
            ffmpeg.stdout.pause();
            paused = true;
          } else if (!shouldPause && paused) {
            ffmpeg.stdout.resume();
            paused = false;
          }
        };
        const pacer = setInterval(updateFlow, 500);

        const onClose = () => stopFfmpeg(ffmpeg);
        req.on("close", onClose);
        // The client may have left while this batch was being planned.
        if (closed) onClose();

        ffmpeg.stdout.on("data", (chunk: Buffer) => {
          if (res.writableEnded || closed) {
            stopFfmpeg(ffmpeg);
            return;
          }
          if (!res.write(chunk) && !resBlocked) {
            resBlocked = true;
            updateFlow();
            res.once("drain", () => {
              resBlocked = false;
              updateFlow();
            });
          }
        });

        ffmpeg.stderr.on("data", (chunk: Buffer) => {
          progress.push(chunk);
          stderrChunks.push(chunk);
          stderrLen += chunk.length;
          // Keep only the tail to avoid unbounded memory growth on long streams
          while (stderrLen > STDERR_MAX && stderrChunks.length > 1) {
            stderrLen -= stderrChunks.shift()!.length;
          }
          updateFlow();
        });

        ffmpeg.on("close", (code) => {
          clearInterval(pacer);
          trackStreamEnd(streamId, code);
          req.removeListener("close", onClose);
          if (code !== 0 && code !== null && !closed) {
            const stderrTail = Buffer.concat(stderrChunks).toString("utf8").slice(-500);
            const errMsg = `ffmpeg exited ${code} for ${channel.name} after ${Math.round(progress.seconds)}s of ${batchDurationSec}s`;
            console.error(`[stream] ${errMsg}\n[stream] stderr: ${stderrTail}`);
            trackError(`${errMsg} — ${stderrTail}`);
          }
          try { unlinkSync(concatFile); } catch {}
          try { rmdirSync(tempDir); } catch {}
          resolve(code);
        });
      });

      // Resume from where the output actually stopped, not from wall-clock
      // "now" — otherwise an early exit replays the episode we just showed.
      cursorMs = advanceCursor(channel, plan, progress.seconds, failState, "stream");
      // Continue PTS just past this batch's last frame. ffmpeg's stats can lag
      // the final packet by up to ~0.5s on an abnormal exit, so leave a small
      // forward gap — a gap is harmless, an overlap stalls players.
      if (progress.seconds > 0) {
        ptsOffset = (ptsOffset + progress.seconds + PTS_BATCH_GAP_SEC) % PTS_WRAP_SEC;
      }
      if (exitCode !== 0 && !closed) await sleep(2000);
    }

    if (!res.writableEnded) res.end();
  };

  streamLoop().catch((err) => {
    console.error(`[stream] loop error for ${channel.name}:`, err);
    if (!res.writableEnded) res.end();
  });
});

// Format date as XMLTV format: "20260401120000 +0000"
function formatXmltvDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "'").replace(/[\n\r]/g, " ");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
