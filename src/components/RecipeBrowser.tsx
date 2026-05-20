"use client";

import { ArrowLeft, GitBranchPlus, PlusCircle, Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { mergeDatasetAndProjectRecipes } from "@/lib/datasets";
import { getResourceKey, primaryOutput, resourceLabel } from "@/lib/model";
import { useFactoryStore } from "@/store/factory-store";
import type { Recipe, ResourceAmount, ResourceKey } from "@/lib/model/types";
import { NeiRecipeWindow } from "./nei/NeiRecipeWindow";
import { ResourceIcon } from "./nei/ResourceIcon";

export function RecipeBrowser() {
  const dataset = useFactoryStore((state) => state.dataset);
  const projectRecipes = useFactoryStore((state) => state.project.recipes);
  const recipeSearch = useFactoryStore((state) => state.recipeSearch);
  const browserResource = useFactoryStore((state) => state.recipeBrowserResource);
  const browserMode = useFactoryStore((state) => state.recipeBrowserMode);
  const selectedRecipeId = useFactoryStore((state) => state.selectedRecipeId);
  const setRecipeSearch = useFactoryStore((state) => state.setRecipeSearch);
  const browseResource = useFactoryStore((state) => state.browseResource);
  const clearResourceBrowser = useFactoryStore((state) => state.clearResourceBrowser);
  const selectRecipe = useFactoryStore((state) => state.selectRecipe);
  const addNodeForRecipe = useFactoryStore((state) => state.addNodeForRecipe);
  const addConnectedNodeForRecipe = useFactoryStore((state) => state.addConnectedNodeForRecipe);
  const datasetRecipes = dataset?.recipes;
  const [selectedRecipeMap, setSelectedRecipeMap] = useState("all");
  const deferredRecipeSearch = useDeferredValue(recipeSearch);

  const recipes = useMemo(
    () => mergeDatasetAndProjectRecipes(datasetRecipes ?? [], projectRecipes),
    [datasetRecipes, projectRecipes],
  );

  const resourceIndex = useMemo(() => buildResourceIndex(recipes), [recipes]);
  const activeResource = useMemo(() => {
    if (!browserResource) {
      return undefined;
    }

    return {
      ...(resourceIndex.get(`${browserResource.kind}:${browserResource.id}` as ResourceKey) ??
        browserResource),
      anchorNodeId: browserResource.anchorNodeId,
    };
  }, [browserResource, resourceIndex]);

  const resourceResults = useMemo(() => {
    if (activeResource) {
      return [];
    }

    const query = deferredRecipeSearch.trim().toLowerCase();
    if (!query) {
      return [...resourceIndex.values()]
        .filter((resource) => resource.iconPath)
        .sort((left, right) => right.recipeCount - left.recipeCount)
        .slice(0, 72);
    }

    return [...resourceIndex.values()]
      .filter((resource) => resourceMatchesQuery(resource, query))
      .sort((left, right) => {
        const leftLabel = resourceLabel(left).toLowerCase();
        const rightLabel = resourceLabel(right).toLowerCase();
        const leftExact = leftLabel === query || left.id.toLowerCase() === query ? 1 : 0;
        const rightExact = rightLabel === query || right.id.toLowerCase() === query ? 1 : 0;
        return rightExact - leftExact || right.recipeCount - left.recipeCount;
      })
      .slice(0, 96);
  }, [activeResource, deferredRecipeSearch, resourceIndex]);

  const scopedRecipes = useMemo(() => {
    if (!activeResource) {
      return recipes;
    }

    return recipes.filter((recipe) => recipeHasResource(recipe, activeResource, browserMode));
  }, [activeResource, browserMode, recipes]);

  const recipeMaps = useMemo(() => {
    const maps = dataset?.recipeMaps?.length
      ? dataset.recipeMaps.filter((map) =>
          scopedRecipes.some((recipe) => (recipe.source?.recipeMap ?? recipe.machineType) === map),
        )
      : [...new Set(scopedRecipes.map((recipe) => recipe.source?.recipeMap ?? recipe.machineType))];
    return ["all", ...maps.filter(Boolean).sort((a, b) => a.localeCompare(b))];
  }, [dataset, scopedRecipes]);

  const activeRecipeMap = recipeMaps.includes(selectedRecipeMap) ? selectedRecipeMap : "all";

  const filteredRecipes = useMemo(() => {
    const query = deferredRecipeSearch.trim().toLowerCase();
    const activeMap = activeRecipeMap === "all" ? undefined : activeRecipeMap;
    const resultsWithIcons: Array<{ recipe: Recipe; iconScore: number }> = [];
    const resultsWithoutIcons: Recipe[] = [];

    for (const recipe of scopedRecipes) {
      const recipeMap = recipe.source?.recipeMap ?? recipe.machineType;
      if (activeMap && recipeMap !== activeMap) {
        continue;
      }

      if (!activeResource && query && !recipeMatchesQuery(recipe, query)) {
        continue;
      }

      const iconScore = recipeIconScore(recipe);
      if (iconScore > 0) {
        resultsWithIcons.push({ recipe, iconScore });
      } else if (resultsWithoutIcons.length < 240) {
        resultsWithoutIcons.push(recipe);
      }

      if (resultsWithIcons.length >= 240) {
        break;
      }
    }

    return [
      ...resultsWithIcons
        .sort((left, right) => right.iconScore - left.iconScore)
        .map((entry) => entry.recipe),
      ...resultsWithoutIcons,
    ].slice(0, 240);
  }, [activeRecipeMap, activeResource, deferredRecipeSearch, scopedRecipes]);

  const setMode = (mode: "recipes" | "uses") => {
    if (!activeResource) {
      return;
    }

    browseResource(activeResource, mode);
    setSelectedRecipeMap("all");
  };

  return (
    <aside className="flex h-full min-h-[360px] flex-col border-r border-neutral-800 bg-[#25272c] text-neutral-100">
      <div className="border-b border-neutral-800 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-50">NEI recipe browser</h2>
            <p className="mt-1 text-xs text-neutral-400">
              {dataset
                ? `${dataset.gtnhVersion} / ${dataset.recipes.length.toLocaleString()} recipes`
                : "Import a normalized NESQL/RecEx/NERD dataset"}
            </p>
          </div>
          {activeResource ? (
            <button
              type="button"
              onClick={clearResourceBrowser}
              title="Back to resource search"
              aria-label="Back to resource search"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-neutral-700 bg-[#1b1d21] text-neutral-200 hover:border-cyan-400"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <label className="mt-3 flex h-9 items-center gap-2 rounded-[4px] border border-neutral-700 bg-[#17191d] px-2 text-sm text-neutral-200 shadow-[inset_1px_1px_0_rgba(255,255,255,0.08)]">
          <Search className="h-4 w-4 text-neutral-500" />
          <input
            value={recipeSearch}
            onChange={(event) => setRecipeSearch(event.target.value)}
            placeholder="Search item or fluid..."
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
          {recipeSearch ? (
            <button
              type="button"
              onClick={() => setRecipeSearch("")}
              title="Clear search"
              aria-label="Clear search"
              className="text-neutral-500 hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>

        {activeResource ? (
          <>
            <div className="mt-3 flex items-center gap-2 rounded-[4px] border border-neutral-700 bg-[#303238] p-2">
              <ResourceIcon
                resource={{ ...activeResource, amount: 1 }}
                size="sm"
                showAmount={false}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-neutral-50">
                  {resourceLabel(activeResource)}
                </div>
                <div className="truncate text-[11px] text-neutral-400">{activeResource.id}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setMode("recipes")}
                className={modeButtonClass(browserMode === "recipes")}
              >
                Recipes
              </button>
              <button
                type="button"
                onClick={() => setMode("uses")}
                className={modeButtonClass(browserMode === "uses")}
              >
                Uses
              </button>
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
              {recipeMaps.map((recipeMap) => (
                <button
                  key={recipeMap}
                  type="button"
                  onClick={() => setSelectedRecipeMap(recipeMap)}
                  title={recipeMap === "all" ? "All recipe maps" : recipeMap}
                  className={[
                    "h-8 shrink-0 rounded-[3px] border px-2 text-xs font-semibold",
                    activeRecipeMap === recipeMap
                      ? "border-cyan-400 bg-cyan-400/15 text-cyan-100"
                      : "border-neutral-700 bg-[#1b1d21] text-neutral-300 hover:border-neutral-500",
                  ].join(" ")}
                >
                  {recipeMap === "all" ? "All" : recipeMap}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {recipes.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-600 p-4 text-sm text-neutral-300">
            The selected GTNH version is loaded automatically, but its real recipe export is not
            published yet. No manual recipe entry is available.
          </div>
        ) : !activeResource ? (
          <div className="grid grid-cols-1 gap-2">
            {resourceResults.map((resource) => (
              <ResourceResult
                key={`${resource.kind}:${resource.id}`}
                resource={resource}
                onRecipes={() => browseResource(resource, "recipes")}
                onUses={() => browseResource(resource, "uses")}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filteredRecipes.map((recipe) => (
              <RecipeResultCard
                key={recipe.id}
                recipe={recipe}
                selected={selectedRecipeId === recipe.id}
                onSelect={() => selectRecipe(recipe.id)}
                onAdd={() => addNodeForRecipe(recipe.id)}
                onAddConnected={
                  activeResource.anchorNodeId
                    ? () =>
                        addConnectedNodeForRecipe(recipe.id, activeResource.anchorNodeId!, {
                          kind: activeResource.kind,
                          id: activeResource.id,
                          displayName: activeResource.displayName,
                          mode: browserMode,
                        })
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

interface IndexedResource extends Pick<ResourceAmount, "kind" | "id" | "displayName" | "iconPath"> {
  recipeCount: number;
}

function ResourceResult({
  resource,
  onRecipes,
  onUses,
}: {
  resource: IndexedResource;
  onRecipes: () => void;
  onUses: () => void;
}) {
  return (
    <article className="flex items-center gap-2 rounded-[4px] border border-neutral-700 bg-[#303238] p-2">
      <ResourceIcon resource={{ ...resource, amount: 1 }} size="sm" showAmount={false} />
      <button type="button" onClick={onRecipes} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-semibold text-neutral-50">
          {resourceLabel(resource)}
        </div>
        <div className="truncate text-[11px] text-neutral-400">
          {resource.kind} / {resource.recipeCount} linked recipes
        </div>
      </button>
      <button
        type="button"
        onClick={onRecipes}
        className="h-8 rounded-[3px] border border-neutral-700 bg-[#1b1d21] px-2 text-xs font-semibold text-neutral-200 hover:border-cyan-400"
      >
        R
      </button>
      <button
        type="button"
        onClick={onUses}
        className="h-8 rounded-[3px] border border-neutral-700 bg-[#1b1d21] px-2 text-xs font-semibold text-neutral-200 hover:border-cyan-400"
      >
        U
      </button>
    </article>
  );
}

function RecipeResultCard({
  recipe,
  selected,
  onSelect,
  onAdd,
  onAddConnected,
}: {
  recipe: Recipe;
  selected: boolean;
  onSelect: () => void;
  onAdd: () => void;
  onAddConnected?: () => void;
}) {
  const primary = primaryOutput(recipe);

  return (
    <article
      onClick={onSelect}
      className={[
        "cursor-pointer rounded-[4px] border bg-[#303238] p-2 shadow-sm transition hover:border-neutral-500",
        selected ? "border-cyan-400 ring-1 ring-cyan-400" : "border-neutral-700",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-neutral-50">{recipe.name}</h3>
          <p className="mt-0.5 truncate text-xs text-neutral-400">
            {recipe.source?.recipeMap ?? recipe.machineType} | {recipe.durationTicks} ticks |{" "}
            {recipe.eut} EU/t
          </p>
        </div>
        <button
          type="button"
          title={onAddConnected ? "Add and connect recipe node" : "Add recipe node"}
          aria-label={onAddConnected ? "Add and connect recipe node" : "Add recipe node"}
          onClick={(event) => {
            event.stopPropagation();
            if (onAddConnected) {
              onAddConnected();
            } else {
              onAdd();
            }
          }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-neutral-600 bg-[#1b1d21] text-neutral-200 hover:border-cyan-400 hover:text-cyan-100"
        >
          {onAddConnected ? (
            <GitBranchPlus className="h-4 w-4" />
          ) : (
            <PlusCircle className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="mt-2 overflow-x-auto pb-1">
        <NeiRecipeWindow recipe={recipe} scale={2} compact className="mx-auto" />
      </div>
      {primary ? (
        <p className="mt-2 truncate text-[11px] text-neutral-400">
          Primary: {primary.displayName ?? primary.id}
        </p>
      ) : null}
    </article>
  );
}

function buildResourceIndex(recipes: Recipe[]): Map<ResourceKey, IndexedResource> {
  const index = new Map<ResourceKey, IndexedResource>();

  for (const recipe of recipes) {
    for (const resource of [...recipe.inputs, ...recipe.outputs]) {
      const key = getResourceKey(resource);
      const existing = index.get(key);
      if (existing) {
        existing.recipeCount += 1;
        if (!existing.iconPath && resource.iconPath) {
          existing.iconPath = resource.iconPath;
        }
        if (!existing.displayName && resource.displayName) {
          existing.displayName = resource.displayName;
        }
      } else {
        index.set(key, {
          kind: resource.kind,
          id: resource.id,
          displayName: resource.displayName,
          iconPath: resource.iconPath,
          recipeCount: 1,
        });
      }
    }
  }

  return index;
}

function resourceMatchesQuery(resource: IndexedResource, query: string): boolean {
  return [resource.displayName, resource.id, resource.kind]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(query));
}

function recipeHasResource(
  recipe: Recipe,
  resource: Pick<ResourceAmount, "kind" | "id">,
  mode: "recipes" | "uses",
): boolean {
  const resources = mode === "recipes" ? recipe.outputs : recipe.inputs;
  return resources.some((entry) => entry.kind === resource.kind && entry.id === resource.id);
}

function modeButtonClass(active: boolean): string {
  return [
    "h-8 rounded-[3px] border text-xs font-semibold",
    active
      ? "border-cyan-400 bg-cyan-400/15 text-cyan-100"
      : "border-neutral-700 bg-[#1b1d21] text-neutral-300 hover:border-neutral-500",
  ].join(" ");
}

function recipeMatchesQuery(recipe: Recipe, query: string): boolean {
  return [
    recipe.name,
    recipe.machineType,
    recipe.source?.recipeMap,
    recipe.source?.rawRecipeId,
    ...recipe.inputs.map((input) => input.displayName ?? input.id),
    ...recipe.outputs.map((output) => output.displayName ?? output.id),
  ]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(query));
}

function recipeIconScore(recipe: Recipe): number {
  return [...recipe.inputs, ...recipe.outputs].reduce(
    (score, resource) => score + (resource.iconPath ? 1 : 0),
    0,
  );
}
