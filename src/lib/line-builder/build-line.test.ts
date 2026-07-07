import { describe, expect, it } from "vitest";
import type { RecipeSummary } from "@/lib/datasets/types";
import { PROJECT_SCHEMA_VERSION, type FactoryProject, type Recipe } from "@/lib/model/types";
import { buildLine, type LineBuilderDataSource } from "./build-line";

function recipe(partial: Partial<Recipe> & Pick<Recipe, "id" | "inputs" | "outputs">): Recipe {
  return {
    name: partial.id,
    machineType: "Assembler",
    minimumTier: "LV",
    durationTicks: 20,
    eut: 30,
    ...partial,
  };
}

function summaryOf(entry: Recipe): RecipeSummary {
  return {
    id: entry.id,
    name: entry.name,
    recipeMap: entry.machineType,
    machineType: entry.machineType,
    minimumTier: String(entry.minimumTier),
    durationTicks: entry.durationTicks,
    eut: entry.eut,
    inputs: entry.inputs,
    outputs: entry.outputs,
    slots: [],
  };
}

function makeDataSource(catalog: Recipe[]): LineBuilderDataSource & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async findRecipesProducing(resource) {
      queries.push(`${resource.kind}:${resource.id}`);
      return catalog
        .filter((entry) =>
          entry.outputs.some((output) => output.kind === resource.kind && output.id === resource.id),
        )
        .map(summaryOf);
    },
    async fetchRecipe(recipeId) {
      const found = catalog.find((entry) => entry.id === recipeId);
      if (!found) {
        throw new Error(`missing recipe ${recipeId}`);
      }
      return found;
    },
  };
}

function projectWithTarget(target: Recipe): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "builder-test",
    name: "Builder test",
    recipes: [target],
    nodes: [
      {
        id: "target-node",
        recipeId: target.id,
        machineCount: 1,
        parallel: 1,
        overclockTier: "LV",
        enabled: true,
        position: { x: 1000, y: 200 },
      },
    ],
    edges: [],
    fuelProfiles: [],
  };
}

