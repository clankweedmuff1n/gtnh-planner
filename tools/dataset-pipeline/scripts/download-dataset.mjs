// Clone a published GTNH dataset from a deployed site into public/datasets/gtnh so the
// app can serve recipes and textures itself, without proxying GTNH_DATASET_BACKEND_URL.
//
// Usage:
//   node tools/dataset-pipeline/scripts/download-dataset.mjs [backendUrl] [versionId]
// Defaults: backend https://dev-gtnh.samiracle.fr, all versions in the manifest.
//
// Downloads for each version: the 4 core .json.gz files, every recipe shard, and every
// referenced texture (atlas sheets + individual icons). Existing files are skipped, so
// re-runs are cheap and resumable.

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";

const gunzip = promisify(zlib.gunzip);

const BACKEND = (process.argv[2] || "https://dev-gtnh.samiracle.fr").replace(/\/+$/, "");
const ONLY_VERSION = process.argv[3];
const PUBLIC_ROOT = "public";
const CONCURRENCY = 12;

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchBuffer(datasetPath) {
  const res = await fetch(`${BACKEND}${datasetPath}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${datasetPath}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function saveFile(datasetPath, buffer) {
  const dest = join(PUBLIC_ROOT, datasetPath);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
}

// Download to public/<datasetPath>, skipping if already present. Returns the buffer
// (freshly fetched) or undefined when skipped.
async function download(datasetPath) {
  const dest = join(PUBLIC_ROOT, datasetPath);
  if (await fileExists(dest)) {
    return undefined;
  }
  const buffer = await fetchBuffer(datasetPath);
  await saveFile(datasetPath, buffer);
  return buffer;
}

async function runPool(items, worker) {
  let index = 0;
  let done = 0;
  const total = items.length;
  const runners = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      try {
        await worker(current);
      } catch (error) {
        console.warn(`  ! ${current}: ${error.message}`);
      }
      done += 1;
      if (done % 250 === 0 || done === total) {
        console.log(`    ${done}/${total}`);
      }
    }
  });
  await Promise.all(runners);
}

function collectTexturePaths(target, source) {
  if (!source || typeof source !== "object") {
    return;
  }
  if (Array.isArray(source)) {
    for (const item of source) collectTexturePaths(target, item);
    return;
  }
  if (typeof source.iconPath === "string" && source.iconPath.startsWith("/datasets/")) {
    target.add(source.iconPath);
  }
  if (source.iconAtlas?.imagePath?.startsWith?.("/datasets/")) {
    target.add(source.iconAtlas.imagePath);
  }
  for (const value of Object.values(source)) {
    if (value && typeof value === "object") collectTexturePaths(target, value);
  }
}

async function main() {
  console.log(`Backend: ${BACKEND}`);
  const manifestBuffer = await fetchBuffer("/datasets/gtnh/datasets.manifest.json");
  await saveFile("/datasets/gtnh/datasets.manifest.json", manifestBuffer);
  const manifest = JSON.parse(manifestBuffer.toString());

  const versions = manifest.versions.filter((v) => !ONLY_VERSION || v.id === ONLY_VERSION);
  if (versions.length === 0) {
    throw new Error(`Version ${ONLY_VERSION} not found in manifest.`);
  }

  for (const version of versions) {
    console.log(`\n== ${version.id} ==`);
    const corePaths = [
      version.recipeDatasetPath,
      version.resourceIndexPath,
      version.recipeIndexPath,
      version.recipeLookupIndexPath,
    ].filter(Boolean);

    console.log("core files…");
    for (const path of corePaths) {
      const buffer = await download(path);
      console.log(`  ${buffer ? "downloaded" : "skip"} ${path}`);
    }

    const textures = new Set();

    // Textures from the resource index.
    const resourceIndex = JSON.parse(
      (await gunzip(await fetchBuffer(version.resourceIndexPath))).toString(),
    );
    collectTexturePaths(textures, resourceIndex);

    // Recipe shards + textures referenced inside recipes.
    const recipeIndex = JSON.parse(
      (await gunzip(await fetchBuffer(version.recipeIndexPath))).toString(),
    );
    const shards = recipeIndex.shards ?? [];
    console.log(`shards: ${shards.length}`);
    await runPool(
      shards.map((s) => s.path),
      async (shardPath) => {
        const existing = join(PUBLIC_ROOT, shardPath);
        const buffer = (await fileExists(existing))
          ? await fetchBuffer(shardPath)
          : (await download(shardPath)) ?? (await fetchBuffer(shardPath));
        const shard = JSON.parse((await gunzip(buffer)).toString());
        collectTexturePaths(textures, shard);
      },
    );

    console.log(`textures: ${textures.size}`);
    await runPool([...textures], async (texPath) => {
      await download(texPath);
    });
  }

  console.log("\nDone. Dataset is in public/datasets/gtnh.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
