import type { CollabUser } from "./session";

// A stable per-browser identity for presence. Persisted so the same person keeps their
// name and color across reloads and rooms.
const STORAGE_KEY = "gtnh-factory-flow.collab-user.v1";

const NAMES = [
  "Engineer",
  "Machinist",
  "Fabricator",
  "Overclocker",
  "Prospector",
  "Assembler",
  "Smelter",
  "Wiremancer",
];

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function getLocalCollabUser(): CollabUser {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CollabUser>;
      if (typeof parsed.name === "string" && typeof parsed.color === "string") {
        return { name: parsed.name, color: parsed.color };
      }
    }
  } catch {
    // Ignore corrupt/unavailable storage and fall through to a fresh identity.
  }

  const user: CollabUser = {
    name: `${pick(NAMES)}-${Math.floor(Math.random() * 90 + 10)}`,
    color: pick(COLORS),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Best effort: presence still works this session even if we cannot persist.
  }

  return user;
}

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]!;
}
