#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Recomp — Production Stress Test (All Features)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Usage: ./scripts/production-stress-test.sh [BASE_URL]
# Default: https://recomp-one.vercel.app
#
# Tests every major feature area against the production deployment:
#   1. Infrastructure (version, judge/health)
#   2. Auth flow (register, me, login)
#   3. AI-powered features (plans, meals, rico, coach, supplements, research,
#      embeddings, biofeedback)
#   4. Non-AI features (macros, exercises, feedback)
#   5. Concurrent load simulation (parallel lightweight + AI requests)
#
# Requires: curl, jq
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

# Portable millisecond timestamp (macOS date doesn't support %3N)
ms_now() { python3 -c "import time; print(int(time.time()*1000))"; }

BASE_URL="${1:-https://recomp-one.vercel.app}"
PASS=0
FAIL=0
WARN=0
RESULTS=()
COOKIE_JAR=$(mktemp)
TEST_EMAIL="stresstest-$(date +%s)@recomp-test.dev"
TEST_PASSWORD="StressTest!$(date +%s)"
TEST_NAME="Stress Test Bot"

trap "rm -f $COOKIE_JAR" EXIT

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log_header() {
  echo ""
  echo -e "${BOLD}${CYAN}━━━ $1 ━━━${NC}"
}

log_test() {
  local num=$1 name=$2
  echo -e "${DIM}  [$num]${NC} $name"
}

record_pass() {
  local name=$1 time_ms=$2 detail=${3:-""}
  PASS=$((PASS + 1))
  RESULTS+=("PASS|$name|${time_ms}ms|$detail")
  echo -e "       ${GREEN}✓ PASS${NC} ${DIM}(${time_ms}ms)${NC} $detail"
}

record_fail() {
  local name=$1 time_ms=$2 detail=${3:-""}
  FAIL=$((FAIL + 1))
  RESULTS+=("FAIL|$name|${time_ms}ms|$detail")
  echo -e "       ${RED}✗ FAIL${NC} ${DIM}(${time_ms}ms)${NC} $detail"
}

record_warn() {
  local name=$1 time_ms=$2 detail=${3:-""}
  WARN=$((WARN + 1))
  RESULTS+=("WARN|$name|${time_ms}ms|$detail")
  echo -e "       ${YELLOW}⚠ WARN${NC} ${DIM}(${time_ms}ms)${NC} $detail"
}

# Curl helper: returns body, sets TIME_MS and HTTP_CODE globals
do_get() {
  local url=$1
  local start=$(ms_now)
  local resp
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$url" 2>/dev/null || echo -e "\n000")
  local end=$(ms_now)
  HTTP_CODE=$(echo "$resp" | tail -1)
  BODY=$(echo "$resp" | sed '$d')
  TIME_MS=$((end - start))
}

do_post() {
  local url=$1 data=$2
  local start=$(ms_now)
  local resp
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$data" 2>/dev/null || echo -e "\n000")
  local end=$(ms_now)
  HTTP_CODE=$(echo "$resp" | tail -1)
  BODY=$(echo "$resp" | sed '$d')
  TIME_MS=$((end - start))
}

do_post_long() {
  local url=$1 data=$2 timeout=${3:-60}
  local start=$(ms_now)
  local resp
  resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    --max-time "$timeout" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$data" 2>/dev/null || echo -e "\n000")
  local end=$(ms_now)
  HTTP_CODE=$(echo "$resp" | tail -1)
  BODY=$(echo "$resp" | sed '$d')
  TIME_MS=$((end - start))
}

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         RECOMP — PRODUCTION STRESS TEST (ALL FEATURES)     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo -e "  Target: ${CYAN}$BASE_URL${NC}"
echo -e "  Time:   $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# 1. INFRASTRUCTURE
# ══════════════════════════════════════════════════════════════════════════════
log_header "1. INFRASTRUCTURE"
T=1

log_test $T "GET /api/version"
do_get "$BASE_URL/api/version"
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.timestamp' >/dev/null 2>&1; then
  COMMIT=$(echo "$BODY" | jq -r '.commitSha // "unknown"' | head -c 12)
  record_pass "version" "$TIME_MS" "commit=$COMMIT"
