import type { JellyfinItem, ChannelFilter } from "../shared/types.js";

const JELLYFIN_URL = process.env.JELLYFIN_URL;
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY;

const authHeaders = {
  Authorization: `MediaBrowser Token="${JELLYFIN_API_KEY}"`,
};

const FETCH_TIMEOUT_MS = 15_000;

// Resolve the global stream index for an item's audio track in the requested
// language. Jellyfin's AudioStreamIndex param is the index into
// MediaSources[0].MediaStreams (mixing video/audio/subs), not an audio-only
// counter. Returns null when no matching audio track exists, so the caller
// can fall through to Jellyfin's default selection.
const audioIndexCache = new Map<string, number | null>();
const LANG_ALIASES: Record<string, string[]> = {
  eng: ["eng", "en", "english"],
  jpn: ["jpn", "ja", "japanese"],
  spa: ["spa", "es", "spanish"],
  fre: ["fre", "fra", "fr", "french"],
  ger: ["ger", "deu", "de", "german"],
};
function languageMatches(streamLang: string | undefined, want: string): boolean {
  if (!streamLang) return false;
  const s = streamLang.toLowerCase();
  const w = want.toLowerCase();
  const aliases = LANG_ALIASES[w] || [w];
  return aliases.includes(s);
}

export async function getAudioStreamIndex(itemId: string, language: string): Promise<number | null> {
  if (!JELLYFIN_URL || !JELLYFIN_API_KEY) return null;
  const cacheKey = `${itemId}:${language.toLowerCase()}`;
  if (audioIndexCache.has(cacheKey)) return audioIndexCache.get(cacheKey)!;

  try {
    const url = `${JELLYFIN_URL}/Items?Ids=${encodeURIComponent(itemId)}&fields=MediaSources`;
    const response = await fetch(url, {
      headers: authHeaders,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      audioIndexCache.set(cacheKey, null);
      return null;
    }
    const data = await response.json();
    const streams = data?.Items?.[0]?.MediaSources?.[0]?.MediaStreams as
      | Array<{ Type: string; Index: number; Language?: string }>
      | undefined;
    if (!streams?.length) {
      audioIndexCache.set(cacheKey, null);
      return null;
    }
    const match = streams.find(s => s.Type === "Audio" && languageMatches(s.Language, language));
    const idx = match ? match.Index : null;
    audioIndexCache.set(cacheKey, idx);
    return idx;
  } catch {
    return null;
  }
}

export async function fetchItemsForFilter(filter: ChannelFilter, limit = 300): Promise<JellyfinItem[]> {
  if (!JELLYFIN_URL || !JELLYFIN_API_KEY) return [];

  // If titleMatch is set, find matching series/movies first, then get their episodes
  if (filter.titleMatch) {
    return applyExclusions(await fetchByTitleMatch(filter, limit), filter);
  }

  // Tags are set on Series, not Episodes — Jellyfin's tags filter returns 0 episodes.
  // When filtering by tag with episodes, find matching Series first, then get their episodes.
  if (filter.tags?.length) {
    return applyExclusions(await fetchByTag(filter, limit), filter);
  }

  const params = new URLSearchParams();
  params.set("recursive", "true");
  params.set("fields", "Path,Genres,Tags,Overview,MediaSources,ImageTags,SeriesId");
  params.set("limit", String(limit));
  params.set("sortBy", "SortName");
  params.set("sortOrder", "Ascending");

  const types = filter.itemTypes?.length ? filter.itemTypes.join(",") : "Movie,Episode";
  params.set("includeItemTypes", types);

  // Multiple genres use OR logic — query each genre separately and deduplicate
  if (filter.genres && filter.genres.length > 1) {
    const seen = new Set<string>();
    const allItems: JellyfinItem[] = [];
    for (const genre of filter.genres) {
      const genreParams = new URLSearchParams(params);
      genreParams.set("genres", genre);
      const items = await queryAcrossLibraries(genreParams, filter.libraryIds, queryItems);
      for (const item of items) {
        if (!seen.has(item.Id)) {
          seen.add(item.Id);
          allItems.push(item);
        }
      }
    }
    return applyExclusions(allItems.slice(0, limit), filter);
  }

  if (filter.genres?.length === 1) {
    params.set("genres", filter.genres[0]);
  }

  // Query per library or all
  let items: JellyfinItem[];
  if (filter.libraryIds?.length) {
    const allItems: JellyfinItem[] = [];
    for (const libId of filter.libraryIds) {
      params.set("parentId", libId);
      allItems.push(...await queryItems(params));
    }
    items = allItems.slice(0, limit);
  } else {
    items = await queryItems(params);
  }

  return applyExclusions(items, filter);
}

// Query across library IDs (or all libraries if none specified)
async function queryAcrossLibraries<T>(
  params: URLSearchParams,
  libraryIds: string[] | undefined,
  queryFn: (p: URLSearchParams) => Promise<T[]>,
): Promise<T[]> {
  if (libraryIds?.length) {
    const results: T[] = [];
    for (const libId of libraryIds) {
      const libParams = new URLSearchParams(params);
      libParams.set("parentId", libId);
      results.push(...await queryFn(libParams));
    }
    return results;
  }
  return queryFn(params);
}

// Tags are on Series/Movies, not Episodes. Find matching Series by tag, then get their episodes.
// Exclusions are also applied at the Series level since episodes don't carry genres/tags.
async function fetchByTag(filter: ChannelFilter, limit: number): Promise<JellyfinItem[]> {
  const tags = filter.tags!.join(",");
  const wantEpisodes = !filter.itemTypes?.length || filter.itemTypes.includes("Episode");
  const wantMovies = !filter.itemTypes?.length || filter.itemTypes.includes("Movie");

  const allItems: JellyfinItem[] = [];

  if (wantEpisodes) {
    const seriesParams = new URLSearchParams();
    seriesParams.set("recursive", "true");
    seriesParams.set("includeItemTypes", "Series");
    seriesParams.set("tags", tags);
    seriesParams.set("fields", "Genres,Tags");
    seriesParams.set("limit", "200");

    if (filter.genres?.length) {
      seriesParams.set("genres", filter.genres.join("|"));
    }

    const seriesList = applyExclusions(
      await queryAcrossLibraries(seriesParams, filter.libraryIds, queryItemsRaw),
      filter,
    );
    for (const series of seriesList) {
      const episodes = await getEpisodes(series.Id, limit);
      allItems.push(...episodes);
    }
  }

  if (wantMovies) {
    const movieParams = new URLSearchParams();
    movieParams.set("recursive", "true");
    movieParams.set("includeItemTypes", "Movie");
    movieParams.set("tags", tags);
    movieParams.set("fields", "Path,Genres,Tags,Overview,MediaSources,ImageTags,SeriesId");
    movieParams.set("limit", String(limit));

    if (filter.genres?.length) {
      movieParams.set("genres", filter.genres.join("|"));
    }

    const movies = await queryAcrossLibraries(movieParams, filter.libraryIds, queryItems);
    allItems.push(...applyExclusions(movies, filter));
  }

  return allItems.slice(0, limit);
}

async function fetchByTitleMatch(filter: ChannelFilter, limit: number): Promise<JellyfinItem[]> {
  const searchTerms = filter.titleMatch!.split(",").map((s) => s.trim()).filter(Boolean);
  const wantEpisodes = !filter.itemTypes?.length || filter.itemTypes.includes("Episode");
  const wantMovies = !filter.itemTypes?.length || filter.itemTypes.includes("Movie");

  const seen = new Set<string>();
  const allItems: JellyfinItem[] = [];

  for (const search of searchTerms) {
    if (wantEpisodes) {
      const seriesParams = new URLSearchParams();
      seriesParams.set("recursive", "true");
      seriesParams.set("includeItemTypes", "Series");
      seriesParams.set("searchTerm", search);
      seriesParams.set("limit", "10");

      const seriesList = await queryAcrossLibraries(seriesParams, filter.libraryIds, queryItemsRaw);
      for (const series of seriesList) {
        const episodes = await getEpisodes(series.Id, limit);
        for (const ep of episodes) {
          if (!seen.has(ep.Id)) {
            seen.add(ep.Id);
            allItems.push(ep);
          }
        }
      }
    }

    if (wantMovies) {
      const movieParams = new URLSearchParams();
      movieParams.set("recursive", "true");
      movieParams.set("includeItemTypes", "Movie");
      movieParams.set("searchTerm", search);
      movieParams.set("fields", "Path,Genres,Tags,Overview,MediaSources,ImageTags,SeriesId");
      movieParams.set("limit", String(limit));

      const movies = await queryAcrossLibraries(movieParams, filter.libraryIds, queryItems);
      for (const movie of movies) {
        if (!seen.has(movie.Id)) {
          seen.add(movie.Id);
          allItems.push(movie);
        }
      }
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
    const response = await fetch(url, {
      headers: authHeaders,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[jellyfin] query failed with status ${response.status}: ${url}`);
      return [];
    }
    const data = await response.json();
    return (data.Items || []).filter((item: JellyfinItem) => item.RunTimeTicks > 0);
  } catch (err) {
    console.warn(`[jellyfin] query error:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function queryItemsRaw(params: URLSearchParams): Promise<JellyfinItem[]> {
  try {
    const url = `${JELLYFIN_URL}/Items?${params.toString()}`;
    const response = await fetch(url, {
      headers: authHeaders,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[jellyfin] query failed with status ${response.status}: ${url}`);
      return [];
    }
    const data = await response.json();
    return data.Items || [];
  } catch (err) {
    console.warn(`[jellyfin] query error:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// Client-side exclusion filtering (Jellyfin API doesn't support excludes)
function applyExclusions(items: JellyfinItem[], filter: ChannelFilter): JellyfinItem[] {
  if (!filter.excludeGenres?.length && !filter.excludeTags?.length) return items;

  const exGenres = new Set((filter.excludeGenres || []).map(g => g.toLowerCase()));
  const exTags = new Set((filter.excludeTags || []).map(t => t.toLowerCase()));

  return items.filter(item => {
    if (exGenres.size > 0 && item.Genres?.some(g => exGenres.has(g.toLowerCase()))) return false;
    if (exTags.size > 0 && item.Tags?.some(t => exTags.has(t.toLowerCase()))) return false;
    return true;
  });
}

