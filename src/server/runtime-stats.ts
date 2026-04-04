// In-memory runtime stats for health diagnostics.
// Tracks active streams and recent errors — no persistence, resets on restart.

interface StreamEntry {
  channelId: string;
  startedAt: number;
}

interface ErrorEntry {
  message: string;
  timestamp: string;
}

const MAX_ERRORS = 50;

const activeStreams = new Map<number, StreamEntry>();
let nextStreamId = 0;
let totalStreamStarts = 0;
let totalStreamFailures = 0;
const recentErrors: ErrorEntry[] = [];

export function trackStreamStart(channelId: string): number {
  const id = nextStreamId++;
  activeStreams.set(id, { channelId, startedAt: Date.now() });
  totalStreamStarts++;
  return id;
}

export function trackStreamEnd(streamId: number, exitCode: number | null): void {
  activeStreams.delete(streamId);
  if (exitCode !== null && exitCode !== 0) {
    totalStreamFailures++;
  }
}

export function trackError(message: string): void {
  recentErrors.push({ message, timestamp: new Date().toISOString() });
  if (recentErrors.length > MAX_ERRORS) {
    recentErrors.shift();
  }
}

export function getStreamStats() {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const recentFailureCount = recentErrors.filter((e) => e.timestamp > oneHourAgo).length;
  const lastError = recentErrors[recentErrors.length - 1] ?? null;

  return {
    active: activeStreams.size,
    totalStarts: totalStreamStarts,
    totalFailures: totalStreamFailures,
    recentFailures: recentFailureCount,
    lastError: lastError?.message ?? null,
    lastErrorAt: lastError?.timestamp ?? null,
  };
}