else
  record_fail "version" "$TIME_MS" "HTTP $HTTP_CODE"
fi
T=$((T + 1))

log_test $T "GET /api/judge/health"
do_get "$BASE_URL/api/judge/health"
if [ "$HTTP_CODE" = "200" ]; then
  FEATURES=$(echo "$BODY" | jq -c '.features // {}' 2>/dev/null)
  PLAN_GEN=$(echo "$BODY" | jq -r '.features.planGeneration // "?"')
  VOICE=$(echo "$BODY" | jq -r '.features.voice // "?"')
  DYNAMO=$(echo "$BODY" | jq -r '.features.dynamodbSync // "?"')
  record_pass "judge/health" "$TIME_MS" "plan=$PLAN_GEN voice=$VOICE dynamo=$DYNAMO"
else
  record_fail "judge/health" "$TIME_MS" "HTTP $HTTP_CODE"
fi
T=$((T + 1))

# ══════════════════════════════════════════════════════════════════════════════
# 2. AUTH FLOW
# ══════════════════════════════════════════════════════════════════════════════
log_header "2. AUTH FLOW"

log_test $T "POST /api/auth/register (create test user)"
do_post "$BASE_URL/api/auth/register" "{
  \"email\": \"$TEST_EMAIL\",
  \"password\": \"$TEST_PASSWORD\",
  \"name\": \"$TEST_NAME\",
  \"age\": 28, \"weight\": 80, \"height\": 180, \"gender\": \"male\",
  \"fitnessLevel\": \"intermediate\", \"goal\": \"build_muscle\",
  \"workoutLocation\": \"gym\", \"workoutDaysPerWeek\": 4
}"
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.ok == true' >/dev/null 2>&1; then
  USER_ID=$(echo "$BODY" | jq -r '.userId')
  SAVED=$(echo "$BODY" | jq -r '.profileSaved')
  record_pass "auth/register" "$TIME_MS" "userId=${USER_ID:0:8}… saved=$SAVED"
else
  record_fail "auth/register" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "unknown"')"
fi
T=$((T + 1))

log_test $T "GET /api/auth/me (verify cookie)"
do_get "$BASE_URL/api/auth/me"
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.authenticated == true' >/dev/null 2>&1; then
  record_pass "auth/me" "$TIME_MS" "authenticated=true"
else
  record_warn "auth/me" "$TIME_MS" "authenticated=$(echo "$BODY" | jq -r '.authenticated // "?"')"
fi
T=$((T + 1))

log_test $T "POST /api/auth/login (credential login)"
do_post "$BASE_URL/api/auth/login" "{\"email\": \"$TEST_EMAIL\", \"password\": \"$TEST_PASSWORD\"}"
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.success == true' >/dev/null 2>&1; then
  record_pass "auth/login" "$TIME_MS" "login successful"
elif [ "$HTTP_CODE" = "401" ]; then
  record_warn "auth/login" "$TIME_MS" "401 — DynamoDB account may not have persisted"
else
  record_fail "auth/login" "$TIME_MS" "HTTP $HTTP_CODE"
fi
T=$((T + 1))

# ══════════════════════════════════════════════════════════════════════════════
# 3. AI-POWERED FEATURES
# ══════════════════════════════════════════════════════════════════════════════
log_header "3. AI-POWERED FEATURES (Nova / Bedrock)"

log_test $T "POST /api/rico (AI coach chat)"
do_post "$BASE_URL/api/rico" '{"message": "Hey Reco, give me a quick tip for staying consistent with meal prep", "context": {"streak": 5, "goal": "build_muscle"}, "persona": "motivator"}'
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.reply' >/dev/null 2>&1; then
  REPLY_LEN=$(echo "$BODY" | jq -r '.reply' | wc -c | tr -d ' ')
  record_pass "rico" "$TIME_MS" "reply=${REPLY_LEN}chars"
else
  record_fail "rico" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

