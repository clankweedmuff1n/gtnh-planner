import { NextResponse } from "next/server";
import { getDatasetRecipeIds } from "@/lib/server/dataset-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params;
    return NextResponse.json(
      {
        recipeIds: await getDatasetRecipeIds(versionId),
      },
      {
        headers: datasetCacheHeaders(),
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Recipe id list failed." },
      { status: 500 },
    );
  }
}

function datasetCacheHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}
