import { getRecipePowerTier, getVoltageTierIndex, GT_VOLTAGE_TIERS } from "@/lib/model/tiers";
import type { FactoryNode, MachineTier, Recipe } from "@/lib/model/types";

type VoltageTier = Exclude<MachineTier, "DEMO">;

export interface OverclockedRecipeStats {
  tier: VoltageTier;
  minimumTier: VoltageTier;
  overclockSteps: number;
  durationTicks: number;
  eut: number;
}

export function getOverclockedRecipeStats(
  recipe: Pick<Recipe, "durationTicks" | "eut" | "minimumTier">,
  node: Pick<FactoryNode, "overclockTier">,
): OverclockedRecipeStats {
  const minimumTier = getRecipeMinimumVoltageTier(recipe);
  const requestedTier = resolveVoltageTier(node.overclockTier, minimumTier);
  const tier =
    getVoltageTierIndex(requestedTier) < getVoltageTierIndex(minimumTier)
      ? minimumTier
      : requestedTier;
  const overclockSteps = Math.max(0, getVoltageTierIndex(tier) - getVoltageTierIndex(minimumTier));

  return {
    tier,
    minimumTier,
    overclockSteps,
    durationTicks: Math.max(1, recipe.durationTicks / 2 ** overclockSteps),
    eut: recipe.eut * 4 ** overclockSteps,
  };
}

function getRecipeMinimumVoltageTier(recipe: Pick<Recipe, "eut" | "minimumTier">): VoltageTier {
  const declaredMinimum = resolveVoltageTier(recipe.minimumTier, getRecipePowerTier(recipe));
  const powerTier = getRecipePowerTier(recipe);

  return getVoltageTierIndex(declaredMinimum) >= getVoltageTierIndex(powerTier)
    ? declaredMinimum
    : powerTier;
}

function resolveVoltageTier(value: string, fallback: VoltageTier): VoltageTier {
  return GT_VOLTAGE_TIERS.find((entry) => entry.tier === value)?.tier ?? fallback;
}