log_test $T "POST /api/meals/suggest (meal suggestions)"
do_post "$BASE_URL/api/meals/suggest" '{"mealType": "lunch", "targets": {"calories": 2400, "protein": 165}, "restrictions": []}'
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.suggestions | length > 0' >/dev/null 2>&1; then
  COUNT=$(echo "$BODY" | jq '.suggestions | length')
  record_pass "meals/suggest" "$TIME_MS" "suggestions=$COUNT"
else
  record_fail "meals/suggest" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

log_test $T "POST /api/meals/smart-suggest (context-aware meals)"
do_post "$BASE_URL/api/meals/smart-suggest" '{
  "remainingMacros": {"calories": 900, "protein": 60, "carbs": 100, "fat": 30},
  "timeOfDay": "evening",
  "recentMeals": ["chicken rice bowl", "salmon and veggies"],
  "pantryItems": ["eggs", "oats", "greek yogurt", "banana"],
  "goal": "build_muscle",
  "dietaryRestrictions": []
}'
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.suggestions' >/dev/null 2>&1; then
  COUNT=$(echo "$BODY" | jq '.suggestions | length')
  record_pass "meals/smart-suggest" "$TIME_MS" "suggestions=$COUNT"
else
  record_fail "meals/smart-suggest" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

log_test $T "POST /api/research (web grounding)"
do_post_long "$BASE_URL/api/research" '{"query": "optimal protein timing for muscle recovery after resistance training"}' 30
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.answer != null or .source != null' >/dev/null 2>&1; then
  SRC=$(echo "$BODY" | jq -r '.source // "unknown"')
  record_pass "research" "$TIME_MS" "source=$SRC"
else
  record_fail "research" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

log_test $T "POST /api/macros/calculate (macro calculator)"
do_post "$BASE_URL/api/macros/calculate" '{"weightKg": 80, "heightCm": 180, "age": 28, "gender": "male", "dailyActivityLevel": "active", "goal": "build_muscle"}'
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.macros.calories' >/dev/null 2>&1; then
  CALS=$(echo "$BODY" | jq '.macros.calories')
  PROT=$(echo "$BODY" | jq '.macros.protein')
  record_pass "macros/calculate" "$TIME_MS" "cals=$CALS protein=$PROT"
else
  record_fail "macros/calculate" "$TIME_MS" "HTTP $HTTP_CODE"
fi
T=$((T + 1))

log_test $T "POST /api/coach/check-in (proactive coach)"
do_post "$BASE_URL/api/coach/check-in" '{
  "name": "Stress Test Bot",
  "todayMeals": 2,
  "todayTargets": {"calories": 2400, "protein": 165},
  "workoutCompleted": true,
  "streak": 12,
  "biofeedback": {"energy": 4, "mood": 5, "soreness": 2}
}'
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.message' >/dev/null 2>&1; then
  TONE=$(echo "$BODY" | jq -r '.tone // "?"')
  record_pass "coach/check-in" "$TIME_MS" "tone=$TONE"
else
  record_fail "coach/check-in" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

log_test $T "POST /api/supplements/analyze"
do_post "$BASE_URL/api/supplements/analyze" '{
  "supplements": ["whey protein", "creatine monohydrate", "vitamin D3", "fish oil"],
  "goal": "build_muscle",
  "dietSummary": "High protein, moderate carbs, adequate fats"
}'
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.recommendations' >/dev/null 2>&1; then
  RECS=$(echo "$BODY" | jq '.recommendations | length')
  record_pass "supplements/analyze" "$TIME_MS" "recommendations=$RECS"
else
  record_fail "supplements/analyze" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

log_test $T "POST /api/embeddings (text embedding)"
do_post "$BASE_URL/api/embeddings" '{"text": "high protein chicken breast recipe for muscle building"}'
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.embedding | length > 0' >/dev/null 2>&1; then
  DIM=$(echo "$BODY" | jq '.embedding | length')
  record_pass "embeddings" "$TIME_MS" "dimensions=$DIM"
else
  record_fail "embeddings" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

