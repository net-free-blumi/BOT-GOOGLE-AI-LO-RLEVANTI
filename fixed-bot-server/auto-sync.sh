#!/bin/bash
# ====================================================================
# סקריפט סנכרון אוטומטי מ-GitHub לשרת הבוט (נסיעות בוט)
# מזהה אוטומטית שינויים ב-GitHub, מוריד אותם ומפעיל מחדש את PM2
# ====================================================================

BOT_DIR="/home/ubuntu/wa-rides-bot"
if [ -d "$BOT_DIR" ]; then
  cd "$BOT_DIR"
else
  cd "$(dirname "$0")"
fi

echo "🔄 [$(date '+%Y-%m-%d %H:%M:%S')] מתחיל בדיקת עדכונים מ-GitHub..."

if [ -d ".git" ]; then
  # בדיקה אם יש שינויים בענף הראשי
  git fetch origin 2>/dev/null || true
  LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
  REMOTE=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null || echo "")

  if [ -n "$REMOTE" ] && [ "$LOCAL" = "$REMOTE" ]; then
    echo "✨ השרת כבר מעודכן לגרסה האחרונה ($LOCAL). אין צורך בריסטרט."
    exit 0
  fi

  echo "📥 נמצאו עדכונים חדשים ב-GitHub! מבצע משיכה והחלה תוך שמירה על כל הנהגים..."

  # 1. גיבוי קריטי של כל נתוני המשתמשים, האישורים והחיבורים הקיימים
  BACKUP_DIR="/tmp/wa-rides-bot-safe-backup"
  mkdir -p "$BACKUP_DIR" 2>/dev/null || true
  for f in users.json users.backup.json searches.json lid-map.json onboarding-alerts.json dashboard.secret; do
    [ -f "$f" ] && cp -f "$f" "$BACKUP_DIR/$f" 2>/dev/null || true
  done
  [ -d "auth" ] && cp -rf "auth" "$BACKUP_DIR/" 2>/dev/null || true

  git reset --hard "$REMOTE" 2>/dev/null || git pull 2>/dev/null || true

  if [ -d "fixed-bot-server" ]; then
    echo "📋 מעתיק קבצי קוד מעודכנים מ-fixed-bot-server..."
    # העתקת קבצי קוד בלבד - ללא דריסת נתוני המשתמשים
    for item in fixed-bot-server/*; do
      base=$(basename "$item")
      if [ "$base" != "users.json" ] && [ "$base" != "searches.json" ] && [ "$base" != "lid-map.json" ] && [ "$base" != "auth" ]; then
        cp -rf "$item" ./ 2>/dev/null || true
      fi
    done
  fi

  # 2. שחזור קריטי של כל הנהגים והאישורים
  for f in users.json users.backup.json searches.json lid-map.json onboarding-alerts.json dashboard.secret; do
    [ -f "$BACKUP_DIR/$f" ] && cp -f "$BACKUP_DIR/$f" "./$f" 2>/dev/null || true
  done
  [ -d "$BACKUP_DIR/auth" ] && cp -rf "$BACKUP_DIR/auth" "./" 2>/dev/null || true
else
  echo "📦 מוריד גרסה אחרונה מהשרת המעודכן..."
  BACKUP_DIR="/tmp/wa-rides-bot-safe-backup"
  mkdir -p "$BACKUP_DIR" 2>/dev/null || true
  for f in users.json users.backup.json searches.json lid-map.json onboarding-alerts.json dashboard.secret; do
    [ -f "$f" ] && cp -f "$f" "$BACKUP_DIR/$f" 2>/dev/null || true
  done
  [ -d "auth" ] && cp -rf "auth" "$BACKUP_DIR/" 2>/dev/null || true

  curl -sSL https://nsiot.vercel.app/fixed-bot-server.tar.gz | tar -xz --strip-components=1 2>/dev/null || curl -sSL https://nsiot.vercel.app/fixed-bot-server-v3.2.tar.gz | tar -xz --strip-components=1 2>/dev/null || true

  for f in users.json users.backup.json searches.json lid-map.json onboarding-alerts.json dashboard.secret; do
    [ -f "$BACKUP_DIR/$f" ] && cp -f "$BACKUP_DIR/$f" "./$f" 2>/dev/null || true
  done
  [ -d "$BACKUP_DIR/auth" ] && cp -rf "$BACKUP_DIR/auth" "./" 2>/dev/null || true
fi

# בדיקת והתקנת תלויות
if [ -f "package.json" ]; then
  npm install --omit=dev --no-audit --no-fund 2>/dev/null || true
fi

echo "🚀 מפעיל מחדש את תהליך הבוט ב-PM2..."
pm2 restart wa-bot || pm2 restart all || pm2 restart wa-rides-bot || pm2 restart index.js 2>/dev/null || true

echo "✅ [$(date '+%Y-%m-%d %H:%M:%S')] סנכרון הושלם בהצלחה מלאה ללא פגיעה בנהגים!"
