import type { Recipe } from "../model/types";

export function mergeDatasetAndProjectRecipes(
  datasetRecipes: Recipe[],
  projectRecipes: Recipe[],
): Recipe[] {
  const datasetRecipeIds = new Set(datasetRecipes.map((recipe) => recipe.id));
  const projectOnlyRecipes = projectRecipes.filter((recipe) => !datasetRecipeIds.has(recipe.id));
  return [...datasetRecipes, ...projectOnlyRecipes];
}