log_test $T "POST /api/biofeedback/insights"
do_post "$BASE_URL/api/biofeedback/insights" '{
  "biofeedback": [
    {"date": "2026-03-08", "energy": 4, "mood": 5, "hunger": 2, "stress": 1, "soreness": 3},
    {"date": "2026-03-07", "energy": 3, "mood": 3, "hunger": 4, "stress": 3, "soreness": 4},
    {"date": "2026-03-06", "energy": 5, "mood": 5, "hunger": 2, "stress": 1, "soreness": 1}
  ],
  "meals": [
    {"date": "2026-03-08", "name": "Chicken rice bowl", "macros": {"calories": 650, "protein": 45}},
    {"date": "2026-03-07", "name": "Pasta with meatballs", "macros": {"calories": 800, "protein": 35}}
  ]
}'
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.correlations or .recommendations' >/dev/null 2>&1; then
  CORR=$(echo "$BODY" | jq '.correlations | length // 0')
  record_pass "biofeedback/insights" "$TIME_MS" "correlations=$CORR"
else
  record_fail "biofeedback/insights" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

log_test $T "POST /api/plans/adjust (plan adjustment)"
do_post "$BASE_URL/api/plans/adjust" '{
  "plan": {
    "dietPlan": {"dailyTargets": {"calories": 2400, "protein": 165, "carbs": 280, "fat": 75}},
    "workoutPlan": {"weeklyPlan": [{"day": "Monday", "focus": "Upper Body"}, {"day": "Wednesday", "focus": "Lower Body"}]}
  },
  "feedback": "I feel tired after workouts and hungry at night",
  "avgDailyCalories": 2100,
  "avgDailyProtein": 140
}'
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.dietAdjustments or .workoutAdjustments' >/dev/null 2>&1; then
  record_pass "plans/adjust" "$TIME_MS" "adjustments returned"
else
  record_fail "plans/adjust" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

log_test $T "POST /api/plans/generate (full plan — up to 60s)"
do_post_long "$BASE_URL/api/plans/generate" '{
  "name": "Stress Test Bot",
  "age": 28, "weight": 80, "height": 180, "gender": "male",
  "fitnessLevel": "intermediate",
  "goal": "build_muscle",
  "dailyActivityLevel": "active",
  "workoutLocation": "gym",
  "workoutEquipment": ["barbells", "free_weights", "machines", "cable_machine"],
  "workoutDaysPerWeek": 4,
  "workoutTimeframe": "morning",
  "dietaryRestrictions": [],
  "injuriesOrLimitations": []
}' 65
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.dietPlan or .workoutPlan' >/dev/null 2>&1; then
  SRC=$(echo "$BODY" | jq -r '.source // "nova"')
  record_pass "plans/generate" "$TIME_MS" "source=$SRC"
else
  record_fail "plans/generate" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

# ══════════════════════════════════════════════════════════════════════════════
# 4. EXERCISES & CONTENT
# ══════════════════════════════════════════════════════════════════════════════
log_header "4. EXERCISES & CONTENT"

log_test $T "GET /api/exercises/search (exercise DB)"
do_get "$BASE_URL/api/exercises/search?name=bench%20press"
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.name or .gifUrl' >/dev/null 2>&1; then
  NAME=$(echo "$BODY" | jq -r '.name // "?"')
  record_pass "exercises/search" "$TIME_MS" "found=$NAME"
else
  record_fail "exercises/search" "$TIME_MS" "HTTP $HTTP_CODE"
fi
T=$((T + 1))

log_test $T "GET /api/exercises/gif (GIF proxy)"
GIF_URL=$(echo "$BODY" | jq -r '.gifUrl // ""')
if [ -n "$GIF_URL" ] && [ "$GIF_URL" != "null" ]; then
  do_get "$BASE_URL$GIF_URL"
  if [ "$HTTP_CODE" = "200" ]; then
    record_pass "exercises/gif" "$TIME_MS" "served OK"
  else
    record_warn "exercises/gif" "$TIME_MS" "HTTP $HTTP_CODE (CDN issue possible)"
  fi
else
  record_warn "exercises/gif" "$TIME_MS" "no gifUrl to test"
fi
T=$((T + 1))

# ══════════════════════════════════════════════════════════════════════════════
# 5. SOCIAL & DATA
# ══════════════════════════════════════════════════════════════════════════════
log_header "5. SOCIAL & DATA"

