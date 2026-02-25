#!/usr/bin/env node
/**
 * ExerciseDB + fallback provider diagnostic script.
 * Run: node scripts/troubleshoot-exercises.mjs
 */

const EXERCISEDB_API = "https://www.exercisedb.dev/api/v1/exercises";
const EXERCISEDB_CDN = "https://static.exercisedb.dev/media";
const GITHUB_RAW =
  "https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets";

async function test(name, fn) {
  process.stdout.write(`  ${name}... `);
  try {
    const result = await fn();
    console.log(result ?? "OK");
    return { ok: true, result };
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log("\n=== ExerciseDB Troubleshooting ===\n");

  // 1. ExerciseDB Search API
  console.log("1. ExerciseDB Search API");
  const searchRes = await test("GET /api/v1/exercises?search=bench%20press", async () => {
    const r = await fetch(`${EXERCISEDB_API}?search=bench%20press&limit=2`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const data = j.data ?? [];
    const first = data[0];
    if (!first) return "no results";
    return `found ${data.length}+ exercises, first: ${first.name} (id: ${first.exerciseId})`;
  });

  let exerciseId = null;
  if (searchRes.ok) {
    const r = await fetch(`${EXERCISEDB_API}?search=bench%20press&limit=1`);
    const j = await r.json();
    const first = j.data?.[0];
    if (first) exerciseId = first.exerciseId;
  }

  // 2. ExerciseDB CDN (direct fetch - may fail with SSL on some systems)
  console.log("\n2. ExerciseDB CDN (static.exercisedb.dev)");
  const idToTry = exerciseId ?? "WcHl7ru";
  await test(`Fetch ${idToTry}.gif from CDN`, async () => {
    const r = await fetch(`${EXERCISEDB_CDN}/${idToTry}.gif`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const size = (await r.arrayBuffer()).byteLength;
    return `OK, ${size} bytes`;
  });

  // 3. Local proxy (requires dev server on localhost:3000)
  console.log("\n3. Local proxy (optional - requires dev server)");
  await test("GET /api/exercises/gif?id=" + idToTry, async () => {
    const r = await fetch(`http://localhost:3000/api/exercises/gif?id=${idToTry}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = r.headers.get("content-type") ?? "";
    const size = (await r.arrayBuffer()).byteLength;
    const source = r.headers.get("x-exercise-gif") ? "unavailable" : "gif";
    return `${ct.split(";")[0]}, ${size} bytes (${source})`;
  }).catch(() => {});

  // 4. exercises-gifs fallback (GitHub raw)
  console.log("\n4. exercises-gifs fallback (GitHub)");
  await test("Fetch 0025.gif (barbell bench press)", async () => {
    const r = await fetch(`${GITHUB_RAW}/0025.gif`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const size = (await r.arrayBuffer()).byteLength;
    return `OK, ${size} bytes`;
  });

  console.log("\n=== Done ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
