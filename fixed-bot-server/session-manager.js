// session-manager.js - ניהול ריבוי חשבונות וואטסאפ (Multi-Session Baileys Manager)
// מאפשר לבוט הראשי (0555081810) להישאר מחובר תמיד,
// ובמקביל מחבר וואטסאפים נפרדים של נהגים לסריקת קבוצות הנסיעות שלהם ללא ניתוק הדדי!

import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanPhone, loadUsersData, isLid, removeLidMapping, clearAllLidMappings, approveUser, isUserApproved } from "./users-manager.js";
import { recordError } from "./dashboard-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_BASE_DIR = path.join(__dirname, "auth");
const BOT_AUTH_DIR = path.join(AUTH_BASE_DIR, "bot");
const SESSIONS_DIR = path.join(AUTH_BASE_DIR, "sessions");

// יצירת תיקיות בסיס אם אינן קיימות
if (!fs.existsSync(AUTH_BASE_DIR)) fs.mkdirSync(AUTH_BASE_DIR, { recursive: true });
if (!fs.existsSync(BOT_AUTH_DIR)) fs.mkdirSync(BOT_AUTH_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// מיגרציה של קבצי auth ישנים מהשורש לתוך auth/bot אם קיימים
try {
  const oldCreds = path.join(AUTH_BASE_DIR, "creds.json");
  const newCreds = path.join(BOT_AUTH_DIR, "creds.json");
  if (fs.existsSync(oldCreds) && !fs.existsSync(newCreds)) {
    const files = fs.readdirSync(AUTH_BASE_DIR);
    for (const f of files) {
      if (f !== "bot" && f !== "sessions") {
        const src = path.join(AUTH_BASE_DIR, f);
        const dest = path.join(BOT_AUTH_DIR, f);
        try {
          fs.renameSync(src, dest);
        } catch (e) {}
      }
    }
    console.log("🔄 הועברו נתוני אימות ישנים של הבוט אל auth/bot");
  }
} catch (e) {}

// מפת חשבונות הנהגים הפעילים: phone -> session object
const driverSessions = new Map();

// ==========================================
// עזרי יציבות (מניעת Bad MAC / "ממתין להודעה זו")
// ==========================================
const driverConnecting = new Map();      // phone -> Promise של חיבור בתהליך (מונע סוקטים כפולים)
const driverReconnectTimers = new Map(); // phone -> timeout של התחברות מחדש
const driverRetryCount = new Map();      // phone -> מספר ניסיונות התחברות רצופים שנכשלו
let mainBotStarting = false;
let mainReconnectTimer = null;
let mainRetryCount = 0;

function backoffDelay(attempt) {
  return Math.min(3000 * Math.pow(2, Math.max(0, attempt - 1)), 30000);
}

function clearDriverReconnect(phone) {
  const t = driverReconnectTimers.get(phone);
  if (t) clearTimeout(t);
  driverReconnectTimers.delete(phone);
}

// סגירה מלאה של סוקט: מסיר את כל המאזינים וסוגר את החיבור
function killSock(sock) {
  if (!sock) return;
  try { sock.ev?.removeAllListeners?.(); } catch (e) {}
  try { sock.ws?.close?.(); } catch (e) {}
  try { sock.end?.(undefined); } catch (e) {}
}

// ניתוק סוקט שנסגר: מסיר מאזינים (חוץ מ-creds.update כדי לא לאבד שמירת מפתחות) וסוגר
function detachSock(sock) {
  if (!sock) return;
  for (const ev of ["connection.update", "messages.upsert", "messages.reaction"]) {
    try { sock.ev?.removeAllListeners?.(ev); } catch (e) {}
  }
  try { sock.ws?.close?.(); } catch (e) {}
  try { sock.end?.(undefined); } catch (e) {}
}

// מאגר הודעות יוצאות - נדרש ל-getMessage כדי ש-Baileys יוכל לשלוח מחדש הודעה שהנמען לא הצליח לפענח
const SENT_STORE_LIMIT = 5000;
const SENT_STORE_FILE = path.join(AUTH_BASE_DIR, "sent-messages.json");
const sentStore = new Map(); // msgId -> message

// שחזור אובייקטי Buffer לאחר טעינה מ-JSON (מונע קריסות של proto.Message.encode בניסיונות שליחה חוזרים)
function reviveBuffers(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (obj.type === "Buffer" && Array.isArray(obj.data)) {
    return Buffer.from(obj.data);
  }
  if (Array.isArray(obj)) {
    return obj.map(reviveBuffers);
  }
  const res = {};
  for (const [k, v] of Object.entries(obj)) {
    res[k] = reviveBuffers(v);
  }
  return res;
}

// טעינת הודעות שמורות מהדיסק בעליית השרת
try {
  if (fs.existsSync(SENT_STORE_FILE)) {
    const raw = fs.readFileSync(SENT_STORE_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && item.id && item.message) {
          sentStore.set(item.id, reviveBuffers(item.message));
        }
      }
      console.log(`📦 שוחזרו ${sentStore.size} הודעות יוצאות מ-sent-messages.json (לפענוח והצפנה חוזרת)`);
    }
  }
} catch (e) {
  console.log("ℹ️ טעינת sent-messages.json דולגה:", e.message);
}

