import { Router, type Request, type Response } from "express";
import { spawn, execSync } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getAllChannels, getSchedule, getCurrentSlot, getRemainingSlots } from "../schedule.js";
import type { Channel } from "../../shared/types.js";

export const iptvRouter = Router();

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

  const lang = channel.audioLanguage || "eng";

  // Select preferred audio language, fall back to first audio stream if no match
  const mapArgs = ["-map", "0:v:0", "-map", `0:a:m:language:${lang}?`, "-map", "0:a:0?"];

  const codecArgs = channel.streamMode === "copy"
    ? ["-c", "copy"]
    : ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "23",
       "-force_key_frames", "expr:gte(t,n_forced*2)",
       "-c:a", "aac", "-ac", "2", "-b:a", "192k"];

  const ffmpegArgs = [
    "-fflags", "+igndts+genpts",
    "-f", "concat",
    "-safe", "0",
    "-protocol_whitelist", "file,http,https,tcp,tls",
    "-i", concatFile,
    ...mapArgs,
    ...codecArgs,
    "-f", "mpegts",
    "-mpegts_flags", "resend_headers",
    "-flush_packets", "1",
    "pipe:1",
  ];

  const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  req.on("close", () => {
    ffmpeg.kill("SIGTERM");
  });

  // Pre-buffer: wait for enough data (including video keyframe) before sending
  // This ensures Jellyfin's probe gets valid H264 data on first read
  const PRE_BUFFER_SIZE = 256 * 1024; // 256KB
  const PRE_BUFFER_TIMEOUT = 15_000; // 15s max wait
  let preBuffer: Buffer[] = [];
  let preBufferBytes = 0;
  let headersSent = false;

  const preBufferTimer = setTimeout(() => {
    // Timeout — send whatever we have
    if (!headersSent && !res.writableEnded) {
      headersSent = true;
      res.setHeader("Content-Type", "video/mp2t");
      res.setHeader("Transfer-Encoding", "chunked");
      for (const buf of preBuffer) res.write(buf);
      preBuffer = [];
    }
  }, PRE_BUFFER_TIMEOUT);

  ffmpeg.stdout.on("data", (chunk: Buffer) => {
    if (!headersSent) {
      preBuffer.push(chunk);
      preBufferBytes += chunk.length;
      if (preBufferBytes >= PRE_BUFFER_SIZE) {
        clearTimeout(preBufferTimer);
        headersSent = true;
        res.setHeader("Content-Type", "video/mp2t");
        res.setHeader("Transfer-Encoding", "chunked");
        for (const buf of preBuffer) res.write(buf);
        preBuffer = [];
      }
    } else if (!res.writableEnded) {
      res.write(chunk);
    } else {
      ffmpeg.kill("SIGTERM");
    }
  });

  let stderrBuf = "";
  ffmpeg.stderr.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
    // Log first 2000 chars of stderr for debugging, then just consume
    if (stderrBuf.length <= 2000) {
      // Will be logged on close
    }
  });

  ffmpeg.on("close", (code) => {
    clearTimeout(preBufferTimer);
    if (code !== 0 && code !== null) {
      console.error(`[stream] ffmpeg exited with code ${code} for channel ${channel.name}`);
      console.error(`[stream] ffmpeg stderr: ${stderrBuf.slice(0, 2000)}`);
    }
    // Flush any remaining pre-buffer
    if (!headersSent && preBuffer.length > 0 && !res.writableEnded) {
      res.setHeader("Content-Type", "video/mp2t");
      for (const buf of preBuffer) res.write(buf);
    }
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
