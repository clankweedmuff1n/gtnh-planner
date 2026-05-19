import { demoFuelProfiles } from "@/lib/model/fuels";
import { PROJECT_SCHEMA_VERSION, type FactoryProject } from "@/lib/model/types";

export function createEmptyProject(): FactoryProject {
  const now = new Date().toISOString();

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "manual-project",
    name: "GTNH Factory Flow",
    recipes: [],
    nodes: [],
    edges: [],
    fuelProfiles: demoFuelProfiles,
    selectedFuelProfileId: "demo-biodiesel",
    notes:
      "Dataset-backed plan. Recipes must come from a normalized GTNH dataset. Demo fuel values are placeholders and not authoritative GTNH data.",
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
  };
}
