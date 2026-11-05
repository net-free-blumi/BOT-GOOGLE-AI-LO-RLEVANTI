import express from "express";
import os from "os";
import crypto from "crypto";
import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { 
  loadUsersData, 
  saveUsersData, 
  approveUser, 
  rejectUser, 
  deleteApprovedUser, 
  updateUserPhone,
  editUserDetails,
  cleanPhone 
} from "./users-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.DASHBOARD_PORT || process.env.PORT || 3000);
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const LOG_MAX = 300;
const sessions = new Map();
const logs = [];
const startedAt = Date.now();
let listenStarted = false;
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
  const secretPath = path.join(__dirname, "dashboard.secret");
  if (existsSync(secretPath)) return readFileSync(secretPath, "utf8").trim();
  const defaultPass = "0515157166";
  try {
    writeFileSync(secretPath, defaultPass, "utf8");
    console.log(`🔐 נוצר קובץ dashboard.secret עם סיסמת לוח הבקרה: ${defaultPass}`);
  } catch (e) {}
  return defaultPass;
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

const ERROR_LOG_MAX = 150;
const errorReports = [];

export function recordError(category, err, extra = {}) {
  const message = String(err?.message || err || "שגיאה לא מוגדרת");
  const stack = err?.stack ? String(err.stack) : null;
  const item = {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    t: Date.now(),
    timestamp: Date.now(),
    time: new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem" }),
    date: new Date().toISOString(),
    category: category || "general",
    message,
    stack,
    details: extra,
  };
  errorReports.unshift(item);
  if (errorReports.length > ERROR_LOG_MAX) errorReports.length = ERROR_LOG_MAX;
  console.error(`🔴 [ErrorTracker] [${category}]:`, message, extra);
}

export function getErrorReports() {
  return errorReports;
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

  const now = Date.now();
  const timeStr = new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem" });
  const row = {
    id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
    t: now,
    timestamp: now,
    time: timeStr,
    date: new Date().toISOString(),
    type,
    message,
    ...extra,
  };
  logs.unshift(row);
  if (logs.length > LOG_MAX) logs.length = LOG_MAX;

  if (type === "error") {
    recordError("system_event", message, extra);
  }
}

export function setWaConnection() {}
export function setPairingCode() {}

function metrics() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const load = os.loadavg();
  const rss = process.memoryUsage().rss;
  return {
    cpuLoad: load[0] ? load[0].toFixed(2) : "0.15",
    loadAvg: load.map((n) => n.toFixed(2)),
    ramUsageMB: Math.round(rss / 1024 / 1024),
    ramPercentage: Math.round((used / total) * 100),
    ramUsedMB: Math.round(used / 1024 / 1024),
    ramTotalMB: Math.round(total / 1024 / 1024),
    uptime: Math.floor(process.uptime()),
    hostUptime: Math.floor(os.uptime()),
    cores: os.cpus()?.length || 1,
  };
}

