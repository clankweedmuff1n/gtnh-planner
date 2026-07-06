import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { PROJECT_SCHEMA_VERSION, type FactoryProject } from "@/lib/model/types";

// In-memory replacement for the websocket transport: providers sharing a room name
// relay Yjs updates to each other, mirroring the real server closely enough to
// exercise the full store <-> session bridge.
vi.mock("y-websocket", () => {
  const rooms = new Map<string, Set<Y.Doc>>();
  (globalThis as unknown as { __collabRooms: Map<string, Set<Y.Doc>> }).__collabRooms = rooms;

  class WebsocketProvider {
    doc: Y.Doc;
    awareness = {
      setLocalStateField: () => {},
      getStates: () => new Map(),
      on: () => {},
      off: () => {},
      clientID: Math.floor(Math.random() * 1e9),
    };
    private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    private peers: Set<Y.Doc>;
    private onUpdate: (update: Uint8Array, origin: unknown) => void;

    constructor(_url: string, room: string, doc: Y.Doc) {
      this.doc = doc;
      let peers = rooms.get(room);
      if (!peers) {
        peers = new Set();
        rooms.set(room, peers);
      }
      this.peers = peers;
      for (const peer of peers) {
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer), "__net__");
      }
      peers.add(doc);
      this.onUpdate = (update, origin) => {
        if (origin === "__net__") return;
        for (const peer of peers!) {
          if (peer !== doc) Y.applyUpdate(peer, update, "__net__");
        }
      };
      doc.on("update", this.onUpdate);
      queueMicrotask(() => this.emit("sync", true));
    }

    private emit(event: string, ...args: unknown[]) {
      for (const cb of this.handlers[event] ?? []) cb(...args);
    }
    on(event: string, cb: (...args: unknown[]) => void) {
      (this.handlers[event] ??= []).push(cb);
    }
    off(event: string, cb: (...args: unknown[]) => void) {
      this.handlers[event] = (this.handlers[event] ?? []).filter((fn) => fn !== cb);
    }
    destroy() {
      this.doc.off("update", this.onUpdate);
      this.peers.delete(this.doc);
    }
  }

  return { WebsocketProvider };
});

// Imported after the mock is registered.
const { startCollabSession } = await import("./session");
const { seedDocument } = await import("./ydoc-schema");
const { useFactoryStore } = await import("@/store/factory-store");

const rooms = (globalThis as unknown as { __collabRooms: Map<string, Set<Y.Doc>> }).__collabRooms;

function planWithNodes(id: string): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id,
    name: `Plan ${id}`,
    recipes: [
      {
        id: "recipe-1",
        name: "Alloy Smelter",
        machineType: "alloy_smelter",
        inputs: [],
        outputs: [],
      } as unknown as FactoryProject["recipes"][number],
    ],
    nodes: [
      node("node-1"),
      node("node-2"),
    ],
    edges: [],
    storages: [],
    fuelProfiles: [],
  };
}

function emptyPlan(): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "empty",
    name: "Untitled",
    recipes: [],
    nodes: [],
    edges: [],
    storages: [],
    fuelProfiles: [],
  };
}

function node(id: string) {
  return {
    id,
    recipeId: "recipe-1",
    machineCount: 1,
    parallel: 1,
    overclockTier: "LV",
    enabled: true,
    position: { x: 0, y: 0 },
  } satisfies FactoryProject["nodes"][number];
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

beforeEach(() => {
  rooms.clear();
  useFactoryStore.getState().setProject(emptyPlan());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collab session bridge", () => {
  it("adopts an existing room's plan into the local store", async () => {
    // A peer (the sharing window) is already present with a two-node plan.
    const peerDoc = new Y.Doc();
    seedDocument(peerDoc, planWithNodes("shared"));
    rooms.set("room-A", new Set([peerDoc]));

    // The joining window starts empty, then opens the room.
    expect(useFactoryStore.getState().project.nodes).toHaveLength(0);
    const session = startCollabSession({
      roomId: "room-A",
      serverUrl: "ws://mock",
      user: { name: "Tester", color: "#fff" },
    });

    await flush();

    expect(useFactoryStore.getState().project.nodes.map((n) => n.id).sort()).toEqual([
      "node-1",
      "node-2",
    ]);
    session.destroy();
  });

  it("does not clobber the shared plan when the joining store mutates before sync", async () => {
    const peerDoc = new Y.Doc();
    seedDocument(peerDoc, planWithNodes("shared"));
    rooms.set("room-B", new Set([peerDoc]));

    const session = startCollabSession({
      roomId: "room-B",
      serverUrl: "ws://mock",
      user: { name: "Tester", color: "#fff" },
    });

    // Simulate a local, pre-sync store mutation (e.g. dataset icon refresh) that must
    // not be pushed and overwrite the peer's still-arriving nodes.
    useFactoryStore.getState().setProject(emptyPlan());

    await flush();

    // The peer's plan survives and is adopted locally.
    expect([...peerDoc.getMap("nodes").keys()].sort()).toEqual(["node-1", "node-2"]);
    expect(useFactoryStore.getState().project.nodes).toHaveLength(2);
    session.destroy();
  });

  it("seeds a fresh room from the local plan for later joiners", async () => {
    useFactoryStore.getState().setProject(planWithNodes("mine"));

    const session = startCollabSession({
      roomId: "room-C",
      serverUrl: "ws://mock",
      user: { name: "Host", color: "#fff" },
    });
    await flush();

    // A second doc joining the same room receives the seeded plan.
    const joinerDoc = new Y.Doc();
    for (const peer of rooms.get("room-C")!) {
      Y.applyUpdate(joinerDoc, Y.encodeStateAsUpdate(peer));
    }
    expect([...joinerDoc.getMap("nodes").keys()].sort()).toEqual(["node-1", "node-2"]);
    session.destroy();
  });
});