let saveSentTimeout = null;
function persistSentStoreSoon() {
  if (saveSentTimeout) return;
  saveSentTimeout = setTimeout(() => {
    saveSentTimeout = null;
    try {
      const arr = [];
      for (const [id, message] of sentStore.entries()) {
        arr.push({ id, message });
      }
      fs.writeFileSync(SENT_STORE_FILE, JSON.stringify(arr), "utf8");
    } catch (e) {}
  }, 2000);
}

function rememberSent(id, message) {
  if (!id || !message) return;
  sentStore.set(id, message);
  if (sentStore.size > SENT_STORE_LIMIT) {
    const oldest = sentStore.keys().next().value;
    sentStore.delete(oldest);
  }
  persistSentStoreSoon();
}

// ניקוי מפתחות ישנים - מוחק אך ורק קבצי sender-key-memory זמניים שנוטים לדלוף או קבצים ריקים מושחתים
// אזהרה קריטית: לעולם לא מוחקים קבצי pre-key או session! מחיקתם הורסת את מפתחות ההצפנה וגורמת להודעות ממתינות!
export function cleanOldSenderKeyFiles() {
  try {
    const cleanDir = (dirPath) => {
      if (!fs.existsSync(dirPath)) return;
      const files = fs.readdirSync(dirPath);
      let cleanedCount = 0;
      for (const f of files) {
        if (f === "creds.json") continue; // לעולם לא מוחקים creds.json!
        // לעולם לא מוחקים pre-key או session!
        if (f.startsWith("pre-key-") || f.startsWith("session-")) continue;

        const filePath = path.join(dirPath, f);
        try {
          const stat = fs.statSync(filePath);
          if (stat.size === 0 || f.includes("sender-key-memory")) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          }
        } catch (e) {}
      }
      if (cleanedCount > 0) {
        console.log(`🧹 נוקו ${cleanedCount} קבצי מפתחות זמניים מ-${path.basename(dirPath)}`);
      }
    };

    cleanDir(BOT_AUTH_DIR);
    if (fs.existsSync(SESSIONS_DIR)) {
      const driverDirs = fs.readdirSync(SESSIONS_DIR);
      for (const d of driverDirs) {
        cleanDir(path.join(SESSIONS_DIR, d));
      }
    }
  } catch (err) {
    console.error("שגיאה בניקוי קבצי מפתחות ישנים:", err.message);
  }
}

// מטמון קטן לספירת ניסיונות שליחה חוזרת (מחליף node-cache, ללא תלות חדשה)
function createRetryCache() {
  const m = new Map();
  return {
    get: (k) => m.get(k),
    set: (k, v) => {
      m.set(k, v);
      if (m.size > 5000) m.delete(m.keys().next().value);
    },
    del: (k) => { m.delete(k); },
    flushAll: () => { m.clear(); },
  };
}

// עטיפת sendMessage ו-relayMessage כך שכל הודעה יוצאת נשמרת אוטומטית למענה לבקשות Retry
function wrapSendStore(sock) {
  const origSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    try {
      const res = await origSend(...args);
      try {
        if (res?.key?.id && res.message) rememberSent(res.key.id, res.message);
      } catch (e) {}
      return res;
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes("Connection Closed") || msg.includes("QR refs attempts ended") || msg.includes("Timed Out")) {
        console.warn("⚠️ [Baileys] שגיאת חיבור זמנית ב-sendMessage (ממתין להתחברות מחדש):", msg);
      }
      throw err;
    }
  };

  if (sock.relayMessage) {
    const origRelay = sock.relayMessage.bind(sock);
    sock.relayMessage = async (jid, message, options = {}) => {
      try {
        const res = await origRelay(jid, message, options);
        try {
          const id = options.messageId;
          if (id && message) rememberSent(id, message);
        } catch (e) {}
        return res;
      } catch (err) {
        const msg = err?.message || String(err);
        if (msg.includes("Connection Closed") || msg.includes("Timed Out")) {
          console.warn("⚠️ [Baileys] שגיאת חיבור זמנית ב-relayMessage:", msg);
        }
        throw err;
      }
    };
  }
}

