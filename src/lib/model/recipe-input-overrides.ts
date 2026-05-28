import type { FactoryNode, Recipe } from "./types";

export function applyRecipeInputOverrides(
  recipe: Recipe,
  node: Pick<FactoryNode, "recipeInputOverrides">,
): Recipe {
  if (!node.recipeInputOverrides) {
    return recipe;
  }

  let changed = false;
  const inputs = recipe.inputs.map((input, index) => {
    const override = node.recipeInputOverrides?.[String(index)];
    if (!override) {
      return input;
    }
    changed = true;
    return {
      ...input,
      ...override,
      amount: override.amount ?? input.amount,
      optional: input.optional,
      consumed: input.consumed,
      neiSlot: input.neiSlot,
      alternatives: undefined,
    };
  });

  return changed ? { ...recipe, inputs } : recipe;
}
