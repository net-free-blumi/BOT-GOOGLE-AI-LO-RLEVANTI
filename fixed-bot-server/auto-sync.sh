#!/bin/bash
set -e
echo "Starting auto-sync..."

# Backup dynamic data
mkdir -p /tmp/wa-safe-bak
for f in users.json users.backup.json searches.json lid-map.json group-metadata.json onboarding-alerts.json dashboard.secret auth telegram_sessions; do
  [ -e "$f" ] && cp -rf "$f" /tmp/wa-safe-bak/ || true
  [ -e "fixed-bot-server/$f" ] && cp -rf "fixed-bot-server/$f" /tmp/wa-safe-bak/ || true
done

# Pull updates
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Pulling from git..."
  git fetch origin main || true
  git reset --hard origin/main || true
fi

echo "Updating code bundle..."
if [ -d "fixed-bot-server" ]; then
  cp -rf fixed-bot-server/* ./ 2>/dev/null || true
  (cd fixed-bot-server && npm install --omit=dev --no-audit --no-fund 2>/dev/null || true)
fi
npm install --omit=dev --no-audit --no-fund 2>/dev/null || true

# Restore dynamic data
for f in users.json users.backup.json searches.json lid-map.json group-metadata.json onboarding-alerts.json dashboard.secret auth telegram_sessions; do
  [ -e "/tmp/wa-safe-bak/$f" ] && cp -rf "/tmp/wa-safe-bak/$f" ./ || true
  [ -d "fixed-bot-server" ] && [ -e "/tmp/wa-safe-bak/$f" ] && cp -rf "/tmp/wa-safe-bak/$f" fixed-bot-server/ || true
done

echo "Restarting PM2 process..."
pm2 restart all || pm2 restart wa-rides-bot || pm2 restart wa-bot || pm2 restart index.js || true
echo "Auto-sync completed successfully!"
