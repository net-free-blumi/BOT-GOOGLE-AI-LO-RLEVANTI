import { createMatcher, normalizeText, parseDriverCommand, rideMatches, findPlaces, extractPrice } from "./matcher.js";
import { createDeduper, isUniqueRideLink } from "./dedupe.js";
import { readFileSync } from "node:fs";

const BUG_REPORT_GROUP_JID = "120363402521442927@g.us";
const sentAlertsCache = new Map();

async function handleReaction(sock, reactions, sessionContext = {}) {
  const items = Array.isArray(reactions) ? reactions : [reactions];

  for (const item of items) {
    if (!item) continue;
    const reactionText = item.reaction?.text ?? item.text ?? "";
    const targetMsgId = item.reaction?.key?.id || item.key?.id;

    if (!targetMsgId) continue;

    if (reactionText === "👎" || reactionText.includes("👎")) {
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
      }

      reportMsg += `⏱️ *זמן הדיווח:* ${nowFormatted}\n`;
      reportMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
      reportMsg += `💡 המשתמש סימן 👎 ישירות על הודעת הבוט. הועבר אוטומטית לטיפול בבאג.`;

      await sock.sendMessage(BUG_REPORT_GROUP_JID, { text: reportMsg });

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

console.log("🧪 מתחיל בדיקות אימות מעמיקות לכל התרחישים...\n");

const cities = JSON.parse(readFileSync(new URL("./cities.json", import.meta.url), "utf8"));
const streets = JSON.parse(readFileSync(new URL("./streets-full.json", import.meta.url), "utf8"));
const matcher = createMatcher(cities, streets);
const deduper = createDeduper(findPlaces, { windowMs: 15 * 60 * 1000 });

let passed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    process.exitCode = 1;
  }
}

// ==========================================
// בדיקה 1: תיקון באג ה-Deduper שנעל נסיעות בגלל הקישורים הקבועים של דרייבוט
// ==========================================
console.log("--- בדיקה 1: סינון קישורי פרסומת של דרייבוט ב-Dedupe ---");
const promoLink1 = "https://api.drivebot.co.il/api/apps/teledrivebot/latest";
const promoLink2 = "https://t.me/+7HqnSHsvf5NiNTg0";
const promoLink3 = "drivebot.co.il";
const bookingLink = "wa.me/972552732722?text=ת+908172129+gd66wp";

assert(!isUniqueRideLink(promoLink1), "קישור הורדת אפליקציה אינו קישור נסיעה ייחודי");
assert(!isUniqueRideLink(promoLink2), "קישור ערוץ טלגרם אינו קישור נסיעה ייחודי");
assert(!isUniqueRideLink(promoLink3), "כתובת אתר דרייבוט אינה קישור נסיעה ייחודי");
assert(isUniqueRideLink(bookingLink), "קישור הזמנה עם מספר כרטיס ת+908172129 הינו קישור נסיעה ייחודי");

// נדמה שליחה של נסיעה ראשונה מדרייבוט
const drivebotMsg1 = `
⚠️⚠️⚠️⚠️⚠️⚠️
ירושלים בני ברק 180
רמות לעזרא זמן
ווצאפ ☚ wa.me/972552732722?text=ת+111222333+gd66wp
🔴 | הטלגרם האדום https://api.drivebot.co.il/api/apps/teledrivebot/latest
🔴 | הוואטסאפ האדום drivebot.co.il
🔴 | קבוצת כל הנסיעות בטלגרם https://t.me/+7HqnSHsvf5NiNTg0
`;

// והנסיעה השנייה שהמשתמש איבד בעבר:
const drivebotMsg2 = `
⚠️⚠️⚠️⚠️⚠️⚠️
פנימי שמש 50
רמה ד & נעימי זמן
ווצאפ ☚ wa.me/972552732722?text=ת+908172129+gd66wp
טלגרם ☚ t.me/prod_drivebot?start=t-908172129-gd66wp
🎩8080* - ללא פון 🎩
━━━━━━━━━━━━━━
🔴 | הטלגרם האדום https://api.drivebot.co.il/api/apps/teledrivebot/latest
🔴 | הוואטסאפ האדום drivebot.co.il
🔴 | קבוצת כל הנסיעות בטלגרם https://t.me/+7HqnSHsvf5NiNTg0
`;

