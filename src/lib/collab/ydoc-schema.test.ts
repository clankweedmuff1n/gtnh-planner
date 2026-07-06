import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { PROJECT_SCHEMA_VERSION, type FactoryProject } from "@/lib/model/types";
import { applyProjectDiff, readProject, seedDocument } from "./ydoc-schema";

function baseProject(): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "project-1",
    name: "Shared plan",
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
      makeNode("node-1", "recipe-1", { x: 0, y: 0 }),
      makeNode("node-2", "recipe-1", { x: 100, y: 0 }),
    ],
    edges: [],
    storages: [],
    fuelProfiles: [],
  };
}

function makeNode(id: string, recipeId: string, position: { x: number; y: number }) {
  return {
    id,
    recipeId,
    machineCount: 1,
    parallel: 1,
    overclockTier: "LV",
    enabled: true,
    position,
  } satisfies FactoryProject["nodes"][number];
}

function syncFull(from: Y.Doc, to: Y.Doc) {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from));
}

describe("ydoc-schema", () => {
  it("round-trips a project through the document", () => {
    const project = baseProject();
    const doc = new Y.Doc();
    seedDocument(doc, project);

    const restored = readProject(doc);
    expect(restored.id).toBe(project.id);
    expect(restored.name).toBe(project.name);
    expect(restored.nodes).toHaveLength(2);
    expect(restored.recipes).toHaveLength(1);
    expect(restored.nodes.map((node) => node.id).sort()).toEqual(["node-1", "node-2"]);
  });

  it("merges non-overlapping edits from two peers", () => {
    const project = baseProject();
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    seedDocument(docA, project);
    syncFull(docA, docB);

    // Peer A drags node-1; peer B independently drags node-2.
    const projectA: FactoryProject = {
      ...project,
      nodes: [makeNode("node-1", "recipe-1", { x: 500, y: 500 }), project.nodes[1]!],
    };
    applyProjectDiff(docA, project, projectA);

    const projectB: FactoryProject = {
      ...project,
      nodes: [project.nodes[0]!, makeNode("node-2", "recipe-1", { x: -300, y: 250 })],
    };
    applyProjectDiff(docB, project, projectB);

    // Exchange state both ways.
    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docB, updateA);
    Y.applyUpdate(docA, updateB);

    for (const doc of [docA, docB]) {
      const merged = readProject(doc);
      const node1 = merged.nodes.find((node) => node.id === "node-1");
      const node2 = merged.nodes.find((node) => node.id === "node-2");
      expect(node1?.position).toEqual({ x: 500, y: 500 });
      expect(node2?.position).toEqual({ x: -300, y: 250 });
    }
  });

  it("propagates additions and deletions per record", () => {
    const project = baseProject();
    const doc = new Y.Doc();
    seedDocument(doc, project);

    const withAddedRemoved: FactoryProject = {
      ...project,
      nodes: [project.nodes[0]!, makeNode("node-3", "recipe-1", { x: 10, y: 10 })],
    };
    applyProjectDiff(doc, project, withAddedRemoved);

    const restored = readProject(doc);
    expect(restored.nodes.map((node) => node.id).sort()).toEqual(["node-1", "node-3"]);
  });
});
