import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import "./db.js"; // Initialize database on startup
import { jellyfinRouter } from "./routes/jellyfin.js";
import { iptvRouter } from "./routes/iptv.js";
import { channelRouter } from "./routes/channels.js";

// Warn about missing Jellyfin config at startup
if (!process.env.JELLYFIN_URL || !process.env.JELLYFIN_API_KEY) {
  console.warn("WARNING: JELLYFIN_URL and/or JELLYFIN_API_KEY not set. Jellyfin features will be unavailable.");
}

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",").map((s) => s.trim()) } : undefined));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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