log_test $T "GET /api/groups/discover"
do_get "$BASE_URL/api/groups/discover"
if [ "$HTTP_CODE" = "200" ]; then
  COUNT=$(echo "$BODY" | jq 'if type == "array" then length else 0 end' 2>/dev/null || echo "?")
  record_pass "groups/discover" "$TIME_MS" "groups=$COUNT"
elif [ "$HTTP_CODE" = "401" ]; then
  record_warn "groups/discover" "$TIME_MS" "requires auth (cookie may not have persisted)"
else
  record_fail "groups/discover" "$TIME_MS" "HTTP $HTTP_CODE"
fi
T=$((T + 1))

log_test $T "POST /api/feedback (submit feedback)"
do_post "$BASE_URL/api/feedback" '{"rating": 5, "text": "Stress test feedback — please ignore"}'
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | jq -e '.ok == true' >/dev/null 2>&1; then
  record_pass "feedback" "$TIME_MS" "saved OK"
else
  record_warn "feedback" "$TIME_MS" "HTTP $HTTP_CODE — $(echo "$BODY" | jq -r '.error // "?"')"
fi
T=$((T + 1))

# ══════════════════════════════════════════════════════════════════════════════
# 6. CONCURRENT LOAD SIMULATION
# ══════════════════════════════════════════════════════════════════════════════
log_header "6. CONCURRENT LOAD SIMULATION"

# --- 6a. 10 parallel lightweight requests ---
log_test $T "10× parallel lightweight requests"
CONCURRENT_TMPDIR=$(mktemp -d)
for i in $(seq 1 10); do
  (
    START=$(ms_now)
    case $((i % 3)) in
      0) URL="$BASE_URL/api/version" ;;
      1) URL="$BASE_URL/api/macros/calculate" ;;
      2) URL="$BASE_URL/api/exercises/search?name=squat" ;;
    esac
    if [ $((i % 3)) -eq 1 ]; then
      HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL" -H "Content-Type: application/json" \
        -d '{"weightKg":75,"heightCm":175,"age":25,"gender":"male","dailyActivityLevel":"moderate","goal":"maintain"}' 2>/dev/null || echo "000")
    else
      HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null || echo "000")
    fi
    END=$(ms_now)
    echo "$HTTP $((END - START))" > "$CONCURRENT_TMPDIR/result_$i"
  ) &
done
wait

CONCURRENT_OK=0
CONCURRENT_RATE=0
CONCURRENT_ERR=0
CONCURRENT_TIMES=()
for i in $(seq 1 10); do
  if [ -f "$CONCURRENT_TMPDIR/result_$i" ]; then
    CODE=$(awk '{print $1}' "$CONCURRENT_TMPDIR/result_$i")
    MS=$(awk '{print $2}' "$CONCURRENT_TMPDIR/result_$i")
    CONCURRENT_TIMES+=("$MS")
    case $CODE in
      200) CONCURRENT_OK=$((CONCURRENT_OK + 1)) ;;
      429) CONCURRENT_RATE=$((CONCURRENT_RATE + 1)) ;;
      *)   CONCURRENT_ERR=$((CONCURRENT_ERR + 1)) ;;
    esac
  fi
done
rm -rf "$CONCURRENT_TMPDIR"

