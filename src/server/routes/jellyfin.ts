import { Router } from "express";

export const jellyfinRouter = Router();

const JELLYFIN_URL = process.env.JELLYFIN_URL;
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY;

const authHeaders = {
  Authorization: `MediaBrowser Token="${JELLYFIN_API_KEY}"`,
};

jellyfinRouter.get("/status", async (_req, res) => {
  if (!JELLYFIN_URL) {
    res.json({ connected: false, error: "JELLYFIN_URL not set" });
    return;
  }

  try {
    const response = await fetch(`${JELLYFIN_URL}/System/Info/Public`);
    const data = await response.json();
    res.json({
      connected: true,
      serverName: data.ServerName,
      version: data.Version,
    });
  } catch (err) {
    res.json({
      connected: false,
      error: err instanceof Error ? err.message : "Connection failed",
    });
  }
});

jellyfinRouter.get("/libraries", async (_req, res) => {
  if (!JELLYFIN_URL || !JELLYFIN_API_KEY) {
    res.status(500).json({ error: "JELLYFIN_URL and JELLYFIN_API_KEY must be set" });
    return;
  }

  try {
    const response = await fetch(`${JELLYFIN_URL}/Library/VirtualFolders`, {
      headers: authHeaders,
    });
    const data = await response.json();
    const libraries = data.map((lib: any) => ({
      Name: lib.Name,
      CollectionType: lib.CollectionType,
      ItemId: lib.ItemId,
      Locations: lib.Locations,
    }));
    res.json({ libraries });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to fetch libraries",
    });
  }
});

jellyfinRouter.get("/items", async (req, res) => {
  if (!JELLYFIN_URL || !JELLYFIN_API_KEY) {
    res.status(500).json({ error: "JELLYFIN_URL and JELLYFIN_API_KEY must be set" });
    return;
  }

  const parentId = req.query.parentId as string;
  const limit = req.query.limit || "50";

  if (!parentId) {
    res.status(400).json({ error: "parentId query parameter is required" });
    return;
  }

  try {
    const url = `${JELLYFIN_URL}/Items?parentId=${parentId}&includeItemTypes=Movie,Episode&recursive=true&fields=Path,Genres,Tags,Overview&limit=${limit}`;
    const response = await fetch(url, { headers: authHeaders });
    const data = await response.json();
    res.json({ items: data.Items, totalCount: data.TotalRecordCount });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to fetch items",
    });
  }
});