// יצירת סוקט אחידה לבוט הראשי ולנהגים עם KeepAlive עמיד למניעת ניתוקי סרק
function buildSocket(version, state) {
  const logger = pino({ level: "silent" });
  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    msgRetryCounterCache: createRetryCache(),
    keepAliveIntervalMs: 25000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    getMessage: async (key) => {
      if (!key?.id) return undefined;
      const msg = sentStore.get(key.id);
      if (!msg) return undefined;
      return reviveBuffers(msg);
    },
    shouldIgnoreJid: (jid) => {
      if (!jid) return true;
      if (jid.endsWith("@broadcast") || jid.endsWith("@newsletter") || jid === "status@broadcast") {
        return true;
      }
      return false;
    },
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  wrapSendStore(sock);
  return sock;
}

// מצב הבוט הראשי
let mainBotSock = null;
let mainBotStatus = {
  phone: "972555081810",
  connected: false,
  registered: false,
  pairingCode: null,
  qr: null,
  qrTimestamp: null,
  lastDisconnectReason: "",
};

// ==========================================
// 1. הפעלת הבוט הראשי (Main Bot - 0555081810)
// ==========================================
export async function startMainBot(callbacks = {}) {
  const { onMessage, onReaction, onStatusChange, onEvent } = callbacks;

  // הגנה מפני הפעלה כפולה (שני סוקטים על אותם מפתחות = Bad MAC)
  if (mainBotStarting) return mainBotSock;
  mainBotStarting = true;

  try {
    if (mainReconnectTimer) {
      clearTimeout(mainReconnectTimer);
      mainReconnectTimer = null;
    }
    if (mainBotSock) {
      killSock(mainBotSock);
      mainBotSock = null;
    }

    const usersData = loadUsersData();
    const botPhone = cleanPhone(process.env.BOT_PHONE || usersData.botPhone || "972555081810");
    mainBotStatus.phone = botPhone;

    const { state, saveCreds } = await useMultiFileAuthState(BOT_AUTH_DIR);
    let version;
    try {
      const v = await fetchLatestBaileysVersion();
      version = v.version;
    } catch {
      version = [2, 3000, 1017531287];
    }

    const sock = buildSocket(version, state);

    mainBotSock = sock;
    mainBotStatus.registered = Boolean(sock.authState.creds.registered);

    const scheduleReconnect = (delay) => {
      if (mainReconnectTimer) clearTimeout(mainReconnectTimer);
      mainReconnectTimer = setTimeout(() => {
        mainReconnectTimer = null;
        startMainBot(callbacks).catch((err) => {
          console.error("שגיאה בחיבור מחדש של הבוט הראשי:", err.message);
          mainRetryCount++;
          scheduleReconnect(backoffDelay(mainRetryCount));
        });
      }, delay);
    };

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        mainBotStatus.qr = qr;
        mainBotStatus.qrTimestamp = Date.now();
        onStatusChange?.(mainBotStatus);
        onEvent?.("system", `הופק קוד QR חדש לוואטסאפ ווב של הבוט הראשי (${botPhone})`);
      }

      if (connection === "open") {
        console.log(`✅ הבוט הראשי (${botPhone}) מחובר ופעיל בהצלחה לוואטסאפ!`);
        mainRetryCount = 0;
        mainBotStatus.connected = true;
        mainBotStatus.registered = true;
        mainBotStatus.pairingCode = null;
        mainBotStatus.qr = null;
        mainBotStatus.qrTimestamp = null;
        mainBotStatus.lastDisconnectReason = "";
        onStatusChange?.(mainBotStatus);
        onEvent?.("system", `הבוט הראשי (${botPhone}) מחובר בהצלחה`);
      }

      if (connection === "close") {
        // סוקט ישן שכבר הוחלף - מתעלמים (מונע חיבורים כפולים)
        if (mainBotSock !== sock) return;

        const code = lastDisconnect?.error?.output?.statusCode;
        mainBotStatus.connected = false;
        mainBotStatus.lastDisconnectReason = String(code || lastDisconnect?.error?.message || "closed");
        onStatusChange?.(mainBotStatus);

        detachSock(sock);

        // קוד 515 (restartRequired) הוא חלק אינטגרלי מהשלמת לחיצת היד בוואטסאפ בעת סריקת QR
        if (code === DisconnectReason.restartRequired || code === 515) {
          console.log(`🔄 [הבוט הראשי] קוד 515 restartRequired התקבל (השלמת צימוד WhatsApp Web) - מתחבר מחדש מיידית...`);
          mainRetryCount = 0;
          scheduleReconnect(1000);
          return;
        }

        if (code === DisconnectReason.loggedOut) {
          console.log("⚠️ הבוט הראשי נותק (401 Logged Out). שומרים על קובצי האימות ומנסים חיבור מחדש...");
          mainRetryCount++;
          scheduleReconnect(backoffDelay(mainRetryCount));
          return;
        }

        // 440 = חיבור הוחלף ע"י סוקט/תהליך אחר על אותו חשבון. חיבור מחדש אוטומטי יוצר לולאת "בעיטות" ו-Bad MAC
        if (code === DisconnectReason.connectionReplaced || code === 440) {
          console.log("⚠️ [הבוט הראשי] קוד 440 connectionReplaced - חיבור אחר תפס את החשבון. לא מתחבר מחדש אוטומטית. בדוק שאין תהליך כפול (pm2 list) ואז pm2 restart wa-bot.");
          return;
        }

        mainRetryCount++;
        const delay = backoffDelay(mainRetryCount);
        console.log(`🔄 [הבוט הראשי] חיבור נסגר (קוד: ${code || "לא ידוע"}). ניסיון ${mainRetryCount} - מתחבר מחדש בעוד ${Math.round(delay / 1000)} שניות...`);
        scheduleReconnect(delay);
      }
    });

    sock.ev.on("messages.upsert", async (upsert) => {
      try {
        if (onMessage) {
          await onMessage(sock, upsert, { isMainBot: true, botPhone });
        }
      } catch (err) {
        console.error("שגיאה בטיפול בהודעה (בוט ראשי):", err?.message || err);
        try { recordError("main_message_handler", err, {}); } catch (e) {}
      }
    });

    sock.ev.on("messages.reaction", async (reactions) => {
      try {
        if (onReaction) {
          await onReaction(sock, reactions, { isMainBot: true, botPhone });
        }
      } catch (err) {
        console.error("שגיאה בטיפול בריאקציה (בוט ראשי):", err?.message || err);
      }
    });

    return sock;
  } finally {
    mainBotStarting = false;
  }
}

