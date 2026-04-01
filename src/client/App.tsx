import { useState, useEffect } from "react";
import type { Channel } from "../shared/types";

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data) => setChannels(data.channels));
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Virtual TV</h1>
      <p>Configure your virtual live TV channels for Jellyfin.</p>

      {channels.length === 0 ? (
        <p style={{ color: "#888" }}>No channels yet. Create one to get started.</p>
      ) : (
        <ul>
          {channels.map((ch) => (
            <li key={ch.id}>{ch.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
