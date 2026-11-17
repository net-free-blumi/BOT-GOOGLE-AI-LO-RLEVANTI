/**
 * גרסה משודרגת של dashboard-api.js
 * שים קובץ זה בשרת הבוט שלך לצד הבוט (או החלף את dashboard-api.js הקיים)
 */
import express from "express";
import os from "os";
import crypto from "crypto";
import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.DASHBOARD_PORT || 3000);
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOG_MAX = 300;
const sessions = new Map();
const logs = [];
const startedAt = Date.now();
let listenStarted = false;
let waConnected = false;
let lastPairingCode = null;
let lastDisconnectReason = "";
let ctx = null;

const stats = {
  day: israelDay(),
  scanned: 0,
  sent: 0,
  rejected: 0,
  duplicates: 0,
  commands: 0,
};

function israelDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

function resetStatsIfNewDay() {
  const day = israelDay();
  if (stats.day !== day) {
    stats.day = day;
    stats.scanned = 0;
    stats.sent = 0;
    stats.rejected = 0;
    stats.duplicates = 0;
    stats.commands = 0;
  }
}

function loadPassword() {
  if (process.env.DASHBOARD_PASSWORD) return process.env.DASHBOARD_PASSWORD.trim();
  if (existsSync("dashboard.secret")) return readFileSync("dashboard.secret", "utf8").trim();
  const generated = crypto.randomBytes(5).toString("hex");
  writeFileSync("dashboard.secret", generated, "utf8");
  console.log("🔐 נוצר קובץ dashboard.secret עם סיסמת לוח הבקרה: " + generated);
  return generated;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function newToken() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function validToken(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function clipText(text, n = 200) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, n);
}

export function recordEvent(type, message, extra = {}) {
  resetStatsIfNewDay();
  if (type === "scan") stats.scanned += 1;
  if (type === "sent") {
    stats.scanned += 1;
    stats.sent += 1;
  }
  if (type === "rejected") {
    stats.scanned += 1;
    stats.rejected += 1;
  }
  if (type === "duplicate") {
    stats.scanned += 1;
    stats.duplicates += 1;
  }
  if (type === "command") stats.commands += 1;

  logs.unshift({
    t: Date.now(),
    type,
    message: clipText(message, 200),
    ...extra,
  });
  if (logs.length > LOG_MAX) logs.length = LOG_MAX;
}

export function setWaConnection(connected, reason = "") {
  waConnected = Boolean(connected);
  if (reason) lastDisconnectReason = String(reason);
  if (connected) lastDisconnectReason = "";
  recordEvent(connected ? "system" : "error", connected ? "וואטסאפ מחובר" : `וואטסאפ התנתק${reason ? `: ${reason}` : ""}`);
}

export function setPairingCode(code) {
  lastPairingCode = code || null;
}

function metrics() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const load = os.loadavg();
  const rss = process.memoryUsage().rss;
  return {
    cpuLoad: load[0].toFixed(2),
    loadAvg: load.map((n) => n.toFixed(2)),
    ramUsageMB: Math.round(rss / 1024 / 1024),
    ramPercentage: Math.round((used / total) * 100),
    ramUsedMB: Math.round(used / 1024 / 1024),
    ramTotalMB: Math.round(total / 1024 / 1024),
    uptime: Math.floor(process.uptime()),
    hostUptime: Math.floor(os.uptime()),
    cores: os.cpus()?.length || 0,
  };
}

function statusPayload() {
  resetStatsIfNewDay();
  const state = ctx?.getDriverState ? ctx.getDriverState() : { active: false, displayText: "אין חיפוש" };
  const m = metrics();
  return {
    ok: true,
    apiVersion: 2,
    wa: {
      connected: waConnected,
      registered: Boolean(ctx?.isRegistered?.()),
      pairingCode: lastPairingCode,
      lastDisconnectReason,
    },
    search: {
      active: Boolean(state.active),
      mode: state.mode,
      origin: state.origin,
      destination: state.destination,
      displayText: state.displayText,
      describe: state.active && ctx?.describeMode ? ctx.describeMode(state) : "אין חיפוש פעיל",
    },
    server: {
      ...m,
      processUptimeMs: Date.now() - startedAt,
      pm2: process.env.PM2_NAME || "wa-bot",
      node: process.version,
    },
    stats: {
      ...stats,
      groups: ctx?.groupCount?.() ?? 0,
      dedupeSize: ctx?.dedupeSize?.() ?? 0,
    },
    settings: ctx?.settings || {},
    ramUsageMB: m.ramUsageMB,
    ramPercentage: m.ramPercentage,
    cpuLoad: m.cpuLoad,
    uptime: m.uptime,
  };
}