export function getMainBotSock() {
  return mainBotSock;
}

export function getMainBotStatus() {
  return mainBotStatus;
}

export async function requestMainBotPairingCode(customPhone) {
  if (!mainBotSock) throw new Error("הבוט הראשי אינו מאותחל כעת");
  const phone = cleanPhone(customPhone || mainBotStatus.phone);
  mainBotStatus.phone = phone;
  const code = await mainBotSock.requestPairingCode(phone);
  mainBotStatus.pairingCode = code;
  return code;
}

export async function resetMainBotAuth(callbacks = {}) {
  console.log("🧹 מאפס ידנית את אותנטיקציית הבוט הראשי לבקשת המשתמש...");
  try {
    if (mainBotSock) {
      if (mainReconnectTimer) { clearTimeout(mainReconnectTimer); mainReconnectTimer = null; }
      killSock(mainBotSock);
      mainBotSock = null;
    }
    if (fs.existsSync(BOT_AUTH_DIR)) {
      fs.rmSync(BOT_AUTH_DIR, { recursive: true, force: true });
      fs.mkdirSync(BOT_AUTH_DIR, { recursive: true });
    }
    mainBotStatus.connected = false;
    mainBotStatus.registered = false;
    mainBotStatus.pairingCode = null;
    mainBotStatus.qr = null;
    mainBotStatus.qrTimestamp = null;
    mainBotStatus.lastDisconnectReason = "איפוס סשן נקי לבקשת המנהל";
    return await startMainBot(callbacks);
  } catch (err) {
    console.error("שגיאה באיפוס אותנטיקציית הבוט הראשי:", err.message);
    throw err;
  }
}

// ==========================================
// 2. ניהול סשנים של נהגים (Driver WhatsApp Sessions)
// ==========================================
export async function connectDriverSession(phone, callbacks = {}) {
  const driverPhone = cleanPhone(phone);
  if (!driverPhone) throw new Error("מספר טלפון נהג לא תקין");

  // סשן חי קיים (מחובר / מתחבר / ממתין לצימוד) - מחזירים אותו ולא פותחים סוקט שני על אותם מפתחות
  const existing = driverSessions.get(driverPhone);
  if (existing && existing.sock && existing.status !== "disconnected") {
    return existing;
  }

  // חיבור כבר בתהליך (שחזור בעלייה / דשבורד / QR במקביל) - ממתינים לאותו חיבור
  const pending = driverConnecting.get(driverPhone);
  if (pending) return pending;

  const p = createDriverSocket(driverPhone, callbacks).finally(() => {
    driverConnecting.delete(driverPhone);
  });
  driverConnecting.set(driverPhone, p);
  return p;
}

