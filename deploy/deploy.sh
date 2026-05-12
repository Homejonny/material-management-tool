#!/bin/bash
set -e
HETZNER="root@178.104.61.72"
SSH_KEY="$HOME/.ssh/id_ed25519"
if [ ! -f "$SSH_KEY" ]; then
  if [ -n "$SSH_PRIVATE_KEY" ]; then
    mkdir -p ~/.ssh
    printf '%s\n' "$SSH_PRIVATE_KEY" | sed 's/ /\n/g' | \
      sed '1s/^/-----BEGIN OPENSSH PRIVATE KEY-----\n/' | \
      sed '$a-----END OPENSSH PRIVATE KEY-----' > "$SSH_KEY"
    chmod 600 "$SSH_KEY"
    ssh-keyscan -H 178.104.61.72 >> ~/.ssh/known_hosts 2>/dev/null
    echo "SSH kljuc obnovljen."
  else
    echo "NAPAKA: SSH_PRIVATE_KEY secret ni nastavljen!"; exit 1
  fi
fi
DO_API=false; DO_FRONTEND=false
if [ $# -eq 0 ]; then DO_API=true; DO_FRONTEND=true
else for arg in "$@"; do case "$arg" in --api) DO_API=true;; --frontend) DO_FRONTEND=true;; esac; done; fi
echo "=== Material Management Tool — Deploy na Hetzner ==="
if [ "$DO_API" = true ]; then
  echo ""; echo "▶ Build API..."
  pnpm --filter @workspace/api-server run build
  echo "▶ Upload API..."
  cd artifacts/api-server && tar -czf /tmp/material-api.tar.gz dist/ && cd -
  cat /tmp/material-api.tar.gz | ssh -i "$SSH_KEY" "$HETZNER" \
    "cat > /tmp/material-api.tar.gz && rm -rf /opt/apps/material-api/dist && \
     tar -xzf /tmp/material-api.tar.gz -C /opt/apps/material-api && echo '  API uploadana'"
  echo "▶ Restart API containerja..."
  ssh -i "$SSH_KEY" "$HETZNER" \
    "cd /opt/regal-app && docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --force-recreate material-api 2>&1 | tail -4"
fi
if [ "$DO_FRONTEND" = true ]; then
  echo ""; echo "▶ Build frontend..."
  PORT=3000 BASE_PATH=/material/ pnpm --filter @workspace/data-app run build
  echo "▶ Upload frontend..."
  cd artifacts/data-app && tar -czf /tmp/material-frontend.tar.gz dist/public/ && cd -
  cat /tmp/material-frontend.tar.gz | ssh -i "$SSH_KEY" "$HETZNER" \
    "cat > /tmp/material-frontend.tar.gz && rm -rf /opt/apps/material/* && \
     tar -xzf /tmp/material-frontend.tar.gz -C /opt/apps/material --strip-components=2 && echo '  Frontend uploadana'"
  echo "▶ Dodajanje popravkov..."
  ssh -i "$SSH_KEY" "$HETZNER" python3 << 'PYEOF'
with open("/opt/apps/material/index.html","r") as f: html=f.read()
polyfill='    <script>\n      if (!crypto.randomUUID) { crypto.randomUUID=function(){ return "10000000-1000-4000-8000-100000000000".replace(/[018]/g,function(c){var n=+c;return(n^crypto.getRandomValues(new Uint8Array(1))[0]&15>>n/4).toString(16)});}}\n      try{var s=localStorage.getItem("nabave_session");if(s)JSON.parse(s);}catch(e){localStorage.removeItem("nabave_session");}\n    </script>\n    '
portal_style='    <style>\n      #gmp-portal-btn{position:fixed;bottom:20px;left:20px;z-index:9999;display:flex;align-items:center;gap:7px;padding:8px 14px;background:#1a1d27;border:1px solid #2d3148;border-radius:8px;color:#94a3b8;font-family:sans-serif;font-size:13px;font-weight:500;text-decoration:none;cursor:pointer;transition:background .15s,color .15s;box-shadow:0 2px 8px rgba(0,0,0,.3);}\n      #gmp-portal-btn:hover{background:#252838;color:#e2e8f0;}\n    </style>\n  </head>'
portal_btn='    <a id="gmp-portal-btn" href="/" title="Nazaj na Platforma GMP"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> Platforma GMP</a>\n  </body>'
if "crypto.randomUUID" not in html: html=html.replace('    <script type="module"',polyfill+'    <script type="module"',1);print("  Polyfill dodan.")
else: print("  Polyfill ze prisoten.")
if "gmp-portal-btn" not in html: html=html.replace("  </head>",portal_style,1);html=html.replace("  </body>",portal_btn,1);print("  Portal gumb dodan.")
else: print("  Portal gumb ze prisoten.")
with open("/opt/apps/material/index.html","w") as f: f.write(html)
PYEOF
fi
echo ""; echo "✓ Uspesno deployano! http://178.104.61.72/material/"
