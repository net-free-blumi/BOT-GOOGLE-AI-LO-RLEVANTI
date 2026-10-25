import db from './database.js';

const ADMIN_PHONE = '0515157166';

// 1. בדיקת סטטוס משתמש
export function getUserStatus(phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  const stmt = db.prepare('SELECT * FROM users WHERE phone = ?');
  const user = stmt.get(cleanPhone);
  if (!user) return { registered: false, status: 'none' };
  return { registered: true, status: user.status, role: user.role, name: user.name };
}

// 2. רישום בקשה חדשה למשתמש
export function registerNewUserRequest(phone, pushName) {
  const cleanPhone = phone.replace(/\D/g, '');
  const stmt = db.prepare(`
    INSERT INTO users (phone, name, role, status)
    VALUES (?, ?, 'user', 'pending')
    ON CONFLICT(phone) DO UPDATE SET name = excluded.name
  `);
  stmt.run(cleanPhone, pushName || 'משתמש חדש');
}

// 3. עדכון סטטוס על ידי המנהל (אישור / חסימה)
export function updateUserStatus(phone, status) {
  const cleanPhone = phone.replace(/\D/g, '');
  const stmt = db.prepare('UPDATE users SET status = ? WHERE phone = ?');
  const result = stmt.run(status, cleanPhone);
  return result.changes > 0;
}

// 4. בניית הודעת מדריך חיבור (כמו בתמונה)
export function getPairingInstructions() {
  return `🔗 *חיבור לנסיעות בוט*

📲 *איך מזינים (באותו טלפון):*
1. וואטסאפ ⬅️ הגדרות ⬅️ מכשירים מקושרים
2. קישור מכשיר
3. למטה: "קישור עם מספר טלפון במקום"
4. הזן את הקוד שבהודעה הבאה.

⏱️ *בתוקף כמה דקות. אם פג – לחץ "קוד חדש".*`;
}