async function createDriverSocket(driverPhone, callbacks = {}) {
  const { onRideMessage, onReaction, onStatusChange, onEvent } = callbacks;

  // סגירת סוקט ישן של אותו נהג וביטול התחברות מחדש מתוזמנת
  const prev = driverSessions.get(driverPhone);
  if (prev?.sock) killSock(prev.sock);
  clearDriverReconnect(driverPhone);

  const driverAuthDir = path.join(SESSIONS_DIR, driverPhone);
  if (!fs.existsSync(driverAuthDir)) fs.mkdirSync(driverAuthDir, { recursive: true });

  const credsPath = path.join(driverAuthDir, "creds.json");
  let wasAlreadyRegisteredOnDisk = false;
  if (fs.existsSync(credsPath)) {
    try {
      const parsedCreds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
      if (parsedCreds && parsedCreds.registered) {
        wasAlreadyRegisteredOnDisk = true;
      }
    } catch (e) {}
  }

  const { state, saveCreds } = await useMultiFileAuthState(driverAuthDir);
  let version;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
  } catch {
    version = [2, 3000, 1017531287];
  }

  const sock = buildSocket(version, state);

  const sessionObj = {
    phone: driverPhone,
    sock,
    status: sock.authState.creds.registered ? "connecting" : "pairing_required",
    registered: Boolean(sock.authState.creds.registered),
    wasAlreadyRegisteredOnDisk,
    isRestoredSession: wasAlreadyRegisteredOnDisk,
    pairingCode: null,
    qr: null,
    qrTimestamp: null,
    lastDisconnectReason: "",
    groupsCount: 0,
    connectedAt: null,
  };

  driverSessions.set(driverPhone, sessionObj);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      sessionObj.qr = qr;
      sessionObj.qrTimestamp = Date.now();
      sessionObj.status = "qr_ready";
      onStatusChange?.(driverPhone, sessionObj);
      onEvent?.("system", `הופק קוד QR חדש לסריקת וואטסאפ ווב עבור נהג ${driverPhone}`);
    }

    if (connection === "open") {
      const isFirstEverPairing = !sessionObj.wasAlreadyRegisteredOnDisk;
      sessionObj.isInitialPairing = isFirstEverPairing;
      sessionObj.wasAlreadyRegisteredOnDisk = true;
      driverRetryCount.set(driverPhone, 0);

      console.log(`🚕 [נהג ${driverPhone}] וואטסאפ מחובר ומסונכרן בהצלחה! (התחברות ראשונית: ${isFirstEverPairing ? "כן" : "לא - שחזור/התחברות מחדש"})`);
      sessionObj.status = "connected";
      sessionObj.registered = true;
      sessionObj.pairingCode = null;
      sessionObj.qr = null;
      sessionObj.qrTimestamp = null;
      sessionObj.lastDisconnectReason = "";
      sessionObj.connectedAt = new Date().toISOString();
      onStatusChange?.(driverPhone, sessionObj);
      onEvent?.("system", `וואטסאפ נהג ${driverPhone} חובר בהצלחה`);
    }

    if (connection === "close") {
      // סוקט ישן שכבר הוחלף / נמחק - מתעלמים (מונע חיבורים כפולים)
      if (driverSessions.get(driverPhone) !== sessionObj) return;

      const code = lastDisconnect?.error?.output?.statusCode;
      sessionObj.status = "disconnected";
      sessionObj.lastDisconnectReason = String(code || lastDisconnect?.error?.message || "closed");
      onStatusChange?.(driverPhone, sessionObj);

      detachSock(sock);

      if (code === DisconnectReason.loggedOut) {
        console.log(`⚠️ [נהג ${driverPhone}] התקבל קוד 401 Logged Out. שומרים על קובצי האימות ומנסים חיבור מחדש...`);
        const attempt = (driverRetryCount.get(driverPhone) || 0) + 1;
        driverRetryCount.set(driverPhone, attempt);
        const delay = backoffDelay(attempt);
        clearDriverReconnect(driverPhone);
        driverReconnectTimers.set(driverPhone, setTimeout(() => {
          driverReconnectTimers.delete(driverPhone);
          connectDriverSession(driverPhone, { onRideMessage, onReaction, onStatusChange, onEvent }).catch((err) => {
            console.error(`שגיאה בחיבור מחדש עבור נהג ${driverPhone}:`, err.message);
          });
        }, delay));
        return;
      }

      // 440 = חיבור הוחלף ע"י סוקט/תהליך אחר. חיבור מחדש אוטומטי יוצר לולאת "בעיטות" ו-Bad MAC
      if (code === DisconnectReason.connectionReplaced || code === 440) {
        console.log(`⚠️ [נהג ${driverPhone}] קוד 440 connectionReplaced - חיבור אחר תפס את הסשן. לא מתחבר מחדש אוטומטית (בדוק שאין תהליך כפול).`);
        return;
      }

      // בעת הזנת קוד צימוד או סריקת QR, וואטסאפ סוגרת את הסוקט עם קוד 515 (restartRequired).
      // חובה לבצע חיבור מחדש מיידי כדי להשלים את לחיצת היד (Handshake), אחרת הטלפון יסתובב וייכשל!
      const isRestart = code === DisconnectReason.restartRequired || code === 515;
      const attempt = isRestart ? 0 : (driverRetryCount.get(driverPhone) || 0) + 1;
      driverRetryCount.set(driverPhone, attempt);
      const delay = isRestart ? 1000 : backoffDelay(attempt);

      console.log(`🔄 [נהג ${driverPhone}] חיבור נסגר (קוד: ${code || "לא ידוע"}). מתחבר מחדש בעוד ${Math.round(delay / 1000)} שניות...`);
      clearDriverReconnect(driverPhone);
      driverReconnectTimers.set(driverPhone, setTimeout(() => {
        driverReconnectTimers.delete(driverPhone);
        connectDriverSession(driverPhone, { onRideMessage, onReaction, onStatusChange, onEvent }).catch((err) => {
          console.error(`שגיאה בחיבור מחדש עבור נהג ${driverPhone}:`, err.message);
        });
      }, delay));
    }
  });

  sock.ev.on("messages.upsert", async (upsert) => {
    try {
      if (onRideMessage) {
        await onRideMessage(sock, upsert, { isMainBot: false, driverPhone });
      }
    } catch (err) {
      console.error(`שגיאה בטיפול בהודעה (נהג ${driverPhone}):`, err?.message || err);
      try { recordError("driver_message_handler", err, { driverPhone }); } catch (e) {}
    }
  });

  sock.ev.on("messages.reaction", async (reactions) => {
    try {
      if (onReaction) {
        await onReaction(sock, reactions, { isMainBot: false, driverPhone });
      }
    } catch (err) {
      console.error(`שגיאה בטיפול בריאקציה (נהג ${driverPhone}):`, err?.message || err);
    }
  });

  return sessionObj;
}

