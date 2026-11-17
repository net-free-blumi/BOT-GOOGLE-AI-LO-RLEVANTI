import Database from 'better-sqlite3';

const db = new Database('bot.db');

// יצירת טבלת משתמשים במידה ולא קיימת
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    name TEXT,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'pending'
  )
`);

export default db;
