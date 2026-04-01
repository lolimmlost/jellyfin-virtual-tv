import { Router } from "express";

export const channelRouter = Router();

channelRouter.get("/", async (_req, res) => {
  res.json({ channels: [] });
});

channelRouter.post("/", async (req, res) => {
  res.json({ channel: req.body });
});

channelRouter.put("/:id", async (req, res) => {
  res.json({ channel: { id: req.params.id, ...req.body } });
});

channelRouter.delete("/:id", async (req, res) => {
  res.json({ deleted: req.params.id });
});
