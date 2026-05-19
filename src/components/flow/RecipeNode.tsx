"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FactoryNode, NodeThroughputResult, Recipe } from "@/lib/model/types";
import { formatRate, formatResourceRate, makeResourceKey, primaryOutput } from "@/lib/model";

export interface RecipeNodeData extends Record<string, unknown> {
  projectNode: FactoryNode;
  recipe: Recipe;
  result?: NodeThroughputResult;
}

export type RecipeFlowNode = Node<RecipeNodeData, "recipeNode">;

export function RecipeNode({ data, selected }: NodeProps<RecipeFlowNode>) {
  const { projectNode, recipe, result } = data;
  const primary = primaryOutput(recipe);
  const primaryFlow = primary
    ? result?.outputs[makeResourceKey(primary.kind, primary.id)]
    : undefined;
  const utilization = result?.utilization ?? 0;
  const utilizationPercent = Number.isFinite(utilization) ? utilization * 100 : 999;
  const progressWidth = `${Math.min(Math.max(utilizationPercent, 0), 100)}%`;
  const status = result?.status ?? "underutilized";
  const color = getStatusColor(status);

  return (
    <div
      className={[
        "min-w-[240px] rounded border bg-white shadow-sm",
        selected ? "ring-2 ring-neutral-900" : "",
        color.border,
      ].join(" ")}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-white !bg-neutral-500"
      />
      <div className={["rounded-t px-3 py-2", color.header].join(" ")}>
        <div className="truncate text-sm font-semibold text-neutral-950">{recipe.name}</div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-neutral-600">
          <span className="truncate">{recipe.machineType}</span>
          <span>{projectNode.machineCount}x</span>
        </div>
      </div>
      <div className="space-y-2 px-3 py-2 text-xs text-neutral-700">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Util" value={`${formatRate(utilizationPercent, 1)}%`} />
          <Metric label="EU/t" value={formatRate(result?.euT ?? 0, 0)} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-neutral-500">
            <span>Primary output</span>
            <span>{formatResourceRate(primaryFlow)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-neutral-200">
            <div
              className={["h-full rounded", color.bar].join(" ")}
              style={{ width: progressWidth }}
            />
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-white !bg-neutral-700"
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="truncate font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

function getStatusColor(status: NodeThroughputResult["status"]) {
  if (status === "balanced") {
    return {
      border: "border-emerald-500",
      header: "bg-emerald-50",
      bar: "bg-emerald-500",
    };
  }

  if (status === "bottleneck" || status === "missing-recipe") {
    return {
      border: "border-red-500",
      header: "bg-red-50",
      bar: "bg-red-500",
    };
  }

  if (status === "disabled") {
    return {
      border: "border-neutral-300 opacity-70",
      header: "bg-neutral-100",
      bar: "bg-neutral-400",
    };
  }

  return {
    border: "border-amber-500",
    header: "bg-amber-50",
    bar: "bg-amber-500",
  };
}
