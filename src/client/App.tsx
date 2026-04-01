import { useState, useEffect } from "react";
import type { JellyfinLibrary, JellyfinItem } from "../shared/types";

const theme = {
  bg: "#0f0f0f",
  surface: "#1a1a1a",
  accent: "#7C3AED",
  text: "#e4e4e4",
  textDim: "#888",
  border: "#2a2a2a",
};

function formatRuntime(ticks: number): string {
  const totalSeconds = Math.floor(ticks / 10_000_000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatEpisode(item: JellyfinItem): string {
  if (item.Type !== "Episode") return item.Name;
  const season = item.ParentIndexNumber;
  const episode = item.IndexNumber;
  const tag = season != null && episode != null
    ? `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
    : "";
  const series = item.SeriesName || "";
  return [series, tag, item.Name].filter(Boolean).join(" \u2014 ");
}

interface Status {
  connected: boolean;
  serverName?: string;
  version?: string;
  error?: string;
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<string | null>(null);
  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/jellyfin/status")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        if (data.connected) {
          return fetch("/api/jellyfin/libraries").then((r) => r.json());
        }
      })
      .then((data) => {
        if (data?.libraries) setLibraries(data.libraries);
      })
      .catch(() => setStatus({ connected: false, error: "Failed to reach server" }));
  }, []);

  function selectLibrary(itemId: string) {
    setSelectedLibrary(itemId);
    setLoading(true);
    fetch(`/api/jellyfin/items?parentId=${itemId}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || []);
        setTotalCount(data.totalCount || 0);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  return (
    <div style={{ background: theme.bg, color: theme.text, minHeight: "100vh", fontFamily: "system-ui" }}>
      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 24px", borderBottom: `1px solid ${theme.border}`,
      }}>
        <h1 style={{ margin: 0, fontSize: 24, color: theme.accent }}>Virtual TV</h1>
        <StatusPill status={status} />
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        {/* Libraries */}
        <h2 style={{ fontSize: 16, color: theme.textDim, marginBottom: 12 }}>Libraries</h2>
        {libraries.length === 0 && status?.connected && (
          <p style={{ color: theme.textDim }}>No libraries found.</p>
        )}
        {!status?.connected && status !== null && (
          <p style={{ color: "#ef4444" }}>Not connected to Jellyfin. Check your environment variables.</p>
        )}
        <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
          {libraries.map((lib) => (
            <button
              key={lib.ItemId}
              onClick={() => selectLibrary(lib.ItemId)}
              style={{
                background: selectedLibrary === lib.ItemId ? theme.surface : "transparent",
                border: `1px solid ${selectedLibrary === lib.ItemId ? theme.accent : theme.border}`,
                borderRadius: 8, padding: "12px 20px", cursor: "pointer",
                color: theme.text, textAlign: "left",
              }}
            >
              <div style={{ fontWeight: 600 }}>{lib.Name}</div>
              <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{lib.CollectionType}</div>
            </button>
          ))}
        </div>

        {/* Items */}
        {selectedLibrary && (
          <>
            <h2 style={{ fontSize: 16, color: theme.textDim, marginBottom: 12 }}>
              Items {totalCount > 0 && <span style={{ color: theme.accent }}>({totalCount})</span>}
            </h2>
            {loading ? (
              <p style={{ color: theme.textDim }}>Loading...</p>
            ) : (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12,
              }}>
                {items.map((item) => (
                  <div key={item.Id} style={{
                    background: theme.surface, border: `1px solid ${theme.border}`,
                    borderRadius: 8, padding: 16,
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{formatEpisode(item)}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span style={{
                        fontSize: 11, padding: "2px 6px", borderRadius: 4,
                        background: theme.accent + "22", color: theme.accent, fontWeight: 600,
                      }}>
                        {item.Type}
                      </span>
                      {item.RunTimeTicks > 0 && (
                        <span style={{ fontSize: 12, color: theme.textDim }}>
                          {formatRuntime(item.RunTimeTicks)}
                        </span>
                      )}
                    </div>
                    {item.Genres && item.Genres.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {item.Genres.slice(0, 4).map((g) => (
                          <span key={g} style={{
                            fontSize: 11, padding: "1px 6px", borderRadius: 4,
                            border: `1px solid ${theme.border}`, color: theme.textDim,
                          }}>
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!selectedLibrary && libraries.length > 0 && (
          <p style={{ color: theme.textDim }}>Select a library to browse its items.</p>
        )}
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: Status | null }) {
  if (!status) return <span style={{ color: theme.textDim, fontSize: 13 }}>Checking...</span>;

  const color = status.connected ? "#22c55e" : "#ef4444";
  const label = status.connected
    ? `Connected to ${status.serverName}`
    : status.error || "Disconnected";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      <span style={{ color }}>{label}</span>
    </div>
  );
}
