# ExerciseDB Troubleshooting Guide

## Current Setup

- **Search API**: `https://www.exercisedb.dev/api/v1/exercises?search=...` — returns exercise metadata including `exerciseId` and `gifUrl`
- **GIF CDN**: `https://static.exercisedb.dev/media/{exerciseId}.gif` — hosts the actual GIF files
- **Recomp proxy**: `/api/exercises/gif?id=...` — fetches from CDN and serves to the client (avoids direct browser access)

## Known Issues

### 1. SSL/TLS errors with static.exercisedb.dev

The ExerciseDB CDN (`static.exercisedb.dev`) can fail with SSL errors from some clients/environments:

```
SSL routines:tls_get_more_records:packet length too long
curl: (35) SSL connect error
```

**Why we proxy**: The Next.js server fetches the GIF server-side, which often succeeds even when direct browser/CDN access fails (different TLS stacks, network paths).

**If proxy also fails**: We return an SVG "Demo unavailable" placeholder and optionally try a fallback provider (exercises-gifs on GitHub).

### 2. CDN 404 for valid exercise IDs

Some exercises returned by the search API may not have a corresponding GIF on the CDN (dataset mismatch or CDN gaps).

**Symptoms**: Search returns `exerciseId`, but `static.exercisedb.dev/media/{id}.gif` returns 404.

**Mitigation**: Pass `name` to the GIF route for fallback lookup in exercises-gifs when CDN fails.

### 3. Name mismatch (AI-generated workouts)

Workout plans use exercise names like "Bench Press", "Romanian Deadlift". The ExerciseDB search does fuzzy matching — "Bench Press" might match "smith close-grip bench press" or "barbell bench press". If the chosen exercise has a missing GIF, fallback uses the original search name to find a similar exercise in exercises-gifs.

## Diagnostic Script

Run from the project root:

```bash
npm run exercise:troubleshoot
# or
node scripts/troubleshoot-exercises.mjs
```

The script will:

1. **Test ExerciseDB search API** — `GET /api/v1/exercises?search=bench%20press`
2. **Test CDN fetch** — Attempt to fetch a known GIF (WcHl7ru) from `static.exercisedb.dev`
3. **Test local proxy** — `GET /api/exercises/gif?id=WcHl7ru` (requires dev server)
4. **Test exercises-gifs fallback** — Verify GitHub raw URLs for fallback provider

## Alternative Providers

| Provider | Type | Cost | Coverage | Notes |
|----------|------|------|----------|-------|
| **ExerciseDB v1** | API + CDN | Free | ~1,500 exercises | Primary; CDN may have SSL/404 issues |
| **exercises-gifs (GitHub)** | Static files | Free | ~1,300 exercises | Kaggle dataset backup; used as fallback |
| **ExerciseDB RapidAPI** | API | Paid | Same dataset | Requires API key; different endpoint |
| **YMove** | API | Paid ($17+/mo) | 638+ HD videos | Professional content, white-background demos |
| **wger** | API | Free | 858+ exercises | Minimal images; better for metadata than GIFs |

## Fallback Logic (Recomp)

1. **Search** → ExerciseDB API returns best match with `exerciseId`
2. **GIF request** → `/api/exercises/gif?id={id}&name={searchName}`
3. **Proxy** → Fetch from `static.exercisedb.dev/media/{id}.gif`
4. **If CDN fails** → Try exercises-gifs: lookup by name in Kaggle dataset, fetch from `raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets/{id}.gif`
5. **If both fail** → Return SVG "Demo unavailable"
