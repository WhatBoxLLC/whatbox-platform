# WhatBox API (NestJS on Node, run with tsx). Build from the repo root:
#   docker build -f infra/docker/api.Dockerfile -t whatbox-api .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/member/package.json apps/member/package.json
COPY apps/ai/package.json apps/ai/package.json
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm ci --omit=dev -w @whatbox/api -w @whatbox/core --include-workspace-root=false

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/main.ts"]
