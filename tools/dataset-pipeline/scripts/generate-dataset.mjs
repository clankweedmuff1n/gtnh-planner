import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const channel = requiredEnv("GTNH_CHANNEL");
const versionId = requiredEnv("GTNH_VERSION_ID");
const versionLabel = requiredEnv("GTNH_VERSION_LABEL");
const sourceKind = requiredEnv("GTNH_SOURCE_KIND");
const sourceRef = requiredEnv("GTNH_SOURCE_REF");
const exportCommand = process.env.GTNH_EXPORT_COMMAND;
const outDir = path.join("public", "datasets", "gtnh", versionId);
const pipelineDir = ".pipeline";

await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(pipelineDir, { recursive: true });

const pipelineRecord = {
  schemaVersion: 1,
  status: "pending-exporter",
  channel,
  versionId,
  versionLabel,
  sourceKind,
  sourceRef,
  generatedAt: new Date().toISOString(),
  message:
    "No GTNH_EXPORT_COMMAND secret is configured. Add a CI command that downloads the pack, runs NESQL/NERD/RecEx, and writes a normalized RecipeDataset JSON.",
};

if (!exportCommand) {
  await fs.writeFile(
    path.join(pipelineDir, `${versionId}.pipeline.json`),
    `${JSON.stringify(pipelineRecord, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(outDir, ".pipeline-status.json"),
    `${JSON.stringify(pipelineRecord, null, 2)}\n`,
  );
  console.log(pipelineRecord.message);
  process.exit(0);
}

console.log(`Running configured exporter for ${versionId}.`);
const { spawn } = await import("node:child_process");
const exitCode = await new Promise((resolve) => {
  const child = spawn(exportCommand, {
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      GTNH_DATASET_OUT_DIR: outDir,
      GTNH_DATASET_VERSION_ID: versionId,
      GTNH_DATASET_CHANNEL: channel,
    },
  });
  child.on("exit", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) {
  throw new Error(`Exporter command failed with exit code ${exitCode}.`);
}

const recipeDatasetPath = path.join(outDir, "recipes.json");
if (!existsSync(recipeDatasetPath)) {
  throw new Error(
    `Exporter command completed but did not create ${recipeDatasetPath}. The app expects a normalized RecipeDataset JSON file named recipes.json.`,
  );
}

await fs.writeFile(
  path.join(pipelineDir, `${versionId}.pipeline.json`),
  `${JSON.stringify({ ...pipelineRecord, status: "generated" }, null, 2)}\n`,
);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}
