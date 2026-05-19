# GTNH Factory Flow

GTNH Factory Flow is a Next.js planning tool for GregTech New Horizons production chains.
The long-term goal is to plan an entire base: recipe flowcharts, machine counts,
utilization, EU/t, fuel demand, surplus, deficits, bottlenecks, and versioned recipe data.

The current MVP is dataset-driven. It does not parse a modpack in the browser and does
not provide manual recipe entry. Real recipe data must come from a normalized offline
export generated from NESQL Exporter, RecEx, or NERD.

## Current MVP

- Import of normalized GTNH recipe datasets generated outside the browser.
- Read-only recipe browser with NEI-style recipe visualization.
- React Flow factory graph with selectable recipe nodes and resource-labeled edges.
- Pure TypeScript throughput solver under `src/lib/solver/`.
- Local persistence for plans with `localStorage`.
- Import/export of factory plans as validated JSON.
- Fuel estimate abstraction with demo benzene, biodiesel, and steam profiles.
- Legacy biodiesel demo JSON remains only for solver/import tests; it is not exposed as
  the production recipe source in the UI.
- Unit tests for the solver and JSON import/export.

## Limitations

- No GTNH recipe dataset is bundled. A full NESQL export can be hundreds of MB and should
  be generated or published outside the browser.
- Overclock tiers are stored on nodes but do not yet apply GTNH overclock formulas.
- Ore dictionary resolution, programmed circuit selection, multiblock rules, maintenance,
  pollution, and chance distribution modeling are not fully solved yet.
- The browser app consumes normalized dataset data. Raw NESQL, RecEx, or NERD output
  should be normalized before it reaches the UI.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Test

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

## Load Real Recipes

On startup the app automatically fetches `/datasets/gtnh/datasets.manifest.json`. If the
manifest contains versions, it loads `latestStableVersion`, then `latestDailyVersion`, then
the first listed version. The `GTNH version` selector can switch between manifest entries.

To use a remote manifest, set:

```bash
NEXT_PUBLIC_GTNH_DATASET_MANIFEST_URL=https://example.com/datasets/gtnh/datasets.manifest.json
```

There is also a private staging repository for dataset pipeline work:
`https://github.com/Sami2EaCOS/gtnh-factory-flow-datasets`.

Manual file import remains available as a fallback for local testing.

## Dataset Automation

The private project repository includes `.github/workflows/gtnh-dataset-pipeline.yml`.
It runs on a daily schedule and through `workflow_dispatch`.

The workflow detects:

- stable releases from `GTNewHorizons/GT-New-Horizons-Modpack`
- daily builds from `GTNewHorizons/DreamAssemblerXXL`

To actually generate recipes, configure the repository secret `GTNH_EXPORT_COMMAND`.
That command must download or use the selected GTNH instance, run NESQL/NERD/RecEx, and
write a normalized `RecipeDataset` to:

```bash
$GTNH_DATASET_OUT_DIR/recipes.json
```

Without that secret, the workflow records a pending pipeline status but does not publish
fake recipes.

1. Generate or obtain a normalized `RecipeDataset` JSON from a real GTNH instance using
   NESQL Exporter, RecEx, or NERD.
2. Publish it under `/public/datasets/gtnh/<version>/recipes.json`.
3. Add the version to `/public/datasets/gtnh/datasets.manifest.json`.
4. Search the read-only recipe browser.
5. Use the plus icon to place recipe nodes on the graph.
6. Connect nodes in the flowchart. The app picks the first matching output/input resource.

## Plan JSON vs Versioned GTNH Dataset

A plan JSON is a user-authored flowchart. It stores graph nodes, edges, fuel profiles,
targets, and the exact dataset recipes that were placed in the graph so exported plans
remain inspectable.

A versioned GTNH dataset is generated offline from tools such as NESQL Exporter, RecEx,
or NERD. The normalized dataset should be published under
`/public/datasets/gtnh/<version>/` with a `datasets.manifest.json`, checksums, source
metadata, NEI image paths, and stable/daily channel information. The UI should consume
only the normalized dataset model, never raw exporter output.

## Architecture

- `src/app/` - Next.js App Router entry points.
- `src/components/` - Application shell, panels, recipe browser, and NEI card.
- `src/components/flow/` - React Flow canvas and custom nodes.
- `src/lib/model/` - Normalized domain types, Zod schemas, resource utilities, fuels.
- `src/lib/solver/` - Pure throughput calculation.
- `src/lib/import-export/` - JSON import/export validation.
- `src/lib/datasets/` - Versioned dataset types and schemas.
- `src/store/` - Zustand client state.
- `src/examples/` and `examples/` - Legacy demo project loader and JSON example for tests.
- `docs/` - Design and pipeline documentation.
- `tools/dataset-pipeline/` - Placeholder for offline dataset generation tooling.

## Roadmap

- Recipe search over imported GTNH datasets.
- Dataset import from normalized generated JSON.
- Stable and daily GTNH datasets with manifests.
- Diff views between GTNH versions.
- Advanced solver for GTNH overclocks, machines, multis, chance outputs, and ore dictionary.
- Base-wide planner for power, fuel, logistics, storage, and deficits.
