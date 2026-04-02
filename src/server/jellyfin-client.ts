import type { JellyfinItem, ChannelFilter } from "../shared/types.js";

const JELLYFIN_URL = process.env.JELLYFIN_URL;
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY;

const authHeaders = {
  Authorization: `MediaBrowser Token="${JELLYFIN_API_KEY}"`,
};

export async function fetchItemsForFilter(filter: ChannelFilter, limit = 300): Promise<JellyfinItem[]> {
  if (!JELLYFIN_URL || !JELLYFIN_API_KEY) return [];

  // If titleMatch is set, find matching series/movies first, then get their episodes
  if (filter.titleMatch) {
    return fetchByTitleMatch(filter, limit);
  }

  const params = new URLSearchParams();
  params.set("recursive", "true");
  params.set("fields", "Path,Genres,Tags,Overview,MediaSources,ImageTags,SeriesId");
  params.set("limit", String(limit));
  params.set("sortBy", "Random");

  const types = filter.itemTypes?.length ? filter.itemTypes.join(",") : "Movie,Episode";
  params.set("includeItemTypes", types);

  if (filter.genres?.length) {
    params.set("genres", filter.genres.join(","));
  }

  if (filter.tags?.length) {
    params.set("tags", filter.tags.join(","));
  }

  // Query per library or all
  if (filter.libraryIds?.length) {
    const allItems: JellyfinItem[] = [];
    for (const libId of filter.libraryIds) {
      params.set("parentId", libId);
      const items = await queryItems(params);
      allItems.push(...items);
    }
    return shuffleArray(allItems).slice(0, limit);
  }

  return queryItems(params);
}

async function fetchByTitleMatch(filter: ChannelFilter, limit: number): Promise<JellyfinItem[]> {
  const search = filter.titleMatch!;
  const wantEpisodes = !filter.itemTypes?.length || filter.itemTypes.includes("Episode");
  const wantMovies = !filter.itemTypes?.length || filter.itemTypes.includes("Movie");

  const allItems: JellyfinItem[] = [];

  // Search for series matching the title, then get their episodes
  if (wantEpisodes) {
    const seriesParams = new URLSearchParams();
    seriesParams.set("recursive", "true");
    seriesParams.set("includeItemTypes", "Series");
    seriesParams.set("searchTerm", search);
    seriesParams.set("limit", "10");

    if (filter.libraryIds?.length) {
      for (const libId of filter.libraryIds) {
        seriesParams.set("parentId", libId);
        const seriesList = await queryItemsRaw(seriesParams);
        for (const series of seriesList) {
          const episodes = await getEpisodes(series.Id, limit);
          allItems.push(...episodes);
        }
      }
    } else {
      const seriesList = await queryItemsRaw(seriesParams);
      for (const series of seriesList) {
        const episodes = await getEpisodes(series.Id, limit);
        allItems.push(...episodes);
      }
    }
  }

  // Search for movies matching the title
  if (wantMovies) {
    const movieParams = new URLSearchParams();
    movieParams.set("recursive", "true");
    movieParams.set("includeItemTypes", "Movie");
    movieParams.set("searchTerm", search);
    movieParams.set("fields", "Path,Genres,Tags,Overview,MediaSources");
    movieParams.set("limit", String(limit));

    if (filter.libraryIds?.length) {
      for (const libId of filter.libraryIds) {
        movieParams.set("parentId", libId);
        const movies = await queryItems(movieParams);
        allItems.push(...movies);
      }
    } else {
      const movies = await queryItems(movieParams);
      allItems.push(...movies);
    }
  }

  return allItems.slice(0, limit);
}

async function getEpisodes(seriesId: string, limit: number): Promise<JellyfinItem[]> {
  const params = new URLSearchParams();
  params.set("parentId", seriesId);
  params.set("includeItemTypes", "Episode");
  params.set("recursive", "true");
  params.set("fields", "Path,Genres,Tags,Overview,MediaSources,ImageTags,SeriesId");
  params.set("sortBy", "SortName");
  params.set("sortOrder", "Ascending");
  params.set("limit", String(limit));
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

async function queryItemsRaw(params: URLSearchParams): Promise<any[]> {
  try {
    const url = `${JELLYFIN_URL}/Items?${params.toString()}`;
    const response = await fetch(url, { headers: authHeaders });
    if (!response.ok) return [];
    const data = await response.json();
    return data.Items || [];
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
