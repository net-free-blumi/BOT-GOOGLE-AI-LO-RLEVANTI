// session-manager.js - ניהול ריבוי חשבונות וואטסאפ (Multi-Session Baileys Manager)
// מאפשר לבוט הראשי (0555081810) להישאר מחובר תמיד,
// ובמקביל מחבר וואטסאפים נפרדים של נהגים לסריקת קבוצות הנסיעות שלהם ללא ניתוק הדדי!

import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanPhone, loadUsersData, isLid, removeLidMapping, clearAllLidMappings, approveUser, isUserApproved, getDestinationJid } from "./users-manager.js";
import { recordError } from "./dashboard-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_BASE_DIR = path.join(__dirname, "auth");
const BOT_AUTH_DIR = path.join(AUTH_BASE_DIR, "bot");
const SESSIONS_DIR = path.join(AUTH_BASE_DIR, "sessions");
const BOT_ALERT_MARKER_FILE = path.join(BOT_AUTH_DIR, "alert-sent.json");

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

// שליפת גרסת וואטסאפ ווב העדכנית (עם ניסיונות חוזרים).
// אם השליפה נכשלת מחזירים undefined כדי ש-Baileys ישתמש בגרסה המובנית שלו -
// גרסה ישנה/קשיחה גורמת לוואטסאפ לדחות את החיבור וה-QR לא נסרק.
async function getWaVersion() {
  for (let i = 0; i < 3; i++) {
    try {
      const v = await fetchLatestBaileysVersion();
      if (v?.version && Array.isArray(v.version)) return v.version;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn("⚠️ לא ניתן לשלוף גרסת וואטסאפ עדכנית - משתמש בגרסת ברירת המחדל של Baileys");
  return undefined;
}

// מפת חשבונות הנהגים הפעילים: phone -> session object
const driverSessions = new Map();

// מצב הבוט הראשי ומעקב ניתוקים להתראת מנהל
let mainBotSock = null;
let mainBotDisconnectedAt = Date.now(); // ברירת מחדל עד לחיבור מוצלח
let mainBot30MinAlertSent = false;
let mainBotLastAlertTime = 0;
let watchdogInterval = null;
let mainBotLoggedOutCount = 0;
let mainBotReconnectTimeout = null;
let mainBotConnectedAlertSent = false;
let mainBotLastSuccessAlertTime = 0;
let isPendingNewPairingAlert = false;

let mainBotStatus = {
  phone: "972555081810",
  connected: false,
  registered: false,
  pairingCode: null,
  qr: null,
  qrTimestamp: null,
  lastDisconnectReason: "",
  disconnectedSince: Date.now(),
};

// שעון מעקב (Watchdog) לניתוק ממושך מעל 30 דקות ושליחת התראה אוטומטית למנהל
function startDisconnectionWatchdog(onEvent) {
  if (watchdogInterval) clearInterval(watchdogInterval);
  watchdogInterval = setInterval(async () => {
    if (mainBotStatus.connected) {
      mainBotDisconnectedAt = null;
      mainBot30MinAlertSent = false;
      mainBotStatus.disconnectedSince = null;
      return;
    }

    if (!mainBotDisconnectedAt) {
      mainBotDisconnectedAt = Date.now();
    }
    mainBotStatus.disconnectedSince = mainBotDisconnectedAt;

    const elapsedMs = Date.now() - mainBotDisconnectedAt;
    const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));

    // האם עברו 30 דקות וטרם נשלחה התראה, או שעברו 60 דקות נוספות מההתראה הקודמת
    const shouldAlert = (elapsedMinutes >= 30 && !mainBot30MinAlertSent) || 
                        (elapsedMinutes >= 60 && Date.now() - mainBotLastAlertTime >= 60 * 60 * 1000);

    if (shouldAlert) {
      mainBot30MinAlertSent = true;
      mainBotLastAlertTime = Date.now();

      const usersData = loadUsersData();
      const adminPhone = cleanPhone(usersData.adminPhone || "972515157166");
      const currentCode = mainBotStatus.pairingCode || "טרם הופק - היכנס לאתר";

      const alertText = 
`🚨 *התראת מנהל דחופה - הבוט מנותק כבר ${elapsedMinutes} דקות!* 🚨

בוט הוואטסאפ הראשי (${mainBotStatus.phone || '0555081810'}) מנותק כבר למעלה מ-30 דקות ברציפות!

🔑 *קוד צימוד עדכני לחיבור מיידי:*
*${currentCode}*

📱 *כיצד לחבר ב-30 שניות:*
1. פתח וואטסאפ בטלפון של הבוט (${mainBotStatus.phone || '0555081810'})
2. לחץ על: הגדרות (3 נקודות) ⬅️ מכשירים מקושרים ⬅️ קשר מכשיר
3. בחר "קשר באמצעות מספר טלפון" והקלד את הקוד: *${currentCode}*

ההודעה נשלחה אוטומטית בהתאם להגדרת אבטחת ניתוק של 30 דקות.`;

      console.log(`🚨 [WATCHDOG] הבוט מנותק ${elapsedMinutes} דק'! שולח התראת וואטסאפ למנהל (${adminPhone})...`);
      onEvent?.("system", `🚨 התראת מנהל: בוט ראשי מנותק מעל 30 דקות (${elapsedMinutes} דק'). קוד: ${currentCode}`);
      recordError("הבוט הראשי מנותק מעל 30 דקות", `משך ניתוק: ${elapsedMinutes} דק', קוד צימוד: ${currentCode}`);

      // שליחת ההודעה דרך כל סשן נהג שמחובר כעת במערכת Multi-Session
      let sentSuccess = false;
      for (const [dPhone, dSession] of driverSessions.entries()) {
        if (dSession && dSession.sock && dSession.status === "connected") {
          try {
            const destJid = getDestinationJid(adminPhone);
            await dSession.sock.sendMessage(destJid, { text: alertText });
            sentSuccess = true;
            console.log(`✅ התראת ניתוק מנהל נשלחה בהצלחה לוואטסאפ של המנהל (${adminPhone}) דרך נהג ${dPhone}`);
            onEvent?.("system", `✅ התראת ניתוק נשלחה לוואטסאפ של המנהל דרך נהג ${dPhone}`);
            break;
          } catch (e) {
            console.error(`שגיאה בשליחת התראת ניתוק דרך נהג ${dPhone}:`, e.message);
          }
        }
      }

      if (!sentSuccess) {
        console.log(`⚠️ אין סשן נהג מקביל מחובר לשליחת הודעת וואטסאפ ישירה. ההתראה תועדה בלוח הבקרה.`);
      }
    }
  }, 30000);
}

