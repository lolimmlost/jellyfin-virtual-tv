import { Router, type Request, type Response } from "express";
import { spawn } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getAllChannels, getSchedule, getCurrentSlot, getRemainingSlots } from "../schedule.js";
import type { Channel } from "../../shared/types.js";

export const iptvRouter = Router();

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
    const logoParam = ch.logoUrl ? ` tvg-logo="${ch.logoUrl}"` : "";
    m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-chno="${ch.number}" tvg-name="${ch.name}"${logoParam} group-title="Virtual TV",${ch.name}\n`;
    m3u += `${baseUrl}/iptv/stream/${ch.id}.ts\n\n`;
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
// Uses ffmpeg concat demuxer for continuous timestamps across episode boundaries
iptvRouter.get("/stream/:channelId", async (req, res) => {
  const channel = findChannel(req, res);
  if (!channel) return;

  const slots = await getRemainingSlots(channel);
  if (slots.length === 0) {
    res.status(503).json({ error: "No content scheduled" });
    return;
  }

  const jellyfinUrl = process.env.JELLYFIN_URL;
  const apiKey = process.env.JELLYFIN_API_KEY;
  if (!jellyfinUrl || !apiKey) {
    res.status(503).json({ error: "Jellyfin not configured" });
    return;
  }

  // Build concat demuxer playlist file
  const tempDir = mkdtempSync(join(tmpdir(), "vtv-"));
  const concatFile = join(tempDir, "playlist.txt");

  let concatContent = "";
  for (const { slot, offsetSeconds } of slots) {
    const streamUrl = `${jellyfinUrl}/Videos/${slot.itemId}/stream?static=true&api_key=${apiKey}`;
    concatContent += `file '${streamUrl}'\n`;
    if (offsetSeconds > 0) {
      concatContent += `inpoint ${offsetSeconds}\n`;
    }
  }
  writeFileSync(concatFile, concatContent);

  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Transfer-Encoding", "chunked");

  const lang = channel.audioLanguage || "eng";

  // Select preferred audio language via metadata-based mapping
  // Falls back to default stream selection if preferred language not found
  const mapArgs = ["-map", "0:v:0", "-map", `0:a:m:language:${lang}?`, "-map", "0:a:0?"];

  const codecArgs = channel.streamMode === "copy"
    ? ["-c", "copy"]
    : ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "23",
       "-force_key_frames", "expr:gte(t,n_forced*2)",
       "-c:a", "aac", "-ac", "2", "-b:a", "192k"];

  const ffmpegArgs = [
    "-f", "concat",
    "-safe", "0",
    "-protocol_whitelist", "file,http,https,tcp,tls",
    "-i", concatFile,
    ...mapArgs,
    ...codecArgs,
    "-f", "mpegts",
    "-mpegts_flags", "resend_headers",
    "-fflags", "+genpts",
    "pipe:1",
  ];

  const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  req.on("close", () => {
    ffmpeg.kill("SIGTERM");
  });

  ffmpeg.stdout.on("data", (chunk: Buffer) => {
    if (!res.writableEnded) {
      res.write(chunk);
    } else {
      ffmpeg.kill("SIGTERM");
    }
  });

  ffmpeg.stderr.on("data", () => {
    // Consume stderr to prevent buffer overflow
  });

  ffmpeg.on("close", () => {
    // Clean up temp concat file
    try { unlinkSync(concatFile); } catch {}
    try { unlinkSync(tempDir); } catch {}
    if (!res.writableEnded) res.end();
  });
});

// Format date as XMLTV format: "20260401120000 +0000"
function formatXmltvDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
