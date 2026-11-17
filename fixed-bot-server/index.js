import cron from "node-cron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText, parseDriverCommand, processDriverCommand, rideMatches, matchesAnySearch, findPlaces, extractDispatcherContact, buildQuotedRideMessage } from "./matcher.js";
import { createDeduper } from "./dedupe.js";
import { startDashboard, recordEvent, recordError } from "./dashboard-api.js";

import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STICKER_WEBP_PATH = path.join(__dirname, "assets", "sticker_confused.webp");
const STICKER_LIKE_PATH = path.join(__dirname, "assets", "sticker_like.webp");
const STICKER_STOPPED_PATH = path.join(__dirname, "assets", "sticker_stopped.webp");
const STICKER_SPEED_PATH = path.join(__dirname, "assets", "sticker_speed.webp");
const lastConfusedStickerSent = new Map();

async function sendSticker(sock, jid, stickerPath) {
  try {
    if (fs.existsSync(stickerPath)) {
      const stickerBuf = fs.readFileSync(stickerPath);
      await sock.sendMessage(jid, { 
        sticker: stickerBuf,
        contextInfo: {}
      });
    }
  } catch (err) {
    console.warn("⚠️ שגיאה בשליחת מדבקת וואטסאפ:", err?.message);
  }
}
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
  saveUsersData,
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
  removeUserSearchByIndex
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
  cleanOldSenderKeyFiles,
} from "./session-manager.js";
import {
  detectNeighborhood,
  calculateDistanceKm,
  generateWazeUrl,
  BEIT_SHEMESH_ZONES,
  parseRideRoute,
  extractDispatcherPhone,
} from "./geo-helper.js";
import {
  requestTelegramCode,
  verifyTelegramCode,
  disconnectTelegram,
  getTelegramStatus,
  getAllTelegramStatuses,
  initSavedTelegramSessions,
  setTelegramSystemCallbacks,
  claimTelegramRide,
  hasPendingTelegramVerification,
  sendRideAlertToTelegram,
  getTelegramDialogs,
} from "./telegram-manager.js";

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
      origin: "בית שמש",
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
      wazeUrl: generateWazeUrl(parsed.originText || parsed.originNeighborhood, "בית שמש", parsed.originCoords),
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

  // תפיסת נסיעת טלגרם
  if (targetAlertInfo.isTelegram) {
    const tgResult = await claimTelegramRide(phone, targetAlertInfo);
    targetAlertInfo.claimed = true;
    targetAlertInfo.claimedBy = phone;
    targetAlertInfo.claimedAt = Date.now();
    sentAlertsCache.set(rideId, targetAlertInfo);
    return {
      success: Boolean(tgResult.ok),
      sentInGroup: tgResult.action === "replied",
      sentDirect: false,
      sentToDriveBot: false,
      isDriveBot: false,
      isTelegram: true,
      message: tgResult.message || tgResult.reason,
      telegramUrl: targetAlertInfo.telegramUrl,
    };
  }

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
  if (interactiveText) return interactiveText;

  return String(
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.templateButtonReplyMessage?.selectedId ||
    ""
  ).trim();
}

// צ'אטים שאינם שיחה אמיתית: סטטוסים (סטוריז), רשימות תפוצה וערוצים - מתעלמים מהם לחלוטין
function isIgnorableJid(jid) {
  const j = String(jid || "");
  return j === "status@broadcast" || j.endsWith("@broadcast") || j.endsWith("@newsletter");
}

const MAX_MESSAGE_AGE_SEC = 24 * 3600; // הודעות מעל 24 שעות בלבד נחשבות ישנות (מניעת השלכת הודעות חיות)

function isStaleMessage(m) {
  const rawTs = m.messageTimestamp?.low ?? m.messageTimestamp;
  const ts = Number(rawTs || 0);
  if (!ts) return false;
  const tsSec = ts > 1e11 ? Math.floor(ts / 1000) : ts;
  return Math.abs(Date.now() / 1000 - tsSec) > MAX_MESSAGE_AGE_SEC;
}

