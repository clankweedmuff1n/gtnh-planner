import { makeResourceKey } from "@/lib/model/resources";
import type { FactoryEdge, FactoryProject, ResourceKey } from "@/lib/model/types";
import {
  buildGraphContext,
  convertOutputRateForEdge,
  getEdgeTargetDemandKeyFromPlans,
  getPlanOutputKeyForEdge,
  storageBusId,
  type GraphContext,
} from "./machine-count-optimizer";
import { solveLinearProgram, type LpConstraint } from "./simplex";

const EPSILON = 0.000001;

/**
 * Objective weights per resource unit. Fluids are measured in mB, so a raw
 * 1:1 weight against items would make the solver sacrifice thousands of items
 * to save a bucket of water; 1/1000 puts both on a comparable scale.
 */
const ITEM_WEIGHT = 1;
const FLUID_WEIGHT = 0.001;
/**
 * Topping up an input that already has a drawn supply line means the loop
 * failed to close — much worse than importing a raw resource nobody makes.
 */
const TOP_UP_MULTIPLIER = 1000;
/**
 * Importing a resource the line only ever gets as a byproduct (spent acid,
 * slag, ...) is normally impossible in game, so make it a last resort. The
 * solver then tops up lossy loops with the loop's craftable feed instead.
 */
const BYPRODUCT_MULTIPLIER = 100;
/** Tie-breakers: prefer fewer machines and no pointless circulating flow. */
const MACHINE_COST = 0.000001;
const FLOW_COST = 0.000000001;

export type LineSolveStatus = "optimal" | "infeasible" | "unbounded" | "empty";

export interface LineSolveExternalInput {
  resourceKey: ResourceKey;
  ratePerSecond: number;
  nodeIds: string[];
}

export interface LineSolveSurplus {
  resourceKey: ResourceKey;
  ratePerSecond: number;
  nodeIds: string[];
  isTarget: boolean;
}

export interface LineSolveLoop {
  nodeIds: string[];
  /** Steady-state circulating rates inside the loop — priming hints. */
  resources: { resourceKey: ResourceKey; ratePerSecond: number }[];
}

export interface LineSolveResult {
  status: LineSolveStatus;
  /** Suggested integer machine counts for solvable nodes (>= 1). */
  machineCounts: Map<string, number>;
  /** Exact fractional machine counts from the LP. */
  exactMachineCounts: Map<string, number>;
  /** Nodes the steady state does not need at all. */
  idleNodeIds: string[];
  externalInputs: LineSolveExternalInput[];
  surpluses: LineSolveSurplus[];
  loops: LineSolveLoop[];
  diagnostics: string[];
}

type FlowVariable = {
  index: number;
  sourceEndpoint: string;
  targetEndpoint: string;
  resourceKey: ResourceKey;
  /** Output units produced per unit of flow (cell -> fluid conversions). */
  outputPerFlowUnit: number;
  sourceNodeOutputKey?: ResourceKey;
  sourceNodeId?: string;
  targetNodeId?: string;
  targetInputKey?: ResourceKey;
  poolKey?: ResourceKey;
  poolDirection?: "in" | "out";
};

type ExternalVariable = {
  index: number;
  nodeId: string;
  inputKey: ResourceKey;
};

/**
 * Solves the whole process line as a steady-state linear program: machine
 * counts and edge flows are chosen so that every drawn connection balances,
 * recycled byproducts loop back onto themselves, and the total externally
 * supplied input is minimal for the requested target rate. Complements the
 * demand-propagation optimizer in machine-count-optimizer.ts, which cannot
 * balance loops that need partial external top-up (platline-style acid
 * cycles).
 */
