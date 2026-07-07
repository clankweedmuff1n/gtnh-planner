import { describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_VERSION, type FactoryProject, type Recipe } from "@/lib/model/types";
import { solveProcessLine } from "./line-solver";

function makeProject(overrides: Partial<FactoryProject>): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "line-solver-test",
    name: "Line solver test",
    recipes: [],
    nodes: [],
    edges: [],
    fuelProfiles: [],
    ...overrides,
  };
}

function makeNode(id: string, recipeId: string) {
  return {
    id,
    recipeId,
    machineCount: 1,
    parallel: 1,
    overclockTier: "LV" as const,
    enabled: true,
    position: { x: 0, y: 0 },
  };
}

// All recipes run at 20 ticks = 1 operation/second per machine.
const TICKS = 20;

describe("solveProcessLine", () => {
  it("solves a simple chain and reports the external raw input", () => {
    const recipes: Recipe[] = [
      {
        id: "macerate",
        name: "Macerate",
        machineType: "Macerator",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 2,
        inputs: [{ kind: "item", id: "ore", amount: 1 }],
        outputs: [{ kind: "item", id: "dust", amount: 2 }],
      },
      {
        id: "press",
        name: "Press",
        machineType: "Bender",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 2,
        inputs: [{ kind: "item", id: "dust", amount: 1 }],
        outputs: [{ kind: "item", id: "plate", amount: 1 }],
      },
    ];
    const project = makeProject({
      targetRate: { kind: "item", resourceId: "plate", amountPerSecond: 4 },
      recipes,
      nodes: [makeNode("mac", "macerate"), makeNode("bend", "press")],
      edges: [
        {
          id: "e1",
          source: "mac",
          target: "bend",
          resourceKind: "item",
          resourceId: "dust",
        },
      ],
    });

    const result = solveProcessLine(project);

    expect(result.status).toBe("optimal");
    expect(result.exactMachineCounts.get("bend")).toBeCloseTo(4, 5);
    expect(result.exactMachineCounts.get("mac")).toBeCloseTo(2, 5);
    expect(result.machineCounts.get("bend")).toBe(4);
    expect(result.machineCounts.get("mac")).toBe(2);

    expect(result.externalInputs).toHaveLength(1);
    expect(result.externalInputs[0].resourceKey).toBe("item:ore");
    expect(result.externalInputs[0].ratePerSecond).toBeCloseTo(2, 5);

    const plateSurplus = result.surpluses.find((entry) => entry.resourceKey === "item:plate");
    expect(plateSurplus?.ratePerSecond).toBeCloseTo(4, 5);
    expect(plateSurplus?.isTarget).toBe(true);
  });

  it("tops up a lossy recycling loop with the minimal external input", () => {
    // Platline-style: the dissolver eats 100 acid, the recycler regenerates
    // only 95 back — the loop needs 5 acid per operation from outside.
    const recipes: Recipe[] = [
      {
        id: "dissolve",
        name: "Dissolve",
        machineType: "ChemicalReactor",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 30,
        inputs: [{ kind: "fluid", id: "acid", amount: 100 }],
        outputs: [
          { kind: "item", id: "product", amount: 1 },
          { kind: "fluid", id: "spent", amount: 90 },
        ],
      },
      {
        id: "recycle",
        name: "Recycle",
        machineType: "Distillery",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 30,
        inputs: [{ kind: "fluid", id: "spent", amount: 90 }],
        outputs: [{ kind: "fluid", id: "acid", amount: 95 }],
      },
    ];
    const project = makeProject({
      targetRate: { kind: "item", resourceId: "product", amountPerSecond: 2 },
      recipes,
      nodes: [makeNode("diss", "dissolve"), makeNode("rec", "recycle")],
      edges: [
        {
          id: "spent-edge",
          source: "diss",
          target: "rec",
          resourceKind: "fluid",
          resourceId: "spent",
        },
        {
          id: "acid-edge",
          source: "rec",
          target: "diss",
          resourceKind: "fluid",
          resourceId: "acid",
        },
      ],
    });

    const result = solveProcessLine(project);

    expect(result.status).toBe("optimal");
    expect(result.exactMachineCounts.get("diss")).toBeCloseTo(2, 5);
    expect(result.exactMachineCounts.get("rec")).toBeCloseTo(2, 5);

    const acidTopUp = result.externalInputs.find((entry) => entry.resourceKey === "fluid:acid");
    expect(acidTopUp?.ratePerSecond).toBeCloseTo(10, 5);
    expect(result.externalInputs.some((entry) => entry.resourceKey === "fluid:spent")).toBe(false);

    expect(result.loops).toHaveLength(1);
    const loopAcid = result.loops[0].resources.find((entry) => entry.resourceKey === "fluid:acid");
    expect(loopAcid?.ratePerSecond).toBeCloseTo(190, 5);
    expect(new Set(result.loops[0].nodeIds)).toEqual(new Set(["diss", "rec"]));
  });

  it("keeps a self-sustaining loop closed with zero external top-up", () => {
    const recipes: Recipe[] = [
      {
        id: "dissolve",
        name: "Dissolve",
        machineType: "ChemicalReactor",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 30,
        inputs: [{ kind: "fluid", id: "acid", amount: 100 }],
        outputs: [
          { kind: "item", id: "product", amount: 1 },
          { kind: "fluid", id: "spent", amount: 90 },
        ],
      },
      {
        id: "recycle",
        name: "Recycle",
        machineType: "Distillery",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 30,
        inputs: [{ kind: "fluid", id: "spent", amount: 90 }],
        outputs: [{ kind: "fluid", id: "acid", amount: 110 }],
      },
    ];
    const project = makeProject({
      targetRate: { kind: "item", resourceId: "product", amountPerSecond: 2 },
      recipes,
      nodes: [makeNode("diss", "dissolve"), makeNode("rec", "recycle")],
      edges: [
        {
          id: "spent-edge",
          source: "diss",
          target: "rec",
          resourceKind: "fluid",
          resourceId: "spent",
        },
        {
          id: "acid-edge",
          source: "rec",
          target: "diss",
          resourceKind: "fluid",
          resourceId: "acid",
        },
      ],
    });

    const result = solveProcessLine(project);

    expect(result.status).toBe("optimal");
    expect(result.externalInputs).toHaveLength(0);
    // The recycler is throttled to exactly cover the acid demand
    // (200 / 110 machines) and the excess spent acid is dumped instead.
    expect(result.exactMachineCounts.get("rec")).toBeCloseTo(200 / 110, 5);
    const spentSurplus = result.surpluses.find((entry) => entry.resourceKey === "fluid:spent");
    expect(spentSurplus?.ratePerSecond).toBeCloseTo(180 - 90 * (200 / 110), 5);
  });

  it("accounts for chanced outputs as expected value", () => {
    const recipes: Recipe[] = [
      {
        id: "sift",
        name: "Sift",
        machineType: "Sifter",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 4,
        inputs: [{ kind: "item", id: "gravel", amount: 1 }],
        outputs: [{ kind: "item", id: "gem", amount: 2, chance: 0.5 }],
      },
      {
        id: "cut",
        name: "Cut",
        machineType: "Cutter",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 8,
        inputs: [{ kind: "item", id: "gem", amount: 2 }],
        outputs: [{ kind: "item", id: "lens", amount: 1 }],
      },
    ];
    const project = makeProject({
      targetRate: { kind: "item", resourceId: "lens", amountPerSecond: 1 },
      recipes,
      nodes: [makeNode("sift", "sift"), makeNode("cut", "cut")],
      edges: [
        {
          id: "gem-edge",
          source: "sift",
          target: "cut",
          resourceKind: "item",
          resourceId: "gem",
        },
      ],
    });

    const result = solveProcessLine(project);

    expect(result.status).toBe("optimal");
    // Cutter needs 2 gems/s; the sifter averages 1 gem/s per machine.
    expect(result.exactMachineCounts.get("cut")).toBeCloseTo(1, 5);
    expect(result.exactMachineCounts.get("sift")).toBeCloseTo(2, 5);
  });

  it("routes loops through storage buffers and anchors terminal nodes without a target", () => {
    const recipes: Recipe[] = [
      {
        id: "pump",
        name: "Pump",
        machineType: "Pump",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 2,
        inputs: [],
        outputs: [{ kind: "fluid", id: "water", amount: 10 }],
      },
      {
        id: "boil",
        name: "Boil",
        machineType: "Boiler",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 2,
        inputs: [{ kind: "fluid", id: "water", amount: 5 }],
        outputs: [{ kind: "fluid", id: "steam", amount: 100 }],
      },
    ];
    const project = makeProject({
      recipes,
      nodes: [makeNode("pump", "pump"), makeNode("boil", "boil")],
      storages: [
        {
          id: "tank",
          kind: "fluid",
          resourceId: "water",
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        {
          id: "to-tank",
          source: "pump",
          target: "tank",
          resourceKind: "fluid",
          resourceId: "water",
        },
        {
          id: "from-tank",
          source: "tank",
          target: "boil",
          resourceKind: "fluid",
          resourceId: "water",
        },
      ],
    });

    const result = solveProcessLine(project);

    expect(result.status).toBe("optimal");
    // The boiler is the only terminal node, anchored at one machine; the
    // pump only has to cover half its own capacity.
    expect(result.exactMachineCounts.get("boil")).toBeCloseTo(1, 5);
    expect(result.exactMachineCounts.get("pump")).toBeCloseTo(0.5, 5);
    expect(result.machineCounts.get("pump")).toBe(1);
    expect(result.externalInputs.some((entry) => entry.resourceKey === "fluid:water")).toBe(false);
  });

  it("returns empty for a project without solvable nodes", () => {
    const result = solveProcessLine(makeProject({}));
    expect(result.status).toBe("empty");
    expect(result.diagnostics).toContain("line-solver:no-solvable-nodes");
  });

  it("finishes quickly on a large meshed project instead of stalling", () => {
    // Regression for a UI freeze: dozens of machines sharing commodity
    // fluids, with every producer wired to every consumer.
    const producerCount = 20;
    const consumerCount = 40;
    const recipes: Recipe[] = [];
    const nodes = [];
    const edges = [];

    for (let index = 0; index < producerCount; index += 1) {
      recipes.push({
        id: `make-fluid-${index % 4}-v${index}`,
        name: `Make fluid ${index}`,
        machineType: "Pump",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 2,
        inputs: [],
        outputs: [{ kind: "fluid", id: `commodity-${index % 4}`, amount: 100 }],
      });
      nodes.push(makeNode(`producer-${index}`, `make-fluid-${index % 4}-v${index}`));
    }

    for (let index = 0; index < consumerCount; index += 1) {
      recipes.push({
        id: `consume-${index}`,
        name: `Consume ${index}`,
        machineType: "ChemicalReactor",
        minimumTier: "LV",
        durationTicks: TICKS,
        eut: 30,
        inputs: [
          { kind: "fluid", id: `commodity-${index % 4}`, amount: 50 },
          { kind: "fluid", id: `commodity-${(index + 1) % 4}`, amount: 25 },
        ],
        outputs: [{ kind: "item", id: `product-${index}`, amount: 1 }],
      });
      const consumerId = `consumer-${index}`;
      nodes.push(makeNode(consumerId, `consume-${index}`));
      for (let producer = 0; producer < producerCount; producer += 1) {
        for (const commodity of [index % 4, (index + 1) % 4]) {
          if (producer % 4 === commodity) {
            edges.push({
              id: `edge-${producer}-${index}-${commodity}`,
              source: `producer-${producer}`,
              target: consumerId,
              resourceKind: "fluid" as const,
              resourceId: `commodity-${commodity}`,
            });
          }
        }
      }
    }

    const project = makeProject({ recipes, nodes, edges });

    const startedAt = performance.now();
    const result = solveProcessLine(project);
    const elapsedMs = performance.now() - startedAt;

    expect(["optimal", "iteration-limit", "too-large"]).toContain(result.status);
    expect(elapsedMs).toBeLessThan(4000);
  });
});
