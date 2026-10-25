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
  shouldNotifyAdminInitial,
  shouldNotifyAdminPhoneProvided,
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

// איפוס יומי ב-2:00 בלילה
cron.schedule("0 2 * * *", async () => {
  const users = loadUsersData();
  for (const u of users.approvedUsers || []) {
    stopUserSearch(u.phone);
  }
  deduper.clear();
  groupMetadataCache.clear();
  // שמירת רק 100 הודעות אחרונות במטמון
  if (sentAlertsCache.size > 100) {
    const keys = Array.from(sentAlertsCache.keys());
    for (let i = 0; i < keys.length - 100; i++) {
      sentAlertsCache.delete(keys[i]);
    }
  }
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

// שליחת התראת נסיעה נקייה ומדויקת (ללא שורות מיותרות) עם ציטוט ההודעה המקורית
async function sendRideAlertWithQuoted(sock, recipientJid, rideData, originalMsg) {
  if (!sock) return null;

  // הודעה נקייה וממוקדת בדיוק כפי שהמשתמש ביקש - ללא הוראות חוזרות בתחתית
  let alertMsg = `🚕 *נסיעה מתאימה נמצאה!*\n`;
  alertMsg += `──────────────────\n`;
  alertMsg += `${rideData.cleanedText}\n`;
  alertMsg += `──────────────────\n`;
  alertMsg += `📍 *קבוצה:* ${rideData.groupName}\n`;
  alertMsg += `👤 *סדרן:* ${rideData.senderName} · ${rideData.senderPhone}\n`;
  alertMsg += `🔍 *חיפוש:* ${rideData.searchDesc}`;

  let sentMsg = null;
  try {
    // שליחה עם ציטוט מלא של ההודעה מהקבוצה (מאפשר קפיצה ישירה לקבוצה בלחיצה)
    if (originalMsg) {
      sentMsg = await sock.sendMessage(recipientJid, { text: alertMsg }, { quoted: originalMsg });
    } else {
      sentMsg = await sock.sendMessage(recipientJid, { text: alertMsg });
    }
  } catch (err) {
    try {
      sentMsg = await sock.sendMessage(recipientJid, { text: alertMsg });
    } catch (e) {
      console.error(`שגיאה בשליחת התראה ל-${recipientJid}:`, e.message);
    }
  }

  // שמירה במטמון לזיהוי מהיר של דיסלייק (👎)
  if (sentMsg?.key?.id) {
    sentAlertsCache.set(sentMsg.key.id, {
      msgId: sentMsg.key.id,
      rideData,
      rawText: rideData.rawText || rideData.cleanedText,
      driverPhone: rideData.driverPhone || recipientJid.split("@")[0].split(":")[0],
      groupName: rideData.groupName,
      senderName: rideData.senderName,
      senderPhone: rideData.senderPhone,
      searchDesc: rideData.searchDesc,
      sentAt: Date.now()
    });

    if (sentAlertsCache.size > 2000) {
      const oldestKey = sentAlertsCache.keys().next().value;
      sentAlertsCache.delete(oldestKey);
    }
  }

  return sentMsg;
}

// טיפול בתגובות אימוג'י על הודעות (העברת דיסלייק 👎 לקבוצת התיקונים)
export async function handleReaction(sock, reactions, sessionContext = {}) {
  const items = Array.isArray(reactions) ? reactions : [reactions];

  for (const item of items) {
    if (!item) continue;
    const reactionText = item.reaction?.text ?? item.text ?? "";
    const targetMsgId = item.reaction?.key?.id || item.key?.id;

    if (!targetMsgId) continue;

    // האם נבחר אימוג'י דיסלייק (👎)?
    if (reactionText === "👎" || reactionText.includes("👎")) {
      console.log(`👎 [דיסלייק נלכד!] על הודעה ${targetMsgId} מנהג: ${sessionContext.driverPhone || "לא ידוע"}`);

      const alertInfo = sentAlertsCache.get(targetMsgId);
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

  const recipientJid = getDestinationJid(targetPhone);
  const isTargetLid = isLid(targetPhone) || recipientJid.endsWith("@lid");

  let welcomeText = `🎉 *שלום ${targetName}! חשבונך אושר בהצלחה במערכת.*\n\n` +
    `ברוך הבא ל*נסיעות בוט איכותי* 🚕\n\n` +
    `📲 *חיבור הוואטסאפ שלך לסריקת קבוצות הנסיעות:*\n`;

  if (isTargetLid) {
    welcomeText += `כדי להפיק קוד צימוד מהיר למכשירים מקושרים, וואטסאפ דורשת מספר סלולרי רגיל (ולא מזהה חסוי).\n\n` +
      `👉 *אנא השב עכשיו להודעה זו עם מספר הטלפון שלך* (למשל: 0521234567).\n` +
      `מיד לאחר מכן נפיק עבורך את קוד הצימוד בן 8 ספרות והסבר פשוט לחיבור תוך 10 שניות!`;
  } else {
    welcomeText += `כדי שהמערכת תסרוק נסיעות ישירות מכל קבוצות הנסיעות שאתה חבר בהן, השב עכשיו למספר זה:\n\n` +
      `👉 *"חבר אותי"*\n\n` +
      `מיד תקבל קוד צימוד בן 8 ספרות והסבר פשוט איך להזין אותו בוואטסאפ במכשירים מקושרים (תוך 10 שניות וללא צורך במחשב!).\n\n` +
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
  menuText += `🔗 *לקישור הוואטסאפ שלך:* השב *"חבר אותי"*\n`;
  menuText += `📱 *לעדכון מספר טלפון:* שלח את מספרך (למשל: 0521234567)`;

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

    const isGroup = jid.endsWith("@g.us");

    // ----------------------------------------------------------------------------------
    // כלל מתכונת חדשה: הבוט הראשי אינו סורק קבוצות כלל! קבוצות נסרקות אך ורק ע"י חשבון הנהג!
    // ----------------------------------------------------------------------------------
    if (isGroup && sessionContext.isMainBot) {
      continue;
    }

    let text = (
      m.message?.conversation || 
      m.message?.extendedTextMessage?.text || 
      m.message?.buttonsResponseMessage?.selectedButtonId ||
      m.message?.templateButtonReplyMessage?.selectedId ||
      ""
    ).trim();

    if (!text && !m.message?.contactMessage) continue;

    const pushName = m.pushName || "משתמש";

    // ----------------------------------------------------
    // חלק א': הודעות פרטיות מול הבוט הראשי (פניות משתמשים וניהול)
    // ----------------------------------------------------
    if (!isGroup && sessionContext.isMainBot) {
      const usersData = loadUsersData();
      let senderPhone = cleanPhone(jid);
      const isSenderLid = isLid(jid) || isLid(senderPhone);

      // 1. טיפול בחילוץ מספר טלפון ישראלי אמיתי (פתרון Meta LID מלא ב-1 על 1)
      let detectedPhone = null;

      // בדיקה א': האם Baileys מספק את מספר הטלפון המקורי ב-m.key (remoteJidAlt, participantPN, participantAlt)
      const key = m.key || {};
      for (const candidate of [key.remoteJidAlt, key.participantAlt, key.participantPN, key.addressingIdentity, m.participant]) {
        if (!candidate) continue;
        const cPhone = cleanPhone(candidate);
        if (cPhone && cPhone.length >= 9 && cPhone.length <= 12 && !isLid(candidate) && !isLid(cPhone)) {
          detectedPhone = cPhone;
          break;
        }
      }

      // בדיקה ב': שאילתת signalRepository lidMapping של Baileys
      if (!detectedPhone && (isSenderLid || isLid(jid))) {
        try {
          const pnFromLid = await sock.signalRepository?.lidMapping?.getPNForLID(jid);
          if (pnFromLid) {
            const num = cleanPhone(pnFromLid);
            if (num && !isLid(num) && num.length >= 9 && num.length <= 12) {
              detectedPhone = num;
            }
          }
        } catch (e) {}

        if (!detectedPhone) {
          try {
            const rawLid = String(jid).split("@")[0].split(":")[0];
            const pnFromRaw = await sock.signalRepository?.lidMapping?.getPNForLID(rawLid);
            if (pnFromRaw) {
              const num = cleanPhone(pnFromRaw);
              if (num && !isLid(num) && num.length >= 9 && num.length <= 12) {
                detectedPhone = num;
              }
            }
          } catch (e) {}
        }
      }

      // בדיקה ג': כרטיס איש קשר (vCard)
      if (!detectedPhone && m.message?.contactMessage?.vcard) {
        const vcard = m.message.contactMessage.vcard;
        const match = vcard.match(/waid=(\d+)/i) || vcard.match(/TEL[^:]*:([+\d\s-]+)/i);
        if (match) detectedPhone = cleanPhone(match[1]);
      }

      // בדיקה ד': זיהוי גמיש ומדויק של מספר סלולרי ישראלי מתוך טקסט ההודעה
      if (!detectedPhone) {
        const phoneMatch = text.match(/(?:(?:\+?972|0)[\s-]?)?5\d(?:[\s-]?\d){7}/);
        if (phoneMatch) {
          detectedPhone = cleanPhone(phoneMatch[0]);
        }
      }

      // אם זוהה מספר טלפון אמיתי: מבצעים מיפוי אוטומטי, מעדכנים את senderPhone, ומאפסים צינון
      if (detectedPhone && isSenderLid) {
        registerLidMapping(jid, detectedPhone);
        resetUserCooldown(detectedPhone);
        resetUserCooldown(jid);
        senderPhone = detectedPhone;
        recordEvent("system", `מספר טלפון זוהה ומופה אוטומטית מ-LID: ${jid} -> ${detectedPhone}`);

        // אם המשתמש שלח טקסט ידני, נודיע לו שהמספר אומת
        if (text && text.match(/(?:(?:\+?972|0)[\s-]?)?5\d(?:[\s-]?\d){7}/)) {
          await sock.sendMessage(jid, { 
            text: `✅ תודה ${pushName}! מספר הטלפון שלך (*${detectedPhone}*) אומת בהצלחה במערכת.` 
          }, { quoted: m });
        }

        // התראה יחידה ומסודרת למנהל על עדכון מספר הטלפון
        if (shouldNotifyAdminPhoneProvided(detectedPhone) && usersData.adminPhone && cleanPhone(usersData.adminPhone) !== detectedPhone) {
          const adminAlert = `📱 *עדכון מספר טלפון לנהג חדש:*\n` +
            `👤 *שם:* ${pushName}\n` +
            `📞 *מספר מאומת:* ${detectedPhone}\n\n` +
            `לאישור המשתמש, השב ישירות:\n*אשר ${detectedPhone}*`;
          await sock.sendMessage(`${cleanPhone(usersData.adminPhone)}@s.whatsapp.net`, { text: adminAlert });
        }
      }

      const isAdmin = isUserAdmin(senderPhone);
      const isApproved = isUserApproved(senderPhone);
      const norm = normalizeText(text);

      // 2. פקודות מנהל ראשי (אישור / דחייה / עדכון)
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
      }

      // 3. טיפול במשתמש שטרם אושר (מנגנון צינון מונע לולאות + הודעה אחת בלבד למנהל)
      if (!isApproved) {
        const canReply = canReplyToUnapproved(senderPhone);
        if (!canReply) {
          continue; // שקט מוחלט! מונע הצפת הודעות
        }

        addPendingUser(senderPhone, pushName);
        recordEvent("system", `בקשת הצטרפות חדשה: ${pushName} (${senderPhone})`);

        let unapprovedMsg = `שלום ${pushName}! 👋\n` +
          `ברוך הבא ל*נסיעות בוט איכותי*.\n\n` +
          `⚠️ מספרך (${senderPhone}) עדיין אינו מאושר במערכת.\n\n` +
          `📩 *בקשת הצטרפות נשלחה כעת למנהל המערכת.*\n` +
          `ברגע שיאושר חשבונך, תקבל הודעת עדכון עם הנחיות חיבור!`;

        if (isSenderLid && !detectedPhone) {
          unapprovedMsg += `\n\n📌 *שים לב:* חשבונך מוגדר עם מזהה חסוי (LID). אנא השב כאן עם מספר הטלפון שלך (למשל: 0521234567) כדי שהמנהל יזהה אותך.`;
        }

        await sock.sendMessage(jid, { text: unapprovedMsg }, { quoted: m });

        // שליחת הודעה אחת ויחידה למנהל
        if (shouldNotifyAdminInitial(senderPhone) && usersData.adminPhone && cleanPhone(usersData.adminPhone) !== senderPhone) {
          let adminAlert = `🔔 *בקשת הצטרפות חדשה לבוט!*\n\n` +
            `👤 *שם:* ${pushName}\n` +
            `📱 *טלפון:* ${senderPhone}\n`;
          if (isSenderLid) {
            adminAlert += `⚠️ *מזהה LID חסוי.* המשתמש התבקש לשלוח טלפון.\n`;
          }
          adminAlert += `\nלאישור המשתמש, השב ישירות:\n*אשר ${senderPhone}*\n\nלדחייה, השב:\n*דחה ${senderPhone}*`;

          const adminJid = `${cleanPhone(usersData.adminPhone)}@s.whatsapp.net`;
          await sock.sendMessage(adminJid, { text: adminAlert });
        }
        continue;
      }

      // 4. בדיקת סטטוס חיבור הנהג (האם סשן הוואטסאפ שלו מקושר ומחובר בפועל)
      const isDriverConnected = isDriverSessionConnected(senderPhone);

      // ==============================================================
      // נהג מאושר שטרם חיבר את הוואטסאפ שלו (Unlinked Driver)
      // מונע דימוי שווא של חיפוש נסיעות כשהסשן כלל אינו מחובר!
      // ==============================================================
      if (!isDriverConnected) {
        // א. אם הנהג סיפק עכשיו מספר טלפון: נפיק עבורו קוד צימוד אוטומטית!
        if (detectedPhone) {
          try {
            await sock.sendMessage(jid, { text: `⏳ מפיק עבורך קוד צימוד ייעודי למספר *${detectedPhone}*...` });
            const code = await requestDriverPairingCode(detectedPhone, {
              onRideMessage: handleIncomingMessage,
              onEvent: recordEvent,
            });
            await sendPairingCodeMessages(sock, jid, code, m);
            recordEvent("system", `נוצר קוד צימוד אוטומטי בעקבות זיהוי טלפון ${detectedPhone}: ${code}`);
          } catch (err) {
            await sock.sendMessage(jid, { 
              text: `⚠️ לא ניתן היה להפיק קוד חיבור כעת: ${err.message}\nוודא שהמספר תקין או פנה למנהל המערכת.` 
            });
          }
          continue;
        }

        // ב. בקשת קוד צימוד ידנית ("חבר אותי" / "חיבור" / "ווב" / "קוד")
        if (norm.includes("חבר אותי") || norm.includes("קוד חדש") || norm.includes("חיבור") || norm.includes("ווב")) {
          if (isLid(senderPhone)) {
            const promptPhoneMsg = `📱 *לחיבור הוואטסאפ נדרש מספר טלפון סלולרי:*\n\n` +
              `חשבונך מזוהה כעת עם מזהה חסוי (LID). וואטסאפ מחייבת מספר טלפון רגיל להפקת קוד הצימוד.\n\n` +
              `👉 *אנא השב כאן עם מספר הטלפון שלך* (למשל: 0521234567).\n` +
              `מיד לאחר מכן נפיק עבורך את קוד הצימוד בן 8 ספרות!`;
            await sock.sendMessage(jid, { text: promptPhoneMsg }, { quoted: m });
            continue;
          }

          try {
            await sock.sendMessage(jid, { text: "⏳ מפיק קוד צימוד ייעודי לוואטסאפ שלך..." });
            
            const code = await requestDriverPairingCode(senderPhone, {
              onRideMessage: handleIncomingMessage,
              onEvent: recordEvent,
            });

            await sendPairingCodeMessages(sock, jid, code, m);
            recordEvent("system", `נוצר קוד חיבור נהג עבור ${senderPhone}: ${code}`);
          } catch (err) {
            await sock.sendMessage(jid, { 
              text: `⚠️ לא ניתן היה להפיק קוד חיבור כעת: ${err.message}\nנסה שוב בעוד מספר רגעים או פנה למנהל.` 
            });
          }
          continue;
        }

        // ג. תפריט לנהג שטרם התחבר
        if (norm === "תפריט" || norm === "menu" || norm === "עזרה") {
          let unlinkedMenu = `🚕 *נסיעות בוט איכותי - תפריט*\n\n`;
          unlinkedMenu += `📊 *סטטוס חשבון:* ✅ מאושר במערכת\n`;
          unlinkedMenu += `📲 *סטטוס וואטסאפ:* ⚪ לא מחובר (נדרש חיבור ראשוני)\n\n`;
          unlinkedMenu += `כדי שנוכל לסרוק עבורך נסיעות ישירות מקבוצות הוואטסאפ שאתה חבר בהן:\n`;
          unlinkedMenu += `👉 השב עכשיו *"חבר אותי"*\n\n`;
          unlinkedMenu += `מיד תקבל קוד צימוד בן 8 ספרות והסבר פשוט לחיבור תוך 10 שניות ללא מחשב!`;
          await sock.sendMessage(jid, { text: unlinkedMenu }, { quoted: m });
          continue;
        }

        // ד. כל הודעה אחרת (למשל "פנוי", "תפוס", "היי", "מה קורה"):
        // לא מפעילים חיפוש! מציגים הנחיה ברורה ומנומסת (עם צינון של 45 שניות למניעת הפצצה)
        const lastPromptTime = recentUnlinkedPrompts.get(senderPhone) || 0;
        const now = Date.now();
        if (now - lastPromptTime > 45000) {
          recentUnlinkedPrompts.set(senderPhone, now);
          const unlinkedPrompt = `שלום ${pushName}! 👋\n\n` +
            `🎉 *חשבונך מאושר במערכת, אך הוואטסאפ שלך עדיין אינו מחובר לסריקת נסיעות.*\n\n` +
            `כדי שהבוט יוכל לסרוק עבורך נסיעות מקבוצות הוואטסאפ שאתה חבר בהן בזמן אמת:\n` +
            `👉 השב עכשיו *"חבר אותי"*\n\n` +
            `מיד תקבל קוד צימוד בן 8 ספרות והסבר פשוט לחיבור מהיר מהטלפון.\n` +
            `(לאחר החיבור תוכל להפעיל חיפוש ע"י שליחת "פנוי שמש", "פנוי ים" וכו')`;
          await sock.sendMessage(jid, { text: unlinkedPrompt }, { quoted: m });
        }
        continue;
      }

      // ==============================================================
      // נהג מאושר שהוואטסאפ שלו מחובר (Connected Driver)
      // ==============================================================

      // אם כבר מחובר ומבקש שוב חיבור
      if (norm.includes("חבר אותי") || norm.includes("קוד חדש") || norm.includes("חיבור") || norm.includes("ווב")) {
        await sock.sendMessage(jid, { 
          text: `✅ הוואטסאפ שלך כבר מחובר ומסונכרן בהצלחה למערכת!\nשלח פקודות חיפוש כגון *"פנוי שמש פנימי"*, *"פ ים שמש"*, או *"תפריט"* לצפייה בכל האפשרויות.` 
        }, { quoted: m });
        continue;
      }

      // 5. תפריט ראשי
      if (norm === "תפריט" || norm === "menu" || norm === "עזרה") {
        await sendHelpMenu(sock, jid, senderPhone);
        continue;
      }

      // 6. ביטול חיפוש ("תפוס" או "ת")
      if (norm === "ת" || /(^| )(תפוס|עצור|סגור)( |$)/.test(norm)) {
        stopUserSearch(senderPhone);
        recordEvent("command", `חיפוש הופסק ע"י ${pushName} (${senderPhone})`);
        
        const stopMsg = `🛑 *החיפוש הופסק בהצלחה!* (מצב תפוס)\nנסיעה טובה ובטוחה. לחזרה כתוב "פנוי..." או "תפריט".`;
        await sock.sendMessage(jid, { text: stopMsg }, { quoted: m });
        continue;
      }

      // 7. הפעלת חיפוש נסיעות לנהג הספציפי
      if (norm.startsWith("פנוי") || norm.includes("מחפש") || norm.includes("צמצם") || norm.includes("פנימי")) {
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

      // 8. מענה כללי למשתמש מאושר ומחובר
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

      const verdict = rideMatches(text, driverSearch, groupName);

      if (!verdict.ok) {
        if (DEBUG_FILTER) console.log(`[נדחה ${driverPhone}] ${verdict.reason} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
        continue;
      }

      // בדיקת כפילות מבודדת לפי נהג (Driver-Scoped Deduplication)
      // מונע מצב שנהג ב' נחסם מנסיעה בגלל שנהג א' סרק אותה ראשון!
      const dup = deduper.check(text, driverPhone);
      if (dup.duplicate) {
        if (DEBUG_FILTER) console.log(`[כפילות ${driverPhone}] ${dup.reason} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
        continue;
      }

      const rideSenderPhone = await getRealSenderPhone(sock, jid, m);
      const rideSenderName = m.pushName || "סדרן";

      // ניקוי ספאם וחפירות מההודעה
      const cleanedText = cleanSpamFromRide(text);

      const rideData = {
        cleanedText,
        rawText: text,
        driverPhone,
        groupName,
        senderName: rideSenderName,
        senderPhone: rideSenderPhone,
        searchDesc: driverSearch.displayText,
      };

      // שולחים לנהג ישירות עם ציטוט ההודעה מהקבוצה שלו!
      const driverJid = `${driverPhone}@s.whatsapp.net`;
      await sendRideAlertWithQuoted(sock, driverJid, rideData, m);

      console.log(`[נשלח לנהג ${driverPhone}] (${verdict.reason}): "${cleanedText.replace(/\n/g, " / ").slice(0, 80)}" | קבוצה: ${groupName}`);
      recordEvent("sent", `${groupName} ⬅️ ${driverPhone}`, { 
        text: cleanedText.replace(/\n/g, " / ").slice(0, 80), 
        reason: verdict.reason,
        driver: driverPhone 
      });
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
