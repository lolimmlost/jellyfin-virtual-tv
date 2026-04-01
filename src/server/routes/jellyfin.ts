import { Router } from "express";

export const jellyfinRouter = Router();

jellyfinRouter.get("/libraries", async (_req, res) => {
  res.json({ libraries: [] });
});

jellyfinRouter.get("/items", async (req, res) => {
  res.json({ items: [] });
});
