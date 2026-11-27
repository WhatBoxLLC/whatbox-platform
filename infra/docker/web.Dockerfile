# Public SEO site (Next.js standalone). One container serves every site, chosen by domain.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/member/package.json apps/member/package.json
COPY apps/ai/package.json apps/ai/package.json
COPY packages/core packages/core
COPY apps/web apps/web
RUN npm ci -w @whatbox/web -w @whatbox/core --include-workspace-root=false
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @whatbox/web

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
