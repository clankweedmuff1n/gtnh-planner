# Standalone Yjs websocket server for real-time collaboration.
# Self-contained: it only needs the y-websocket server package, not the app source.
#
# Build:  docker build -t gtnh-factory-flow-collab -f docker/collab/Dockerfile .
# Run:    docker run -p 1234:1234 gtnh-factory-flow-collab
#
# Point the app at it with NEXT_PUBLIC_COLLAB_WS_URL (e.g. wss://your-host/collab
# behind a reverse proxy that upgrades WebSocket connections to this container:1234).
FROM node:22-alpine

WORKDIR /app

# Pin to the same server version the app is developed against.
RUN npm install --omit=dev @y/websocket-server@0.1.5

# Listen on all interfaces so the container is reachable from the reverse proxy.
ENV HOST=0.0.0.0
ENV PORT=1234
EXPOSE 1234

# Basic liveness: the server answers plain HTTP "okay" on the same port.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null 2>&1 || exit 1

CMD ["npx", "--no-install", "y-websocket-server"]
