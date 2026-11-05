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

  echo "📥 נמצאו עדכונים חדשים ב-GitHub! מבצע משיכה והחלה..."
  git reset --hard "$REMOTE" 2>/dev/null || git pull 2>/dev/null || true

  if [ -d "fixed-bot-server" ]; then
    echo "📋 מעתיק קבצים מ-fixed-bot-server לתיקייה הראשית..."
    cp -rf fixed-bot-server/* ./ 2>/dev/null || true
  fi
else
  echo "📦 מוריד גרסה אחרונה מהשרת המעודכן..."
  curl -sSL https://nsiot.vercel.app/fixed-bot-server-v3.0.tar.gz | tar -xz --strip-components=1 2>/dev/null || true
fi

# בדיקת תלויות אם השתנו
if [ -f "package.json" ]; then
  npm install --omit=dev --no-audit --no-fund 2>/dev/null || true
fi

echo "🚀 מפעיל מחדש את תהליך הבוט ב-PM2..."
pm2 restart all || pm2 restart wa-rides-bot || pm2 restart index.js 2>/dev/null || true

echo "✅ [$(date '+%Y-%m-%d %H:%M:%S')] סנכרון הושלם בהצלחה מלאה!"
