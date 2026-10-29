#!/usr/bin/env bash
# Smoke test of the Worker API against `wrangler dev --local` (DEV=1, fresh local D1). Exits non-zero on any failure.
#   bash tests/api_smoke.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="$ROOT/worker"
WR="$ROOT/.buildtools/node_modules/.bin/wrangler"
PORT=8787
B="http://localhost:$PORT"
TMP="$(mktemp -d)"
FAILS=0
export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt

printf 'ADMIN_EMAIL=admin@example.com\nMAIL_SECRET=x\nDEV=1\nAPP_ORIGIN=%s\n' "$B" > "$W/.dev.vars"
cd "$W"
rm -rf .wrangler/state/v3/d1
"$WR" d1 execute seb-exams --local --file schema.sql > "$TMP/schema.log" 2>&1 || { cat "$TMP/schema.log"; exit 1; }
setsid "$WR" dev --local --port $PORT > "$TMP/dev.log" 2>&1 &
DEVPID=$!
cleanup() { kill -- -"$DEVPID" 2>/dev/null; sleep 1; kill -9 -- -"$DEVPID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
for _ in $(seq 60); do curl -s -o /dev/null "$B/s/info?id=none" && break; sleep 1; done

ok()   { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; FAILS=$((FAILS+1)); }
check() { # check "name" expected actual
  if [ "$2" = "$3" ]; then ok "$1"; else fail "$1 (expected '$2', got '$3')"; fi; }
sql() { "$WR" d1 execute seb-exams --local --json --command "$1" 2>/dev/null | jq -r '.[0].results'; }

# api JAR METHOD PATH [BODY]  -> body in $TMP/out, status in $CODE
api() {
  local jar=$1 m=$2 p=$3 d=${4:-}
  if [ -n "$d" ]; then
    CODE=$(curl -s -o "$TMP/out" -w '%{http_code}' -b "$jar" -X "$m" -H 'X-Requested-With: seb-exams' -H 'Content-Type: application/json' --data-binary "$d" "$B$p")
  else
    CODE=$(curl -s -o "$TMP/out" -w '%{http_code}' -b "$jar" -X "$m" -H 'X-Requested-With: seb-exams' "$B$p")
  fi
}
j() { jq -r "$1" "$TMP/out"; }
sha() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

login() { # login EMAIL JAR
  curl -s -o /dev/null -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$1\"}" "$B/auth/request"
  local tok
  tok=$("$WR" d1 execute seb-exams --local --json --command "SELECT body FROM outbox WHERE to_email='$1' ORDER BY id DESC LIMIT 1" 2>/dev/null \
        | jq -r '.[0].results[0].body' | grep -o 'token=[A-Za-z0-9_-]*' | head -1 | cut -d= -f2)
  [ -n "$tok" ] || { echo "no token for $1"; return 1; }
  LAST_TOKEN=$tok
  curl -s -o /dev/null -D "$TMP/hdr" -c "$2" -X POST --data-urlencode "token=$tok" "$B/auth/verify"
}

echo "== sign-in"
api /dev/null GET /api/me; check "no session -> 401" 401 "$CODE"
curl -s -o /dev/null -X POST -H 'Content-Type: application/json' -d '{"email":"nobody@example.com"}' "$B/auth/request"
check "unknown email sends nothing" 0 "$(sql "SELECT COUNT(*) AS n FROM outbox WHERE to_email='nobody@example.com'" | jq '.[0].n')"
A="$TMP/a.jar"; BJ="$TMP/b.jar"
login admin@example.com "$A"
check "verify -> 303" 303 "$(head -1 "$TMP/hdr" | awk '{print $2}')"
grep -qi '^set-cookie: sid=.*HttpOnly' "$TMP/hdr" && ok "cookie HttpOnly" || fail "cookie HttpOnly"
check "GET /auth/verify shows button" 200 "$(curl -s -o "$TMP/p" -w '%{http_code}' "$B/auth/verify?token=$LAST_TOKEN")"
grep -q '<button' "$TMP/p" && ok "verify page has button" || fail "verify page has button"
check "token is single use" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST --data-urlencode "token=$LAST_TOKEN" "$B/auth/verify")"
api "$A" GET /api/me; check "me" "admin@example.com" "$(j .email)"; check "me admin" true "$(j .is_admin)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$A" "$B/api/me"); check "CSRF header required" 403 "$CODE"
check "no CORS on /api" "" "$(curl -s -D - -o /dev/null -H 'Origin: https://chetools.github.io' -b "$A" -H 'X-Requested-With: seb-exams' "$B/api/me" | grep -i '^access-control' | tr -d '\r')"

