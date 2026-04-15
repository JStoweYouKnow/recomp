#!/usr/bin/env node
/**
 * Generates exercise-fallback-map.json from exercises-gifs CSV.
 * Run: node scripts/generate-exercise-fallback-map.mjs
 * Output: src/lib/exercise-fallback-map.json
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const CSV_URL =
  "https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/exercises.csv";
const OUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "exercise-fallback-map.json"
);

function normalize(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

async function main() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0];
  if (!header.startsWith("bodyPart,equipment,id,name,")) {
    throw new Error("Unexpected CSV format");
  }

  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 4) continue;
    const id = parts[2]?.trim();
    const name = parts[3]?.trim();
    if (!id || !name || !/^\d+$/.test(id)) continue;
    const key = normalize(name);
    if (!map[key]) map[key] = id;
    // Also add a shorter key for compound names: "bench press" -> barbell bench press id
    const words = key.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length >= 2) {
      const shortKey = words.slice(-2).join(" ");
      if (!map[shortKey]) map[shortKey] = id;
    }
  }

  const outDir = dirname(OUT_PATH);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(map, null, 0), "utf8");
  console.log(`Written ${Object.keys(map).length} entries to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
