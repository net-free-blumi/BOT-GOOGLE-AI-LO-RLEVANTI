import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let TelegramClientClass = null;
let StringSessionClass = null;
let NewMessageClass = null;

async function getTelegramModules() {
  if (TelegramClientClass && StringSessionClass && NewMessageClass) {
    return { TelegramClient: TelegramClientClass, StringSession: StringSessionClass, NewMessage: NewMessageClass };
  }
  try {
    const tg = await import("telegram");
    const sessions = await import("telegram/sessions/index.js");
    const events = await import("telegram/events/index.js");
    TelegramClientClass = tg.TelegramClient;
    StringSessionClass = sessions.StringSession;
    NewMessageClass = events.NewMessage;
    return { TelegramClient: TelegramClientClass, StringSession: StringSessionClass, NewMessage: NewMessageClass };
  } catch (err) {
    console.warn("⚠️ חבילת telegram אינה מותקנת עדיין במערכת:", err.message);
    try {
      const { exec } = await import("child_process");
      exec("npm install telegram --omit=dev --no-audit --no-fund", (e) => {
        if (!e) console.log("✅ חבילת telegram הותקנה בהצלחה!");
      });
    } catch {}
    throw new Error("חבילת telegram אינה מותקנת עדיין בשרת. הותחלה התקנה אוטומטית ברקע.");
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TELEGRAM_AUTH_DIR = path.join(__dirname, "auth", "telegram");

if (!fs.existsSync(TELEGRAM_AUTH_DIR)) {
  fs.mkdirSync(TELEGRAM_AUTH_DIR, { recursive: true });
}

// מפתחות Telegram API הרשמיים (ניתן לדריסה ע"י משתני סביבה)
const TELEGRAM_API_ID = Number(process.env.TELEGRAM_API_ID || 31336167);
const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH || "465c772d7f2e13a2b27f316dec8f5111";

// לקוחות טלגרם פעילים: phone -> TelegramClient
const activeTelegramClients = new Map();

// תהליכי התחברות בהמתנה לקוד: phone -> { client, phoneCodeHash, phone, requestedAt }
const pendingVerifications = new Map();

// קולבקים של המערכת (שליחת התראה לוואטסאפ, רישום אירועים, בדיקת חיפוש)
let systemCallbacks = {
  getUserSearch: () => ({ active: false }),
  matchesAnySearch: () => ({ ok: false }),
  deliverRideAlert: async () => ({ ok: false }),
  cleanSpamFromRide: (t) => t,
  detectNonRide: () => null,
  recordEvent: () => {},
  recordError: () => {},
  deduper: { check: () => ({ duplicate: false }) },
  loadUsersData: () => ({ approvedUsers: [] }),
  saveUsersData: () => {},
};

export function setTelegramSystemCallbacks(cbs) {
  systemCallbacks = { ...systemCallbacks, ...cbs };
}

function cleanPhone(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "972" + digits.slice(1);
  return digits;
}

function formatE164(phone) {
  const c = cleanPhone(phone);
  return c.startsWith("+") ? c : `+${c}`;
}

function getSessionFilePath(phone) {
  return path.join(TELEGRAM_AUTH_DIR, `${cleanPhone(phone)}.session`);
}

// קבלת סטטוס חיבור טלגרם של נהג
export function getTelegramStatus(phone) {
  const p = cleanPhone(phone);
  const client = activeTelegramClients.get(p);
  const sessionExists = fs.existsSync(getSessionFilePath(p));
  const isPending = pendingVerifications.has(p);

  return {
    phone: p,
    connected: Boolean(client && client.connected),
    hasSavedSession: sessionExists,
    pendingCode: isPending,
  };
}

// קבלת מפת כל הסטטוסים
export function getAllTelegramStatuses() {
  const result = {};
  for (const [phone, client] of activeTelegramClients.entries()) {
    result[phone] = {
      connected: Boolean(client && client.connected),
      hasSavedSession: true,
    };
  }
  return result;
}

// ==========================================
// 1. שלב ראשון: בקשת קוד אימות לטלגרם
// ==========================================
export async function requestTelegramCode(phone) {
  const p = cleanPhone(phone);
  if (!p || p.length < 9) {
    throw new Error("מספר טלפון לא תקין עבור טלגרם");
  }

  if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH) {
    throw new Error("השרת לא הוגדר עם מפתחות טלגרם (TELEGRAM_API_ID / TELEGRAM_API_HASH)");
  }

  // סגירת לקוח ישן אם קיים תהליך תקוע
  const prevPending = pendingVerifications.get(p);
  if (prevPending?.client) {
    try { await prevPending.client.disconnect(); } catch (e) {}
    pendingVerifications.delete(p);
  }

  const existingClient = activeTelegramClients.get(p);
  if (existingClient?.connected) {
    return {
      ok: true,
      alreadyConnected: true,
      message: "חשבון הטלגרם כבר מחובר ופעיל במערכת ✅",
    };
  }

  const formatted = formatE164(p);
  console.log(`✈️ [טלגרם נהג ${p}] יוצר חיבור ושולח קוד אימות ל-${formatted}...`);

  const { TelegramClient, StringSession } = await getTelegramModules();

  const client = new TelegramClient(new StringSession(""), TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 5,
    useWSS: false,
    deviceModel: "Samsung Galaxy S24 Ultra",
    systemVersion: "Android 14",
    appVersion: "11.2.2",
    langCode: "he",
    systemLangCode: "he-IL",
  });

  await client.connect();

  try {
    let sendCodeResult = await client.sendCode(
      { apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH },
      formatted
    );
    console.log("ℹ️ [טלגרם DEBUG] סוג שליחה ראשוני:", sendCodeResult?.type?.className, "הבא:", sendCodeResult?.nextType?.className);
    if (sendCodeResult?.nextType) {
      try {
        const { Api } = await import("telegram");
        await new Promise((r) => setTimeout(r, 2000));
        sendCodeResult = await client.invoke(new Api.auth.ResendCode({
          phoneNumber: formatted,
          phoneCodeHash: sendCodeResult.phoneCodeHash,
        }));
        console.log("ℹ️ [טלגרם DEBUG] אחרי ResendCode:", sendCodeResult?.type?.className);
      } catch (reErr) {
        console.log("⚠️ [טלגרם DEBUG] ResendCode דולג:", reErr.errorMessage || reErr.message);
      }
    }

    pendingVerifications.set(p, {
      client,
      phoneCodeHash: sendCodeResult.phoneCodeHash,
      phone: p,
      formattedPhone: formatted,
      requestedAt: Date.now(),
    });

    console.log(`✅ [טלגרם נהג ${p}] קוד אימות נשלח בהצלחה לאפליקציית טלגרם (Hash: ${sendCodeResult.phoneCodeHash.slice(0, 6)}...)`);
    systemCallbacks.recordEvent?.("system", `נשלח קוד אימות טלגרם לנהג ${p}`);

    return {
      ok: true,
      phone: p,
      message: "קוד אימות נשלח ישירות לאפליקציית טלגרם שלך (בהודעה רשמית מ-Telegram) 📲",
      isCodeViaApp: sendCodeResult.isCodeViaApp !== false,
    };
  } catch (err) {
    try { await client.disconnect(); } catch (e) {}
    console.error(`❌ [טלגרם נהג ${p}] שגיאה בשליחת קוד אימות:`, err.message);
    const msg = String(err.errorMessage || err.message || "");
    if (msg.includes("API_ID_INVALID")) throw new Error("מפתחות הטלגרם בשרת שגויים, פנה למנהל המערכת");
    if (msg.includes("PHONE_NUMBER_INVALID")) throw new Error("מספר הטלפון אינו תקין לטלגרם");
    if (msg.includes("FLOOD")) throw new Error("יותר מדי ניסיונות, נסה שוב בעוד כמה דקות");
    throw new Error(`שגיאה מטלגרם: ${msg || "לא ניתן לשלוח קוד"}`);
  }
}