export function solveProcessLine(project: FactoryProject): LineSolveResult {
  const context = buildGraphContext(project);
  const diagnostics: string[] = [];

  const solvableNodeIds = project.nodes
    .filter((node) => {
      const plan = context.ratePlans.get(node.id);
      return plan?.enabled && plan.valid && plan.recipe;
    })
    .map((node) => node.id);

  if (solvableNodeIds.length === 0) {
    return emptyResult("empty", ["line-solver:no-solvable-nodes"]);
  }

  let variableCount = 0;
  const machineVarByNodeId = new Map<string, number>();
  for (const nodeId of solvableNodeIds) {
    machineVarByNodeId.set(nodeId, variableCount);
    variableCount += 1;
  }

  const flows: FlowVariable[] = [];
  for (const edge of project.edges) {
    const flow = buildFlowVariable(context, edge, machineVarByNodeId, variableCount, diagnostics);
    if (flow) {
      flows.push(flow);
      variableCount += 1;
    }
  }

  // One external top-up variable per consumed node input. This is what makes
  // loops solvable: a self-sustaining loop keeps its top-up at zero, a lossy
  // loop imports exactly the deficit instead of becoming infeasible.
  const externals: ExternalVariable[] = [];
  for (const nodeId of solvableNodeIds) {
    const plan = context.ratePlans.get(nodeId);
    for (const inputKey of plan?.inputs.keys() ?? []) {
      externals.push({ index: variableCount, nodeId, inputKey });
      variableCount += 1;
    }
  }

  const constraints: LpConstraint[] = [];
  const objective = new Map<number, number>();

  const suppliedInputs = new Set(
    flows.flatMap((flow) =>
      flow.targetNodeId && flow.targetInputKey
        ? [`${flow.targetNodeId}|${flow.targetInputKey}`]
        : [],
    ),
  );
  const primaryOutputKeys = collectPrimaryOutputKeys(context, solvableNodeIds);
  const producedKeys = collectProducedKeys(context, solvableNodeIds);

  for (const nodeId of solvableNodeIds) {
    objective.set(machineVarByNodeId.get(nodeId) ?? 0, MACHINE_COST);
  }
  for (const flow of flows) {
    objective.set(flow.index, FLOW_COST);
  }
  for (const external of externals) {
    let weight = resourceWeight(external.inputKey);
    if (suppliedInputs.has(`${external.nodeId}|${external.inputKey}`)) {
      weight *= TOP_UP_MULTIPLIER;
      if (producedKeys.has(external.inputKey) && !primaryOutputKeys.has(external.inputKey)) {
        weight *= BYPRODUCT_MULTIPLIER;
      }
    }
    objective.set(external.index, weight);
  }

  // Input balance: edge flows plus external top-up exactly cover consumption.
  for (const external of externals) {
    const plan = context.ratePlans.get(external.nodeId);
    const inputRate = plan?.inputs.get(external.inputKey) ?? 0;
    const coefficients = new Map<number, number>([[external.index, 1]]);
    for (const flow of flows) {
      if (flow.targetNodeId === external.nodeId && flow.targetInputKey === external.inputKey) {
        coefficients.set(flow.index, (coefficients.get(flow.index) ?? 0) + 1);
      }
    }
    const machineVar = machineVarByNodeId.get(external.nodeId);
    if (machineVar === undefined || inputRate <= EPSILON) {
      continue;
    }
    coefficients.set(machineVar, -inputRate);
    constraints.push({ coefficients, relation: "=", rhs: 0 });
  }

  // Output capacity: routed flow cannot exceed production.
  for (const nodeId of solvableNodeIds) {
    const plan = context.ratePlans.get(nodeId);
    const machineVar = machineVarByNodeId.get(nodeId);
    if (!plan || machineVar === undefined) {
      continue;
    }
    for (const [outputKey, outputRate] of plan.outputs) {
      const coefficients = new Map<number, number>();
      for (const flow of flows) {
        if (flow.sourceNodeId === nodeId && flow.sourceNodeOutputKey === outputKey) {
          coefficients.set(
            flow.index,
            (coefficients.get(flow.index) ?? 0) + flow.outputPerFlowUnit,
          );
        }
      }
      if (coefficients.size === 0) {
        continue;
      }
      coefficients.set(machineVar, -outputRate);
      constraints.push({ coefficients, relation: "<=", rhs: 0 });
    }
  }

  // Storage pools only redistribute what flows into them.
  const poolKeys = new Set(flows.flatMap((flow) => (flow.poolKey ? [flow.poolKey] : [])));
  for (const poolKey of poolKeys) {
    const coefficients = new Map<number, number>();
    for (const flow of flows) {
      if (flow.poolKey !== poolKey) {
        continue;
      }
      const sign = flow.poolDirection === "out" ? 1 : -1;
      coefficients.set(flow.index, (coefficients.get(flow.index) ?? 0) + sign);
    }
    if (coefficients.size > 0) {
      constraints.push({ coefficients, relation: "<=", rhs: 0 });
    }
  }

  const targeted = addTargetConstraints(
    context,
    solvableNodeIds,
    machineVarByNodeId,
    constraints,
    diagnostics,
  );
  if (!targeted) {
    addImplicitDemandConstraints(
      context,
      solvableNodeIds,
      machineVarByNodeId,
      constraints,
      diagnostics,
    );
  }

  const solution = solveLinearProgram({ variableCount, objective, constraints });
  if (solution.status !== "optimal") {
    diagnostics.push(`line-solver:${solution.status}`);
    return emptyResult(solution.status, diagnostics);
  }

  return buildResult(context, solvableNodeIds, machineVarByNodeId, flows, externals, solution.values, diagnostics);
}

