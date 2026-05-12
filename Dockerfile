# Stage 1: Build
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends     ffmpeg     curl     && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Bake the commit SHA and build timestamp into the image so /health can report
# what's running. Pass --build-arg GIT_SHA=$(git rev-parse --short HEAD); on
# Coolify, configure the build arg to use $SOURCE_COMMIT.
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
RUN printf '{"version":"%s","builtAt":"%s"}\n' "$GIT_SHA" "$BUILD_DATE" > /app/version.json

VOLUME ["/app/data"]
ENV DB_PATH=/app/data/virtual-tv.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3   CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/server/index.js"]
