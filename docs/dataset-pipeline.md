# Versioned Dataset Pipeline

The browser MVP must not parse a live GTNH modpack. Large GTNH recipe data should be
generated offline, normalized, compressed, versioned, and then served as static dataset
artifacts.

## Goals

- Track stable and daily GTNH versions.
- Preserve source metadata for NESQL Exporter, RecEx, and NERD.
- Normalize raw exporter output into the internal `RecipeDataset` model.
- Publish immutable datasets under `/public/datasets/gtnh/<version>/`.
- Compare recipe and resource changes between versions.

## Proposed Stages

1. Detect GTNH versions
   - Read configured stable releases and daily builds.
   - Store channel, version id, source URL, and timestamp.

2. Download or locate instance
   - Fetch or mount a clean GTNH instance outside the web app.
   - Record pack version, mod list checksum, and exporter versions.

3. Run exporters
   - Execute NESQL Exporter, RecEx, or NERD in a controlled offline environment.
   - Store raw output as build artifacts, not as app runtime data.

4. Normalize
   - Convert raw recipe maps, items, fluids, ore dictionary entries, circuits, chances,
     byproducts, and machine metadata into internal JSON.
   - Preserve NEI image paths, slot positions, recipe-map names, and additional machine
     metadata when the exporter provides them.
   - Validate the normalized output with dataset schemas.

5. Compress and hash
   - Write `recipes.json` and optional compressed variants.
   - Generate SHA-256 checksums for every published artifact.

6. Publish
   - Place artifacts under `/public/datasets/gtnh/<version>/`.
   - Update `/public/datasets/gtnh/datasets.manifest.json`.
   - If artifacts are hosted elsewhere, set
     `NEXT_PUBLIC_GTNH_DATASET_MANIFEST_URL` to the public manifest URL.
   - Do not point the browser at a private GitHub raw URL that requires a token.

7. Diff versions
   - Compare recipe ids, recipe maps, inputs, outputs, durations, EU/t, circuits, and
     source metadata.
   - Emit machine-readable diffs for UI inspection later.

## Manifest Shape

Dataset types live in `src/lib/datasets/types.ts`:

- `DatasetManifest`
- `DatasetVersion`
- `RecipeDataset`
- `DatasetSourceInfo`

The manifest points to immutable dataset versions. The UI should select a dataset version
from the manifest and load normalized JSON only. The planner UI should never offer manual
recipe creation as a substitute for missing GTNH data.

## Non-Goals For MVP

- No in-browser modpack parsing.
- No direct dependency on raw NESQL, RecEx, or NERD output in the planner UI.
- No claim that demo data is authoritative.