// ==========================================
// 1. הפעלת הבוט הראשי (Main Bot - 0555081810)
// ==========================================
export async function startMainBot({ onMessage, onReaction, onStatusChange, onEvent, preservePendingAlert = false } = {}) {
  const usersData = loadUsersData();
  const botPhone = cleanPhone(process.env.BOT_PHONE || usersData.botPhone || "972555081810");
  mainBotStatus.phone = botPhone;

  // ביטול כל טיימר חיבור מחדש שממתין ברקע למניעת כפילויות סוקטים
  if (mainBotReconnectTimeout) {
    clearTimeout(mainBotReconnectTimeout);
    mainBotReconnectTimeout = null;
  }

  // סגירה וניקוי מוחלט של כל סוקט ישן פעיל של הבוט הראשי
  if (mainBotSock) {
    try {
      mainBotSock.ev.removeAllListeners("connection.update");
      mainBotSock.ev.removeAllListeners("creds.update");
      mainBotSock.ev.removeAllListeners("messages.upsert");
      mainBotSock.ev.removeAllListeners("messages.reaction");
      mainBotSock.end();
    } catch (e) {}
    mainBotSock = null;
  }

  // הפעלת שעון מעקב ניתוק 30 דקות למנהל
  startDisconnectionWatchdog(onEvent);

  const credsPath = path.join(BOT_AUTH_DIR, "creds.json");
  let wasAlreadyRegisteredOnDisk = false;
  if (fs.existsSync(credsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(credsPath, "utf8"));
      if (parsed && (parsed.registered || parsed.me?.id)) {
        wasAlreadyRegisteredOnDisk = true;
      }
    } catch (e) {}
  }

  // שמירה קפדנית על משלוח התראה חד-פעמי למנהל:
  // אם השרת עולה מחדש (PM2 או reboot) והסשן כבר היה קיים בדיסק - נוצר מרקר קבוע ולעולם לא נשלחת התראה!
  if (preservePendingAlert) {
    isPendingNewPairingAlert = true;
  } else if (wasAlreadyRegisteredOnDisk) {
    if (!fs.existsSync(BOT_ALERT_MARKER_FILE)) {
      try {
        fs.writeFileSync(BOT_ALERT_MARKER_FILE, JSON.stringify({
          sentAt: new Date().toISOString(),
          reason: "existing_session_on_boot",
        }, null, 2), "utf8");
      } catch (e) {}
    }
    mainBotConnectedAlertSent = true;
    isPendingNewPairingAlert = false;
  } else if (!fs.existsSync(BOT_ALERT_MARKER_FILE)) {
    // אין סשן רשום בדיסק - ממתין לצימוד ווב חדש ראשוני
    isPendingNewPairingAlert = true;
    mainBotConnectedAlertSent = false;
  }

  const { state, saveCreds } = await useMultiFileAuthState(BOT_AUTH_DIR);
  const version = await getWaVersion();

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    keepAliveIntervalMs: 25000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
  });

  mainBotSock = sock;
  mainBotStatus.registered = wasAlreadyRegisteredOnDisk || Boolean(sock.authState?.creds?.registered);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    // עדכון שקט של מחרוזת ה-QR ללא הצפת יומן המערכת
    if (qr) {
      mainBotStatus.qr = qr;
      mainBotStatus.qrTimestamp = Date.now();
      onStatusChange?.(mainBotStatus);
    }

    if (connection === "open") {
      console.log(`✅ הבוט הראשי (${botPhone}) מחובר ופעיל בהצלחה לוואטסאפ!`);
      mainBotStatus.connected = true;
      mainBotStatus.registered = true;
      mainBotStatus.pairingCode = null;
      mainBotStatus.qr = null;
      mainBotStatus.qrTimestamp = null;
      mainBotStatus.lastDisconnectReason = "";
      mainBotDisconnectedAt = null;
      mainBot30MinAlertSent = false;
      mainBotStatus.disconnectedSince = null;
      mainBotLoggedOutCount = 0;
      onStatusChange?.(mainBotStatus);
      onEvent?.("system", `הבוט הראשי (${botPhone}) מחובר בהצלחה`);

      // שליחת הודעת אישור למנהל אך ורק פעם אחת ויחידה בכל התחברות ווב ראשונית אמיתית!
      // לעולם לא בריסטארט של PM2/שרת, לא בשחזור סשן קיים, לא בהתנתקויות זמניות/שיהוקי רשת, ולא בריסטארט לחיצת יד 515!
      const hasAlertMarker = fs.existsSync(BOT_ALERT_MARKER_FILE);
      const now = Date.now();
      const timeSinceLastAlert = now - mainBotLastSuccessAlertTime;
      const canSendAlert = (isPendingNewPairingAlert || !wasAlreadyRegisteredOnDisk) && !hasAlertMarker && !mainBotConnectedAlertSent && timeSinceLastAlert > 60000;

      if (canSendAlert) {
        // נעילה מיידית מסונכרנת בדיסק ובזיכרון לפני השליחה - מונעת כל אפשרות לכפילות
        mainBotConnectedAlertSent = true;
        isPendingNewPairingAlert = false;
        mainBotLastSuccessAlertTime = now;
        try {
          fs.writeFileSync(BOT_ALERT_MARKER_FILE, JSON.stringify({
            sentAt: new Date().toISOString(),
            botPhone,
            adminPhone: usersData.adminPhone || "972515157166",
          }, null, 2), "utf8");
        } catch (e) {}

        const adminPhone = cleanPhone(usersData.adminPhone || "972515157166");
        if (adminPhone) {
          setTimeout(async () => {
            try {
              await sock.sendMessage(`${adminPhone}@s.whatsapp.net`, {
                text: `✅ *התחברות וואטסאפ הושלמה בהצלחה!* 🚕\n\nהבוט הראשי (${botPhone}) מחובר ומסונכרן כעת ב-100% מול האתר והקבוצות.\nכל הפקודות והסינונים פעילים בזמן אמת.`,
              });
              console.log(`📲 נשלחה הודעת אישור חיבור חד-פעמית למנהל (${adminPhone})`);
            } catch (e) {
              console.warn("לא ניתן היה לשלוח הודעת אישור למנהל:", e.message);
            }
          }, 1500);
        }
      }
    }

    if (connection === "close") {
      if (mainBotSock && mainBotSock !== sock) return; // סוקט ישן - מתעלמים

      const code = lastDisconnect?.error?.output?.statusCode;
      mainBotStatus.connected = false;
      mainBotStatus.lastDisconnectReason = String(code || lastDisconnect?.error?.message || "closed");
      if (!mainBotDisconnectedAt) {
        mainBotDisconnectedAt = Date.now();
      }
      mainBotStatus.disconnectedSince = mainBotDisconnectedAt;
      onStatusChange?.(mainBotStatus);

      // קוד 515 (restartRequired) הוא חלק רשמי מהשלמת לחיצת היד בוואטסאפ בעת סריקת QR
      if (code === DisconnectReason.restartRequired || code === 515) {
        console.log(`🔄 [הבוט הראשי] קוד 515 restartRequired התקבל (השלמת צימוד WhatsApp Web) - מתחבר מחדש מיידית...`);
        if (mainBotReconnectTimeout) clearTimeout(mainBotReconnectTimeout);
        mainBotReconnectTimeout = setTimeout(() => {
          mainBotReconnectTimeout = null;
          startMainBot({ onMessage, onReaction, onStatusChange, onEvent, preservePendingAlert: isPendingNewPairingAlert });
        }, 800);
        return;
      }

      if (code === DisconnectReason.connectionReplaced || code === 440) {
        console.log("⚠️ [הבוט הראשי] הסשן הוחלף (440) - חיבור אחר פעיל. לא מתחבר מחדש כדי למנוע לולאה.");
        return;
      }

      if (code === DisconnectReason.loggedOut || code === 401) {
        mainBotLoggedOutCount += 1;
        console.log(`⚠️ הבוט הראשי קיבל 401 Logged Out (ניסיון ${mainBotLoggedOutCount})...`);
        
        if (mainBotLoggedOutCount >= 2) {
          console.log("⚠️ 401 חוזר (הטלפון באמת ביצע התנתקות) - מאפס תיקיית auth של הבוט ומפעיל מחדש...");
          try {
            fs.rmSync(BOT_AUTH_DIR, { recursive: true, force: true });
          } catch (e) {}
          mainBotLoggedOutCount = 0;
          mainBotConnectedAlertSent = false;
          mainBotLastSuccessAlertTime = 0;
          isPendingNewPairingAlert = true;
        }
        if (mainBotReconnectTimeout) clearTimeout(mainBotReconnectTimeout);
        mainBotReconnectTimeout = setTimeout(() => {
          mainBotReconnectTimeout = null;
          startMainBot({ onMessage, onReaction, onStatusChange, onEvent, preservePendingAlert: isPendingNewPairingAlert });
        }, 2500);
      } else {
        console.log(`🔄 חיבור הבוט הראשי נותק זמנית (קוד ${code}). מתחבר מחדש...`);
        if (mainBotReconnectTimeout) clearTimeout(mainBotReconnectTimeout);
        mainBotReconnectTimeout = setTimeout(() => {
          mainBotReconnectTimeout = null;
          startMainBot({ onMessage, onReaction, onStatusChange, onEvent, preservePendingAlert: isPendingNewPairingAlert });
        }, 2500);
      }
    }
  });

  sock.ev.on("messages.upsert", async (upsert) => {
    if (onMessage) {
      await onMessage(sock, upsert, { isMainBot: true, botPhone });
    }
  });

  sock.ev.on("messages.reaction", async (reactions) => {
    if (onReaction) {
      await onReaction(sock, reactions, { isMainBot: true, botPhone });
    }
  });

  return sock;
}

