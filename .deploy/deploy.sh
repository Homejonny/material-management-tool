#!/bin/bash
set -e
SERVER="root@178.104.61.72"
KEY="$HOME/.ssh/deploy_key"

if [ ! -f "$KEY" ]; then
  echo "SSH ključ manjka na $KEY"
  exit 1
fi

echo "=== Build frontend ==="
pnpm --filter @workspace/data-app run build 2>&1

echo "=== Deploy na strežnik ==="
scp -o StrictHostKeyChecking=no -i "$KEY" -r artifacts/data-app/dist/public/* "$SERVER":/opt/apps/material/

echo "=== Posodobi index.html ==="
ssh -o StrictHostKeyChecking=no -i "$KEY" "$SERVER" "/apps/material-management-tool/deploy/fix-index.sh"

echo "=== DONE ==="
