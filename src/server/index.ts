import express from "express";
import cors from "cors";
import { jellyfinRouter } from "./routes/jellyfin.js";
import { iptvRouter } from "./routes/iptv.js";
import { channelRouter } from "./routes/channels.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(cors());
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Virtual TV server running on port ${PORT}`);
});
