#!/usr/bin/env bash
# Read-only WordPress origin health probe.
#
# Why this exists: the storefront Worker answers 200 from its edge cache even when
# the WordPress origin cannot reach MySQL, so a green homepage says nothing about
# the database. This script measures the origin directly and reports each result
# with its latency and the exact error the origin returned, so an intermittent
# failure is measured rather than inferred.
#
# It performs GET requests only. It reads no credentials, writes nothing, and
# changes nothing on the server.
#
# Usage: bash scripts/diagnose-wp-origin.sh [checks] [interval-seconds] [timeout-seconds]
set -uo pipefail

ORIGIN="${WORDPRESS_BASE_URL:-https://wp.himalayankoh.com}"
CHECKS="${1:-10}"
INTERVAL="${2:-3}"
TIMEOUT="${3:-20}"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

printf '%-3s %-7s %8s  %-9s %s\n' '#' 'STATUS' 'SECONDS' 'CLASS' 'DETAIL'
fail=0
for i in $(seq 1 "$CHECKS"); do
  timing=$(curl -s --max-time "$TIMEOUT" -o "$tmp" -w '%{http_code} %{time_total}' "$ORIGIN/wp-json/" 2>/dev/null)
  [ -n "$timing" ] || timing='000 0'
  read -r code secs <<<"$timing"

  class=ok
  detail=-
  case "$code" in
    200) ;;
    000) class=timeout; detail="no response within ${TIMEOUT}s" ;;
    5*)  class=error5xx
         if grep -qi 'establishing a database connection' "$tmp" 2>/dev/null; then
           detail='mysql: Error establishing a database connection'
         elif grep -qi 'Database Error' "$tmp" 2>/dev/null; then
           detail='mysql: Database Error page'
         else
           detail=$(tr -s '[:space:]' ' ' <"$tmp" | head -c 160)
         fi ;;
    *)   class=other; detail=$(tr -s '[:space:]' ' ' <"$tmp" | head -c 160) ;;
  esac

  [ "$class" = ok ] || fail=$((fail + 1))
  printf '%-3s %-7s %8s  %-9s %s\n' "$i" "$code" "$secs" "$class" "$detail"
  [ "$i" -lt "$CHECKS" ] && sleep "$INTERVAL"
done

echo
echo "origin:  $ORIGIN"
echo "summary: $((CHECKS - fail))/$CHECKS healthy, $fail/$CHECKS failed"
[ "$fail" -eq 0 ]