describe("buildLine", () => {
  it("expands a chain upstream and reports raw leaves", async () => {
    const target = recipe({
      id: "circuit",
      inputs: [
        { kind: "item", id: "board", amount: 1 },
        { kind: "item", id: "wire", amount: 2 },
      ],
      outputs: [{ kind: "item", id: "circuit", amount: 1 }],
    });
    const catalog = [
      recipe({
        id: "make-board",
        inputs: [{ kind: "item", id: "resin", amount: 1 }],
        outputs: [{ kind: "item", id: "board", amount: 1 }],
      }),
      recipe({
        id: "draw-wire",
        inputs: [{ kind: "item", id: "ingot", amount: 1 }],
        outputs: [{ kind: "item", id: "wire", amount: 2 }],
      }),
      recipe({
        id: "smelt",
        inputs: [{ kind: "item", id: "dust", amount: 1 }],
        outputs: [{ kind: "item", id: "ingot", amount: 1 }],
      }),
    ];

    const result = await buildLine(projectWithTarget(target), "target-node", makeDataSource(catalog));

    expect(result.nodes).toHaveLength(3);
    expect(new Set(result.recipes.map((entry) => entry.id))).toEqual(
      new Set(["make-board", "draw-wire", "smelt"]),
    );
    expect(result.externalInputs.map((entry) => entry.id).sort()).toEqual(["dust", "resin"]);

    // Depth-based layout: producers sit left of the target.
    const smeltNode = result.nodes.find(
      (node) => result.recipes.find((entry) => entry.id === node.recipeId)?.id === "smelt",
    );
    expect(smeltNode?.position.x).toBeLessThan(1000 - 2 * 400);
  });

  it("does not place a second producer when a byproduct already covers the input", async () => {
    // Platline shape: dissolving needs acid, the acid recipe needs the spent
    // byproduct of dissolving. The builder must reuse the target node's
    // byproduct instead of placing another dissolver.
    const target = recipe({
      id: "dissolve",
      inputs: [{ kind: "fluid", id: "acid", amount: 100 }],
      outputs: [
        { kind: "item", id: "product", amount: 1 },
        { kind: "fluid", id: "spent", amount: 90 },
      ],
    });
    const catalog = [
      recipe({
        id: "recycle",
        inputs: [{ kind: "fluid", id: "spent", amount: 90 }],
        outputs: [{ kind: "fluid", id: "acid", amount: 95 }],
      }),
      recipe({
        id: "spent-from-product",
        inputs: [{ kind: "item", id: "product", amount: 1 }],
        outputs: [{ kind: "fluid", id: "spent", amount: 10 }],
      }),
    ];

    const dataSource = makeDataSource(catalog);
    const result = await buildLine(projectWithTarget(target), "target-node", dataSource);

    expect(result.recipes.map((entry) => entry.id)).toEqual(["recycle"]);
    expect(result.nodes).toHaveLength(1);
    expect(result.externalInputs).toHaveLength(0);
    // The spent input never went to the dataset: the line already makes it.
    expect(dataSource.queries).toEqual(["fluid:acid"]);
  });

  it("prefers low-tier primary-output recipes with fewer inputs", async () => {
    const target = recipe({
      id: "use-ingot",
      inputs: [{ kind: "item", id: "ingot", amount: 1 }],
      outputs: [{ kind: "item", id: "plate", amount: 1 }],
    });
    const catalog = [
      recipe({
        id: "fancy-smelt",
        minimumTier: "HV",
        inputs: [
          { kind: "item", id: "dust", amount: 1 },
          { kind: "fluid", id: "helium", amount: 100 },
          { kind: "item", id: "catalyst", amount: 1 },
        ],
        outputs: [{ kind: "item", id: "ingot", amount: 2 }],
      }),
      recipe({
        id: "byproduct-smelt",
        inputs: [{ kind: "item", id: "other-dust", amount: 1 }],
        outputs: [
          { kind: "item", id: "slag", amount: 1 },
          { kind: "item", id: "ingot", amount: 1 },
        ],
      }),
      recipe({
        id: "plain-smelt",
        inputs: [{ kind: "item", id: "dust", amount: 1 }],
        outputs: [{ kind: "item", id: "ingot", amount: 1 }],
      }),
    ];

    const result = await buildLine(projectWithTarget(target), "target-node", makeDataSource(catalog));

    expect(result.recipes.map((entry) => entry.id)).toContain("plain-smelt");
    expect(result.recipes.map((entry) => entry.id)).not.toContain("fancy-smelt");
    expect(result.recipes.map((entry) => entry.id)).not.toContain("byproduct-smelt");
  });

  it("skips recipes that consume the resource they produce", async () => {
    const target = recipe({
      id: "use-tool",
      inputs: [{ kind: "item", id: "drill", amount: 1 }],
      outputs: [{ kind: "item", id: "hole", amount: 1 }],
    });
    const catalog = [
      recipe({
        id: "recharge-drill",
        inputs: [{ kind: "item", id: "drill", amount: 1 }],
        outputs: [{ kind: "item", id: "drill", amount: 1 }],
      }),
    ];

    const result = await buildLine(projectWithTarget(target), "target-node", makeDataSource(catalog));

    expect(result.nodes).toHaveLength(0);
    expect(result.externalInputs.map((entry) => entry.id)).toEqual(["drill"]);
  });

  it("stops at the depth limit and reports the cut inputs", async () => {
    const target = recipe({
      id: "step-0",
      inputs: [{ kind: "item", id: "mat-1", amount: 1 }],
      outputs: [{ kind: "item", id: "final", amount: 1 }],
    });
    const catalog = Array.from({ length: 10 }, (_, index) =>
      recipe({
        id: `step-${index + 1}`,
        inputs: [{ kind: "item", id: `mat-${index + 2}`, amount: 1 }],
        outputs: [{ kind: "item", id: `mat-${index + 1}`, amount: 1 }],
      }),
    );

    const result = await buildLine(projectWithTarget(target), "target-node", makeDataSource(catalog), {
      maxDepth: 3,
    });

    expect(result.nodes).toHaveLength(3);
    expect(result.externalInputs).toEqual([
      expect.objectContaining({ id: "mat-4", reason: "depth-limit" }),
    ]);
  });

  it("respects the node budget", async () => {
    const target = recipe({
      id: "hub",
      inputs: Array.from({ length: 6 }, (_, index) => ({
        kind: "item" as const,
        id: `part-${index}`,
        amount: 1,
      })),
      outputs: [{ kind: "item", id: "assembly", amount: 1 }],
    });
    const catalog = Array.from({ length: 6 }, (_, index) =>
      recipe({
        id: `make-part-${index}`,
        inputs: [{ kind: "item", id: `raw-${index}`, amount: 1 }],
        outputs: [{ kind: "item", id: `part-${index}`, amount: 1 }],
      }),
    );

    const result = await buildLine(projectWithTarget(target), "target-node", makeDataSource(catalog), {
      maxNewNodes: 4,
    });

    expect(result.nodes).toHaveLength(4);
    // The two unexpanded parts plus the raw inputs queued after the budget
    // was exhausted all fall out as external.
    const nodeLimited = result.externalInputs.filter((entry) => entry.reason === "node-limit");
    expect(nodeLimited.map((entry) => entry.id)).toContain("part-4");
    expect(nodeLimited.map((entry) => entry.id)).toContain("part-5");
  });
});
