import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("fitbit_access_token");
  res.cookies.delete("fitbit_refresh_token");
  return res;
}
