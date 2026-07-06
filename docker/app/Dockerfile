# Production image for the GTNH Factory Flow Next.js app.
#
# Build:  docker build -t gtnh-factory-flow-app -f docker/app/Dockerfile .
# NEXT_PUBLIC_* values are baked in at build time, so pass them as build args
# (see docker-compose.yml).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Client-visible env is inlined during `next build`.
ARG NEXT_PUBLIC_GTNH_DATASET_MANIFEST_URL=/datasets/gtnh/datasets.manifest.json
ARG NEXT_PUBLIC_COLLAB_WS_URL=
ARG NEXT_PUBLIC_UMAMI_SCRIPT_URL=
ARG NEXT_PUBLIC_UMAMI_HOST_URL=
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID=
ENV NEXT_PUBLIC_GTNH_DATASET_MANIFEST_URL=$NEXT_PUBLIC_GTNH_DATASET_MANIFEST_URL \
    NEXT_PUBLIC_COLLAB_WS_URL=$NEXT_PUBLIC_COLLAB_WS_URL \
    NEXT_PUBLIC_UMAMI_SCRIPT_URL=$NEXT_PUBLIC_UMAMI_SCRIPT_URL \
    NEXT_PUBLIC_UMAMI_HOST_URL=$NEXT_PUBLIC_UMAMI_HOST_URL \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
# Standalone output ships only the files the server needs.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
