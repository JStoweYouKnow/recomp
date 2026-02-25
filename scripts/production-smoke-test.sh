#!/usr/bin/env bash
# Production smoke test for Recomp — run before hackathon submission.
# Usage: ./scripts/production-smoke-test.sh [BASE_URL]
# Default: https://recomp-one.vercel.app

set -e
BASE_URL="${1:-https://recomp-one.vercel.app}"
echo "Running production smoke tests against: $BASE_URL"
echo ""

# Judge health
echo "1. GET /api/judge/health"
HEALTH=$(curl -s "$BASE_URL/api/judge/health")
if echo "$HEALTH" | jq -e '.features.planGeneration == "live"' >/dev/null 2>&1; then
  echo "   ✓ planGeneration: live"
else
  echo "   ✗ planGeneration: $(echo "$HEALTH" | jq -r '.features.planGeneration // "missing"')"
  exit 1
fi
if echo "$HEALTH" | jq -e '.features.voice == "live"' >/dev/null 2>&1; then
  echo "   ✓ voice: live"
else
  echo "   ✗ voice: $(echo "$HEALTH" | jq -r '.features.voice // "missing"')"
  exit 1
fi
echo "   ✓ All features: $(echo "$HEALTH" | jq -c '.features')"
echo ""

# Research (web grounding)
echo "2. POST /api/research"
RESEARCH=$(curl -s -X POST "$BASE_URL/api/research" \
  -H "Content-Type: application/json" \
  -d '{"query":"protein recommendations for muscle building"}')
if echo "$RESEARCH" | jq -e '.source == "web-grounding" or .answer != null' >/dev/null 2>&1; then
  echo "   ✓ source: $(echo "$RESEARCH" | jq -r '.source')"
else
  echo "   ✗ research failed: $(echo "$RESEARCH" | jq -c '.')"
  exit 1
fi
echo ""

# Meals suggest
echo "3. POST /api/meals/suggest"
SUGGEST=$(curl -s -X POST "$BASE_URL/api/meals/suggest" \
  -H "Content-Type: application/json" \
  -d '{"mealType":"lunch","targets":{"calories":2000,"protein":150},"restrictions":[]}')
if echo "$SUGGEST" | jq -e '.suggestions | length > 0' >/dev/null 2>&1; then
  COUNT=$(echo "$SUGGEST" | jq '.suggestions | length')
  echo "   ✓ suggestions: $COUNT"
else
  echo "   ✗ meals suggest failed: $(echo "$SUGGEST" | jq -c '.')"
  exit 1
fi
echo ""

# Exercise GIF (primary CDN or fallback must work in production)
echo "4. Exercise demo GIF (search + proxy)"
SEARCH=$(curl -s "$BASE_URL/api/exercises/search?name=bench%20press")
GIF_URL=$(echo "$SEARCH" | jq -r '.gifUrl // empty')
if [ -z "$GIF_URL" ]; then
  echo "   ✗ exercise search failed: $(echo "$SEARCH" | jq -c '.')"
  exit 1
fi
GIF_RESP=$(curl -sI -w "%{http_code}|%{content_type}" -o /dev/null "$BASE_URL$GIF_URL")
GIF_HTTP=$(echo "$GIF_RESP" | cut -d'|' -f1)
GIF_CT=$(echo "$GIF_RESP" | cut -d'|' -f2 | cut -d';' -f1)
if [ "$GIF_HTTP" = "200" ] && { [ "$GIF_CT" = "image/gif" ] || [ "$GIF_CT" = "image/svg+xml" ]; }; then
  echo "   ✓ GIF endpoint: $GIF_HTTP $GIF_CT"
else
  echo "   ✗ GIF endpoint: HTTP $GIF_HTTP, Content-Type: $GIF_CT"
  exit 1
fi
echo ""

echo "All production smoke tests passed."
