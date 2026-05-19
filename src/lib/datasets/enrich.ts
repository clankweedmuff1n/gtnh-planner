import type { DatasetResource, RecipeDataset } from "./types";
import type { Recipe, ResourceAmount } from "../model/types";

export function enrichDatasetRecipes(dataset: RecipeDataset): RecipeDataset {
  const resourcesByKey = new Map(
    dataset.resources.map((resource) => [`${resource.kind}:${resource.id}`, resource] as const),
  );

  return {
    ...dataset,
    recipes: dataset.recipes.map((recipe) => enrichRecipe(recipe, resourcesByKey)),
  };
}

function enrichRecipe(recipe: Recipe, resourcesByKey: Map<string, DatasetResource>): Recipe {
  return {
    ...recipe,
    inputs: recipe.inputs.map((resource) => enrichResource(resource, resourcesByKey)),
    outputs: recipe.outputs.map((resource) => enrichResource(resource, resourcesByKey)),
  };
}

function enrichResource<T extends ResourceAmount>(
  resource: T,
  resourcesByKey: Map<string, DatasetResource>,
): T {
  const indexed = resourcesByKey.get(`${resource.kind}:${resource.id}`);
  if (!indexed) {
    return resource;
  }

  return {
    ...indexed,
    ...resource,
    displayName: resource.displayName ?? indexed.displayName,
    iconPath: resource.iconPath ?? indexed.iconPath,
    tooltip: resource.tooltip ?? indexed.tooltip,
    modId: resource.modId ?? indexed.modId,
  };
}
