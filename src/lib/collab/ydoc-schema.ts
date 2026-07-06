import * as Y from "yjs";
import type {
  FactoryEdge,
  FactoryNode,
  FactoryProject,
  FactoryStorage,
  Recipe,
} from "@/lib/model/types";
import { PROJECT_SCHEMA_VERSION } from "@/lib/model/types";

// A collaborative FactoryProject is stored as a small set of keyed Y.Maps so that
// non-overlapping edits (two people touching different nodes) merge cleanly, while a
// conflicting edit on the same record resolves last-write-wins on that record.
//
// Values are plain JSON snapshots of each record. We intentionally keep per-record
// granularity (a whole node/edge/storage/recipe is one map entry) rather than
// per-field: it is dramatically simpler than nesting a Y.Map per record and is more
// than enough for a two-person session.
//
// `recipes` is synced too, so the document is self-contained: a peer can render a
// remotely added node without needing the same dataset loaded locally.

export const NODES_KEY = "nodes";
export const EDGES_KEY = "edges";
export const STORAGES_KEY = "storages";
export const RECIPES_KEY = "recipes";
export const META_KEY = "meta";

// Project-level scalar fields that are not part of the keyed collections. These change
// rarely and are stored individually in the `meta` map (last-write-wins per field).
type ProjectMetaKey =
  | "id"
  | "name"
  | "targetRate"
  | "fuelProfiles"
  | "selectedFuelProfileId"
  | "notes"
  | "metadata";

const META_KEYS: readonly ProjectMetaKey[] = [
  "id",
  "name",
  "targetRate",
  "fuelProfiles",
  "selectedFuelProfileId",
  "notes",
  "metadata",
];

export interface ProjectCollections {
  meta: Y.Map<unknown>;
  nodes: Y.Map<FactoryNode>;
  edges: Y.Map<FactoryEdge>;
  storages: Y.Map<FactoryStorage>;
  recipes: Y.Map<Recipe>;
}

export function getProjectCollections(doc: Y.Doc): ProjectCollections {
  return {
    meta: doc.getMap<unknown>(META_KEY),
    nodes: doc.getMap<FactoryNode>(NODES_KEY),
    edges: doc.getMap<FactoryEdge>(EDGES_KEY),
    storages: doc.getMap<FactoryStorage>(STORAGES_KEY),
    recipes: doc.getMap<Recipe>(RECIPES_KEY),
  };
}

// A document is considered uninitialized until someone seeds project metadata into it.
export function isDocumentSeeded(doc: Y.Doc): boolean {
  return doc.getMap<unknown>(META_KEY).has("id");
}

// Fill an empty document with a full project snapshot. Runs in a single transaction so
// remote peers observe one atomic seed rather than a stream of inserts.
export function seedDocument(doc: Y.Doc, project: FactoryProject, origin?: unknown): void {
  Y.transact(
    doc,
    () => {
      const collections = getProjectCollections(doc);
      writeMeta(collections.meta, project);
      replaceCollection(collections.nodes, project.nodes, (node) => node.id);
      replaceCollection(collections.edges, project.edges, (edge) => edge.id);
      replaceCollection(collections.storages, project.storages ?? [], (storage) => storage.id);
      replaceCollection(collections.recipes, project.recipes, (recipe) => recipe.id);
    },
    origin,
  );
}

// Reconstruct a FactoryProject from the document. `recipes` and every collection come
// straight from the document, so the result is complete without touching the dataset.
export function readProject(doc: Y.Doc): FactoryProject {
  const collections = getProjectCollections(doc);
  const meta = collections.meta;

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: (meta.get("id") as string | undefined) ?? crypto.randomUUID(),
    name: (meta.get("name") as string | undefined) ?? "Shared plan",
    targetRate: meta.get("targetRate") as FactoryProject["targetRate"],
    recipes: [...collections.recipes.values()],
    nodes: [...collections.nodes.values()],
    storages: [...collections.storages.values()],
    edges: [...collections.edges.values()],
    fuelProfiles: (meta.get("fuelProfiles") as FactoryProject["fuelProfiles"]) ?? [],
    selectedFuelProfileId: meta.get("selectedFuelProfileId") as string | undefined,
    notes: meta.get("notes") as string | undefined,
    metadata: meta.get("metadata") as FactoryProject["metadata"],
  };
}

// Push the difference between two local project states into the document. Only changed
// records are written, so a node drag does not rewrite the whole graph.
export function applyProjectDiff(
  doc: Y.Doc,
  previous: FactoryProject | undefined,
  next: FactoryProject,
  origin?: unknown,
): void {
  Y.transact(
    doc,
    () => {
      const collections = getProjectCollections(doc);
      writeMetaDiff(collections.meta, previous, next);
      diffCollection(collections.nodes, previous?.nodes ?? [], next.nodes, (node) => node.id);
      diffCollection(collections.edges, previous?.edges ?? [], next.edges, (edge) => edge.id);
      diffCollection(
        collections.storages,
        previous?.storages ?? [],
        next.storages ?? [],
        (storage) => storage.id,
      );
      diffCollection(
        collections.recipes,
        previous?.recipes ?? [],
        next.recipes,
        (recipe) => recipe.id,
      );
    },
    origin,
  );
}

function writeMeta(meta: Y.Map<unknown>, project: FactoryProject): void {
  for (const key of META_KEYS) {
    const value = project[key];
    if (value === undefined) {
      meta.delete(key);
    } else {
      meta.set(key, clone(value));
    }
  }
}

function writeMetaDiff(
  meta: Y.Map<unknown>,
  previous: FactoryProject | undefined,
  next: FactoryProject,
): void {
  for (const key of META_KEYS) {
    const nextValue = next[key];
    const prevValue = previous?.[key];
    if (equal(prevValue, nextValue)) {
      continue;
    }
    if (nextValue === undefined) {
      meta.delete(key);
    } else {
      meta.set(key, clone(nextValue));
    }
  }
}

function replaceCollection<T>(map: Y.Map<T>, items: T[], getId: (item: T) => string): void {
  map.clear();
  for (const item of items) {
    map.set(getId(item), clone(item));
  }
}

function diffCollection<T>(
  map: Y.Map<T>,
  previous: T[],
  next: T[],
  getId: (item: T) => string,
): void {
  const nextById = new Map(next.map((item) => [getId(item), item] as const));
  const previousById = new Map(previous.map((item) => [getId(item), item] as const));

  for (const [id, item] of nextById) {
    const prior = previousById.get(id);
    if (!prior || !equal(prior, item)) {
      map.set(id, clone(item));
    }
  }

  for (const id of previousById.keys()) {
    if (!nextById.has(id)) {
      map.delete(id);
    }
  }
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