function buildFlowVariable(
  context: GraphContext,
  edge: FactoryEdge,
  machineVarByNodeId: Map<string, number>,
  index: number,
  diagnostics: string[],
): FlowVariable | undefined {
  const sourcePoolKey = context.storageResourceById.get(edge.source);
  const targetPoolKey = context.storageResourceById.get(edge.target);

  if (sourcePoolKey && targetPoolKey) {
    diagnostics.push(`line-solver:storage-to-storage-edge-ignored:${edge.id}`);
    return undefined;
  }

  if (sourcePoolKey) {
    const targetInputKey = getEdgeTargetDemandKeyFromPlans(context.ratePlans, edge);
    if (!targetInputKey || !machineVarByNodeId.has(edge.target)) {
      return undefined;
    }
    return {
      index,
      sourceEndpoint: storageBusId(sourcePoolKey),
      targetEndpoint: edge.target,
      resourceKey: sourcePoolKey,
      outputPerFlowUnit: 1,
      targetNodeId: edge.target,
      targetInputKey,
      poolKey: sourcePoolKey,
      poolDirection: "out",
    };
  }

  const sourcePlan = context.ratePlans.get(edge.source);
  const outputKey = getPlanOutputKeyForEdge(sourcePlan, edge);
  if (!outputKey || !sourcePlan || !machineVarByNodeId.has(edge.source)) {
    return undefined;
  }
  const edgeUnitsPerOutputUnit = convertOutputRateForEdge(sourcePlan, edge, outputKey, 1);
  if (edgeUnitsPerOutputUnit <= EPSILON) {
    return undefined;
  }
  const outputPerFlowUnit = 1 / edgeUnitsPerOutputUnit;

  if (targetPoolKey) {
    return {
      index,
      sourceEndpoint: edge.source,
      targetEndpoint: storageBusId(targetPoolKey),
      resourceKey: targetPoolKey,
      outputPerFlowUnit,
      sourceNodeId: edge.source,
      sourceNodeOutputKey: outputKey,
      poolKey: targetPoolKey,
      poolDirection: "in",
    };
  }

  const targetInputKey = getEdgeTargetDemandKeyFromPlans(context.ratePlans, edge);
  if (!targetInputKey || !machineVarByNodeId.has(edge.target)) {
    return undefined;
  }
  return {
    index,
    sourceEndpoint: edge.source,
    targetEndpoint: edge.target,
    resourceKey: makeResourceKey(edge.resourceKind, edge.resourceId),
    outputPerFlowUnit,
    sourceNodeId: edge.source,
    sourceNodeOutputKey: outputKey,
    targetNodeId: edge.target,
    targetInputKey,
  };
}

function addTargetConstraints(
  context: GraphContext,
  solvableNodeIds: string[],
  machineVarByNodeId: Map<string, number>,
  constraints: LpConstraint[],
  diagnostics: string[],
): boolean {
  let targeted = false;

  for (const nodeId of solvableNodeIds) {
    const node = context.nodesById.get(nodeId);
    if (!node?.targetOutput) {
      continue;
    }
    const key = makeResourceKey(node.targetOutput.kind, node.targetOutput.resourceId);
    const outputRate = context.ratePlans.get(nodeId)?.outputs.get(key) ?? 0;
    const machineVar = machineVarByNodeId.get(nodeId);
    if (outputRate <= EPSILON || machineVar === undefined) {
      diagnostics.push(`line-solver:target-output-unproducible:${nodeId}`);
      continue;
    }
    constraints.push({
      coefficients: new Map([[machineVar, outputRate]]),
      relation: ">=",
      rhs: node.targetOutput.amountPerSecond,
    });
    targeted = true;
  }

  const targetRate = context.project.targetRate;
  if (targetRate) {
    const key = makeResourceKey(targetRate.kind, targetRate.resourceId);
    const coefficients = new Map<number, number>();
    for (const nodeId of solvableNodeIds) {
      const plan = context.ratePlans.get(nodeId);
      const machineVar = machineVarByNodeId.get(nodeId);
      if (!plan || machineVar === undefined) {
        continue;
      }
      const net = (plan.outputs.get(key) ?? 0) - (plan.inputs.get(key) ?? 0);
      if (Math.abs(net) > EPSILON) {
        coefficients.set(machineVar, net);
      }
    }
    if (coefficients.size === 0) {
      diagnostics.push("line-solver:target-rate-unproducible");
    } else {
      constraints.push({ coefficients, relation: ">=", rhs: targetRate.amountPerSecond });
      targeted = true;
    }
  }

  return targeted;
}

