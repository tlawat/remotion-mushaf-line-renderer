#!/usr/bin/env bash
# Mirrors QUL's assets for development: the two data exports the package fetches at runtime (into
# example/public/data/qpc-v4, validated) and the page fonts (into example/public/fonts, both sets;
# every page's woff2, and the ttf of the fixture pages), refreshes scripts/cdn-etags.json, then
# commits and pushes the result on the current branch. Run it on a machine that can reach
# qul.tarteel.ai, static-cdn.tarteel.ai and s3.us-east-1.wasabisys.com; it needs Node 22.13+ and
# git, nothing else (scripts/fetch-qul.mjs has no dependencies).
#
#   bash scripts/pull-all-assets.sh              # exports + fonts of all 604 pages + ETags, commit, push
#   FONTS=187-207 bash scripts/pull-all-assets.sh  # a subset of pages (a list or ranges, like the workflow)
#   DATA=0 bash scripts/pull-all-assets.sh       # fonts only, keep the mirrored exports as they are
#   COMPARE=1 bash scripts/pull-all-assets.sh    # also compile QUL's preview pages and compare them with the exports
#   PUSH=0 bash scripts/pull-all-assets.sh       # commit but do not push
#
# The exports are open data and stay committed (the suites and CI read them). The fonts are King
# Fahd Complex fonts published by QUL and are not redistributed: .gitignore admits the example's
# mirror (about 95 MB for both sets as woff2) until the public release; the release checklist in
# README.md removes it again. The npm package contains neither.
set -euo pipefail
cd "$(dirname "$0")/.."

FONTS=${FONTS:-all}
DATA=${DATA:-1}
COMPARE=${COMPARE:-0}
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
if [ "$DATA" = "1" ]; then
  args=(--data "${args[@]}")
fi
if [ "$COMPARE" = "1" ]; then
  args=(--from-pages "${args[@]}")
fi
echo "node scripts/fetch-qul.mjs ${args[*]}"
status=0
node scripts/fetch-qul.mjs "${args[@]}" || status=$?
if [ "$status" -ne 0 ]; then
  echo "pull-all-assets: fetch-qul reported problems (exit $status, see the report above); whatever was downloaded is committed anyway" >&2
fi

# Only what .gitignore admits is picked up: the mirrored exports, the ETags, the mirror's woff2/woff
# files, and the ttf/woff2 of the fixture pages in both places.
git add example/public/data scripts/cdn-etags.json \
  example/public/fonts packages/remotion-mushaf-line-renderer/test/fixtures/fonts
if git diff --cached --quiet; then
  echo "pull-all-assets: nothing changed; nothing to commit"
  exit "$status"
fi
summary=$(git diff --cached --shortstat)
git commit -q -m "Mirror QUL's exports and page fonts for development (pages: ${FONTS})" \
  -m "Pulled with scripts/pull-all-assets.sh: ${summary#"${summary%%[![:space:]]*}"}. The fonts are development only; removed before the public release."
git --no-pager log -1 --stat=80 --format='%h %s' | tail -n 4
if [ "$PUSH" = "1" ]; then
  git push -u origin "$branch"
fi
exit "$status"
