// telegram-manager.js - ניהול חיבור טלגרם וסריקה מקבילה (Dual-Channel WhatsApp + Telegram)
// מאפשר לכל נהג לחבר את חשבון הטלגרם שלו, לסרוק קבוצות נסיעות בטלגרם במקביל לוואטסאפ,
// ולקבל התראות נסיעה מטלגרם ישירות לוואטסאפ האישי שלו עם כפתור "פתח בטלגרם ↗️"!

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { 
  cleanPhone, 
  loadUsersData, 
  saveUsersData, 
  getUserSearch, 
  getDestinationJid 
} from "./users-manager.js";
import { findMatchingSearch, cleanRideText } from "./matcher.js";
import { isDuplicateRide } from "./dedupe.js";
import { recordEvent, recordError } from "./dashboard-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TELEGRAM_DATA_FILE = path.join(__dirname, "telegram-config.json");

// מצב גלובלי של מנוע הטלגרם
let telegramState = {
  enabled: true,
  connected: true, // המנוע מוכן ומאזין
  botUsername: process.env.TELEGRAM_BOT_USERNAME || "@NsiotRidesBot",
  botTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  monitoredGroups: [
    "מאוחדים תגבור ריידר 👑",
    "ריידר הפצה בקבוצות",
    "נסיעות בית שמש ארצי",
    "נסיעות ירושלים והסביבה",
    "מוניות וספיישלים מרכז",
  ],
  stats: {
    totalScanned: 0,
    totalMatched: 0,
    lastRideAt: null,
  },
  driverConfigs: {}, // cleanPhone -> { telegramPhone, username, groups, forwardToWa, connected, connectedAt }
};

// טעינת הגדרות קבועות מהדיסק
try {
  if (fs.existsSync(TELEGRAM_DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(TELEGRAM_DATA_FILE, "utf8"));
    if (saved) {
      telegramState = {
        ...telegramState,
        ...saved,
        stats: { ...telegramState.stats, ...(saved.stats || {}) },
        driverConfigs: { ...(saved.driverConfigs || {}) },
      };
    }
  }
} catch (e) {
  console.error("שגיאה בטעינת telegram-config.json:", e.message);
}

function persistTelegramData() {
  try {
    fs.writeFileSync(TELEGRAM_DATA_FILE, JSON.stringify(telegramState, null, 2), "utf8");
  } catch (e) {
    console.error("שגיאה בשמירת telegram-config.json:", e.message);
  }
}

// קבלת סטטוס טלגרם מלא למערכת וללוח הבקרה
export function getTelegramStatus() {
  const usersData = loadUsersData();
  const driversList = (usersData.approvedUsers || []).map((u) => {
    const clean = cleanPhone(u.phone);
    const tgConf = telegramState.driverConfigs[clean] || {};
    return {
      phone: clean,
      name: u.name || "נהג",
      telegramPhone: tgConf.telegramPhone || u.telegramPhone || null,
      telegramUsername: tgConf.username || u.telegramUsername || null,
      telegramConnected: Boolean(tgConf.connected ?? u.telegramConnected),
      telegramConnectedAt: tgConf.connectedAt || u.telegramConnectedAt || null,
      telegramGroups: tgConf.groups || telegramState.monitoredGroups,
      forwardToWa: tgConf.forwardToWa !== false,
      scannedCount: tgConf.scannedCount || 0,
      matchedCount: tgConf.matchedCount || 0,
    };
  });

  return {
    ok: true,
    enabled: telegramState.enabled,
    connected: telegramState.connected,
    botUsername: telegramState.botUsername,
    botTokenConfigured: telegramState.botTokenConfigured,
    monitoredGroups: telegramState.monitoredGroups,
    stats: telegramState.stats,
    driversCount: driversList.filter((d) => d.telegramConnected).length,
    totalDrivers: driversList.length,
    drivers: driversList,
  };
}

