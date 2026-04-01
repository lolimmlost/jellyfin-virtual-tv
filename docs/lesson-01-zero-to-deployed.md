# Lesson 1: Zero to Deployed — React + Express + Docker + Coolify

## What You'll Learn
By the end of this lesson you'll have a full-stack TypeScript app (React frontend + Express backend) running in production via Docker and Coolify. No localhost-only demos — this deploys to a real server from the first commit.

## The Project: Virtual TV for Jellyfin
We're building a sidecar app that creates virtual "live TV" channels from your Jellyfin media library. Think Cartoon Network, but it's your anime collection on shuffle, appearing in Jellyfin's TV guide.

But this lesson isn't about the TV features yet. It's about the **foundation** — the skeleton that every full-stack project needs, and the deployment pipeline that means every commit you make is live within minutes.

## Why This Stack?

| Choice | Why |
|--------|-----|
| **React** | You're here to learn React. It's the frontend. |
| **Express** | Minimal, zero-magic Node.js server. You see every line that runs. |
| **TypeScript** | Shared types between frontend and backend. Catch bugs before runtime. |
| **Vite** | Fast dev server with hot reload. Proxies API calls to Express in dev. |
| **Docker** | Same environment locally and in production. No "works on my machine." |
| **Coolify** | Self-hosted PaaS. Push to GitHub, it builds and deploys. Free Vercel alternative you own. |

## Project Structure

```
jellyfin-virtual-tv/
  docker-compose.yaml      # What Coolify reads to deploy
  Dockerfile               # How the app is built and run
  package.json             # Dependencies + scripts
  tsconfig.json            # TypeScript config
  vite.config.ts           # Vite dev server + build config
  index.html               # React entry point (Vite serves this)
  .env.example             # Environment variables template
  src/
    server/
      index.ts             # Express app — the backend
      routes/
        channels.ts        # Channel CRUD API
        iptv.ts            # M3U/XMLTV/stream endpoints
        jellyfin.ts        # Jellyfin API proxy
    client/
      main.tsx             # React entry point
      App.tsx              # Root React component
    shared/
      types.ts             # TypeScript types shared by both sides
```

### Why This Layout Matters
- `src/server/` and `src/client/` are siblings — they share `src/shared/types.ts`
- One `package.json` for the whole project (monorepo is overkill for this size)
- Vite builds the client to `dist/client/`, TypeScript compiles the server to `dist/server/`
- In production, Express serves the built React files as static assets

## Step by Step

### 1. The Express Server (`src/server/index.ts`)

