import { parseRecipeDatasetJson } from "@/lib/import-export";
import { enrichDatasetRecipes } from "@/lib/datasets/enrich";

type WorkerRequest = {
  id: number;
  datasetUrl: string;
  expectedVersionId: string;
};

type WorkerResponse =
  | {
      id: number;
      ok: true;
      dataset: ReturnType<typeof enrichDatasetRecipes>;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void loadDataset(event.data);
};

async function loadDataset(request: WorkerRequest) {
  try {
    const response = await fetch(request.datasetUrl, {
      cache: "force-cache",
      headers: {
        Accept: "application/json, application/gzip, application/octet-stream",
      },
    });

    if (!response.ok) {
      throw new Error(`Could not load dataset (${response.status}).`);
    }

    const text = await readDatasetResponseText(response, request.datasetUrl);
    const dataset = enrichDatasetRecipes(parseRecipeDatasetJson(text));

    if (dataset.datasetVersionId !== request.expectedVersionId) {
      throw new Error(
        `Dataset id mismatch: manifest expected ${request.expectedVersionId}, file contains ${dataset.datasetVersionId}.`,
      );
    }

    postMessage({ id: request.id, ok: true, dataset } satisfies WorkerResponse);
  } catch (error) {
    postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Dataset worker load failed.",
    } satisfies WorkerResponse);
  }
}

async function readDatasetResponseText(response: Response, datasetUrl: string): Promise<string> {
  if (!datasetUrl.endsWith(".gz")) {
    return response.text();
  }

  if (!response.body || !("DecompressionStream" in globalThis)) {
    throw new Error("This browser cannot decompress GTNH dataset files.");
  }

  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