// ==========================================
// 2. שלב שני: אימות הקוד והתחברות מלאה
// ==========================================
export async function verifyTelegramCode(phone, code, password = "") {
  const p = cleanPhone(phone);
  const pending = pendingVerifications.get(p);

  if (!pending || !pending.client) {
    throw new Error("לא נמצאה בקשת קוד פעילה. שלח תחילה 'חבר טלגרם'");
  }
  if (Date.now() - pending.requestedAt > 10 * 60 * 1000) {
    try { await pending.client.disconnect(); } catch (e) {}
    pendingVerifications.delete(p);
    throw new Error("פג תוקף הבקשה. שלח שוב 'חבר טלגרם' לקבלת קוד חדש");
  }

  const { client, phoneCodeHash, formattedPhone } = pending;
  const cleanCode = String(code || "").trim().replace(/\D/g, "");

  if (!pending.needPassword && cleanCode.length < 4) {
    throw new Error("קוד אימות לא תקין. הקוד מורכב מספרות בלבד (למשל: 54321)");
  }

  try {
    const { Api } = await import("telegram");

    // שלב א: אימות הקוד (מדלגים עליו אם כבר עברנו אותו וממתינים לסיסמת 2FA)
    if (!pending.needPassword) {
      console.log(`🔐 [טלגרם נהג ${p}] מאמת קוד...`);
      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: formattedPhone,
            phoneCodeHash,
            phoneCode: cleanCode,
          })
        );
      } catch (e) {
        const em = String(e.errorMessage || e.message || "");
        if (em.includes("SESSION_PASSWORD_NEEDED")) {
          pending.needPassword = true;
        } else {
          throw e;
        }
      }
    }

    // שלב ב: סיסמת אימות דו-שלבי (אם מוגדרת בחשבון)
    if (pending.needPassword) {
      if (!password) {
        return {
          ok: false,
          need2FA: true,
          message: "בחשבון הטלגרם שלך מוגדר אימות דו-שלבי. אנא הזן את הסיסמה (או שלח בוואטסאפ: 'סיסמת טלגרם [הסיסמה]')",
        };
      }
      console.log(`🔑 [טלגרם נהג ${p}] מתחבר עם סיסמת 2FA...`);
      await client.signInWithPassword(
        { apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH },
        { password: async () => password, onError: async (e) => { throw e; } }
      );
    }

    // שמירת הסשן הקבוע בדיסק
    fs.writeFileSync(getSessionFilePath(p), client.session.save(), "utf8");

    activeTelegramClients.set(p, client);
    pendingVerifications.delete(p);

    // משיכת דיאלוגים ראשונית - הכרחי ב-GramJS כדי להתחיל לקבל עדכונים שוטפים מקבוצות
    await client.getDialogs({ limit: 50 }).catch(() => {});

    const me = await client.getMe();
    const telegramUsername = me?.username ? `@${me.username}` : (me?.firstName || "נהג");

    try {
      const usersData = systemCallbacks.loadUsersData?.() || {};
      const approved = usersData.approvedUsers || [];
      const userObj = approved.find((u) => cleanPhone(u.phone) === p);
      if (userObj) {
        userObj.telegramConnected = true;
        userObj.telegramPhone = p;
        userObj.telegramUsername = telegramUsername;
        userObj.telegramConnectedAt = new Date().toISOString();
        systemCallbacks.saveUsersData?.(usersData);
      }
    } catch (e) {}

    await attachTelegramMessageListener(client, p);

    console.log(`🎉 [טלגרם נהג ${p}] חובר בהצלחה! משתמש: ${telegramUsername}`);
    systemCallbacks.recordEvent?.("system", `וואטסאפ וטלגרם מסונכרנים עבור נהג ${p} (${telegramUsername})`);

    return {
      ok: true,
      connected: true,
      username: telegramUsername,
      message: `חשבון הטלגרם שלך (${telegramUsername}) חובר בהצלחה למערכת! 🚕✈️`,
    };
  } catch (err) {
    const em = String(err.errorMessage || err.message || "");
    console.error(`❌ [טלגרם נהג ${p}] כשל באימות:`, em);
    if (em.includes("PHONE_CODE_INVALID")) throw new Error("הקוד שגוי, נסה שוב");
    if (em.includes("PHONE_CODE_EXPIRED")) {
      pendingVerifications.delete(p);
      throw new Error("הקוד פג תוקף. בקש קוד חדש");
    }
    if (em.includes("PASSWORD_HASH_INVALID")) throw new Error("סיסמת 2FA שגויה, נסה שוב");
    throw new Error(`שגיאה באימות טלגרם: ${em || "קוד שגוי או פג תוקף"}`);
  }
}

