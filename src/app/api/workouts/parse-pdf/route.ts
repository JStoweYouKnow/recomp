import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { invokeNova } from "@/lib/nova";
import { parseModelOutputToWorkout, WORKOUT_JSON_SYSTEM } from "@/lib/workout-import-llm";
import {
  fixedWindowRateLimit,
  getClientKey,
  getRateLimitHeaderValues,
  getRequestIp,
} from "@/lib/server-rate-limit";

export const maxDuration = 120;
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 24_000;

export async function POST(req: NextRequest) {
  try {
    const rl = await fixedWindowRateLimit(
      getClientKey(getRequestIp(req), "workouts-parse-pdf"),
      10,
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

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data with a file field named \"file\".", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const entry = form.get("file");
    if (!entry || typeof entry === "string") {
      return NextResponse.json({ error: "Missing PDF file (field name: file).", code: "BAD_REQUEST" }, { status: 400 });
    }

    const file = entry as File;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `PDF too large (max ${MAX_BYTES / (1024 * 1024)} MB).`, code: "PAYLOAD_TOO_LARGE" },
        { status: 413 }
      );
    }

    const mime = file.type || "";
    if (mime && mime !== "application/pdf" && !mime.includes("pdf")) {
      return NextResponse.json({ error: "Only PDF files are supported.", code: "BAD_REQUEST" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    let extracted: { text: string };
    try {
      extracted = await pdfParse(buf);
    } catch (e) {
      console.error("parse-pdf: pdf-parse failed", e);
      return NextResponse.json(
        {
          error: "Could not read this PDF (encrypted, corrupted, or image-only scan). Try another file or use URL import.",
          code: "PDF_PARSE_ERROR",
        },
        { status: 422 }
      );
    }

    const rawText = (extracted.text ?? "").replace(/\s+/g, " ").trim();
    if (rawText.length < 80) {
      return NextResponse.json(
        {
          error:
            "Almost no text was extracted. Scanned image PDFs need OCR (not supported here yet). Try a text-based PDF or paste a workout URL.",
          code: "INSUFFICIENT_TEXT",
        },
        { status: 422 }
      );
    }

    const excerpt = rawText.slice(0, MAX_TEXT_CHARS);
    const userMessage =
      `Extract the main workout from the following text (from a PDF named "${file.name.replace(/"/g, "'")}"). ` +
      `Return ONLY a JSON object with day, focus, and exercises as specified.\n\nPDF TEXT:\n${excerpt}`;

    const raw = await invokeNova(WORKOUT_JSON_SYSTEM, userMessage, {
      temperature: 0.2,
      maxTokens: 4096,
    });

    const parsed = parseModelOutputToWorkout(raw);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: 422 });
    }

    const headers = getRateLimitHeaderValues(rl);
    const res = NextResponse.json({ workout: parsed.workout, source: "pdf+nova-lite" });
    res.headers.set("X-RateLimit-Limit", headers.limit);
    res.headers.set("X-RateLimit-Remaining", headers.remaining);
    res.headers.set("X-RateLimit-Reset", headers.reset);
    return res;
  } catch (err) {
    console.error("parse-pdf error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to parse PDF",
        code: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}
