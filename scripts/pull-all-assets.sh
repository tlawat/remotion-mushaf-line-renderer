#!/usr/bin/env bash
# Mirrors the QUL page fonts into example/public/fonts (both sets; every page's woff2, and the ttf of
# the fixture pages), refreshes scripts/cdn-etags.json, then commits and pushes the result on the
# current branch. Run it on a machine that can reach qul.tarteel.ai and static-cdn.tarteel.ai; it
# needs Node 18+ and git, nothing else (scripts/fetch-qul.mjs has no dependencies).
#
#   bash scripts/pull-all-assets.sh              # fonts of all 604 pages + ETags, commit, push
#   FONTS=187-207 bash scripts/pull-all-assets.sh  # a subset (a list or ranges, like the workflow)
#   COMPILE=1 bash scripts/pull-all-assets.sh    # also recompile the layout from QUL's preview pages
#   PUSH=0 bash scripts/pull-all-assets.sh       # commit but do not push
#
# Development only: the fonts are King Fahd Complex fonts published by QUL and are not redistributed.
# .gitignore admits the example's mirror (about 95 MB for both sets as woff2) until the public
# release; the release checklist in README.md removes it again. The npm package never contains fonts.
set -euo pipefail
cd "$(dirname "$0")/.."

FONTS=${FONTS:-all}
COMPILE=${COMPILE:-0}
PUSH=${PUSH:-1}

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = "HEAD" ]; then
  echo "pull-all-assets: detached HEAD; check out the branch that should receive the commit first" >&2
  exit 1
fi
if ! git diff --cached --quiet; then
  echo "pull-all-assets: the index already has staged changes; commit or unstage them first" >&2
  exit 1
fi

args=(--fonts "$FONTS" --etags --concurrency 4)
if [ "$COMPILE" = "1" ]; then
  args=(--from-pages "${args[@]}")
fi
echo "node scripts/fetch-qul.mjs ${args[*]}"
status=0
node scripts/fetch-qul.mjs "${args[@]}" || status=$?
if [ "$status" -ne 0 ]; then
  echo "pull-all-assets: fetch-qul reported problems (exit $status, see the report above); whatever was downloaded is committed anyway" >&2
fi

# Only what .gitignore admits is picked up: the compiled module, the ETags, the mirror's woff2/woff
# files, and the ttf/woff2 of the fixture pages in both places.
git add packages/remotion-mushaf-line-renderer/src/data/qpc-v4.generated.ts scripts/cdn-etags.json \
  example/public/fonts packages/remotion-mushaf-line-renderer/test/fixtures/fonts
if git diff --cached --quiet; then
  echo "pull-all-assets: nothing changed; nothing to commit"
  exit "$status"
fi
summary=$(git diff --cached --shortstat)
git commit -q -m "Mirror the QUL page fonts for development (pages: ${FONTS})" \
  -m "Pulled with scripts/pull-all-assets.sh: ${summary#"${summary%%[![:space:]]*}"}. Development only; removed before the public release."
git --no-pager log -1 --stat=80 --format='%h %s' | tail -n 4
if [ "$PUSH" = "1" ]; then
  git push -u origin "$branch"
fi
exit "$status"
