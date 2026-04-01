import { Router } from "express";

export const iptvRouter = Router();

iptvRouter.get("/channels.m3u", async (_req, res) => {
  res.setHeader("Content-Type", "audio/x-mpegurl");
  res.send("#EXTM3U\n");
});

iptvRouter.get("/epg.xml", async (_req, res) => {
  res.setHeader("Content-Type", "application/xml");
  const xml = '<?xml version="1.0" encoding="utf-8"?>\n<tv></tv>';
  res.send(xml);
});

iptvRouter.get("/stream/:channelId", async (req, res) => {
  res.status(501).json({ error: "streaming not yet implemented" });
});
