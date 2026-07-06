// Yjs websocket server built on the SAME yjs version as the client (13.x) so document
// updates integrate correctly. The scoped @y/websocket-server pins an incompatible yjs
// fork ("store.getClock is not a function"), which silently breaks document sync while
// leaving awareness working — exactly the "everyone sees their own plan" symptom.
//
// This is the canonical y-websocket server logic (MIT) using yjs + y-protocols + ws,
// with per-room connection logging added.
import http from "node:http";
import WebSocket from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
const messageSync = 0;
const messageAwareness = 1;
const pingTimeout = 30000;

const docs = new Map();

class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map(); // conn -> Set<clientID>
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on("update", ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const controlled = this.conns.get(conn);
        if (controlled !== undefined) {
          added.forEach((id) => controlled.add(id));
          removed.forEach((id) => controlled.delete(id));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, buff));
    });

    this.on("update", (update, _origin, doc) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      doc.conns.forEach((_, conn) => send(doc, conn, message));
    });
  }
}

function getYDoc(docName) {
  let doc = docs.get(docName);
  if (!doc) {
    doc = new WSSharedDoc(docName);
    docs.set(docName, doc);
  }
  return doc;
}

function messageListener(conn, doc, message) {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync:
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case messageAwareness:
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
        break;
    }
  } catch (error) {
    console.error("[collab] message error", error);
  }
}

function send(doc, conn, message) {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, (err) => err != null && closeConn(doc, conn));
  } catch {
    closeConn(doc, conn);
  }
}

function closeConn(doc, conn) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    console.log(`[collab] disconnect  docName="${doc.name}"  peers=${doc.conns.size}`);
    if (doc.conns.size === 0) {
      doc.destroy();
      docs.delete(doc.name);
    }
  }
  conn.close();
}

function setupWSConnection(conn, req) {
  conn.binaryType = "arraybuffer";
  const docName = (req.url || "").slice(1).split("?")[0];
  const doc = getYDoc(docName);
  doc.conns.set(conn, new Set());
  console.log(`[collab] connect     docName="${docName}"  peers=${doc.conns.size}`);

  conn.on("message", (message) => messageListener(conn, doc, new Uint8Array(message)));

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) closeConn(doc, conn);
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, pingTimeout);
  conn.on("close", () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });
  conn.on("pong", () => {
    pongReceived = true;
  });

  // Kick off the sync: send SyncStep1, then current awareness state.
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  send(doc, conn, encoding.toUint8Array(encoder));

  const awarenessStates = doc.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())),
    );
    send(doc, conn, encoding.toUint8Array(awarenessEncoder));
  }
}

const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "1234", 10);
const wss = new WebSocket.Server({ noServer: true });
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("okay");
});
wss.on("connection", setupWSConnection);
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});
server.listen(port, host, () => console.log(`[collab] running at ${host}:${port}`));
