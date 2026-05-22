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

  it("adds shared recipe map slot capacities to recipes with partial outputs", () => {
    const dataset = baseDataset([
      {
        id: "partial-electrolyzer",
        name: "Partial Electrolyzer",
        machineType: "Electrolyzer",
        minimumTier: "LV",
        durationTicks: 20,
        eut: 8,
        inputs: [{ kind: "item", id: "dust", amount: 1 }],
        outputs: [
          { kind: "item", id: "a", amount: 1 },
          { kind: "item", id: "b", amount: 1 },
          { kind: "item", id: "c", amount: 1 },
        ],
        source: { recipeMap: "Electrolyzer" },
      },
      {
        id: "full-electrolyzer",
        name: "Full Electrolyzer",
        machineType: "Electrolyzer",
        minimumTier: "LV",
        durationTicks: 20,
        eut: 8,
        inputs: [{ kind: "item", id: "dust", amount: 1 }],
        outputs: [
          { kind: "item", id: "a", amount: 1 },
          { kind: "item", id: "b", amount: 1 },
          { kind: "item", id: "c", amount: 1 },
          { kind: "item", id: "d", amount: 1 },
          { kind: "item", id: "e", amount: 1 },
          { kind: "item", id: "f", amount: 1 },
        ],
        source: { recipeMap: "Electrolyzer" },
      },
    ]);

    const enriched = enrichDatasetRecipes(dataset);

    expect(enriched.recipes[0]?.nei?.slotCapacity).toMatchObject({
      maxItemOutputs: 6,
    });
  });

  it("applies recipe map slot capacity overrides to exported name variants", () => {
    const dataset = baseDataset([
      {
        id: "partial-multiblock-electrolyzer",
        name: "Partial Multiblock Electrolyzer",
        machineType: "Multiblock Electrolyzer",
        minimumTier: "LV",
        durationTicks: 20,
        eut: 8,
        inputs: [{ kind: "item", id: "dust", amount: 1 }],
        outputs: [
          { kind: "item", id: "a", amount: 1 },
          { kind: "item", id: "b", amount: 1 },
        ],
        source: { recipeMap: "multiblock electrolyzer recipes" },
      },
    ]);

    const enriched = enrichDatasetRecipes(dataset);

    expect(enriched.recipes[0]?.nei?.slotCapacity).toMatchObject({
      maxItemOutputs: 6,
    });
  });
});

function baseDataset(recipes: RecipeDataset["recipes"]): RecipeDataset {
  return {
    schemaVersion: 1,
    datasetVersionId: "test",
    gtnhVersion: "test",
    sourceInfo: { sourceId: "recex", generatedAt: "2026-01-01T00:00:00.000Z" },
    resources: [],
    recipes,
    oreDictionary: {},
    recipeMaps: [
      ...new Set(recipes.map((recipe) => recipe.source?.recipeMap ?? recipe.machineType)),
    ],
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}
