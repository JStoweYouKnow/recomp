import { NextRequest, NextResponse } from "next/server";
import { invokeNova, invokeNovaWithWebGrounding } from "@/lib/nova";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";
import { parseModelOutputToWorkout, parseModelOutputToProgram, WORKOUT_JSON_SYSTEM, WORKOUT_PROGRAM_JSON_SYSTEM, type ParseFail } from "@/lib/workout-import-llm";
import {
  buildWorkoutTablesPayload,
  extractProgramTitleFromHtml,
  parseAllWorkoutTablesFromHtml,
} from "@/lib/workout-import-html";

export const maxDuration = 120;
export const runtime = "nodejs";

const UA_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const UA_FIREFOX =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0";
const UA_COMPAT =
  "Mozilla/5.0 (compatible; RefactorWorkoutBot/1.0; +https://github.com/JStoweYouKnow/recomp)";

/** Pull structured text some SPAs embed before client render. */
function extractEmbeddedJsonText(html: string): string {
  const chunks: string[] = [];

  const nextData = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextData?.[1]) {
    try {
      const d = JSON.parse(nextData[1].trim());
      chunks.push(JSON.stringify(d).slice(0, 10_000));
    } catch {
      chunks.push(nextData[1].trim().slice(0, 8000));
    }
  }

  const nuxt = html.match(/<script[^>]*id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nuxt?.[1]) {
    chunks.push(nuxt[1].trim().slice(0, 8000));
  }

  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    if (m[1]) chunks.push(m[1].trim().slice(0, 6000));
  }

  return chunks.join("\n\n");
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPageExcerpt(html: string, maxLen: number): string {
  const embedded = extractEmbeddedJsonText(html);
  const stripped = htmlToPlainText(html);
  // Put visible page text first so the model sees workout tables before JSON-LD / schema blobs.
  const combined = [stripped, embedded].filter(Boolean).join("\n\n").trim();
  return combined.slice(0, maxLen);
}

/**
 * When Vercel/datacenter fetch is blocked, Bedrock web grounding fetches from AWS IPs.
 */
async function fetchUrlWithFallbacks(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const attempts: { ua: string }[] = [{ ua: UA_CHROME }, { ua: UA_FIREFOX }, { ua: UA_COMPAT }];

  let lastStatus = 0;
  let lastText = "";

  for (const { ua } of attempts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": ua,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
      });
      lastStatus = res.status;
      lastText = await res.text();
      if (res.ok) {
        clearTimeout(timeout);
        return { ok: true, status: res.status, text: lastText };
      }
      if (res.status !== 403 && res.status !== 401 && res.status !== 503) {
        clearTimeout(timeout);
        return { ok: false, status: res.status, text: lastText };
      }
    } catch {
      lastStatus = 0;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, status: lastStatus, text: lastText };
}

function markdownLooksMultiSession(md: string): boolean {
  const workoutLabels = (md.match(/\bWorkout\s+[A-Z]\b/gi) ?? []).length;
  const weekdayBlocks = (md.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi) ?? []).length;
  return workoutLabels >= 2 || weekdayBlocks >= 3;
}

async function extractProgramFromMarkdown(md: string, pageUrl: string) {
  const rawProg = await invokeNova(
    WORKOUT_PROGRAM_JSON_SYSTEM,
    `Extract the full workout program from this page. Return ONLY JSON with programTitle and days[].\n\nURL: ${pageUrl}\n\nPAGE CONTENT:\n${md.slice(0, 14_000)}`,
    { temperature: 0.2, maxTokens: 4096 }
  );
  return parseModelOutputToProgram(rawProg);
}

/**
 * When Vercel/datacenter fetch is blocked, Bedrock web grounding fetches from AWS IPs.
 */