deduper.clear();
const res1 = deduper.check(drivebotMsg1, "0501111111");
assert(!res1.duplicate, "הודעה ראשונה אינה כפולה");

const res2 = deduper.check(drivebotMsg2, "0501111111");
assert(!res2.duplicate, "הודעה שנייה (הנסיעה שנעלמה בעבר) אינה נחסמת בגלל קישורי דרייבוט!");

// ==========================================
// בדיקה 2: בידוד כפילויות לפי נהג (Driver-Scoped Deduplication)
// ==========================================
console.log("\n--- בדיקה 2: בידוד כפילויות בין נהג א' לנהג ב' ---");
const rideText = "פנימי שמש 45 רמה א לרמה ג זמן";
const driverA = "0501111111";
const driverB = "0502222222";

deduper.clear();
const r1 = deduper.check(rideText, driverA);
assert(!r1.duplicate, "נהג א' מקבל את הנסיעה");

const r2 = deduper.check(rideText, driverB);
assert(!r2.duplicate, "נהג ב' מקבל את הנסיעה גם כן למרות שנהג א' סרק אותה קודם!");

const r3 = deduper.check(rideText, driverA);
assert(r3.duplicate, "נהג א' לא מקבל את אותה נסיעה פעמיים");

// ==========================================
// בדיקה 3: סינון נסיעות בינעירוניות לא רלוונטיות במצב "פנוי שמש פנימי"
// ==========================================
console.log("\n--- בדיקה 3: סינון נסיעות בינעירוניות (כפר חב\"ד, סביון, שוהם, ירושלים) ---");
const internalShemeshState = { active: true, mode: "internal", origin: "בית שמש", destination: null };

// נסיעה כפר חב"ד 200
const kfarChabadMsg = `20 דק \nכפר חבד שמש 200\nתחנות בתוספת \nפתק ברידעס`;
const kfarChabadVerdict = matcher.rideMatches(kfarChabadMsg, internalShemeshState);
assert(!kfarChabadVerdict.ok, `כפר חב"ד 200 נפסל מפנימי שמש: "${kfarChabadVerdict.reason}"`);

// נסיעה סביון שמש 200 / שוהם
const savyonMsg = `⚠️⚠️⚠️⚠️⚠️⚠️\nסביון שמש 200\nשוהם זמנים\nווצאפ ☚ wa.me/972552732722?text=ת+407669970+gd66wp`;
const savyonVerdict = matcher.rideMatches(savyonMsg, internalShemeshState);
assert(!savyonVerdict.ok, `סביון ושוהם נפסלו מפנימי שמש: "${savyonVerdict.reason}"`);

// נסיעה ירושלים שמש 150 (ים שמש)
const yamShemeshMsg = `ים שמש 150 זמנים לבקש`;
const yamShemeshVerdict = matcher.rideMatches(yamShemeshMsg, internalShemeshState);
assert(!yamShemeshVerdict.ok, `ים שמש נפסל מפנימי שמש: "${yamShemeshVerdict.reason}"`);

// נסיעה עם עיר לא מוכרת במחיר 200 ש"ח
const highPriceUnknownMsg = `מקוםלאמוכר שמש 200 שקל זמנים`;
const highPriceVerdict = matcher.rideMatches(highPriceUnknownMsg, internalShemeshState);
assert(!highPriceVerdict.ok, `מחיר 200 ש"ח נפסל מפנימי שמש: "${highPriceVerdict.reason}"`);

// ==========================================
// בדיקה 4: זיהוי נסיעות פנימיות עם מעברי שכונות וסדרנים עצלנים
// ==========================================
console.log("\n--- בדיקה 4: זיהוי נסיעות פנימיות עם רמות, חצים ופורמטים חופשיים ---");

// שמש 50ש / רמה ד> ה / זמן
const ramaDHehMsg = `שמש 50ש \nרמה ד> ה \nזמן`;
const ramaDHehVerdict = matcher.rideMatches(ramaDHehMsg, internalShemeshState);
assert(ramaDHehVerdict.ok, `שמש 50ש רמה ד> ה התקבל בהצלחה: "${ramaDHehVerdict.reason}"`);