function addImplicitDemandConstraints(
  context: GraphContext,
  solvableNodeIds: string[],
  machineVarByNodeId: Map<string, number>,
  constraints: LpConstraint[],
  diagnostics: string[],
) {
  const terminalNodeIds = solvableNodeIds.filter((nodeId) =>
    isImplicitTerminalNode(context, nodeId),
  );
  const anchorNodeIds = terminalNodeIds.length > 0 ? terminalNodeIds : solvableNodeIds;
  if (terminalNodeIds.length === 0) {
    diagnostics.push("line-solver:no-terminal-nodes:anchoring-all");
  }

  for (const nodeId of anchorNodeIds) {
    const machineVar = machineVarByNodeId.get(nodeId);
    if (machineVar !== undefined) {
      constraints.push({
        coefficients: new Map([[machineVar, 1]]),
        relation: ">=",
        rhs: 1,
      });
    }
  }
}

function isImplicitTerminalNode(context: GraphContext, nodeId: string): boolean {
  if ((context.nodeToNodeEdges.get(nodeId) ?? []).length > 0) {
    return false;
  }

  return (context.nodeToStorageEdges.get(nodeId) ?? []).every((edge) => {
    const storageKey = context.storageResourceById.get(edge.target);
    return (
      !storageKey || (context.storageConsumersByResource.get(storageKey) ?? []).length === 0
    );
  });
}

function buildResult(
  context: GraphContext,
  solvableNodeIds: string[],
  machineVarByNodeId: Map<string, number>,
  flows: FlowVariable[],
  externals: ExternalVariable[],
  values: number[],
  diagnostics: string[],
): LineSolveResult {
  const exactMachineCounts = new Map<string, number>();
  const machineCounts = new Map<string, number>();
  const idleNodeIds: string[] = [];

  for (const nodeId of solvableNodeIds) {
    const machineVar = machineVarByNodeId.get(nodeId);
    const exact = machineVar === undefined ? 0 : Math.max(0, values[machineVar]);
    exactMachineCounts.set(nodeId, exact);
    machineCounts.set(nodeId, Math.max(1, Math.ceil(exact - EPSILON)));
    if (exact <= EPSILON) {
      idleNodeIds.push(nodeId);
    }
  }

  const externalByResource = new Map<ResourceKey, { rate: number; nodeIds: Set<string> }>();
  for (const external of externals) {
    const rate = values[external.index];
    if (rate <= EPSILON) {
      continue;
    }
    const entry = externalByResource.get(external.inputKey) ?? { rate: 0, nodeIds: new Set() };
    entry.rate += rate;
    entry.nodeIds.add(external.nodeId);
    externalByResource.set(external.inputKey, entry);
  }

  const targetKeys = collectTargetKeys(context);
  const surplusByResource = new Map<ResourceKey, { rate: number; nodeIds: Set<string> }>();
  for (const nodeId of solvableNodeIds) {
    const plan = context.ratePlans.get(nodeId);
    const machineVar = machineVarByNodeId.get(nodeId);
    if (!plan || machineVar === undefined) {
      continue;
    }
    for (const [outputKey, outputRate] of plan.outputs) {
      let routed = 0;
      for (const flow of flows) {
        if (flow.sourceNodeId === nodeId && flow.sourceNodeOutputKey === outputKey) {
          routed += values[flow.index] * flow.outputPerFlowUnit;
        }
      }
      const surplus = outputRate * values[machineVar] - routed;
      if (surplus <= EPSILON) {
        continue;
      }
      const entry = surplusByResource.get(outputKey) ?? { rate: 0, nodeIds: new Set() };
      entry.rate += surplus;
      entry.nodeIds.add(nodeId);
      surplusByResource.set(outputKey, entry);
    }
  }

  return {
    status: "optimal",
    machineCounts,
    exactMachineCounts,
    idleNodeIds,
    externalInputs: [...externalByResource.entries()]
      .map(([resourceKey, entry]) => ({
        resourceKey,
        ratePerSecond: entry.rate,
        nodeIds: [...entry.nodeIds],
      }))
      .sort((a, b) => b.ratePerSecond - a.ratePerSecond),
    surpluses: [...surplusByResource.entries()]
      .map(([resourceKey, entry]) => ({
        resourceKey,
        ratePerSecond: entry.rate,
        nodeIds: [...entry.nodeIds],
        isTarget: targetKeys.has(resourceKey),
      }))
      .sort((a, b) => b.ratePerSecond - a.ratePerSecond),
    loops: buildLoopReports(context, flows, values),
    diagnostics,
  };
}

