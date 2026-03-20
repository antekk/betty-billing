import { NextRequest, NextResponse } from "next/server";
import { searchFeeCodes, getFeeCode, getFeeCodesByCategory } from "@/services/fee-code.service";

/**
 * Public endpoint — no auth required.
 * Fee code knowledge is free per PRD.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const code = searchParams.get("code");
  const category = searchParams.get("category");

  if (code) {
    const result = await getFeeCode(code);
    if (!result) {
      return NextResponse.json({ error: `Fee code "${code}" not found` }, { status: 404 });
    }
    return NextResponse.json(result);
  }

  if (category) {
    const results = await getFeeCodesByCategory(category);
    return NextResponse.json({ results });
  }

  if (query) {
    const results = await searchFeeCodes(query);
    return NextResponse.json({ results });
  }

  return NextResponse.json(
    { error: "Provide a search query (?q=), code (?code=), or category (?category=)" },
    { status: 400 }
  );
}