// מעקב בקשות קוד צימוד למניעת עומס וחסימות מוואטסאפ (Cooldown)
const lastPairingRequestTimes = new Map(); // phone -> timestamp

// מחיקה ואיפוס מוחלטים של כל קובצי האימות (קוקיז) וסשן ה-WebSocket של הנהג
export function purgeDriverSessionAndAuth(phoneOrIdentifier) {
  if (!phoneOrIdentifier) return { success: false, error: "נדרש מזהה נהג" };
  const str = String(phoneOrIdentifier).trim();
  const driverPhone = cleanPhone(str);
  const rawDigits = str.split("@")[0].split(":")[0].replace(/\D/g, "");

  // מניעת פגיעה בבוט הראשי
  const usersData = loadUsersData();
  if (driverPhone && driverPhone === cleanPhone(usersData.botPhone || "972555081810")) {
    return { success: false, error: "לא ניתן למחוק את קובצי האימות של הבוט הראשי דרך פעולה זו" };
  }

  // 1. סגירת ה-Socket הפעיל וניתוק חיבורי WebSocket
  for (const p of [driverPhone, rawDigits]) {
    if (!p) continue;
    const session = driverSessions.get(p);
    if (session?.sock) {
      try { session.sock.ev?.removeAllListeners?.(); } catch (e) {}
      try { session.sock.ws?.close?.(); } catch (e) {}
      try { session.sock.end?.(); } catch (e) {}
    }
    driverSessions.delete(p);
    lastPairingRequestTimes.delete(p);
    clearDriverReconnect(p);
    driverRetryCount.delete(p);
  }

  // 2. מחיקת תיקיות האימות (Sessions) של הנהג מהדיסק באופן מלא וללא שאריות
  const deletedDirs = [];
  for (const p of [driverPhone, rawDigits]) {
    if (!p || p === cleanPhone(usersData.botPhone)) continue;
    const dir = path.join(SESSIONS_DIR, p);
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        deletedDirs.push(p);
        console.log(`🧹 נמחקה תיקיית אימות וקוקיז עבור נהג: ${dir}`);
      }
    } catch (err) {
      console.error(`שגיאה במחיקת תיקיית אימות ${dir}:`, err.message);
    }
  }

  // 3. הסרת כל המיפויים הישנים מ-lid-map.json כדי למנוע זכירת כינויים ומספרים ישנים
  removeLidMapping(phoneOrIdentifier);
  if (driverPhone) removeLidMapping(driverPhone);
  if (rawDigits) removeLidMapping(rawDigits);

  return { success: true, phone: driverPhone || rawDigits, deletedDirs };
}

