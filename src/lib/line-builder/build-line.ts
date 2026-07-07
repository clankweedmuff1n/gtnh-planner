import { isRecipeInputConsumed, resourceMatchesInput } from "@/lib/model/resources";
import { getVoltageTierIndex } from "@/lib/model/tiers";
import type {
  FactoryNode,
  FactoryProject,
  MachineTier,
  Recipe,
  RecipeInput,
  ResourceAmount,
} from "@/lib/model/types";
import type { RecipeSummary } from "@/lib/datasets/types";

/**
 * Async access to the recipe dataset. Injected so the builder stays pure and
 * testable; the store wires it to the browser dataset API.
 */
export interface LineBuilderDataSource {
  /** Recipes whose outputs contain the resource ("recipes" mode query). */
  findRecipesProducing(
    resource: Pick<ResourceAmount, "kind" | "id">,
  ): Promise<RecipeSummary[]>;
  fetchRecipe(recipeId: string): Promise<Recipe>;
}

export interface BuildLineOptions {
  /** How many crafting steps below the target to expand. */
  maxDepth?: number;
  /** Hard cap on placed nodes per run, complex lines can explode. */
  maxNewNodes?: number;
}

export interface BuildLineExternalInput {
  kind: ResourceAmount["kind"];
  id: string;
  displayName?: string;
  reason: "no-recipe" | "depth-limit" | "node-limit";
}

export interface BuildLineResult {
  /** Recipes to merge into the project (may include already-present ones). */
  recipes: Recipe[];
  /** Freshly placed nodes, positioned left of the target by depth. */
  nodes: FactoryNode[];
  /** Leaf resources the line will consume from outside. */
  externalInputs: BuildLineExternalInput[];
  diagnostics: string[];
}

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_NEW_NODES = 40;
const COLUMN_WIDTH = 480;
const ROW_HEIGHT = 320;

type PendingInput = {
  input: RecipeInput;
  depth: number;
};

/**
 * Expands the process line upstream from a target node: finds a producing
 * recipe for every unsatisfied input, places it, and repeats until the chain
 * bottoms out in raw resources. Each resource gets at most one producer, so
 * recipe cycles (acid loops, byproduct recycling) come out as closed loops —
 * the caller is expected to auto-connect the placed nodes afterwards, which
 * also wires byproducts back into consumers.
 */