// בדיקה האם לנהג יש קוד אימות שממתין להזנה
export function hasPendingTelegramVerification(phone) {
  const p = cleanPhone(phone);
  return pendingVerifications.has(p);
}

// ==========================================
// 3. ניתוק חשבון טלגרם
// ==========================================
export async function disconnectTelegram(phone) {
  const p = cleanPhone(phone);
  const client = activeTelegramClients.get(p);
  if (client) {
    try { await client.disconnect(); } catch (e) {}
    activeTelegramClients.delete(p);
  }

  const sessionFile = getSessionFilePath(p);
  if (fs.existsSync(sessionFile)) {
    try { fs.unlinkSync(sessionFile); } catch (e) {}
  }

  pendingVerifications.delete(p);

  try {
    const usersData = systemCallbacks.loadUsersData?.() || {};
    const approved = usersData.approvedUsers || [];
    const userObj = approved.find((u) => cleanPhone(u.phone) === p);
    if (userObj) {
      userObj.telegramConnected = false;
      userObj.telegramUsername = null;
      userObj.telegramConnectedAt = null;
      systemCallbacks.saveUsersData?.(usersData);
    }
  } catch (e) {}

  console.log(`🔌 [טלגרם נהג ${p}] חשבון הטלגרם נותק`);
  systemCallbacks.recordEvent?.("system", `חשבון הטלגרם של נהג ${p} נותק`);

  return { ok: true, message: "חשבון הטלגרם נותק בהצלחה" };
}

