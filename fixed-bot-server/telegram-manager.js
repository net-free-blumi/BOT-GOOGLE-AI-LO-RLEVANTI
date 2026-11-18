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

function isLid(id) {
  return String(id || "").endsWith("@lid") || (String(id || "").length >= 14 && /^\d+$/.test(String(id || "")));
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

    // משיכת דיאלוגים ראשונית - הכרחי ב-GramJS כדי לאכלס את כל הערוצים והקבוצות עם access_hash
    await client.getDialogs({ limit: 200 }).catch(() => {});

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
            await client.getDialogs({ limit: 200 }).catch(() => {});
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
// 5. מאזין להודעות נכנסות בקבוצות וערוצים בטלגרם (כולל ערוצי שידור כמו "כל הנסיעות")
// ==========================================

// מעקב הודעות טלגרם שכבר עובדו למניעת כפילויות בין מאזינים
const processedTgMsgKeys = new Set();
function markTgMsgProcessed(key) {
  if (processedTgMsgKeys.has(key)) return false;
  processedTgMsgKeys.add(key);
  if (processedTgMsgKeys.size > 3000) {
    const first = processedTgMsgKeys.values().next().value;
    processedTgMsgKeys.delete(first);
  }
  return true;
}

async function handleIncomingTelegramMessage(client, driverPhone, message, sourceEvent = "new_message") {
  try {
    if (!message) return;
    const rawContent = message.text || message.message || "";
    const text = String(rawContent).trim();
    if (text.length < 5) return;

    // חילוץ מזהה צ'אט/ערוץ והודעה
    const peer = message.peerId;
    const rawChatId = message.chatId || peer?.channelId || peer?.chatId || peer?.userId;
    const msgId = message.id;
    const dedupKey = `${rawChatId}_${msgId}`;

    if (!markTgMsgProcessed(dedupKey)) {
      return; // כבר עובד במאזין המקביל
    }

    // בדיקה האם לנהג זה יש חיפוש פעיל
    const driverSearch = systemCallbacks.getUserSearch(driverPhone);
    if (!driverSearch || !driverSearch.active) {
      return;
    }

    // חילוץ פרטי הקבוצה/ערוץ עם גיבוי ל-getEntity
    let chat = null;
    try {
      chat = await message.getChat();
    } catch (e) {
      try {
        if (peer) chat = await client.getEntity(peer);
      } catch (e2) {}
    }

    // בדיקה האם זו קבוצה או ערוץ (כולל ערוצי שידור עם אלפי מנויים כמו "כל הנסיעות" ופוסטים בערוצים)
    const isChannelOrGroup = Boolean(
      chat?.title ||
      chat?.name ||
      message.isGroup ||
      message.isChannel ||
      message.post ||
      peer?.channelId ||
      peer?.chatId
    );

    if (!isChannelOrGroup) return;

    const groupName = (chat?.title || chat?.name || (peer?.channelId ? `ערוץ טלגרם (${peer.channelId})` : "קבוצת טלגרם")).trim();

    // סינון קבוצת היעד של ההתראות כדי למנוע לולאת סריקה עצמית
    if (
      groupName.includes("נסיעות זמינות מהבוט") ||
      groupName.includes("נסיעות זמינות") ||
      String(rawChatId).includes("5442068385")
    ) {
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

    // ניקוי ספאם וכותרות ערוצים
    const cleanedText = systemCallbacks.cleanSpamFromRide(text);

    // תיעוד הודעה שנסרקה בטלגרם ללוג המערכת (שיופיע בלוח הבקרה בדיוק כמו הודעות וואטסאפ)
    systemCallbacks.recordEvent?.("group_msg", `הודעה בטלגרם (${groupName}): "${cleanedText.slice(0, 35)}"`, {
      group: groupName,
      text: cleanedText.slice(0, 80),
      source: "telegram",
      session: driverPhone,
    });

    const junk = systemCallbacks.detectNonRide(cleanedText);
    if (junk) {
      console.log(`ℹ️ [טלגרם נהג ${driverPhone}] נפסל כספאם/לא נסיעה (${junk}) מקבוצה "${groupName}": "${cleanedText.slice(0, 40)}"`);
      return;
    }

    // בדיקת התאמה לחיפוש הפעיל של הנהג
    const verdict = systemCallbacks.matchesAnySearch(cleanedText, driverSearch, groupName);
    if (!verdict.ok) {
      return;
    }

    // בדיקת כפילות ייעודית לטלגרם (וואטסאפ לא חוסם טלגרם)
    const dup = systemCallbacks.deduper.check(cleanedText, `tg_${driverPhone}`);
    if (dup.duplicate) {
      console.log(`ℹ️ [טלגרם נהג ${driverPhone}] נסיעה כפולה (נשלחה כבר לאחרונה) מקבוצה "${groupName}"`);
      return;
    }

    // יצירת קישור ישיר מדויק להודעה בטלגרם (פותח את ההודעה ישירות ומדגיש אותה!)
    let telegramUrl = "";
    const cleanChannelId = String(peer?.channelId || chat?.id || message.chatId || "")
      .replace("-100", "")
      .replace("-", "");

    if (chat?.username) {
      telegramUrl = `https://t.me/${chat.username}/${msgId}`;
    } else if (cleanChannelId) {
      telegramUrl = `https://t.me/c/${cleanChannelId}/${msgId}`;
    }

    // בדיקת כפתורי Inline בטלגרם (כמו [ 🙋‍♂️ | בקשת הנסיעה ↗️ ] של דרייבוט)
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

    let tgSenderPhone = "זמין בטלגרם";
    if (systemCallbacks.extractPhoneFromText) {
      const extracted = systemCallbacks.extractPhoneFromText(cleanedText) || systemCallbacks.extractPhoneFromText(text);
      if (extracted) {
        tgSenderPhone = extracted;
      }
    }

    const rideData = {
      cleanedText,
      rawText: text,
      driverPhone,
      groupName,
      senderName,
      senderPhone: tgSenderPhone,
      searchDesc: verdict.matchedSearch?.displayText || driverSearch.displayText,
      matchedReason: verdict.reason,
      isTelegram: true,
      telegramChatId: chat?.id || message.chatId || (peer?.channelId ? `-100${peer.channelId}` : null),
      telegramMsgId: msgId,
      telegramUrl,
      hasInlineButtons,
      buttonsList,
    };

    console.log(`✈️ [טלגרם -> נהג ${driverPhone}] נסיעה מתאימה מ-${groupName}! "${cleanedText.slice(0, 50)}..."`);
    systemCallbacks.recordEvent?.("sent", `טלגרם (${groupName}) ⬅️ ${driverPhone}`, {
      text: cleanedText.slice(0, 80),
      reason: verdict.reason,
      driver: driverPhone,
      source: "telegram",
    });

    // שליחת ההתראה לנהג (בוואטסאפ ובטלגרם עם כפתור קפיצה ישיר!)
    await deliverTelegramRideAlert(driverPhone, rideData, message);
  } catch (err) {
    console.error(`שגיאה בטיפול בהודעת טלגרם עבור ${driverPhone}:`, err.message);
  }
}

// חילוץ כל ההודעות מכל עדכון טלגרם אפשרי (כולל חבילות ערוצים מרוכזות: Updates, UpdatesCombined וכו')
function extractMessagesFromTelegramUpdate(update) {
  const list = [];
  if (!update) return list;

  if (update.message && typeof update.message === "object") {
    list.push(update.message);
  }

  if (Array.isArray(update.updates)) {
    for (const sub of update.updates) {
      if (sub?.message && typeof sub.message === "object") {
        list.push(sub.message);
      }
    }
  }

  return list;
}

async function attachTelegramMessageListener(client, driverPhone) {
  const { NewMessage } = await getTelegramModules();

  // מאזין 1: NewMessage סטנדרטי לקבוצות וצ'אטים
  client.addEventHandler(async (event) => {
    if (event?.message) {
      await handleIncomingTelegramMessage(client, driverPhone, event.message, "new_message");
    }
  }, new NewMessage({}));

  // מאזין 2: מאזין לעדכונים גלמיים של כל סוגי הערוצים, קבוצות שידור ו-UpdatesCombined
  // חיוני לערוצים כמו "כל הנסיעות" (2.7K מנויים) שנשלחים בעדכונים מרוכזים ב-MTProto
  client.addEventHandler(async (update) => {
    try {
      const msgs = extractMessagesFromTelegramUpdate(update);
      for (const msg of msgs) {
        await handleIncomingTelegramMessage(client, driverPhone, msg, "raw_channel_update");
      }
    } catch (e) {}
  });
}

// ==========================================
// 6. פורמט ושליחת התראת נסיעה מטלגרם לוואטסאפ של הנהג
// ==========================================
export function buildTelegramAlertText(rideData) {
  let msg = `🔹 *נסיעה מטלגרם*\n`;
  msg += `${rideData.cleanedText}\n`;
  msg += `━━━━━━━━━━━━━\n`;
  msg += `📍 *קבוצה:* ${rideData.groupName}\n`;
  let sInfo = rideData.senderName || "סדרן";
  if (rideData.senderPhone && rideData.senderPhone !== "זמין בטלגרם") {
    const formattedPhone = systemCallbacks.formatIsraeliPhone
      ? systemCallbacks.formatIsraeliPhone(rideData.senderPhone)
      : rideData.senderPhone;
    sInfo = (sInfo && sInfo !== "סדרן") ? `${sInfo} · ${formattedPhone}` : formattedPhone;
  }
  msg += `👤 *סדרן:* ${sInfo}\n`;
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

  return await systemCallbacks.deliverRideAlert(null, driverPhone, {
    ...rideData,
    customAlertText: alertText,
    telegramOriginalMessage: originalTelegramMsg,
  }, null);
}

// ==========================================
// 6.5. ניתוב והפצת התראות נסיעה לטלגרם של הנהג ("נסיעות זמינות מהבוט" + Saved Messages)
// ==========================================

const driverTargetGroupCache = new Map();

// מציאת קבוצת היעד של הנהג בטלגרם
export async function findDriverAlertGroup(client, phone) {
  const p = cleanPhone(phone);
  const cached = driverTargetGroupCache.get(p);
  if (cached) return cached;

  const targetName = process.env.TELEGRAM_GROUP_NAME || "נסיעות זמינות מהבוט";

  try {
    const dialogs = await client.getDialogs({ limit: 200 });
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

// קבלת רשימת הדיאלוגים והקבוצות של הנהג
export async function getTelegramDialogs(phone) {
  const p = cleanPhone(phone);
  const client = activeTelegramClients.get(p);
  if (!client || !client.connected) return [];
  try {
    const dialogs = await client.getDialogs({ limit: 200 });
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

// שליחת התראת נסיעה (מוואטסאפ או מטלגרם) ישירות לטלגרם של הנהג עם כפתור מעבר ישיר והתראת צליל/נעיצה
export async function sendRideAlertToTelegram(driverPhone, rideData, originalMsg = null) {
  const p = cleanPhone(driverPhone);
  const client = activeTelegramClients.get(p);

  if (!client || !client.connected) {
    return { ok: false, reason: "חשבון טלגרם אינו מחובר כרגע" };
  }

  try {
    const { Api } = await import("telegram");
    const isFromTelegram = Boolean(rideData.isTelegram);
    const targetGroup = await findDriverAlertGroup(client, p);

    let tgText = "";
    if (isFromTelegram) {
      let sInfo = rideData.senderName || "זמין בטלגרם";
      if (rideData.senderPhone && rideData.senderPhone !== "זמין בטלגרם") {
        const formattedPhone = systemCallbacks.formatIsraeliPhone
          ? systemCallbacks.formatIsraeliPhone(rideData.senderPhone)
          : rideData.senderPhone;
        sInfo = (sInfo && sInfo !== "זמין בטלגרם" && sInfo !== "סדרן") ? `${sInfo} · ${formattedPhone}` : formattedPhone;
      }
      tgText = `🚕 *נסיעה מטלגרם*\n\n` +
        `${rideData.cleanedText || rideData.rawText}\n\n` +
        `━━━━━━━━━━━━━\n` +
        `📍 *קבוצה:* ${rideData.groupName || "קבוצת טלגרם"}\n` +
        `👤 *סדרן:* ${sInfo}\n` +
        (rideData.searchDesc ? `🔍 *חיפוש:* ${rideData.searchDesc}\n` : "");
    } else {
      const sPhone = (rideData.senderPhone && rideData.senderPhone !== "זמין בקבוצה")
        ? (systemCallbacks.formatIsraeliPhone ? systemCallbacks.formatIsraeliPhone(rideData.senderPhone) : rideData.senderPhone)
        : "זמין בקבוצה";
      let sName = (rideData.senderName && rideData.senderName !== "סדרן") ? rideData.senderName : "";
      let sCombined = sName ? `${sName} · ${sPhone}` : sPhone;

      tgText = `🚕 *נסיעה מוואטסאפ*\n\n` +
        `${rideData.cleanedText || rideData.rawText}\n\n` +
        `━━━━━━━━━━━━━\n` +
        `📍 *קבוצת וואטסאפ:* ${rideData.groupName || "קבוצת וואטסאפ"}\n` +
        `👤 *סדרן:* ${sCombined}\n` +
        (rideData.searchDesc ? `🔍 *חיפוש:* ${rideData.searchDesc}\n` : "");
    }

    // בניית כפתורי Inline מתקדמים בטלגרם (קפיצה ישירה להודעה המקורית בדיוק כמו ציטוט בוואטסאפ!)
    const keyboardRows = [];

    if (isFromTelegram && rideData.telegramUrl) {
      keyboardRows.push(
        new Api.KeyboardButtonRow({
          buttons: [
            new Api.KeyboardButtonUrl({
              text: "🚕 מעבר ישיר לנסיעה ולתפיסה ↗️",
              url: rideData.telegramUrl,
            }),
          ],
        })
      );

      // שכפול כפתורי URL מקוריים של דרייבוט (למשל: [ 🙋‍♂️ | בקשת הנסיעה ↗️ ])
      // מאפשר לנהג לתפוס את הנסיעה בלחיצה אחת מתוך "נסיעות זמינות מהבוט" בלי לצאת מהקבוצה!
      if (Array.isArray(rideData.buttonsList) && rideData.buttonsList.length > 0) {
        const extraButtons = [];
        for (const b of rideData.buttonsList) {
          if (b.url && b.text && b.url !== rideData.telegramUrl) {
            extraButtons.push(
              new Api.KeyboardButtonUrl({
                text: b.text,
                url: b.url,
              })
            );
          }
        }
        if (extraButtons.length > 0) {
          keyboardRows.push(new Api.KeyboardButtonRow({ buttons: extraButtons.slice(0, 2) }));
        }
      }
    } else if (!isFromTelegram) {
      const cleanSenderPhone = cleanPhone(rideData.senderPhone);
      if (cleanSenderPhone && cleanSenderPhone.length >= 9 && !isLid(cleanSenderPhone)) {
        keyboardRows.push(
          new Api.KeyboardButtonRow({
            buttons: [
              new Api.KeyboardButtonUrl({
                text: "💬 פנייה ישירה לסדרן בוואטסאפ ↗️",
                url: `https://wa.me/${cleanSenderPhone}`,
              }),
            ],
          })
        );
      }
    }

    const replyMarkup = keyboardRows.length > 0 ? new Api.ReplyInlineMarkup({ rows: keyboardRows }) : undefined;

    // יעדי השליחה:
    // 1. קבוצת "נסיעות זמינות מהבוט"
    // 2. "me" - הודעות שמורות של הנהג (Saved Messages)
    const destinations = [];
    if (targetGroup) {
      destinations.push({ type: "group", target: targetGroup, name: "נסיעות זמינות מהבוט" });
    }
    destinations.push({ type: "direct", target: "me", name: "הודעות שמורות (פרטי)" });

    let sentCount = 0;
    for (const dest of destinations) {
      try {
        // שליחת ההודעה המעוצבת עם הכפתורים הישירים (במקום Forward שהיה פותח פרופיל ולא קופץ להודעה!)
        const sentMsg = await client.sendMessage(dest.target, {
          message: tgText,
          buttons: replyMarkup,
          linkPreview: false,
        });

        // פתרון בעיית "במצב נקרא":
        // נעיצת ההודעה עם התראה (pin with notify) מקפיצה התראת פוש עם צליל ובאנר בטלפון של הנהג!
        if (dest.type === "group" && sentMsg?.id) {
          try {
            await client.pinMessage(dest.target, sentMsg.id, { notify: true });
          } catch (pinErr) {}
        }

        console.log(`✈️ [טלגרם -> ${dest.name}] נשלחה התראה עם כפתורי מעבר ישירים עבור נהג ${p}`);
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
// 7. תפיסת נסיעה בטלגרם (לחיצה על כפתור Inline, קישורי דרייבוט או מענה)
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
    const { Api } = await import("telegram");

    // 1. הבאת ההודעה המקורית מחשבון הטלגרם
    let targetMsg = alertInfo.telegramOriginalMessage || null;
    if (!targetMsg || !targetMsg.replyMarkup) {
      try {
        const msgs = await client.getMessages(chatId, { ids: [msgId] });
        targetMsg = msgs?.[0] || targetMsg;
      } catch (e) {}
    }

    // 2. בדיקה האם קיימים כפתורי Inline (למשל של דרייבוט, ריידרבוט, בוטים וכו')
    if (targetMsg?.replyMarkup?.rows?.length) {
      let chosenBtn = null;
      let chosenRow = 0;
      let chosenCol = 0;

      for (let r = 0; r < targetMsg.replyMarkup.rows.length; r++) {
        const row = targetMsg.replyMarkup.rows[r];
        for (let c = 0; c < (row.buttons || []).length; c++) {
          const btn = row.buttons[c];
          const btnText = String(btn.text || "").trim();
          if (/בקש|נסיעה|תפוס|קח|אישור/i.test(btnText)) {
            chosenBtn = btn;
            chosenRow = r;
            chosenCol = c;
            break;
          }
        }
        if (chosenBtn) break;
      }

      // אם לא נמצא כפתור עם מילת מפתח, ניקח את הכפתור הראשון
      if (!chosenBtn && targetMsg.replyMarkup.rows[0]?.buttons?.[0]) {
        chosenBtn = targetMsg.replyMarkup.rows[0].buttons[0];
        chosenRow = 0;
        chosenCol = 0;
      }

      if (chosenBtn) {
        // מקרה א': כפתור עם קישור URL (כמו כפתור [ 🙋‍♂️ | בקשת הנסיעה ↗️ ] של דרייבוט)
        if (chosenBtn.url) {
          const btnUrl = chosenBtn.url;
          console.log(`🎯 [תפיסת טלגרם נהג ${p}] זוהה כפתור URL: "${chosenBtn.text}" -> ${btnUrl}`);

          // בדיקה האם הקישור הוא קישור Deep Link של בוט טלגרם (t.me/<bot>?start=<payload>)
          const botStartMatch = btnUrl.match(/(?:t\.me\/|tg:\/\/resolve\?domain=)([^/?#&]+).*?[?&]start=([^&#]+)/i);
          if (botStartMatch) {
            const botUsername = botStartMatch[1];
            const startPayload = botStartMatch[2];
            console.log(`🎯 [תפיסת טלגרם נהג ${p}] שולח /start ${startPayload} ישירות לבוט @${botUsername}...`);
            await client.sendMessage(botUsername, { message: `/start ${startPayload}` });
            return {
              ok: true,
              action: "bot_start_sent",
              message: `✅ נשלחה בקשת תפיסה מיידית לבוט @${botUsername}! 🚕`,
            };
          }

          // אם זה קישור אינטרנט רגיל לתפיסה (Web Claim)
          try {
            fetch(btnUrl, { headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => {});
          } catch (e) {}

          return {
            ok: true,
            action: "url_opened",
            message: `🔗 פתח את קישור התפיסה בטלגרם:\n${btnUrl}`,
          };
        }

        // מקרה ב': כפתור עם Callback Data
        if (chosenBtn.data) {
          console.log(`🎯 [תפיסת טלגרם נהג ${p}] לוחץ על כפתור Callback "${chosenBtn.text}"...`);
          try {
            await targetMsg.click(chosenRow, chosenCol);
          } catch (clkErr) {
            await client.invoke(
              new Api.messages.GetBotCallbackAnswer({
                peer: chatId,
                msgId: targetMsg.id,
                data: chosenBtn.data,
              })
            );
          }
          return {
            ok: true,
            action: "button_clicked",
            message: `✅ נלחץ בהצלחה כפתור "${chosenBtn.text || 'בקשת הנסיעה'}" בטלגרם! 🚕`,
          };
        }
      }
    }

    // 3. אם אין כפתורי Inline, או שזו קבוצה רגילה (מענה "תן" / "ת")
    if (targetMsg) {
      console.log(`🎯 [תפיסת טלגרם נהג ${p}] שולח מענה 'תן' להודעה ${msgId} בקבוצה...`);
      await client.sendMessage(chatId, { message: "תן", replyTo: targetMsg.id });
      return {
        ok: true,
        action: "replied",
        message: "✅ נשלחה תגובת 'תן' להודעה בקבוצת הטלגרם! 🚕",
      };
    }

    return {
      ok: false,
      reason: "לא ניתן היה לאתר את ההודעה המקורית בטלגרם לתפיסה",
    };
  } catch (err) {
    console.error(`❌ שגיאה בתפיסת נסיעה בטלגרם עבור ${p}:`, err.message);
    return {
      ok: false,
      error: err.message,
      reason: `שגיאה בתפיסת נסיעה בטלגרם: ${err.message}`,
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