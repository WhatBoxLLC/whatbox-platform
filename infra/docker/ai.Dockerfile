# WhatBox AI photo check service. Build from the repo root:
#   docker build -f infra/docker/ai.Dockerfile -t whatbox-ai .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/member/package.json apps/member/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/core packages/core
COPY apps/ai apps/ai
RUN npm ci --omit=dev -w @whatbox/ai -w @whatbox/core --include-workspace-root=false

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4100
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/ai
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4100/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/main.ts"]
