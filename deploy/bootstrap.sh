#!/bin/bash
# EC2 user-data for Amazon Linux 2023: builds HabitatFire from GitHub and serves it
# behind Caddy (automatic HTTPS). Secrets come from SSM Parameter Store /habitatfire/*.
set -euxo pipefail
export HOME="${HOME:-/root}"
REPO=https://github.com/UFRJ-Analytica/hkt_flame_in_freefall.git
BRANCH="${HABITATFIRE_BRANCH:-develop}"
APP=/opt/habitatfire
DOMAIN=habitatfire.us

# 2 GiB swap so the Vite/three.js build fits comfortably.
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048 && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

dnf install -y git nodejs22 nodejs22-npm python3.11 python3.11-pip tar
ln -sf "$(command -v node-22 || command -v node)" /usr/local/bin/node || true
ln -sf "$(command -v npm-22 || command -v npm)" /usr/local/bin/npm || true

useradd --system --home "$APP" --shell /sbin/nologin habitatfire || true
if [ ! -d "$APP/.git" ]; then git clone --branch "$BRANCH" "$REPO" "$APP"; fi

cat > /usr/local/bin/habitatfire-deploy <<'EOS'
#!/bin/bash
# Pull the configured branch, rebuild and restart. Usage: habitatfire-deploy [branch]
set -euxo pipefail
APP=/opt/habitatfire
export HOME="${HOME:-/root}"
BRANCH="${1:-$(git -C $APP rev-parse --abbrev-ref HEAD)}"
git config --system --add safe.directory $APP
git -C $APP fetch origin "$BRANCH"
git -C $APP checkout -B "$BRANCH" "origin/$BRANCH"
cd $APP
python3.11 -m venv .venv
.venv/bin/pip install -q -r backend/requirements.txt
npm ci --no-audit --no-fund
npm run build
chown -R habitatfire:habitatfire $APP
systemctl restart habitatfire
EOS
chmod 755 /usr/local/bin/habitatfire-deploy

cat > /usr/local/bin/habitatfire-secrets <<'EOS'
#!/bin/bash
# Write /opt/habitatfire/.env from SSM Parameter Store. Fails (and systemd retries) until they exist.
set -euo pipefail
TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
REGION=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)
OUT=$(aws ssm get-parameters-by-path --region "$REGION" --path /habitatfire/ --with-decryption \
      --query 'Parameters[].[Name,Value]' --output text)
grep -q ANTHROPIC_API_KEY <<<"$OUT"
umask 077
awk -F'\t' '{ sub("^/habitatfire/", "", $1); print $1 "=" $2 }' <<<"$OUT" > /opt/habitatfire/.env
chown habitatfire:habitatfire /opt/habitatfire/.env
EOS
chmod 755 /usr/local/bin/habitatfire-secrets

cat > /etc/systemd/system/habitatfire.service <<'EOS'
[Unit]
Description=HabitatFire research API + built frontend
After=network-online.target
Wants=network-online.target

[Service]
User=habitatfire
WorkingDirectory=/opt/habitatfire
PermissionsStartOnly=true
ExecStartPre=/usr/local/bin/habitatfire-secrets
ExecStart=/opt/habitatfire/.venv/bin/python -u -m backend.server
Environment=HOST=127.0.0.1 PORT=8000 PYTHONUNBUFFERED=1
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
EOS

# Caddy: official static binary, automatic Let's Encrypt for the domain; plain HTTP on the IP for checks.
if [ ! -x /usr/local/bin/caddy ]; then
  curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" -o /usr/local/bin/caddy
  chmod 755 /usr/local/bin/caddy
fi
useradd --system --home /var/lib/caddy --create-home --shell /sbin/nologin caddy || true
mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<EOS
$DOMAIN, www.$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8000
}

http:// {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8000
}
EOS
cat > /etc/systemd/system/caddy.service <<'EOS'
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
User=caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=on-failure
Environment=HOME=/var/lib/caddy

[Install]
WantedBy=multi-user.target
EOS

systemctl daemon-reload
systemctl enable habitatfire caddy
/usr/local/bin/habitatfire-deploy "$BRANCH"
systemctl restart caddy
