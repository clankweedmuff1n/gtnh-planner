import type { FuelProfile } from "./types";

export const demoFuelProfiles: FuelProfile[] = [
  {
    id: "demo-benzene",
    name: "Benzene (demo)",
    fuelFluidId: "benzene",
    euPerLiter: 32000,
    isDemo: true,
    notes: "Placeholder demo value, not authoritative GTNH data.",
  },
  {
    id: "demo-biodiesel",
    name: "Biodiesel (demo)",
    fuelFluidId: "biodiesel",
    euPerLiter: 12800,
    isDemo: true,
    notes: "Placeholder demo value, not authoritative GTNH data.",
  },
  {
    id: "demo-steam",
    name: "Steam (demo)",
    fuelFluidId: "steam",
    euPerLiter: 16,
    isDemo: true,
    notes: "Placeholder demo value, not authoritative GTNH data.",
  },
];
