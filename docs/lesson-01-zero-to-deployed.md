# Lesson 1: Zero to Deployed — React + Express + Docker + Coolify

## What You'll Learn
By the end of this lesson you'll have a full-stack TypeScript app (React frontend + Express backend) running in production via Docker and Coolify. No localhost-only demos — this deploys to a real server from the first commit.

You'll also learn what goes wrong. We're going to hit real bugs — lockfile mismatches, port conflicts, missing static files, file naming gotchas — and fix every one. That's the actual skill: not writing perfect code, but knowing what to do when things break.

## The Project: Virtual TV for Jellyfin
We're building a sidecar app that creates virtual "live TV" channels from your Jellyfin media library. Think Cartoon Network, but it's your anime collection on shuffle, appearing in Jellyfin's TV guide.

But this lesson isn't about the TV features yet. It's about the **foundation** — the skeleton that every full-stack project needs, and the deployment pipeline that means every commit you make is live within minutes. Get this right once, and every feature you build from here just works.

## Prerequisites

Before you start, you need:

| Tool | Why | How to check |
|------|-----|--------------|
| **Node.js 22+** | Runtime for the server and build tools | `node --version` |
| **npm** | Package manager (comes with Node) | `npm --version` |
| **Git** | Version control | `git --version` |
| **GitHub account** | Where the code lives, Coolify pulls from here | You know if you have one |
| **Docker** | Runs the app in a container | `docker --version` |
| **A server with Coolify** | Deploys the app. Can be a VPS, home server, anything with Docker. | Open your Coolify dashboard |
| **Jellyfin** (optional for now) | The media server we'll connect to in Lesson 2 | Not needed yet |

If you don't have Coolify, you can still follow along — the app runs locally with `npm run dev` and you can deploy with `docker compose up` on any machine with Docker.

## Why This Stack?

| Choice | Why | What it replaces |
|--------|-----|-----------------|
| **React** | You're here to learn React. It's the frontend. | Plain HTML/JS |
| **Express** | Minimal, zero-magic Node.js server. You see every line that runs. | Next.js, Fastify (too much abstraction for learning) |
| **TypeScript** | Shared types between frontend and backend. Catch bugs before runtime. | JavaScript + hope |
| **Vite** | Fast dev server with hot reload. Proxies API calls to Express in dev. | Create React App (deprecated), Webpack (slow) |
| **Docker** | Same environment locally and in production. No "works on my machine." | Manual server setup, `npm start` over SSH |
| **Coolify** | Self-hosted PaaS. Push to GitHub, it builds and deploys. You own it. | Vercel, Heroku (vendor lock-in, costs scale) |

## Project Structure

```
jellyfin-virtual-tv/
  docker-compose.yaml      # What Coolify reads to deploy
  Dockerfile               # How the app is built and run
  .dockerignore             # Files Docker should skip (like .gitignore for Docker)
  package.json             # Dependencies + scripts
  package-lock.json        # Exact dependency versions (auto-generated)
  tsconfig.json            # TypeScript compiler config
  vite.config.ts           # Vite dev server + build config
  index.html               # HTML shell — Vite's entry point
  .env.example             # Environment variables template
  .gitignore               # Files Git should skip
  src/
    server/
      index.ts             # Express app — the backend
      routes/
        channels.ts        # Channel CRUD API
        iptv.ts            # M3U/XMLTV/stream endpoints (Lesson 3+)
        jellyfin.ts        # Jellyfin API proxy (Lesson 2)
    client/
      main.tsx             # React bootstrap — mounts App into the DOM
      App.tsx              # Root React component
    shared/
      types.ts             # TypeScript types shared by both sides
```

### Why This Layout Matters
- **`src/server/` and `src/client/` are siblings** — they share `src/shared/types.ts`. One type definition, used by both sides. Change it once, both sides update.
- **One `package.json`** for the whole project. Monorepo tooling (Turborepo, Nx, pnpm workspaces) is overkill for this size. We'll split if we outgrow it, not before.
- **Two build outputs**: Vite builds the client to `dist/client/`, TypeScript compiles the server to `dist/server/`. In production, Express serves the built React files as static assets from `dist/client/`.
- **Routes are separated by concern** — `channels.ts` handles channel CRUD, `iptv.ts` handles streaming protocols, `jellyfin.ts` proxies the media server. Each file does one thing.

