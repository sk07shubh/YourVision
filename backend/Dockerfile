FROM node:22-bookworm-slim AS build

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build \
    && mkdir -p dist/src/execution/java \
    && cp src/execution/java/*.java dist/src/execution/java/

FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=10000
ENV HOST=0.0.0.0
ENV MAX_CONCURRENT_EXECUTIONS=2
ENV JSON_BODY_LIMIT=256kb

RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jdk-headless ca-certificates \
    && java --list-modules | grep -q '^jdk.jdi@' \
    && javac -version \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build --chown=node:node /app/backend/dist ./dist

USER node
EXPOSE 10000
CMD ["npm", "start"]
