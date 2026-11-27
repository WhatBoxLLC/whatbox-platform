# Member web app (Expo static export). One build serves every site: app.<domain> picks the site.
FROM node:22-bookworm-slim AS build
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_OAUTH_JSON=""
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL EXPO_PUBLIC_OAUTH_JSON=$EXPO_PUBLIC_OAUTH_JSON
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/ai/package.json apps/ai/package.json
COPY packages/core packages/core
COPY apps/member apps/member
RUN test -n "$EXPO_PUBLIC_API_URL" || (echo "EXPO_PUBLIC_API_URL is required" && exit 1)
RUN npm ci -w @whatbox/member -w @whatbox/core --include-workspace-root=false
RUN cd apps/member && npx expo export --platform web --output-dir dist

FROM node:22-bookworm-slim
ENV NODE_ENV=production
COPY --from=build /app/apps/member/dist /srv/www
COPY apps/member/server.mjs /srv/server.mjs
USER node
EXPOSE 8080
CMD ["node", "/srv/server.mjs", "/srv/www", "8080"]
