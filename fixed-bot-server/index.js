import cron from "node-cron";
import fs from "node:fs";
import { normalizeText, parseDriverCommand, processDriverCommand, rideMatches, matchesAnySearch, findPlaces, extractDispatcherContact, buildQuotedRideMessage } from "./matcher.js";
import { createDeduper } from "./dedupe.js";
import { startDashboard, recordEvent, recordError } from "./dashboard-api.js";
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
  removeUserSearchByIndex
} from "./users-manager.js";
import {
  startMainBot,
  getMainBotSock,
  getMainBotStatus,
  requestMainBotPairingCode,
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
} from "./session-manager.js";

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
  if (sock) {
    try {
      await sock.sendMessage(BUG_REPORT_GROUP_JID, { text: reportText });
      return true;
    } catch (e) {
      console.log("סוקט מקומי לא הצליח לשלוח לקבוצת הבאגים, מנסה סוקט ראשי:", e.message);
    }
  }

  const mainSock = getMainBotSock();
  if (mainSock && mainSock !== sock) {
    try {
      await mainSock.sendMessage(BUG_REPORT_GROUP_JID, { text: reportText });
      return true;
    } catch (e) {
      console.error("שגיאה בשליחת דיווח באג דרך הבוט הראשי:", e.message);
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

const MAX_MESSAGE_AGE_SEC = 5 * 60; // הודעות ישנות (היסטוריה / סנכרון אחרי ניתוק) לא מטופלות

function isStaleMessage(m) {
  const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp ?? 0);
  if (!ts) return false;
  return Date.now() / 1000 - ts > MAX_MESSAGE_AGE_SEC;
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

// שליחת התראת נסיעה לנהג (100% אמינות, הגעה מיידית ללא בליעת הודעות בוואטסאפ).
async function deliverRideAlert(driverSock, driverPhone, rideData, originalMsg) {
  const alertMsg = buildRideAlertText(rideData);
  const driverJid = getDestinationJid(driverPhone);
  const attempts = [];

  const mainSock = getMainBotSock();
  if (mainSock && getMainBotStatus().connected) attempts.push({ via: "main", sock: mainSock });
  if (driverSock) attempts.push({ via: "driver-self", sock: driverSock });

  let lastError = null;
  for (const a of attempts) {
    try {
      const sentMsg = await trySend(a.sock, driverJid, { text: alertMsg }, originalMsg);
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
          searchDesc: rideData.searchDesc,
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
    reportMsg += `🚕 *הנסיעה שנשלחה:*\n${alertInfo.rideData.cleanedText}\n`;
    reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
    if (alertInfo.rawText && alertInfo.rawText !== alertInfo.rideData.cleanedText) {
      reportMsg += `📌 *טקסט גולמי מקורי:*\n${alertInfo.rawText}\n`;
      reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
    }
    reportMsg += `👤 *נהג מדווח:* ${alertInfo.driverPhone}\n`;
    reportMsg += `📍 *קבוצה:* ${alertInfo.groupName}\n`;
    reportMsg += `🏷️ *סדרן:* ${alertInfo.senderName} (${alertInfo.senderPhone})\n`;
    reportMsg += `🔍 *חיפוש שהיה מוגדר:* ${alertInfo.searchDesc}\n`;
    reportMsg += `⏱️ *זמן הדיווח:* ${nowFormatted}\n`;
    reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
    reportMsg += `💡 המשתמש סימן 👎 ישירות על הודעת הבוט. הועבר אוטומטית לטיפול בבאג.`;

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
  menuText += `🛑 *תפוס* או *ת* (עצירת כל החיפושים)\n\n`;
  menuText += `🔗 *לקישור הוואטסאפ שלך:* השב *"חבר אותי"*`;

  await sock.sendMessage(jid, { text: menuText });
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

    // התעלמות מהודעות היסטוריות ישנות בעת אתחול
    if (upsert.type && upsert.type !== "notify") continue;
    if (isStaleMessage(m)) continue;

    const isGroup = jid.endsWith("@g.us");

    // הבוט הראשי אינו סורק קבוצות כלל! קבוצות נסרקות אך ורק ע"י חשבון הנהג
    if (isGroup && sessionContext.isMainBot) {
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
      const isSenderLid = isLid(jid) || isLid(senderPhone);

      // 1. זיהוי שקט של מספר אמיתי מתוך מזהה LID
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
            text: `🛠️ *מספר ניהול*\n\nפקודות זמינות:\n• *אשר 972501234567*\n• *דחה 972501234567*\n• *עדכן 972501234567 ל 972507654321*`
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

      if (!isDriverConnected) {
        if (connectMatch) {
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
              onEvent: recordEvent,
            });
            await sendPairingCodeMessages(sock, jid, code, m);
            recordEvent("system", `נוצר קוד חיבור נהג עבור ${phoneForPairing}`);
          } catch (err) {
            await sock.sendMessage(jid, {
              text: `⚠️ לא ניתן היה להפיק קוד חיבור כעת: ${err.message}\nנסה שוב בעוד מספר רגעים או פנה למנהל.`
            });
          }
          continue;
        }

        if (norm === "תפריט" || norm === "menu" || norm === "עזרה") {
          let unlinkedMenu = `🚕 *נסיעות בוט איכותי - תפריט*\n\n`;
          unlinkedMenu += `📊 *סטטוס חשבון:* ✅ מאושר במערכת\n`;
          unlinkedMenu += `📲 *סטטוס וואטסאפ:* ⚪ לא מחובר (נדרש חיבור ראשוני)\n\n`;
          unlinkedMenu += `כדי שנוכל לסרוק עבורך נסיעות מקבוצות הוואטסאפ שלך:\n`;
          unlinkedMenu += `👉 השב עכשיו *"חבר אותי"*`;
          await sock.sendMessage(jid, { text: unlinkedMenu }, { quoted: m });
          continue;
        }

        const lastPromptTime = recentUnlinkedPrompts.get(senderPhone) || 0;
        const now = Date.now();
        if (now - lastPromptTime > 30 * 60 * 1000) {
          recentUnlinkedPrompts.set(senderPhone, now);
          const unlinkedPrompt = `שלום ${pushName}! 👋\n\n` +
            `🎉 *חשבונך מאושר, אך הוואטסאפ שלך עדיין אינו מחובר לסריקת נסיעות.*\n\n` +
            `👉 להתחלה השב *"חבר אותי"* ותקבל קוד צימוד בן 8 תווים.`;
          await sock.sendMessage(jid, { text: unlinkedPrompt }, { quoted: m });
        }
        continue;
      }

      // ==============================================================
      // נהג מאושר שהוואטסאפ שלו מחובר
      // ==============================================================
      if (connectMatch) {
        await sock.sendMessage(jid, {
          text: `✅ הוואטסאפ שלך כבר מחובר ומסונכרן למערכת.\nשלח פקודות חיפוש כגון *"פנוי שמש"*, *"פנוי שמש פנימי"*, *"פ ים שמש"*, או *"תפריט"*.`
        }, { quoted: m });
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

      let targetAlertInfo = quotedStanzaId ? sentAlertsCache.get(quotedStanzaId) : null;
      if (!targetAlertInfo && (norm === "תן" || norm === "קח" || norm === "תן לי" || norm === "שלי" || norm === "קח_נסיעה" || norm === "claim_ride")) {
        targetAlertInfo = getLatestAlertForDriver(senderPhone);
      }

      const isClaimIntent = (norm === "תן" || norm === "קח" || norm === "תן לי" || norm === "שלי" ||
        norm === "קח_נסיעה" || norm === "claim_ride") || (norm === "ת" && quotedStanzaId && targetAlertInfo);

      if (isClaimIntent && targetAlertInfo) {
        const driverSession = getDriverSession(senderPhone);
        const driverSock = driverSession?.sock;

        let sentDirect = false;
        let sentInGroup = false;
        const sentDirectPhones = [];

        // הכנת אובייקט הציטוט הרשמי של הודעת הנסיעה המקורית
        const quoteObj = buildQuotedRideMessage(targetAlertInfo);

        // שליחה אוטומטית מחשבון הוואטסאפ של הנהג
        if (driverSock && driverSession?.status === "connected") {
          // 1. שליחת תגובת "תן" בקבוצה שבה פורסמה הנסיעה (עם ציטוט מלא של הודעת הנסיעה)
          if (targetAlertInfo.groupJid) {
            const okGroup = await sendRideClaimReply(driverSock, targetAlertInfo.groupJid, "תן", quoteObj);
            if (okGroup) sentInGroup = true;
          }

          // 2. שליחת תגובה אישית לסדרן שפרסם את הנסיעה (לא סתם הודעה, אלא תגובה המצטטת את הודעת הנסיעה שלו!)
          const directRecipients = new Set();

          // א. הסדרן שפרסם את ההודעה בקבוצה
          const senderPhoneClean = cleanPhone(targetAlertInfo.senderPhone);
          if (senderPhoneClean && senderPhoneClean.length >= 9 && !isLid(senderPhoneClean) && senderPhoneClean !== "זמין בקבוצה") {
            directRecipients.add(senderPhoneClean);
          }

          // ב. טלפון ישיר שצוין בתוכן ההודעה (אם שונה, למשל "לבקש פה 0507787427")
          const textPhone = extractDispatcherContact(targetAlertInfo);
          if (textPhone && textPhone.length >= 9 && !isLid(textPhone)) {
            directRecipients.add(cleanPhone(textPhone));
          }

          for (const p of directRecipients) {
            const targetJid = `${p}@s.whatsapp.net`;
            const okDirect = await sendRideClaimReply(driverSock, targetJid, "תן", quoteObj);
            if (okDirect) {
              sentDirect = true;
              sentDirectPhones.push(p);
            }
          }
        }

        let claimReply = `🚕 *נסיעה נתפסה! בהצלחה!*\n\n`;
        if (sentInGroup) {
          claimReply += `✅ נשלחה תגובת *"תן"* עם ציטוט בקבוצה: *${targetAlertInfo.groupName}*\n`;
        }
        if (sentDirect) {
          claimReply += `✅ נשלחה תגובה אישית לסדרן (${sentDirectPhones.join(", ")}) המצטטת את הודעת הנסיעה שלו!\n`;
        }
        if (!sentDirect && !sentInGroup) {
          if (!driverSock || driverSession?.status !== "connected") {
            claimReply += `⚠️ וואטסאפ הנהג שלך אינו מחובר למערכת (שלח *"חבר אותי"* לחיבור כדי שהבוט יוכל להגיב בשמך).\n`;
          } else {
            claimReply += `⚠️ לא זוהה מספר סדרן ישיר ואין גישת כתיבה בקבוצה.\n`;
          }
        }

        claimReply += `\n📍 *קבוצה:* ${targetAlertInfo.groupName}\n`;
        claimReply += `👤 *סדרן:* ${targetAlertInfo.senderName} (${targetAlertInfo.senderPhone})`;

        await sock.sendMessage(jid, { text: claimReply }, { quoted: m });
        recordEvent("command", `נהג ${senderPhone} תפס נסיעה של סדרן ${targetAlertInfo.senderPhone} (קבוצה: ${sentInGroup}, פרטי: ${sentDirect})`);
        continue;
      }

      if (norm === "ת" || /(^| )(תפוס|עצור|סגור)( |$)/.test(norm)) {
        stopUserSearch(senderPhone);
        recordEvent("command", `חיפוש הופסק ע"י ${pushName} (${senderPhone})`);
        await sock.sendMessage(jid, { text: `🛑 *החיפוש הופסק בהצלחה!* (מצב תפוס)\nלחזרה כתוב "פנוי..." או "תפריט".` }, { quoted: m });
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
          await sock.sendMessage(jid, { text: msg }, { quoted: m });
          continue;
        }

        // אפשרות ב': החלפה (רק החיפוש החדש)
        if (norm === "2" || norm === "החלף" || norm === "רק זה" || norm === "החלפה") {
          const res = confirmPendingSearch(senderPhone, true);
          const s = res.current.searches[0];
          let msg = `🔄 *החיפושים הוחלפו בהצלחה!*\n\n🔍 *חיפוש פעיל כעת:*\n1. ${s.displayText} (${describeMode(s)})\n\nברגע שתעלה נסיעה מתאימה - תקבל התראה מיידית.`;
          recordEvent("command", `הוחלף חיפוש עבור ${senderPhone}: ${s.displayText}`);
          await sock.sendMessage(jid, { text: msg }, { quoted: m });
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
          await sock.sendMessage(jid, { text: msg }, { quoted: m });
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
          let responseMsg = `✅ *החיפוש הופעל בהצלחה:*\n\n`;
          responseMsg += `🔍 *מוגדר:* ${parsed.displayText}\n`;
          responseMsg += `📌 *סינון:* ${describeMode(parsed)}\n\n`;
          responseMsg += `ברגע שתעלה נסיעה מתאימה בקבוצות שלך - תקבל התראה מיידית.\n\n`;
          responseMsg += `💡 *רוצה לחפש מסלול נוסף במקביל?* פשוט שלח פקודה נוספת (למשל: "פ ים בב").`;

          console.log(`[פקודת נהג ${senderPhone}]: "${text}" -> ${parsed.mode} | ${parsed.displayText}`);
          recordEvent("command", `הופעל חיפוש עבור ${senderPhone}: ${parsed.displayText}`);

          await sock.sendMessage(jid, { text: responseMsg }, { quoted: m });
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

      const search = getUserSearch(senderPhone);
      let userDefaultMsg = `שלום ${pushName}! 👋\n\n`;
      userDefaultMsg += `סטטוס החיפוש שלך: ${search.active ? "🟢 סורק עבור: " + search.displayText : "🔴 מופסק (תפוס)"}\n\n`;
      userDefaultMsg += `שלח למשל: *"פנוי שמש"*, *"פנוי שמש פנימי"*, *"פ ים שמש"*, או *"שמש צמצם"* כדי לקבל נסיעות.\n`;
      userDefaultMsg += `להצגת כל האפשרויות שלח: *"תפריט"*.`;

      await sock.sendMessage(jid, { text: userDefaultMsg }, { quoted: m });
      continue;
    }

    // ----------------------------------------------------
    // חלק ב': סריקת קבוצות בזמן אמת אך ורק מחשבון הנהג המקושר!
    // ----------------------------------------------------
    if (isGroup && !sessionContext.isMainBot && sessionContext.driverPhone) {
      const driverPhone = sessionContext.driverPhone;
      const driverSearch = getUserSearch(driverPhone);

      // סורקים אך ורק אם לנהג זה יש חיפוש פעיל!
      if (!driverSearch.active) {
        continue;
      }

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

      const junk = detectNonRide(cleanedText);
      if (junk) {
        if (DEBUG_FILTER) console.log(`[נדחה ${driverPhone}] ${junk} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
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

      const rideSenderPhone = await getRealSenderPhone(sock, jid, m);
      const rideSenderName = m.pushName || "סדרן";

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
  purgeAllDriverSessions: () => {
    return purgeAllDriverSessions();
  },
  ensureDriverSessionForQr: async (phone) => {
    return await ensureDriverSessionForQr(phone, {
      onRideMessage: handleIncomingMessage,
      onReaction: handleReaction,
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
  }
});

// הפעלת הבוט הראשי ושחזור סשנים שמורים של נהגים
async function boot() {
  console.log("🚀 מאתחל מערכת ריבוי וואטסאפ (Multi-Session Baileys)...");

  // 1. הפעלת הבוט הראשי
  await startMainBot({
    onMessage: handleIncomingMessage,
    onReaction: handleReaction,
    onStatusChange: (status) => {
      console.log(`[בוט ראשי] סטטוס חיבור: ${status.connected ? "מחובר ✅" : "מנותק ❌"}`);
    },
    onEvent: recordEvent,
  });

  // 2. שחזור סשנים שמורים של נהגים
  await initSavedDriverSessions({
    onRideMessage: handleIncomingMessage,
    onReaction: handleReaction,
    onEvent: recordEvent,
  });
}

boot().catch((err) => {
  console.error("שגיאה בהפעלת הבוט:", err);
});
