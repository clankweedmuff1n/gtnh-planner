import { NextResponse } from "next/server";
import { type DatasetRecipeRef, resolveDatasetRecipeRefs } from "@/lib/server/dataset-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params;
    const body = (await request.json()) as { recipes?: DatasetRecipeRef[] };
    return NextResponse.json(
      {
        matches: await resolveDatasetRecipeRefs(versionId, body.recipes ?? []),
      },
      {
        headers: datasetCacheHeaders(),
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Recipe resolution failed." },
      { status: 500 },
    );
  }
}

function datasetCacheHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}
