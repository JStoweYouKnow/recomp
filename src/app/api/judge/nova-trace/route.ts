import { NextRequest, NextResponse } from "next/server";
import { getJudgeTraceEntries, clearJudgeTraceEntries } from "@/lib/judgeTrace";
import { isJudgeMode } from "@/lib/judgeMode";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "100");
  return NextResponse.json({
    judgeMode: isJudgeMode(),
    traces: getJudgeTraceEntries(limit),
  });
}

export async function DELETE() {
  clearJudgeTraceEntries();
  return NextResponse.json({ ok: true });
}
