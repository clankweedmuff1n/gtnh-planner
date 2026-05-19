import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const rootDir = path.join("public", "datasets", "gtnh");
const entries = existsSync(rootDir) ? await fs.readdir(rootDir, { withFileTypes: true }) : [];
const versions = [];

for (const entry of entries) {
  if (!entry.isDirectory()) {
    continue;
  }

  await removeIfExists(path.join(rootDir, entry.name, ".pipeline-status.json"));

  const recipesPath = path.join(rootDir, entry.name, "recipes.json");
  if (!existsSync(recipesPath)) {
    continue;
  }

  const dataset = JSON.parse(await fs.readFile(recipesPath, "utf8"));
  versions.push({
    id: dataset.datasetVersionId,
    gtnhVersion: dataset.gtnhVersion,
    channel: inferChannel(dataset.datasetVersionId),
    publishedAt: dataset.generatedAt,
    manifestPath: "/datasets/gtnh/datasets.manifest.json",
    recipeDatasetPath: `/datasets/gtnh/${dataset.datasetVersionId}/recipes.json`,
    sourceInfo: dataset.sourceInfo,
  });
}

versions.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

const latestStableVersion = versions.find((version) => version.channel === "stable")?.id;
const latestDailyVersion = versions.find((version) => version.channel === "daily")?.id;
const manifest = {
  schemaVersion: 1,
  ...(latestStableVersion ? { latestStableVersion } : {}),
  ...(latestDailyVersion ? { latestDailyVersion } : {}),
  versions,
};

await fs.mkdir(rootDir, { recursive: true });
await fs.writeFile(
  path.join(rootDir, "datasets.manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

function inferChannel(versionId) {
  if (versionId.startsWith("daily-")) {
    return "daily";
  }
  if (versionId.startsWith("stable-")) {
    return "stable";
  }
  return "experimental";
}

async function removeIfExists(filePath) {
  if (existsSync(filePath)) {
    await fs.rm(filePath, { force: true });
  }
}