export async function buildLine(
  project: FactoryProject,
  targetNodeId: string,
  dataSource: LineBuilderDataSource,
  options: BuildLineOptions = {},
): Promise<BuildLineResult> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxNewNodes = options.maxNewNodes ?? DEFAULT_MAX_NEW_NODES;
  const diagnostics: string[] = [];

  const targetNode = project.nodes.find((node) => node.id === targetNodeId);
  const targetRecipe = project.recipes.find((recipe) => recipe.id === targetNode?.recipeId);
  if (!targetNode || !targetRecipe) {
    return {
      recipes: [],
      nodes: [],
      externalInputs: [],
      diagnostics: ["line-builder:target-not-found"],
    };
  }

  // Everything the line can already make, including what we place as we go.
  const lineRecipes: Recipe[] = project.nodes.flatMap((node) => {
    const recipe = project.recipes.find((entry) => entry.id === node.recipeId);
    return recipe ? [recipe] : [];
  });

  const newRecipes = new Map<string, Recipe>();
  const newNodes: FactoryNode[] = [];
  const externalInputs: BuildLineExternalInput[] = [];
  const nodesPerDepth = new Map<number, number>();
  const handledResources = new Set<string>();

  const queue: PendingInput[] = consumedInputs(targetRecipe).map((input) => ({
    input,
    depth: 1,
  }));

  while (queue.length > 0) {
    const { input, depth } = queue.shift()!;
    const resourceToken = `${input.kind}:${input.id}`;
    if (handledResources.has(resourceToken)) {
      continue;
    }
    handledResources.add(resourceToken);

    if (isProducedByLine(lineRecipes, input)) {
      // A placed node (or the target itself) already makes this — the
      // auto-connect pass will close the loop.
      continue;
    }

    if (depth > maxDepth) {
      externalInputs.push(externalInput(input, "depth-limit"));
      continue;
    }
    if (newNodes.length >= maxNewNodes) {
      externalInputs.push(externalInput(input, "node-limit"));
      continue;
    }

    let candidates: RecipeSummary[];
    try {
      candidates = await dataSource.findRecipesProducing({ kind: input.kind, id: input.id });
    } catch (error) {
      diagnostics.push(
        `line-builder:query-failed:${resourceToken}:${error instanceof Error ? error.message : "unknown"}`,
      );
      externalInputs.push(externalInput(input, "no-recipe"));
      continue;
    }

    const best = pickBestCandidate(candidates, input, project, lineRecipes);
    if (!best) {
      externalInputs.push(externalInput(input, "no-recipe"));
      continue;
    }

    let recipe: Recipe;
    try {
      recipe = await dataSource.fetchRecipe(best.id);
    } catch (error) {
      diagnostics.push(
        `line-builder:fetch-failed:${best.id}:${error instanceof Error ? error.message : "unknown"}`,
      );
      externalInputs.push(externalInput(input, "no-recipe"));
      continue;
    }

    newRecipes.set(recipe.id, recipe);
    lineRecipes.push(recipe);

    const row = nodesPerDepth.get(depth) ?? 0;
    nodesPerDepth.set(depth, row + 1);
    newNodes.push({
      id: createNodeId(),
      recipeId: recipe.id,
      machineCount: 1,
      parallel: 1,
      overclockTier: recipe.minimumTier,
      enabled: true,
      position: {
        x: targetNode.position.x - depth * COLUMN_WIDTH,
        y: targetNode.position.y + row * ROW_HEIGHT,
      },
    });

    for (const nextInput of consumedInputs(recipe)) {
      queue.push({ input: nextInput, depth: depth + 1 });
    }
  }

  diagnostics.push(
    `line-builder:placed:${newNodes.length}`,
    `line-builder:external:${externalInputs.length}`,
  );

  return { recipes: [...newRecipes.values()], nodes: newNodes, externalInputs, diagnostics };
}

function consumedInputs(recipe: Recipe): RecipeInput[] {
  return recipe.inputs.filter(isRecipeInputConsumed);
}

function isProducedByLine(lineRecipes: Recipe[], input: RecipeInput): boolean {
  return lineRecipes.some((recipe) =>
    recipe.outputs.some((output) => resourceMatchesInput(output, input)),
  );
}

function pickBestCandidate(
  candidates: RecipeSummary[],
  input: RecipeInput,
  project: FactoryProject,
  lineRecipes: Recipe[],
): RecipeSummary | undefined {
  const projectRecipeIds = new Set(project.recipes.map((recipe) => recipe.id));

  let best: RecipeSummary | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const matchingOutput = candidate.outputs.find((output) =>
      resourceMatchesInput(output, input),
    );
    if (!matchingOutput) {
      continue;
    }
    // A recipe that also eats the resource cannot be its net producer
    // (charging, repairing, and repackaging recipes).
    if (candidate.inputs.some((entry) => resourceMatchesInput(entry, input))) {
      continue;
    }

    let score = 0;
    if (projectRecipeIds.has(candidate.id)) {
      score += 1000;
    }
    if (candidate.outputs[0] === matchingOutput) {
      score += 100;
    }
    if ((matchingOutput.chance ?? 1) < 1) {
      score -= 40;
    }
    score -= 20 * tierRank(candidate.minimumTier);
    const inputs = candidate.inputs.filter(isRecipeInputConsumed);
    score -= 10 * inputs.length;
    for (const entry of inputs) {
      if (isProducedByLine(lineRecipes, entry)) {
        score += 40;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function tierRank(tier: string): number {
  return getVoltageTierIndex(tier as Exclude<MachineTier, "DEMO">);
}

function externalInput(
  input: RecipeInput,
  reason: BuildLineExternalInput["reason"],
): BuildLineExternalInput {
  return {
    kind: input.kind,
    id: input.id,
    displayName: input.displayName,
    reason,
  };
}

function createNodeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `node-${crypto.randomUUID()}`;
  }
  return `node-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
