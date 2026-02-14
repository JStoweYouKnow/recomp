import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("oura_token");
  res.cookies.delete("oura_token_uid");
  return res;
}