// ==========================================
// 4. שחזור סשנים שמורים בעת עליית השרת
// ==========================================
export async function initSavedTelegramSessions() {
  console.log("✈️ מאתחל סשנים שמורים של טלגרם (GramJS Client)...");

  if (fs.existsSync(TELEGRAM_AUTH_DIR)) {
    const files = fs.readdirSync(TELEGRAM_AUTH_DIR).filter((f) => f.endsWith(".session"));
    if (files.length > 0) {
      let tgMods;
      try {
        tgMods = await getTelegramModules();
      } catch (err) {
        console.log("ℹ️ חבילת telegram אינה זמינה כעת (שחזור סשנים יידחה):", err.message);
        return;
      }
      const { TelegramClient, StringSession } = tgMods;

      for (const file of files) {
        const phone = file.replace(".session", "");
        const sessionPath = path.join(TELEGRAM_AUTH_DIR, file);

        try {
          const sessionString = fs.readFileSync(sessionPath, "utf8").trim();
          if (!sessionString) continue;

          const client = new TelegramClient(new StringSession(sessionString), TELEGRAM_API_ID, TELEGRAM_API_HASH, {
            connectionRetries: 10,
            autoReconnect: true,
            useWSS: false,
            deviceModel: "Samsung Galaxy S24 Ultra",
            systemVersion: "Android 14",
            appVersion: "11.2.2",
            langCode: "he",
            systemLangCode: "he-IL",
          });

          await client.connect();

          if (await client.checkAuthorization()) {
            activeTelegramClients.set(phone, client);
            await client.getDialogs({ limit: 50 }).catch(() => {});
            await attachTelegramMessageListener(client, phone);
            const me = await client.getMe().catch(() => null);
            const username = me?.username ? `@${me.username}` : (me?.firstName || phone);
            console.log(`✅ [טלגרם] סשן שוחזר בהצלחה עבור נהג ${phone} (${username})`);
          } else {
            console.log(`⚠️ [טלגרם] סשן לא מורשה עבור ${phone}, מנקה...`);
            try { fs.unlinkSync(sessionPath); } catch (e) {}
          }
        } catch (err) {
          console.error(`שגיאה בשחזור סשן טלגרם עבור ${phone}:`, err.message);
        }
      }
    }
  }

  // ניקוי דגלים יתומים מ-users.json (רק אם קובץ הסשן באמת לא קיים בדיסק!)
  try {
    const usersData = systemCallbacks.loadUsersData?.() || {};
    const approved = usersData.approvedUsers || [];
    let changed = false;
    for (const u of approved) {
      const p = cleanPhone(u.phone);
      const isAuth = activeTelegramClients.has(p);
      const sessionFileExists = fs.existsSync(getSessionFilePath(p));
      // רק אם הלקוח לא אומת וגם קובץ ה-session לא קיים כלל בדיסק!
      if (!isAuth && !sessionFileExists && (u.telegramConnected || u.telegramUsername)) {
        u.telegramConnected = false;
        u.telegramUsername = null;
        u.telegramConnectedAt = null;
        changed = true;
      }
    }
    if (changed) {
      systemCallbacks.saveUsersData?.(usersData);
      console.log("🧹 נוקו דגלי טלגרם יתומים/ישנים מ-users.json");
    }
  } catch (e) {}
}

