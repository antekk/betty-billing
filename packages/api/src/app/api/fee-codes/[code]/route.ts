import { NextRequest, NextResponse } from "next/server";
import { getFeeCode } from "@/services/fee-code.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const result = await getFeeCode(code);

  if (!result) {
    return NextResponse.json(
      { error: `Fee code "${code}" not found` },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}