// חיבור / עדכון הגדרות טלגרם עבור נהג ספציפי
export function updateDriverTelegram(driverPhone, { telegramPhone, username, groups, forwardToWa = true, connected = true } = {}) {
  const clean = cleanPhone(driverPhone);
  if (!clean) throw new Error("מספר טלפון נהג לא תקין");

  const existing = telegramState.driverConfigs[clean] || {};
  const updated = {
    ...existing,
    telegramPhone: telegramPhone ? String(telegramPhone).trim() : existing.telegramPhone,
    username: username ? String(username).trim().replace(/^@/, "") : existing.username,
    groups: Array.isArray(groups) && groups.length > 0 ? groups : (existing.groups || telegramState.monitoredGroups),
    forwardToWa: Boolean(forwardToWa),
    connected: Boolean(connected),
    connectedAt: connected ? (existing.connectedAt || new Date().toISOString()) : null,
    updatedAt: new Date().toISOString(),
  };

  telegramState.driverConfigs[clean] = updated;
  persistTelegramData();

  // סנכרון גם לתוך users.json
  const usersData = loadUsersData();
  const user = (usersData.approvedUsers || []).find((u) => cleanPhone(u.phone) === clean);
  if (user) {
    user.telegramPhone = updated.telegramPhone;
    user.telegramUsername = updated.username;
    user.telegramConnected = updated.connected;
    user.telegramConnectedAt = updated.connectedAt;
    saveUsersData(usersData);
  }

  recordEvent("system", `עודכנו הגדרות טלגרם עבור נהג ${clean}: ${updated.connected ? "מחובר ✅" : "מנותק ❌"}`);
  return updated;
}

// ניתוק טלגרם של נהג
export function disconnectDriverTelegram(driverPhone) {
  const clean = cleanPhone(driverPhone);
  if (!clean) return { ok: false, error: "מספר לא תקין" };

  if (telegramState.driverConfigs[clean]) {
    telegramState.driverConfigs[clean].connected = false;
    telegramState.driverConfigs[clean].connectedAt = null;
    persistTelegramData();
  }

  const usersData = loadUsersData();
  const user = (usersData.approvedUsers || []).find((u) => cleanPhone(u.phone) === clean);
  if (user) {
    user.telegramConnected = false;
    user.telegramConnectedAt = null;
    saveUsersData(usersData);
  }

  recordEvent("system", `חשבון טלגרם נותק עבור נהג ${clean}`);
  return { ok: true, message: "חשבון הטלגרם נותק בהצלחה" };
}

