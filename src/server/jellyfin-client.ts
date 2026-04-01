import type { JellyfinItem, ChannelFilter } from "../shared/types.js";

const JELLYFIN_URL = process.env.JELLYFIN_URL;
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY;

const authHeaders = {
  Authorization: `MediaBrowser Token="${JELLYFIN_API_KEY}"`,
};

export async function fetchItemsForFilter(filter: ChannelFilter, limit = 300): Promise<JellyfinItem[]> {
  if (!JELLYFIN_URL || !JELLYFIN_API_KEY) return [];

  const params = new URLSearchParams();
  params.set("recursive", "true");
  params.set("fields", "Path,Genres,Tags,Overview,MediaSources");
  params.set("limit", String(limit));
  params.set("sortBy", "Random");

  // Item types
  const types = filter.itemTypes?.length ? filter.itemTypes.join(",") : "Movie,Episode";
  params.set("includeItemTypes", types);

  // Library scope
  if (filter.libraryIds?.length) {
    // Use the first library as parentId; for multiple, we query each and merge
    if (filter.libraryIds.length === 1) {
      params.set("parentId", filter.libraryIds[0]);
    }
  }

  // Genres
  if (filter.genres?.length) {
    params.set("genres", filter.genres.join(","));
  }

  // Tags
  if (filter.tags?.length) {
    params.set("tags", filter.tags.join(","));
  }

  // Title search
  if (filter.titleMatch) {
    params.set("searchTerm", filter.titleMatch);
  }

  // If multiple libraries, query each and merge
  if (filter.libraryIds && filter.libraryIds.length > 1) {
    const allItems: JellyfinItem[] = [];
    for (const libId of filter.libraryIds) {
      params.set("parentId", libId);
      const items = await queryItems(params);
      allItems.push(...items);
    }
    // Shuffle merged results
    return shuffleArray(allItems).slice(0, limit);
  }

  return queryItems(params);
}

async function queryItems(params: URLSearchParams): Promise<JellyfinItem[]> {
  try {
    const url = `${JELLYFIN_URL}/Items?${params.toString()}`;
    const response = await fetch(url, { headers: authHeaders });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.Items || []).filter((item: JellyfinItem) => item.RunTimeTicks > 0);
  } catch {
    return [];
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
