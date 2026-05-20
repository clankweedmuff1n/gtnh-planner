import type { Recipe } from "../model/types";

export interface DatasetSourceInfo {
  sourceId: "nesql" | "recex" | "nerd" | "unknown";
  sourceVersion?: string;
  generatedAt: string;
  gitCommit?: string;
  notes?: string;
}

export interface DatasetResource {
  id: string;
  kind: "item" | "fluid";
  displayName: string;
  iconPath?: string;
  modId?: string;
  tooltip?: string[];
  oreDictionary?: string[];
}

export interface DatasetResourceIndexEntry {
  id: string;
  kind: "item" | "fluid";
  displayName?: string;
  iconPath?: string;
  recipeCount: number;
}

export interface DatasetVersion {
  id: string;
  gtnhVersion: string;
  channel: "stable" | "daily" | "experimental";
  publishedAt: string;
  manifestPath: string;
  recipeDatasetPath: string;
  checksumSha256?: string;
  sourceInfo: DatasetSourceInfo;
}

export interface DatasetManifest {
  schemaVersion: 1;
  latestStableVersion?: string;
  latestDailyVersion?: string;
  versions: DatasetVersion[];
}

export interface RecipeDataset {
  schemaVersion: 1;
  datasetVersionId: string;
  gtnhVersion: string;
  sourceInfo: DatasetSourceInfo;
  resources: DatasetResource[];
  resourceIndex?: DatasetResourceIndexEntry[];
  recipes: Recipe[];
  oreDictionary: Record<string, string[]>;
  recipeMaps: string[];
  generatedAt: string;
}