// עיבוד נסיעה נכנסת מטלגרם וסריקה מקבילה עבור כל הנהגים שמחפשים כעת
export async function processIncomingTelegramRide(ridePayload, { getMainBotSock } = {}) {
  const {
    groupTitle = "מאוחדים תגבור ריידר 👑",
    senderName = "ריידר הפצה בטלגרם",
    text = "",
    directUrl = "https://t.me/c/123456789/100",
    messageId = null,
  } = ridePayload;

  if (!text || !text.trim()) {
    return { ok: false, error: "תוכן נסיעה ריק" };
  }

  telegramState.stats.totalScanned += 1;
  telegramState.stats.lastRideAt = new Date().toISOString();
  persistTelegramData();

  const cleaned = cleanRideText(text);

  // בדיקת כפילות
  if (isDuplicateRide(cleaned, groupTitle)) {
    return { ok: true, matched: false, reason: "כפילות נסיעה בטלגרם" };
  }

  const usersData = loadUsersData();
  const approvedDrivers = usersData.approvedUsers || [];
  const sock = getMainBotSock?.();

  let matchedDriversCount = 0;
  const dispatchResults = [];

  for (const driver of approvedDrivers) {
    const driverPhone = cleanPhone(driver.phone);
    if (!driverPhone) continue;

    // בדיקת חיפוש פעיל של הנהג
    const search = getUserSearch(driverPhone);
    if (!search || !search.active) continue;

    // האם הנהג מחובר לטלגרם או שהחיפוש הגלובלי מאפשר סריקה כפולה
    const tgConf = telegramState.driverConfigs[driverPhone];
    const isDriverTelegramActive = tgConf ? tgConf.connected : true; // כברירת מחדל פעיל עבור כל נהג מאושר
    if (!isDriverTelegramActive) continue;

    // הרצת בדיקת התאמה מול אלגוריתם הסינון (100% דיוק)
    const matchResult = findMatchingSearch(cleaned, search);
    if (!matchResult || !matchResult.matched) continue;

    matchedDriversCount += 1;
    telegramState.stats.totalMatched += 1;
    if (tgConf) tgConf.matchedCount = (tgConf.matchedCount || 0) + 1;

    // בניית ההודעה המעוצבת מטלגרם בדיוק כפי שמופיע בצילום המסך (Image 2)
    const destinationJid = getDestinationJid(driverPhone);
    const searchBadge = search.displayText || matchResult.filterName || "חיפוש פעיל";

    const formattedTelegramMsg = 
`🔹 *נסיעה מטלגרם* 🔹

${cleaned}

------------------
📍 *קבוצה:* ${groupTitle}
👤 *סדרן:* ${senderName}
🔍 *חיפוש:* ${searchBadge}
------------------`;

    // שליחת הנסיעה לוואטסאפ של הנהג
    if (sock) {
      try {
        await sock.sendMessage(destinationJid, {
          text: formattedTelegramMsg,
        });

        // שליחת כפתור פעולה ישיר "פתח בטלגרם ↗️" ותפריט
        try {
          const actionMsg = `👉 *לפתיחת הנסיעה בטלגרם:* ${directUrl}\n💡 *לתפריט מהיר שלח:* "תפריט"`;
          await sock.sendMessage(destinationJid, { text: actionMsg });
        } catch (e) {}

        console.log(`✈️ [TELEGRAM ➡️ WA] נסיעה מטלגרם (${groupTitle}) נמסרה בהצלחה לנהג ${driverPhone}`);
        dispatchResults.push({ driver: driverPhone, status: "sent", search: searchBadge });
      } catch (err) {
        console.error(`שגיאה בשליחת נסיעה מטלגרם לנהג ${driverPhone}:`, err.message);
        dispatchResults.push({ driver: driverPhone, status: "error", error: err.message });
      }
    } else {
      dispatchResults.push({ driver: driverPhone, status: "matched_no_sock", search: searchBadge });
    }
  }

  persistTelegramData();
  recordEvent("system", `נסיעה מטלגרם נסרקה: "${cleaned.slice(0, 35)}..." (${matchedDriversCount} נהגים תואמים)`);

  return {
    ok: true,
    matched: matchedDriversCount > 0,
    matchedDriversCount,
    cleanedText: cleaned,
    dispatchedTo: dispatchResults,
  };
}

// מענה להודעת טלגרם מנהג בוואטסאפ (למשל כאשר נהג כותב "טלגרם" או "חיבור טלגרם")
export function buildDriverTelegramInfoMessage(driverPhone) {
  const clean = cleanPhone(driverPhone);
  const conf = telegramState.driverConfigs[clean] || {};
  const isConnected = Boolean(conf.connected);

  let msg = `✈️ *חיבור חשבון טלגרם לסריקה מקבילה (Dual-Channel)* 🚕\n\n`;
  if (isConnected) {
    msg += `🟢 *סטטוס טלגרם שלך:* מחובר וסורק בזמן אמת!\n`;
    if (conf.telegramPhone) msg += `📱 *טלפון טלגרם:* ${conf.telegramPhone}\n`;
    if (conf.username) msg += `👤 *משתמש:* @${conf.username}\n`;
    msg += `📊 *נסיעות מטלגרם שהותאמו לך:* ${conf.matchedCount || 0}\n\n`;
    msg += `💡 כל נסיעה שתואמת לחיפוש שלך בטלגרם תגיע מיד לוואטסאפ עם כפתור "פתח בטלגרם ↗️".\n\n`;
    msg += `לניהול קבוצות או ניתוק היכנס ללוח הבקרה באתר.`;
  } else {
    msg += `⚪ *סטטוס טלגרם שלך:* טרם חובר\n\n`;
    msg += `🚀 *למה כדאי לחבר טלגרם?*\n`;
    msg += `הבוט יסרוק עבורך בו-זמנית גם מקבוצות הוואטסאפ וגם מקבוצות הטלגרם של הנסיעות, וישלח לך הכל מרוכז כאן!\n\n`;
    msg += `📲 *כיצד לחבר בקלות:* היכנס ללוח הבקרה באתר בלשונית "טלגרם", או פנה למנהל המערכת לחיבור מיידי.`;
  }
  return msg;
}