function applySearchCommand(text) {
  const raw = String(text || "").trim();
  const norm = ctx?.normalizeText ? ctx.normalizeText(raw) : raw;
  if (/(^| )(תפוס|עצור|סגור)( |$)/.test(norm)) {
    if (ctx?.emptyState) ctx.setDriverState({ ...ctx.emptyState });
    recordEvent("command", "חיפוש הופסק מהאתר");
    ctx?.notifyOwner?.("🛑 *הבוט הופסק מהאתר. מצב פנוי מבוטל.*");
    return { ok: true, message: "החיפוש הופסק בהצלחה", search: ctx?.getDriverState ? ctx.getDriverState() : {} };
  }
  if (!(norm.startsWith("פנוי") || norm.includes("מחפש"))) {
    return { ok: false, error: 'הפקודה חייבת להתחיל ב"פנוי" או לכלול "מחפש", או להיות "תפוס".' };
  }
  const next = { active: true, ...(ctx?.processDriverCommand ? ctx.processDriverCommand(raw) : {}) };
  ctx?.setDriverState?.(next);
  recordEvent("command", `הופעל חיפוש: ${next.displayText || raw}`);
  ctx?.notifyOwner?.(`✅ *מצב פנוי הופעל מהאתר!*\n\n🔍 *חיפוש מוגדר:* ${next.displayText || raw}`);
  return { ok: true, message: `חיפוש הופעל: ${next.displayText || raw}`, search: next };
}

function pm2(cmd) {
  return new Promise((resolve) => {
    const name = process.env.PM2_NAME || "wa-bot";
    exec(`pm2 ${cmd} ${name}`, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: (stderr || err.message || "pm2 failed").trim() });
      else resolve({ ok: true, message: (stdout || `pm2 ${cmd} הצליח`).trim() });
    });
  });
}

export function startDashboard(runtime) {
  ctx = runtime;
  if (listenStarted) return;
  listenStarted = true;

  const password = loadPassword();
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  // CORS middleware allowing Netlify and custom domains
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Public Health Ping Endpoint (No Auth Required)
  app.get("/api/ping", (_req, res) => {
    res.json({ ok: true, time: Date.now(), botRunning: true });
  });

  // Auth Login
  app.post("/api/login", (req, res) => {
    if (!safeEqual(req.body?.password, password)) {
      return res.status(401).json({ ok: false, error: "סיסמה שגויה" });
    }
    res.json({ ok: true, token: newToken() });
  });

  // Auth Guard
  app.use("/api", (req, res, next) => {
    if (req.path === "/login" || req.path === "/ping") return next();
    if (!validToken(req)) return res.status(401).json({ ok: false, error: "נדרשת התחברות" });
    next();
  });

  app.get("/api/status", (_req, res) => res.json(statusPayload()));

  app.get("/api/logs", (req, res) => {
    const type = String(req.query.type || "all");
    const limit = Math.min(Number(req.query.limit) || 100, LOG_MAX);
    const rows = type === "all" ? logs : logs.filter((l) => l.type === type);
    res.json({ ok: true, logs: rows.slice(0, limit) });
  });

  app.post("/api/search", (req, res) => {
    const result = applySearchCommand(req.body?.command);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  app.post("/api/search/stop", (_req, res) => {
    res.json(applySearchCommand("תפוס"));
  });

  app.post("/api/bot/restart", async (_req, res) => {
    recordEvent("system", "בקשת הפעלה מחדש מהאתר");
    const result = await pm2("restart");
    if (!result.ok) {
      setTimeout(() => process.exit(0), 400);
      return res.json({ success: true, ok: true, message: "התהליך ייסגר ו-PM2 יעלה אותו מחדש" });
    }
    res.json({ success: true, ...result });
  });

  app.post("/api/bot/stop", async (_req, res) => {
    recordEvent("system", "בקשת עצירה מהאתר");
    const result = await pm2("stop");
    res.json({ success: result.ok, ...result });
  });

  // Option: Serve static built frontend from /dist if present on the server
  const distPath = path.join(process.cwd(), "dist");
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🖥️  לוח בקרה פעיל ומאזין על פורט ${PORT} (GET /api/ping תקין)`);
  });
}