function getUnifiedStatus(requestedPhone) {
  resetStatsIfNewDay();
  const m = metrics();
  const users = loadUsersData();
  const sessionsSummary = ctx?.getAllSessions ? ctx.getAllSessions() : null;

  const botInfo = sessionsSummary?.bot || {
    phone: users.botPhone || "972555081810",
    connected: false,
    registered: false,
    pairingCode: null,
    lastDisconnectReason: "",
  };

  // אם נבחר נהג ספציפי
  const targetDriverPhone = requestedPhone ? cleanPhone(requestedPhone) : cleanPhone(users.adminPhone);
  const driverSearch = ctx?.getUserSearch ? ctx.getUserSearch(targetDriverPhone) : { active: false, displayText: "אין חיפוש" };
  const driverSess = sessionsSummary?.drivers?.find((d) => cleanPhone(d.phone) === targetDriverPhone);

  return {
    status: "online",
    ok: true,
    apiVersion: 3,
    uptime: m.uptime,
    ramUsageMB: m.ramUsageMB,
    totalRamMB: m.ramTotalMB,
    ramPercentage: m.ramPercentage,
    cpuLoad: m.cpuLoad,
    whatsappConnected: botInfo.connected,
    waStatus: botInfo.connected ? "connected" : "disconnected",
    activeSearch: driverSearch.active ? driverSearch.displayText : null,

    selectedDriver: {
      phone: targetDriverPhone,
      connected: driverSess?.status === "connected",
      status: driverSess?.status || "disconnected",
      search: driverSearch,
    },

    wa: {
      connected: botInfo.connected,
      registered: botInfo.registered,
      pairingCode: botInfo.pairingCode,
      lastDisconnectReason: botInfo.lastDisconnectReason,
      botPhone: botInfo.phone,
      adminPhone: users.adminPhone,
      connectedDriversCount: sessionsSummary?.totalConnectedDrivers || 0,
    },
    sessions: sessionsSummary,
    search: {
      active: Boolean(driverSearch.active),
      mode: driverSearch.mode,
      origin: driverSearch.origin,
      destination: driverSearch.destination,
      displayText: driverSearch.displayText,
      describe: driverSearch.active && ctx?.describeMode ? ctx.describeMode(driverSearch) : "אין חיפוש פעיל",
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
      approvedUsersCount: users.approvedUsers?.length || 1,
      pendingUsersCount: users.pendingUsers?.length || 0,
    },
    settings: ctx?.settings || {
      defaultCity: "בית שמש",
      dedupeMinutes: 15,
      strictDirection: true,
      debugFilter: true,
    },
  };
}

