import { Router } from "express";
import { getAllChannels, getSchedule, getCurrentSlot } from "../schedule.js";

export const iptvRouter = Router();

// M3U playlist — Jellyfin adds this as an IPTV tuner
iptvRouter.get("/channels.m3u", async (req, res) => {
  const channels = getAllChannels();

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

  let m3u = "#EXTM3U\n\n";

  for (const ch of channels) {
    const logoParam = ch.logoUrl ? ` tvg-logo="${ch.logoUrl}"` : "";
    m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-chno="${ch.number}" tvg-name="${ch.name}"${logoParam} group-title="Virtual TV",${ch.name}\n`;
    m3u += `${baseUrl}/iptv/stream/${ch.id}\n\n`;
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
  const channels = getAllChannels();
  const channel = channels.find((c) => c.id === req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const slots = await getSchedule(channel);
  res.json({ channel: channel.name, slots });
});

// What's on now
iptvRouter.get("/now/:channelId", async (req, res) => {
  const channels = getAllChannels();
  const channel = channels.find((c) => c.id === req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

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

// Stream endpoint — proxy the Jellyfin stream directly instead of redirecting
iptvRouter.get("/stream/:channelId", async (req, res) => {
  const channels = getAllChannels();
  const channel = channels.find((c) => c.id === req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const current = await getCurrentSlot(channel);
  if (!current) {
    res.status(503).json({ error: "No content scheduled" });
    return;
  }

  const jellyfinUrl = process.env.JELLYFIN_URL;
  const apiKey = process.env.JELLYFIN_API_KEY;
  if (!jellyfinUrl || !apiKey) {
    res.status(503).json({ error: "Jellyfin not configured" });
    return;
  }

  // Proxy the stream from Jellyfin instead of redirecting
  try {
    const streamUrl = `${jellyfinUrl}/Videos/${current.slot.itemId}/stream?static=true&api_key=${apiKey}`;
    const upstream = await fetch(streamUrl);

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "Upstream stream failed" });
      return;
    }

    // Forward content type and pipe the body
    const contentType = upstream.headers.get("content-type") || "video/mp2t";
    res.setHeader("Content-Type", contentType);

    // Don't forward content-length — we may not serve the full file
    // Mark as infinite/live stream
    res.setHeader("Transfer-Encoding", "chunked");

    const reader = upstream.body?.getReader();
    if (!reader) {
      res.status(503).json({ error: "No stream body" });
      return;
    }

    req.on("close", () => {
      reader.cancel();
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.writableEnded) {
        res.write(Buffer.from(value));
      } else {
        reader.cancel();
        break;
      }
    }

    if (!res.writableEnded) res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(503).json({ error: "Stream failed" });
    }
  }
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
