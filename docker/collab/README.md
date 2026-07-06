# Collaboration server

Standalone Yjs websocket server that powers real-time multi-user editing. It holds
the shared document per room in memory and relays updates between connected clients.

## Run

```bash
# Local (docker compose)
docker compose up -d collab

# Or plain docker
docker build -t gtnh-factory-flow-collab -f docker/collab/Dockerfile .
docker run -p 1234:1234 gtnh-factory-flow-collab

# Or without docker, straight from the repo
npm run collab:server
```

## Wire the app to it

Set the client env var (see `.env.example`):

```
NEXT_PUBLIC_COLLAB_WS_URL=ws://localhost:1234        # local dev
NEXT_PUBLIC_COLLAB_WS_URL=wss://your-host/collab     # production behind TLS
```

When unset, the app hides the Share button and behaves as the single-user local app.

## Production notes

- Put it behind a reverse proxy that upgrades WebSocket connections and terminates TLS,
  forwarding to `collab:1234`. The same proxy already fronting the planner containers
  can add a `/collab` location.
- Rooms live only in memory here; restarting the server drops in-flight sessions.
  Clients rejoin and re-seed from whoever is still connected. Add persistence
  (e.g. LevelDB via `@y/websocket-server` callbacks) only if you need durable rooms.