// איפוס מלא של כל סשני הנהגים, מחיקת כל התיקיות ב-auth/sessions ואיפוס כל מיפויי ה-LID (ללא פגיעה בבוט הראשי!)
export function purgeAllDriverSessions() {
  const usersData = loadUsersData();
  const botPhoneClean = cleanPhone(usersData.botPhone || "972555081810");

  // 1. סגירת כל הסוקטים הפעילים של הנהגים
  for (const [phone, session] of driverSessions.entries()) {
    if (session?.sock) {
      try { session.sock.ev?.removeAllListeners?.(); } catch (e) {}
      try { session.sock.ws?.close?.(); } catch (e) {}
      try { session.sock.end?.(); } catch (e) {}
    }
  }
  driverSessions.clear();
  lastPairingRequestTimes.clear();
  for (const p of [...driverReconnectTimers.keys()]) clearDriverReconnect(p);
  driverRetryCount.clear();

  // 2. מחיקת כל תיקיות הסשנים ב-auth/sessions (תיקיית auth/bot לא נמחקת לעולם!)
  let deletedCount = 0;
  if (fs.existsSync(SESSIONS_DIR)) {
    const items = fs.readdirSync(SESSIONS_DIR);
    for (const item of items) {
      const p = path.join(SESSIONS_DIR, item);
      try {
        fs.rmSync(p, { recursive: true, force: true });
        deletedCount++;
        console.log(`🧹 נמחקה תיקיית סשן ישנה: ${p}`);
      } catch (e) {}
    }
  }

  // 3. איפוס מוחלט של lid-map.json
  clearAllLidMappings();
  console.log(`✅ איפוס מלא בוצע בהצלחה: ${deletedCount} תיקיות סשנים נמחקו, וכל מיפויי ה-LID אופסו.`);

  return { success: true, deletedCount };
}

export function resetDriverAuth(phone) {
  return purgeDriverSessionAndAuth(phone);
}

export async function requestDriverPairingCode(phone, callbacks = {}, options = {}) {
  const driverPhone = cleanPhone(phone);
  if (!driverPhone) throw new Error("מספר טלפון נהג לא תקין");

  if (isLid(driverPhone) || isLid(phone)) {
    const err = new Error("לא ניתן להפיק קוד צימוד למזהה חסוי (LID). וואטסאפ מחייבת מספר טלפון סלולרי רגיל (למשל: 0521234567)");
    recordError("pairing_rejected_lid", err, { phone });
    throw err;
  }

  // בדיקת תקינות מספר ישראלי (לפחות 9 ספרות, מקסימום 12 ספרות)
  if (driverPhone.length < 9 || driverPhone.length > 12) {
    const err = new Error(`מספר טלפון לא תקין (${driverPhone}). יש להזין מספר בפורמט 05XXXXXXXX`);
    recordError("pairing_invalid_phone", err, { phone, driverPhone });
    throw err;
  }

  const now = Date.now();
  const lastTime = lastPairingRequestTimes.get(driverPhone) || 0;
  const cooldownMs = 45 * 1000; // 45 שניות מרווח בין בקשות קוד

  if (options.forceReset) {
    purgeDriverSessionAndAuth(driverPhone);
    await new Promise((r) => setTimeout(r, 600));
  } else if (now - lastTime < cooldownMs) {
    const waitSec = Math.ceil((cooldownMs - (now - lastTime)) / 1000);
    throw new Error(`קוד צימוד כבר הופק עבור מספר זה. אנא המתן ${waitSec} שניות לפני בקשת קוד נוסף, או לחץ על "איפוס קוקיז".`);
  }

  // ניקוי סשן ישן ולא רשום למניעת תקיעות וקריסות Baileys
  const existing = driverSessions.get(driverPhone);
  if (existing?.sock && existing.status !== "connected") {
    try { existing.sock.ev?.removeAllListeners?.(); } catch (e) {}
    try { existing.sock.ws?.close?.(); } catch (e) {}
    try { existing.sock.end?.(); } catch (e) {}
    driverSessions.delete(driverPhone);
  }

  const driverAuthDir = path.join(SESSIONS_DIR, driverPhone);
  const credsPath = path.join(driverAuthDir, "creds.json");
  if (fs.existsSync(credsPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
      if (!creds.registered) {
        fs.rmSync(driverAuthDir, { recursive: true, force: true });
      }
    } catch (e) {
      fs.rmSync(driverAuthDir, { recursive: true, force: true });
    }
  }

  lastPairingRequestTimes.set(driverPhone, now);
  clearDriverReconnect(driverPhone);

  const session = await connectDriverSession(driverPhone, callbacks);

  // המתנה של 2.2 שניות לייצוב חיבור ה-WebSocket של Baileys לפני בקשת הקוד (מונע 428 Precondition Required / Closed)
  await new Promise((r) => setTimeout(r, 2200));

  try {
    const code = await session.sock.requestPairingCode(driverPhone);
    session.pairingCode = code;
    session.status = "pairing_ready";
    return code;
  } catch (err) {
    recordError("pairing_code_request", err, { driverPhone });
    console.error(`שגיאה בהפקת קוד צימוד לנהג ${driverPhone}:`, err.message);
    // איפוס התיקייה במקרה של כשל כדי שהפעם הבאה תהיה נקייה
    try {
      if (fs.existsSync(driverAuthDir)) {
        fs.rmSync(driverAuthDir, { recursive: true, force: true });
      }
    } catch (e) {}
    throw err;
  }
}

