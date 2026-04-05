import { Router, type Request, type Response } from "express";
import { spawn, execSync } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getAllChannels, getSchedule, getCurrentSlot, getFirstSlot } from "../schedule.js";
import { trackStreamStart, trackStreamEnd, trackError } from "../runtime-stats.js";
import type { Channel } from "../../shared/types.js";

export const iptvRouter = Router();

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

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
    m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-chno="${ch.number}" tvg-name="${escapeAttr(ch.name)}"${logoParam} group-title="Virtual TV",${ch.name}\n`;
    // ?f= is a format version that busts Jellyfin's probe cache when our stream format changes
    // Bump this number whenever the stream encoding pipeline changes (e.g., passthrough → GPU transcode)
    m3u += `${baseUrl}/iptv/stream/${ch.id}.ts?f=3\n\n`;
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
// Uses a hybrid approach: concat demuxer for gapless transitions (current + next episode),
// then re-checks the wall clock and builds the next batch. This avoids the stream-ending
// gap that occurs with single-episode ffmpeg processes while still self-correcting drift.
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

  // How many episodes to concat per ffmpeg batch. Higher = fewer gaps but more drift.
  // 3 is a good balance: ~1-2 hours per batch, drift self-corrects between batches.
  const BATCH_SIZE = 3;

  const streamLoop = async () => {
    while (!closed && !res.writableEnded) {
      const current = await getCurrentSlot(channel);
      if (!current) {
        await sleep(5000);
        continue;
      }

      const { slot: currentSlot, offsetSeconds } = current;
      const remainingSeconds = (new Date(currentSlot.endTime).getTime() - Date.now()) / 1000;

      if (remainingSeconds < 5) {
        await sleep(2000);
        continue;
      }

      // Build a batch: current slot + next N-1 slots from the schedule
      const schedule = await getSchedule(channel);
      const now = new Date().toISOString();
      const currentIdx = schedule.findIndex(
        (s) => s.startTime <= now && s.endTime > now,
      );
      const batchSlots = currentIdx >= 0
        ? schedule.slice(currentIdx, currentIdx + BATCH_SIZE)
        : [currentSlot];

      // Build concat playlist with all batch slots
      const tempDir = mkdtempSync(join(tmpdir(), "vtv-"));
      const concatFile = join(tempDir, "playlist.txt");
      let concatContent = "";

      for (let i = 0; i < batchSlots.length; i++) {
        const bSlot = batchSlots[i];
        const params = new URLSearchParams({
          api_key: apiKey,
          VideoCodec: "h264",
          AudioCodec: "aac",
          AudioChannels: "2",
          MaxStreamingBitrate: "20000000",
          VideoBitRate: "8000000",
          AudioBitRate: "192000",
          MaxWidth: "1920",
          MaxHeight: "1080",
          AudioStreamIndex: "0",
        });
        // Only seek into the first slot (it's already in progress)
        if (i === 0 && offsetSeconds > 0) {
          params.set("StartTimeTicks", String(Math.floor(offsetSeconds * 10_000_000)));
        }
        const url = `${jellyfinUrl}/Videos/${bSlot.itemId}/stream.ts?${params.toString()}`;
        concatContent += `file '${url.replace(/'/g, "'\\''")}'\n`;
      }
      writeFileSync(concatFile, concatContent);

      const titles = batchSlots.map((s) => s.title).join(" → ");
      console.log(`[stream] ${channel.name}: batch of ${batchSlots.length} — ${titles} (offset ${offsetSeconds}s)`);

      // Stream this batch via ffmpeg concat — gapless transitions between episodes
      await new Promise<void>((resolve) => {
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
          "-c:v", "copy",
          "-c:a", "copy",
          "-bsf:v", "dump_extra=freq=keyframe",
          "-tag:v", "avc1",
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

        const onClose = () => {
          ffmpeg.kill("SIGTERM");
        };
        req.on("close", onClose);

        ffmpeg.stdout.on("data", (chunk: Buffer) => {
          if (!res.writableEnded && !closed) {
            res.write(chunk);
          } else {
            ffmpeg.kill("SIGTERM");
          }
        });

        ffmpeg.stderr.on("data", (chunk: Buffer) => {
          stderrChunks.push(chunk);
          stderrLen += chunk.length;
          // Keep only the tail to avoid unbounded memory growth on long streams
          while (stderrLen > STDERR_MAX && stderrChunks.length > 1) {
            stderrLen -= stderrChunks.shift()!.length;
          }
        });

        ffmpeg.on("close", (code) => {
          trackStreamEnd(streamId, code);
          req.removeListener("close", onClose);
          if (code !== 0 && code !== null && !closed) {
            const stderrTail = Buffer.concat(stderrChunks).toString("utf8").slice(-500);
            const errMsg = `ffmpeg exited ${code} for ${channel.name}`;
            console.error(`[stream] ${errMsg}\n[stream] stderr: ${stderrTail}`);
            trackError(`${errMsg} — ${stderrTail}`);
          }
          try { unlinkSync(concatFile); } catch {}
          try { rmdirSync(tempDir); } catch {}
          resolve();
        });
      });
      // ffmpeg exited naturally (batch finished) — loop re-checks the clock
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
  return s.replace(/"/g, "'");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