// ==========================================
// 5. מאזין להודעות נכנסות בקבוצות וערוצים בטלגרם
// ==========================================
async function attachTelegramMessageListener(client, driverPhone) {
  const { NewMessage } = await getTelegramModules();
  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message || !message.text) return;

      const text = String(message.text || "").trim();
      if (text.length < 5) return;

      // בדיקה האם לנהג זה יש חיפוש פעיל
      const driverSearch = systemCallbacks.getUserSearch(driverPhone);
      if (!driverSearch || !driverSearch.active) {
        console.log(`ℹ️ [טלגרם נהג ${driverPhone}] הודעה דולגה: אין חיפוש פעיל`);
        return;
      }

      // חילוץ פרטי הקבוצה והסדרן בטלגרם
      let chat = null;
      try {
        chat = await message.getChat();
      } catch (e) {}

      // התעלמות מהודעות פרטיות אישיות (1 על 1) אלא אם זו קבוצה או ערוץ
      const isGroupOrChannel = Boolean(
        chat?.title ||
        message.isGroup ||
        message.isChannel ||
        (message.peerId && (message.peerId.chatId || message.peerId.channelId))
      );

      if (!isGroupOrChannel) return;

      const groupName = chat?.title || "קבוצת נסיעות בטלגרם";
      // סינון קבוצת היעד של ההתראות כדי למנוע לולאת סריקה עצמית
      if (groupName.includes("נסיעות זמינות מהבוט") || groupName.includes("נסיעות זמינות")) {
        return;
      }
      let senderName = "סדרן בטלגרם";
      try {
        const sender = await message.getSender();
        if (sender) {
          senderName = [sender.firstName, sender.lastName].filter(Boolean).join(" ") ||
                       (sender.username ? `@${sender.username}` : "סדרן");
        }
      } catch (e) {}

      // ניקוי ספאם
      const cleanedText = systemCallbacks.cleanSpamFromRide(text);
      const junk = systemCallbacks.detectNonRide(cleanedText);
      if (junk) {
        console.log(`ℹ️ [טלגרם נהג ${driverPhone}] נפסל כספאם/לא נסיעה (${junk}) מקבוצה "${groupName}": "${cleanedText.slice(0, 40)}"`);
        return;
      }

      // בדיקת התאמה לחיפוש הפעיל של הנהג
      const verdict = systemCallbacks.matchesAnySearch(cleanedText, driverSearch, groupName);
      if (!verdict.ok) {
        console.log(`ℹ️ [טלגרם נהג ${driverPhone}] אין התאמה לחיפוש (${verdict.reason || 'ללא התאמה'}) מקבוצה "${groupName}": "${cleanedText.slice(0, 40)}"`);
        return;
      }

      // בדיקת כפילות ייעודית לטלגרם:
      // דרישת משתמש מפורשת: "ואל תתיחס אם יש אותו נסיעה גם בוואטסאפ וגם בטלגרם שאני יקבל את שניהם תכלס"
      // המפתח נפרד לחלוטין (קידומת tg_) כך שוואטסאפ לא חוסם טלגרם!
      const dup = systemCallbacks.deduper.check(cleanedText, `tg_${driverPhone}`);
      if (dup.duplicate) {
        console.log(`ℹ️ [טלגרם נהג ${driverPhone}] נסיעה כפולה (נשלחה כבר לאחרונה) מקבוצה "${groupName}"`);
        return;
      }

      // יצירת קישור ישיר להודעה בטלגרם
      let telegramUrl = "";
      const chatIdStr = String(chat?.id || message.chatId || "").replace("-100", "").replace("-", "");
      if (chat?.username) {
        telegramUrl = `https://t.me/${chat.username}/${message.id}`;
      } else if (chatIdStr) {
        telegramUrl = `https://t.me/c/${chatIdStr}/${message.id}`;
      }

      // בדיקת כפתורי Inline בטלגרם (כמו "לחצו כאן לבקשת הנסיעה")
      const hasInlineButtons = Boolean(message.replyMarkup?.rows?.length);
      const buttonsList = [];
      if (hasInlineButtons) {
        for (const row of message.replyMarkup.rows) {
          for (const btn of row.buttons || []) {
            buttonsList.push({
              text: btn.text || "",
              url: btn.url || null,
              hasCallback: Boolean(btn.data),
            });
          }
        }
      }

      const rideData = {
        cleanedText,
        rawText: text,
        driverPhone,
        groupName,
        senderName,
        senderPhone: "זמין בטלגרם",
        searchDesc: verdict.matchedSearch?.displayText || driverSearch.displayText,
        matchedReason: verdict.reason,
        isTelegram: true,
        telegramChatId: chat?.id || message.chatId,
        telegramMsgId: message.id,
        telegramUrl,
        hasInlineButtons,
        buttonsList,
      };

      console.log(`✈️ [טלגרם -> וואטסאפ] נסיעה מתאימה מטלגרם לנהג ${driverPhone}! קבוצה: ${groupName} | "${cleanedText.slice(0, 50)}..."`);
      systemCallbacks.recordEvent?.("sent", `טלגרם (${groupName}) ⬅️ ${driverPhone}`, {
        text: cleanedText.slice(0, 80),
        reason: verdict.reason,
        driver: driverPhone,
        source: "telegram",
      });

      // שליחת ההתראה לוואטסאפ של הנהג בפורמט הרשמי של טלגרם (כמו בצילום המסך!)
      await deliverTelegramRideAlert(driverPhone, rideData, message);
    } catch (err) {
      console.error(`שגיאה בסריקת הודעת טלגרם עבור ${driverPhone}:`, err.message);
    }
  }, new NewMessage({}));
}

