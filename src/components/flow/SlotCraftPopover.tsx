"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { DEFAULT_DATASET_MANIFEST_URL } from "@/lib/datasets";
import {
  getRecipeDatasetRecipe,
  queryRecipeDatasetRecipes,
} from "@/lib/datasets/browser-loader";
import type { RecipeSummary } from "@/lib/datasets/types";
import { useFactoryStore, type RecipeInputContextResource } from "@/store/factory-store";
import { ResourceIcon } from "@/components/nei/ResourceIcon";

const MAX_RESULTS = 10;
const POPOVER_WIDTH = 240;

export interface SlotCraftTarget {
  resource: RecipeInputContextResource;
  anchorNodeId: string;
  position: { x: number; y: number };
}

export function SlotCraftPopover({
  target,
  onClose,
}: {
  target: SlotCraftTarget;
  onClose: () => void;
}) {
  const manifest = useFactoryStore((state) => state.datasetManifest);
  const manifestUrl = useFactoryStore((state) => state.datasetManifestUrl);
  const selectedVersionId = useFactoryStore((state) => state.selectedDatasetVersionId);
  const maxTier = useFactoryStore((state) => state.maxTierFilter);
  const addConnectedNodeForRecipeObject = useFactoryStore(
    (state) => state.addConnectedNodeForRecipeObject,
  );

  const version = manifest?.versions.find((entry) => entry.id === selectedVersionId);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [placingId, setPlacingId] = useState<string>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Load the recipes that produce this resource. State updates happen only in the
  // async callbacks; the initial "loading" comes from useState and !version is handled
  // in render, so nothing sets state synchronously in the effect body.
  useEffect(() => {
    if (!version) {
      return;
    }

    const controller = new AbortController();
    void queryRecipeDatasetRecipes(
      manifestUrl ?? DEFAULT_DATASET_MANIFEST_URL,
      version,
      {
        query: "",
        resource: { kind: target.resource.kind, id: target.resource.id },
        mode: "recipes",
        maxTier,
        offset: 0,
        limit: MAX_RESULTS,
      },
      { signal: controller.signal },
    )
      .then((result) => {
        setRecipes(result.recipes);
        setStatus("ready");
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setStatus("error");
          console.error("Failed to load crafts for resource.", error);
        }
      });

    return () => controller.abort();
  }, [manifestUrl, version, maxTier, target.resource.kind, target.resource.id]);

  // Close on outside click or Escape.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const handlePick = async (summary: RecipeSummary) => {
    if (!version || placingId) return;
    setPlacingId(summary.id);
    try {
      const recipe = await getRecipeDatasetRecipe(
        manifestUrl ?? DEFAULT_DATASET_MANIFEST_URL,
        version,
        summary.id,
      );
      addConnectedNodeForRecipeObject(recipe, target.anchorNodeId, target.resource);
      onClose();
    } catch (error) {
      console.error("Failed to place craft node.", error);
      setPlacingId(undefined);
    }
  };

  // Keep the popover inside the viewport.
  const left = Math.min(target.position.x, window.innerWidth - POPOVER_WIDTH - 12);
  const top = Math.min(target.position.y, window.innerHeight - 320);

  return createPortal(
    <div
      ref={containerRef}
      role="menu"
      style={{ left: Math.max(8, left), top: Math.max(8, top), width: POPOVER_WIDTH }}
      className="fixed z-[3000] max-h-[320px] overflow-y-auto rounded border border-neutral-300 bg-white p-1 text-sm shadow-xl dark:border-neutral-700 dark:bg-neutral-800"
    >
      <div className="border-b border-neutral-200 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        Craft {target.resource.displayName ?? target.resource.id}
      </div>

      {status === "loading" && version ? (
        <div className="flex items-center gap-2 px-2 py-3 text-neutral-500 dark:text-neutral-400">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading crafts…
        </div>
      ) : status === "error" || !version ? (
        <div className="px-2 py-3 text-neutral-500 dark:text-neutral-400">
          Could not load crafts.
        </div>
      ) : recipes.length === 0 ? (
        <div className="px-2 py-3 text-neutral-500 dark:text-neutral-400">
          No craft found for this material.
        </div>
      ) : (
        recipes.map((recipe) => {
          const output = recipe.outputs[0];
          return (
            <button
              key={recipe.id}
              type="button"
              role="menuitem"
              disabled={Boolean(placingId)}
              onClick={() => void handlePick(recipe)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-cyan-50 disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <span className="shrink-0">
                {output ? (
                  <ResourceIcon
                    resource={{ ...output, amount: output.amount ?? 1 }}
                    size="sm"
                    showAmount={false}
                    tooltip={false}
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{recipe.name}</span>
                <span className="block truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                  {recipe.machineType} · {recipe.minimumTier}
                </span>
              </span>
              {placingId === recipe.id ? (
                <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-cyan-600" />
              ) : null}
            </button>
          );
        })
      )}
    </div>,
    document.body,
  );
}
