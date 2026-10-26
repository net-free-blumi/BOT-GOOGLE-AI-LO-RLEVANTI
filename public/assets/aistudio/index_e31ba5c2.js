import cron from "node-cron";
import fs from "node:fs";
import { normalizeText, parseDriverCommand, rideMatches, findPlaces } from "./matcher.js";
import { createDeduper } from "./dedupe.js";
import { startDashboard, recordEvent, recordError } from "./dashboard-api.js";
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
  resetUserCooldown
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

// המטמון נשמר לדיסק כדי שדיסלייק על הודעה ישנה יעבוד גם אחרי הפעלה מחדש של השרת
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

// זיהוי הודעות שברור שאינן נסיעה: פרסומות, הזמנות לקבוצות, קישורי רכישה והודעות ארוכות במיוחד
function detectNonRide(cleaned) {
  const t = String(cleaned || "");
  if (t.length > 700) return "הודעה ארוכה מדי - לא נסיעה";
  if (/chat\.whatsapp\.com\//i.test(t)) return "קישור הזמנה לקבוצה - לא נסיעה";
  if (/aliexpress|amazon\.|amzn\.to|s\.click\.|temu\.|shein\./i.test(t)) return "פרסומת / קישור רכישה - לא נסיעה";
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

  // לנהגים מאושרים שלא היה להם חיפוש - רק מוודאים שהמצב נקי
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
  // נסיון שליחה דרך הסוקט הנוכחי
  if (sock) {
    try {
      await sock.sendMessage(BUG_REPORT_GROUP_JID, { text: reportText });
      return true;
    } catch (e) {
      console.log("סוקט מקומי לא הצליח לשלוח לקבוצת הבאגים, מנסה סוקט ראשי:", e.message);
    }
  }

  // נסיון גיבוי דרך הבוט הראשי
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

function buildRideAlertText(rideData) {
  // הנסיעה עצמה בלבד, בלי כותרת ובלי קווים מפרידים - ומתחתיה שורות מקור קצרות
  let alertMsg = `${rideData.cleanedText}\n\n`;
  alertMsg += `📍 ${rideData.groupName}\n`;
  alertMsg += `👤 ${rideData.senderName} · ${rideData.senderPhone}`;
  return alertMsg;
}

// שליחת הודעה עם ניסיון ציטוט, ובמקרה כשל - בלי ציטוט. מחזיר את ההודעה שנשלחה או null.
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

// שליחת התראת נסיעה לנהג.
// עדיפות 1: הבוט הראשי (הודעה רגילה שמגיעה עם התראה לטלפון של הנהג).
// עדיפות 2 (גיבוי): חשבון הנהג עצמו ל"הודעה לעצמי" (לא מקפיצה התראה, לכן רק גיבוי).
// מחזיר { ok, via, error } - ורק על הצלחה אמיתית נרשם "נשלח" באתר.
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
          senderName: rideData.senderName,
          senderPhone: rideData.senderPhone,
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

// טיפול בתגובות אימוג'י על הודעות (העברת דיסלייק 👎 לקבוצת התיקונים)
const handledReactions = new Map(); // מניעת דיווח כפול על אותה תגובה (Baileys מפעיל גם upsert וגם messages.reaction)

export async function handleReaction(sock, reactions, sessionContext = {}) {
  const items = Array.isArray(reactions) ? reactions : [reactions];

  for (const item of items) {
    if (!item) continue;
    const reactionText = item.reaction?.text ?? item.text ?? "";
    const targetMsgId = item.reaction?.key?.id || item.key?.id;

    if (!targetMsgId) continue;

    // רק דיסלייק, ורק על הודעת נסיעה שהבוט עצמו שלח. תגובות על כל הודעה אחרת - ובמיוחד
    // תגובות של חברי קבוצות על הודעות בקבוצות - מתעלמים לחלוטין.
    if (!reactionText.includes("👎")) continue;
    const reactionChat = item.reaction?.key?.remoteJid || item.key?.remoteJid || "";
    if (String(reactionChat).endsWith("@g.us")) continue;
    const alertInfo = sentAlertsCache.get(targetMsgId);
    if (!alertInfo) continue;

    const dedupeKey = `${targetMsgId}|${reactionText}`;
    const nowTs = Date.now();
    if (handledReactions.has(dedupeKey) && nowTs - handledReactions.get(dedupeKey) < 30000) continue;
    handledReactions.set(dedupeKey, nowTs);
    if (handledReactions.size > 500) handledReactions.delete(handledReactions.keys().next().value);

    {
      console.log(`👎 [דיסלייק על הודעת בוט] ${targetMsgId} מנהג: ${alertInfo.driverPhone}`);
      const nowFormatted = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

      let reportMsg = `🐞 *דיווח תקלה / נסיעה לא רלוונטית (דיסלייק 👎)*\n`;
      reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;

      if (alertInfo) {
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
      } else {
        reportMsg += `⚠️ *מזהה הודעה:* ${targetMsgId}\n`;
        reportMsg += `👤 *נהג מדווח:* ${sessionContext.driverPhone || "מחובר"}\n`;
        reportMsg += `(פרטי הנסיעה המדויקים לא נמצאו במטמון - ייתכן שנשלחה לפני הפעלה מחדש)\n`;
      }

      reportMsg += `⏱️ *זמן הדיווח:* ${nowFormatted}\n`;
      reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
      reportMsg += `💡 המשתמש סימן 👎 ישירות על הודעת הבוט. הועבר אוטומטית לטיפול בבאג.`;

      const sent = await sendBugReportToGroup(sock, reportMsg);
      console.log(`📤 [דיווח לקבוצת תיקונים 120363402521442927@g.us]: ${sent ? "נשלח בהצלחה ✅" : "כשל בשליחה ❌"}`);
      recordEvent("system", `נשלח דיווח 👎 לקבוצת התיקונים עבור הודעה ${targetMsgId}`);

      // שליחת אישור חוזר לנהג (אימוג'י 🫡 או 👍 להודעה כדי שיידע שהדיווח נקלט)
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
}

// שליחת הודעת אישור הצטרפות והדרכת קישור ווב לנהג (תמיכה מלאה במספרי טלפון וב-Meta LID)
export async function sendApprovalAndOnboarding(targetPhone, targetName = "נהג") {
  const sock = getMainBotSock();
  if (!sock) return;

  // מספר המנהל משמש לניהול בלבד - לעולם לא שולחים אליו הדרכות חיבור
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

    // נסיון שליחה חלופי במידה ומדובר ב-LID שנכשל
    try {
      const altJid = recipientJid.endsWith("@lid") 
        ? `${cleanPhone(targetPhone)}@s.whatsapp.net` 
        : `${cleanPhone(targetPhone)}@lid`;
      await sock.sendMessage(altJid, { text: welcomeText });
      recordEvent("command", `הודעת אישור נשלחה ביעד חלופי: ${altJid}`);
    } catch (err2) {
      recordError("send_approval_alt", err2, { targetPhone, altJid: recipientJid });
    }
  }
}

// שליחת הודעת תפריט / עזרה ברורה עם פקודות מהירות
async function sendHelpMenu(sock, jid, driverPhone) {
  const search = getUserSearch(driverPhone);
  let menuText = `🚕 *תפריט נסיעות בוט איכותי*\n\n`;
  menuText += `📊 *סטטוס נוכחי שלך:* ${search.active ? "🟢 פעיל (" + search.displayText + ")" : "🔴 מופסק (תפוס)"}\n\n`;
  menuText += `🔍 *פקודות חיפוש נפוצות:*\n`;
  menuText += `• *פנוי שמש פנימי* (רק פנימי בית שמש)\n`;
  menuText += `• *פנימי ים* (רק פנימי ירושלים)\n`;
  menuText += `• *פ ים שמש* (מירושלים לבית שמש)\n`;
  menuText += `• *שמש צמצם* (פנימי ויוצא מבית שמש)\n`;
  menuText += `• *תפוס* או *ת* (עצירת חיפוש מידית)\n\n`;
  menuText += `🔗 *לקישור הוואטסאפ שלך:* השב *"חבר אותי"*`;

  await sock.sendMessage(jid, { text: menuText });
}

// פענוח מותאם של פקודת נהג כולל טיפול בכינויים: ים, שמש, בב, מוע, תא, צמצם
function processDriverCommand(text) {
  let modifiedText = text;
  
  modifiedText = modifiedText.replace(/(^|\s)ים(\s|$)/gi, " ירושלים ");
  modifiedText = modifiedText.replace(/(^|\s)שמש(\s|$)/gi, " בית שמש ");
  modifiedText = modifiedText.replace(/(^|\s)בב(\s|$)/gi, " בני ברק ");
  modifiedText = modifiedText.replace(/(^|\s)(מוע|מו"ע)(\s|$)/gi, " מודיעין עילית ");
  modifiedText = modifiedText.replace(/(^|\s)(תא|ת"א)(\s|$)/gi, " תל אביב ");
  modifiedText = modifiedText.replace(/(^|\s)(פת|פ"ת)(\s|$)/gi, " פתח תקווה ");

  const shorthandRoute = modifiedText.match(/^(?:פ|פנוי)\s+([א-ת]+)\s+([א-ת]+)$/);
  if (shorthandRoute) {
    const o = shorthandRoute[1];
    const d = shorthandRoute[2];
    if (d === "פנימי") modifiedText = `פנוי פ ${o}`;
    else if (o === "פנימי") modifiedText = `פנוי פ ${d}`;
    else modifiedText = `פנוי ${o} ל${d}`;
  }

  const parsed = parseDriverCommand(modifiedText);
  return parsed;
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
  if (state.mode === "internal") return `רק נסיעות פנימיות בתוך ${state.origin}`;
  if (state.mode === "reduce") return `מצב צמצום: נסיעות פנימיות ויוצאות מ${state.origin}`;
  if (state.mode === "route") return `רק נסיעות מ${state.origin} ל${state.destination}`;
  return `נסיעות שיוצאות מ${state.origin} (בתוך העיר ומחוצה לה)`;
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

// שליחת הודעת מדריך ומייד לאחריה הודעה נפרדת עם הקוד בלבד להעתקה בלחיצה אחת
export async function sendPairingCodeMessages(sock, jid, code, quotedMsg) {
  const instructions = getPairingGuideInstructions();
  if (quotedMsg) {
    await sock.sendMessage(jid, { text: instructions }, { quoted: quotedMsg });
  } else {
    await sock.sendMessage(jid, { text: instructions });
  }
  // שליחת הקוד בן 8 התווים בלבד כהודעה בודדת - מאפשר העתקה והדבקה ישירה בטאפ אחד!
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

    // סטטוסים (סטוריז), רשימות תפוצה וערוצים אינם בקשות - מתעלמים לחלוטין
    if (isIgnorableJid(jid)) continue;

    // היסטוריה / סנכרון אחרי התחברות מחדש (append) והודעות ישנות - לא מטופלות
    if (upsert.type && upsert.type !== "notify") continue;
    if (isStaleMessage(m)) continue;

    const isGroup = jid.endsWith("@g.us");

    // הבוט הראשי אינו סורק קבוצות כלל! קבוצות נסרקות אך ורק ע"י חשבון הנהג המקושר
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

      // 1. זיהוי שקט של המספר האמיתי מתוך מזהה LID - רק ממה שוואטסאפ עצמה מספקת.
      // לא מנתחים מספרי טלפון מתוך טקסט שהמשתמש שלח, ולא שולחים על כך שום הודעה (לא למשתמש ולא למנהל).
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

      // 2. מספר המנהל משמש לניהול בלבד: אישור / דחייה / עדכון - ותו לא.
      // שום הדרכת חיבור, קוד צימוד, חיפוש נסיעות או הודעות "משתמש לא מאושר" לא נשלחות למנהל.
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
        continue; // כל הודעה אחרת מהמנהל - שקט
      }

      // 3. משתמש שטרם אושר: תשובה אחת (עם צינון) + התראה אחת למנהל רק על בקשה חדשה באמת
      if (!isApproved) {
        const canReply = canReplyToUnapproved(senderPhone);
        if (!canReply) {
          continue; // שקט מוחלט! מונע הצפת הודעות
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

      // 4. נהג מאושר: האם סשן הוואטסאפ שלו מחובר בפועל
      const isDriverConnected = isDriverSessionConnected(senderPhone);

      // פקודת חיבור מפורשת בלבד: "חבר אותי" / "קוד חדש" / "חיבור" / "קוד" / "ווב"
      // אופציונלי עם מספר: "חבר אותי 0521234567" (נדרש רק למי שמזוהה במזהה חסוי LID).
      // מספר טלפון שנשלח סתם כך - לא עושה כלום.
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

        // כל הודעה אחרת: הנחיה אחת מנומסת, עם צינון של 30 דקות (ללא חיפוש מזויף)
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
          text: `✅ הוואטסאפ שלך כבר מחובר ומסונכרן למערכת.\nשלח פקודות חיפוש כגון *"פנוי שמש פנימי"*, *"פ ים שמש"*, או *"תפריט"*.`
        }, { quoted: m });
        continue;
      }

      if (norm === "תפריט" || norm === "menu" || norm === "עזרה") {
        await sendHelpMenu(sock, jid, senderPhone);
        continue;
      }

      if (norm === "ת" || /(^| )(תפוס|עצור|סגור)( |$)/.test(norm)) {
        stopUserSearch(senderPhone);
        recordEvent("command", `חיפוש הופסק ע"י ${pushName} (${senderPhone})`);
        await sock.sendMessage(jid, { text: `🛑 *החיפוש הופסק בהצלחה!* (מצב תפוס)\nלחזרה כתוב "פנוי..." או "תפריט".` }, { quoted: m });
        continue;
      }

      if (norm.startsWith("פנוי") || norm.includes("מחפש") || norm.includes("צמצם") || norm.includes("פנימי") || /^פ /.test(norm) || / פ$/.test(norm)) {
        const parsed = processDriverCommand(text);
        const nextState = { active: true, ...parsed };
        setUserSearch(senderPhone, nextState);

        let responseMsg = `✅ *החיפוש הופעל בהצלחה:*\n\n`;
        responseMsg += `🔍 *מוגדר:* ${nextState.displayText}\n`;
        responseMsg += `📌 *סינון:* ${describeMode(nextState)}\n\n`;
        responseMsg += `ברגע שתעלה נסיעה מתאימה בקבוצות שלך - תקבל התראה מיידית.`;

        console.log(`[פקודת נהג ${senderPhone}]: "${text}" -> ${nextState.mode} | ${nextState.displayText}`);
        recordEvent("command", `הופעל חיפוש עבור ${senderPhone}: ${nextState.displayText}`);

        await sock.sendMessage(jid, { text: responseMsg }, { quoted: m });
        continue;
      }

      const search = getUserSearch(senderPhone);
      let userDefaultMsg = `שלום ${pushName}! 👋\n\n`;
      userDefaultMsg += `סטטוס החיפוש שלך: ${search.active ? "🟢 סורק עבור: " + search.displayText : "🔴 מופסק (תפוס)"}\n\n`;
      userDefaultMsg += `שלח למשל: *"פנוי שמש פנימי"*, *"פ ים שמש"*, או *"שמש צמצם"* כדי לקבל נסיעות.\n`;
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

      // ניקוי פרסומות/פוטר דרייבוט לפני כל בדיקה, כדי שמילים מהפרסומות לא ישפיעו על ההתאמה
      const cleanedText = cleanSpamFromRide(text);

      const junk = detectNonRide(cleanedText);
      if (junk) {
        if (DEBUG_FILTER) console.log(`[נדחה ${driverPhone}] ${junk} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
        continue;
      }

      const verdict = rideMatches(cleanedText, driverSearch, groupName);

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
        senderName: rideSenderName,
        senderPhone: rideSenderPhone,
        searchDesc: driverSearch.displayText,
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
