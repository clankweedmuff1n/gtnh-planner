import { describe, expect, it } from "vitest";
import {
  applyMachineHandlerToRecipe,
  getRecipeMachineHandlers,
  getSelectedMachineHandler,
} from "./recipe-rules";
import type { Recipe } from "./types";

describe("recipe machine handlers", () => {
  it("adds multiblock handlers for shared NEI recipe maps", () => {
    const recipe = testRecipe("Fluid Extractor");

    expect(getRecipeMachineHandlers(recipe).map((handler) => handler.label)).toEqual([
      "Fluid Extractor",
      "Multiblock Fluid Extractor",
    ]);
  });

  it("applies the selected handler to the effective recipe", () => {
    const recipe = testRecipe("Shaped Crafting", "NONE");
    const effective = applyMachineHandlerToRecipe(recipe, {
      machineHandlerId: "autoworkbench",
    });

    expect(getSelectedMachineHandler(recipe, { machineHandlerId: "autoworkbench" })).toMatchObject({
      label: "Autoworkbench",
      minimumTier: "LV",
    });
    expect(effective).toMatchObject({
      machineType: "Autoworkbench",
      minimumTier: "LV",
      machineProfile: {
        machineType: "Autoworkbench",
        minimumTier: "LV",
      },
    });
  });
});

function testRecipe(machineType: string, minimumTier = "LV"): Recipe {
  return {
    id: machineType,
    name: machineType,
    machineType,
    minimumTier,
    durationTicks: 20,
    eut: 8,
    inputs: [{ kind: "item", id: "input", amount: 1 }],
    outputs: [{ kind: "item", id: "output", amount: 1 }],
    source: { recipeMap: machineType },
  };
}
