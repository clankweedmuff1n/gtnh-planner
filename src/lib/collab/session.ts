import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { FactoryProject } from "@/lib/model/types";
import { useFactoryStore } from "@/store/factory-store";
import {
  applyProjectDiff,
  getProjectCollections,
  isDocumentSeeded,
  readProject,
  seedDocument,
} from "./ydoc-schema";

// Marks transactions that originate from this client's local store, so the document
// observer can ignore its own writes and avoid an echo loop.
const LOCAL_ORIGIN = Symbol("factoryflow-local");

export type CollabStatus = "connecting" | "connected" | "disconnected";

export interface CollabPeer {
  clientId: number;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
  isSelf: boolean;
}

export interface CollabUser {
  name: string;
  color: string;
}

export interface StartCollabOptions {
  roomId: string;
  serverUrl: string;
  user: CollabUser;
}

export interface CollabSession {
  readonly roomId: string;
  readonly doc: Y.Doc;
  readonly provider: WebsocketProvider;
  setLocalCursor(cursor: { x: number; y: number } | undefined): void;
  onStatusChange(listener: (status: CollabStatus) => void): () => void;
  onPeersChange(listener: (peers: CollabPeer[]) => void): () => void;
  destroy(): void;
}

export function startCollabSession({ roomId, serverUrl, user }: StartCollabOptions): CollabSession {
  const store = useFactoryStore;
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(serverUrl, roomId, doc);
  const { awareness } = provider;

  // Guards against the outgoing subscription re-broadcasting a project that we just
  // applied from a remote peer.
  let applyingRemote = false;
  // Becomes true after the first sync resolves (we either seeded or adopted). Until
  // then we must not push local edits: doing so with an empty/stale local plan would
  // clobber a peer's state that is still arriving. This is critical for the joining
  // window, whose store also mutates during dataset load before the first pull.
  let ready = false;
  // The last project state we know both sides agree on; diffs are computed against it.
  let lastSynced: FactoryProject | undefined;

  awareness.setLocalStateField("user", { name: user.name, color: user.color });

  function pullFromDocument(): void {
    if (!isDocumentSeeded(doc)) {
      return;
    }
    const project = readProject(doc);
    applyingRemote = true;
    try {
      store.getState().applyRemoteProject(project);
      lastSynced = store.getState().project;
    } finally {
      applyingRemote = false;
    }
  }

  // Outgoing: local store edits -> document.
  const unsubscribeStore = store.subscribe((state, previous) => {
    if (!ready || applyingRemote || state.project === previous.project) {
      return;
    }
    applyProjectDiff(doc, lastSynced ?? previous.project, state.project, LOCAL_ORIGIN);
    lastSynced = state.project;
  });

  // Incoming: document edits from peers -> local store. We rewrite whole records per
  // key, so a shallow observe on each collection is enough (no nested Y types).
  const collections = getProjectCollections(doc);
  const observedMaps = [
    collections.meta,
    collections.nodes,
    collections.edges,
    collections.storages,
    collections.recipes,
  ];
  const handleDocChange = (_event: unknown, transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_ORIGIN) {
      return;
    }
    pullFromDocument();
  };
  for (const map of observedMaps) {
    map.observe(handleDocChange);
  }

  // First sync decides who owns the initial state: adopt an existing room, or seed a
  // fresh one with this client's current plan.
  const handleSynced = (isSynced: boolean) => {
    // Only the first successful sync decides ownership; later reconnects merge via Yjs.
    if (!isSynced || ready) {
      return;
    }
    if (isDocumentSeeded(doc)) {
      pullFromDocument();
    } else {
      const localProject = store.getState().project;
      seedDocument(doc, localProject, LOCAL_ORIGIN);
      lastSynced = localProject;
    }
    ready = true;
  };
  provider.on("sync", handleSynced);

  // The provider begins connecting inside its constructor, so start from "connecting".
  let currentStatus: CollabStatus = "connecting";
  const statusListeners = new Set<(status: CollabStatus) => void>();
  const handleStatus = ({ status }: { status: string }) => {
    currentStatus =
      status === "connected"
        ? "connected"
        : status === "connecting"
          ? "connecting"
          : "disconnected";
    for (const listener of statusListeners) {
      listener(currentStatus);
    }
  };
  provider.on("status", handleStatus);

  const peerListeners = new Set<(peers: CollabPeer[]) => void>();
  const readPeers = (): CollabPeer[] => {
    const peers: CollabPeer[] = [];
    for (const [clientId, rawState] of awareness.getStates()) {
      const stateValue = rawState as {
        user?: { name?: string; color?: string };
        cursor?: { x: number; y: number };
      };
      peers.push({
        clientId,
        name: stateValue.user?.name ?? "Anonymous",
        color: stateValue.user?.color ?? "#888888",
        cursor: stateValue.cursor,
        isSelf: clientId === awareness.clientID,
      });
    }
    return peers;
  };
  const handleAwareness = () => {
    const peers = readPeers();
    for (const listener of peerListeners) {
      listener(peers);
    }
  };
  awareness.on("change", handleAwareness);

  return {
    roomId,
    doc,
    provider,
    setLocalCursor(cursor) {
      awareness.setLocalStateField("cursor", cursor ?? null);
    },
    onStatusChange(listener) {
      statusListeners.add(listener);
      listener(currentStatus);
      return () => statusListeners.delete(listener);
    },
    onPeersChange(listener) {
      peerListeners.add(listener);
      listener(readPeers());
      return () => peerListeners.delete(listener);
    },
    destroy() {
      unsubscribeStore();
      for (const map of observedMaps) {
        map.unobserve(handleDocChange);
      }
      awareness.off("change", handleAwareness);
      provider.off("sync", handleSynced);
      provider.off("status", handleStatus);
      statusListeners.clear();
      peerListeners.clear();
      provider.destroy();
      doc.destroy();
    },
  };
}
