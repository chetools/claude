#!/usr/bin/env bash
# Deploy the shared-ranking Worker. Needs CLOUDFLARE_API_TOKEN (permissions: Workers Scripts Edit, D1 Edit)
# and CLOUDFLARE_ACCOUNT_ID. Creates the D1 database on first run, applies the schema, deploys, writes url.txt.
set -euo pipefail
cd "$(dirname "$0")"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}" "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
[ -d node_modules ] || npm ci
if grep -q '@@D1_ID@@' wrangler.toml; then
  id=$(npx wrangler d1 create image-to-text-ranking 2>&1 | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  [ -n "$id" ] || { echo "could not create the D1 database"; exit 1; }
  sed -i "s/@@D1_ID@@/$id/" wrangler.toml
fi
npx wrangler d1 execute image-to-text-ranking --remote --file schema.sql
url=$(npx wrangler deploy 2>&1 | tee /dev/stderr | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
[ -n "$url" ] || { echo "deploy printed no workers.dev URL"; exit 1; }
echo "$url" > url.txt
echo "deployed: $url"