async function extractViaWebGrounding(pageUrl: string): Promise<string | null> {
  try {
    const userMessage =
      `Use web grounding to open and read this URL, then extract the primary workout exactly as specified in the system message.\n` +
      `Return ONLY the JSON object (keys: day, focus, exercises). No markdown fences.\n\n` +
      `URL:\n${pageUrl}`;
    return await invokeNovaWithWebGrounding(WORKOUT_JSON_SYSTEM, userMessage, {
      temperature: 0.2,
      maxTokens: 8192,
    });
  } catch (err) {
    console.warn("parse-url: web grounding fallback failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fetch a workout URL and extract exercises using Nova AI.
 * Supports fitness blogs, YouTube descriptions, program PDFs (via text), etc.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await fixedWindowRateLimit(
      getClientKey(getRequestIp(req), "workouts-parse-url"),
      15,
      60_000
    );
    if (!rl.ok) {
      const headers = getRateLimitHeaderValues(rl);
      const res = NextResponse.json(
        { error: "Rate limit exceeded. Try again shortly.", code: "RATE_LIMIT" },
        { status: 429 }
      );
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    }

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL required", code: "BAD_REQUEST" }, { status: 400 });
    }

    const trimmed = url.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return NextResponse.json(
        { error: "Invalid URL. Use http:// or https://", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    const headers = getRateLimitHeaderValues(rl);
    const attachRateHeaders = (res: NextResponse) => {
      res.headers.set("X-RateLimit-Limit", headers.limit);
      res.headers.set("X-RateLimit-Remaining", headers.remaining);
      res.headers.set("X-RateLimit-Reset", headers.reset);
      return res;
    };

    const fetched = await fetchUrlWithFallbacks(trimmed);

    let lastFailure: ParseFail | null = null;
    let fetchFailedMeta: { status: number } | null = null;

    if (!fetched.ok) {
      fetchFailedMeta = { status: fetched.status };
    }

    // Path 0: `<table class="workoutTable">` (e.g. muscleandstrength.com) — no LLM required.
    if (fetched.ok) {
      const tableDays = parseAllWorkoutTablesFromHtml(fetched.text);
      const tablePayload = buildWorkoutTablesPayload(
        tableDays,
        "html-workout-table",
        extractProgramTitleFromHtml(fetched.text)
      );
      if (tablePayload) {
        return attachRateHeaders(NextResponse.json(tablePayload));
      }
    }

    // Path A: Firecrawl — bypasses datacenter IP blocks; HTML tables preferred when present.
    if (process.env.FIRECRAWL_API_KEY) {
      try {
        const { default: FirecrawlApp } = await import("@mendable/firecrawl-js");
        const fc = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
        const result = await fc.scrape(trimmed, { formats: ["markdown", "html"] });
        const md = (result as { markdown?: string }).markdown ?? "";
        const fcHtml = (result as { html?: string }).html ?? "";

        if (fcHtml.length >= 200) {
          const tableDays = parseAllWorkoutTablesFromHtml(fcHtml);
          const tablePayload = buildWorkoutTablesPayload(
            tableDays,
            "firecrawl+html-workout-table",
            extractProgramTitleFromHtml(fcHtml)
          );
          if (tablePayload) {
            return attachRateHeaders(NextResponse.json(tablePayload));
          }
        }

        if (md.length >= 100) {
          if (markdownLooksMultiSession(md)) {
            try {
              const programParsed = await extractProgramFromMarkdown(md, trimmed);
              if (programParsed.ok && programParsed.days.length > 1) {
                return attachRateHeaders(
                  NextResponse.json({
                    days: programParsed.days,
                    programTitle: programParsed.programTitle,
                    workout: programParsed.days[0],
                    dayCount: programParsed.days.length,
                    source: "firecrawl+nova-program",
                  })
                );
              }
              if (!programParsed.ok) lastFailure = programParsed;
            } catch (progErr) {
              console.warn("parse-url: Firecrawl program extract failed:", progErr instanceof Error ? progErr.message : progErr);
            }
          }

          const rawLite = await invokeNova(
            WORKOUT_JSON_SYSTEM,
            `Extract the workout from this page. Return ONLY a JSON object with day, focus, and exercises array.\n\nPAGE CONTENT:\n${md.slice(0, 14_000)}`,
            { temperature: 0.2, maxTokens: 2048 }
          );
          const parsed = parseModelOutputToWorkout(rawLite);
          if (parsed.ok) {
            return attachRateHeaders(NextResponse.json({ workout: parsed.workout, source: "firecrawl+nova-lite" }));
          }
          lastFailure = parsed;
        }
      } catch (fcErr) {
        console.warn("parse-url: Firecrawl failed:", fcErr instanceof Error ? fcErr.message : fcErr);
      }
    }

    // Path B: server-side HTML + Nova Lite (cheap, works for static sites)
    if (fetched.ok) {
      const textContent = buildPageExcerpt(fetched.text, 14_000);
      if (textContent.length >= 100) {
        try {
          const rawLite = await invokeNova(
            WORKOUT_JSON_SYSTEM,
            `Extract the workout from this page. Return ONLY a JSON object with day, focus, and exercises array.\n\nPAGE EXCERPT:\n${textContent}`,
            { temperature: 0.2, maxTokens: 2048 }
          );
          const parsed = parseModelOutputToWorkout(rawLite);
          if (parsed.ok) {
            return attachRateHeaders(NextResponse.json({ workout: parsed.workout, source: "fetch+nova-lite" }));
          }
          lastFailure = parsed;
        } catch (liteErr) {
          console.warn("parse-url: Nova Lite extract failed:", liteErr instanceof Error ? liteErr.message : liteErr);
          lastFailure = {
            ok: false,
            code: "NOVA_LITE_ERROR",
            error: liteErr instanceof Error ? liteErr.message : "Nova Lite request failed",
          };
        }
      } else {
        lastFailure = {
          ok: false,
          code: "INSUFFICIENT_TEXT",
          error:
            "Not enough readable text on this page (often a login wall or a client-only app). Trying web grounding…",
        };
      }
    }

    // Path C: web grounding (works when Vercel IP is blocked and Firecrawl is unavailable)
    const rawGround = await extractViaWebGrounding(trimmed);
    if (rawGround) {
      const parsedG = parseModelOutputToWorkout(rawGround);
      if (parsedG.ok) {
        return attachRateHeaders(NextResponse.json({ workout: parsedG.workout, source: "web-grounding" }));
      }
      lastFailure = parsedG;
    }

    // Final errors — combine context when server fetch never worked
    if (fetchFailedMeta && !fetched.ok) {
      const hint =
        fetchFailedMeta.status === 403 || fetchFailedMeta.status === 401
          ? " The origin server may block datacenter IPs (common on Vercel). Web grounding was attempted as a fallback."
          : "";
      const groundingNote = rawGround === null ? " Web grounding is unavailable or not configured (Bedrock nova_grounding + US inference profile)." : "";
      return attachRateHeaders(
        NextResponse.json(
          {
            error: `Could not fetch page from this host (HTTP ${fetchFailedMeta.status || "error"}).${hint}${groundingNote}`,
            code: "FETCH_FAILED",
            status: fetchFailedMeta.status,
            detail: lastFailure?.code,
          },
          { status: 422 }
        )
      );
    }

    if (lastFailure) {
      return attachRateHeaders(
        NextResponse.json(
          {
            error: lastFailure.error,
            code: lastFailure.code,
            detail: rawGround === null ? "Web grounding unavailable" : undefined,
          },
          { status: 422 }
        )
      );
    }

    return attachRateHeaders(
      NextResponse.json({ error: "Could not extract a workout from this URL.", code: "UNKNOWN" }, { status: 422 })
    );
  } catch (err) {
    console.error("Parse workout URL error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to parse workout",
        code: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}
