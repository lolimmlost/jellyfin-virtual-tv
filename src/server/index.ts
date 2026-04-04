import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import "./db.js"; // Initialize database on startup
import { jellyfinRouter } from "./routes/jellyfin.js";
import { iptvRouter } from "./routes/iptv.js";
import { channelRouter } from "./routes/channels.js";
import { getAllChannels, getSchedule, getScheduleCacheStats } from "./schedule.js";
import { getStreamStats } from "./runtime-stats.js";

// Warn about missing Jellyfin config at startup
if (!process.env.JELLYFIN_URL || !process.env.JELLYFIN_API_KEY) {
  console.warn("WARNING: JELLYFIN_URL and/or JELLYFIN_API_KEY not set. Jellyfin features will be unavailable.");
}

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",").map((s) => s.trim()) } : undefined));
app.use(express.json());

// Health check (simple — used by Docker HEALTHCHECK)
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Detailed health — used by auto-polish runner and diagnostics
app.get("/health/detailed", async (_req, res) => {
  const channels = getAllChannels();
  const emptyChannels: string[] = [];
  let withSchedule = 0;

  for (const ch of channels) {
    const slots = await getSchedule(ch);
    if (slots.length > 0) {
      withSchedule++;
    } else {
      emptyChannels.push(ch.name);
    }
  }

  let jellyfin = { reachable: false, serverName: "" };
  const jellyfinUrl = process.env.JELLYFIN_URL;
  const apiKey = process.env.JELLYFIN_API_KEY;
  if (jellyfinUrl && apiKey) {
    try {
      const resp = await fetch(`${jellyfinUrl}/System/Info`, {
        headers: { Authorization: `MediaBrowser Token="${apiKey}"` },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const info = await resp.json();
        jellyfin = { reachable: true, serverName: info.ServerName || "" };
      }
    } catch {}
  }

  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    channels: { total: channels.length, withSchedule, empty: emptyChannels },
    scheduleCache: getScheduleCacheStats(),
    streams: getStreamStats(),
    jellyfin,
  });
});

// API routes
app.use("/api/jellyfin", jellyfinRouter);
app.use("/api/channels", channelRouter);

// IPTV endpoints (M3U + XMLTV + streams)
app.use("/iptv", iptvRouter);

// Serve React frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../client")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Virtual TV server running on port ${PORT}`);
});