function pm2(cmd) {
  return new Promise((resolve) => {
    const name = process.env.PM2_NAME || "wa-bot";
    exec(`pm2 ${cmd} ${name}`, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, success: false, error: (stderr || err.message || "pm2 failed").trim() });
      else resolve({ ok: true, success: true, message: (stdout || `pm2 ${cmd} הצליח`).trim() });
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

  // CORS מלא
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // אימות התחברות
  const handleAuth = (req, res) => {
    const sentPass = req.body?.password || req.body?.secret;
    if (safeEqual(sentPass, password)) {
      return res.json({ ok: true, success: true, token: newToken() });
    }
    return res.status(401).json({ ok: false, success: false, error: "סיסמה שגויה" });
  };

  app.post("/api/login", handleAuth);
  app.post("/api/auth", handleAuth);

  // סטטוס מלא (תומך בפרמטר ?phone= לסינון לפי נהג)
  app.get("/api/status", (req, res) => {
    res.json(getUnifiedStatus(req.query.phone));
  });

  // סשנים פעילים (ריבוי וואטסאפ: בוט + נהגים)
  app.get("/api/sessions", (_req, res) => {
    const summary = ctx?.getAllSessions ? ctx.getAllSessions() : { bot: {}, drivers: [] };
    res.json({ ok: true, ...summary });
  });

  // הפקת קוד צימוד לפי דרישה (לבוט או לנהג ספציפי)
  app.post("/api/pairing/request", async (req, res) => {
    const phone = req.body?.phone;
    const isBot = Boolean(req.body?.isBot);
    const forceReset = Boolean(req.body?.forceReset);
    try {
      if (!ctx?.requestPairingCodeForPhone) {
        return res.status(400).json({ ok: false, error: "מנוע הבוט אינו מחובר כעת" });
      }
      const code = await ctx.requestPairingCodeForPhone(phone, isBot, { forceReset });
      recordEvent("system", `הופק קוד צימוד עבור ${phone || "בוט"}: ${code}`);
      res.json({ ok: true, code, phone: cleanPhone(phone) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // קבלת קוד QR חי לוואטסאפ ווב (תומך ב-/api/driver/qr/:phone וכן ב-/api/pairing/qr)
  const handleDriverQrRequest = async (req, res) => {
    const isBot = req.query.isBot === "true" || req.query.target === "bot";
    const phone = req.params?.phone || req.query.phone;

    try {
      if (isBot) {
        const summary = ctx?.getAllSessions ? ctx.getAllSessions() : {};
        const isConn = Boolean(summary.bot?.connected);
        const qr = summary.bot?.qr || null;
        return res.json({
          ok: true,
          isBot: true,
          phone: summary.bot?.phone || "bot",
          qr,
          status: isConn ? "connected" : (qr ? "qr_ready" : "connecting"),
          connected: isConn,
          qrUpdatedAt: summary.bot?.qrTimestamp || Date.now(),
        });
      }

      if (!phone) {
        return res.status(400).json({ ok: false, error: "נדרש מספר טלפון להפקת קוד QR לנהג" });
      }

      const cleanP = cleanPhone(phone);
      if (ctx?.ensureDriverSessionForQr) {
        const sessionInfo = await ctx.ensureDriverSessionForQr(cleanP);
        const isConn = sessionInfo.status === "connected" || Boolean(sessionInfo.registered);
        return res.json({
          ok: true,
          isBot: false,
          phone: cleanP,
          qr: sessionInfo.qr,
          status: sessionInfo.status || (isConn ? "connected" : (sessionInfo.qr ? "qr_ready" : "connecting")),
          registered: sessionInfo.registered,
          connected: isConn,
          qrUpdatedAt: sessionInfo.qrTimestamp || Date.now(),
        });
      }

      const summary = ctx?.getAllSessions ? ctx.getAllSessions() : { drivers: [] };
      const drv = (summary.drivers || []).find((d) => cleanPhone(d.phone) === cleanP);
      const isConn = drv?.status === "connected" || Boolean(drv?.registered);
      res.json({
        ok: true,
        isBot: false,
        phone: cleanP,
        qr: drv?.qr || null,
        status: drv?.status || (isConn ? "connected" : (drv?.qr ? "qr_ready" : "connecting")),
        registered: Boolean(drv?.registered),
        connected: isConn,
        qrUpdatedAt: drv?.qrTimestamp || Date.now(),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  };

  app.get("/api/driver/qr/:phone", handleDriverQrRequest);
  app.get("/api/pairing/qr", handleDriverQrRequest);

  // איפוס מלא של כל סשני הנהגים, מחיקת כל הקוקיז ואיפוס כל מיפויי ה-LID מהשרת (ללא פגיעה בבוט הראשי)
  app.post("/api/sessions/clear-all", (_req, res) => {
    try {
      if (ctx?.purgeAllDriverSessions) {
        const result = ctx.purgeAllDriverSessions();
        recordEvent("system", "איפוס מלא של כל הקוקיז, הסשנים ומיפויי ה-LID מהאתר");
        return res.json({
          ok: true,
          success: true,
          message: "כל קובצי האימות (קוקיז) של הנהגים ומיפויי ה-LID נמחקו ואופסו בהצלחה",
          ...result,
        });
      }
      res.json({ ok: true, success: true, message: "הסשנים אופסו" });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // איפוס מלא של סשן נהג, מחיקת קוקיז/תיקיות אימות והסרת חסימות צינון
  app.post("/api/sessions/reset-auth", (req, res) => {
    const phone = req.body?.phone || req.body?.identifier;
    if (!phone) return res.status(400).json({ ok: false, error: "נדרש מספר טלפון או מזהה נהג" });
    try {
      if (ctx?.resetDriverAuth) {
        const result = ctx.resetDriverAuth(phone);
        recordEvent("system", `איפוס סשן וקוקיז מלא לנהג: ${phone}`);
        return res.json({ ok: true, success: true, message: "קובצי האימות (קוקיז) נוקו בהצלחה", ...result });
      }
      res.json({ ok: true, success: true, message: "הסשן אופס" });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ניתוק סשן נהג ספציפי
  app.post("/api/sessions/disconnect", (req, res) => {
    const phone = req.body?.phone;
    if (!phone) return res.status(400).json({ ok: false, error: "נדרש מספר טלפון" });
    if (ctx?.disconnectDriver) {
      const result = ctx.disconnectDriver(phone);
      recordEvent("system", `נותק סשן וואטסאפ של נהג: ${phone}`);
      return res.json({ ok: true, ...result });
    }
    res.json({ ok: true, message: "הסשן נותק" });
  });

  // לוגים בזמן אמת (כולל סינון לפי נהג ספציפי)
  app.get("/api/logs", (req, res) => {
    const type = String(req.query.type || "all");
    const driverPhone = req.query.phone ? cleanPhone(req.query.phone) : null;
    const limit = Math.min(Number(req.query.limit) || 80, LOG_MAX);

    let rows = logs;
    if (type !== "all") {
      rows = rows.filter((l) => l.type === type);
    }
    if (driverPhone) {
      rows = rows.filter((l) => !l.driver || cleanPhone(l.driver) === driverPhone);
    }

    res.json({ ok: true, logs: rows.slice(0, limit) });
  });

  // רדאר נסיעות חי (Live Rides Feed)
  app.get("/api/rides/live", (req, res) => {
    try {
      const phone = req.query.phone ? cleanPhone(req.query.phone) : null;
      let rides = [];
      if (ctx?.getLiveRides) {
        rides = ctx.getLiveRides(phone);
      }
      res.json({ ok: true, rides });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // תפיסת נסיעה מהירה מהאתר ("תן")
  app.post("/api/rides/claim", async (req, res) => {
    try {
      const { rideId, driverPhone, claimText } = req.body || {};
      if (!rideId) return res.status(400).json({ ok: false, error: "נדרש מזהה נסיעה" });
      
      if (!ctx?.claimRideFromWeb) {
        return res.status(500).json({ ok: false, error: "פונקציית תפיסת נסיעה אינה מוגדרת בשרת" });
      }

      const result = await ctx.claimRideFromWeb(rideId, driverPhone, claimText || "תן");
      recordEvent("command", `תפיסת נסיעה מהאתר: נהג ${driverPhone || 'ראשי'} | ${claimText || 'תן'}`);
      return res.json({ ok: true, ...result });
    } catch (err) {
      recordError("claim_ride_api", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // סימולציית נסיעה לבדיקה חיה מהאתר
  app.post("/api/rides/simulate", (req, res) => {
    try {
      const simulated = req.body || {};
      if (ctx?.simulateLiveRide) {
        const ride = ctx.simulateLiveRide(simulated);
        return res.json({ ok: true, success: true, ride });
      }
      return res.json({ ok: true, success: true, message: "הנסיעה סומלצה" });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // חיפוש כללי או לפי נהג ספציפי
  app.get("/api/search", (req, res) => {
    const phone = req.query.phone || loadUsersData().adminPhone;
    const state = ctx?.getUserSearch ? ctx.getUserSearch(phone) : {};
    res.json({ ok: true, activeSearch: state.active ? state.displayText : null, search: state, phone: cleanPhone(phone) });
  });

  app.post("/api/search", (req, res) => {
    const phone = req.body?.phone || loadUsersData().adminPhone;
    const cleanP = cleanPhone(phone);
    const cmd = String(req.body?.command || req.body?.text || "").trim();

    if (cmd === "ת") {
      const state = ctx?.getUserSearch ? ctx.getUserSearch(cleanP) : {};
      return res.json({ ok: true, success: true, message: "האות 'ת' לבדה אינה פקודת תפוס", search: state });
    }

    if (/(^| )(תפוס|עצור|סגור)( |$)/.test(cmd)) {
      const empty = ctx?.stopUserSearch ? ctx.stopUserSearch(cleanP) : {};
      recordEvent("command", `חיפוש הופסק (תפוס) עבור ${cleanP}`);
      return res.json({ ok: true, success: true, message: "החיפוש הופסק בהצלחה (תפוס)", search: empty });
    }

    let parsedCommand = cmd;
    if (!cmd.startsWith("פנוי") && !cmd.includes("מחפש")) {
      parsedCommand = `פנוי ${cmd}`;
    }

    const parsed = ctx?.processDriverCommand ? ctx.processDriverCommand(parsedCommand) : {};
    const nextState = { active: true, ...parsed };
    ctx?.setUserSearch?.(cleanP, nextState);
    recordEvent("command", `הופעל חיפוש עבור ${cleanP}: ${nextState.displayText}`);

    res.json({ ok: true, success: true, message: `חיפוש הופעל: ${nextState.displayText}`, search: nextState });
  });

  app.post("/api/search/stop", (req, res) => {
    const phone = req.body?.phone || loadUsersData().adminPhone;
    const cleanP = cleanPhone(phone);
    const empty = ctx?.stopUserSearch ? ctx.stopUserSearch(cleanP) : {};
    recordEvent("command", `חיפוש הופסק מהאתר עבור ${cleanP}`);
    res.json({ ok: true, success: true, message: "החיפוש הופסק בהצלחה (תפוס)", search: empty });
  });

  // ==========================================
  // ניהול משתמשים, עריכת פרטים ושליחת הדרכה מיידית
  // ==========================================
  app.get("/api/users", (_req, res) => {
    const users = loadUsersData();
    const sessionsSummary = ctx?.getAllSessions ? ctx.getAllSessions() : { drivers: [] };
    const allSearches = ctx?.getAllUserSearches ? ctx.getAllUserSearches() : {};

    // הוספת סטטוס חיבור וחיפוש פעיל לכל נהג מאושר
    const enrichedApproved = (users.approvedUsers || []).map((u) => {
      const cleanP = cleanPhone(u.phone);
      const sess = (sessionsSummary.drivers || []).find((d) => cleanPhone(d.phone) === cleanP);
      const search = allSearches[cleanP] || { active: false, displayText: "אין חיפוש פעיל" };

      return {
        ...u,
        connectionStatus: sess?.status || (cleanP === cleanPhone(users.botPhone) ? (sessionsSummary.bot?.connected ? "connected" : "disconnected") : "disconnected"),
        searchState: search,
        connectedAt: sess?.connectedAt || null,
      };
    });

    res.json({ 
      ok: true, 
      ...users, 
      approvedUsers: enrichedApproved 
    });
  });

  // אישור משתמש + שליחת הודעת אישור והדרכה לוואטסאפ של המשתמש מיידית!
  app.post("/api/users/approve", async (req, res) => {
    const phone = req.body?.phone;
    const name = req.body?.name || "נהג";
    if (!phone) return res.status(400).json({ ok: false, error: "נדרש מספר טלפון" });
    
    const result = approveUser(phone, name);
    recordEvent("command", `אושר משתמש מהאתר: ${name} (${phone})`);

    // שליחת הודעת וואטסאפ רשמית עם מדריך חיבור מידית!
    try {
      await ctx?.sendApprovalAndOnboarding?.(phone, name);
    } catch (e) {}

    res.json({ ok: true, ...result });
  });

  // שליחה חוזרת של מדריך חיבור ואישור לוואטסאפ של המשתמש
  app.post("/api/users/send-onboarding", async (req, res) => {
    const phone = req.body?.phone;
    const name = req.body?.name || "נהג";
    if (!phone) return res.status(400).json({ ok: false, error: "נדרש מספר טלפון" });

    try {
      if (ctx?.sendApprovalAndOnboarding) {
        await ctx.sendApprovalAndOnboarding(phone, name);
        recordEvent("command", `נשלח מדריך חיבור ואישור לוואטסאפ של ${name} (${phone})`);
        return res.json({ ok: true, success: true, message: `המדריך והודעת החיבור נשלחו לוואטסאפ של ${name}!` });
      }
      res.status(500).json({ ok: false, error: "פונקציית שליחת המדריך אינה זמינה כרגע" });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // עריכת פרטי משתמש (שם, טלפון לתצוגה ותפקיד)
  app.post("/api/users/edit", (req, res) => {
    const oldPhone = req.body?.oldPhone || req.body?.phone;
    const name = req.body?.name;
    const newPhone = req.body?.newPhone;
    const role = req.body?.role;

    if (!oldPhone) return res.status(400).json({ ok: false, error: "נדרש מספר טלפון מקורי" });

    const result = editUserDetails(oldPhone, { name, phone: newPhone, role });
    if (!result.success) return res.status(400).json({ ok: false, error: result.error });

    recordEvent("command", `עודכנו פרטי משתמש: ${oldPhone} -> ${name || ""} (${newPhone || oldPhone})`);
    res.json({ ok: true, ...result });
  });

  app.post("/api/users/reject", (req, res) => {
    const identifier = req.body?.identifier || req.body?.phone || req.body?.id || req.body?.lid;
    if (!identifier) return res.status(400).json({ ok: false, error: "נדרש מזהה משתמש או טלפון" });
    const result = rejectUser(identifier);
    try {
      ctx?.disconnectDriver?.(identifier);
    } catch (e) {}
    recordEvent("command", `נדחה/נמחק משתמש מהאתר: ${identifier}`);
    res.json({ ok: true, ...result });
  });

  app.post("/api/users/add", async (req, res) => {
    const phone = req.body?.phone;
    const name = req.body?.name || "";
    if (!phone) return res.status(400).json({ ok: false, error: "נדרש מספר טלפון" });
    const result = approveUser(phone, name);
    recordEvent("command", `הוסף משתמש ישירות מהאתר: ${name} (${phone})`);

    try {
      await ctx?.sendApprovalAndOnboarding?.(phone, name);
    } catch (e) {}

    res.json({ ok: true, ...result });
  });

  app.post("/api/users/delete", (req, res) => {
    const identifier = req.body?.identifier || req.body?.phone || req.body?.id || req.body?.lid;
    if (!identifier) return res.status(400).json({ ok: false, error: "נדרש מזהה משתמש או טלפון" });
    const result = deleteApprovedUser(identifier);
    if (!result.success) return res.status(400).json({ ok: false, error: result.error });
    try {
      ctx?.disconnectDriver?.(identifier);
    } catch (e) {}
    recordEvent("command", `נמחק משתמש ונוקו קובצי האימות מהאתר: ${identifier}`);
    res.json({ ok: true, ...result });
  });

  // עדכון מספר טלפון ממשתמש LID למספר סלולרי אמיתי
  app.post("/api/users/update-phone", (req, res) => {
    const identifier = req.body?.identifier || req.body?.oldPhone;
    const newPhone = req.body?.newPhone;
    if (!identifier || !newPhone) {
      return res.status(400).json({ ok: false, error: "נדרש מזהה ישן ומספר טלפון חדש" });
    }
    const result = updateUserPhone(identifier, newPhone);
    recordEvent("command", `עודכן מספר טלפון עבור ${identifier} -> ${newPhone}`);
    res.json({ ok: true, ...result });
  });

  app.post("/api/users/config", (req, res) => {
    const data = loadUsersData();
    if (req.body?.adminPhone) data.adminPhone = cleanPhone(req.body.adminPhone);
    if (req.body?.botPhone) data.botPhone = cleanPhone(req.body.botPhone);
    if (req.body?.cooldownHours) data.cooldownHours = Math.max(1, Number(req.body.cooldownHours));
    saveUsersData(data);
    res.json({ ok: true, data });
  });

  // שידור הודעת תפוצה לכל הנהגים בלחיצה אחת מהאתר
  app.post("/api/broadcast", async (req, res) => {
    try {
      const { message, targetType } = req.body || {};
      if (!message || !message.trim()) {
        return res.status(400).json({ ok: false, error: "תוכן ההודעה אינו יכול להיות ריק" });
      }

      if (typeof ctx?.broadcastToDrivers !== "function") {
        return res.status(500).json({ ok: false, error: "פונקציית שידור אינה מוגדרת בשרת" });
      }

      const result = await ctx.broadcastToDrivers(message, targetType || "all");
      return res.json({ ok: true, ...result });
    } catch (err) {
      recordError("broadcast_api", err);
      return res.status(500).json({ ok: false, error: err.message || "שגיאה בשידור הודעה לנהגים" });
    }
  });

  // שליטה ב-PM2
  app.post("/api/bot/restart", async (_req, res) => {
    recordEvent("system", "בקשת הפעלה מחדש מהאתר");
    const result = await pm2("restart");
    if (!result.ok) {
      setTimeout(() => process.exit(0), 400);
      return res.json({ ok: true, success: true, message: "התהליך ייסגר ו-PM2 יעלה אותו מחדש" });
    }
    res.json(result);
  });

  app.post("/api/bot/stop", async (_req, res) => {
    recordEvent("system", "בקשת עצירה מהאתר");
    const result = await pm2("stop");
    res.json(result);
  });

  // ==========================================
  // GitHub Webhook & 1-Click Auto Sync Endpoint
  // ==========================================
  app.all("/api/deploy/webhook", (_req, res) => {
    recordEvent("system", "📥 התקבלה בקשת סנכרון אוטומטי מ-GitHub Webhook...");
    res.json({ ok: true, message: "הסנכרון החל ברקע מ-GitHub" });

    const syncCmd = `(
      if [ -f "./auto-sync.sh" ]; then
        chmod +x ./auto-sync.sh && ./auto-sync.sh;
      elif [ -f "fixed-bot-server/auto-sync.sh" ]; then
        chmod +x fixed-bot-server/auto-sync.sh && ./fixed-bot-server/auto-sync.sh;
      else
        mkdir -p /tmp/wa-safe-bak &&
        for f in users.json users.backup.json searches.json lid-map.json onboarding-alerts.json dashboard.secret auth; do
          [ -e "$f" ] && cp -rf "$f" /tmp/wa-safe-bak/ || true;
        done &&
        (git pull origin main 2>/dev/null || curl -sSL https://nsiot.vercel.app/fixed-bot-server-v3.0.tar.gz | tar -xz --strip-components=1 2>/dev/null || true) &&
        for f in users.json users.backup.json searches.json lid-map.json onboarding-alerts.json dashboard.secret auth; do
          [ -e "/tmp/wa-safe-bak/$f" ] && cp -rf "/tmp/wa-safe-bak/$f" ./ || true;
        done &&
        pm2 restart all || pm2 restart wa-rides-bot || pm2 restart index.js
      fi
    )`;

    exec(syncCmd, { cwd: process.cwd() }, (err, stdout, stderr) => {
      if (err) {
        recordError("github_sync_error", err);
        console.error("❌ שגיאה בסנכרון מ-GitHub:", err.message);
      } else {
        recordEvent("system", "✅ סנכרון אוטומטי מ-GitHub הושלם והשרת הופעל מחדש בהצלחה!");
        console.log("✅ סנכרון אוטומטי מ-GitHub הושלם:", stdout);
      }
    });
  });

  // יומן שגיאות ובאגים ייעודי (Live Error Tracker API)
  app.get("/api/errors", (_req, res) => {
    res.json({ ok: true, errors: errorReports });
  });

  app.post("/api/errors/clear", (_req, res) => {
    errorReports.length = 0;
    recordEvent("system", "יומן השגיאות נוקה מהאתר");
    res.json({ ok: true, message: "יומן השגיאות נוקה בהצלחה" });
  });

  // ניטור חריגות גלובלי למניעת קריסות פתאומיות
  process.on("uncaughtException", (err) => {
    recordError("uncaught_exception", err);
    console.error("🔴 Uncaught Exception:", err);
  });

  process.on("unhandledRejection", (reason) => {
    recordError("unhandled_rejection", reason instanceof Error ? reason : new Error(String(reason)));
    console.error("🔴 Unhandled Rejection:", reason);
  });

  // הגשת האתר אם קיים build בתיקיית dist
  const distPath = path.join(process.cwd(), "dist");
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 מרכז שליטה ו-API מאוחדים פעילים על פורט ${PORT}!`);
  });
}
