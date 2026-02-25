import { NextRequest, NextResponse } from "next/server";
import fallbackMap from "@/lib/exercise-fallback-map.json";

const EXERCISEDB_MEDIA = "https://static.exercisedb.dev/media";
const GITHUB_RAW =
  "https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets";

/** SVG returned when upstream CDN has no/missing GIF — shows "Demo unavailable" in the img. */
const UNAVAILABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80">
  <rect width="200" height="80" fill="#1a1a1a" rx="8"/>
  <text x="100" y="48" fill="#888" font-size="14" text-anchor="middle" font-family="system-ui,sans-serif">Demo unavailable</text>
</svg>`;

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Look up fallback GIF id by exercise name (exercises-gifs dataset). */
function lookupFallbackId(name: string): string | null {
  const map = fallbackMap as Record<string, string>;
  const key = normalizeName(name);
  const exact = map[key];
  if (exact) return exact;
  const words = key.split(/\s+/).filter((w) => w.length >= 2);
  for (const n of [words.join(" "), words.slice(-2).join(" "), words[0]]) {
    if (n && map[n]) return map[n];
  }
  return null;
}

function unavailableResponse(cache = 3600) {
  return new NextResponse(UNAVAILABLE_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": `public, max-age=${cache}`,
    },
  });
}

/**
 * Proxy exercise GIFs through our server to avoid SSL/protocol errors
 * when the client loads directly from static.exercisedb.dev.
 * When CDN fails, tries exercises-gifs fallback if ?name= is provided.
 * Returns an SVG "Demo unavailable" when both fail.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!id || !/^[A-Za-z0-9_-]{4,20}$/.test(id)) {
    return NextResponse.json({ error: "Invalid exercise id" }, { status: 400 });
  }

  try {
    const res = await fetch(`${EXERCISEDB_MEDIA}/${id}.gif`, {
      next: { revalidate: 86400 },
      headers: { "User-Agent": "Recomp/1.0" },
    });
    if (res.ok) {
      const blob = await res.blob();
      return new NextResponse(blob, {
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  } catch {
    /* CDN failed; try fallback */
  }

  if (name) {
    const fallbackId = lookupFallbackId(name);
    if (fallbackId) {
      try {
        const fallback = await fetch(`${GITHUB_RAW}/${fallbackId}.gif`, {
          next: { revalidate: 86400 },
          headers: { "User-Agent": "Recomp/1.0" },
        });
        if (fallback.ok) {
          const blob = await fallback.blob();
          return new NextResponse(blob, {
            headers: {
              "Content-Type": "image/gif",
              "Cache-Control": "public, max-age=86400",
              "X-Exercise-Source": "fallback",
            },
          });
        }
      } catch {
        /* fallback fetch failed */
      }
    }
  }

  return unavailableResponse();
}
