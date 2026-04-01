export interface Channel {
  id: string;
  name: string;
  number: number;
  filters: ChannelFilter;
  shuffleMode: "random" | "sequential";
  logoUrl?: string;
}

export interface ChannelFilter {
  genres?: string[];
  tags?: string[];
  titleMatch?: string;
  libraryIds?: string[];
  itemTypes?: ("Movie" | "Episode")[];
}

export interface ScheduleSlot {
  channelId: string;
  itemId: string;
  title: string;
  startTime: string; // ISO 8601
  endTime: string;
  durationTicks: number;
  filePath: string;
}

export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string;
  Path: string;
  RunTimeTicks: number;
  SeriesName?: string;
  SeasonName?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  Genres?: string[];
  Tags?: string[];
  Overview?: string;
  ImageTags?: Record<string, string>;
}
