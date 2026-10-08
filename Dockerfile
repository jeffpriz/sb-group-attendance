# syntax=docker/dockerfile:1

# ---- Build stage: install all deps, type-check and build the website ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage: production deps + server code + built website ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATA_DIR=/data
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist

# Default data location. Mount a host folder or file share here, or point
# DATA_DIR somewhere else. The server runs as the non-root `node` user
# (uid/gid 1000), so the mounted folder must be writable by uid 1000.
RUN mkdir -p /data/groups && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# Run the TypeScript server through tsx's loader in a single node process
# so `docker stop` (SIGTERM) reaches the server directly.
CMD ["node", "--import", "tsx", "server/index.ts"]