// פורמט התראת נסיעה נקי, מדויק וללא שורות מיותרות
function buildRideAlertText(rideData) {
  let alertMsg = `${rideData.cleanedText}\n\n`;
  alertMsg += `📍 ${rideData.groupName}\n`;
  alertMsg += `👤 ${rideData.senderName} · ${rideData.senderPhone}`;
  return alertMsg.trim();
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




// ניקוי ובניית ציטוט בטוח של הודעת הקבוצה המקורית (לחיצה על הציטוט קופצת להודעה בקבוצה ללא שגיאות הצפנה)
function buildSafeGroupQuote(originalMsg, fallbackText = "נסיעה") {
  const origKey = originalMsg?.key;
  if (!origKey?.id || !originalMsg?.message) return null;

  let msg = originalMsg.message;
  while (msg) {
    if (msg.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
    else if (msg.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
    else if (msg.viewOnceMessageV2?.message) msg = msg.viewOnceMessageV2.message;
    else if (msg.documentWithCaptionMessage?.message) msg = msg.documentWithCaptionMessage.message;
    else break;
  }

  const quoteText = (
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    fallbackText
  ).trim();

  return {
    key: {
      remoteJid: origKey.remoteJid,
      id: origKey.id,
      fromMe: false,
      participant: origKey.participant || (origKey.remoteJid?.endsWith("@g.us") ? undefined : origKey.remoteJid),
    },
    message: {
      conversation: quoteText || "נסיעה",
    },
  };
}

// שליחת התראת נסיעה לנהג עם ציטוט הודעת הקבוצה המקורית
async function deliverRideAlert(driverSock, driverPhone, rideData, originalMsg) {
  const alertMsg = rideData.customAlertText || buildRideAlertText(rideData);
  const driverJid = getDestinationJid(driverPhone);
  const attempts = [];

  const mainSock = getMainBotSock();
  if (mainSock && getMainBotStatus().connected) attempts.push({ via: "main", sock: mainSock });

  const ownDriverSess = getDriverSession(driverPhone);
  if (ownDriverSess?.sock && ownDriverSess?.status === "connected") {
    attempts.push({ via: "driver-self", sock: ownDriverSess.sock });
  } else if (driverSock) {
    attempts.push({ via: "driver-sock", sock: driverSock });
  }

  // ציטוט הודעת הקבוצה המקורית (לחיצה על הציטוט קופצת להודעה בקבוצה)
  const quotedGroupMsg = buildSafeGroupQuote(originalMsg, rideData.cleanedText || "נסיעה");

  // שליחת ההתראה במקביל גם לטלגרם של הנהג (לקבוצה "נסיעות זמינות מהבוט" ולהודעות השמורות בפרטי)
  let tgResultPromise = null;
  try {
    tgResultPromise = sendRideAlertToTelegram(driverPhone, rideData, originalMsg).catch((tgErr) => {
      console.log(`ℹ️ [טלגרם] שליחה לנהג ${driverPhone} דולגה:`, tgErr.message);
      return { ok: false };
    });
  } catch (e) {}

  let lastError = null;
  for (const a of attempts) {
    try {
      const sentMsg = await trySend(a.sock, driverJid, { text: alertMsg }, quotedGroupMsg);
      if (!sentMsg) continue;

      if (sentMsg.key?.id) {
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
          isTelegram: Boolean(rideData.isTelegram),
          telegramChatId: rideData.telegramChatId || null,
          telegramMsgId: rideData.telegramMsgId || null,
          telegramUrl: rideData.telegramUrl || null,
          hasInlineButtons: Boolean(rideData.hasInlineButtons),
          telegramOriginalMessage: rideData.telegramOriginalMessage || null,
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
      console.log("🔎 QUOTE-KEY", rideData.groupName, JSON.stringify({ key: originalMsg?.key, type: Object.keys(originalMsg?.message || {})[0] }));
    }
  }

  // אם שליחה בוואטסאפ לא הצליחה (למשל סוקט מנותק), בודקים האם נשלח בהצלחה לטלגרם
  if (tgResultPromise) {
    const tgRes = await tgResultPromise;
    if (tgRes?.ok && tgRes.sentCount > 0) {
      return { ok: true, via: "telegram" };
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
  let menuText = `🚕 *תפריט נסיעות בוט איכותי*\n\n`;
  if (search.active && search.searches.length > 0) {
    menuText += `📊 *סטטוס החיפושים הפעילים שלך במקביל:*\n`;
    search.searches.forEach((s, idx) => {
      menuText += `${idx + 1}. ${s.displayText} (${describeMode(s)})\n`;
    });
    menuText += `\n`;
  } else {
    menuText += `📊 *סטטוס נוכחי שלך:* 🔴 מופסק (תפוס)\n\n`;
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
  menuText += `✈️ *למדריך חיבור טלגרם:* השב *"מדריך טלגרם"* או *"חבר טלגרם"*\n`;
  menuText += `🔗 *לקישור הוואטסאפ שלך:* השב *"חבר אותי"*`;

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

  guideText += `🔹 *2. חיבור וסנכרון טלגרם (מקביל לוואטסאפ!)*\n` +
    `• שלח לבוט: *"מדריך טלגרם"* או *"חבר טלגרם"* לקבלת קוד אימות רשמי באפליקציית טלגרם.\n` +
    `• מעכשיו נסיעות מקבוצות וערוצי הטלגרם ייסרקו במקביל ויגיעו ישירות לוואטסאפ!\n\n`;

  guideText += `🔹 *3. הגדרת חיפושים*\n` +
    `• *בתוך ומחוץ לעיר:* שלח למשל *"פנוי שמש"* או *"פנוי ים"* (מקבל נסיעות פנימיות + נסיעות שיוצאות מהעיר).\n` +
    `• *פנימי בעיר בלבד:* שלח *"פנוי שמש פנימי"* או *"שמש פנימי"* (מסנן רק נסיעות מקומיות בתוך העיר).\n` +
    `• *מסלול בין שתי ערים:* שלח *"פ ים שמש"* (מירושלים לבית שמש) או *"פ שמש ים"*.\n\n`;

  guideText += `🔹 *4. חיפושים מקביליים (כמה יעדים יחד!)*\n` +
    `• יש לך חיפוש פעיל? שלח פקודת חיפוש נוספת (למשל: *"פנוי ים"*).\n` +
    `• הבוט ישאל אותך מיד:\n` +
    `  👉 *1* או *הוסף* ⬅️ להוספת החיפוש במקביל (קבלת נסיעות מכל היעדים בו-זמנית!)\n` +
    `  👉 *2* או *החלף* ⬅️ להחליף את הכל בחיפוש החדש בלבד\n` +
    `  👉 *ביטול* ⬅️ להישאר עם הקיים\n\n`;

  guideText += `🔹 *5. תפיסת נסיעה סופר-מהירה ("ת" או "תן")*\n` +
    `• קיבלת נסיעה מתאימה מהבוט? השב עליה: *"ת"* או *"תן"*.\n` +
    `• בנסיעת וואטסאפ: שולח תגובת "תן" בקבוצה עם ציטוט, והודעה פרטית לסדרן.\n` +
    `• בנסיעת טלגרם: לוחץ אוטומטית על כפתור התפיסה הפנימי בטלגרם או מגיב בקבוצה!\n\n`;

  guideText += `🔹 *6. עצירת חיפוש (מצב תפוס)*\n` +
    `• תפסת נסיעה או סיימת משמרת? שלח: *"תפוס"*.\n` +
    `• הבוט יעצור את כל הסינונים מיד ולא ישלח התראות.\n\n`;

  guideText += `🔹 *7. פקודת "תפריט"*\n` +
    `• שלח *"תפריט"* בכל רגע כדי לצפות בסטטוס החיפושים הפעילים שלך ובאפשרויות מהירות.\n\n`;

  guideText += `🔹 *8. דיווח תקלה (דיסלייק 👎)*\n` +
    `• קיבלת נסיעה לא קשורה? סמן *👎* ישירות על הודעת הבוט.\n` +
    `• המקרה יישלח מיד לטיפול ותיקון בקבוצת הבאגים!`;

  await sock.sendMessage(jid, { text: guideText });
}

// שליחת מדריך מפורט ומקצועי לחיבור טלגרם
export async function sendTelegramGuide(sock, jid) {
  let tgGuide = `✈️ *מדריך חיבור וסנכרון טלגרם – נסיעות בוט איכותי* 🚕\n\n`;
  tgGuide += `מעכשיו המערכת תומכת בסריקת נסיעות במקביל גם מקבוצות וואטסאפ וגם מקבוצות טלגרם!\n\n`;
  tgGuide += `🔹 *איך זה עובד?*\n`;
  tgGuide += `החיבור מתבצע בדיוק כמו בחיבור וואטסאפ ווב – מקבלים קוד אימות רשמי באפליקציית טלגרם שלך, ומזינים אותו לבוט או באתר.\n\n`;
  tgGuide += `🔹 *שלבי החיבור דרך הוואטסאפ:*\n`;
  tgGuide += `1️⃣ שלח לבוט: *"חבר טלגרם"*\n`;
  tgGuide += `2️⃣ פתח את אפליקציית טלגרם בנייד שלך. תקבל שם הודעת שירות רשמית מטלגרם עם קוד אימות בן 5 ספרות.\n`;
  tgGuide += `3️⃣ שלח חזרה לבוט כאן:\n   *קוד טלגרם [הקוד שקיבלת]*\n   *(למשל: קוד טלגרם 54321)*\n`;
  tgGuide += `4️⃣ אם מוגדרת לך סיסמת אימות דו-שלבי (2FA) בטלגרם, שלח:\n   *סיסמת טלגרם [הסיסמה שלך]*\n\n`;
  tgGuide += `💻 *חיבור מהיר דרך האתר (דשבורד):*\n`;
  tgGuide += `היכנס לאתר ⬅️ לחץ בסרגל העליון על *"חיבור טלגרם"* ⬅️ הזן מספר ולחץ "שלח קוד אימות לטלגרם" ⬅️ הזן את הקוד והתחבר!\n\n`;
  tgGuide += `🔹 *איך תופסים נסיעה מטלגרם?*\n`;
  tgGuide += `• כל נסיעה מתאימה מקבוצות וערוצי הטלגרם שלך תישלח אליך ישירות לוואטסאפ עם הכותרת: *🔹 נסיעה מטלגרם*.\n`;
  tgGuide += `• לתפיסה מהירה: פשוט השב *"ת"* או *"תן"* על הודעת הנסיעה!\n`;
  tgGuide += `• הבוט ילחץ עבורך אוטומטית על כפתור התפיסה הפנימי בטלגרם (Inline Button כמו "לחצו כאן לבקשת הנסיעה") או יגיב בקבוצה!\n`;
  tgGuide += `• בנוסף קיים קישור ישיר להודעה בטלגרם.\n\n`;
  tgGuide += `🔹 *פקודות נוספות:*\n`;
  tgGuide += `• *סטטוס טלגרם* - בדיקת מצב החיבור ושם המשתמש\n`;
  tgGuide += `• *נתק טלגרם* - ניתוק החשבון`;

  await sock.sendMessage(jid, { text: tgGuide });
}

// זיהוי ופענוח מספר טלפון אמיתי של סדרן/שולח (מניעת מזהי LID חסויים)
async function getRealSenderPhone(sock, groupJid, msg) {
  const key = msg.key || {};

  if (key.fromMe) {
    const me = cleanPhone(sock?.user?.id || sock?.user?.phone);
    if (me && !isLid(me)) return me;
  }

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

export async function sendPairingCodeMessages(sock, jid, code) {
  const instructions = getPairingGuideInstructions();
  await sock.sendMessage(jid, { text: instructions });
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
export async function sendConfusedStickerAndMessage(sock, jid, senderPhone) {
  const now = Date.now();
  const lastTime = lastConfusedStickerSent.get(senderPhone) || 0;
  if (now - lastTime < 3000) {
    return; // מניעת ספאם/הפצצת מדבקות (cooldown של 3 שניות)
  }
  lastConfusedStickerSent.set(senderPhone, now);

  // 1. שליחת המדבקה השקופה ללא רקע (ללא ציטוט הודעה קודמת)
  await sendSticker(sock, jid, STICKER_WEBP_PATH);

  // 2. הודעה ברורה וקולעת מתחת למדבקה (ללא ציטוט)
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

// טיפול בשינוי סטטוס חיבור של הבוט הראשי
export function handleMainBotStatusChange(status) {
  console.log(`[בוט ראשי] סטטוס חיבור: ${status?.connected ? "מחובר ✅" : "מנותק ❌"}`);
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

    const jid = m.key.remoteJid;
    if (!jid) continue;

    // התעלמות מסטטוסים, רשימות תפוצה וערוצים
    if (isIgnorableJid(jid)) continue;

    const isGroup = jid.endsWith("@g.us");

    // בצ'אט פרטי (1 על 1): התעלמות מהודעות יוצאות של הבוט עצמו למניעת לולאות מענה עצמי
    if (m.key.fromMe && !isGroup) continue;

    // התעלמות מהודעות היסטוריות ישנות בעת אתחול (מעל 5 דקות)
    if (isStaleMessage(m)) continue;

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
      });
      continue;
    }

    const text = extractMessageText(m);
    if (!text) continue;

    // בקבוצה: התעלמות מהודעות תפיסה של הבוט עצמו אך מתן אפשרות לסריקת הודעות נסיעה שנשלחו לבדיקה
    if (m.key.fromMe && isGroup) {
      const rawTrim = text.trim();
      if (rawTrim === "ת" || rawTrim === "תן" || rawTrim === "אני" || rawTrim.startsWith("תפוס") || rawTrim.length < 4) {
        continue;
      }
    }

    const pushName = m.pushName || "משתמש";

    // ----------------------------------------------------
    // חלק א': הודעות פרטיות מול הבוט הראשי (פניות משתמשים וניהול)
    // ----------------------------------------------------
    if (!isGroup && sessionContext.isMainBot) {
      const usersData = loadUsersData();
      let senderPhone = cleanPhone(jid);
      const isSenderLid = isLid(jid) || isLid(senderPhone);

      // 1. זיהוי שקט של מספר אמיתי מתוך מזהה LID
      if (isSenderLid) {
        let detectedPhone = null;
        const key = m.key || {};
        for (const candidate of [
          key.remoteJidAlt,
          key.participantAlt,
          key.participantPN,
          key.senderPn,
          key.senderPN,
          m.participant,
          m.message?.extendedTextMessage?.contextInfo?.participantPn,
          m.message?.extendedTextMessage?.contextInfo?.senderPn,
        ]) {
          if (!candidate) continue;
          const cPhone = cleanPhone(candidate);
          if (cPhone && cPhone.length >= 9 && cPhone.length <= 12 && !isLid(candidate) && !isLid(cPhone)) {
            detectedPhone = cPhone;
            break;
          }
        }

        if (!detectedPhone) {
          try {
            const rawLid = jid.endsWith("@lid") ? jid : `${cleanPhone(jid)}@lid`;
            const pnFromLid = await sock.signalRepository?.lidMapping?.getPNForLID(rawLid);
            const num = cleanPhone(pnFromLid);
            if (num && !isLid(num) && num.length >= 9 && num.length <= 12) detectedPhone = num;
          } catch (e) {}
        }

        // אם המשתמש שלח בהודעה את מספר הטלפון שלו (למשל: "0521234567")
        if (!detectedPhone) {
          const directPhoneMatch = text.trim().match(/^(?:05\d-?\d{7}|9725\d{8})$/);
          if (directPhoneMatch) {
            const num = cleanPhone(directPhoneMatch[0]);
            if (num && num.length >= 9 && num.length <= 12) {
              detectedPhone = num;
              console.log(`📱 [זיהוי LID]: משתמש סיפק בעצמו מספר טלפון בהודעה: ${num}`);
            }
          }
        }

        if (detectedPhone) {
          registerLidMapping(jid, detectedPhone);
          senderPhone = detectedPhone;
        }
      }

      const isAdmin = isUserAdmin(senderPhone);
      const isApproved = isUserApproved(senderPhone);
      const norm = normalizeText(text);

      // 2. מספר המנהל משמש לניהול בלבד
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

        const sendGuideMatch = text.match(/^(?:שלח\s+מדריך|מדריך|שלח\s+הדרכה|הדרכה|אישור|חבר)\s+([0-9+\s-]+)$/);
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

        if (norm === "תפריט" || norm === "menu" || norm === "עזרה") {
          await sock.sendMessage(jid, {
            text: `🛠️ *תפריט ניהול מערכת*\n\nפקודות זמינות למנהל:\n• *אשר 0501234567* ⬅️ אישור נהג חדש ושליחת מדריך\n• *דחה 0501234567* ⬅️ דחיית בקשת הצטרפות\n• *שלח מדריך 0501234567* ⬅️ שליחה חוזרת של הודעת אישור ומדריך חיבור ווב\n• *עדכן 0501234567 ל 0507654321* ⬅️ עדכון מספר טלפון של נהג`
          }, { quoted: m });
        }
        continue;
      }

      // 3. משתמש שטרם אושר
      if (!isApproved) {
        const canReply = canReplyToUnapproved(senderPhone);
        if (!canReply) {
          continue;
        }

        const pending = addPendingUser(senderPhone, pushName);
        recordEvent("system", `בקשת הצטרפות: ${pushName} (${senderPhone})`);

        const isStillLid = isLid(senderPhone);
        const unapprovedMsg = `שלום ${pushName}! 👋\n` +
          `ברוך הבא ל*נסיעות בוט איכותי*.\n\n` +
          `⚠️ מספרך עדיין אינו מאושר במערכת.\n` +
          (isStillLid ? `💡 *הערה:* חשבונך מוגדר בוואטסאפ כפרטי (LID). מומלץ לשלוח לכאן את מספר הטלפון הרגיל שלך (למשל: *0521234567*) כדי שנוכל לחברך במהירות.\n\n` : `\n`) +
          `📩 *בקשת הצטרפות נשלחה למנהל המערכת.*\n` +
          `ברגע שיאושר חשבונך, תקבל הודעה עם הנחיות חיבור.`;

        await sock.sendMessage(jid, { text: unapprovedMsg }, { quoted: m });

        const adminClean = cleanPhone(usersData.adminPhone);
        if ((pending?.isNew || (!isStillLid && pending?.wasLid)) && adminClean && adminClean !== senderPhone) {
          let adminAlert = `🔔 *בקשת הצטרפות חדשה לבוט!*\n\n` +
            `👤 *שם:* ${pushName}\n` +
            (isStillLid 
              ? `📱 *טלפון:* ⚠️ מספר לא זוהה (משתמש מוסתר בוואטסאפ - מזהה LID)\n🆔 *מזהה LID:* ${senderPhone}\n`
              : `📱 *טלפון:* ${senderPhone}\n`
            );
          adminAlert += `\nלאישור המשתמש, השב:\n*אשר ${senderPhone}*\n\nלדחייה, השב:\n*דחה ${senderPhone}*`;
          await sock.sendMessage(`${adminClean}@s.whatsapp.net`, { text: adminAlert });
        }
        continue;
      }

      // 4. נהג מאושר
      // 4.0 מדריכים, פקודות טלגרם וניתוק/איפוס (זמינים לכל נהג מאושר, גם לפני/אחרי חיבור וואטסאפ ווב)
      if (norm === "מדריך טלגרם" || norm === "הוראות טלגרם" || norm === "מדריך telegram" || norm === "עזרה טלגרם") {
        await sendTelegramGuide(sock, jid);
        continue;
      }

      if (norm === "מדריך" || norm === "הוראות" || norm === "מדריך שימוש" || norm === "guide") {
        await sendDriverGuide(sock, jid);
        continue;
      }

      // פקודות חיבור וסנכרון טלגרם (דרישת משתמש: רק כשאני מבקש קוד אימות שאני יקבל)
      const isTgRequest = norm === "חבר טלגרם" || norm === "חיבור טלגרם" || norm === "קוד טלגרם" ||
        norm === "קוד לטלגרם" || norm === "טלגרם קוד" || norm === "חבר telegram" ||
        norm === "התחבר לטלגרם" || norm === "חיבור לטלגרם";
      if (isTgRequest) {
        try {
          await sock.sendMessage(jid, {
            text: `⏳ *שולח בקשה רשמית לטלגרם...*\nמפיק קוד אימות לחשבונך (${senderPhone}).\nנא לפתוח עכשיו את אפליקציית טלגרם הרשמית בטלפון שלך.`,
          });
          const reqRes = await requestTelegramCode(senderPhone);
          await sock.sendMessage(jid, {
            text: `📩 *קוד אימות נשלח לאפליקציית טלגרם שלך!*\n\nכדי להשלים את החיבור, שלח לכאן:\n👉 *קוד טלגרם [הקוד שקיבלת]*\n(או פשוט שלח את מספר הקוד, לדוגמה: *54321*)\n\n*(ניתן להתחבר גם דרך האתר בדשבורד!)*`,
          });
        } catch (err) {
          await sock.sendMessage(jid, {
            text: `⚠️ לא ניתן היה לקבל קוד מטלגרם: ${err.message}\nוודא שהמספר רשום בטלגרם או נסה שוב בעוד מספר רגעים.`,
          });
        }
        continue;
      }

      // אימות קוד טלגרם (תומך ב: "קוד טלגרם 12345", "קוד אימות 12345", "קוד 12345", או 5-6 ספרות כשיש בקשה ממתינה)
      const tgExplicitMatch = norm.match(/^(?:קוד(?:\s*אימות)?(?:\s*טלגרם|\s*tg)?|טלגרם\s*קוד)\s*([0-9]{5,6})$/);
      const isDigitsOnly = /^[0-9]{5,6}$/.test(norm);
      const hasPendingTg = hasPendingTelegramVerification(senderPhone);
      let inputTgCode = null;
      if (tgExplicitMatch) {
        inputTgCode = tgExplicitMatch[1];
      } else if (isDigitsOnly && hasPendingTg) {
        inputTgCode = norm;
      }

      if (inputTgCode) {
        try {
          await sock.sendMessage(jid, { text: `🔐 מאמת קוד טלגרם (${inputTgCode}) מול שרתי טלגרם...` });
          const verifyRes = await verifyTelegramCode(senderPhone, inputTgCode);
          if (verifyRes.need2FA) {
            await sock.sendMessage(jid, {
              text: `🔐 *נדרשת סיסמת אימות דו-שלבי (2FA):*\nבחשבון הטלגרם שלך מוגדרת סיסמה נוספת.\nשלח לכאן עכשיו:\n👉 *סיסמת טלגרם [הסיסמה שלך]*`,
            });
          } else {
            await sock.sendMessage(jid, {
              text: `🎉 *חשבון הטלגרם שלך (${verifyRes.username || ""}) חובר בהצלחה!* 🚕✈️\n\nמעכשיו המערכת תסרוק נסיעות במקביל גם מוואטסאפ וגם מטלגרם!\nכל נסיעה תתקבל לכאן עם כותרת '🔹 נסיעה מטלגרם' ואפשרות תפיסה מהירה ("ת" או "תן").`,
            });
          }
        } catch (err) {
          await sock.sendMessage(jid, {
            text: `❌ שגיאה באימות קוד טלגרם: ${err.message}\nאם פג תוקף הקוד, שלח *"חבר טלגרם"* לקבלת קוד חדש.`,
          });
        }
        continue;
      }

      // סיסמת 2FA בטלגרם
      const tgPassMatch = text.trim().match(/^סיסמ(?:ת|ה)(?:\s*של)?\s*טלגרם\s+(.+)$/i);
      if (tgPassMatch) {
        const tgPass = tgPassMatch[1].trim();
        try {
          await sock.sendMessage(jid, { text: `🔑 מאמת סיסמת אימות דו-שלבי (2FA) בטלגרם...` });
          const verifyRes = await verifyTelegramCode(senderPhone, null, tgPass);
          await sock.sendMessage(jid, {
            text: `🎉 *חשבון הטלגרם שלך (${verifyRes.username || ""}) חובר בהצלחה!* 🚕✈️\nנסיעות טלגרם מסונכרנות מעכשיו ישירות לוואטסאפ במקביל!`,
          });
        } catch (err) {
          await sock.sendMessage(jid, {
            text: `❌ שגיאה באימות סיסמת טלגרם: ${err.message}`,
          });
        }
        continue;
      }

      // סטטוס טלגרם
      if (norm === "סטטוס טלגרם" || norm === "מצב טלגרם") {
        const tgStatus = getTelegramStatus(senderPhone);
        if (tgStatus.connected || tgStatus.hasSavedSession) {
          await sock.sendMessage(jid, {
            text: `✈️ *סטטוס טלגרם נהג:*\n✅ מחובר ומסונכרן\n👤 משתמש: ${tgStatus.username || "נהג"}\n📱 מספר: ${tgStatus.phone}\n\nנסיעות מקבוצות וערוצי הטלגרם נסרקות במקביל לוואטסאפ!\nלניתוק: שלח *"נתק טלגרם"*`,
          });
        } else {
          await sock.sendMessage(jid, {
            text: `✈️ *סטטוס טלגרם נהג:*\n⚪ לא מחובר\n\nלחיבור וקבלת קוד באפליקציית טלגרם:\n👉 שלח *"חבר טלגרם"* (או התחבר דרך האתר בדשבורד)`,
          });
        }
        continue;
      }

      // ניתוק / איפוס טלגרם
      const isTgDisconnect = norm === "נתק טלגרם" || norm === "ניתוק טלגרם" || norm === "בטל טלגרם" ||
        norm === "ביטול טלגרם" || norm === "איפוס טלגרם" || norm === "אפס טלגרם" || norm === "מחק טלגרם" ||
        norm === "נתק tg" || norm === "נתק telegram";
      if (isTgDisconnect) {
        try {
          await disconnectTelegram(senderPhone);
          await sock.sendMessage(jid, {
            text: `✅ *חשבון הטלגרם שלך נותק ואופס בהצלחה.*\nהסשן נסגר ולא יסרקו עוד נסיעות מטלגרם.\nלחיבור מחדש בכל עת, שלח *"חבר טלגרם"*.`,
          });
        } catch (err) {
          await sock.sendMessage(jid, { text: `⚠️ שגיאה בניתוק טלגרם: ${err.message}` });
        }
        continue;
      }

      // ניתוק / איפוס וואטסאפ
      const isWaDisconnect = norm === "נתק וואטסאפ" || norm === "ניתוק וואטסאפ" || norm === "נתק ווצאפ" ||
        norm === "ניתוק ווצאפ" || norm === "נתק whatsapp" || norm === "איפוס וואטסאפ" || norm === "אפס וואטסאפ";
      if (isWaDisconnect) {
        try {
          await disconnectDriverSession(senderPhone);
          await sock.sendMessage(jid, {
            text: `✅ *חיבור הוואטסאפ שלך נותק ואופס בהצלחה.*\nסשן הסריקה נסגר והקבצים נוקו.\nלחיבור מחדש בכל עת, שלח *"חבר אותי"*.`,
          });
        } catch (err) {
          await sock.sendMessage(jid, { text: `⚠️ שגיאה בניתוק וואטסאפ: ${err.message}` });
        }
        continue;
      }

      // תפריט ניתוק ואיפוס כללי
      if (norm === "נתק" || norm === "ניתוק" || norm === "איפוס" || norm === "אפס" || norm === "נתק הכל") {
        const tgStatus = getTelegramStatus(senderPhone);
        const isWaConnected = isDriverSessionConnected(senderPhone);
        let resetMsg = `🔌 *תפריט ניתוק ואיפוס חשבון נהג:*\n\n`;
        resetMsg += `📲 *וואטסאפ:* ${isWaConnected ? "✅ מחובר" : "⚪ מנותק"}\n`;
        resetMsg += `✈️ *טלגרם:* ${tgStatus.connected ? "✅ מחובר" : "⚪ מנותק"}\n\n`;
        resetMsg += `מה ברצונך לנתק / לאפס?\n\n`;
        resetMsg += `1️⃣ *לניתוק טלגרם:* שלח *נתק טלגרם*\n`;
        resetMsg += `2️⃣ *לניתוק וואטסאפ:* שלח *נתק וואטסאפ*\n\n`;
        resetMsg += `💡 ניתן לנתק ולאפס בקלות גם דרך האתר בלוח הבקרה!`;
        await sock.sendMessage(jid, { text: resetMsg });
        continue;
      }

      // 4.1 בדיקת חיבור וואטסאפ ווב של הנהג
      const isDriverConnected = isDriverSessionConnected(senderPhone);
      const connectMatch = norm.match(/^(?:חבר אותי|קוד חדש|חיבור|קוד|ווב)(?: ([0-9 ]{9,15}))?$/);

      if (!isDriverConnected) {
        if (connectMatch) {
          let phoneForPairing = senderPhone;
          const explicit = connectMatch[1] ? cleanPhone(connectMatch[1].replace(/\s+/g, "")) : null;

          if (isLid(senderPhone)) {
            if (!explicit || !/^9725\d{8}$/.test(explicit)) {
              await sock.sendMessage(jid, {
                text: `📱 *לחיבור הוואטסאפ נדרש מספר סלולרי רגיל.*\n\n👉 שלח: *חבר אותי 0521234567*\n(במקום הדוגמה - המספר שלך)`
              });
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
        }

        if (norm === "תפריט" || norm === "menu" || norm === "עזרה") {
          const tgStatus = getTelegramStatus(senderPhone);
          let unlinkedMenu = `🚕 *נסיעות בוט איכותי - תפריט*\n\n`;
          unlinkedMenu += `📊 *סטטוס חשבון:* ✅ מאושר במערכת\n`;
          unlinkedMenu += `📲 *סטטוס וואטסאפ:* ⚪ לא מחובר (נדרש חיבור ראשוני)\n`;
          unlinkedMenu += `✈️ *סטטוס טלגרם:* ${tgStatus.connected ? "✅ מחובר ומסונכרן" : "⚪ לא מחובר"}\n\n`;
          unlinkedMenu += `כדי שנוכל לסרוק עבורך נסיעות מקבוצות הוואטסאפ שלך:\n`;
          unlinkedMenu += `👉 השב עכשיו *"חבר אותי"*\n\n`;
          unlinkedMenu += `לחיבור או ניהול טלגרם:\n`;
          unlinkedMenu += `👉 שלח *"חבר טלגרם"*, *"מדריך טלגרם"* או *"נתק טלגרם"*`;
          await sock.sendMessage(jid, { text: unlinkedMenu });
          continue;
        }

        const lastPromptTime = recentUnlinkedPrompts.get(senderPhone) || 0;
        const now = Date.now();
        if (now - lastPromptTime > 30 * 60 * 1000) {
          recentUnlinkedPrompts.set(senderPhone, now);
          const unlinkedPrompt = `שלום ${pushName}! 👋\n\n` +
            `🎉 *חשבונך מאושר, אך הוואטסאפ שלך עדיין אינו מחובר לסריקת נסיעות.*\n\n` +
            `👉 להתחלה השב *"חבר אותי"* ותקבל קוד צימוד בן 8 תווים.\n` +
            `✈️ לחיבור טלגרם: השב *"חבר טלגרם"* או *"מדריך טלגרם"*.`;
          await sock.sendMessage(jid, { text: unlinkedPrompt });
        }
        continue;
      }

      // ==============================================================
      // נהג מאושר שהוואטסאפ שלו מחובר
      // ==============================================================
      if (connectMatch) {
        await sock.sendMessage(jid, {
          text: `✅ הוואטסאפ שלך כבר מחובר ומסונכרן למערכת.\nשלח פקודות חיפוש כגון *"פנוי שמש"*, *"פנוי שמש פנימי"*, *"פ ים שמש"*, או *"תפריט"*.\nלניתוק: שלח *"נתק וואטסאפ"*.`
        });
        continue;
      }

      if (norm === "תפריט" || norm === "menu" || norm === "עזרה") {
        await sendHelpMenu(sock, jid, senderPhone);
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
        await sendConfusedStickerAndMessage(sock, jid, senderPhone);
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
        // תפיסת נסיעת טלגרם (לחיצה אוטומטית על Inline Button או תגובה בטלגרם)
        if (targetAlertInfo.isTelegram) {
          const tgResult = await claimTelegramRide(senderPhone, targetAlertInfo);
          targetAlertInfo.claimed = true;
          targetAlertInfo.claimedBy = senderPhone;
          targetAlertInfo.claimedAt = Date.now();
          if (targetAlertInfo.msgId) {
            sentAlertsCache.set(targetAlertInfo.msgId, targetAlertInfo);
          }

          let claimReply = "";
          if (tgResult.ok) {
            claimReply = `🚕 *נסיעת טלגרם נתפסה בהצלחה!*\n\n${tgResult.message || "הנסיעה נתפסה!"}\n\n📍 *קבוצה:* ${targetAlertInfo.groupName}\n👤 *סדרן:* ${targetAlertInfo.senderName}\n`;
            if (targetAlertInfo.telegramUrl) {
              claimReply += `\n🔗 *פתח בטלגרם:* ${targetAlertInfo.telegramUrl}`;
            }
          } else {
            claimReply = `⚠️ *תפיסת נסיעה בטלגרם:*\n${tgResult.reason || tgResult.error || "לא ניתן היה לבצע תפיסה אוטומטית"}\n\n`;
            if (targetAlertInfo.telegramUrl) {
              claimReply += `🔗 *פתח באפליקציית טלגרם לתפיסה מיידית:*\n${targetAlertInfo.telegramUrl}`;
            }
          }
          await sock.sendMessage(jid, { text: claimReply.trim() });
          recordEvent("command", `נהג ${senderPhone} תפס נסיעת טלגרם: ${tgResult.ok ? 'הצלחה' : 'נכשל'}`);
          continue;
        }

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

        await sock.sendMessage(jid, { text: claimReply });
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
          });
          continue;
        }

        const rideText = targetRide.rideData?.cleanedText || targetRide.rawText || "";
        const detected = detectNeighborhood(rideText);
        const driverLoc = getDriverLocation(senderPhone);

        if (!detected || !detected.coords) {
          await sock.sendMessage(jid, {
            text: `📍 *בדיקת מיקום נסיעה:*\nנסיעה: "${rideText.slice(0, 100)}"\nלא זוהה רחוב ספציפי מוכר בטקסט.\n🚗 Waze כללי: https://waze.com/ul?q=בית+שמש&navigate=yes`,
          });
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

        await sock.sendMessage(jid, { text: infoReply });
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
          });
          continue;
        }
      }

      // עצירת חיפוש (מצב תפוס) - אך ורק עם פקודת "תפוס", "עצור", "סגור"!
      // אות "ת" לבדה ללא ציטוט נסיעה אינה עוצרת את החיפוש!
      if (/(^| )(תפוס|עצור|סגור)( |$)/.test(norm)) {
        stopUserSearch(senderPhone);
        recordEvent("command", `חיפוש הופסק ע"י ${pushName} (${senderPhone})`);
        await sendSticker(sock, jid, STICKER_STOPPED_PATH);
        await sock.sendMessage(jid, { text: `🛑 *החיפוש הופסק בהצלחה!* (מצב תפוס)\nלחזרה כתוב "פנוי..." או "תפריט".` });
        continue;
      }

      // אם הנהג שלח סתם "ת" בלי ציטוט של נסיעה מסוימת - לא עושים כלום ולא עוצרים חיפוש!
      if (norm === "ת") {
        continue;
      }


      const currentSearch = getUserSearch(senderPhone);

      // 1. טיפול בתשובה לשאלת אישור הוספת חיפוש במקביל (אם יש חיפוש בהמתנה לאישור)
      if (currentSearch.pendingSearch) {
        // אפשרות א': אישור הוספה במקביל
        if (norm === "1" || norm === "כן" || norm === "הוסף" || norm === "אשר" || norm === "אישור" || norm === "תוסיף" || norm === "להוסיף") {
          const res = confirmPendingSearch(senderPhone, false);
          let msg = `✅ *החיפוש נוסף בהצלחה!*\n\n📋 *כל החיפושים הפעילים שלך במקביל:*\n`;
          res.current.searches.forEach((s, idx) => {
            msg += `${idx + 1}. ${s.displayText} (${describeMode(s)})\n`;
          });
          msg += `\n🚕 הבוט יסנן עבורך נסיעות מכל המסלולים הללו בו-זמנית!\n💡 להפסקת כל החיפושים שלח "תפוס".`;
          recordEvent("command", `נוסף חיפוש מקבילי עבור ${senderPhone}: ${res.added.displayText}`);
          await sendSticker(sock, jid, STICKER_SPEED_PATH);
          await sock.sendMessage(jid, { text: msg });
          continue;
        }

        // אפשרות ב': החלפה (רק החיפוש החדש)
        if (norm === "2" || norm === "החלף" || norm === "רק זה" || norm === "החלפה") {
          const res = confirmPendingSearch(senderPhone, true);
          const s = res.current.searches[0];
          let msg = `🔄 *החיפושים הוחלפו בהצלחה!*\n\n🔍 *חיפוש פעיל כעת:*\n1. ${s.displayText} (${describeMode(s)})\n\nברגע שתעלה נסיעה מתאימה - תקבל התראה מיידית.`;
          recordEvent("command", `הוחלף חיפוש עבור ${senderPhone}: ${s.displayText}`);
          await sendSticker(sock, jid, STICKER_LIKE_PATH);
          await sock.sendMessage(jid, { text: msg });
          continue;
        }

        // אפשרות ג': ביטול (do nothing / cancel staging)
        if (norm === "ביטול" || norm === "בטל" || norm === "לא" || norm === "0" || norm === "אל תוסיף") {
          const res = cancelPendingSearch(senderPhone);
          let msg = `👌 *הבקשה בוטלה.* נשארת עם החיפושים הקיימים שלך:\n`;
          res.current.searches.forEach((s, idx) => {
            msg += `${idx + 1}. ${s.displayText}\n`;
          });
          recordEvent("command", `בוטלה הוספת חיפוש עבור ${senderPhone}`);
          await sock.sendMessage(jid, { text: msg });
          continue;
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
          await sock.sendMessage(jid, { text: msg });
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
          });
          continue;
        }

        if (stageResult.status === "activated_immediately") {
          let responseMsg = `✅ *החיפוש הופעל בהצלחה:*\n\n`;
          responseMsg += `🔍 *מוגדר:* ${parsed.displayText}\n`;
          responseMsg += `📌 *סינון:* ${describeMode(parsed)}\n\n`;
          responseMsg += `ברגע שתעלה נסיעה מתאימה בקבוצות שלך - תקבל התראה מיידית.\n\n`;
          responseMsg += `💡 *רוצה לחפש מסלול נוסף במקביל?* פשוט שלח פקודה נוספת (למשל: "פ ים בב").`;

          console.log(`[פקודת נהג ${senderPhone}]: "${text}" -> ${parsed.mode} | ${parsed.displayText}`);
          recordEvent("command", `הופעל חיפוש עבור ${senderPhone}: ${parsed.displayText}`);

          await sendSticker(sock, jid, STICKER_LIKE_PATH);
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

          await sock.sendMessage(jid, { text: promptMsg });
          continue;
        }
      }

      // הודעה שלא זוהתה כפקודת חיפוש, תפיסת נסיעה או פקודת תפריט
      // דרישת משתמש מפורשת: "כל אות או משהו לא מוגדר ישלח מדבקה ומתחת הודעה לא הבנתי למה התכוונת"
      await sendConfusedStickerAndMessage(sock, jid, senderPhone);
      continue;
    }

    // ----------------------------------------------------
    // חלק ב': סריקת קבוצות בזמן אמת (הן מחשבונות נהגים מקושרים והן מהבוט הראשי)
    // ----------------------------------------------------
    if (isGroup) {
      recordEvent("group_msg", `הודעה בקבוצה: "${(text || "").slice(0, 45)}"`, {
        fromMe: m.key.fromMe,
        groupJid: jid,
        session: sessionContext.driverPhone || "main"
      });
      // כל נהג מקבל רק נסיעות מהקבוצות של הוואטסאפ המקושר שלו.
      // הבוט הראשי לא סורק קבוצות בכלל.
      if (sessionContext.isMainBot || !sessionContext.driverPhone) continue;

      const targetDrivers = [];
      const ownerPhone = cleanPhone(sessionContext.driverPhone);
      if (ownerPhone && getUserSearch(ownerPhone).active) targetDrivers.push(ownerPhone);

      if (targetDrivers.length === 0) continue;
      
      let groupName = "קבוצת נסיעות";
      const cachedMeta = groupMetadataCache.get(jid);
      if (cachedMeta?.subject) {
        groupName = cachedMeta.subject;
      } else if (sock.groupMetadata) {
        sock.groupMetadata(jid)
          .then((meta) => { if (meta?.subject) groupMetadataCache.set(jid, meta); })
          .catch(() => {});
      }

      // ניקוי פרסומות/פוטר דרייבוט לפני כל בדיקה
      const cleanedText = cleanSpamFromRide(text);

      const junk = detectNonRide(cleanedText);
      if (junk) {
        continue;
      }

      for (const driverPhone of targetDrivers) {
        const driverSearch = getUserSearch(driverPhone);
        if (!driverSearch.active) {
          recordEvent("filter_skip", `נהג ${driverPhone} ללא חיפוש פעיל`);
          continue;
        }

        const verdict = matchesAnySearch(cleanedText, driverSearch, groupName);
        if (!verdict.ok) {
          if (DEBUG_FILTER) console.log(`[נדחה ${driverPhone}] ${verdict.reason} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
          recordEvent("filter_reject", `נהג ${driverPhone} (${driverSearch.displayText}): ${verdict.reason}`);
          continue;
        }

        // בדיקת כפילות מבודדת לפי נהג
        const dup = deduper.check(cleanedText, driverPhone);
        if (dup.duplicate) {
          if (DEBUG_FILTER) console.log(`[כפילות ${driverPhone}] ${dup.reason} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
          recordEvent("filter_dup", `כפילות עבור ${driverPhone}: ${dup.reason}`);
          continue;
        }

        const rideSenderPhone = await getRealSenderPhone(sock, jid, m);
        const rideSenderName = m.key.fromMe ? (sock.user?.name || "אני") : (m.pushName || "סדרן");

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
        const result = await deliverRideAlert(sock, driverPhone, rideData, m);

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
          recordEvent("delivery_error", `שגיאה במסירת נסיעה לנהג ${driverPhone}: ${result.error}`);
        }
      }
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
  requestTelegramCode: (phone) => requestTelegramCode(phone),
  verifyTelegramCode: (phone, code, password) => verifyTelegramCode(phone, code, password),
  disconnectTelegram: (phone) => disconnectTelegram(phone),
  getTelegramStatus: (phone) => getTelegramStatus(phone),
  getAllTelegramStatuses: () => getAllTelegramStatuses(),
  getTelegramDialogs: (phone) => getTelegramDialogs(phone),
});

// הפעלת הבוט הראשי ושחזור סשנים שמורים של נהגים
async function boot() {
  console.log("🚀 מאתחל מערכת ריבוי וואטסאפ (Multi-Session Baileys) וטלגרם (MTProto)...");

  // -1. ניקוי קבצי מפתחות ישנים שעלולים לגרום ל-Bad MAC והודעות ממתינות
  cleanOldSenderKeyFiles();

  // 0. הגדרת חיבורי מערכת עבור מנהל הטלגרם
  setTelegramSystemCallbacks({
    getUserSearch,
    matchesAnySearch,
    deliverRideAlert,
    cleanSpamFromRide,
    detectNonRide,
    deduper,
    recordEvent,
    recordError,
    loadUsersData,
    saveUsersData,
  });

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

  // 3. שחזור סשנים שמורים של נהגים בטלגרם
  await initSavedTelegramSessions();
}

boot().catch((err) => {
  console.error("שגיאה בהפעלת הבוט:", err);
});
