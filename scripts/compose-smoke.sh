#!/usr/bin/env bash
# REQ-INT-002 systems test: build and start the full Docker Compose stack from
# scratch, then check that the app serves pages, saves to PostgreSQL, keeps data
# across an app restart, and runs as a non-root user. Runs as its own Compose
# project (see docker-compose.smoke.yml) and removes it, volume included, at the end.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=loancalc-smoke
BASE=http://localhost:3300
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-smoke_$(date +%s)}"
compose() { docker compose -p "$PROJECT" -f docker-compose.yml -f docker-compose.smoke.yml "$@"; }

cleanup() { compose down --volumes --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

wait_healthy() {
  for _ in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")" = 200 ] && return 0
    sleep 2
  done
  compose logs app | tail -40
  fail "app did not become healthy"
}

step "Build and start the stack (postgres → migrate → app)"
compose up --build --detach
wait_healthy

step "Page renders"
curl -sf "$BASE/" | grep -q "Loan Calculator" || fail "home page did not render"

step "Health check reports the database"
curl -sf "$BASE/api/health" | grep -q '"database":"ok"' || fail "database not reachable from app"

step "Save a calculation"
response=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/calculations" \
  -H 'content-type: application/json' \
  -d '{"title":"Smoke test","input":{"loanType":"FIXED_INSTALLMENT","principal":10000,"aprPercent":5,"term":{"value":24,"unit":"months"},"frequency":"monthly","startDate":"2026-01-15"}}')
status=$(tail -n1 <<<"$response")
body=$(head -n1 <<<"$response")
[ "$status" = 201 ] || fail "save returned HTTP $status: $body"
id=$(sed -E 's/.*"id":"([^"]+)".*/\1/' <<<"$body")
echo "saved $id"

step "Data survives an app container restart"
compose restart app >/dev/null
wait_healthy
curl -sf "$BASE/api/calculations/$id" | grep -q '"title":"Smoke test"' || fail "saved calculation missing after restart"

step "App container runs as a non-root user"
uid=$(compose exec -T app id -u)
[ "$uid" != 0 ] || fail "app runs as root"
echo "uid $uid ($(compose exec -T app id -un))"

step "PASS: docker compose stack is healthy and persistent"
