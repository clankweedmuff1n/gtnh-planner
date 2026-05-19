# Dataset Pipeline Placeholder

This directory is reserved for offline dataset generation tooling.

Planned responsibilities:

- Detect GTNH stable and daily versions.
- Download or locate a clean GTNH instance.
- Run NESQL Exporter, RecEx, or NERD outside the browser.
- Normalize raw exporter output into the internal `RecipeDataset` model.
- Compress and checksum generated JSON.
- Publish datasets to `/public/datasets/gtnh/<version>/`.
- Generate diffs between dataset versions.

No exporter is implemented in the MVP.

The web app automatically reads `/datasets/gtnh/datasets.manifest.json` or the URL from
`NEXT_PUBLIC_GTNH_DATASET_MANIFEST_URL`. Private GitHub repositories are suitable for
pipeline source code and CI artifacts, but browser-readable datasets must be published to
a public/static location or served through an authenticated backend.

## GitHub Action

The repository includes `.github/workflows/gtnh-dataset-pipeline.yml`.

It currently:

- Detects the latest stable release from `GTNewHorizons/GT-New-Horizons-Modpack`.
- Detects the latest successful daily build from `GTNewHorizons/DreamAssemblerXXL`.
- Creates one build job per detected channel.
- Runs an exporter command from the repository secret `GTNH_EXPORT_COMMAND`.
- Expects the exporter to write `recipes.json` to `$GTNH_DATASET_OUT_DIR`.
- Rebuilds `public/datasets/gtnh/datasets.manifest.json` from generated datasets.

`GTNH_EXPORT_COMMAND` is intentionally external because the exact NESQL/NERD/RecEx setup
depends on the pack instance and exporter chosen. The command must produce a normalized
`RecipeDataset`, not raw exporter output.
