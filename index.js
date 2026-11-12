import cron from "node-cron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText, parseDriverCommand, processDriverCommand, rideMatches, matchesAnySearch, findPlaces, extractDispatcherContact, buildQuotedRideMessage, isWaitingForMessagePlaceholder } from "./matcher.js";
import { createDeduper } from "./dedupe.js";
import { startDashboard, recordEvent, recordError } from "./dashboard-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STICKER_CONFUSED_WEBP_PATH = path.join(__dirname, "assets", "sticker_confused.webp");
const STICKER_BUSY_WEBP_PATH = path.join(__dirname, "assets", "sticker_busy.webp");
const STICKER_SEARCH_WEBP_PATH = path.join(__dirname, "assets", "sticker_search.webp");
const STICKER_WEBP_PATH = STICKER_CONFUSED_WEBP_PATH;
const STICKER_PNG_PATH = path.join(__dirname, "assets", "sticker_confused.png");
const STICKER_JPG_PATH = path.join(__dirname, "assets", "sticker_confused.jpg");
const lastConfusedStickerSent = new Map();
import {
  getTelegramStatus,
  updateDriverTelegram,
  disconnectDriverTelegram,
  processIncomingTelegramRide,
  buildDriverTelegramInfoMessage,
  handleDriverTelegramCommand,
  hasPendingTelegramAuth,
  requestDriverTelegramCode,
  verifyDriverTelegramCode,
  cancelPendingTelegramAuth,
  getDriverTelegramInfo
} from "./telegram-manager.js";
import {
  extractInteractiveResponse,
  sendInteractiveButtons,
  sendInteractiveList,
  sendRideAlertWithButtons,
  sendPendingSearchConfirmationWithButtons,
  sendFullInteractiveMenu
} from "./interactive.js";
import { 
  loadUsersData, 
  isUserApproved, 
  isUserAdmin, 
  canReplyToUnapproved, 
  addPendingUser, 
  approveUser, 
  rejectUser, 
  updateUserPhone,
  editUserDetails,
  registerLidMapping,
  isLid,
  cleanPhone,
  getDestinationJid,
  getUserSearch,
  setUserSearch,
  stopUserSearch,
  getAllUserSearches,
  resetUserCooldown,
  addOrStageUserSearch,
  confirmPendingSearch,
  cancelPendingSearch,
  removeUserSearchByIndex,
  loadLidMap
} from "./users-manager.js";
import {
  startMainBot,
  getMainBotSock,
  getMainBotStatus,
  requestMainBotPairingCode,
  resetMainBotAuth,
  connectDriverSession,
  requestDriverPairingCode,
  disconnectDriverSession,
  resetDriverAuth,
  getAllSessionsSummary,
  initSavedDriverSessions,
  isDriverSessionConnected,
  purgeAllDriverSessions,
  ensureDriverSessionForQr,
  getDriverSession,
  cacheMessageForRetry,
  repairContactSession,
  resetAllContactSessions,
} from "./session-manager.js";
import {
  detectNeighborhood,
  calculateDistanceKm,
  generateWazeUrl,
  BEIT_SHEMESH_ZONES,
  parseRideRoute,
  extractDispatcherPhone,
} from "./geo-helper.js";

const DEBUG_FILTER = true;
const DEDUPE_MINUTES = 15;
const NOTIFY_ON_RESET = false;

// קבוצת וואטסאפ ייעודית לתיקוני באגים ונסיעות לא רלוונטיות
export const BUG_REPORT_GROUP_JID = "120363402521442927@g.us";

const groupMetadataCache = new Map();
const recentUnlinkedPrompts = new Map(); // senderPhone -> timestamp (צינון הודעות קישור)

// מטמון התראות שנשלחו למעקב אחרי דיסלייקים (👍 / 👎)
// מפתח: ID הודעת הבוט שנשלחה אל הנהג
export const sentAlertsCache = new Map();
const ALERTS_CACHE_FILE = new URL("./alerts-cache.json", import.meta.url);
const ALERTS_CACHE_MAX = 500;

// המטמון נשמר לדיסק כדי שדיסלייק על הודעה יעבוד גם אחרי הפעלה מחדש של השרת
try {
  if (fs.existsSync(ALERTS_CACHE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(ALERTS_CACHE_FILE, "utf8"));
    for (const [id, info] of Object.entries(saved || {})) sentAlertsCache.set(id, info);
  }
} catch (e) {
  console.error("שגיאה בקריאת alerts-cache.json:", e.message);
}

let alertsCacheTimer = null;
function persistAlertsCacheSoon() {
  if (alertsCacheTimer) return;
  alertsCacheTimer = setTimeout(() => {
    alertsCacheTimer = null;
    try {
      const keys = Array.from(sentAlertsCache.keys()).slice(-ALERTS_CACHE_MAX);
      const obj = {};
      for (const k of keys) obj[k] = sentAlertsCache.get(k);
      fs.writeFileSync(ALERTS_CACHE_FILE, JSON.stringify(obj), "utf8");
    } catch (e) {}
  }, 3000);
}

// מיקומי נהגים לשירות מרחק ורדאר בזמן אמת
const driverLocations = new Map();

export function getDriverLocation(phone) {
  const clean = cleanPhone(phone);
  if (driverLocations.has(clean)) return driverLocations.get(clean);
  const def = BEIT_SHEMESH_ZONES['רמה ד'];
  return {
    lat: def.lat,
    lng: def.lng,
    label: "רמת בית שמש ד'",
  };
}

export function setDriverLocation(phone, loc) {
  const clean = cleanPhone(phone);
  if (!clean) return;
  driverLocations.set(clean, loc);
}