echo "== import"
cat > "$TMP/exam.yaml" <<'Y'
format: seb-exam/1
title: |
  Smoke test exam
duration_minutes: 30
questions:
  - id: q-mc
    type: mc
    points: 2
    text: Pick the right one. $x^2$
    image: fig.svg
    image_alt: A circle.
    options:
      - text: right
        correct: true
      - text: wrong
  - id: q-fill
    type: fill
    points: 3
    text: CMO means constant molal [[1]].
    blanks:
      - answer: overflow
        variants: [overflowe]
        clue: "o_______"
  - id: q-open
    type: open
    points: 5
    text: Explain in words why reflux helps.
Y
sed -i 's/variants: \[overflowe\]/variants: [overfl0w]/' "$TMP/exam.yaml"
SVG='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8"/></svg>'
SVGB=$(printf '%s' "$SVG" | base64 -w0)
BAD=$(printf '%s' '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' | base64 -w0)
imp() { jq -n --rawfile y "$TMP/exam.yaml" --arg s "$1" '{yaml:$y, images:{"fig.svg":$s}}'; }
api "$A" POST /api/exams/import "$(imp "$BAD")"; check "script SVG rejected" 422 "$CODE"
j '.errors[0]' | grep -q 'script' && ok "error names the script" || fail "error names the script"
api "$A" POST /api/exams/import "$(imp "$SVGB")"; check "import" 200 "$CODE"
ID=$(j .id); echo "  exam id $ID"
[[ "$ID" =~ ^[a-z]{2}-[a-z0-9]{6}$ ]] && ok "id format" || fail "id format $ID"
api "$A" GET /api/exams; check "list has exam" "$ID" "$(j '.[0].id')"; check "status draft" draft "$(j '.[0].status')"
api "$A" GET "/api/exams/$ID"; check "get exam" 3 "$(j '.content.questions|length')"
check "image listed" fig.svg "$(j '.images[0].name')"
KEY=$(j .config_key); [ ${#KEY} = 64 ] && ok "config key" || fail "config key"
j .seb_link | grep -q '^sebs://' && ok "seb_link" || fail "seb_link"
CODE=$(curl -s -o "$TMP/img" -w '%{http_code}' -b "$A" "$B/api/exams/$ID/images/fig.svg"); check "image bytes" 200 "$CODE"
grep -q '<circle' "$TMP/img" && ok "image content" || fail "image content"

echo "== settings and student flow"
api "$A" PUT "/api/exams/$ID/settings" '{"require_seb":true,"quit_password":"secret","extra_config_keys":[]}'; check "settings" 200 "$CODE"
api "$A" GET "/api/exams/$ID"; check "has_quit_password" true "$(j .has_quit_password)"
KEY=$(j .config_key)
curl -s "$B/s/info?id=$ID" > "$TMP/out"; check "info status draft" draft "$(j .status)"; check "info duration" 30 "$(j .duration_minutes)"
j 'keys|join(",")' | grep -q questions && fail "info leaks questions" || ok "info has no questions"
check "unknown exam 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$B/s/info?id=zz-000000")"
check ".seb file" application/seb "$(curl -s -o "$TMP/f.seb" -w '%{content_type}' "$B/s/seb/$ID.seb")"
grep -q "id=$ID" "$TMP/f.seb" && ok ".seb has start URL" || fail ".seb has start URL"
SURL="http://localhost:8765/exam/?id=$ID"
CK=$(sha "$SURL$KEY")
start() { curl -s -o "$TMP/out" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'Origin: http://localhost:8765' -d "$1" "$B/s/start"; }
check "start before open -> 423" 423 "$(start "{\"exam_id\":\"$ID\",\"name\":\"Ann\",\"student_id\":\"s1\",\"seb\":{\"url\":\"$SURL\",\"ck\":\"$CK\"}}")"
api "$A" POST "/api/exams/$ID/open-now"; check "open-now" 200 "$CODE"
curl -s "$B/s/info?id=$ID" > "$TMP/out"; check "info status open" open "$(j .status)"
check "start without SEB -> 403" 403 "$(start "{\"exam_id\":\"$ID\",\"name\":\"Ann\",\"student_id\":\"s1\"}")"
check "start with wrong key -> 403" 403 "$(start "{\"exam_id\":\"$ID\",\"name\":\"Ann\",\"student_id\":\"s1\",\"seb\":{\"url\":\"$SURL\",\"ck\":\"$(sha "$SURL"bad)\"}}")"
check "start with wrong url -> 403" 403 "$(start "{\"exam_id\":\"$ID\",\"name\":\"Ann\",\"student_id\":\"s1\",\"seb\":{\"url\":\"http://evil/\",\"ck\":\"$(sha "http://evil/$KEY")\"}}")"
check "start" 200 "$(start "{\"exam_id\":\"$ID\",\"name\":\"Ann\",\"student_id\":\" s1 \",\"seb\":{\"url\":\"$SURL#frag\",\"ck\":\"$CK\"}}")"
S1=$(j .started_at)
j '.exam.questions|length' | grep -q 3 && ok "public exam has 3 questions" || fail "public exam questions"
grep -Eqi 'correct|"answer"|variants|overflow' "$TMP/out" && fail "start response leaks answers" || ok "no answers in start response"
j '.exam.questions[0].image' | grep -q '^data:image/svg+xml;base64,' && ok "image as data URL" || fail "image data URL"
check "fill pattern is the clue" 'o_______' "$(j '.exam.questions[1].blanks[0].pattern')"
sleep 1
check "restart" 200 "$(start "{\"exam_id\":\"$ID\",\"name\":\"Ann\",\"student_id\":\"S1\",\"seb\":{\"url\":\"$SURL\",\"ck\":\"$CK\"}}")"
check "restart keeps started_at" "$S1" "$(j .started_at)"
j .ends_at | grep -q Z && ok "ends_at" || fail "ends_at"
SUB="{\"exam_id\":\"$ID\",\"student_id\":\"s1\",\"answers\":{\"q-mc\":\"a\",\"q-fill\":[\"OVERFL0W\"],\"q-open\":\"Because of liquid return.\"},\"seb\":{\"url\":\"$SURL\",\"ck\":\"$CK\"}}"
sub() { curl -s -o "$TMP/out" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "$1" "$B/s/submit"; }
check "submit without attempt -> 403" 403 "$(sub "${SUB//s1/s9}")"
check "submit" 200 "$(sub "$SUB")"; j .receipt | grep -Eq '^[A-Z0-9]{4}-[A-Z0-9]{4}$' && ok "receipt" || fail "receipt"
check "duplicate submit -> 409" 409 "$(sub "$SUB")"
check "start after submit -> 409" 409 "$(start "{\"exam_id\":\"$ID\",\"name\":\"Ann\",\"student_id\":\"s1\",\"seb\":{\"url\":\"$SURL\",\"ck\":\"$CK\"}}")"
# header variant of the SEB check
HK=$(sha "$B/s/start$KEY")
check "SEB header check" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "X-SafeExamBrowser-ConfigKeyHash: $HK" -d "{\"exam_id\":\"$ID\",\"name\":\"Bob\",\"student_id\":\"s2\"}" "$B/s/start")"
check "CORS preflight" 204 "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: http://localhost:8765' -H 'Access-Control-Request-Method: POST' "$B/s/start")"
curl -s -D - -o /dev/null -H 'Origin: http://localhost:8765' "$B/s/info?id=$ID" | grep -qi 'access-control-allow-origin: http://localhost:8765' && ok "CORS header" || fail "CORS header"
curl -s -D - -o /dev/null -H 'Origin: http://evil.example' "$B/s/info?id=$ID" | grep -qi 'access-control-allow-origin' && fail "CORS for foreign origin" || ok "no CORS for foreign origin"

echo "== results and grading"
api "$A" GET "/api/exams/$ID/results"; check "results" 200 "$CODE"
check "one finished submission" 1 "$(j '.submissions|length')"
check "auto score" 5 "$(j '.submissions[0].auto_score')"; check "auto max" 5 "$(j '.submissions[0].auto_max')"
check "manual_max" 5 "$(j '.submissions[0].manual_max')"; check "not late" false "$(j '.submissions[0].late')"
SID=$(j '.submissions[0].id')
api "$A" PUT "/api/submissions/$SID/manual" '{"qid":"q-open","points":4,"comment":"good"}'; check "manual grade" 200 "$CODE"
check "total" 9 "$(j .total)"
api "$A" PUT "/api/submissions/$SID/manual" '{"qid":"q-open","points":6,"comment":""}'; check "points above max -> 400" 400 "$CODE"
api "$A" PUT "/api/submissions/$SID/manual" '{"qid":"q-mc","points":1,"comment":""}'; check "manual on mc -> 400" 400 "$CODE"
# regrade after a content change: make the second mc option the correct one
api "$A" GET "/api/exams/$ID"; jq '{content: (.content | .questions[0].options[0].correct=false | .questions[0].options[1].correct=true)}' "$TMP/out" > "$TMP/c.json"
api "$A" PUT "/api/exams/$ID/content" "$(cat "$TMP/c.json")"; check "PUT content" 200 "$CODE"
api "$A" GET "/api/exams/$ID/results"
check "regraded auto score" 3 "$(j '.submissions[0].auto_score')"
check "manual grade kept" 4 "$(j '.submissions[0].manual["q-open"].points')"
api "$A" GET "/api/exams/$ID"; check "regraded_at set" true "$(j '.regraded_at != null')"
echo '{"content":{"format":"seb-exam/1","title":"x","duration_minutes":0,"questions":[]}}' > "$TMP/c.json"
api "$A" PUT "/api/exams/$ID/content" "$(cat "$TMP/c.json")"; check "invalid content -> 422" 422 "$CODE"
# content change that turns the open question into mc drops the manual grade
api "$A" GET "/api/exams/$ID"; jq '{content: (.content | .questions[2] = {id:"q-open",type:"mc",points:5,text:"now mc",options:[{text:"a",correct:true},{text:"b"}]})}' "$TMP/out" > "$TMP/c.json"
api "$A" PUT "/api/exams/$ID/content" "$(cat "$TMP/c.json")"; check "open -> mc" 200 "$CODE"
api "$A" GET "/api/exams/$ID/results"; check "manual dropped" '{}' "$(jq -c '.submissions[0].manual' "$TMP/out")"

echo "== export and round trip"
api "$A" GET "/api/exams/$ID/export"; check "export" 200 "$CODE"
jq '.yaml' -r "$TMP/out" > "$TMP/exp.yaml"; grep -q 'q-fill' "$TMP/exp.yaml" && ok "yaml has questions" || fail "yaml has questions"
jq '{yaml, images}' "$TMP/out" > "$TMP/imp.json"
api "$A" POST /api/exams/import "$(cat "$TMP/imp.json")"; check "re-import" 200 "$CODE"; ID2=$(j .id)
api "$A" GET "/api/exams/$ID"; jq .content "$TMP/out" > "$TMP/c1.json"
api "$A" GET "/api/exams/$ID2"; jq .content "$TMP/out" > "$TMP/c2.json"
cmp -s "$TMP/c1.json" "$TMP/c2.json" && ok "round trip identical" || fail "round trip differs"
api "$A" POST /api/exams/import "$(jq --arg r "$ID2" '. + {replace_id:$r}' "$TMP/imp.json")"; check "replace_id" 200 "$CODE"; check "same id kept" "$ID2" "$(j .id)"
api "$A" POST "/api/exams/$ID2/images" "{\"name\":\"two.svg\",\"base64\":\"$SVGB\"}"; check "add image" 200 "$CODE"
api "$A" DELETE "/api/exams/$ID2/images/two.svg"; check "delete image" 200 "$CODE"
api "$A" DELETE "/api/exams/$ID2/images/fig.svg"; check "delete used image -> 409" 409 "$CODE"
api "$A" POST "/api/exams/$ID2/close-now"; check "close-now" 200 "$CODE"
api "$A" GET /api/exams; check "closed status" closed "$(jq -r --arg i "$ID2" '.[]|select(.id==$i)|.status' "$TMP/out")"

echo "== teachers and access control"
api "$A" POST /api/teachers '{"email":"B@Example.com","name":"Bea","is_admin":false}'; check "add teacher" 200 "$CODE"
api "$A" GET /api/teachers; check "two teachers" 2 "$(j length)"
login b@example.com "$BJ"
api "$BJ" GET /api/exams; check "B sees no exams" 0 "$(j length)"
api "$BJ" GET "/api/exams/$ID"; check "B cannot read A's exam" 403 "$CODE"
api "$BJ" GET "/api/exams/$ID/results"; check "B cannot read results" 403 "$CODE"
api "$BJ" PUT "/api/exams/$ID/settings" '{"require_seb":false}'; check "B cannot edit" 403 "$CODE"
api "$BJ" DELETE "/api/exams/$ID"; check "B cannot delete" 403 "$CODE"
api "$BJ" GET "/api/submissions/$SID"; check "B submission route" 404 "$CODE"
api "$BJ" PUT "/api/submissions/$SID/manual" '{"qid":"q-open","points":1,"comment":""}'; check "B cannot grade" 403 "$CODE"
api "$BJ" GET /api/teachers; check "B is not admin" 403 "$CODE"
api "$A" POST "/api/exams/$ID/teachers" '{"email":"b@example.com"}'; check "share with B" 200 "$CODE"
api "$BJ" GET "/api/exams/$ID"; check "B reads shared exam" 200 "$CODE"
api "$BJ" GET /api/exams; check "B lists shared exam" 1 "$(j length)"
api "$BJ" POST "/api/exams/$ID/teachers" '{"email":"admin@example.com"}'; check "B cannot share (owner only)" 403 "$CODE"
api "$A" DELETE "/api/exams/$ID/teachers/b@example.com"; check "unshare" 200 "$CODE"
api "$BJ" GET "/api/exams/$ID"; check "B locked out again" 403 "$CODE"
api "$A" PUT /api/teachers/admin@example.com '{"is_admin":false}'; check "last admin protected" 409 "$CODE"
api "$A" DELETE /api/teachers/admin@example.com; check "cannot remove self" 409 "$CODE"
api "$BJ" POST /api/exams/import "$(imp "$SVGB")"; ID3=$(j .id)
api "$A" DELETE /api/teachers/b@example.com; check "remove teacher" 200 "$CODE"
api "$A" GET "/api/exams/$ID3"; check "exam transferred" admin@example.com "$(j .owner_email)"
api "$BJ" GET /api/me; check "removed teacher loses session" 401 "$CODE"
api "$A" DELETE "/api/submissions/$SID"; check "delete submission" 200 "$CODE"
check "attempt row removed too" 0 "$(sql "SELECT COUNT(*) AS n FROM attempts WHERE exam_id='$ID' AND student_id='S1'" | jq '.[0].n')"
api "$A" DELETE "/api/exams/$ID3"; check "delete exam" 200 "$CODE"

echo "== rate limit"
for i in $(seq 7); do curl -s -o "$TMP/o" -w '%{http_code} ' -X POST -H 'Content-Type: application/json' -d '{"email":"admin@example.com"}' "$B/auth/request"; done | tr -d '\n'; echo
check "login_requests capped at 5/hour" 5 "$(sql "SELECT COUNT(*) AS n FROM login_requests WHERE email='admin@example.com'" | jq '.[0].n')"
check "all answers identical (200)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"email":"admin@example.com"}' "$B/auth/request")"
curl -s -o /dev/null -b "$A" -X POST "$B/auth/logout"
api "$A" GET /api/me; check "logout" 401 "$CODE"

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL OK"; else echo "$FAILS FAILED"; echo "--- dev log tail"; tail -20 "$TMP/dev.log"; exit 1; fi
