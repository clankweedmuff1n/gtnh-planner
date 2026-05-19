import { describe, expect, it } from "vitest";
import { loadBiodieselDemoProject } from "@/examples";
import { parseDatasetManifestJson, parseRecipeDatasetJson } from "./dataset-json";
import { parseFactoryProjectJson, serializeFactoryProject } from "./factory-json";

describe("factory JSON import/export", () => {
  it("round-trips the biodiesel demo through the public schema", () => {
    const project = loadBiodieselDemoProject();
    const json = serializeFactoryProject(project);
    const parsed = parseFactoryProjectJson(json);

    expect(parsed.name).toBe(project.name);
    expect(parsed.recipes).toHaveLength(7);
    expect(parsed.nodes).toHaveLength(7);
    expect(parsed.metadata?.isDemo).toBe(true);
  });

  it("reports invalid JSON and invalid factory data", () => {
    expect(() => parseFactoryProjectJson("{")).toThrow(/Invalid JSON/);
    expect(() =>
      parseFactoryProjectJson(
        JSON.stringify({
          schemaVersion: 1,
          id: "bad",
          name: "",
          recipes: [],
          nodes: [],
          edges: [],
          fuelProfiles: [],
        }),
      ),
    ).toThrow(/Invalid factory project/);
  });

  it("validates normalized recipe datasets", () => {
    const dataset = parseRecipeDatasetJson(
      JSON.stringify({
        schemaVersion: 1,
        datasetVersionId: "gtnh-test",
        gtnhVersion: "test",
        sourceInfo: {
          sourceId: "nesql",
          generatedAt: "2026-05-19T00:00:00.000Z",
        },
        resources: [
          {
            id: "item:gregtech:test",
            kind: "item",
            displayName: "Test Dust",
          },
        ],
        recipes: [
          {
            id: "recipe-test",
            name: "Test Dust",
            machineType: "Macerator",
            minimumTier: "LV",
            durationTicks: 200,
            eut: 30,
            inputs: [{ kind: "item", id: "ore:test", amount: 1 }],
            outputs: [{ kind: "item", id: "item:gregtech:test", amount: 2 }],
            source: {
              datasetVersionId: "gtnh-test",
              recipeMap: "macerator",
              exporter: "nesql",
            },
          },
        ],
        oreDictionary: {},
        recipeMaps: ["macerator"],
        generatedAt: "2026-05-19T00:00:00.000Z",
      }),
    );

    expect(dataset.sourceInfo.sourceId).toBe("nesql");
    expect(dataset.recipes[0]?.source?.recipeMap).toBe("macerator");
  });

  it("validates dataset manifests with version metadata", () => {
    const manifest = parseDatasetManifestJson(
      JSON.stringify({
        schemaVersion: 1,
        latestStableVersion: "gtnh-2.7.4",
        versions: [
          {
            id: "gtnh-2.7.4",
            gtnhVersion: "2.7.4",
            channel: "stable",
            publishedAt: "2026-05-19T00:00:00.000Z",
            manifestPath: "/datasets/gtnh/datasets.manifest.json",
            recipeDatasetPath: "/datasets/gtnh/2.7.4/recipes.json",
            sourceInfo: {
              sourceId: "nesql",
              generatedAt: "2026-05-19T00:00:00.000Z",
            },
          },
        ],
      }),
    );

    expect(manifest.latestStableVersion).toBe("gtnh-2.7.4");
    expect(manifest.versions[0]?.recipeDatasetPath).toBe("/datasets/gtnh/2.7.4/recipes.json");
  });
});
