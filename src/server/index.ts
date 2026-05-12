import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
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

// Resolve the running version. Priority:
//   1. SOURCE_COMMIT env (Coolify exposes this automatically at runtime)
//   2. version.json baked in by the Dockerfile (--build-arg GIT_SHA=...)
//   3. "unknown" (e.g. `npm run dev` with no .env override)
const versionInfo: { version: string; builtAt: string } = (() => {
  const fromFile: { version?: string; builtAt?: string } = (() => {
    try {
      const filename = fileURLToPath(import.meta.url);
      const candidates = [
        path.join(path.dirname(filename), "../../version.json"),
        "/app/version.json",
      ];
      for (const p of candidates) {
        try {
          return JSON.parse(readFileSync(p, "utf8"));
        } catch {}
      }
    } catch {}
    return {};
  })();
  const sourceCommit = process.env.SOURCE_COMMIT;
  const version = sourceCommit ? sourceCommit.slice(0, 7) : (fromFile.version || "unknown");
  const builtAt = fromFile.builtAt || "unknown";
  return { version, builtAt };
})();

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",").map((s) => s.trim()) } : undefined));
app.use(express.json());

// Health check (simple — used by Docker HEALTHCHECK)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ...versionInfo });
});

// Detailed health — used by auto-polish runner and diagnostics
app.get("/health/detailed", async (_req, res) => {
  const channels = getAllChannels();
  const emptyChannels: string[] = [];
  let withSchedule = 0;

  for (const ch of channels) {
    try {
      const slots = await getSchedule(ch);
      if (slots.length > 0) {
        withSchedule++;
      } else {
        emptyChannels.push(ch.name);
      }
    } catch (err) {
      console.warn(`[health] schedule check failed for ${ch.name}:`, err instanceof Error ? err.message : err);
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
    } catch (err) {
      console.warn("[health] Jellyfin unreachable:", err instanceof Error ? err.message : err);
    }
  }

  res.json({
    status: "ok",
    ...versionInfo,
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