export function getMainBotSock() {
  return mainBotSock;
}

export function getMainBotStatus() {
  return mainBotStatus;
}

export async function requestMainBotPairingCode(customPhone) {
  if (!mainBotSock) throw new Error("הבוט הראשי אינו מאותחל כעת");
  if (mainBotStatus.connected && mainBotStatus.registered) {
    return "ALREADY_CONNECTED";
  }
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
      try { mainBotSock.end(); } catch (e) {}
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
    mainBotStatus.lastDisconnectReason = "איפוס סשן נקי";
    mainBotLoggedOutCount = 0;
    mainBotDisconnectedAt = Date.now();
    mainBotConnectedAlertSent = false;
    mainBotLastSuccessAlertTime = 0;
    isPendingNewPairingAlert = true;
    return await startMainBot({
      onStatusChange: (status) => console.log(`[בוט ראשי] סטטוס חיבור: ${status?.connected ? "מחובר ✅" : "מנותק ❌"}`),
      ...callbacks,
      preservePendingAlert: true,
    });
  } catch (err) {
    console.error("שגיאה באיפוס אותנטיקציית הבוט הראשי:", err.message);
    throw err;
  }
}

// ==========================================
// 2. ניהול סשנים של נהגים (Driver WhatsApp Sessions)
// ==========================================
export async function connectDriverSession(phone, { onRideMessage, onReaction, onStatusChange, onEvent } = {}) {
  const driverPhone = cleanPhone(phone);
  if (!driverPhone) throw new Error("מספר טלפון נהג לא תקין");

  // אם קיים כבר סשן פעיל ומחובר, נחזיר אותו
  const existing = driverSessions.get(driverPhone);
  if (existing && existing.sock && existing.status === "connected") {
    return existing;
  }

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
  const version = await getWaVersion();

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    keepAliveIntervalMs: 25000,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    retryRequestDelayMs: 2000,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
  });

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
      const code = lastDisconnect?.error?.output?.statusCode;
      sessionObj.status = "disconnected";
      sessionObj.lastDisconnectReason = String(code || lastDisconnect?.error?.message || "closed");
      onStatusChange?.(driverPhone, sessionObj);

      // סוקט ישן שהוחלף בסשן חדש - לא מתחברים מחדש בשמו (מונע לולאות וסוקטים כפולים)
      if (driverSessions.get(driverPhone)?.sock !== sock) return;

      if (code === DisconnectReason.connectionReplaced || code === 440) {
        console.log(`⚠️ [נהג ${driverPhone}] הסשן הוחלף (440) - לא מתחבר מחדש כדי למנוע לולאה.`);
        return;
      }

      if (code === DisconnectReason.loggedOut) {
        console.log(`⚠️ [נהג ${driverPhone}] התנתק (401 Logged Out). מאפס תיקיית אימות של הנהג בלבד!`);
        try {
          fs.rmSync(driverAuthDir, { recursive: true, force: true });
        } catch (e) {}
        driverSessions.delete(driverPhone);
      } else {
        // קריטי ביותר: בעת הזנת קוד צימוד או סריקת QR, וואטסאפ סוגרת את הסוקט עם קוד 515 (restartRequired).
        // חובה לבצע חיבור מחדש מיידי כדי להשלים את לחיצת היד (Handshake), אחרת הטלפון יסתובב וייכשל!
        console.log(`🔄 [נהג ${driverPhone}] חיבור נסגר (קוד: ${code || "לא ידוע"}). מתחבר מחדש אוטומטית להשלמת הקישור...`);
        setTimeout(() => {
          connectDriverSession(driverPhone, { onRideMessage, onReaction, onStatusChange, onEvent }).catch((err) => {
            console.error(`שגיאה בחיבור מחדש עבור נהג ${driverPhone}:`, err.message);
          });
        }, 2000);
      }
    }
  });

  sock.ev.on("messages.upsert", async (upsert) => {
    if (onRideMessage) {
      await onRideMessage(sock, upsert, { isMainBot: false, driverPhone });
    }
  });

  sock.ev.on("messages.reaction", async (reactions) => {
    if (onReaction) {
      await onReaction(sock, reactions, { isMainBot: false, driverPhone });
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
      disconnectedSince: mainBotDisconnectedAt,
      disconnectedMinutes: mainBotDisconnectedAt ? Math.floor((Date.now() - mainBotDisconnectedAt) / 60000) : 0,
      alertSent30Min: mainBot30MinAlertSent,
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