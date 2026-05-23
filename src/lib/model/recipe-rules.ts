import type { Recipe, RecipeInput, ResourceAmount } from "./types";

const SHARED_MULTIBLOCK_RECIPE_MAPS = [
  {
    single: "centrifuge",
    multiblock: "multiblock centrifuge",
    machineType: "Multiblock Centrifuge",
  },
  {
    single: "electrolyzer",
    multiblock: "multiblock electrolyzer",
    machineType: "Multiblock Electrolyzer",
  },
  {
    single: "mixer",
    multiblock: "multiblock mixer",
    machineType: "Multiblock Mixer",
  },
  {
    single: "dehydrator",
    multiblock: "multiblock dehydrator",
    machineType: "Multiblock Dehydrator",
  },
] as const;

const EBF_COIL_REQUIREMENTS = [
  { heat: 1801, key: "cupronickel", label: "Cupronickel", blockMeta: 0, colors: ["#b87953", "#e0b084"] },
  { heat: 2701, key: "kanthal", label: "Kanthal", blockMeta: 1, colors: ["#b77b37", "#f3c362"] },
  { heat: 3601, key: "nichrome", label: "Nichrome", blockMeta: 2, colors: ["#b9b9c4", "#f0d6d6"] },
  { heat: 4501, key: "tpv", label: "TPV", blockMeta: 3, colors: ["#4e687b", "#9dc5de"] },
  { heat: 5401, key: "hss_g", label: "HSS-G", blockMeta: 4, colors: ["#5d7881", "#b8e3eb"] },
  { heat: 6301, key: "hss_s", label: "HSS-S", blockMeta: 9, colors: ["#8a6f9d", "#dcc3f5"] },
  { heat: 7201, key: "naquadah", label: "Naquadah", blockMeta: 5, colors: ["#2d5d43", "#69c48d"] },
  { heat: 8101, key: "naquadah_alloy", label: "Naquadah Alloy", blockMeta: 6, colors: ["#355956", "#7dd7c5"] },
  { heat: 9001, key: "trinium", label: "Trinium", blockMeta: 10, colors: ["#6c5f72", "#cdb9d6"] },
  { heat: 9901, key: "electrum_flux", label: "Electrum Flux", blockMeta: 8, colors: ["#966a1d", "#ffe36b"] },
  { heat: 10801, key: "awakened_draconium", label: "Awakened Draconium", blockMeta: 9, colors: ["#b85a23", "#ff9a3d"] },
  { heat: 11701, key: "infinity", label: "Infinity", blockMeta: 11, colors: ["#5f5f72", "#ffffff"] },
  { heat: 12601, key: "hypogen", label: "Hypogen", blockMeta: 12, colors: ["#43315c", "#d278ff"] },
  { heat: 13501, key: "eternal", label: "Eternal", blockMeta: 13, colors: ["#222222", "#f6f3ff"] },
] as const;

export type HeatingCoilTier = (typeof EBF_COIL_REQUIREMENTS)[number]["key"];

export function expandMachineRecipeVariants(recipes: Recipe[]): Recipe[] {
  return addSharedMultiblockRecipeVariants(recipes);
}

function addSharedMultiblockRecipeVariants(recipes: Recipe[]): Recipe[] {
  const recipesBySignature = new Set(
    recipes.map((recipe) => `${normalizeRecipeMapName(recipeMapName(recipe))}:${recipeBodySignature(recipe)}`),
  );
  const expanded = [...recipes];

  for (const recipe of recipes) {
    const mapRule = SHARED_MULTIBLOCK_RECIPE_MAPS.find(
      (entry) => normalizeRecipeMapName(recipeMapName(recipe)) === entry.single,
    );
    if (!mapRule) {
      continue;
    }

    const signature = `${mapRule.multiblock}:${recipeBodySignature(recipe)}`;
    if (recipesBySignature.has(signature)) {
      continue;
    }

    recipesBySignature.add(signature);
    expanded.push({
      ...recipe,
      id: `${recipe.id}:multiblock-${slug(mapRule.multiblock)}`,
      name: recipe.name.replace(recipe.machineType, mapRule.machineType),
      machineType: mapRule.machineType,
      notes: appendNote(
        recipe.notes,
        "Generated multiblock variant for a recipe map shared with single-block machines.",
      ),
      source: {
        ...recipe.source,
        recipeMap: mapRule.machineType,
        rawRecipeId: recipe.source?.rawRecipeId
          ? `${recipe.source.rawRecipeId}:multiblock-${slug(mapRule.multiblock)}`
          : undefined,
      },
    });
  }

  return expanded;
}

export function isRecipeTierAdjustable(
  recipe: Pick<Recipe, "machineType" | "source" | "nei">,
): boolean {
  const recipeMap = recipeMapName(recipe);

  return !isTieredMachineRecipeMap(recipeMap) && getRecipeSpecialValue(recipe) === undefined;
}

