import { describe, expect, it } from "vitest";
import { enrichDatasetRecipes } from "./enrich";
import type { RecipeDataset } from "./types";

describe("enrichDatasetRecipes", () => {
  it("copies dataset resource icons into recipe amounts without changing amounts", () => {
    const dataset: RecipeDataset = {
      schemaVersion: 1,
      datasetVersionId: "test",
      gtnhVersion: "test",
      sourceInfo: { sourceId: "recex", generatedAt: "2026-01-01T00:00:00.000Z" },
      resources: [
        {
          id: "gregtech:gt.metaitem.01@1",
          kind: "item",
          displayName: "Test Dust",
          iconPath: "/datasets/gtnh/test/textures/rendered/test-dust.png",
        },
      ],
      recipes: [
        {
          id: "recipe",
          name: "Recipe",
          machineType: "Assembler",
          minimumTier: "LV",
          durationTicks: 20,
          eut: 8,
          inputs: [{ kind: "item", id: "gregtech:gt.metaitem.01@1", amount: 2 }],
          outputs: [{ kind: "item", id: "minecraft:stone", amount: 1 }],
        },
      ],
      oreDictionary: {},
      recipeMaps: ["Assembler"],
      generatedAt: "2026-01-01T00:00:00.000Z",
    };

    const enriched = enrichDatasetRecipes(dataset);

    expect(enriched.recipes[0]?.inputs[0]).toMatchObject({
      amount: 2,
      displayName: "Test Dust",
      iconPath: "/datasets/gtnh/test/textures/rendered/test-dust.png",
    });
  });
});
