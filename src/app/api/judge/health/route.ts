import { NextResponse } from "next/server";
import { buildJudgeHealthPayload } from "@/lib/judgeMode";

export async function GET() {
  return NextResponse.json(buildJudgeHealthPayload());
}