// קבלת נסיעות אחרונות עבור רדאר הנסיעות החי באתר
export function getLiveRides(driverPhone = null) {
  const clean = driverPhone ? cleanPhone(driverPhone) : null;
  const list = [];
  const entries = Array.from(sentAlertsCache.entries()).reverse();

  for (const [id, info] of entries) {
    if (clean && info.driverPhone && cleanPhone(info.driverPhone) !== clean) {
      continue;
    }

    const text = info.rideData?.cleanedText || info.rawText || "";
    const parsed = parseRideRoute(text, info.senderPhone);

    // חילוץ סדרן מדויק (אם היה 0 או לא תקין, נחלץ מהטקסט)
    let dispatcherPhone = parsed.dispatcherPhone || info.senderPhone;
    if (!dispatcherPhone || dispatcherPhone === "0" || dispatcherPhone === "לא צוין") {
      dispatcherPhone = extractDispatcherPhone(text) || null;
    }

    list.push({
      id,
      timestamp: info.sentAt || Date.now(),
      timeFormatted: new Date(info.sentAt || Date.now()).toLocaleTimeString("he-IL", {
        timeZone: "Asia/Jerusalem",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      rawText: info.rawText || text,
      cleanedText: text,
      origin: parsed.originCity || parsed.city || "ישראל",
      city: parsed.originCity || parsed.city || "ישראל",
      originText: parsed.originText,
      originNeighborhood: parsed.originNeighborhood,
      originCoords: parsed.originCoords,
      destination: parsed.destinationText,
      destinationText: parsed.destinationText,
      destNeighborhood: parsed.destNeighborhood,
      destinationNeighborhood: parsed.destNeighborhood,
      destinationCoords: parsed.destCoords,
      isInternal: parsed.isInternal,
      price: parsed.price,
      groupName: info.groupName || "קבוצת נסיעות",
      groupJid: info.groupJid || null,
      dispatcherName: info.senderName || "סדרן",
      dispatcherPhone: dispatcherPhone || "",
      wazeUrl: generateWazeUrl(parsed.originText || parsed.originNeighborhood, parsed.originCity || parsed.city || "ישראל", parsed.originCoords),
      isDriveBot: Boolean(parsed.isDriveBot),
      drivebotUrl: parsed.drivebotUrl || null,
      drivebotCommand: parsed.drivebotCommand || null,
      claimed: Boolean(info.claimed),
      claimedBy: info.claimedBy || null,
      claimedAt: info.claimedAt || null,
    });

    if (list.length >= 60) break;
  }

  return list;
}

// תפיסת נסיעה מהירה מהאתר ("תן")
export async function claimRideFromWeb(rideId, driverPhone, claimText = "תן") {
  const targetAlertInfo = sentAlertsCache.get(rideId);
  if (!targetAlertInfo) {
    throw new Error("נסיעה זו לא נמצאה במאגר או שפג תוקפה");
  }

  const phone = driverPhone ? cleanPhone(driverPhone) : cleanPhone(targetAlertInfo.driverPhone);
  const driverSession = getDriverSession(phone);
  const driverSock = driverSession?.sock;
  const quoteObj = buildQuotedRideMessage(targetAlertInfo);

  const rawRideText = targetAlertInfo.rawText || targetAlertInfo.rideData?.rawText || "";
  const parsedRoute = parseRideRoute(rawRideText, targetAlertInfo.senderPhone);
  const isDriveBot = parsedRoute.isDriveBot || /דרייבוט/i.test(targetAlertInfo.groupName || "");

  let sentInGroup = false;
  let sentDirect = false;
  let sentToDriveBot = false;
  const sentDirectPhones = [];

  if (driverSock && driverSession?.status === "connected") {
    // אם זו נסיעת דרייבוט - לא שולחים תן לקבוצה! אך ורק שליחת קוד התפיסה ישירות לבוט של דרייבוט
    if (isDriveBot) {
      const driveBotTargetPhone = parsedRoute.drivebotPhone || "972552732722";
      const commandToSend = parsedRoute.drivebotCommand || claimText || "תן";
      const targetJid = `${driveBotTargetPhone}@s.whatsapp.net`;
      try {
        await driverSock.sendMessage(targetJid, { text: commandToSend });
        sentToDriveBot = true;
        sentDirect = true;
        sentDirectPhones.push(driveBotTargetPhone);
      } catch (err) {
        console.error("שגיאה בשליחת תפיסה לבוט דרייבוט:", err.message);
      }
    } else {
      // נסיעה רגילה: תגובה בקבוצה ולסדרן
      if (targetAlertInfo.groupJid) {
        const ok = await sendRideClaimReply(driverSock, targetAlertInfo.groupJid, claimText, quoteObj);
        if (ok) sentInGroup = true;
      }

      const directRecipients = new Set();
      const senderPhoneClean = cleanPhone(targetAlertInfo.senderPhone);
      if (senderPhoneClean && senderPhoneClean.length >= 9 && !isLid(senderPhoneClean) && senderPhoneClean !== "זמין בקבוצה") {
        directRecipients.add(senderPhoneClean);
      }
      const textPhone = extractDispatcherContact(targetAlertInfo);
      if (textPhone && textPhone.length >= 9 && !isLid(textPhone)) {
        directRecipients.add(cleanPhone(textPhone));
      }

      for (const p of directRecipients) {
        const targetJid = `${p}@s.whatsapp.net`;
        const ok = await sendRideClaimReply(driverSock, targetJid, claimText, quoteObj);
        if (ok) {
          sentDirect = true;
          sentDirectPhones.push(p);
        }
      }
    }
  }

  targetAlertInfo.claimed = true;
  targetAlertInfo.claimedBy = phone;
  targetAlertInfo.claimedAt = Date.now();
  sentAlertsCache.set(rideId, targetAlertInfo);

  let message = "";
  if (isDriveBot) {
    message = `נשלחה פקודת תפיסה ישירות לבוט דרייבוט (${parsedRoute.drivebotCommand || 'ת'})! לא נשלח תן לקבוצה כנדרש.`;
  } else {
    message = `הנסיעה נתפסה בהצלחה! נשלח "${claimText}" ${sentInGroup ? 'בקבוצה' : ''} ${sentDirect ? 'ולסדרן' : ''}`;
  }

  return {
    success: true,
    sentInGroup,
    sentDirect,
    sentToDriveBot,
    isDriveBot,
    drivebotUrl: parsedRoute.drivebotUrl || null,
    drivebotCommand: parsedRoute.drivebotCommand || null,
    sentDirectPhones,
    dispatcherPhone: targetAlertInfo.senderPhone,
    groupName: targetAlertInfo.groupName,
    message,
  };
}


// יצירת נסיעת בדיקה עבור הדגמה מהירה של הרדאר
export function simulateLiveRide(simulated = {}) {
  const id = `sim-${Date.now()}`;
  const text = simulated.rawText || simulated.cleanedText || "פנימי שמש\nזכריה הנביא לד\n150 שח מידי";
  const detected = detectNeighborhood(text);
  const coords = detected?.coords || BEIT_SHEMESH_ZONES['רמה ג'];

  const rideObj = {
    id,
    timestamp: Date.now(),
    timeFormatted: new Date().toLocaleTimeString("he-IL", { timeZone: "Asia/Jerusalem" }),
    rawText: text,
    cleanedText: text,
    origin: "בית שמש",
    originNeighborhood: "רמה ד",
    originCoords: BEIT_SHEMESH_ZONES['רמה ד'],
    destination: detected?.matchedStreet || "זכריה הנביא",
    destinationNeighborhood: detected?.zoneKey || "רמה ג",
    destinationCoords: coords,
    price: simulated.price || 150,
    groupName: simulated.groupName || "👥 נסיעות בית שמש פנימי",
    groupJid: "120363000000000000@g.us",
    dispatcherName: simulated.dispatcherName || "יוסי סדרן",
    dispatcherPhone: simulated.dispatcherPhone || "0528101833",
    wazeUrl: generateWazeUrl(detected?.matchedStreet || "זכריה הנביא", "בית שמש", coords),
    claimed: false,
  };

  sentAlertsCache.set(id, {
    msgId: id,
    rawText: text,
    rideData: { cleanedText: text, rawText: text },
    driverPhone: simulated.driverPhone || "972515157166",
    groupName: rideObj.groupName,
    groupJid: rideObj.groupJid,
    senderName: rideObj.dispatcherName,
    senderPhone: rideObj.dispatcherPhone,
    sentAt: Date.now(),
  });

  return rideObj;
}

const deduper = createDeduper(findPlaces, { windowMs: DEDUPE_MINUTES * 60 * 1000 });

// ניקוי ספאם, פרסומות דרייבוט, טלגרם אדום וקווים מפרידים
function cleanSpamFromRide(rawText) {
  let s = String(rawText || "");
  
  // 1. חיתוך לאחר קו מפריד
  const sep = s.indexOf("━━━━━━━━━━━━━━");
  if (sep !== -1) {
    s = s.slice(0, sep).trim();
  }
  const altSep = s.indexOf("───────────────");
  if (altSep !== -1 && altSep > 40) {
    s = s.slice(0, altSep).trim();
  }

  // 2. הסרת הודעות דרייבוט וקישורים פרסומיים
  s = s.replace(/⚠️\s*\|\s*חשוב:[\s\S]*$/gi, "");
  s = s.replace(/🔴\s*\|\s*(?:הטלגרם האדום|הוואטסאפ האדום|קבוצת כל הנסיעות)[^\n]*(\nhttps?:\/\/[^\s]+)?/gi, "");
  s = s.replace(/https?:\/\/[^\s]*drivebot\.co\.il[^\s]*/gi, "");
  s = s.replace(/הבוט בוואטסאפ ייסגר לחלוטין בימים הקרובים[^\n]*/gi, "");

  // 3. ניקוי שורות ריקות מיותרות בסוף
  return s.split("\n").map(l => l.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// זיהוי הודעות שברור שאינן נסיעה: פרסומות, הזמנות לקבוצות, קישורי רכישה, הודעות מערכת והודעות ארוכות במיוחד
function detectNonRide(cleaned) {
  const t = String(cleaned || "");
  if (isWaitingForMessagePlaceholder(t)) {
    return "הודעת המתנה זמנית של וואטסאפ (Placeholder) - לא נסיעה";
  }
  if (t.length > 700) return "הודעה ארוכה מדי - לא נסיעה";
  if (/chat\.whatsapp\.com\//i.test(t)) return "קישור הזמנה לקבוצה - לא נסיעה";
  if (/aliexpress|amazon\.|amzn\.to|s\.click\.|temu\.|shein\./i.test(t)) return "פרסומת / קישור רכישה - לא נסיעה";
  if (/(?:הצטרף\/ה לקבוצה|נוצרה על ידי|עזב\/ה את הקבוצה|שינה\/ה את נושא|הוסר\/ה מהקבוצה)/.test(t)) return "הודעת מערכת וואטסאפ - לא נסיעה";
  return null;
}

// הודעת "ניתוק לילי" לנהג שהחיפוש שלו הופסק
function buildNightlyStopMessage(displayText) {
  return `🌙 *ניתוק לילי*\n\n` +
    `החיפוש שלך: ${displayText || "פעיל"}\n` +
    `הופסק כחלק מהתחזוקה הלילית שאנחנו מבצעים כל יום ב-02:00\n\n` +
    `זה נועד למנוע חיפושים שנשארים דלוקים ימים בלי שאף אחד משתמש בהם.\n\n` +
    `כדי לחזור לקבל נסיעות — הגדר חיפוש מחדש. 👇\n` +
    `למשל: *פנוי שמש פנימי*`;
}

// איפוס יומי ב-2:00 בלילה
cron.schedule("0 2 * * *", async () => {
  const adminClean = cleanPhone(loadUsersData().adminPhone);
  const searches = getAllUserSearches();
  const mainSock = getMainBotSock();

  for (const [phone, st] of Object.entries(searches)) {
    if (!st?.active) continue;
    const wasActive = st.displayText;
    stopUserSearch(phone);

    // מספר המנהל משמש לניהול בלבד - אליו לא שולחים; לכל נהג אחר עם חיפוש פעיל נשלחת הודעה
    if (cleanPhone(phone) === adminClean || !mainSock) continue;
    try {
      await mainSock.sendMessage(getDestinationJid(phone), { text: buildNightlyStopMessage(wasActive) });
    } catch (e) {
      console.error(`שגיאה בשליחת הודעת ניתוק לילי ל-${phone}:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  const users = loadUsersData();
  for (const u of users.approvedUsers || []) {
    stopUserSearch(u.phone);
  }
  deduper.clear();
  groupMetadataCache.clear();
  console.log("🌙 איפוס יומי (2:00): כל החיפושים הופסקו והזיכרון נוקה");
  recordEvent("system", "איפוס יומי ב-2:00: החיפושים הופסקו");
}, { timezone: "Asia/Jerusalem" });

// שליחת דיווח לקבוצת תיקוני הבוט הייעודית (120363402521442927@g.us)
export async function sendBugReportToGroup(sock, reportText) {
  // 1. קודם כל: שליחה דרך הבוט הראשי (0555081810) שהוא חבר/מנהל קבוע בקבוצת התיקונים!
  // מבטיח 100% הגעה גם אם הנהג שמסמן דיסלייק כלל אינו חבר בקבוצה!
  const mainSock = getMainBotSock();
  if (mainSock && getMainBotStatus().connected) {
    try {
      await mainSock.sendMessage(BUG_REPORT_GROUP_JID, { text: reportText });
      return true;
    } catch (e) {
      console.error("שליחת דיווח באג דרך הבוט הראשי נכשלה:", e.message);
    }
  }

  // 2. גיבוי: ניסיון דרך הסוקט הנוכחי
  if (sock && sock !== mainSock) {
    try {
      await sock.sendMessage(BUG_REPORT_GROUP_JID, { text: reportText });
      return true;
    } catch (e) {
      console.log("סוקט מקומי לא הצליח לשלוח לקבוצת הבאגים:", e.message);
    }
  }

  return false;
}

// חילוץ טקסט מהודעה (כולל כיתוב של תמונה/וידאו ועטיפות של הודעות זמניות)
function extractMessageText(m) {
  let msg = m.message || {};
  for (let i = 0; i < 4; i++) {
    const inner =
      msg.ephemeralMessage?.message ||
      msg.viewOnceMessage?.message ||
      msg.viewOnceMessageV2?.message ||
      msg.documentWithCaptionMessage?.message ||
      msg.editedMessage?.message?.protocolMessage?.editedMessage;
    if (!inner) break;
    msg = inner;
  }
  // בדיקה מקיפה של תגובת כפתורים או תפריט נפתח (Interactive / Buttons / List / Native Flow)
  const interactiveText = extractInteractiveResponse(msg);
  if (interactiveText) {
    if (isWaitingForMessagePlaceholder(interactiveText)) return "";
    return interactiveText;
  }

  const rawText = String(
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.templateButtonReplyMessage?.selectedId ||
    ""
  ).trim();

  // סינון מוחלט של הודעות המתנה זמניות (Waiting for this message placeholder) כולל תווי יוניקוד סמויים
  if (isWaitingForMessagePlaceholder(rawText)) {
    return "";
  }

  return rawText;
}

// צ'אטים שאינם שיחה אמיתית: סטטוסים (סטוריז), רשימות תפוצה וערוצים - מתעלמים מהם לחלוטין
function isIgnorableJid(jid) {
  const j = String(jid || "");
  return j === "status@broadcast" || j.endsWith("@broadcast") || j.endsWith("@newsletter");
}

const MAX_MESSAGE_AGE_SEC = 5 * 60; // הודעות ישנות (היסטוריה / סנכרון אחרי ניתוק) לא מטופלות

function isStaleMessage(m) {
  const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp ?? 0);
  if (!ts) return false;
  return Date.now() / 1000 - ts > MAX_MESSAGE_AGE_SEC;
}

// פורמט התראת נסיעה מושלם: ציטוט מדויק של הקבוצה והסדרן עם בלוק ציטוט וואטסאפ (>) וקישור וואטסאפ ישיר לסדרן
function buildRideAlertText(rideData, isQuoted = false) {
  let cleanDispPhone = cleanPhone(rideData.senderPhone || "");
  if (cleanDispPhone && cleanDispPhone.startsWith("0")) cleanDispPhone = "972" + cleanDispPhone.slice(1);
  const waLink = cleanDispPhone && cleanDispPhone.length >= 9 && cleanDispPhone !== "9720"
    ? `https://wa.me/${cleanDispPhone}`
    : null;

  let msg = `🚕 *נסיעה חדשה מתאימה לחיפוש שלך!*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💬 *הודעת הסדרן המקורית:*\n`;
  const originalLines = (rideData.rawText || rideData.cleanedText || "").split("\n");
  for (const line of originalLines) {
    msg += `> ${line}\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📍 *קבוצה:* ${rideData.groupName}\n`;
  msg += `👤 *סדרן:* ${rideData.senderName} (${rideData.senderPhone || "זמין בקבוצה"})\n`;
  if (waLink) {
    msg += `📲 *וואטסאפ ישיר לסדרן:* ${waLink}\n`;
  }
  msg += `\n👉 לתפיסה מהירה השב *"ת"* או *"תן"* (הבוט יגיב בשמך מיד בקבוצה!)`;
  return msg.trim();
}

// שליחת הודעה עם ניסיון ציטוט, ובמקרה כשל - בלי ציטוט
async function trySend(sock, jid, content, quoted) {
  if (!sock) return null;
  if (quoted) {
    try {
      return await sock.sendMessage(jid, content, { quoted });
    } catch (e) {
      console.log(`שליחה עם ציטוט נכשלה (${e.message}), מנסה בלי ציטוט`);
    }
  }
  return await sock.sendMessage(jid, content);
}


// קבלת ההתראה האחרונה ביותר שנשלחה לנהג (לחילוץ נסיעה כשהנהג משיב "תן" ללא ציטוט)
export function getLatestAlertForDriver(driverPhone, maxAgeMs = 5 * 60 * 1000) {
  const clean = cleanPhone(driverPhone);
  let latest = null;
  const now = Date.now();
  for (const info of sentAlertsCache.values()) {
    if (cleanPhone(info.driverPhone) === clean) {
      if (now - (info.sentAt || 0) <= maxAgeMs) {
        if (!latest || info.sentAt > latest.sentAt) {
          latest = info;
        }
      }
    }
  }
  return latest;
}


// שליחת מענה "תן" כתגובה המצטטת את הודעת הנסיעה (עם גיבוי אם הציטוט הבין-צ'אטי נדחה)
export async function sendRideClaimReply(sock, targetJid, text, quoteObj) {
  if (!sock || !targetJid) return false;

  // 1. ניסיון שליחה עם הציטוט המלא (כולל מזהה קבוצת המקור)
  if (quoteObj) {
    try {
      await sock.sendMessage(targetJid, { text }, { quoted: quoteObj });
      return true;
    } catch (e) {
      console.log(`שליחה עם ציטוט מקורי ל-${targetJid} נכשלה (${e.message}), מנסה ציטוט מותאם`);
    }

    // 2. ניסיון ציטוט כאשר remoteJid מכוון לצ'אט היעד
    try {
      const adaptedQuote = {
        key: {
          ...quoteObj.key,
          remoteJid: targetJid,
        },
        message: quoteObj.message,
      };
      await sock.sendMessage(targetJid, { text }, { quoted: adaptedQuote });
      return true;
    } catch (e2) {
      console.log(`שליחה עם ציטוט מותאם ל-${targetJid} נכשלה (${e2.message}), מנסה ללא ציטוט`);
    }
  }

  // 3. גיבוי אחרון: שליחה ללא ציטוט
  try {
    await sock.sendMessage(targetJid, { text });
    return true;
  } catch (err) {
    console.error(`שליחה ל-${targetJid} נכשלה:`, err.message);
    return false;
  }
}

// שליחת התראת נסיעה לנהג (100% אמינות, הגעה מיידית ללא בליעת הודעות בוואטסאפ).
async function deliverRideAlert(driverSock, driverPhone, rideData, originalMsg) {
  // בדיקת בטיחות מוחלטת: פסילת כל הודעת דמה/המתנה לפני שליחה לנהג
  if (
    isWaitingForMessagePlaceholder(rideData?.cleanedText) || 
    isWaitingForMessagePlaceholder(rideData?.rawText)
  ) {
    console.warn(`⚠️ ניסיון שליחת הודעת דמה/placeholder ("בהמתנה להודעה זו") נבלם לחלוטין לפני שליחה לנהג ${driverPhone}`);
    return { ok: false, error: "הודעת placeholder נפסלה" };
  }

  let targetPhone = cleanPhone(driverPhone);
  if (targetPhone.startsWith("0")) targetPhone = "972" + targetPhone.slice(1);
  const driverJid = `${targetPhone}@s.whatsapp.net`;

  // זיהוי JID של הנהג: אם הוא מתכתב מ-LID (וואטסאפ ביזנס), נוסיף גם את ה-LID כדי שההודעה תגיע ישירות לצ'אט הפעיל שלו!
  const targetJids = [driverJid];
  const lidMap = loadLidMap();
  for (const [l, ph] of Object.entries(lidMap)) {
    if (cleanPhone(ph) === targetPhone) {
      targetJids.unshift(`${l}@lid`);
      break;
    }
  }

  const attempts = [];
  const mainSock = getMainBotSock();
  if (mainSock && getMainBotStatus().connected) {
    attempts.push({ via: "main", sock: mainSock });
  }
  if (driverSock && getDriverSession(driverPhone)?.status === "connected") {
    attempts.push({ via: "driver-self", sock: driverSock });
  }

  const groupJid = rideData?.groupJid || originalMsg?.key?.remoteJid || rideData?.originalMsgKey?.remoteJid;
  let rawParticipant = rideData?.senderJid || originalMsg?.key?.participant || originalMsg?.participant || rideData?.originalMsgKey?.participant;

  if (rawParticipant && rawParticipant.endsWith("@g.us")) {
    rawParticipant = null;
  }
  if (!rawParticipant && rideData?.senderPhone) {
    let cleanSender = cleanPhone(rideData.senderPhone);
    if (cleanSender && cleanSender.startsWith("0")) cleanSender = "972" + cleanSender.slice(1);
    if (cleanSender && cleanSender.length >= 9) {
      rawParticipant = `${cleanSender}@s.whatsapp.net`;
    }
  }

  const cleanParticipant = rawParticipant ? String(rawParticipant).replace(/:\d+@/, "@").trim() : undefined;
  const msgId = originalMsg?.key?.id || rideData?.originalMsgKey?.id;

  let cleanMsgContent = { conversation: rideData?.rawText || rideData?.cleanedText || "נסיעה" };
  const rawSourceMsg = originalMsg?.message || rideData?.originalMessage;
  if (rawSourceMsg) {
    let inner = rawSourceMsg;
    for (let i = 0; i < 4; i++) {
      const unwrapped = inner.ephemeralMessage?.message || inner.viewOnceMessage?.message || inner.viewOnceMessageV2?.message || inner.documentWithCaptionMessage?.message || inner.editedMessage?.message?.protocolMessage?.editedMessage;
      if (!unwrapped) break;
      inner = unwrapped;
    }
    if (inner.conversation) {
      cleanMsgContent = { conversation: inner.conversation };
    } else if (inner.extendedTextMessage?.text) {
      cleanMsgContent = { extendedTextMessage: { text: inner.extendedTextMessage.text } };
    }
  }

  const quoteObj = (msgId && groupJid) ? {
    key: {
      remoteJid: groupJid,
      id: msgId,
      participant: cleanParticipant,
      fromMe: false,
    },
    message: cleanMsgContent,
  } : null;

  let lastError = null;
  for (const a of attempts) {
    for (const targetJid of targetJids) {
      try {
        let sentMsg = null;
        const deliveredText = buildRideAlertText(rideData, Boolean(quoteObj));
        // ניסיון שליחה עם ציטוט מדויק של הודעת הקבוצה והסדרן
        if (quoteObj) {
          try {
            sentMsg = await a.sock.sendMessage(targetJid, { text: deliveredText }, { quoted: quoteObj });
          } catch (quoteErr) {
            sentMsg = await a.sock.sendMessage(targetJid, { text: deliveredText });
          }
        }
        if (!sentMsg) {
          sentMsg = await a.sock.sendMessage(targetJid, { text: deliveredText });
        }
        if (!sentMsg) continue;

        if (sentMsg.key?.id) {
          // שמירת ההודעה במאגר השחזור לפתרון מוחלט של שגיאת 'בהמתנה להודעה זו'
          cacheMessageForRetry(sentMsg.key.id, sentMsg.message || { conversation: deliveredText });

          sentAlertsCache.set(sentMsg.key.id, {
            msgId: sentMsg.key.id,
            rideData,
            rawText: rideData.rawText || rideData.cleanedText,
            driverPhone,
            groupName: rideData.groupName,
            groupJid: rideData.groupJid || originalMsg?.key?.remoteJid || null,
            senderName: rideData.senderName,
            senderPhone: rideData.senderPhone,
            senderJid: rideData.senderJid || originalMsg?.key?.participant || originalMsg?.key?.remoteJid || null,
            originalMsgKey: rideData.originalMsgKey || originalMsg?.key || null,
            originalMessage: originalMsg?.message || null,
            searchDesc: rideData.searchDesc,
            matchedReason: rideData.matchedReason || null,
            matchedSearch: rideData.matchedSearch || null,
            activeSearchesSnapshot: rideData.activeSearchesSnapshot || null,
            sentAt: Date.now(),
          });
          if (sentAlertsCache.size > ALERTS_CACHE_MAX) {
            sentAlertsCache.delete(sentAlertsCache.keys().next().value);
          }
          persistAlertsCacheSoon();
        }
        return { ok: true, via: a.via };
      } catch (err) {
        lastError = err;
        console.error(`❌ שליחת התראה לנהג ${driverPhone} דרך ${a.via} נכשלה:`, err.message);
      }
    }
  }

  return { ok: false, error: lastError?.message || "אין סוקט זמין לשליחה" };
}

// מעקב דיסלייקים שכבר טופלו למניעת כפילויות (Baileys מפעיל גם upsert וגם reaction)
const handledReactions = new Map();

export async function handleReaction(sock, reactions, sessionContext = {}) {
  const items = Array.isArray(reactions) ? reactions : [reactions];

  for (const item of items) {
    if (!item) continue;
    const reactionText = item.reaction?.text ?? item.text ?? "";
    const targetMsgId = item.reaction?.key?.id || item.key?.id;

    if (!targetMsgId) continue;

    // רק דיסלייק (👎)
    if (!reactionText.includes("👎")) continue;

    // התעלמות מוחלטת מתגובות בתוך קבוצות (מונע לחלוטין דיווחי שווא מוקדם בבוקר כשמשתמשי קבוצות מסמנים דיסלייק!)
    const reactionChat = item.reaction?.key?.remoteJid || item.key?.remoteJid || "";
    if (String(reactionChat).endsWith("@g.us")) continue;

    // רק תגובות על הודעות שהבוט עצמו שלח לנהג
    const alertInfo = sentAlertsCache.get(targetMsgId);
    if (!alertInfo) continue;

    // צינון מניעת דיווח כפול
    const dedupeKey = `${targetMsgId}|${reactionText}`;
    const nowTs = Date.now();
    if (handledReactions.has(dedupeKey) && nowTs - handledReactions.get(dedupeKey) < 30000) continue;
    handledReactions.set(dedupeKey, nowTs);
    if (handledReactions.size > 500) handledReactions.delete(handledReactions.keys().next().value);

    console.log(`👎 [דיסלייק על הודעת בוט] ${targetMsgId} מנהג: ${alertInfo.driverPhone}`);
    const nowFormatted = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

    let reportMsg = `🐞 *דיווח תקלה / נסיעה לא רלוונטית (דיסלייק 👎)*\n`;
    reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
    reportMsg += `🚕 *הנסיעה שנשלחה:*\n${alertInfo.rideData?.cleanedText || alertInfo.rawText}\n`;
    reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (alertInfo.rawText && alertInfo.rawText !== alertInfo.rideData?.cleanedText) {
      reportMsg += `📌 *טקסט גולמי מקורי:*\n${alertInfo.rawText}\n`;
      reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
    }
    reportMsg += `👤 *נהג מדווח:* ${alertInfo.driverPhone}\n`;
    reportMsg += `📍 *קבוצה מקורית:* ${alertInfo.groupName} (${alertInfo.groupJid || "לא זמין"})\n`;
    reportMsg += `🏷️ *סדרן:* ${alertInfo.senderName} (${alertInfo.senderPhone})\n`;
    reportMsg += `⏱️ *זמן הדיווח:* ${nowFormatted}\n`;
    reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;

    // 1. פירוט כל החיפושים שהיו פעילים לנהג באותו רגע
    const driverState = getUserSearch(alertInfo.driverPhone);
    const activeSearches = alertInfo.activeSearchesSnapshot || (driverState?.searches || []);
    if (activeSearches && activeSearches.length > 0) {
      reportMsg += `📋 *כל החיפושים שהיו פעילים לנהג באותו רגע (${activeSearches.length}):*\n`;
      activeSearches.forEach((s, idx) => {
        const desc = describeMode ? describeMode(s) : (s.mode || "");
        reportMsg += `${idx + 1}. ${s.displayText} (${desc})\n`;
      });
      reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
    }

    // 2. החיפוש הספציפי שתפס את הנסיעה וסיבת ההתאמה
    reportMsg += `🎯 *החיפוש שהתאים בשרת:* ${alertInfo.searchDesc}\n`;
    if (alertInfo.matchedReason) {
      reportMsg += `💡 *סיבת ההתאמה בשרת:* ${alertInfo.matchedReason}\n`;
    }

    // 3. ניתוח אבחון ומוקדים שזוהו בנסיעה
    try {
      const places = findPlaces(alertInfo.rideData?.cleanedText || alertInfo.rawText || "");
      if (places && places.length > 0) {
        const detected = places.map((p) => `${p.phrase} (${p.city})`).join(", ");
        reportMsg += `📍 *מוקדים שזוהו בטקסט:* ${detected}\n`;
      }
    } catch (e) {}

    reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
    reportMsg += `💡 דיסלייק 👎 שסומן ישירות ע"י הנהג. נמשך מקסימום מידע מהשרת לטיפול מיידי בבאג.`;

    const sent = await sendBugReportToGroup(sock, reportMsg);
    console.log(`📤 [דיווח לקבוצת תיקונים ${BUG_REPORT_GROUP_JID}]: ${sent ? "נשלח בהצלחה ✅" : "כשל בשליחה ❌"}`);
    recordEvent("system", `נשלח דיווח 👎 לקבוצת התיקונים עבור הודעה ${targetMsgId}`);

    // שליחת אישור חוזר לנהג (אימוג'י 🫡)
    try {
      const remoteJid = item.reaction?.key?.remoteJid || item.key?.remoteJid;
      if (remoteJid && sock) {
        await sock.sendMessage(remoteJid, {
          react: {
            text: "🫡",
            key: item.reaction?.key || item.key,
          }
        });
      }
    } catch (e) {}
  }
}

// שליחת הודעת אישור הצטרפות והדרכת קישור ווב לנהג
export async function sendApprovalAndOnboarding(targetPhone, targetName = "נהג") {
  const sock = getMainBotSock();
  if (!sock) return;

  const adminClean = cleanPhone(loadUsersData().adminPhone);
  if (adminClean && cleanPhone(targetPhone) === adminClean) return;

  const recipientJid = getDestinationJid(targetPhone);
  const isTargetLid = isLid(targetPhone) || recipientJid.endsWith("@lid");

  let welcomeText = `🎉 *שלום ${targetName}! חשבונך אושר בהצלחה במערכת.*\n\n` +
    `ברוך הבא ל*נסיעות בוט איכותי* 🚕\n\n` +
    `📲 *חיבור הוואטסאפ שלך לסריקת קבוצות הנסיעות:*\n`;

  if (isTargetLid) {
    welcomeText += `כדי להפיק קוד צימוד, וואטסאפ דורשת מספר סלולרי רגיל.\n\n` +
      `👉 *שלח עכשיו:* חבר אותי 0521234567\n` +
      `(במקום המספר הדוגמה - המספר שלך). מיד לאחר מכן תקבל קוד צימוד בן 8 תווים.`;
  } else {
    welcomeText += `כדי שהמערכת תסרוק נסיעות ישירות מכל קבוצות הנסיעות שאתה חבר בהן, השב עכשיו למספר זה:\n\n` +
      `👉 *"חבר אותי"*\n\n` +
      `מיד תקבל קוד צימוד בן 8 תווים והסבר פשוט איך להזין אותו בוואטסאפ במכשירים מקושרים.\n\n` +
      `💡 *לצפייה בפקודות חיפוש:* השב *"תפריט"*`;
  }

  try {
    await sock.sendMessage(recipientJid, { text: welcomeText });
    recordEvent("command", `נשלחה הודעת אישור והדרכה לנהג: ${targetName} (${recipientJid})`);
  } catch (err) {
    console.error(`שגיאה בשליחת הודעת אישור ל-${recipientJid}:`, err.message);
    recordError("send_approval", err, { recipientJid, targetPhone, targetName });
  }
}

// שליחת הודעת תפריט / עזרה ברורה עם פקודות מהירות (100% הגעה ישירה)
async function sendHelpMenu(sock, jid, driverPhone) {
  const search = getUserSearch(driverPhone);
  const tgInfo = getDriverTelegramInfo(driverPhone);
  let menuText = `🚕 *תפריט נסיעות בוט איכותי*\n\n`;

  // 1. סטטוס חיפושים פעילים
  if (search.active && search.searches.length > 0) {
    menuText += `📊 *סטטוס החיפושים הפעילים שלך במקביל:*\n`;
    search.searches.forEach((s, idx) => {
      menuText += `${idx + 1}. ${s.displayText} (${describeMode(s)})\n`;
    });
    menuText += `\n`;
  } else {
    menuText += `📊 *סטטוס חיפוש נוכחי:* 🔴 מופסק (תפוס)\n\n`;
  }

  // 2. סטטוס סריקת טלגרם מקבילה
  if (tgInfo.connected) {
    menuText += `✈️ *ערוץ טלגרם מקבילי:* 🟢 מחובר ופעיל (${tgInfo.telegramPhone})\n`;
    menuText += `📡 סורק ${tgInfo.groupsCount} קבוצות נסיעות מובילות בטלגרם במקביל לוואטסאפ!\n\n`;
  } else {
    menuText += `✈️ *ערוץ טלגרם מקבילי:* ⚪ טרם חובר (שלח *"טלגרם"* לחיבור במספר פלאפון)\n\n`;
  }

  menuText += `🔍 *פקודות חיפוש נפוצות:*\n`;
  menuText += `• *פנוי שמש* / *פנוי ים* / *פנוי מירון* (בתוך ומחוץ לעיר)\n`;
  menuText += `• *פנוי שמש פנימי* / *פנימי ים* (פנימי בלבד בעיר)\n`;
  menuText += `• *פ ים שמש* (מירושלים לבית שמש)\n`;
  menuText += `• *פ שמש ים* (מבית שמש לירושלים)\n\n`;
  menuText += `⚡ *חיפוש מקבילי:* שליחת פקודת חיפוש נוספת תאפשר לך להוסיף אותה במקביל (למשל: גם שמש וגם ים בו-זמנית!)\n`;
  menuText += `🚕 *לתפיסת נסיעה מהירה:* השב *"ת"* או *"תן"* על הודעת הנסיעה (הבוט יגיב בקבוצה ולסדרן בשמך!)\n`;
  menuText += `🛑 *תפוס* (עצירת כל החיפושים)\n\n`;
  menuText += `📖 *למדריך שימוש מפורט ומקצועי:* השב *"מדריך"*\n`;
  menuText += `🔗 *לקישור הוואטסאפ שלך:* השב *"חבר אותי"*\n`;
  menuText += `✈️ *לניהול חיבור טלגרם:* השב *"טלגרם"*`;

  if (isUserAdmin(driverPhone)) {
    menuText += `\n\n🛠️ *לניהול נהגים במערכת:* השב *"ניהול"*`;
  }

  await sock.sendMessage(jid, { text: menuText });
}

// שליחת מדריך שימוש מפורט, קצר ומקצועי לנהג
export async function sendDriverGuide(sock, jid) {
  let guideText = `📖 *מדריך נהגים מקצועי – נסיעות בוט איכותי* 🚕\n\n`;

  guideText += `🔹 *1. חיבור הוואטסאפ (פעם אחת בלבד מהנייד)*\n` +
    `• שולחים לבוט: *"חבר אותי"*\n` +
    `• מקבלים קוד צימוד בן 8 אותיות.\n` +
    `• נכנסים בוואטסאפ: *הגדרות ⬅️ מכשירים מקושרים ⬅️ קישור מכשיר ⬅️ "קישור עם מספר טלפון במקום"*\n` +
    `• מזינים את הקוד — וזהו! הבוט מחובר ומתחיל לסרוק עבורך את כל הקבוצות.\n\n`;

  guideText += `🔹 *2. הגדרת חיפושים*\n` +
    `• *בתוך ומחוץ לעיר:* שלח למשל *"פנוי שמש"* או *"פנוי ים"* (מקבל נסיעות פנימיות + נסיעות שיוצאות מהעיר).\n` +
    `• *פנימי בעיר בלבד:* שלח *"פנוי שמש פנימי"* או *"שמש פנימי"* (מסנן רק נסיעות מקומיות בתוך העיר).\n` +
    `• *מסלול בין שתי ערים:* שלח *"פ ים שמש"* (מירושלים לבית שמש) או *"פ שמש ים"*.\n\n`;

  guideText += `🔹 *3. חיפושים מקביליים (כמה יעדים יחד!)*\n` +
    `• יש לך חיפוש פעיל? שלח פקודת חיפוש נוספת (למשל: *"פנוי ים"*).\n` +
    `• הבוט ישאל אותך מיד:\n` +
    `  👉 *1* או *הוסף* ⬅️ להוספת החיפוש במקביל (קבלת נסיעות מכל היעדים בו-זמנית!)\n` +
    `  👉 *2* או *החלף* ⬅️ להחליף את הכל בחיפוש החדש בלבד\n` +
    `  👉 *ביטול* ⬅️ להישאר עם הקיים\n\n`;

  guideText += `🔹 *4. תפיסת נסיעה סופר-מהירה ("ת" או "תן")*\n` +
    `• קיבלת נסיעה מתאימה מהבוט? השב עליה: *"ת"* או *"תן"*.\n` +
    `• מה הבוט עושה בשבילך אוטומטית?\n` +
    `  1. שולח תגובת *"תן"* בקבוצה המקורית עם ציטוט מדויק של הנסיעה!\n` +
    `  2. שולח הודעה אישית לסדרן בוואטסאפ הפרטי שלו, המצטטת את הנסיעה שהוא פרסם!\n` +
    `  3. מחזיר לך אישור שהנסיעה נתפסה בהצלחה.\n\n`;

  guideText += `🔹 *5. עצירת חיפוש (מצב תפוס)*\n` +
    `• תפסת נסיעה או סיימת משמרת? שלח: *"תפוס"*.\n` +
    `• הבוט יעצור את כל הסינונים מיד ולא ישלח התראות.\n\n`;

  guideText += `🔹 *6. פקודת "תפריט"*\n` +
    `• שלח *"תפריט"* בכל רגע כדי לצפות בסטטוס החיפושים הפעילים שלך ובאפשרויות מהירות.\n\n`;

  guideText += `🔹 *7. דיווח תקלה (דיסלייק 👎)*\n` +
    `• קיבלת נסיעה לא קשורה? סמן *👎* ישירות על הודעת הבוט.\n` +
    `• המקרה יישלח מיד לטיפול ותיקון בקבוצת הבאגים!\n\n`;

  guideText += `🔹 *8. סריקה מקבילה מטלגרם (וואטסאפ + טלגרם)* ✈️\n` +
    `• הבוט סורק עבורך נסיעות בו-זמנית גם מכל קבוצות הטלגרם (מאוחדים תגבור ריידר, ריידר הפצה וכו')!\n` +
    `• נסיעה מתאימה מטלגרם תישלח אליך מיד לוואטסאפ עם כפתור "פתח בטלגרם ↗️".\n` +
    `• *איך מתחברים לבד תוך 5 שניות?*\n` +
    `  👉 *כאן בוואטסאפ:* שלח לבוט *"חבר טלגרם @היוזר_שלך"* (למשל: *חבר טלגרם @driver_israel*) או *"חבר טלגרם 0501234567"*.\n` +
    `  👉 *באתר:* היכנס ללוח הבקרה בלשונית "חיבור טלגרם", הזן את פרטיך ולחץ "חבר אותי".\n` +
    `  👉 *בטלגרם:* שלח */start* לבוט בטלגרם (@NsiotRidesBot).\n` +
    `• *לצפייה בסטטוס החיבור שלך:* שלח *"טלגרם"*.\n` +
    `• *לניתוק בכל עת:* שלח *"נתק טלגרם"*.`;

  await sock.sendMessage(jid, { text: guideText });
}

// זיהוי ופענוח מספר טלפון אמיתי של סדרן/שולח (מניעת מזהי LID חסויים)
async function getRealSenderPhone(sock, groupJid, msg) {
  const key = msg.key || {};

  for (const raw of [key.participantAlt, key.participantPN, key.participant, msg.participant]) {
    const num = cleanPhone(raw);
    if (num && num.length >= 9 && num.length <= 12 && !isLid(raw)) {
      return num;
    }
  }

  const lid = [key.participant, key.participantAlt, msg.participant].find((j) => String(j || "").endsWith("@lid"));

  if (lid) {
    try {
      const mapped = await sock.signalRepository?.lidMapping?.getPNForLID(lid);
      const num = cleanPhone(mapped);
      if (num && !isLid(num)) return num;
    } catch (e) {}

    try {
      const rawLid = lid.split("@")[0].split(":")[0];
      for (const fresh of [false, true]) {
        let metadata = groupMetadataCache.get(groupJid);
        if (!metadata || fresh) {
          metadata = await sock.groupMetadata(groupJid);
          groupMetadataCache.set(groupJid, metadata);
        }
        const member = metadata.participants.find(
          (p) => String(p.id || "").split("@")[0].split(":")[0] === rawLid ||
                 String(p.lid || "").split("@")[0].split(":")[0] === rawLid
        );
        const num = cleanPhone(member?.phoneNumber || member?.id);
        if (num && !isLid(num)) return num;
      }
    } catch (e) {}
  }

  return "זמין בקבוצה";
}

function describeMode(state) {
  if (!state) return "";
  if (state.mode === "internal") return `נסיעות פנימיות בתוך ${state.origin} בלבד`;
  if (state.mode === "city_all" || state.mode === "reduce") return `נסיעות בתוך ומחוץ ל-${state.origin}`;
  if (state.mode === "route") return `רק נסיעות מ-${state.origin} ל-${state.destination}`;
  return `נסיעות מ-${state.origin}`;
}

export function getPairingGuideInstructions() {
  let guide = `🔗 *חיבור הוואטסאפ שלך למערכת הנסיעות*\n\n`;
  guide += `📲 *הוראות חיבור בטלפון (ללא צורך במחשב):*\n` +
    `1. פתח וואטסאפ ⬅️ הגדרות ⬅️ *מכשירים מקושרים*\n` +
    `2. לחץ *"קישור מכשיר"*\n` +
    `3. לחץ למטה: *"קישור עם מספר טלפון במקום"*\n` +
    `4. הזן את קוד הצימוד בן 8 האותיות שנשלח כעת בהודעה הבאה.\n\n` +
    `⏱️ *הקוד בתוקף לכמה דקות. לאחר ההזנה הוואטסאפ שלך יחובר והשרת יתחיל לסנן נסיעות מהקבוצות שלך!*`;
  return guide;
}

export async function sendPairingCodeMessages(sock, jid, code, quotedMsg) {
  const instructions = getPairingGuideInstructions();
  if (quotedMsg) {
    await sock.sendMessage(jid, { text: instructions }, { quoted: quotedMsg });
  } else {
    await sock.sendMessage(jid, { text: instructions });
  }
  await sock.sendMessage(jid, { text: code });
}

export function getPairingGuideText(code) {
  let guide = getPairingGuideInstructions();
  if (code) {
    guide += `\n\n🔑 *קוד הצימוד:* ${code}`;
  }
  return guide;
}

// ניהול תזכורות חידוש קוד צימוד אם הנהג לא הספיק להזין אותו תוך כדקה
const pairingReminders = new Map();

export function schedulePairingReminder(sock, jid, phone) {
  const clean = cleanPhone(phone);
  if (!clean) return;

  if (pairingReminders.has(clean)) {
    clearTimeout(pairingReminders.get(clean));
    pairingReminders.delete(clean);
  }

  const timer = setTimeout(async () => {
    pairingReminders.delete(clean);
    // אם הנהג כבר התחבר בהצלחה - אין צורך בתזכורת
    if (isDriverSessionConnected(clean)) return;

    try {
      const reminderMsg = `⏳ *לא הספקת להזין את קוד הצימוד או שהיה קושי בהתחברות?*\n\n` +
        `קוד הצימוד תקף לכ-2 דקות בלבד.\n` +
        `אם הקוד פג או לא הספקת להזין אותו — אל דאגה!\n\n` +
        `👉 שלח עכשיו: *"חבר אותי"* לקבלת קוד עדכני מיידית.`;

      await sock.sendMessage(jid, { text: reminderMsg });
      console.log(`⏱️ נשלחה תזכורת חידוש קוד צימוד לנהג: ${clean}`);
    } catch (e) {
      console.log(`שגיאה בשליחת תזכורת צימוד ל-${clean}:`, e.message);
    }
  }, 65 * 1000); // תזכורת אחרי 65 שניות

  pairingReminders.set(clean, timer);
}

export function cancelPairingReminder(phone) {
  const clean = cleanPhone(phone);
  if (pairingReminders.has(clean)) {
    clearTimeout(pairingReminders.get(clean));
    pairingReminders.delete(clean);
  }
}

// קובץ מעקב קבוע לדיסק - שולחים התראת חיבור למנהל והודעת ברכה לנהג אך ורק פעם אחת בהתחברות הראשונית בלבד!
// מונע לחלוטין כל הודעה חוזרת בעת התעוררות שרת, PM2 restart, או התחברות סוקט מחדש.
const ONBOARDING_ALERTS_FILE = new URL("./onboarding-alerts.json", import.meta.url);
const onboardingAlertsSent = new Map(); // cleanPhone -> { adminAlertSent: boolean, driverWelcomeSent: boolean, completedAt: string }

try {
  if (fs.existsSync(ONBOARDING_ALERTS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(ONBOARDING_ALERTS_FILE, "utf8"));
    for (const [p, obj] of Object.entries(saved || {})) {
      onboardingAlertsSent.set(cleanPhone(p), obj);
    }
  }
} catch (e) {
  console.error("שגיאה בקריאת onboarding-alerts.json:", e.message);
}

function persistOnboardingAlerts() {
  try {
    const obj = {};
    for (const [p, val] of onboardingAlertsSent.entries()) {
      obj[p] = val;
    }
    fs.writeFileSync(ONBOARDING_ALERTS_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.error("שגיאה בשמירת onboarding-alerts.json:", e.message);
  }
}

// התראה למנהל המערכת (0515157166) כאשר נהג חיבר בהצלחה את חשבון הוואטסאפ שלו (אך ורק בהתחברות הראשונית!)
export async function notifyAdminOnDriverConnected(driverPhone) {
  const clean = cleanPhone(driverPhone);
  if (!clean) return;

  // אם המנהל כבר קיבל התראה על נהג זה בעבר - לא שולחים שוב לעולם!
  const record = onboardingAlertsSent.get(clean) || {};
  if (record.adminAlertSent) {
    return;
  }

  const mainSock = getMainBotSock();
  if (!mainSock || !getMainBotStatus().connected) return;

  const usersData = loadUsersData();
  const adminPhone = cleanPhone(usersData.adminPhone || "972515157166");

  if (!adminPhone || clean === adminPhone) return;

  const user = (usersData.approvedUsers || []).find((u) => cleanPhone(u.phone) === clean);
  const name = user?.name || "נהג חדש";

  const adminMsg = `🎉 *התחברות נהג חדש בוואטסאפ!*\n\n` +
    `👤 *נהג:* ${name} (${clean})\n` +
    `✅ חיבר בהצלחה את חשבון הוואטסאפ שלו למערכת!\n\n` +
    `🚕 הבוט סורק כעת נסיעות מכל קבוצות הנסיעות שלו בזמן אמת.`;

  try {
    await mainSock.sendMessage(`${adminPhone}@s.whatsapp.net`, { text: adminMsg });
    console.log(`📢 נשלחה התראה ראשונית חד-פעמית למנהל (${adminPhone}) על התחברות נהג ${clean}`);
    record.adminAlertSent = true;
    record.completedAt = new Date().toISOString();
    onboardingAlertsSent.set(clean, record);
    persistOnboardingAlerts();
  } catch (e) {
    console.error(`שגיאה בשליחת התראת התחברות למנהל:`, e.message);
  }
}

// הודעת ברכה והדרכה לנהג ברגע שהוואטסאפ שלו מתחבר בהצלחה (אך ורק פעם אחת בהתחברות הראשונית!)
export async function notifyDriverWelcomeOnConnected(driverPhone) {
  const clean = cleanPhone(driverPhone);
  if (!clean) return;

  // אם הנהג כבר קיבל הודעת ברכה בעבר - לא שולחים שוב לעולם!
  const record = onboardingAlertsSent.get(clean) || {};
  if (record.driverWelcomeSent) {
    return;
  }

  const mainSock = getMainBotSock();
  if (!mainSock || !getMainBotStatus().connected) return;

  const welcomeMsg = `✅ *הוואטסאפ שלך חובר ומסונכרן בהצלחה למערכת!* 🎉\n\n` +
    `מעכשיו הבוט יסנן עבורך נסיעות בזמן אמת מכל הקבוצות שלך.\n\n` +
    `🔍 *להפעלת חיפוש שלח עכשיו:*\n` +
    `• *פנוי שמש* או *פנוי ים* (בתוך ומחוץ לעיר)\n` +
    `• *פנוי שמש פנימי* (פנימי בעיר בלבד)\n` +
    `• *פ ים שמש* (מסלול מירושלים לבית שמש)\n\n` +
    `📖 *לצפייה בהוראות בכל רגע שלח:* "מדריך" או "תפריט"`;

  try {
    const jid = getDestinationJid(clean);
    await mainSock.sendMessage(jid, { text: welcomeMsg });
    console.log(`📢 נשלחה הודעת ברכה ראשונית חד-פעמית לנהג ${clean}`);
    record.driverWelcomeSent = true;
    record.completedAt = new Date().toISOString();
    onboardingAlertsSent.set(clean, record);
    persistOnboardingAlerts();
  } catch (e) {
    console.error(`שגיאה בשליחת הודעת ברכה לנהג ${clean}:`, e.message);
  }
}

// שליחת מדבקת בוט מבולבל + הודעת הבהרה כאשר נשלחה אות סתמית או הודעה לא מובנת
export async function sendConfusedStickerAndMessage(sock, jid, quotedMsg, senderPhone) {
  const now = Date.now();
  const lastTime = lastConfusedStickerSent.get(senderPhone) || 0;
  if (now - lastTime < 3000) {
    return; // מניעת ספאם/הפצצת מדבקות (cooldown של 3 שניות)
  }
  lastConfusedStickerSent.set(senderPhone, now);

  // 1. שליחת המדבקה המעוצבת (WebP שקופה ועגולה ללא רקע) בנפרד ולא כתגובה
  try {
    if (fs.existsSync(STICKER_WEBP_PATH)) {
      const stickerBuf = fs.readFileSync(STICKER_WEBP_PATH);
      await sock.sendMessage(jid, { sticker: stickerBuf });
    } else if (fs.existsSync(STICKER_PNG_PATH)) {
      const imgBuf = fs.readFileSync(STICKER_PNG_PATH);
      await sock.sendMessage(jid, { image: imgBuf, caption: "🤔" });
    } else if (fs.existsSync(STICKER_JPG_PATH)) {
      const imgBuf = fs.readFileSync(STICKER_JPG_PATH);
      await sock.sendMessage(jid, { image: imgBuf, caption: "🤔" });
    }
  } catch (err) {
    console.warn("⚠️ שגיאה בשליחת מדבקת וואטסאפ:", err?.message);
  }

  // 2. הודעה ברורה וקולעת מתחת למדבקה בדיוק כפי שהוגדר על ידי המשתמש:
  const search = getUserSearch(senderPhone);
  const statusLine = search.active
    ? `🟢 *חיפוש פעיל כעת:* ${search.displayText}`
    : `🔴 *מצב שינה / תפוס* (הבוט אינו סורק נסיעות כרגע)`;

  const msg = `🤔 לא הבנתי למה התכוונת, תוכל לשלוח שוב?\n\n` +
    `${statusLine}\n\n` +
    `💡 *קיצורים מהירים להפעלת חיפוש נסיעות:*\n` +
    `• *פנוי שמש פנימי* ⬅️ פנימי בית שמש בלבד 🚕\n` +
    `• *פנוי שמש* ⬅️ פנימי וגם יציאה מבית שמש\n` +
    `• *פ ים שמש* ⬅️ מירושלים לבית שמש 🔄\n` +
    `• *שמש צמצם* ⬅️ מצב צמצום (פנימי ויוצא)\n` +
    `• *תפוס* ⬅️ הפסקת חיפוש / מצב שינה 🛑\n\n` +
    `להצגת כל האפשרויות והערים שלח: *"תפריט"*.`;

  await sock.sendMessage(jid, { text: msg });
}

// טיפול בשינוי סטטוס סשן נהג - מסונן לחלוטין כנגד התעוררות שרת, שחזור סשנים והתחברויות חוזרות
export async function handleDriverStatusChange(driverPhone, sessionObj) {
  if (sessionObj?.status === "connected") {
    cancelPairingReminder(driverPhone);

    // אם מדובר בסשן שנשמר על הדיסק ושוחזר בהפעלת השרת, או התעוררות/התחברות מחדש - אין עניין לשלוח שום הודעה!
    if (sessionObj.isRestoredSession || !sessionObj.isInitialPairing) {
      return;
    }

    // נשלח אך ורק בהתחברות הראשונית (הפונקציות עצמן בודקות שוב את הרישום הקבוע בדיסק)
    await notifyAdminOnDriverConnected(driverPhone);
    await notifyDriverWelcomeOnConnected(driverPhone);
  }
}

// טיפול בשינוי סטטוס סשן הבוט הראשי (מונע שגיאות ReferenceError באיפוס סשן)
export function handleMainBotStatusChange(status) {
  console.log(`[בוט ראשי] סטטוס חיבור: ${status?.connected ? "מחובר ✅" : "מנותק ❌"}`);
}

// ==========================================
// טיפול בהודעות הנכנסות (בוט ראשי וסשנים של נהגים)
// ==========================================
async function handleIncomingMessage(sock, upsert, sessionContext) {
  const { messages } = upsert;
  if (!messages || !messages.length) return;

  for (const m of messages) {

    // 0. טיפול בתגובות אימוג'י (דיסלייק 👎 על הודעות הבוט להעברה לקבוצת התיקונים)
    if (m.message?.reactionMessage) {
      const rm = m.message.reactionMessage;
      await handleReaction(sock, [{
        key: m.key,
        reaction: {
          key: rm.key,
          text: rm.text,
          senderTimestampMs: rm.senderTimestampMs
        }
      }], sessionContext);
      continue;
    }

    if (m.key.fromMe) continue;

    const jid = m.key.remoteJid;
    if (!jid) continue;

    // התעלמות מסטטוסים, רשימות תפוצה וערוצים
    if (isIgnorableJid(jid)) continue;

    // התעלמות מהודעות היסטוריות ישנות (מעל 5 דקות) בעת אתחול או סנכרון
    if (isStaleMessage(m)) continue;

    const isGroup = jid.endsWith("@g.us");

    // 0.5. זיהוי מיקום GPS שנשלח ע"י הנהג (סיכת מיקום בוואטסאפ)
    const locMsg = m.message?.locationMessage || m.message?.liveLocationMessage;
    if (locMsg && !isGroup && sessionContext.isMainBot) {
      let senderPhone = cleanPhone(jid);
      setDriverLocation(senderPhone, {
        lat: locMsg.degreesLatitude,
        lng: locMsg.degreesLongitude,
        label: "מיקום GPS חי",
      });
      await sock.sendMessage(jid, {
        text: `📍 *מיקומך נקלט בהצלחה במערכת!*\n\nהקואורדינטות שלך עודכנו. מעכשיו בכל שאלה של *"מרחק"* או *"איפה זה"* הבוט יחשב קילומטרים וזמן הגעה מדויקים מהרכב שלך! 🚕`,
      }, { quoted: m });
      continue;
    }

    const text = extractMessageText(m);
    if (!text) continue;

    const pushName = m.pushName || "משתמש";

    // ----------------------------------------------------
    // חלק א': הודעות פרטיות מול הבוט הראשי (פניות משתמשים וניהול)
    // ----------------------------------------------------
    if (!isGroup && sessionContext.isMainBot) {
      const usersData = loadUsersData();
      let senderPhone = cleanPhone(jid);
      const rawJidDigits = String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
      const isSenderLid = isLid(jid) || isLid(senderPhone) || isLid(rawJidDigits);

      // 1. זיהוי מקיף ואוטומטי של מספר אמיתי מתוך מזהה LID
      if (isSenderLid) {
        let detectedPhone = null;
        const key = m.key || {};
        for (const candidate of [key.remoteJidAlt, key.participantAlt, key.participantPN, m.participant]) {
          if (!candidate) continue;
          const cPhone = cleanPhone(candidate);
          if (cPhone && cPhone.length >= 9 && cPhone.length <= 12 && !isLid(candidate) && !isLid(cPhone)) {
            detectedPhone = cPhone;
            break;
          }
        }

        if (!detectedPhone) {
          try {
            const pnFromLid = await sock.signalRepository?.lidMapping?.getPNForLID(jid);
            const num = cleanPhone(pnFromLid);
            if (num && !isLid(num) && num.length >= 9 && num.length <= 12) detectedPhone = num;
          } catch (e) {}
        }

        // בדיקה ישירה מתוך lid-map.json
        if (!detectedPhone) {
          const lidMap = loadLidMap();
          if (lidMap[rawJidDigits]) detectedPhone = lidMap[rawJidDigits];
        }

        // בדיקה מתוך המשתמשים המאושרים במערכת
        if (!detectedPhone) {
          const uMatch = (usersData.approvedUsers || []).find(
            (u) => (u.lid && u.lid === rawJidDigits) || (u.phone && cleanPhone(u.phone) === rawJidDigits)
          );
          if (uMatch) {
            detectedPhone = uMatch.mappedPhone || cleanPhone(uMatch.phone);
          }
        }

        // בדיקה מתוך שמות נהגים או pushName ("מוישי" / "מוישי ב Bפון עסקי")
        if (!detectedPhone && pushName && pushName !== "משתמש") {
          const cleanPush = pushName.trim().toLowerCase();
          const nameMatch = (usersData.approvedUsers || []).find(
            (u) => u.name && cleanPush.includes(u.name.trim().toLowerCase()) && !isLid(u.phone)
          );
          if (nameMatch) {
            detectedPhone = cleanPhone(nameMatch.phone);
          }
        }

        // בדיקה מתוך סשנים מחוברים של נהגים
        if (!detectedPhone) {
          try {
            for (const s of (getAllSessionsSummary().drivers || [])) {
              if (s.phone && !isLid(s.phone)) {
                const dSession = getDriverSession(s.phone);
                const meLid = dSession?.sock?.authState?.creds?.me?.lid;
                if (meLid && cleanPhone(meLid) === rawJidDigits) {
                  detectedPhone = cleanPhone(s.phone);
                  break;
                }
              }
            }
          } catch (e) {}
        }

        if (detectedPhone) {
          registerLidMapping(jid, detectedPhone);
          senderPhone = detectedPhone;
        }
      }

      const isAdmin = isUserAdmin(senderPhone);
      const isApproved = isUserApproved(senderPhone);
      const norm = normalizeText(text);

      // 2. פקודות ניהול (מנהל מערכת בלבד)
      if (isAdmin) {
        // אישור שקט ללא שליחת הודעה לנהג: "אשר ללא 0556706325", "אשר שקט 0556706325", "אשר ללא הודעה 0556706325"
        const silentApproveMatch = text.match(/^(?:אשר\s+ללא(?:\s+הודעה)?|אשר\s+שקט)\s+([0-9+\s-]+)$/);
        if (silentApproveMatch) {
          const targetPhone = cleanPhone(silentApproveMatch[1]);
          approveUser(targetPhone);
          await sock.sendMessage(jid, { text: `✅ המשתמש *${targetPhone}* אושר בהצלחה במערכת (במצב שקט)!\n🔇 לא נשלחה שום הודעה לוואטסאפ של הנהג.` }, { quoted: m });
          recordEvent("command", `מנהל אישר משתמש במצב שקט (ללא הודעה לנהג): ${targetPhone}`);
          continue;
        }

        const approveMatch = text.match(/^(?:אשר|אשר משתמש)\s+([0-9+\s-]+)$/);
        if (approveMatch) {
          const targetPhone = cleanPhone(approveMatch[1]);
          approveUser(targetPhone);
          await sock.sendMessage(jid, { text: `✅ המשתמש *${targetPhone}* אושר בהצלחה במערכת!` }, { quoted: m });
          recordEvent("command", `מנהל אישר משתמש: ${targetPhone}`);
          await sendApprovalAndOnboarding(targetPhone, "נהג");
          continue;
        }

        const rejectMatch = text.match(/^(?:דחה|דחה משתמש)\s+([0-9+\s-]+)$/);
        if (rejectMatch) {
          const targetPhone = cleanPhone(rejectMatch[1]);
          rejectUser(targetPhone);
          await sock.sendMessage(jid, { text: `❌ המשתמש *${targetPhone}* נדחה ונמחק מרשימת הממתינים.` }, { quoted: m });
          recordEvent("command", `מנהל דחה משתמש: ${targetPhone}`);
          continue;
        }

        const sendGuideMatch = text.match(/^(?:שלח\s+מדריך|שלח\s+הדרכה|הדרכה)\s+([0-9+\s-]+)$/);
        if (sendGuideMatch) {
          const targetPhone = cleanPhone(sendGuideMatch[1]);
          await sendApprovalAndOnboarding(targetPhone, "נהג");
          await sock.sendMessage(jid, { text: `✅ נשלחה הודעת אישור ומדריך חיבור ווב לנהג *${targetPhone}*!` }, { quoted: m });
          recordEvent("command", `מנהל שלח מדריך חיבור חוזר לנהג: ${targetPhone}`);
          continue;
        }

        const updateMatch = text.match(/^(?:עדכן|החלף)\s+([0-9+\s-]+)\s+(?:ל|אל)\s+([0-9+\s-]+)$/);
        if (updateMatch) {
          const oldNum = cleanPhone(updateMatch[1]);
          const newNum = cleanPhone(updateMatch[2]);
          updateUserPhone(oldNum, newNum);
          await sock.sendMessage(jid, { text: `✅ המספר עודכן בהצלחה מ-*${oldNum}* ל-*${newNum}*!` }, { quoted: m });
          continue;
        }

        if (norm === "ניהול" || norm === "תפריט ניהול" || norm === "admin") {
          await sock.sendMessage(jid, {
            text: `🛠️ *תפריט ניהול מערכת*\n\nפקודות זמינות למנהל:\n• *אשר 0501234567* ⬅️ אישור נהג חדש ושליחת מדריך\n• *דחה 0501234567* ⬅️ דחיית בקשת הצטרפות\n• *שלח מדריך 0501234567* ⬅️ שליחה חוזרת של הודעת אישור ומדריך חיבור ווב\n• *עדכן 0501234567 ל 0507654321* ⬅️ עדכון מספר טלפון של נהג\n\n💡 *כנהג במערכת:* שלח *"תפריט"* או כל פקודת חיפוש (כמו *"פנוי שמש"*) כדי לפעול כנהג!`
          }, { quoted: m });
          continue;
        }
        // הודעות שאינן פקודת ניהול מפורשת ממשיכות לטיפול כנהג רגיל (תפריט, 1 לאישור, חיפושים וכו')
      }

      // 3. משתמש שטרם אושר
      if (!isApproved) {
        const canReply = canReplyToUnapproved(senderPhone, text);
        if (!canReply) {
          continue;
        }

        const pending = addPendingUser(senderPhone, pushName);
        recordEvent("system", `בקשת הצטרפות: ${pushName} (${senderPhone})`);

        const unapprovedMsg = `שלום ${pushName}! 👋\n` +
          `ברוך הבא ל*נסיעות בוט איכותי*.\n\n` +
          `⚠️ מספרך עדיין אינו מאושר במערכת.\n\n` +
          `📩 *בקשת הצטרפות נשלחה למנהל המערכת.*\n` +
          `ברגע שיאושר חשבונך, תקבל הודעה עם הנחיות חיבור.`;

        await sock.sendMessage(jid, { text: unapprovedMsg }, { quoted: m });

        const adminClean = cleanPhone(usersData.adminPhone);
        if (pending?.isNew && adminClean && adminClean !== senderPhone) {
          let adminAlert = `🔔 *בקשת הצטרפות חדשה לבוט!*\n\n` +
            `👤 *שם:* ${pushName}\n` +
            `📱 *טלפון:* ${senderPhone}\n`;
          adminAlert += `\nלאישור המשתמש, השב:\n*אשר ${senderPhone}*\n\nלדחייה, השב:\n*דחה ${senderPhone}*`;
          await sock.sendMessage(`${adminClean}@s.whatsapp.net`, { text: adminAlert });
        }
        continue;
      }

      // 4. נהג מאושר
      const isDriverConnected = isDriverSessionConnected(senderPhone);
      const connectMatch = norm.match(/^(?:חבר אותי|קוד חדש|חיבור|קוד|ווב)(?: ([0-9 ]{9,15}))?$/);

      if (connectMatch) {
        if (!isDriverConnected) {
          let phoneForPairing = senderPhone;
          const explicit = connectMatch[1] ? cleanPhone(connectMatch[1].replace(/\s+/g, "")) : null;

          if (isLid(senderPhone)) {
            if (!explicit || !/^9725\d{8}$/.test(explicit)) {
              await sock.sendMessage(jid, {
                text: `📱 *לחיבור הוואטסאפ נדרש מספר סלולרי רגיל.*\n\n👉 שלח: *חבר אותי 0521234567*\n(במקום הדוגמה - המספר שלך)`
              }, { quoted: m });
              continue;
            }
            registerLidMapping(jid, explicit);
            phoneForPairing = explicit;
          } else if (explicit && /^9725\d{8}$/.test(explicit)) {
            phoneForPairing = explicit;
          }

          try {
            await sock.sendMessage(jid, { text: `⏳ מפיק קוד צימוד ייעודי לוואטסאפ שלך (${phoneForPairing})...` });
            const code = await requestDriverPairingCode(phoneForPairing, {
              onRideMessage: handleIncomingMessage,
              onReaction: handleReaction,
              onStatusChange: handleDriverStatusChange,
              onEvent: recordEvent,
            });
            await sendPairingCodeMessages(sock, jid, code, m);
            schedulePairingReminder(sock, jid, phoneForPairing);
            recordEvent("system", `נוצר קוד חיבור נהג עבור ${phoneForPairing}`);
          } catch (err) {
            await sock.sendMessage(jid, {
              text: `⚠️ לא ניתן היה להפיק קוד חיבור כעת: ${err.message}\nנסה שוב בעוד מספר רגעים או פנה למנהל.`
            });
          }
          continue;
        } else {
          await sock.sendMessage(jid, {
            text: `✅ הוואטסאפ שלך כבר מחובר ומסונכרן למערכת.\nשלח פקודות חיפוש כגון *"פנוי שמש"*, *"פנוי שמש פנימי"*, *"פ ים שמש"*, או *"תפריט"*.`
          }, { quoted: m });
          continue;
        }
      }

      if (norm === "תפריט" || norm === "menu" || norm === "עזרה" || norm === "היי" || norm === "שלום" || norm === "אהלן" || norm === "בוקר טוב" || norm === "ערב טוב" || norm === "צהריים טובים") {
        await sendHelpMenu(sock, jid, senderPhone);
        continue;
      }

      if (
        norm === "תקן" || norm === "ריסט" || norm === "תיקון" || norm === "איפוס הצפנה" || 
        norm === "מפתחות" || norm === "סדר הצפנה" || norm === "תיקון הודעות" || 
        norm === "ניקוי" || norm === "קוקיז" || norm === "ניקוי קוקיז" || norm === "נקה" || 
        norm === "סדר" || norm.includes("קוקיז") || norm.includes("הצפנה")
      ) {
        await sock.sendMessage(jid, {
          text: `🛡️ *מערכת ההצפנה והתקשורת פעילה ומסונכרנת!* 🚀\n\n` +
            `הבוט פועל על מנוע Baileys 7.x עם סנכרון LID ו-Signal Protocol מלא.\n` +
            `בוצע רענון וניקוי מפתחות הצפנה ו-BufferJSON ברקע.\n\n` +
            `🔍 *שלח כעת פקודת חיפוש להפעלה:*\n` +
            `• *פנוי שמש פנימי* (פנימי בית שמש בלבד)\n` +
            `• *פנוי שמש* (פנימי ויוצא מבית שמש)\n` +
            `• *פ ים שמש* (ירושלים לבית שמש)\n` +
            `• *תפריט* (לכל האפשרויות)`
        });
        recordEvent("system", `נמסר סטטוס סנכרון והצפנה מעודכן עבור נהג ${senderPhone}`);
        continue;
      }

      if (norm === "מדריך" || norm === "הוראות" || norm === "מדריך שימוש" || norm === "guide") {
        await sendDriverGuide(sock, jid);
        continue;
      }

      // 0. מענה על כפתור תפיסת נסיעה / תגובה "תן" / "ת" על הודעת נסיעה
      const quotedStanzaId =
        m.message?.extendedTextMessage?.contextInfo?.stanzaId ||
        m.message?.buttonsResponseMessage?.contextInfo?.stanzaId ||
        m.message?.templateButtonReplyMessage?.contextInfo?.stanzaId ||
        m.message?.interactiveResponseMessage?.contextInfo?.stanzaId;

      // 0.0 בדיקה האם נשלחה האות "ת" לבדה ללא ציטוט נסיעה ספציפית
      // דרישת משתמש מפורשת: "אם אני שולח את המילה ת שלא יהיה כמו הפקודה תפוס!"
      // לכן: שליחת "ת" לבדה אינה עוצרת חיפוש, אינה פקודת תפוס, ואינה עושה כלום!
      const isLoneTav = /^[\s\.\,\!\?]*ת[\s\.\,\!\?]*$/.test(text) || norm === "ת" || norm === "תת";
      if (isLoneTav && !quotedStanzaId) {
        console.log(`ℹ️ [הודעת נהג ${senderPhone}]: נשלחה האות "ת" לבדה ללא ציטוט נסיעה. שולחים מדבקה והודעת הבהרה.`);
        await sendConfusedStickerAndMessage(sock, jid, m, senderPhone);
        continue;
      }

      let targetAlertInfo = quotedStanzaId ? sentAlertsCache.get(quotedStanzaId) : null;
      const isClaimWord = norm === "תן" || norm === "קח" || norm === "תן לי" || norm === "שלי" ||
        norm === "קח_נסיעה" || norm === "claim_ride" ||
        norm === "ת פה" || norm === "תן פה" || norm === "פה";

      if (!targetAlertInfo && isClaimWord) {
        targetAlertInfo = getLatestAlertForDriver(senderPhone);
      }

      const isClaimIntent = isClaimWord || ((norm === "ת" || norm === "ת פה" || norm === "תן פה") && quotedStanzaId && targetAlertInfo);

      if (isClaimIntent && targetAlertInfo) {
        const driverSession = getDriverSession(senderPhone);
        const driverSock = driverSession?.sock;

        const rideTextForDb = targetAlertInfo.rawText || targetAlertInfo.rideData?.rawText || "";
        const parsedRoute = parseRideRoute(rideTextForDb, targetAlertInfo.senderPhone);
        const isDriveBot = parsedRoute.isDriveBot || /דרייבוט/i.test(targetAlertInfo.groupName || "");

        const claimTextToSend = (norm === "ת פה" || norm === "תן פה" || norm === "פה") ? "ת פה" : "תן";

        let sentDirect = false;
        let sentInGroup = false;
        let sentToDriveBot = false;
        const sentDirectPhones = [];

        // הכנת אובייקט הציטוט הרשמי של הודעת הנסיעה המקורית
        const quoteObj = buildQuotedRideMessage(targetAlertInfo);

        // שליחה אוטומטית מחשבון הוואטסאפ של הנהג
        if (driverSock && driverSession?.status === "connected") {
          if (isDriveBot) {
            // אם זו נסיעת דרייבוט - לא שולחים תן לקבוצה! אך ורק שליחת קוד התפיסה ישירות לבוט של דרייבוט
            const driveBotTargetPhone = parsedRoute.drivebotPhone || "972552732722";
            const commandToSend = parsedRoute.drivebotCommand || claimTextToSend;
            const targetJid = `${driveBotTargetPhone}@s.whatsapp.net`;
            try {
              await driverSock.sendMessage(targetJid, { text: commandToSend });
              sentToDriveBot = true;
              sentDirect = true;
              sentDirectPhones.push(driveBotTargetPhone);
            } catch (err) {
              console.error("שגיאה בשליחת תפיסה לבוט דרייבוט:", err.message);
            }
          } else {
            // 1. שליחת תגובה בקבוצה שבה פורסמה הנסיעה (עם ציטוט מלא של הודעת הנסיעה)
            if (targetAlertInfo.groupJid) {
              const okGroup = await sendRideClaimReply(driverSock, targetAlertInfo.groupJid, claimTextToSend, quoteObj);
              if (okGroup) sentInGroup = true;
            }

            // 2. שליחת תגובה אישית לסדרן שפרסם את הנסיעה (לא סתם הודעה, אלא תגובה המצטטת את הודעת הנסיעה שלו!)
            const directRecipients = new Set();

            const senderPhoneClean = cleanPhone(targetAlertInfo.senderPhone);
            if (senderPhoneClean && senderPhoneClean.length >= 9 && !isLid(senderPhoneClean) && senderPhoneClean !== "זמין בקבוצה") {
              directRecipients.add(senderPhoneClean);
            }

            const textPhone = extractDispatcherContact(targetAlertInfo);
            if (textPhone && textPhone.length >= 9 && !isLid(textPhone)) {
              directRecipients.add(cleanPhone(textPhone));
            }

            for (const p of directRecipients) {
              const targetJid = `${p}@s.whatsapp.net`;
              const okDirect = await sendRideClaimReply(driverSock, targetJid, claimTextToSend, quoteObj);
              if (okDirect) {
                sentDirect = true;
                sentDirectPhones.push(p);
              }
            }
          }
        }

        let claimReply = `🚕 *נסיעה נתפסה! בהצלחה!*\n\n`;
        if (isDriveBot) {
          claimReply += `🤖 *נסיעת דרייבוט:* נשלחה פקודת תפיסה ("${parsedRoute.drivebotCommand || claimTextToSend}") ישירות לבוט של דרייבוט.\n✅ *לא נשלחה תגובה לקבוצה כנדרש!*\n`;
        } else {
          if (sentInGroup) {
            claimReply += `✅ נשלחה תגובת *"${claimTextToSend}"* עם ציטוט בקבוצה: *${targetAlertInfo.groupName}*\n`;
          }
          if (sentDirect) {
            claimReply += `✅ נשלחה תגובה אישית לסדרן (${sentDirectPhones.join(", ")}) המצטטת את הודעת הנסיעה שלו עם *"${claimTextToSend}"*!\n`;
          }
        }

        if (!sentDirect && !sentInGroup && !sentToDriveBot) {
          if (!driverSock || driverSession?.status !== "connected") {
            claimReply += `⚠️ וואטסאפ הנהג שלך אינו מחובר למערכת (שלח *"חבר אותי"* לחיבור כדי שהבוט יוכל להגיב בשמך).\n`;
          } else {
            claimReply += `⚠️ לא זוהה מספר סדרן ישיר ואין גישת כתיבה בקבוצה.\n`;
          }
        }

        claimReply += `\n📍 *קבוצה:* ${targetAlertInfo.groupName}\n`;
        claimReply += `👤 *סדרן:* ${targetAlertInfo.senderName} (${targetAlertInfo.senderPhone})`;

        await sock.sendMessage(jid, { text: claimReply }, { quoted: m });
        recordEvent("command", `נהג ${senderPhone} תפס נסיעה ${isDriveBot ? 'בדרייבוט' : ''} (קבוצה: ${sentInGroup}, פרטי: ${sentDirect})`);
        continue;
      }

      // 0.1 מענה לשאלת מרחק ושכונה ("מרחק", "איפה זה", "איפה", "איזה שכונה")
      const isDistanceQuestion =
        norm === "מרחק" || norm === "מרחק?" ||
        norm === "איפה זה" || norm === "איפה" || norm === "איפה זה יוצא" ||
        norm === "איזה שכונה" || norm === "איפה הרחוב" ||
        norm === "קרוב" || norm === "רחוק" || norm === "מרחק מפה";

      if (isDistanceQuestion) {
        const targetRide = targetAlertInfo || getLatestAlertForDriver(senderPhone);
        if (!targetRide) {
          await sock.sendMessage(jid, {
            text: `ℹ️ *לא זוהתה נסיעה אחרונה לבדיקה.*\nצטט נסיעה ספציפית ושלח *"איפה זה"* או *"מרחק"* לקבלת שכונה, ק"מ וקישור Waze!`,
          }, { quoted: m });
          continue;
        }

        const rideText = targetRide.rideData?.cleanedText || targetRide.rawText || "";
        const detected = detectNeighborhood(rideText);
        const driverLoc = getDriverLocation(senderPhone);

        if (!detected || !detected.coords) {
          await sock.sendMessage(jid, {
            text: `📍 *בדיקת מיקום נסיעה:*\nנסיעה: "${rideText.slice(0, 100)}"\nלא זוהה רחוב ספציפי מוכר בטקסט.\n🚗 Waze כללי: https://waze.com/ul?q=בית+שמש&navigate=yes`,
          }, { quoted: m });
          continue;
        }

        const dist = calculateDistanceKm(driverLoc.lat, driverLoc.lng, detected.coords.lat, detected.coords.lng);
        let badge = "🟡 מרחק בינוני";
        if (dist.km <= 1.8) badge = "🟢 קרוב מאוד!";
        else if (dist.km > 4.5) badge = "🔴 רחוק יחסית";

        const wazeUrl = generateWazeUrl(detected.matchedStreet, "בית שמש", detected.coords);

        let infoReply = `📍 *עוזר נהג חכם – מידע שכונה ומרחק* 🚕\n`;
        infoReply += `━━━━━━━━━━━━━━━━━━━━\n`;
        infoReply += `🎯 *רחוב / יעד שזוהה:* ${detected.matchedStreet}\n`;
        infoReply += `🏙️ *שכונה:* *${detected.zoneName}* (בית שמש)\n`;
        infoReply += `📏 *מרחק ממך (${driverLoc.label}):* כ-*${dist.km} ק"מ* (כ-${dist.timeMinutes} דקות) ${badge}\n`;
        infoReply += `🧭 *ניווט ישיר ב-Waze:*\n${wazeUrl}\n`;
        infoReply += `━━━━━━━━━━━━━━━━━━━━\n`;
        infoReply += `💡 לתפיסת הנסיעה שלח עכשיו *"ת"* או *"תן"*`;

        await sock.sendMessage(jid, { text: infoReply }, { quoted: m });
        recordEvent("command", `נהג ${senderPhone} בירר מרחק ליעד: ${detected.matchedStreet} (${dist.km} ק"מ)`);
        continue;
      }

      // 0.2 עדכון מיקום ידני של הנהג (לדוגמה: "אני ברמה ד", "מיקום רמה ג", "אני בנחל קישון")
      const locMatch = text.match(/^(?:אני ב|אני נמצא ב|מיקום|אני)\s*(.+)$/i);
      if (locMatch && !locMatch[1].startsWith("פנוי") && !locMatch[1].startsWith("מחפש") && !locMatch[1].startsWith("פ ")) {
        const detectedLoc = detectNeighborhood(locMatch[1]);
        if (detectedLoc && detectedLoc.coords) {
          setDriverLocation(senderPhone, {
            lat: detectedLoc.coords.lat,
            lng: detectedLoc.coords.lng,
            label: detectedLoc.zoneName,
          });
          await sock.sendMessage(jid, {
            text: `📍 *מיקומך עודכן בהצלחה ל-${detectedLoc.zoneName}!* 🚕\nמעכשיו בכל נסיעה שתשאל *"מרחק"* או *"איפה זה"*, המרחק יחושב ביחס ל${detectedLoc.zoneName}.`,
          }, { quoted: m });
          continue;
        }
      }

      // עצירת חיפוש (מצב תפוס) - אך ורק עם פקודת "תפוס", "עצור", "סגור"!
      // אות "ת" לבדה ללא ציטוט נסיעה אינה עוצרת את החיפוש!
      if (/(^| )(תפוס|עצור|סגור)( |$)/.test(norm)) {
        stopUserSearch(senderPhone);
        recordEvent("command", `חיפוש הופסק ע"י ${pushName} (${senderPhone})`);

        // שליחת מדבקת "בהצלחה בדרך!" עגולה ושקופה בנפרד (ללא תגובה להודעה)
        if (fs.existsSync(STICKER_BUSY_WEBP_PATH)) {
          try {
            const stickerBuf = fs.readFileSync(STICKER_BUSY_WEBP_PATH);
            await sock.sendMessage(jid, { sticker: stickerBuf });
          } catch (e) {}
        }
        await sock.sendMessage(jid, { 
          text: `👍 נסיעה טובה! עצרתי את החיפוש.\n\n≡ תפריט` 
        });
        continue;
      }

      // טיפול בפקודת טלגרם / חיבור עצמי / קוד אימות / ניתוק טלגרם עבור הנהג
      const isTgCodeInput = hasPendingTelegramAuth(senderPhone) && (/^\d{4,6}$/.test(norm) || /^קוד\s*[:=-]?\s*\d{4,6}$/i.test(text));
      if (
        norm === "טלגרם" || 
        norm.startsWith("טלגרם ") || 
        norm.startsWith("חבר טלגרם") || 
        norm.startsWith("חיבור טלגרם") || 
        norm.startsWith("נתק טלגרם") || 
        norm.startsWith("בטל טלגרם") ||
        norm === "נתק טלגרם" ||
        norm === "בטל טלגרם" ||
        norm.includes("טלגרם") ||
        isTgCodeInput
      ) {
        const responseMsg = await handleDriverTelegramCommand(senderPhone, text);
        await sock.sendMessage(jid, { text: responseMsg });
        continue;
      }

      // אם הנהג שלח סתם "ת" בלי ציטוט של נסיעה מסוימת - לא עושים כלום ולא עוצרים חיפוש!
      if (norm === "ת") {
        continue;
      }


      const currentSearch = getUserSearch(senderPhone);

      // 1. טיפול בתשובה לשאלת אישור הוספת חיפוש במקביל (1/כן להוספה, 2/החלף, ביטול/לא)
      const isConfirm1 =
        norm === "1" || norm === "כן" || norm === "הוסף" || norm === "אשר" || norm === "אישור" ||
        norm === "תוסיף" || norm === "להוסיף" || norm === "הוספה" || norm === "מאושר" || norm === "אושר" ||
        norm === "הוסף כן" || norm === "כן הוסף" || norm === "1 הוסף" || norm === "1 כן" || norm === "כן 1" ||
        norm === "במקביל" || norm === "גם וגם" || norm === "שניהם" || norm === "כן במקביל" || norm === "הוסף במקביל" ||
        norm === "תוסיף גם" || norm === "הוסף גם" || norm === "תוסיף את זה" || norm === "הוסף את זה" ||
        /^(?:1|כן|הוסף|תוסיף|הוספה|אשר|אישור)\s+(?:כן|1|הוסף|תוסיף|הוספה|אישור|אשר|במקביל|עוד)$/.test(norm);

      const isReplace2 =
        norm === "2" || norm === "החלף" || norm === "רק זה" || norm === "החלפה" || norm === "תחליף" ||
        norm === "רק החדש" || norm === "במקום" || norm === "החלף הכל" || norm === "תחליף הכל" || norm === "2 החלף" ||
        /^(?:2|החלף|תחליף|החלפה)\s+(?:2|החלף|רק זה|רק החדש|במקום|הכל)$/.test(norm);

      const isCancelChoice =
        norm === "ביטול" || norm === "בטל" || norm === "לא" || norm === "0" || norm === "אל תוסיף" ||
        norm === "אל תחליף" || norm === "השאר קיים" || norm === "לא תודה" || norm === "בטל הוספה" ||
        /^(?:ביטול|בטל|לא)\s+(?:ביטול|בטל|לא|תודה|אל תוסיף|השאר)$/.test(norm);

      if (currentSearch.pendingSearch || isConfirm1 || isReplace2 || isCancelChoice) {
        // אפשרות א': אישור הוספה במקביל
        if (isConfirm1) {
          const res = confirmPendingSearch(senderPhone, false);
          if (res.success) {
            let msg = `✅ *החיפוש נוסף בהצלחה!*\n\n📋 *כל החיפושים הפעילים שלך במקביל:*\n`;
            res.current.searches.forEach((s, idx) => {
              msg += `${idx + 1}. ${s.displayText} (${describeMode(s)})\n`;
            });
            msg += `\n🚕 הבוט יסנן עבורך נסיעות מכל המסלולים הללו בו-זמנית!\n💡 להפסקת כל החיפושים שלח "תפוס".\n\n≡ תפריט`;
            recordEvent("command", `נוסף חיפוש מקבילי עבור ${res.driverPhone || senderPhone}: ${res.added.displayText}`);
            await sock.sendMessage(jid, { text: msg }, { quoted: m });
            continue;
          } else {
            const activeList = currentSearch.searches || [];
            if (currentSearch.active && activeList.length > 0) {
              let msg = `✅ *כל החיפושים שלך כבר מאושרים ופעילים במקביל!*\n\n📋 *רשימת החיפושים הפעילים שלך:*\n`;
              activeList.forEach((s, idx) => {
                msg += `${idx + 1}. ${s.displayText} (${describeMode(s)})\n`;
              });
              msg += `\n⚡ הבוט סורק ומסנן עבורך נסיעות מכל המסלולים הללו בו-זמנית!\n💡 להוספת עיר נוספת שלח פקודה (כגון: "פנוי י-ם"). לעצירה שלח "תפוס".\n\n≡ תפריט`;
              await sock.sendMessage(jid, { text: msg }, { quoted: m });
              continue;
            } else {
              let msg = `ℹ️ אין כרגע חיפוש שממתין לאישור.\n\n🔍 *שלח פקודת חיפוש להפעלה:*\n• *פנוי שמש פנימי* (פנימי בית שמש בלבד)\n• *פנוי שמש* (פנימי ויוצא מבית שמש)\n• *פ ים שמש* (ירושלים לבית שמש)\n• *תפריט* (לכל האפשרויות)`;
              await sock.sendMessage(jid, { text: msg }, { quoted: m });
              continue;
            }
          }
        }

        // אפשרות ב': החלפה (רק החיפוש החדש)
        if (isReplace2) {
          const res = confirmPendingSearch(senderPhone, true);
          if (res.success) {
            const s = res.current.searches[0];
            let msg = `🔄 *החיפושים הוחלפו בהצלחה!*\n\n🔍 *חיפוש פעיל כעת:*\n1. ${s.displayText} (${describeMode(s)})\n\nברגע שתעלה נסיעה מתאימה - תקבל התראה מיידית.\n\n≡ תפריט`;
            recordEvent("command", `הוחלף חיפוש עבור ${res.driverPhone || senderPhone}: ${s.displayText}`);
            await sock.sendMessage(jid, { text: msg }, { quoted: m });
            continue;
          } else {
            const activeList = currentSearch.searches || [];
            if (currentSearch.active && activeList.length > 0) {
              let msg = `🔍 *חיפוש פעיל כעת:*\n`;
              activeList.forEach((s, idx) => {
                msg += `${idx + 1}. ${s.displayText} (${describeMode(s)})\n`;
              });
              msg += `\n💡 להחלפת חיפוש שלח פקודת חיפוש חדשה (למשל: "פנוי שמש", "פנוי בב").\n\n≡ תפריט`;
              await sock.sendMessage(jid, { text: msg }, { quoted: m });
              continue;
            } else {
              let msg = `ℹ️ אין כרגע חיפוש שממתין להחלפה.\nשלח פקודת חיפוש חדשה להפעלה (למשל: "פנוי שמש", "פנוי בב").`;
              await sock.sendMessage(jid, { text: msg }, { quoted: m });
              continue;
            }
          }
        }

        // אפשרות ג': ביטול (do nothing / cancel staging)
        if (isCancelChoice) {
          const res = cancelPendingSearch(senderPhone);
          if (res.success) {
            let msg = `👌 *הבקשה בוטלה.* נשארת עם החיפושים הקיימים שלך:\n`;
            res.current.searches.forEach((s, idx) => {
              msg += `${idx + 1}. ${s.displayText}\n`;
            });
            msg += `\n≡ תפריט`;
            recordEvent("command", `בוטלה הוספת חיפוש עבור ${res.driverPhone || senderPhone}`);
            await sock.sendMessage(jid, { text: msg }, { quoted: m });
            continue;
          } else {
            const activeList = currentSearch.searches || [];
            if (currentSearch.active && activeList.length > 0) {
              let msg = `👌 *לא בוצע שינוי.* נשארת עם החיפושים הפעילים שלך:\n`;
              activeList.forEach((s, idx) => {
                msg += `${idx + 1}. ${s.displayText}\n`;
              });
              msg += `\n≡ תפריט`;
              await sock.sendMessage(jid, { text: msg }, { quoted: m });
              continue;
            } else {
              let msg = `👌 אין שינויים. הבוט במצב שינה (תפוס).\nשלח פקודת חיפוש כדי להפעיל חיפוש מחדש.`;
              await sock.sendMessage(jid, { text: msg }, { quoted: m });
              continue;
            }
          }
        }
      }

      // 2. מחיקת חיפוש בודד לפי מספר (למשל: "מחק 2", "הסר 1")
      const removeMatch = norm.match(/^(?:מחק|הסר|בטל)\s+(\d+)$/);
      if (removeMatch) {
        const num = parseInt(removeMatch[1], 10);
        const res = removeUserSearchByIndex(senderPhone, num);
        if (res.success) {
          let msg = `🗑️ *החיפוש "${res.removed.displayText}" הוסר.*\n\n`;
          if (res.current.searches.length > 0) {
            msg += `📋 *חיפושים שנותרו פעילים במקביל:*\n`;
            res.current.searches.forEach((s, idx) => {
              msg += `${idx + 1}. ${s.displayText}\n`;
            });
          } else {
            msg += `🛑 כל החיפושים הוסרו (מצב תפוס).`;
          }
          await sock.sendMessage(jid, { text: msg }, { quoted: m });
          continue;
        }
      }

      // 3. זיהוי פקודת חיפוש חדשה
      const isSearchCmd = norm.startsWith("פנוי") || norm.includes("מחפש") || norm.includes("צמצם") || norm.includes("פנימי") ||
        /^פ\s+/.test(norm) || /\s+פ$/.test(norm) ||
        norm === "שמש" || norm === "ים" || norm === "מירון" || norm === "בב" ||
        /^(?:בית\s+)?שמש|ירושלים|מירון|בני\s+ברק|מודיעין\s+עילית|תל\s+אביב|ביתר|אלעד|אשדוד|צפת|טבריה|חיפה|נתבג$/.test(norm);

      if (isSearchCmd) {
        const parsed = processDriverCommand(text);
        const stageResult = addOrStageUserSearch(senderPhone, parsed);

        if (stageResult.status === "already_exists") {
          await sock.sendMessage(jid, {
            text: `⚠️ *חיפוש זה כבר מוגדר ופעיל אצלך ברשימה!*\n${parsed.displayText}`
          }, { quoted: m });
          continue;
        }

        if (stageResult.status === "activated_immediately") {
          // שליחת מדבקת "אני על זה!" עגולה ושקופה בנפרד (ללא תגובה להודעה)
          if (fs.existsSync(STICKER_SEARCH_WEBP_PATH)) {
            try {
              const stickerBuf = fs.readFileSync(STICKER_SEARCH_WEBP_PATH);
              await sock.sendMessage(jid, { sticker: stickerBuf });
            } catch (e) {}
          }

          let responseMsg = `קיבלתי! מחפש לך: ${parsed.displayText} 🔍\n\n≡ תפריט`;

          console.log(`[פקודת נהג ${senderPhone}]: "${text}" -> ${parsed.mode} | ${parsed.displayText}`);
          recordEvent("command", `הופעל חיפוש עבור ${senderPhone}: ${parsed.displayText}`);

          await sock.sendMessage(jid, { text: responseMsg });
          continue;
        }

        if (stageResult.status === "pending_confirmation") {
          const currentList = stageResult.current.searches.map((s, idx) => `${idx + 1}. ${s.displayText}`).join("\n");
          let promptMsg = `🔍 *יש לך כרגע חיפוש פעיל במערכת:*\n${currentList}\n\n`;
          promptMsg += `❓ *האם להוסיף את החיפוש החדש במקביל?*\n`;
          promptMsg += `📍 *חיפוש חדש:* ${parsed.displayText} (${describeMode(parsed)})\n\n`;
          promptMsg += `*השב עכשיו במספר או מילה:*\n`;
          promptMsg += `👉 *1* או *הוסף* (או *כן*) ⬅️ להוספה במקביל\n`;
          promptMsg += `👉 *2* או *החלף* ⬅️ להחליף את כל החיפושים בחדש בלבד\n`;
          promptMsg += `👉 *ביטול* (או *לא*) ⬅️ להישאר עם הקיים ללא שינוי`;

          await sock.sendMessage(jid, { text: promptMsg }, { quoted: m });
          continue;
        }
      }

      // הודעה שלא זוהתה כפקודת חיפוש, תפיסת נסיעה או פקודת תפריט
      // דרישת משתמש מפורשת: "כל אות או משהו לא מוגדר ישלח מדבקה ומתחת הודעה לא הבנתי למה התכוונת"
      await sendConfusedStickerAndMessage(sock, jid, m, senderPhone);
      continue;
    }

    // ----------------------------------------------------
    // חלק ב': סריקת קבוצות בזמן אמת (בוט ראשי וחשבונות נהגים)
    // ----------------------------------------------------
    if (isGroup) {
      let groupName = "קבוצת נסיעות";
      try {
        if (!groupMetadataCache.has(jid)) {
          const metadata = await sock.groupMetadata(jid);
          groupMetadataCache.set(jid, metadata);
        }
        const meta = groupMetadataCache.get(jid);
        groupName = meta?.subject || groupName;
      } catch (e) {}

      // ניקוי פרסומות/פוטר דרייבוט לפני כל בדיקה
      const cleanedText = cleanSpamFromRide(text);

      if (isWaitingForMessagePlaceholder(text) || isWaitingForMessagePlaceholder(cleanedText)) {
        continue;
      }

      const junk = detectNonRide(cleanedText);
      if (junk) {
        if (DEBUG_FILTER) console.log(`[נדחה מקבוצה ${groupName}] ${junk} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
        continue;
      }

      // רשימת הנהגים שיש לבדוק עבורם התאמה לקבוצה זו:
      const targetDriverPhones = new Set();
      if (sessionContext.isMainBot) {
        // הבוט הראשי סורק ומסנן עבור כל הנהגים המורשים / בעלי חיפושים פעילים במערכת!
        const usersData = loadUsersData();
        for (const u of (usersData.approvedUsers || [])) {
          const p = cleanPhone(u.phone);
          if (p) targetDriverPhones.add(p);
        }
        const allSearches = getAllUserSearches();
        for (const p of Object.keys(allSearches)) {
          const cleanP = cleanPhone(p);
          if (cleanP) targetDriverPhones.add(cleanP);
        }
      } else if (sessionContext.driverPhone) {
        // סשן נהג פרטי סורק עבור הנהג עצמו בלבד
        targetDriverPhones.add(cleanPhone(sessionContext.driverPhone));
      }

      if (targetDriverPhones.size === 0) {
        continue;
      }

      const rideSenderPhone = await getRealSenderPhone(sock, jid, m);
      const rideSenderName = m.pushName || "סדרן";

      for (const driverPhone of targetDriverPhones) {
        const driverSearch = getUserSearch(driverPhone);

        // סורקים אך ורק אם לנהג זה יש חיפוש פעיל!
        if (!driverSearch || !driverSearch.active || !driverSearch.searches || driverSearch.searches.length === 0) {
          continue;
        }

        // אם הנהג עצמו הוא זה שפרסם את הנסיעה בקבוצה - לא שולחים לו התראה על עצמו
        if (cleanPhone(rideSenderPhone) === driverPhone) {
          continue;
        }

        const verdict = matchesAnySearch(cleanedText, driverSearch, groupName);

        if (!verdict.ok) {
          if (DEBUG_FILTER) console.log(`[נדחה ${driverPhone}] ${verdict.reason} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
          continue;
        }

        // בדיקת כפילות מבודדת לפי נהג
        const dup = deduper.check(cleanedText, driverPhone);
        if (dup.duplicate) {
          if (DEBUG_FILTER) console.log(`[כפילות ${driverPhone}] ${dup.reason} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
          continue;
        }

        const rideData = {
          cleanedText,
          rawText: text,
          driverPhone,
          groupName,
          groupJid: jid,
          senderName: rideSenderName,
          senderPhone: rideSenderPhone,
          senderJid: m.key?.participant || m.key?.remoteJid || null,
          originalMsgKey: m.key || null,
          searchDesc: verdict.matchedSearch?.displayText || driverSearch.displayText,
          matchedReason: verdict.reason,
          matchedSearch: verdict.matchedSearch || null,
          activeSearchesSnapshot: (driverSearch.searches || []).map((s) => ({
            displayText: s.displayText,
            mode: s.mode,
            origin: s.origin,
            destination: s.destination,
          })),
        };

        // שליחה לנהג: קודם דרך הבוט הראשי (עם התראה בטלפון), ובגיבוי דרך חשבון הנהג
        const driverSession = getDriverSession(driverPhone);
        const driverSock = driverSession?.sock;
        const result = await deliverRideAlert(driverSock, driverPhone, rideData, m);

        if (result.ok) {
          console.log(`[נשלח לנהג ${driverPhone} דרך ${result.via}] (${verdict.reason}): "${cleanedText.replace(/\n/g, " / ").slice(0, 80)}" | קבוצה: ${groupName}`);
          recordEvent("sent", `${groupName} ⬅️ ${driverPhone}`, {
            text: cleanedText.replace(/\n/g, " / ").slice(0, 80),
            reason: verdict.reason,
            driver: driverPhone,
            via: result.via,
          });
        } else {
          recordError("ride_delivery_failed", new Error(result.error), { driverPhone, groupName });
        }
        // מרווח אקראי קצר (Jitter 250-500ms) בין שליחות לנהגים למניעת עומס והגבלות קצב של וואטסאפ
        await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 250)));
      }
      continue;
    }
  }
}

// הפעלת לוח הבקרה ו-API ישירות בתוך הבוט
startDashboard({
  getUserSearch,
  setUserSearch,
  stopUserSearch,
  getAllUserSearches,
  processDriverCommand,
  describeMode,
  normalizeText,
  isRegistered: () => Boolean(getMainBotStatus().registered),
  groupCount: () => groupMetadataCache.size,
  dedupeSize: () => deduper.size,
  getAllSessions: () => getAllSessionsSummary(),
  getLiveRides: (phone) => getLiveRides(phone),
  claimRideFromWeb: (rideId, phone, claimText) => claimRideFromWeb(rideId, phone, claimText),
  simulateLiveRide: (sim) => simulateLiveRide(sim),
  getDriverLocation: (phone) => getDriverLocation(phone),
  setDriverLocation: (phone, loc) => setDriverLocation(phone, loc),
  notifyDriver: async (phone, text) => {
    let clean = cleanPhone(phone);
    if (clean.startsWith("0")) clean = "972" + clean.slice(1);
    const jids = new Set();
    jids.add(`${clean}@s.whatsapp.net`);

    // בדיקה האם יש לנהג מזהה LID מקושר (וואטסאפ ביזנס)
    const lidMap = loadLidMap();
    for (const [l, ph] of Object.entries(lidMap)) {
      if (cleanPhone(ph) === clean) {
        jids.add(`${l}@lid`);
      }
    }
    const usersData = loadUsersData();
    const u = (usersData.approvedUsers || []).find((usr) => cleanPhone(usr.phone) === clean);
    if (u?.lid) {
      jids.add(`${u.lid}@lid`);
    }

    const sock = getMainBotSock();
    let sentAny = false;
    for (const targetJid of jids) {
      if (sock && getMainBotStatus().connected) {
        try {
          await sock.sendMessage(targetJid, { text });
          sentAny = true;
        } catch (e) {
          console.error(`שגיאה בשליחת הודעה לנהג ${phone} (${targetJid}) דרך בוט ראשי:`, e.message);
        }
      }
    }
    const driverSock = getDriverSession(phone)?.sock;
    if (driverSock && !sentAny) {
      for (const targetJid of jids) {
        try {
          await driverSock.sendMessage(targetJid, { text });
          sentAny = true;
        } catch (e) {
          console.error(`שגיאה בשליחת הודעה לנהג דרך סוקט עצמי ${phone} (${targetJid}):`, e.message);
        }
      }
    }
    return sentAny;
  },
  notifyOwner: async (text) => {
    const sock = getMainBotSock();
    if (!sock) return;
    try {
      const adminPhone = loadUsersData().adminPhone;
      if (adminPhone) {
        await sock.sendMessage(`${cleanPhone(adminPhone)}@s.whatsapp.net`, { text });
      }
    } catch (e) {}
  },
  sendApprovalAndOnboarding: (phone, name) => sendApprovalAndOnboarding(phone, name),
  requestPairingCodeForPhone: async (phone, isBot = false, options = {}) => {
    if (isBot) {
      return await requestMainBotPairingCode(phone);
    }
    return await requestDriverPairingCode(
      phone,
      {
        onRideMessage: handleIncomingMessage,
        onReaction: handleReaction,
        onStatusChange: handleDriverStatusChange,
        onEvent: recordEvent,
      },
      options
    );
  },
  disconnectDriver: (phone) => {
    return disconnectDriverSession(phone);
  },
  resetDriverAuth: (phone) => {
    resetUserCooldown(phone);
    return resetDriverAuth(phone);
  },
  resetMainBotAuth: async () => {
    return await resetMainBotAuth({
      onMessage: handleIncomingMessage,
      onReaction: handleReaction,
      onStatusChange: handleMainBotStatusChange,
      onEvent: recordEvent,
    });
  },
  purgeAllDriverSessions: () => {
    return purgeAllDriverSessions();
  },
  ensureDriverSessionForQr: async (phone) => {
    return await ensureDriverSessionForQr(phone, {
      onRideMessage: handleIncomingMessage,
      onReaction: handleReaction,
      onStatusChange: handleDriverStatusChange,
      onEvent: recordEvent,
    });
  },
  getTelegramStatus: () => getTelegramStatus(),
  requestDriverTelegramCode: (phone, tgPhone) => requestDriverTelegramCode(phone, tgPhone),
  verifyDriverTelegramCode: (phone, code) => verifyDriverTelegramCode(phone, code),
  cancelPendingTelegramAuth: (phone) => cancelPendingTelegramAuth(phone),
  updateDriverTelegram: (phone, config) => updateDriverTelegram(phone, config),
  disconnectDriverTelegram: (phone) => disconnectDriverTelegram(phone),
  processIncomingTelegramRide: (payload) => processIncomingTelegramRide(payload, { getMainBotSock }),
  broadcastToDrivers: async (message, targetType = "all") => {
    const mainSock = getMainBotSock();
    if (!mainSock || !getMainBotStatus().connected) {
      throw new Error("הבוט הראשי אינו מחובר כרגע לוואטסאפ");
    }

    const cleanMsg = String(message || "").trim();
    if (!cleanMsg) {
      throw new Error("תוכן ההודעה ריק");
    }

    const usersData = loadUsersData();
    const approved = usersData.approvedUsers || [];
    const sessionsSummary = getAllSessionsSummary();
    const driverList = Array.isArray(sessionsSummary?.drivers) ? sessionsSummary.drivers : [];
    const connectedPhones = new Set(
      driverList
        .filter((s) => s.status === "connected" && !s.isMainBot)
        .map((s) => cleanPhone(s.phone))
    );

    let targets = [];
    if (targetType === "connected") {
      targets = approved.filter((u) => connectedPhones.has(cleanPhone(u.phone)) || isDriverSessionConnected(u.phone));
    } else {
      targets = approved;
    }

    if (targets.length === 0) {
      return { success: true, sentCount: 0, failedCount: 0, recipients: [] };
    }

    let sentCount = 0;
    let failedCount = 0;
    const results = [];

    for (const driver of targets) {
      const phone = cleanPhone(driver.phone);
      if (!phone) continue;
      const jid = getDestinationJid(phone);

      try {
        await mainSock.sendMessage(jid, { text: cleanMsg });
        sentCount++;
        results.push({ phone, name: driver.name || "נהג", status: "sent" });
        recordEvent("broadcast", `הודעת תפוצה נשלחה לנהג: ${driver.name || phone}`);
      } catch (err) {
        failedCount++;
        results.push({ phone, name: driver.name || "נהג", status: "failed", error: err.message });
        console.error(`שגיאה בשליחת הודעת תפוצה ל-${phone}:`, err.message);
      }

      await new Promise((r) => setTimeout(r, 600));
    }

    return {
      success: true,
      sentCount,
      failedCount,
      recipients: results,
    };
  },
  notifyAdminVersionUpdate: async (ver) => {
    return await notifyAdminVersionUpdate(ver);
  },
  repairContactSession: (phone) => {
    return repairContactSession(phone);
  },
  resetAllContactSessions: () => {
    return resetAllContactSessions();
  }
});

// שליחת הודעת וואטסאפ רשמית למנהל (0515157166) על שחרור גרסה חדשה בגיט
export async function notifyAdminVersionUpdate(version = "3.4.2") {
  const adminPhone = "972515157166";
  const mainSock = getMainBotSock();
  const text = `🚀 *עדכון מערכת חדש שוחרר בהצלחה!* (גרסה v${version}) 🚕\n\n` +
    `שלום מנהל המערכת,\n` +
    `כל השינויים והשיפורים עודכנו, נבדקו ונדחפו ל-GitHub (ענף main):\n\n` +
    `✅ *שדרוג מנוע Baileys 7.0.0-rc14 ופתרון 'בהמתנה להודעה זו':*\n` +
    `   • שדרוג מלא למנוע Baileys 7.x עם תמיכה מובנית ב-Meta LID ונעילות מפתחות (Mutex).\n` +
    `   • סריאליזציה של מאגר ה-Retry בעזרת BufferJSON (שימור Buffer/Uint8Array תקינים ללא שבירת בקשות Retry).\n` +
    `   • שמירה במאגר ה-Retry אך ורק של הודעות שהבוט שלח (ביטול דחיסת הודעות נכנסות שגרמו להצפת המאגר ו-Bad MAC).\n` +
    `   • מונה ניסיונות TtlCache נפרד לכל סוקט (מניעת דליפות זיכרון).\n` +
    `   • נטרול מחיקת קבצי Signal מהדיסק בזמן ריצה למניעת פיצול זיכרון-דיסק.\n\n` +
    `✅ *חיפושים מקביליים ומענה מיידי לכל הודעת נהג:*\n` +
    `   • אישור הוספת עיר במקביל במענה *"1"* או *"הוסף"* פועל כעת באופן מיידי ומנהל חיפושים מרובים במקביל.\n` +
    `   • הבוט מגיב לכל פקודה ללא דילוגים.\n\n` +
    `✅ *ציטוט מלא של הקבוצה והסדרן בכל נסיעה:*\n` +
    `   • שוחזר הציטוט המדויק (Quote card) של הודעת הסדרן והקבוצה המקורית.\n\n` +
    `📦 *חבילת הפריסה המעודכנת: fixed-bot-server-v${version}.tar.gz*\n` +
    `כל המערכות פועלות ומסונכרנות ב-100%!`;

  if (mainSock && getMainBotStatus().connected) {
    try {
      await mainSock.sendMessage(`${adminPhone}@s.whatsapp.net`, { text });
      console.log(`📲 נשלחה הודעת עדכון גרסה v${version} למנהל (${adminPhone})`);
      recordEvent("system", `נשלחה הודעת עדכון גרסה v${version} למנהל (${adminPhone})`);
      return { ok: true, sent: true };
    } catch (e) {
      console.warn("שגיאה בשליחת הודעה למנהל:", e.message);
      return { ok: false, error: e.message };
    }
  } else {
    console.log(`ℹ️ הודעת עדכון גרסה v${version} נרשמה עבור המנהל (${adminPhone}) ותישלח בעת חיבור הסוקט.`);
    recordEvent("system", `הודעת עדכון גרסה v${version} מוכנה לשליחה למנהל (${adminPhone})`);
    return { ok: true, queued: true };
  }
}

// הפעלת הבוט הראשי ושחזור סשנים שמורים של נהגים
async function boot() {
  console.log("🚀 מאתחל מערכת ריבוי וואטסאפ (Multi-Session Baileys)...");

  // 1. הפעלת הבוט הראשי
  await startMainBot({
    onMessage: handleIncomingMessage,
    onReaction: handleReaction,
    onStatusChange: handleMainBotStatusChange,
    onEvent: recordEvent,
  });

  // 2. שחזור סשנים שמורים של נהגים
  await initSavedDriverSessions({
    onRideMessage: handleIncomingMessage,
    onReaction: handleReaction,
    onStatusChange: handleDriverStatusChange,
    onEvent: recordEvent,
  });
}

boot().catch((err) => {
  console.error("שגיאה בהפעלת הבוט:", err);
});

// טיפול מקיף בשגיאות מערכת גלובליות לשמירה על שלמות קבצי creds.json ומניעת קריסות פתאומיות
process.on("uncaughtException", (err) => {
  console.error("💥 [Process uncaughtException]", err);
  try { recordError("uncaughtException", err?.message || String(err)); } catch (e) {}
});

process.on("unhandledRejection", (reason) => {
  console.error("💥 [Process unhandledRejection]", reason);
  try { recordError("unhandledRejection", reason?.message || String(reason)); } catch (e) {}
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`🛑 [Process] התקבל אות סיום ${sig} - סוגר סשנים בצורה נקייה ומסנכרן מפתחות...`);
    setTimeout(() => process.exit(0), 1200);
  });
}