export function getRecipeCoilTierControl(
  recipe: Pick<Recipe, "machineType" | "source" | "nei">,
  node: { coilTier?: string },
) {
  const specialValue = getRecipeSpecialValue(recipe);
  if (specialValue === undefined || specialValue <= 0 || !isBlastFurnaceRecipeMap(recipeMapName(recipe))) {
    return undefined;
  }

  const minimumIndex = getCoilIndexForHeat(specialValue);
  if (minimumIndex === -1) {
    return undefined;
  }

  const requestedIndex = EBF_COIL_REQUIREMENTS.findIndex((entry) => entry.key === node.coilTier);
  const currentIndex = Math.max(minimumIndex, requestedIndex);
  const minimum = EBF_COIL_REQUIREMENTS[minimumIndex];
  const current = EBF_COIL_REQUIREMENTS[currentIndex] ?? minimum;

  return {
    minimum,
    current,
    tiers: EBF_COIL_REQUIREMENTS.slice(minimumIndex),
  };
}

export function heatingCoilTierResource(coil: (typeof EBF_COIL_REQUIREMENTS)[number]): RecipeInput {
  return makeCoilRequirementInput(coil);
}

export function getAdjacentCoilTier(
  currentKey: string,
  minimumKey: string,
  direction: -1 | 1,
): string {
  const currentIndex = EBF_COIL_REQUIREMENTS.findIndex((entry) => entry.key === currentKey);
  const minimumIndex = EBF_COIL_REQUIREMENTS.findIndex((entry) => entry.key === minimumKey);
  const nextIndex = Math.min(
    EBF_COIL_REQUIREMENTS.length - 1,
    Math.max(minimumIndex, currentIndex + direction),
  );
  return EBF_COIL_REQUIREMENTS[nextIndex]?.key ?? currentKey;
}

function isTieredMachineRecipeMap(recipeMap: string): boolean {
  const normalized = normalizeRecipeMapName(recipeMap);
  return (
    normalized === "blast furnace" ||
    normalized === "electric blast furnace" ||
    normalized === "pyrolyse oven" ||
    normalized === "cracker" ||
    normalized === "chemical plant" ||
    normalized === "distillation tower" ||
    normalized === "vacuum freezer" ||
    normalized === "fusion reactor"
  );
}

export function getRecipeSpecialValue(recipe: Pick<Recipe, "nei">): number | undefined {
  for (const entry of recipe.nei?.additionalInfo ?? []) {
    const match = /special\s+value\s*:\s*(-?\d+)/i.exec(entry);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }

  return undefined;
}

function recipeBodySignature(recipe: Recipe): string {
  return JSON.stringify({
    durationTicks: recipe.durationTicks,
    eut: recipe.eut,
    programmedCircuit: recipe.programmedCircuit,
    inputs: recipe.inputs.map(resourceSignature).sort(),
    outputs: recipe.outputs.map(resourceSignature).sort(),
  });
}

function makeCoilRequirementInput(
  coil: (typeof EBF_COIL_REQUIREMENTS)[number],
): RecipeInput {
  return {
    kind: "item",
    id:
      coil.blockMeta === 0
        ? "gregtech:gt.blockcasings5"
        : `gregtech:gt.blockcasings5@${coil.blockMeta}`,
    amount: 1,
    displayName: `${coil.label} Coil Block`,
    iconPath: coilTextureDataUri(coil.colors[0], coil.colors[1]),
    consumed: false,
    tooltip: ["Heating coil tier", `Heat capacity: ${coil.heat} K`],
  };
}

function getCoilIndexForHeat(heat: number): number {
  for (let index = 0; index < EBF_COIL_REQUIREMENTS.length; index += 1) {
    if (EBF_COIL_REQUIREMENTS[index].heat >= heat) {
      return index;
    }
  }

  return EBF_COIL_REQUIREMENTS.length - 1;
}

function resourceSignature(resource: ResourceAmount): string {
  return JSON.stringify({
    kind: resource.kind,
    id: resource.id,
    amount: resource.amount,
    consumed: "consumed" in resource ? resource.consumed : undefined,
    chance: "chance" in resource ? resource.chance : undefined,
  });
}

function isBlastFurnaceRecipeMap(recipeMap: string): boolean {
  const normalized = normalizeRecipeMapName(recipeMap);
  return normalized === "blast furnace" || normalized === "electric blast furnace";
}

function recipeMapName(recipe: Pick<Recipe, "machineType" | "source">): string {
  return recipe.source?.recipeMap ?? recipe.machineType;
}

function appendNote(notes: string | undefined, note: string): string {
  return notes ? `${notes} ${note}` : note;
}

function slug(value: string): string {
  return normalizeRecipeMapName(value).replace(/[^a-z0-9]+/g, "-");
}

function coilTextureDataUri(primary: string, secondary: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" shape-rendering="crispEdges"><rect width="16" height="16" fill="#2a2a2a"/><rect x="2" y="2" width="12" height="12" fill="${primary}"/><rect x="4" y="4" width="8" height="8" fill="#111"/><rect x="5" y="5" width="6" height="6" fill="${secondary}"/><rect x="7" y="7" width="2" height="2" fill="#fff"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function normalizeRecipeMapName(recipeMap: string): string {
  return recipeMap
    .trim()
    .toLowerCase()
    .replace(/\brecipes?\b/g, "")
    .replace(/\brecipe\s+map\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
