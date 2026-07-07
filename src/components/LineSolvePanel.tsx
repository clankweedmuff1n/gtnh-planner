"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
import { formatRate, resourceLabel } from "@/lib/model/resources";
import type { ResourceKey } from "@/lib/model/types";
import { useFactoryStore } from "@/store/factory-store";

export function LineSolvePanel() {
  const result = useFactoryStore((state) => state.lastLineSolve);
  const buildResult = useFactoryStore((state) => state.lastLineBuild);
  const buildError = useFactoryStore((state) => state.lineBuildError);
  const project = useFactoryStore((state) => state.project);
  const dismiss = useFactoryStore((state) => state.dismissLineSolve);

  const labels = useMemo(() => {
    const byKey = new Map<ResourceKey, string>();
    if (!result) {
      return byKey;
    }
    for (const recipe of project.recipes) {
      for (const resource of [...recipe.inputs, ...recipe.outputs]) {
        const key = `${resource.kind}:${resource.id}` as ResourceKey;
        if (!byKey.has(key)) {
          byKey.set(key, resourceLabel(resource));
        }
      }
    }
    return byKey;
  }, [project.recipes, result]);

  if (!result && !buildResult && !buildError) {
    return null;
  }

  const nodeName = (nodeId: string) => {
    const node = project.nodes.find((entry) => entry.id === nodeId);
    const recipe = node && project.recipes.find((entry) => entry.id === node.recipeId);
    return recipe?.name ?? nodeId;
  };
  const label = (key: ResourceKey) => labels.get(key) ?? key;
  const unit = (key: ResourceKey) => (key.startsWith("fluid:") ? "mB/s" : "/s");

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-40 w-[min(480px,90%)] -translate-x-1/2 rounded-lg border border-neutral-300 bg-white/95 p-4 text-sm shadow-xl backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">
          {buildError
            ? "Line build failed"
            : !result
              ? "Line built"
              : result.status === "optimal"
                ? "Line solved"
                : `Line solve failed: ${result.status}`}
        </h3>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss line solve summary"
          className="rounded p-1 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {buildError ? (
        <p className="mb-2 text-red-600 dark:text-red-400">{buildError}</p>
      ) : null}

      {buildResult ? (
        <section className="mb-3">
          <h4 className="mb-1 font-medium text-violet-700 dark:text-violet-400">
            Auto-built chain
          </h4>
          <p className="text-neutral-600 dark:text-neutral-400">
            Placed {buildResult.nodes.length} node{buildResult.nodes.length === 1 ? "" : "s"}.
          </p>
          {buildResult.externalInputs.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {buildResult.externalInputs.map((entry) => (
                <li
                  key={`${entry.kind}:${entry.id}`}
                  className="flex justify-between gap-2 text-neutral-600 dark:text-neutral-300"
                >
                  <span>{entry.displayName ?? entry.id}</span>
                  <span className="text-neutral-400">
                    {entry.reason === "no-recipe" ? "raw input" : "not expanded"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!result ? null : result.status !== "optimal" ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          {result.status === "infeasible"
            ? "No steady state satisfies the current targets — check loop ratios and disabled nodes."
            : "The line could not be solved. See diagnostics below."}
        </p>
      ) : (
        <div className="space-y-3">
          <section>
            <h4 className="mb-1 font-medium text-amber-700 dark:text-amber-400">
              External inputs required
            </h4>
            {result.externalInputs.length === 0 ? (
              <p className="text-neutral-500">None — the line is fully self-contained.</p>
            ) : (
              <ul className="space-y-0.5">
                {result.externalInputs.map((entry) => (
                  <li key={entry.resourceKey} className="flex justify-between gap-2">
                    <span>{label(entry.resourceKey)}</span>
                    <span className="tabular-nums text-neutral-600 dark:text-neutral-300">
                      {formatRate(entry.ratePerSecond)} {unit(entry.resourceKey)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {result.loops.length > 0 && (
            <section>
              <h4 className="mb-1 font-medium text-cyan-700 dark:text-cyan-400">
                Closed loops (steady-state circulation)
              </h4>
              <ul className="space-y-1">
                {result.loops.map((loop, index) => (
                  <li key={index}>
                    <span className="text-neutral-500">
                      {loop.nodeIds.map(nodeName).join(" → ")}
                    </span>
                    <ul className="ml-3">
                      {loop.resources.map((resource) => (
                        <li key={resource.resourceKey} className="flex justify-between gap-2">
                          <span>{label(resource.resourceKey)}</span>
                          <span className="tabular-nums text-neutral-600 dark:text-neutral-300">
                            {formatRate(resource.ratePerSecond)} {unit(resource.resourceKey)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.surpluses.length > 0 && (
            <section>
              <h4 className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">
                Outputs and surplus
              </h4>
              <ul className="space-y-0.5">
                {result.surpluses.map((entry) => (
                  <li key={entry.resourceKey} className="flex justify-between gap-2">
                    <span>
                      {label(entry.resourceKey)}
                      {entry.isTarget ? " (target)" : ""}
                    </span>
                    <span className="tabular-nums text-neutral-600 dark:text-neutral-300">
                      {formatRate(entry.ratePerSecond)} {unit(entry.resourceKey)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.idleNodeIds.length > 0 && (
            <section>
              <h4 className="mb-1 font-medium text-neutral-500">Unused at steady state</h4>
              <p className="text-neutral-500">{result.idleNodeIds.map(nodeName).join(", ")}</p>
            </section>
          )}
        </div>
      )}

      {((result?.diagnostics.length ?? 0) > 0 || (buildResult?.diagnostics.length ?? 0) > 0) && (
        <details className="mt-2 text-xs text-neutral-500">
          <summary className="cursor-pointer">Diagnostics</summary>
          <ul>
            {[...(buildResult?.diagnostics ?? []), ...(result?.diagnostics ?? [])].map(
              (entry, index) => (
                <li key={index}>{entry}</li>
              ),
            )}
          </ul>
        </details>
      )}
    </div>
  );
}
