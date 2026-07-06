import type { RecipeDataset } from "./types";

// Icon atlases are a handful of large sprite sheets shared by thousands of resources.
// Preloading them once, as soon as a dataset is available, warms the browser cache so
// nodes never fetch or decode an atlas lazily while the board is being used.
//
// Idempotent: each atlas URL is only ever injected once per document.
const preloadedUrls = new Set<string>();

export function preloadDatasetAtlases(dataset: RecipeDataset): void {
  if (typeof document === "undefined") {
    return;
  }

  const atlasUrls = new Set<string>();
  for (const resource of dataset.resources) {
    const imagePath = resource.iconAtlas?.imagePath;
    if (imagePath) {
      atlasUrls.add(imagePath);
    }
  }

  for (const url of atlasUrls) {
    if (preloadedUrls.has(url)) {
      continue;
    }
    preloadedUrls.add(url);

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = url;
    document.head.appendChild(link);
  }
}
