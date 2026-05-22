import type { FactoryProject, FuelProfile } from "./types";

export const DEFAULT_FUEL_PROFILE_ID = "biodiesel";

export const gtnhFuelProfiles: FuelProfile[] = [
  {
    id: "benzene",
    name: "Benzene",
    fuelFluidId: "benzene",
    euPerLiter: 32000,
    notes: "GTNH generator fuel value.",
  },
  {
    id: "biodiesel",
    name: "Biodiesel",
    fuelFluidId: "biodiesel",
    euPerLiter: 12800,
    notes: "GTNH generator fuel value.",
  },
  {
    id: "steam",
    name: "Steam",
    fuelFluidId: "steam",
    euPerLiter: 16,
    notes: "GTNH steam turbine value.",
  },
];

export const legacyFuelProfileIds: Record<string, string> = {
  "demo-benzene": "benzene",
  "demo-biodiesel": "biodiesel",
  "demo-steam": "steam",
};

export function normalizeProjectFuelProfiles(project: FactoryProject): FactoryProject {
  const canonicalById = new Map(gtnhFuelProfiles.map((fuel) => [fuel.id, fuel]));
  const customProfiles = project.fuelProfiles.filter((fuel) => {
    const normalizedId = legacyFuelProfileIds[fuel.id] ?? fuel.id;
    return !canonicalById.has(normalizedId);
  });
  const selectedFuelProfileId =
    legacyFuelProfileIds[project.selectedFuelProfileId ?? ""] ??
    project.selectedFuelProfileId ??
    DEFAULT_FUEL_PROFILE_ID;

  return {
    ...project,
    fuelProfiles: [...gtnhFuelProfiles, ...customProfiles],
    selectedFuelProfileId: canonicalById.has(selectedFuelProfileId)
      ? selectedFuelProfileId
      : customProfiles.some((fuel) => fuel.id === selectedFuelProfileId)
        ? selectedFuelProfileId
        : DEFAULT_FUEL_PROFILE_ID,
  };
}