// הנסיעה שנעלמה: פנימי שמש 50 / רמה ד & נעימי זמן
const ramaDNaeimiVerdict = matcher.rideMatches(drivebotMsg2, internalShemeshState);
assert(ramaDNaeimiVerdict.ok, `פנימי שמש 50 רמה ד & נעימי זמן התקבל בהצלחה: "${ramaDNaeimiVerdict.reason}"`);

// מצב צמצום: שמש צמצם / מחסיה אדרת 80
const tzimtzumCmd = matcher.parseDriverCommand("שמש צמצם");
assert(tzimtzumCmd.mode === "reduce" && tzimtzumCmd.origin === "בית שמש", "פקודת 'שמש צמצם' מפוענחת לצמצום בית שמש");

const mahsiyaAderetMsg = `שמש צמצם \nמחסיה אדרת 80\nזמן\n לבקש ב 0507428876`;
const mahsiyaVerdict = matcher.rideMatches(mahsiyaAderetMsg, { active: true, mode: "reduce", origin: "בית שמש" });
assert(mahsiyaVerdict.ok, `מחסיה אדרת 80 התקבל בהצלחה בצמצום: "${mahsiyaVerdict.reason}"`);

// פענוח פקודות נהג
const cmdPshemesh = matcher.parseDriverCommand("פ שמש");
assert(cmdPshemesh.mode === "internal" && cmdPshemesh.origin === "בית שמש", "פקודת 'פ שמש' מפעילה פנימי בית שמש");

const cmdShemeshP = matcher.parseDriverCommand("שמש פ");
assert(cmdShemeshP.mode === "internal" && cmdShemeshP.origin === "בית שמש", "פקודת 'שמש פ' מפעילה פנימי בית שמש");

// ==========================================
// בדיקה 5: דיסלייק (👎) ודיווח לקבוצת התיקונים (120363402521442927@g.us)
// ==========================================
console.log("\n--- בדיקה 5: תגובת דיסלייק (👎) ושליחה לקבוצת התיקונים ---");
assert(BUG_REPORT_GROUP_JID === "120363402521442927@g.us", "JID קבוצת התיקונים מוגדר במדויק");

let sentToGroup = null;
let reactedBack = null;

const mockSock = {
  async sendMessage(jid, content, options) {
    if (jid === BUG_REPORT_GROUP_JID) {
      sentToGroup = { jid, content };
    }
    if (content?.react) {
      reactedBack = content.react;
    }
    return { key: { id: "mock_ack_msg_id" } };
  }
};

// הכנסת נסיעה לדוגמה למטמון
const testMsgId = "TEST_RIDE_MSG_999";
sentAlertsCache.set(testMsgId, {
  msgId: testMsgId,
  rideData: {
    cleanedText: "כפר חבד שמש 200",
    groupName: "נסיעות מרכז",
    senderName: "סדרן בדיקה",
    senderPhone: "0501234567",
    searchDesc: "בית שמש (פנימי)"
  },
  rawText: "כפר חבד שמש 200 שקל",
  driverPhone: "0529876543",
  groupName: "נסיעות מרכז",
  senderName: "סדרן בדיקה",
  senderPhone: "0501234567",
  searchDesc: "בית שמש (פנימי)",
  sentAt: Date.now()
});

await handleReaction(mockSock, [{
  key: { remoteJid: "0529876543@s.whatsapp.net" },
  reaction: {
    key: { id: testMsgId, remoteJid: "0529876543@s.whatsapp.net" },
    text: "👎"
  }
}], { driverPhone: "0529876543" });

assert(sentToGroup !== null, "הדיווח נשלח לקבוצת התיקונים");
assert(sentToGroup.jid === "120363402521442927@g.us", "היעד של הדיווח הוא 120363402521442927@g.us");
assert(sentToGroup.content.text.includes("כפר חבד שמש 200"), "הדיווח מכיל את פרטי הנסיעה");
assert(sentToGroup.content.text.includes("0529876543"), "הדיווח מכיל את מספר הנהג המדווח");
assert(reactedBack?.text === "🫡", "נשלח אימוג'י 🫡 כאישור לנהג על קבלת הדיווח");

console.log(`\n🎉 תוצאות: ${passed}/${total} בדיקות עברו בהצלחה!`);
if (passed === total) {
  console.log("💯 כל הבאגים תוקנו ונבדקו במלואם!");
}
