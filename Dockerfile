# syntax=docker/dockerfile:1

# Build stage runs on the builder's own architecture: its output (JS, CSS) is the same for every target.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

# Production dependencies are installed per target architecture, because SQLite ships a native binary.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace @tms/server

FROM node:22-bookworm-slim
ARG APP_VERSION=""
ARG APP_COMMIT=""
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    APP_VERSION=$APP_VERSION \
    APP_COMMIT=$APP_COMMIT
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY server/package.json server/package.json
COPY server/drizzle server/drizzle
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
# Owned by the unprivileged user so a fresh named volume mounted here is writable.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server/dist/index.js"]
