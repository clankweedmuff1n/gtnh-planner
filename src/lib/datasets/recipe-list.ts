import type { Recipe } from "../model/types";

export function mergeDatasetAndProjectRecipes(
  datasetRecipes: Recipe[],
  projectRecipes: Recipe[],
): Recipe[] {
  if (projectRecipes.length === 0) {
    return datasetRecipes;
  }

  const datasetRecipeIds = new Set(datasetRecipes.map((recipe) => recipe.id));
  const projectOnlyRecipes = projectRecipes.filter((recipe) => !datasetRecipeIds.has(recipe.id));
  if (projectOnlyRecipes.length === 0) {
    return datasetRecipes;
  }

  return [...datasetRecipes, ...projectOnlyRecipes];
}
