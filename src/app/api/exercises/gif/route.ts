import { NextRequest, NextResponse } from "next/server";

const EXERCISEDB_MEDIA = "https://static.exercisedb.dev/media";

/** 1x1 transparent GIF — returned when upstream CDN has no/missing GIF. */
const PLACEHOLDER_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

/**
 * Proxy exercise GIFs through our server to avoid SSL/protocol errors
 * when the client loads directly from static.exercisedb.dev.
 * Returns a transparent placeholder when the CDN has no/missing GIF (404/5xx).
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
      // CDN 404/5xx — return transparent placeholder so img doesn't 404 in console
      return new NextResponse(PLACEHOLDER_GIF, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "public, max-age=3600",
          "X-Exercise-Gif": "unavailable",
        },
      });
    }
    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(PLACEHOLDER_GIF, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "public, max-age=60",
        "X-Exercise-Gif": "unavailable",
      },
    });
  }
}