// ==========================================
// 6. פורמט ושליחת התראת נסיעה מטלגרם לוואטסאפ של הנהג
// בדיוק לפי צילום המסך שהמשתמש צירף!
// ==========================================
export function buildTelegramAlertText(rideData) {
  let msg = `🔹 *נסיעה מטלגרם*\n`;
  msg += `${rideData.cleanedText}\n`;
  msg += `━━━━━━━━━━━━━\n`;
  msg += `📍 *קבוצה:* ${rideData.groupName}\n`;
  msg += `👤 *סדרן:* ${rideData.senderName}\n`;
  msg += `🔍 *חיפוש:* ${rideData.searchDesc}\n`;

  if (rideData.hasInlineButtons) {
    msg += `\n⚡ *לתפיסת הנסיעה בטלגרם:* השב עכשיו *"ת"* או *"תן"*, או לחץ על הקישור לפתיחה באפליקציה! 👇\n`;
  }

  if (rideData.telegramUrl) {
    msg += `\n🔗 *פתח בטלגרם:* ${rideData.telegramUrl}`;
  }

  return msg.trim();
}

async function deliverTelegramRideAlert(driverPhone, rideData, originalTelegramMsg) {
  const alertText = buildTelegramAlertText(rideData);

  // קריאה לפונקציית שליחת ההתראות המרכזית (ללא ציטוט קבוצה, בדיוק כמו בהתראות הרגילות)
  return await systemCallbacks.deliverRideAlert(null, driverPhone, {
    ...rideData,
    customAlertText: alertText,
    telegramOriginalMessage: originalTelegramMsg,
  }, null);
}

// ==========================================
// 6.5. ניתוב והפצת התראות נסיעה לטלגרם של הנהג ("נסיעות זמינות מהבוט" + Saved Messages)
// ==========================================

// מטמון קבוצת יעד בטלגרם לכל נהג: phone -> entity
const driverTargetGroupCache = new Map();

// מציאת קבוצת היעד של הנהג בטלגרם (למשל: "נסיעות זמינות מהבוט")
export async function findDriverAlertGroup(client, phone) {
  const p = cleanPhone(phone);
  const cached = driverTargetGroupCache.get(p);
  if (cached) return cached;

  const targetName = process.env.TELEGRAM_GROUP_NAME || "נסיעות זמינות מהבוט";

  try {
    const dialogs = await client.getDialogs({ limit: 100 });
    for (const d of dialogs) {
      const title = (d.title || d.name || "").trim();
      if (title.includes(targetName) || title.includes("נסיעות זמינות")) {
        console.log(`✈️ [טלגרם נהג ${p}] נמצאה קבוצת היעד: "${title}" (ID: ${d.id})`);
        const targetEntity = d.inputEntity || d.entity || d.id;
        driverTargetGroupCache.set(p, targetEntity);
        return targetEntity;
      }
    }
  } catch (err) {
    console.error(`שגיאה באיתור קבוצת טלגרם עבור ${p}:`, err.message);
  }
  return null;
}

