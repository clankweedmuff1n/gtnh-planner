"use client";

import Image from "next/image";
import { AlertTriangle, Beaker, Box, Cpu, Droplets } from "lucide-react";
import type { Recipe, ResourceAmount } from "@/lib/model/types";
import { formatRate } from "@/lib/model";

interface NeiRecipeCardProps {
  recipe: Recipe;
  compact?: boolean;
}

export function NeiRecipeCard({ recipe, compact = false }: NeiRecipeCardProps) {
  const itemInputs = recipe.inputs.filter((input) => input.kind === "item");
  const fluidInputs = recipe.inputs.filter((input) => input.kind === "fluid");
  const itemOutputs = recipe.outputs.filter((output) => output.kind === "item");
  const fluidOutputs = recipe.outputs.filter((output) => output.kind === "fluid");
  const durationSeconds = recipe.durationTicks / 20;

  return (
    <article className="rounded border border-neutral-800 bg-[#2f3237] p-3 text-neutral-100 shadow-sm">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{recipe.name}</h3>
          <p className="mt-0.5 truncate text-xs text-neutral-300">{recipe.machineType}</p>
        </div>
        <div className="rounded border border-neutral-600 bg-[#1f2125] px-2 py-1 text-right text-[11px] text-neutral-300">
          <div>{recipe.minimumTier}</div>
          <div>{recipe.eut} EU/t</div>
        </div>
      </header>

      <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_76px_minmax(0,1fr)]">
        <NeiGrid title="Inputs" resources={itemInputs} fallbackIcon={Box} />
        <div className="grid justify-items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded border border-neutral-600 bg-[#1f2125]">
            {recipe.nei?.iconPath ? (
              <Image src={recipe.nei.iconPath} alt="" width={32} height={32} unoptimized />
            ) : (
              <Cpu className="h-7 w-7 text-cyan-300" />
            )}
          </div>
          <div className="text-center text-[11px] leading-4 text-neutral-300">
            <div>{formatRate(durationSeconds, 2)} s</div>
            <div>{recipe.programmedCircuit ?? "no circuit"}</div>
          </div>
        </div>
        <NeiGrid title="Outputs" resources={itemOutputs} fallbackIcon={Box} output />
      </div>

      {(fluidInputs.length > 0 || fluidOutputs.length > 0) && !compact ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FluidList title="Fluid inputs" resources={fluidInputs} />
          <FluidList title="Fluid outputs" resources={fluidOutputs} />
        </div>
      ) : null}

      {!compact ? (
        <footer className="mt-3 space-y-2 border-t border-neutral-700 pt-3 text-xs text-neutral-300">
          <div className="grid grid-cols-2 gap-2">
            <Info label="Duration" value={`${recipe.durationTicks} ticks`} />
            <Info label="Recipe map" value={recipe.source?.recipeMap ?? recipe.machineType} />
          </div>
          {recipe.nei?.requiresCleanroom || recipe.nei?.requiresLowGravity ? (
            <div className="flex flex-wrap gap-2">
              {recipe.nei.requiresCleanroom ? <Badge label="Cleanroom" /> : null}
              {recipe.nei.requiresLowGravity ? <Badge label="Low gravity" /> : null}
            </div>
          ) : null}
          {recipe.source ? (
            <p className="text-[11px] text-neutral-400">
              Source: {recipe.source.exporter ?? "unknown"}{" "}
              {recipe.source.datasetVersionId ? `/${recipe.source.datasetVersionId}` : ""}
            </p>
          ) : null}
          {recipe.isDemo ? (
            <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Demo data, not authoritative GTNH data.</span>
            </div>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}

function NeiGrid({
  title,
  resources,
  fallbackIcon: FallbackIcon,
  output = false,
}: {
  title: string;
  resources: ResourceAmount[];
  fallbackIcon: React.ComponentType<{ className?: string }>;
  output?: boolean;
}) {
  const slots = Array.from(
    { length: Math.max(3, resources.length) },
    (_, index) => resources[index],
  );

  return (
    <section>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        {title}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {slots.map((resource, index) => (
          <NeiSlot
            key={`${resource?.id ?? "empty"}-${index}`}
            resource={resource}
            fallbackIcon={FallbackIcon}
            output={output}
          />
        ))}
      </div>
    </section>
  );
}

function NeiSlot({
  resource,
  fallbackIcon: FallbackIcon,
  output,
}: {
  resource?: ResourceAmount;
  fallbackIcon: React.ComponentType<{ className?: string }>;
  output: boolean;
}) {
  return (
    <div
      title={resource?.tooltip?.join("\n") ?? resource?.displayName ?? resource?.id}
      className={[
        "relative flex aspect-square min-h-12 items-center justify-center rounded border bg-[#1b1d21]",
        resource ? "border-neutral-500" : "border-neutral-700 opacity-45",
        output ? "shadow-[inset_0_0_0_1px_rgba(16,185,129,0.35)]" : "",
      ].join(" ")}
    >
      {resource?.iconPath ? (
        <Image
          src={resource.iconPath}
          alt={resource.displayName ?? resource.id}
          width={34}
          height={34}
          unoptimized
        />
      ) : resource ? (
        <FallbackIcon className="h-7 w-7 text-neutral-300" />
      ) : null}
      {resource ? (
        <>
          <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-white drop-shadow">
            {formatRate(resource.amount, 2)}
          </span>
          <span className="absolute left-1 top-0.5 max-w-[calc(100%-8px)] truncate text-[9px] text-neutral-300">
            {resource.displayName ?? resource.id}
          </span>
        </>
      ) : null}
    </div>
  );
}

function FluidList({ title, resources }: { title: string; resources: ResourceAmount[] }) {
  return (
    <section className="rounded border border-neutral-700 bg-[#25282d] p-2">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
        <Droplets className="h-3.5 w-3.5" />
        {title}
      </div>
      {resources.length === 0 ? (
        <p className="text-xs text-neutral-500">None</p>
      ) : (
        <div className="space-y-1">
          {resources.map((resource) => (
            <div
              key={`${resource.kind}-${resource.id}`}
              className="flex items-center justify-between gap-2 rounded border border-neutral-700 bg-[#1b1d21] px-2 py-1 text-xs"
            >
              <span className="min-w-0 truncate">{resource.displayName ?? resource.id}</span>
              <span className="font-semibold">{formatRate(resource.amount, 2)} L</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-700 bg-[#25282d] px-2 py-1">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-500">
        <Beaker className="h-3 w-3" />
        {label}
      </div>
      <div className="truncate text-xs font-semibold text-neutral-200">{value}</div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-100">
      {label}
    </span>
  );
}
