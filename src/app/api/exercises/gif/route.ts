import { NextRequest, NextResponse } from "next/server";

const EXERCISEDB_MEDIA = "https://static.exercisedb.dev/media";

/**
 * Proxy exercise GIFs through our server to avoid SSL/protocol errors
 * when the client loads directly from static.exercisedb.dev.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id || !/^[A-Za-z0-9_-]{4,20}$/.test(id)) {
    return NextResponse.json({ error: "Invalid exercise id" }, { status: 400 });
  }

  try {
    const res = await fetch(`${EXERCISEDB_MEDIA}/${id}.gif`, {
      next: { revalidate: 86400 },
      headers: { "User-Agent": "Recomp/1.0" },
    });
    if (!res.ok) {
      return new NextResponse(null, { status: 404 });
    }
    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