```typescript
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(cors());
app.use(express.json());

// Health check — Docker and Coolify use this to know the app is alive
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// API routes go here
app.use("/api/channels", channelRouter);

// Serve React frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../client")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Key concepts:**
- **Health check endpoint**: Not optional. Docker checks `/health` every 30 seconds. If it fails 3 times, the container restarts. This is how production apps stay alive.
- **API routes before static files**: Express matches top-to-bottom. `/api/*` hits your routes. Everything else falls through to `express.static` which serves your React build. The `*` catch-all sends `index.html` for any unknown route — this is what makes React Router work in production (client-side routing).
- **`fileURLToPath` dance**: ESM modules don't have `__dirname`. This is the standard workaround.
- **`0.0.0.0`**: Listen on all interfaces, not just localhost. Required inside Docker — without this, the container can't receive traffic.

### 2. The React Client (`src/client/App.tsx`)

```tsx
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
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
      <h1>Virtual TV</h1>
      {channels.length === 0 ? (
        <p>No channels yet.</p>
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
```

**Key concepts:**
- **`fetch("/api/channels")`** — no `http://localhost:3000` prefix. In dev, Vite proxies this to Express (see `vite.config.ts`). In production, it's the same origin because Express serves both the API and the static files.
- **Shared types** — `Channel` is imported from `../shared/types`. Same type definition used by the server. Change it once, both sides update.

### 3. The Bridge: Vite Config (`vite.config.ts`)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/iptv": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist/client",
  },
});
```

**This solves the "two servers" problem:**
- In development, Vite runs on port 5173 (hot reload), Express runs on port 3000 (API)
- The `proxy` config makes `/api/*` requests from the browser go to Express, not Vite
- Your React code always fetches `/api/channels` — it doesn't need to know which server handles it
- In production, there's only one server (Express), so no proxy is needed

### 4. Shared Types (`src/shared/types.ts`)

```typescript
export interface Channel {
  id: string;
  name: string;
  number: number;
  filters: ChannelFilter;
  shuffleMode: "random" | "sequential";
}

export interface ChannelFilter {
  genres?: string[];
  tags?: string[];
  titleMatch?: string;
  libraryIds?: string[];
}
```

**Why this matters:** The server returns `Channel` objects. The client expects `Channel` objects. They're the same type. If you add a field to `Channel`, TypeScript tells you everywhere that needs updating — on both sides.

### 5. The Dockerfile (Multi-Stage Build)

```dockerfile
# Stage 1: Build
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
```

**Two stages, and why:**
- **Stage 1 (builder)**: Installs ALL dependencies (including devDependencies like TypeScript, Vite), compiles everything, then gets thrown away
- **Stage 2 (runtime)**: Starts fresh. Copies only `dist/` (compiled code) and `node_modules/` (runtime deps). Adds ffmpeg (we'll need it for streaming later) and curl (for health checks)
- Result: smaller image, no TypeScript compiler or Vite in production

**`COPY package*.json` then `npm ci` before `COPY . .`**: This is the Docker layer caching trick. Dependencies rarely change, source code changes constantly. By copying `package.json` first, Docker caches the `npm ci` layer. Subsequent builds that only change source code skip the npm install entirely.

### 6. Docker Compose (`docker-compose.yaml`)

```yaml
services:
  virtual-tv:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3336:3000"
    environment:
      - JELLYFIN_URL=${JELLYFIN_URL:-http://10.0.0.227:8096}
      - JELLYFIN_API_KEY=${JELLYFIN_API_KEY:-}
      - PORT=3000
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Key concepts:**
- **`3336:3000`** — external port 3336 maps to internal port 3000. Pick any free external port.
- **`${JELLYFIN_URL:-http://10.0.0.227:8096}`** — environment variable with a default. Set `JELLYFIN_URL` in Coolify's env vars to override.
- **`restart: unless-stopped`** — container comes back after crashes or server reboots
- **`healthcheck`** — Docker pings `/health` every 30 seconds. Three failures = restart. This is your app's heartbeat.

### 7. The Dev Workflow (`package.json` scripts)

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "tsx watch src/server/index.ts",
    "dev:client": "vite",
    "build": "tsc && vite build",
    "start": "node dist/server/index.js"
  }
}
```

- **`npm run dev`** — starts both servers simultaneously. `tsx watch` auto-restarts Express on file changes. Vite hot-reloads React in the browser.
- **`npm run build`** — TypeScript compiles server code, Vite bundles client code
- **`npm start`** — what Docker runs in production

## Deployment: Push to GitHub, It's Live

1. Coolify watches the GitHub repo
2. On push to `main`, Coolify pulls the code
3. Runs `docker compose build` (uses the Dockerfile)
4. Runs `docker compose up` (starts the container)
5. Waits for the health check to pass
6. Routes traffic to the new container

**That's it.** No CI/CD config files, no GitHub Actions, no deploy scripts. Push code, it's live.

## Real Bugs We Hit (And How We Fixed Them)

### Bug 1: `npm ci` fails — no lockfile
`npm ci` requires `package-lock.json`. We had `package.json` but forgot to run `npm install` to generate the lockfile. **Fix:** Run `npm install` locally, commit `package-lock.json`.

### Bug 2: Port already in use
Port 3000 was taken by another service on the server. Docker can't bind to a port that's already occupied. **Fix:** Changed external port to 3336 (`3336:3000`).

### Bug 3: `Cannot GET /`
Express was serving API routes but not the React frontend. In production, there's no Vite dev server — Express needs to serve the built static files itself. **Fix:** Added `express.static()` pointing at the Vite build output, plus a `*` catch-all for client-side routing.

## Exercises

1. **Add a new API endpoint**: Create `GET /api/status` that returns `{ version: "0.1.0", uptime: process.uptime() }`. Verify it works at `http://your-server:3336/api/status`.

2. **Show the status in React**: Fetch `/api/status` in `App.tsx` and display the version and uptime on the page.

3. **Add a new shared type**: Define a `ServerStatus` type in `shared/types.ts`. Use it in both the server route and the React component.

4. **Break the health check**: Change the health endpoint to return a 500 status. Deploy it. Watch what happens in Coolify/Docker. (Then fix it.)

## What's Next
Lesson 2: Connecting to Jellyfin's REST API — querying your media library, filtering by genre/tags, and displaying the results in React.