## Step by Step

### 1. Create the project

```bash
mkdir jellyfin-virtual-tv && cd jellyfin-virtual-tv
git init
```

Create `package.json`:

```json
{
  "name": "jellyfin-virtual-tv",
  "version": "0.1.0",
  "description": "Virtual live TV channels from your Jellyfin media library",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "tsx watch src/server/index.ts",
    "dev:client": "vite",
    "build": "tsc && vite build",
    "start": "node dist/server/index.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "fast-xml-parser": "^4.5.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/cors": "^2.8.0",
    "@types/express": "^4.17.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "concurrently": "^9.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

**What's in here and why:**

**Dependencies** (ship to production):
- `express` — the web server
- `cors` — allows the React dev server (port 5173) to talk to Express (port 3000) during development
- `better-sqlite3` — embedded database, no separate server needed (Lesson 2+)
- `fast-xml-parser` — we'll generate XMLTV (TV guide format) later

**DevDependencies** (build tools only, not in production):
- `typescript` + `@types/*` — type checking and editor autocomplete
- `vite` + `@vitejs/plugin-react` — dev server and production bundler for React
- `react` + `react-dom` — the frontend framework (devDependency because Vite bundles it into the output — the raw npm package isn't needed at runtime)
- `tsx` — runs TypeScript directly without compiling first (for the dev server)
- `concurrently` — runs Express and Vite side by side with one command

**`"type": "module"`** — tells Node.js to use ESM imports (`import/export`) instead of CommonJS (`require/module.exports`). This matches what TypeScript and Vite output.

Now install:

```bash
npm install
```

This creates `node_modules/` (the actual packages) and `package-lock.json` (the exact versions installed). **Commit `package-lock.json`** — it ensures everyone (and Docker) gets identical dependency versions.

### 2. TypeScript Config (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**What each option does:**

| Option | What it means |
|--------|--------------|
| `target: "ES2022"` | Compile to modern JavaScript. Node 22 supports everything in ES2022 natively. |
| `module: "ESNext"` | Output `import/export` syntax (not `require`). Matches our `"type": "module"`. |
| `moduleResolution: "bundler"` | Resolve imports the way Vite does. Lets you import `.js` extensions for compiled `.ts` files. |
| `jsx: "react-jsx"` | Transform JSX using React 17+ automatic runtime. No need for `import React` in every file. |
| `strict: true` | Enable all strict type checks. Catches more bugs. Worth the occasional annoyance. |
| `esModuleInterop: true` | Makes `import express from "express"` work (instead of `import * as express`). |
| `skipLibCheck: true` | Don't type-check files inside `node_modules`. Faster builds, avoids conflicts between library types. |
| `outDir: "dist"` | Compiled JavaScript goes to `dist/`. `src/server/index.ts` becomes `dist/server/index.js`. |
| `rootDir: "src"` | The folder structure inside `src/` is preserved in `dist/`. |
| `paths: { "@shared/*" }` | Lets you write `import { Channel } from "@shared/types"` instead of relative paths. Optional but clean. |

**`include` and `exclude`**: Only compile files in `src/`. Don't touch `node_modules` or previous build output.

### 3. The HTML Shell (`index.html`)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Virtual TV</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>
```

**This is Vite's entry point, not React's.** Here's the chain:

1. Vite serves `index.html`
2. The `<script>` tag loads `main.tsx` (Vite compiles TypeScript/JSX on the fly in dev)
3. `main.tsx` mounts the React app into `<div id="root">`
4. React takes over from there

**`type="module"`** on the script tag is required — it tells the browser to treat the file as an ES module (with `import/export`), not a classic script.

**`<div id="root">`** is the mount point. React doesn't replace the whole page — it renders everything *inside* this div. The HTML file is the shell; React fills it in.

**Why is `index.html` at the project root, not in `src/`?** Vite convention. Vite looks for `index.html` in the project root by default. You can change this, but there's no reason to fight the convention.

### 4. The React Bootstrap (`src/client/main.tsx`)

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**This file does one thing: connect React to the DOM.** You write it once and almost never touch it again.

- **`createRoot`** — React 18's way of mounting. Replaces the old `ReactDOM.render()`.
- **`document.getElementById("root")!`** — finds the `<div id="root">` from `index.html`. The `!` (non-null assertion) tells TypeScript "trust me, this element exists."
- **`<StrictMode>`** — development-only wrapper that warns you about common mistakes (deprecated APIs, unsafe side effects). Does nothing in production. Leave it on.
- **`<App />`** — your actual application. Everything visible starts here.

### 5. The React App (`src/client/App.tsx`)

```tsx
import { useState, useEffect } from "react";
import type { Channel } from "../shared/types";

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((data) => setChannels(data.channels))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Virtual TV</h1>
      <p>Configure your virtual live TV channels for Jellyfin.</p>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

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
```

**Key concepts:**

- **`useState<Channel[]>([])`** — a state variable that holds an array of channels. When `setChannels` is called, React re-renders the component with the new data. The `<Channel[]>` is a TypeScript generic — it tells the compiler what type of data this state holds.

- **`useEffect(() => { ... }, [])`** — runs once when the component mounts (the `[]` means "no dependencies, only run once"). This is where you fetch data. Without `useEffect`, the fetch would run on *every* render, creating an infinite loop.

- **`fetch("/api/channels")`** — no `http://localhost:3000` prefix. In dev, Vite proxies this to Express (see the Vite config below). In production, it's the same origin because Express serves both the API and the static files. This is intentional — your React code never needs to know where the API lives.

- **Error handling with `.catch()`** — if the API is down or returns an error, we catch it and show it to the user instead of silently failing. The `if (!r.ok)` check catches HTTP errors (404, 500) that `fetch` doesn't treat as exceptions.

- **Shared types** — `Channel` is imported from `../shared/types`. Same type definition the server uses. If you add a field to `Channel`, TypeScript tells you everywhere that needs updating — on both sides. This is the payoff of a shared `types.ts`.

### 6. Shared Types (`src/shared/types.ts`)

```typescript
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
```

**Why this matters:** The server returns `Channel` objects. The client expects `Channel` objects. They're the same type. This is the single biggest advantage of TypeScript in a full-stack project — the contract between frontend and backend is enforced by the compiler, not by "I hope the JSON matches what I expect."

We also define `ScheduleSlot` and `JellyfinItem` here for future lessons. They're not used yet, but you can see where this is going — every piece of data that crosses the client/server boundary has a shared type.

**Notice `JellyfinItem` uses `PascalCase` (`Id`, `Name`, `RunTimeTicks`)** — that's because Jellyfin's API returns JSON with PascalCase keys (it's a .NET server). We match their format exactly so we don't need a translation layer.

### 7. The Express Server (`src/server/index.ts`)

```typescript
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { jellyfinRouter } from "./routes/jellyfin.js";
import { iptvRouter } from "./routes/iptv.js";
import { channelRouter } from "./routes/channels.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(cors());
app.use(express.json());

// Health check — Docker and Coolify use this to know the app is alive
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// API routes
app.use("/api/jellyfin", jellyfinRouter);
app.use("/api/channels", channelRouter);

// IPTV endpoints (M3U + XMLTV + streams)
app.use("/iptv", iptvRouter);

// Serve React frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../client")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Virtual TV server running on port ${PORT}`);
});
```

**Key concepts:**

- **Health check endpoint** (`/health`): Not optional. Docker checks this URL every 30 seconds. If it fails 3 times, the container is restarted automatically. This is how production apps stay alive without someone watching them. Every real app has one.

- **Route ordering matters**: Express matches top-to-bottom. The order is:
  1. `/health` — health check (first, so it's always fast)
  2. `/api/*` — your API routes
  3. `/iptv/*` — streaming protocol routes
  4. `express.static(...)` — serves built React files (JS, CSS, images)
  5. `*` catch-all — sends `index.html` for any unknown route

  The `*` catch-all is critical. Without it, navigating directly to `/channels/5` in the browser returns a 404 because there's no file at that path. The catch-all sends `index.html` for *every* unmatched route, and then React Router (client-side) reads the URL and renders the right component. This pattern is called **client-side routing fallback**.

- **Import paths end in `.js`** (`"./routes/jellyfin.js"`): Even though the source file is `jellyfin.ts`, the import uses `.js`. TypeScript compiles `.ts` to `.js`, and at runtime Node.js looks for the `.js` file. This is a common ESM gotcha — you import the *compiled* extension, not the *source* extension.

- **`fileURLToPath(import.meta.url)` workaround**: ESM modules don't have `__dirname` (that's a CommonJS thing). This two-line pattern is the standard replacement. `import.meta.url` gives you the file's URL (`file:///app/dist/server/index.js`), and `fileURLToPath` converts it to a regular path (`/app/dist/server/index.js`). Then `path.dirname()` gives you the directory.

- **`0.0.0.0`**: Listen on all network interfaces, not just `localhost`. Required inside Docker — the container has its own network namespace, and `localhost` inside the container is not the same as `localhost` on the host. Without `0.0.0.0`, the app runs but nobody can reach it.

### 8. The Route Files

Each route file is a mini Express app (a `Router`) that handles one area:

**`src/server/routes/channels.ts`** — Channel CRUD:
```typescript
import { Router } from "express";

export const channelRouter = Router();

channelRouter.get("/", async (_req, res) => {
  // TODO: list channels from SQLite
  res.json({ channels: [] });
});

channelRouter.post("/", async (req, res) => {
  // TODO: create channel
  res.json({ channel: req.body });
});

channelRouter.put("/:id", async (req, res) => {
  // TODO: update channel
  res.json({ channel: { id: req.params.id, ...req.body } });
});

channelRouter.delete("/:id", async (req, res) => {
  // TODO: delete channel
  res.json({ deleted: req.params.id });
});
```

**`src/server/routes/iptv.ts`** — IPTV protocol endpoints:
```typescript
import { Router } from "express";

export const iptvRouter = Router();

// M3U playlist — Jellyfin adds this as an IPTV tuner
iptvRouter.get("/channels.m3u", async (_req, res) => {
  res.setHeader("Content-Type", "audio/x-mpegurl");
  res.send("#EXTM3U\n");
});

// XMLTV EPG — Jellyfin adds this as a guide provider
iptvRouter.get("/epg.xml", async (_req, res) => {
  res.setHeader("Content-Type", "application/xml");
  const xml = '<?xml version="1.0" encoding="utf-8"?>\n<tv></tv>';
  res.send(xml);
});

// HLS stream per channel — Jellyfin hits this when a user tunes in
iptvRouter.get("/stream/:channelId", async (req, res) => {
  res.status(501).json({ error: "streaming not yet implemented" });
});
```

**`src/server/routes/jellyfin.ts`** — Jellyfin API proxy:
```typescript
import { Router } from "express";

export const jellyfinRouter = Router();

jellyfinRouter.get("/libraries", async (_req, res) => {
  res.json({ libraries: [] });
});

jellyfinRouter.get("/items", async (req, res) => {
  res.json({ items: [] });
});
```

These are all stubs. They return empty data. The point is the **structure** — when we implement real functionality in later lessons, the routing, file organization, and API shape are already in place. You're not refactoring plumbing, you're filling in logic.

**Why separate files?** When `channels.ts` grows to 200 lines of database queries and validation, you'll be glad it's not tangled up with the IPTV streaming code. Separation by concern pays off fast.

### 9. The Bridge: Vite Config (`vite.config.ts`)

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

In development, you have two servers running:
- **Vite** on port 5173 — serves your React code with hot reload
- **Express** on port 3000 — serves your API

When your React code calls `fetch("/api/channels")`, the browser sends it to port 5173 (Vite). Without the proxy, Vite would say "I don't have a route for `/api/channels`" and return a 404.

The `proxy` config intercepts any request starting with `/api` or `/iptv` and forwards it to Express on port 3000. Your React code doesn't know or care — it just fetches `/api/channels` and gets data back.

**In production, there's only one server** (Express), serving both the API and the built React files. No proxy needed. The same `fetch("/api/channels")` call works in both environments because of this setup.

**`outDir: "dist/client"`** — Vite builds the React app into `dist/client/`. TypeScript compiles the server into `dist/server/`. They're siblings in `dist/`, and the Express server knows to look at `../client` relative to its own location.

### 10. The Dockerfile (Multi-Stage Build)

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

Think of it like cooking in a professional kitchen vs. serving at the table. Stage 1 is the kitchen — all the tools, raw ingredients, mess. Stage 2 is the plate — just the finished dish.

- **Stage 1 (builder)**: Has the full Node.js SDK, TypeScript, Vite, all devDependencies. It compiles everything (`npm run build`), then **gets thrown away**.
- **Stage 2 (runtime)**: Starts from a fresh `node:22-slim` image. Copies only what's needed to *run* the app: `dist/` (compiled code), `node_modules/` (runtime dependencies), and `package.json`. Also installs `ffmpeg` (we'll need it for streaming in Lesson 3+) and `curl` (for the health check).

The result is a smaller, cleaner image. No TypeScript compiler, no Vite, no `src/` directory in production.

**The Docker layer caching trick:**

```dockerfile
COPY package*.json ./    # Step A: copy dependency manifest
RUN npm ci               # Step B: install dependencies
COPY . .                 # Step C: copy source code
RUN npm run build        # Step D: build the app
```

Docker caches each step. If a step's inputs haven't changed, Docker skips it and uses the cached result. By copying `package.json` *before* the source code:
- Change a `.ts` file? Steps A and B are cached (dependencies didn't change). Docker skips the slow `npm ci` and only re-runs the build. **Saves minutes per deploy.**
- Change `package.json`? Steps A through D all re-run.

This ordering is deliberate. Dependencies change rarely, source code changes constantly. Structure your Dockerfile to cache the slow, stable steps first.

**`npm ci` vs `npm install`:**
- `npm install` reads `package.json`, resolves versions, and may update `package-lock.json`
- `npm ci` reads `package-lock.json` exclusively, installs exact versions, and fails if the lockfile is missing or inconsistent

In Docker, always use `npm ci`. You want deterministic, reproducible builds. The same lockfile should produce the same `node_modules/` on every machine, every time.

### 11. The `.dockerignore`

```
node_modules
dist
.git
.env
.env.local
*.db
*.sqlite
test-media
docs
```

**This is `.gitignore` for Docker.** When you run `docker build`, Docker sends everything in the project directory to the build daemon as "context." Without a `.dockerignore`, that includes `node_modules/` (hundreds of MB), `.git/` (all your history), and anything else lying around.

The `.dockerignore` tells Docker to skip these. Benefits:
- **Faster builds** — less data to send to the daemon
- **Smaller images** — nothing unwanted sneaks into the build
- **Security** — `.env` files (with API keys) don't end up in the image
- **Correctness** — the build installs its *own* `node_modules` via `npm ci`, so your local `node_modules/` would just be dead weight (or worse, a different platform's native binaries)

### 12. Docker Compose (`docker-compose.yaml`)

```yaml
services:
  virtual-tv:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3336:3000"
    environment:
      - JELLYFIN_URL=${JELLYFIN_URL:-http://your-jellyfin-server:8096}
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

- **`ports: "3336:3000"`** — maps port 3336 on the host to port 3000 inside the container. The app listens on 3000 internally; you access it at `http://your-server:3336`. Pick any free external port. We chose 3336 because 3000 was already taken on our server.

- **`${JELLYFIN_URL:-http://your-jellyfin-server:8096}`** — environment variable with a default value. The `:-` syntax means "use this default if the variable isn't set." In Coolify, you set `JELLYFIN_URL` in the environment variables UI. Replace `your-jellyfin-server` with your actual Jellyfin server address.

- **`restart: unless-stopped`** — if the container crashes, Docker restarts it automatically. Also restarts it after a server reboot. Only stops if you explicitly run `docker compose stop`. This is basic production resilience.

- **`healthcheck`** — Docker pings `http://localhost:3000/health` every 30 seconds. If it fails 3 times in a row (timeout of 10 seconds each), Docker marks the container as unhealthy and restarts it. This is your app's heartbeat — if the Express process hangs, leaks memory, or deadlocks, the health check catches it.

- **Why `.yaml` not `.yml`?** Coolify looks for `docker-compose.yaml` by default. Both extensions work for Docker itself, but Coolify is picky. Use `.yaml` to avoid a confusing "cannot find docker-compose" error.

### 13. Dev Workflow Scripts (`package.json`)

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

**The development loop:**
- **`npm run dev`** — starts both servers simultaneously with `concurrently`:
  - `tsx watch` runs your Express server and auto-restarts it when you change a `.ts` file
  - `vite` runs the React dev server with hot module replacement (changes appear in the browser instantly, no refresh)
- You write code, save, and see the result immediately in both frontend and backend

**The production build:**
- **`npm run build`** — two steps chained with `&&`:
  1. `tsc` — TypeScript compiler. Compiles `src/server/` to `dist/server/`. Type-checks everything.
  2. `vite build` — bundles `src/client/` into optimized static files in `dist/client/`
- **`npm start`** — runs the compiled server. This is what the Docker `CMD` executes.

### 14. Environment Variables (`.env.example`)

```
JELLYFIN_URL=http://your-jellyfin-server:8096
JELLYFIN_API_KEY=your-api-key-here
PORT=3000
```

**This file is a template, not the actual config.** It's committed to git so new developers (and your future self) know what variables the app needs. The actual `.env` file is in `.gitignore` — it contains real secrets and should never be committed.

To use locally:
```bash
cp .env.example .env
# Edit .env with your actual values
```

In Coolify, you set these in the service's "Environment Variables" panel. No `.env` file needed on the server — Coolify injects them into the container at runtime.

## Running Locally

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/jellyfin-virtual-tv.git
cd jellyfin-virtual-tv
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Jellyfin URL and API key (optional for now)

# Start development
npm run dev
```

This starts:
- Express API at `http://localhost:3000`
- React dev server at `http://localhost:5173` (open this in your browser)

The React dev server proxies `/api/*` to Express. You work in the browser at port 5173 and both servers stay in sync.

## Deploying to Coolify

### First-Time Setup

1. **Create a GitHub repo** and push your code
2. In Coolify, click **"Add Resource"** > **"Application"**
3. Select your **GitHub** integration and pick the repo
4. Set **Build Pack** to **"Docker Compose"**
5. Coolify finds `docker-compose.yaml` automatically
6. Go to **"Environment Variables"** and add:
   - `JELLYFIN_URL` = `http://your-jellyfin-ip:8096`
   - `JELLYFIN_API_KEY` = your Jellyfin API key (create one in Jellyfin Dashboard > API Keys)
7. Under **"Network"**, set **Ports Exposes** to `3000` (the internal port)
8. Click **Deploy**

### Every Deploy After That

Push to `main`. Coolify detects the change, rebuilds, and deploys. That's it.

What happens under the hood:
1. Coolify pulls the latest commit
2. Runs `docker compose build` (uses the Dockerfile)
3. Runs `docker compose up` (starts the new container)
4. Waits for the health check to pass
5. Routes traffic to the new container
6. Stops the old container

No CI/CD config files, no GitHub Actions, no deploy scripts.

## Real Bugs We Hit (And How We Fixed Them)

These aren't hypothetical. Every one of these happened during the first deploy of this project. Deployment bugs are a rite of passage — here's how to read them.

### Bug 1: `npm ci` fails — "This command requires an existing lockfile"

**What happened:** The Dockerfile runs `npm ci`, but we only had `package.json` in the repo. No `package-lock.json`.

**Why:** `npm ci` is strict by design — it requires `package-lock.json` and installs exactly what's in it. This is what you want in Docker (deterministic builds), but it means you can't skip the lockfile.

**The fix:** Run `npm install` locally to generate `package-lock.json`, then commit it:
```bash
npm install
git add package-lock.json
git commit -m "Add package-lock.json"
```

**The lesson:** Always commit `package-lock.json`. It's not generated build output — it's the source of truth for your dependency versions.

### Bug 2: Coolify can't find `docker-compose`

**What happened:** Coolify reported "cannot find docker compose at /docker-compose.yaml" but the file existed.

**Why:** The file was named `docker-compose.yml` (with `.yml`). Coolify looks for `docker-compose.yaml` (with `.yaml`) by default.

**The fix:** Rename the file:
```bash
mv docker-compose.yml docker-compose.yaml
```

**The lesson:** File extensions matter. Both `.yml` and `.yaml` are valid YAML, but tools have preferences. Coolify wants `.yaml`. Check the conventions of your tools before assuming.

### Bug 3: "Port is already allocated"

**What happened:** Docker error: `Bind for 0.0.0.0:3000 failed: port is already allocated`

**Why:** Another service on the server was already using port 3000. Docker can't bind two things to the same port.

**The fix:** Change the external port mapping in `docker-compose.yaml`:
```yaml
ports:
  - "3336:3000"   # was "3000:3000"
```

The app still listens on 3000 *inside* the container. Only the external mapping changes.

**The lesson:** The `host:container` port syntax means you can pick any free host port. When you see `3336:3000`, read it as "port 3336 on the server forwards to port 3000 in the container." Always check what's already running: `ss -tlnp | grep 3000`.

### Bug 4: `Cannot GET /`

**What happened:** The app deployed, the health check passed, but opening it in a browser showed "Cannot GET /".

**Why:** Express was serving the API routes (`/api/*`, `/iptv/*`) but had no handler for `/`. In development, Vite serves the React app. In production, there's no Vite — Express needs to serve the built React files itself.

**The fix:** Add static file serving and a catch-all route to `src/server/index.ts`:
```typescript
// Serve React frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../client")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});
```

**The lesson:** Development and production are different environments. In dev, Vite handles the frontend. In production, your server handles everything. This is the most common "it works locally but not deployed" bug in React + Express apps. The fix is always: serve the built static files from Express.

## Exercises

1. **Add a new API endpoint**: Create `GET /api/status` that returns `{ version: "0.1.0", uptime: process.uptime() }`. Create a new file `src/server/routes/status.ts`, import it in `index.ts`, and mount it at `/api/status`. Verify it works at `http://your-server:3336/api/status`.

2. **Show the status in React**: Create a new component `src/client/Status.tsx` that fetches `/api/status` and displays the version and uptime. Import and render it in `App.tsx`. Add loading and error states.

3. **Add a new shared type**: Define a `ServerStatus` interface in `shared/types.ts` with `version: string` and `uptimeSeconds: number`. Use it in both the server route (as the response type) and the React component (as the state type). Notice how TypeScript connects both sides.

4. **Break the health check on purpose**: Change the `/health` endpoint to return `res.status(500).json({ status: "broken" })`. Deploy it to Coolify. Watch the deployment logs — Coolify will report the container as unhealthy. Check `docker ps` on the server and look at the STATUS column. Then fix it and redeploy.

5. **Read the Docker build logs**: On your next deploy, read the Coolify build logs line by line. Identify which Docker layer was cached (look for "CACHED" in the output) and which was rebuilt. Change only a `.ts` file and deploy again — notice how `npm ci` is cached but the `build` step re-runs.

## Concepts Covered

- Full-stack TypeScript with shared types
- React fundamentals: components, state, effects, data fetching
- Express routing and middleware
- Vite dev server with API proxy
- ESM modules (`import`/`export`, `"type": "module"`)
- Multi-stage Docker builds and layer caching
- Docker Compose for single-service deployment
- Health checks and container lifecycle
- Environment variables and secrets management
- Coolify deployment from GitHub

## What's Next
**Lesson 2: Connecting to Jellyfin** — querying your media library via REST API, filtering by genre/tags/library, and displaying the results in React. The sidecar starts talking to the media server.