AVG_TIME=0
if [ ${#CONCURRENT_TIMES[@]} -gt 0 ]; then
  SUM=0
  for t in "${CONCURRENT_TIMES[@]}"; do SUM=$((SUM + t)); done
  AVG_TIME=$((SUM / ${#CONCURRENT_TIMES[@]}))
fi

if [ $CONCURRENT_ERR -eq 0 ]; then
  record_pass "concurrent-lightweight" "$AVG_TIME" "ok=$CONCURRENT_OK rate_limited=$CONCURRENT_RATE errors=$CONCURRENT_ERR avg=${AVG_TIME}ms"
else
  record_fail "concurrent-lightweight" "$AVG_TIME" "ok=$CONCURRENT_OK rate_limited=$CONCURRENT_RATE errors=$CONCURRENT_ERR"
fi
T=$((T + 1))

# --- 6b. 5 parallel AI requests ---
log_test $T "5× parallel AI requests (rico + meals)"
AI_TMPDIR=$(mktemp -d)
for i in $(seq 1 5); do
  (
    START=$(ms_now)
    if [ $((i % 2)) -eq 0 ]; then
      HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
        -X POST "$BASE_URL/api/rico" -H "Content-Type: application/json" \
        -d "{\"message\": \"Parallel test $i: quick motivation\", \"context\": {}}" 2>/dev/null || echo "000")
    else
      HTTP=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
        -X POST "$BASE_URL/api/meals/suggest" -H "Content-Type: application/json" \
        -d '{"mealType":"dinner","targets":{"calories":2000,"protein":140},"restrictions":[]}' 2>/dev/null || echo "000")
    fi
    END=$(ms_now)
    echo "$HTTP $((END - START))" > "$AI_TMPDIR/result_$i"
  ) &
done
wait

AI_OK=0; AI_RATE=0; AI_ERR=0; AI_TIMES=()
for i in $(seq 1 5); do
  if [ -f "$AI_TMPDIR/result_$i" ]; then
    CODE=$(awk '{print $1}' "$AI_TMPDIR/result_$i")
    MS=$(awk '{print $2}' "$AI_TMPDIR/result_$i")
    AI_TIMES+=("$MS")
    case $CODE in
      200) AI_OK=$((AI_OK + 1)) ;;
      429) AI_RATE=$((AI_RATE + 1)) ;;
      *)   AI_ERR=$((AI_ERR + 1)) ;;
    esac
  fi
done
rm -rf "$AI_TMPDIR"

AI_AVG=0
if [ ${#AI_TIMES[@]} -gt 0 ]; then
  SUM=0; for t in "${AI_TIMES[@]}"; do SUM=$((SUM + t)); done
  AI_AVG=$((SUM / ${#AI_TIMES[@]}))
fi
MAX_AI=0
for t in "${AI_TIMES[@]}"; do [ "$t" -gt "$MAX_AI" ] && MAX_AI=$t; done

if [ $AI_ERR -eq 0 ]; then
  record_pass "concurrent-ai" "$AI_AVG" "ok=$AI_OK rate_limited=$AI_RATE errors=$AI_ERR avg=${AI_AVG}ms max=${MAX_AI}ms"
else
  record_warn "concurrent-ai" "$AI_AVG" "ok=$AI_OK rate_limited=$AI_RATE errors=$AI_ERR"
fi
T=$((T + 1))

# ══════════════════════════════════════════════════════════════════════════════
# RESULTS SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
TOTAL=$((PASS + FAIL + WARN))

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                       RESULTS SUMMARY                      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
printf "  %-35s %-8s %-10s %s\n" "ENDPOINT" "STATUS" "TIME" "DETAILS"
printf "  %-35s %-8s %-10s %s\n" "───────────────────────────────────" "──────" "────────" "───────"

for r in "${RESULTS[@]}"; do
  STATUS=$(echo "$r" | cut -d'|' -f1)
  NAME=$(echo "$r" | cut -d'|' -f2)
  TIME=$(echo "$r" | cut -d'|' -f3)
  DETAIL=$(echo "$r" | cut -d'|' -f4-)
  case $STATUS in
    PASS) COLOR=$GREEN ;;
    FAIL) COLOR=$RED ;;
    WARN) COLOR=$YELLOW ;;
    *)    COLOR=$NC ;;
  esac
  printf "  %-35s ${COLOR}%-8s${NC} %-10s %s\n" "$NAME" "$STATUS" "$TIME" "$DETAIL"
done

echo ""
echo -e "  ${GREEN}Passed: $PASS${NC}  ${RED}Failed: $FAIL${NC}  ${YELLOW}Warnings: $WARN${NC}  Total: $TOTAL"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}✓ ALL CRITICAL TESTS PASSED${NC}"
else
  echo -e "  ${RED}${BOLD}✗ $FAIL TEST(S) FAILED — SEE ABOVE${NC}"
fi
echo ""

# Exit with failure code if any test failed
[ $FAIL -eq 0 ]
