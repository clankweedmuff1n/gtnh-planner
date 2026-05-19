import { ZodError } from "zod";
import { datasetManifestSchema, recipeDatasetSchema } from "../datasets/schemas";
import type { DatasetManifest, RecipeDataset } from "../datasets/types";

export class DatasetJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetJsonError";
  }
}

export function parseRecipeDatasetJson(source: string): RecipeDataset {
  let raw: unknown;

  try {
    raw = JSON.parse(source);
  } catch (error) {
    throw new DatasetJsonError(
      `Invalid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
    );
  }

  try {
    return recipeDatasetSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ");
      throw new DatasetJsonError(`Invalid GTNH recipe dataset: ${issues}`);
    }

    throw error;
  }
}

export function parseDatasetManifestJson(source: string): DatasetManifest {
  let raw: unknown;

  try {
    raw = JSON.parse(source);
  } catch (error) {
    throw new DatasetJsonError(
      `Invalid JSON: ${error instanceof Error ? error.message : "Unknown parse error"}`,
    );
  }

  try {
    return datasetManifestSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ");
      throw new DatasetJsonError(`Invalid GTNH dataset manifest: ${issues}`);
    }

    throw error;
  }
}