export function isDriverSessionConnected(phone) {
  const driverPhone = cleanPhone(phone);
  if (!driverPhone) return false;
  const session = driverSessions.get(driverPhone);
  return Boolean(session && session.status === "connected" && session.registered);
}

export function disconnectDriverSession(phone) {
  return purgeDriverSessionAndAuth(phone);
}

export function getDriverSession(phone) {
  return driverSessions.get(cleanPhone(phone)) || null;
}

// הפעלה / קבלת סשן לנהג לצורך הפקת והצגת קוד QR חי בוואטסאפ ווב
export async function ensureDriverSessionForQr(phone, callbacks = {}) {
  const driverPhone = cleanPhone(phone);
  if (!driverPhone) throw new Error("מספר טלפון לא תקין");

  let session = driverSessions.get(driverPhone);
  if (!session || !session.sock) {
    session = await connectDriverSession(driverPhone, callbacks);
  }

  return {
    phone: driverPhone,
    qr: session.qr || null,
    qrTimestamp: session.qrTimestamp || null,
    status: session.status,
    registered: session.registered,
  };
}

export function getAllSessionsSummary() {
  const drivers = [];
  for (const [phone, sess] of driverSessions.entries()) {
    drivers.push({
      phone,
      status: sess.status,
      registered: sess.registered,
      pairingCode: sess.pairingCode,
      qr: sess.qr || null,
      qrTimestamp: sess.qrTimestamp || null,
      lastDisconnectReason: sess.lastDisconnectReason,
      connectedAt: sess.connectedAt,
    });
  }

  return {
    bot: {
      phone: mainBotStatus.phone,
      connected: mainBotStatus.connected,
      registered: mainBotStatus.registered,
      pairingCode: mainBotStatus.pairingCode,
      qr: mainBotStatus.qr || null,
      qrTimestamp: mainBotStatus.qrTimestamp || null,
      lastDisconnectReason: mainBotStatus.lastDisconnectReason,
    },
    drivers,
    totalConnectedDrivers: drivers.filter((d) => d.status === "connected").length,
  };
}

export async function initSavedDriverSessions(callbacks) {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const items = fs.readdirSync(SESSIONS_DIR);
    for (const phone of items) {
      const credPath = path.join(SESSIONS_DIR, phone, "creds.json");
      if (fs.existsSync(credPath)) {
        console.log(`🔄 משחזר חיבור וואטסאפ שמור עבור נהג: ${phone}...`);

        // הגנה קריטית: אם users.json התאפס או נדרס במהלך שדרוג שרת - משחזרים את אישור הנהג אוטומטית!
        if (!isUserApproved(phone)) {
          console.log(`🛡️ נהג עם חיבור וואטסאפ שמור (${phone}) שוחזר אוטומטית לרשימת המאושרים!`);
          approveUser(phone, `נהג מחובר (${phone})`);
        }

        try {
          await connectDriverSession(phone, callbacks);
        } catch (e) {
          console.error(`שגיאה בשחזור סשן נהג ${phone}:`, e.message);
        }
      }
    }
  } catch (err) {
    console.error("שגיאה בסריקת תיקיות סשנים שמורים:", err.message);
  }
}