// קבלת רשימת הדיאלוגים והקבוצות של הנהג (לבדיקה, סנכרון ואימות)
export async function getTelegramDialogs(phone) {
  const p = cleanPhone(phone);
  const client = activeTelegramClients.get(p);
  if (!client || !client.connected) return [];
  try {
    const dialogs = await client.getDialogs({ limit: 100 });
    return dialogs.map((d) => ({
      id: String(d.id),
      title: d.title || d.name || "",
      isGroup: Boolean(d.isGroup),
      isChannel: Boolean(d.isChannel),
      isUser: Boolean(d.isUser),
    }));
  } catch (err) {
    console.error(`שגיאה במשיכת דיאלוגים עבור ${p}:`, err.message);
    return [];
  }
}

// שליחת התראת נסיעה (מוואטסאפ או מטלגרם) ישירות לטלגרם של הנהג
export async function sendRideAlertToTelegram(driverPhone, rideData, originalMsg = null) {
  const p = cleanPhone(driverPhone);
  const client = activeTelegramClients.get(p);

  if (!client || !client.connected) {
    return { ok: false, reason: "חשבון טלגרם אינו מחובר כרגע" };
  }

  try {
    const isFromTelegram = Boolean(rideData.isTelegram);
    const targetGroup = await findDriverAlertGroup(client, p);

    let tgText = "";
    if (isFromTelegram) {
      tgText = `🚕 *נסיעה מטלגרם*\n\n` +
        `${rideData.cleanedText || rideData.rawText}\n\n` +
        `━━━━━━━━━━━━━\n` +
        `📍 *קבוצה:* ${rideData.groupName || "קבוצת טלגרם"}\n` +
        `👤 *סדרן:* ${rideData.senderName || "זמין בטלגרם"}\n` +
        (rideData.searchDesc ? `🔍 *חיפוש:* ${rideData.searchDesc}\n` : "");

      if (rideData.telegramUrl) {
        tgText += `\n🔗 *מעבר ישיר להודעה המקורית ולתפיסה:*\n${rideData.telegramUrl}`;
      }
    } else {
      tgText = `🚕 *נסיעה מוואטסאפ*\n\n` +
        `${rideData.cleanedText || rideData.rawText}\n\n` +
        `━━━━━━━━━━━━━\n` +
        `📍 *קבוצת וואטסאפ:* ${rideData.groupName || "קבוצת וואטסאפ"}\n` +
        `👤 *סדרן:* ${rideData.senderName || "סדרן"} · ${rideData.senderPhone || ""}\n` +
        (rideData.searchDesc ? `🔍 *חיפוש:* ${rideData.searchDesc}\n` : "");

      const cleanSenderPhone = cleanPhone(rideData.senderPhone);
      if (cleanSenderPhone && cleanSenderPhone.length >= 9 && !isLid(cleanSenderPhone)) {
        tgText += `\n💬 *פנייה ישירה לסדרן בוואטסאפ:*\nhttps://wa.me/${cleanSenderPhone}`;
      }
    }

    // יעדי השליחה:
    // 1. קבוצת "נסיעות זמינות מהבוט" (אם קיימת אצל הנהג)
    // 2. "me" - הודעות שמורות של הנהג (Saved Messages), להתראה פרטית מיידית בטלגרם!
    const destinations = [];
    if (targetGroup) {
      destinations.push({ type: "group", target: targetGroup, name: "נסיעות זמינות מהבוט" });
    }
    destinations.push({ type: "direct", target: "me", name: "הודעות שמורות (פרטי)" });

    let sentCount = 0;
    for (const dest of destinations) {
      try {
        let sentAsForward = false;
        // אם הנסיעה מטלגרם, מבצעים העברה (Forward) המהווה ציטוט טלגרם מובנה - לחיצה קופצת למקור!
        if (isFromTelegram && rideData.telegramMsgId && rideData.telegramChatId) {
          try {
            await client.forwardMessages(dest.target, {
              messages: [rideData.telegramMsgId],
              fromPeer: rideData.telegramChatId,
            });
            sentAsForward = true;
            console.log(`✈️ [טלגרם -> ${dest.name}] נסיעה הועברה בהצלחה כציטוט מקורי עבור נהג ${p}`);
          } catch (fwdErr) {
            // אם ההעברה נחסמה ע"י הגדרות הקבוצה המקורית (noforwards), נשלח כהודעה מעוצבת
          }
        }

        if (!sentAsForward) {
          await client.sendMessage(dest.target, { message: tgText, linkPreview: false });
          console.log(`✈️ [טלגרם -> ${dest.name}] נשלחה התראה מעוצבת עבור נהג ${p}`);
        }
        sentCount++;
      } catch (err) {
        console.error(`שגיאה בשליחת התראת טלגרם ל-${dest.name} עבור ${p}:`, err.message);
      }
    }

    return { ok: true, sentCount };
  } catch (err) {
    console.error(`שגיאה בשליחת התראה לטלגרם עבור ${p}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ==========================================
// 7. תפיסת נסיעה בטלגרם (לחיצה על כפתור Inline או מענה)
// דרישת משתמש: "תמצא דרך לתפוס נסיעה שמאפשר רק בטלגרם"
// ==========================================
export async function claimTelegramRide(driverPhone, alertInfo) {
  const p = cleanPhone(driverPhone);
  const client = activeTelegramClients.get(p);

  if (!client || !client.connected) {
    return {
      ok: false,
      reason: "חשבון הטלגרם אינו מחובר כרגע. התחבר עם 'חבר טלגרם'",
    };
  }

  const chatId = alertInfo.telegramChatId;
  const msgId = alertInfo.telegramMsgId;

  if (!chatId || !msgId) {
    return { ok: false, reason: "לא נמצאו מזהי הודעה בטלגרם" };
  }

  try {
    // 1. נסיון לחיצה על כפתור Inline ראשון (אם קיים כפתור "בקש נסיעה")
    if (alertInfo.hasInlineButtons && alertInfo.telegramOriginalMessage?.click) {
      console.log(`🎯 [תפיסת טלגרם] לוחץ על כפתור Inline בהודעה ${msgId}...`);
      await alertInfo.telegramOriginalMessage.click(0);
      return {
        ok: true,
        action: "button_clicked",
        message: "✅ נלחץ בהצלחה כפתור בקשת הנסיעה בטלגרם! 🚕",
      };
    }

    // 2. הבאת ההודעה המקורית מחשבון הטלגרם
    const msgs = await client.getMessages(chatId, { ids: [msgId] });
    const targetMsg = msgs?.[0];

    if (targetMsg && targetMsg.replyMarkup?.rows?.length) {
      console.log(`🎯 [תפיסת טלגרם] נמצאו כפתורי Inline, לוחץ על כפתור 0...`);
      await targetMsg.click(0);
      return {
        ok: true,
        action: "button_clicked",
        message: "✅ נלחץ בהצלחה כפתור בקשת הנסיעה בטלגרם! 🚕",
      };
    }

    // 3. שליחת מענה "תן" / "ת" כהודעה בקבוצה/ערוץ
    if (targetMsg) {
      await targetMsg.reply({ message: "תן" });
      return {
        ok: true,
        action: "replied",
        message: "✅ נשלחה תגובת 'תן' להודעה בקבוצת הטלגרם! 🚕",
      };
    }

    return {
      ok: true,
      action: "opened",
      message: `🔗 פתח את הנסיעה בטלגרם לתפיסה מיידית:\n${alertInfo.telegramUrl || "פתח באפליקציה"}`,
    };
  } catch (err) {
    console.error(`❌ שגיאה בתפיסת נסיעה בטלגרם:`, err.message);
    return {
      ok: false,
      error: err.message,
      reason: `שגיאה בתפיסת הנסיעה בטלגרם: ${err.message}. פתח את ההודעה ישירות:\n${alertInfo.telegramUrl || ""}`,
    };
  }
}

// ==========================================
// 8. בדיקה תקופתית והתחברות מחדש (Keep-Alive)
// ==========================================
setInterval(async () => {
  try {
    for (const [phone, client] of activeTelegramClients.entries()) {
      if (!client.connected) {
        console.log(`🔄 [טלגרם נהג ${phone}] חיבור נותק, מנסה להתחבר מחדש...`);
        try {
          await client.connect();
          if (await client.checkAuthorization()) {
            await client.getDialogs({ limit: 50 }).catch(() => {});
            console.log(`✅ [טלגרם נהג ${phone}] חובר מחדש בהצלחה`);
          }
        } catch (reErr) {
          console.log(`⚠️ [טלגרם נהג ${phone}] שגיאה בחיבור מחדש:`, reErr.message);
        }
      }
    }
  } catch (e) {}
}, 60 * 1000);