function collectTargetKeys(context: GraphContext): Set<ResourceKey> {
  const keys = new Set<ResourceKey>();
  if (context.project.targetRate) {
    keys.add(
      makeResourceKey(context.project.targetRate.kind, context.project.targetRate.resourceId),
    );
  }
  for (const node of context.project.nodes) {
    if (node.targetOutput) {
      keys.add(makeResourceKey(node.targetOutput.kind, node.targetOutput.resourceId));
    }
  }
  return keys;
}

function buildLoopReports(
  context: GraphContext,
  flows: FlowVariable[],
  values: number[],
): LineSolveLoop[] {
  const loopFlows = new Map<number, Map<ResourceKey, number>>();
  const loopNodes = new Map<number, Set<string>>();

  for (const flow of flows) {
    const sourceComponent = context.componentByEndpoint.get(flow.sourceEndpoint);
    const targetComponent = context.componentByEndpoint.get(flow.targetEndpoint);
    if (
      sourceComponent === undefined ||
      sourceComponent !== targetComponent ||
      !context.cyclicComponents.has(sourceComponent)
    ) {
      continue;
    }
    const rate = values[flow.index];
    if (rate <= EPSILON) {
      continue;
    }
    const rates = loopFlows.get(sourceComponent) ?? new Map<ResourceKey, number>();
    rates.set(flow.resourceKey, Math.max(rates.get(flow.resourceKey) ?? 0, rate));
    loopFlows.set(sourceComponent, rates);

    const nodes = loopNodes.get(sourceComponent) ?? new Set<string>();
    if (flow.sourceNodeId) {
      nodes.add(flow.sourceNodeId);
    }
    if (flow.targetNodeId) {
      nodes.add(flow.targetNodeId);
    }
    loopNodes.set(sourceComponent, nodes);
  }

  return [...loopFlows.entries()].map(([component, rates]) => ({
    nodeIds: [...(loopNodes.get(component) ?? [])],
    resources: [...rates.entries()]
      .map(([resourceKey, ratePerSecond]) => ({ resourceKey, ratePerSecond }))
      .sort((a, b) => b.ratePerSecond - a.ratePerSecond),
  }));
}

/** Resources that appear at slot 0 of some producing recipe in the project. */
function collectPrimaryOutputKeys(
  context: GraphContext,
  solvableNodeIds: string[],
): Set<ResourceKey> {
  const keys = new Set<ResourceKey>();
  for (const nodeId of solvableNodeIds) {
    const plan = context.ratePlans.get(nodeId);
    const primary = (plan?.effectiveRecipe ?? plan?.recipe)?.outputs[0];
    if (primary) {
      keys.add(makeResourceKey(primary.kind, primary.id));
    }
  }
  return keys;
}

function collectProducedKeys(context: GraphContext, solvableNodeIds: string[]): Set<ResourceKey> {
  const keys = new Set<ResourceKey>();
  for (const nodeId of solvableNodeIds) {
    for (const outputKey of context.ratePlans.get(nodeId)?.outputs.keys() ?? []) {
      keys.add(outputKey);
    }
  }
  return keys;
}

function resourceWeight(resourceKey: ResourceKey): number {
  return resourceKey.startsWith("fluid:") ? FLUID_WEIGHT : ITEM_WEIGHT;
}

function emptyResult(status: LineSolveStatus, diagnostics: string[]): LineSolveResult {
  return {
    status,
    machineCounts: new Map(),
    exactMachineCounts: new Map(),
    idleNodeIds: [],
    externalInputs: [],
    surpluses: [],
    loops: [],
    diagnostics,
  };
}
