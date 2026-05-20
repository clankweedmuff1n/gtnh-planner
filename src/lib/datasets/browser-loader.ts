"use client";

import { enrichDatasetRecipes } from "./enrich";
import { fetchRecipeDatasetVersion, resolveDatasetUrl } from "./remote";
import type { DatasetVersion, RecipeDataset } from "./types";
import { readCachedRecipeDataset, writeCachedRecipeDataset } from "./browser-cache";

type WorkerResponse =
  | {
      id: number;
      ok: true;
      dataset: RecipeDataset;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

let nextWorkerRequestId = 1;

export async function loadRecipeDatasetVersion(
  manifestUrl: string,
  version: DatasetVersion,
): Promise<RecipeDataset> {
  const cacheKey = getDatasetCacheKey(version);
  const cached = await readCachedRecipeDataset(cacheKey).catch(() => undefined);
  if (cached) {
    return cached;
  }

  const datasetUrl = resolveDatasetUrl(manifestUrl, version.recipeDatasetPath);
  const dataset = await loadDatasetInWorker(datasetUrl, version.id).catch(async () =>
    enrichDatasetRecipes(await fetchRecipeDatasetVersion(manifestUrl, version)),
  );

  await writeCachedRecipeDataset(cacheKey, dataset).catch(() => undefined);
  return dataset;
}

function loadDatasetInWorker(
  datasetUrl: string,
  expectedVersionId: string,
): Promise<RecipeDataset> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new Error("Web Workers are not available."));
      return;
    }

    const id = nextWorkerRequestId;
    nextWorkerRequestId += 1;

    const worker = new Worker(new URL("../../workers/dataset-loader.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) {
        return;
      }

      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.dataset);
      } else {
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Dataset worker failed."));
    };
    worker.postMessage({ id, datasetUrl, expectedVersionId });
  });
}

function getDatasetCacheKey(version: DatasetVersion): string {
  return [
    "v2",
    version.id,
    version.recipeDatasetPath,
    version.checksumSha256,
    version.sourceInfo.gitCommit,
    version.publishedAt,
  ]
    .filter(Boolean)
    .join("|");
}
