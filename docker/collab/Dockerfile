# Standalone Yjs websocket server for real-time collaboration.
# Self-contained: it only needs yjs + y-protocols + ws, not the app source.
#
# Build:  docker build -t gtnh-factory-flow-collab -f docker/collab/Dockerfile .
# Run:    docker run -p 1234:1234 gtnh-factory-flow-collab
#
# Point the app at it with NEXT_PUBLIC_COLLAB_WS_URL (e.g. wss://your-host/collab
# behind a reverse proxy that upgrades WebSocket connections to this container:1234).
FROM node:22-alpine

WORKDIR /app

# Use the SAME yjs major as the client so document updates integrate correctly.
# (The scoped @y/websocket-server pins an incompatible yjs fork that silently breaks
# document sync — see docker/collab/server.mjs.)
RUN npm install --omit=dev yjs@13.6.31 y-protocols@1.0.7 ws@8 lib0@0.2

# Our server: canonical y-websocket sync logic on the compatible yjs, with room logging.
COPY docker/collab/server.mjs ./server.mjs

# Listen on all interfaces so the container is reachable from the reverse proxy.
ENV HOST=0.0.0.0
ENV PORT=1234
EXPOSE 1234

# Basic liveness: the server answers plain HTTP "okay" on the same port.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null 2>&1 || exit 1

CMD ["node", "server.mjs"]
