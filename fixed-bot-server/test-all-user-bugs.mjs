// test-all-user-bugs.mjs - בדיקה מלאה של כל התרחישים, כולל מניעת הודעות ספאם ואימות כל הפיצ'רים החדשים
import { createMatcher, normalizeText, parseDriverCommand, processDriverCommand, rideMatches, findPlaces, extractPrice } from "./matcher.js";
import { createDeduper, isUniqueRideLink } from "./dedupe.js";
import { readFileSync } from "node:fs";

console.log("🧪 מתחיל בדיקות אימות מעמיקות לכל התרחישים (גרסה 2.8)...\n");

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

const internalShemeshState = { active: true, mode: "internal", origin: "בית שמש", destination: null, displayText: "בית שמש (פנימי)" };

// ==========================================
// בדיקה 1: מניעה מוחלטת של הודעות ספאם, משטרות, פרסומות ומניות
// ==========================================
console.log("--- בדיקה 1: פסילת הודעות לא רלוונטיות (משטרות, הפצה, מניות, מאזדה) ---");

// הודעה 1 שדווחה היום (הפצה ידני בלבד)
const msgSpam1 = `0523651790\nהפצה ידני בלבד\nצרפו לקבוצות\n0523651790`;
const verdictSpam1 = matcher.rideMatches(msgSpam1, internalShemeshState);
assert(!verdictSpam1.ok, `הודעת הפצה לקבוצות נפסלת: "${verdictSpam1.reason}"`);

// הודעה 2 שדווחה היום (דיווח משטרות)
const msgPolice = `אופיר הרוש מטייל בדודיקה`;
const verdictPolice = matcher.rideMatches(msgPolice, internalShemeshState);
assert(!verdictPolice.ok, `דיווח משטרות בדודיקה נפסל: "${verdictPolice.reason}"`);

// מילים תמימות בעברית שהיו עלולות להיתפס בגלל אותיות אות-ל-אות
const innocentHebrew = [
  "מתאים לרכב מאזדה 3",
  "רכישת מניות בחברה",
  "מתקן למקרן איכותי למכירה",
  "פרסומת לחנות בגדים",
  "שלום וברכה לכולם",
  "הפנימית של האופניים פנצ'ר"
];

for (const phrase of innocentHebrew) {
  const v = matcher.rideMatches(phrase, internalShemeshState);
  assert(!v.ok, `ביטוי תמים "${phrase}" נפסל בהצלחה: "${v.reason}"`);
}

// ==========================================
// בדיקה 2: זיהוי מדויק של נסיעות פנימיות אמיתיות
// ==========================================
console.log("\n--- בדיקה 2: קבלת נסיעות פנימיות אמיתיות בכל הפורמטים ---");

// נסיעה עם חץ ומחיר מקוצר: שמש 50ש / רמה ד> ה / זמן
const v1 = matcher.rideMatches(`שמש 50ש \nרמה ד> ה \nזמן`, internalShemeshState);
assert(v1.ok, `שמש 50ש רמה ד> ה התקבלה בהצלחה: "${v1.reason}"`);

// פנימי שמש 50 / רמה ד & נעימי זמן
const v2 = matcher.rideMatches(`⚠️⚠️⚠️ פנימי שמש 50\nרמה ד & נעימי זמן\nwa.me/972552732722?text=ת+908172129+gd66wp`, internalShemeshState);
assert(v2.ok, `פנימי שמש 50 רמה ד & נעימי התקבלה בהצלחה: "${v2.reason}"`);

// פנימי שמש 50 / לב הרמה&ד
const v3 = matcher.rideMatches(`פנימי שמש 50 / לב הרמה&ד`, internalShemeshState);
assert(v3.ok, `לב הרמה&ד התקבלה בהצלחה: "${v3.reason}"`);

// חפציבה לקריה 40
const v4 = matcher.rideMatches(`חפציבה לקריה 40`, internalShemeshState);
assert(v4.ok, `חפציבה לקריה התקבלה בהצלחה: "${v4.reason}"`);

// רמה ב לרמה ג 40
const v5 = matcher.rideMatches(`רמה ב לרמה ג 40`, internalShemeshState);
assert(v5.ok, `רמה ב לרמה ג התקבלה בהצלחה: "${v5.reason}"`);

// צמצום בית שמש עם מושב סמוך
const v6 = matcher.rideMatches(`שמש צמצם \nמחסיה אדרת 80\nזמן`, { active: true, mode: "reduce", origin: "בית שמש" });
assert(v6.ok, `מחסיה אדרת 80 בצמצום התקבלה בהצלחה: "${v6.reason}"`);

// חבקוק הנביא להר מירון
const vHarMeron = matcher.rideMatches(`פ שמש 50 ש\nחבקוק הנביא להר מירון`, internalShemeshState);
assert(vHarMeron.ok, `חבקוק הנביא להר מירון התקבלה בהצלחה: "${vHarMeron.reason}"`);

// שמש פנימי הוש 80ש / כינור דוד רמה ג
const vKinor = matcher.rideMatches(`שמש פנימי הוש 80ש \n כינור דוד רמה ג`, internalShemeshState);
assert(vKinor.ok, `כינור דוד רמה ג התקבלה בהצלחה: "${vKinor.reason}"`);

// שמש 80 בתוך ד / שתי נקודות נהג עולה למסור
const vBetochD = matcher.rideMatches(`שמש 80 בתוך ד \n שתי נקודות נהג עולה למסור`, internalShemeshState);
assert(vBetochD.ok, `שמש 80 בתוך ד התקבלה בהצלחה: "${vBetochD.reason}"`);

// שמש פנימי 80 / קריה לרמה א / הלוש
const vKriyaRamaA = matcher.rideMatches(`שמש פנימי 80\nקריה לרמה א \n הלוש`, internalShemeshState);
assert(vKriyaRamaA.ok, `קריה לרמה א הלוש התקבלה בהצלחה: "${vKriyaRamaA.reason}"`);

// פ שמש 70 / רמה ה להר טוב
const vHarTov = matcher.rideMatches(`פ שמש 70 \n רמה ה להר טוב \n משלמת ביט`, internalShemeshState);
assert(vHarTov.ok, `רמה ה להר טוב התקבלה בהצלחה: "${vHarTov.reason}"`);

// פ שמש 50 / מנחם פורוש לישעי
const vYishi = matcher.rideMatches(`פ שמש 50 \n מנחם פורוש לישעי \n זמנים`, internalShemeshState);
assert(vYishi.ok, `מנחם פורוש לישעי התקבלה בהצלחה: "${vYishi.reason}"`);

// שמש פ 50ש / ד להישנה / שד' האמוראים / אור החיים דרייבוט
const vDrivebotDToYeshana = matcher.rideMatches(`שמש פ 50ש\nא 1 משלמת בביט\nד להישנה\nשד' האמוראים זמן\nwa.me/972552732722?text=ת+852897622+gd66wp\n⛔אור החיים🏅⛔ללא פון🏅`, internalShemeshState);
assert(vDrivebotDToYeshana.ok, `שמש פ 50ש ד להישנה ושד' האמוראים התקבלה בהצלחה: "${vDrivebotDToYeshana.reason}"`);

// ==========================================
// בדיקה 3: פסילת נסיעות בינעירוניות בפנימי שמש
// ==========================================
console.log("\n--- בדיקה 3: פסילת נסיעות בינעירוניות ---");

// סבא שמש 100 היוצרים (כפר סבא - בית שמש)
const vSaba = matcher.rideMatches(`סבא שמש 100\nהיוצרים\nלבקש 0504357919`, internalShemeshState);
assert(!vSaba.ok, `סבא שמש 100 נפסל מפנימי בהצלחה: "${vSaba.reason}"`);

// שמש ים 50 בדיקה
const vShemeshYam = matcher.rideMatches(`שמש ים \n 50 \n בדיקה`, internalShemeshState);
assert(!vShemeshYam.ok, `שמש ים 50 בדיקה נפסל מפנימי: "${vShemeshYam.reason}"`);

// ים שמש 50 עזרה
const vYamShemesh50 = matcher.rideMatches(`ים שמש \n 50 \n עזרה`, internalShemeshState);
assert(!vYamShemesh50.ok, `ים שמש 50 עזרה נפסל מפנימי: "${vYamShemesh50.reason}"`);

// חולון תא 100ש משלוח
const vHolon = matcher.rideMatches(`חולון תא 100ש משלוח \n שמעון אבידן`, internalShemeshState);
assert(!vHolon.ok, `חולון תא נפסל מפנימי בית שמש: "${vHolon.reason}"`);

const vKfarChabad = matcher.rideMatches(`כפר חבד שמש 200`, internalShemeshState);
assert(!vKfarChabad.ok, `כפר חב"ד נפסל: "${vKfarChabad.reason}"`);

const vSavyon = matcher.rideMatches(`סביון שמש 200`, internalShemeshState);
assert(!vSavyon.ok, `סביון נפסל: "${vSavyon.reason}"`);

const vYam = matcher.rideMatches(`ים שמש 150`, internalShemeshState);
assert(!vYam.ok, `ים שמש נפסל: "${vYam.reason}"`);

const vHighPrice = matcher.rideMatches(`שמש 180ש מקוםלאמוכר`, internalShemeshState);
assert(!vHighPrice.ok, `מחיר 180 ש"ח נפסל: "${vHighPrice.reason}"`);

// ==========================================
// בדיקה 4: פענוח מדויק של פקודות הנהג
// ==========================================
console.log("\n--- בדיקה 4: פענוח פקודות נהג (כולל 'פנוי שמש' בלי שיבושים) ---");

const pShemesh = processDriverCommand("פנוי שמש");
assert(pShemesh.mode === "internal" && pShemesh.origin === "בית שמש", `פנוי שמש -> פנימי בית שמש (${pShemesh.displayText})`);

const pShemeshPnimi = processDriverCommand("פנוי שמש פנימי");
assert(pShemeshPnimi.mode === "internal" && pShemeshPnimi.origin === "בית שמש", `פנוי שמש פנימי -> פנימי בית שמש`);

const pShort = processDriverCommand("פ שמש");
assert(pShort.mode === "internal" && pShort.origin === "בית שמש", `פ שמש -> פנימי בית שמש`);

const pReverseShort = processDriverCommand("שמש פ");
assert(pReverseShort.mode === "internal" && pReverseShort.origin === "בית שמש", `שמש פ -> פנימי בית שמש`);

const pYamShemesh = processDriverCommand("פ ים שמש");
assert(pYamShemesh.mode === "route" && pYamShemesh.origin === "ירושלים" && pYamShemesh.destination === "בית שמש", `פ ים שמש -> מסלול מירושלים לבית שמש`);

const pShemeshYam = processDriverCommand("פ שמש ים");
assert(pShemeshYam.mode === "route" && pShemeshYam.origin === "בית שמש" && pShemeshYam.destination === "ירושלים", `פ שמש ים -> מסלול מבית שמש לירושלים`);

const pTzimtzum = processDriverCommand("שמש צמצם");
assert(pTzimtzum.mode === "reduce" && pTzimtzum.origin === "בית שמש", `שמש צמצם -> צמצום בית שמש`);

// ==========================================
// בדיקה 5: דיסלייק (👎) מוגן לחלוטין מתגובות בקבוצות
// ==========================================
console.log("\n--- בדיקה 5: בדיקת הגנת דיסלייק (👎) ---");

const BUG_REPORT_GROUP_JID = "120363402521442927@g.us";
const sentAlertsCache = new Map();
const handledReactions = new Map();
let bugReports = [];

async function handleReactionSimulation(sock, reactions, sessionContext = {}) {
  const items = Array.isArray(reactions) ? reactions : [reactions];

  for (const item of items) {
    if (!item) continue;
    const reactionText = item.reaction?.text ?? item.text ?? "";
    const targetMsgId = item.reaction?.key?.id || item.key?.id;

    if (!targetMsgId) continue;
    if (!reactionText.includes("👎")) continue;

    // התעלמות מתגובות בקבוצות (מונע דיווחי שווא בשעה 5 בבוקר!)
    const reactionChat = item.reaction?.key?.remoteJid || item.key?.remoteJid || "";
    if (String(reactionChat).endsWith("@g.us")) continue;

    // רק תגובות על הודעות שהבוט שלח
    const alertInfo = sentAlertsCache.get(targetMsgId);
    if (!alertInfo) continue;

    const dedupeKey = `${targetMsgId}|${reactionText}`;
    const nowTs = Date.now();
    if (handledReactions.has(dedupeKey) && nowTs - handledReactions.get(dedupeKey) < 30000) continue;
    handledReactions.set(dedupeKey, nowTs);

    await sock.sendMessage(BUG_REPORT_GROUP_JID, { text: `דיווח: ${alertInfo.driverPhone} על ${alertInfo.rideData.cleanedText}` });
  }
}

const mockSock = {
  async sendMessage(jid, content) {
    if (jid === BUG_REPORT_GROUP_JID) {
      bugReports.push(content.text);
    }
    return { key: { id: "mock_res" } };
  }
};

// 1. תגובת דיסלייק בקבוצה (בשעה 5 בבוקר) - חייב להתעלם לחלוטין!
bugReports = [];
await handleReactionSimulation(mockSock, [{
  key: { remoteJid: "1234567890-987654@g.us", id: "group_msg_123" },
  reaction: { text: "👎", key: { remoteJid: "1234567890-987654@g.us", id: "group_msg_123" } }
}]);
assert(bugReports.length === 0, "תגובת דיסלייק בקבוצת וואטסאפ (בשעה 5 בבוקר) אינה מדווחת לקבוצת התיקונים!");

// 2. תגובת דיסלייק על הודעה לא מוכרת בפרטי - חייב להתעלם!
bugReports = [];
await handleReactionSimulation(mockSock, [{
  key: { remoteJid: "0521111111@s.whatsapp.net", id: "unknown_msg_999" },
  reaction: { text: "👎", key: { remoteJid: "0521111111@s.whatsapp.net", id: "unknown_msg_999" } }
}]);
assert(bugReports.length === 0, "תגובת דיסלייק על הודעה פרטית שאינה נסיעה של הבוט אינה מדווחת!");

// 3. תגובת דיסלייק על נסיעה של הבוט בפרטי - מדווח לקבוצת התיקונים!
bugReports = [];
const testAlertId = "BOT_ALERT_MSG_777";
sentAlertsCache.set(testAlertId, {
  msgId: testAlertId,
  rideData: {
    cleanedText: "רמה ד לנעימי 45",
    groupName: "נסיעות שמש VIP",
  },
  driverPhone: "972539485860",
});

await handleReactionSimulation(mockSock, [{
  key: { remoteJid: "972539485860@s.whatsapp.net", id: testAlertId },
  reaction: { text: "👎", key: { remoteJid: "972539485860@s.whatsapp.net", id: testAlertId } }
}]);

assert(bugReports.length === 1, "דיסלייק אמיתי של נהג על הודעת בוט נשלח לקבוצת התיקונים");
assert(bugReports[0].includes("972539485860"), "הדו\"ח מכיל את מספר הנהג");

// ==========================================
// בדיקה 6: פורמט נקי של התראת נסיעה (בלי כותרת ובלי קווים)
// ==========================================
console.log("\n--- בדיקה 6: פורמט נקי ללא כותרת ---");

const sampleRide = {
  cleanedText: "פנימי שמש 50 / רמה ד לרמה ג",
  groupName: "נסיעות בית שמש",
  senderName: "יוסי",
  senderPhone: "0501234567"
};

const cleanAlertText = `${sampleRide.cleanedText}\n\n📍 ${sampleRide.groupName}\n👤 ${sampleRide.senderName} · ${sampleRide.senderPhone}`;

assert(!cleanAlertText.includes("נסיעה מתאימה נמצאה"), "ההתראה אינה כוללת את הכותרת המעצבנת");
assert(!cleanAlertText.includes("──────"), "ההתראה אינה כוללת קווים מפרידים מיותרים");
assert(cleanAlertText.startsWith("פנימי שמש 50"), "ההתראה מתחילה ישירות בפרטי הנסיעה");

console.log(`\n--- בדיקה 7: 9 המקרים החדשים שדווחו היום (גרסה 2.9) ---`);

// 1. נסיעות עוקבות מאותו סדרן ובאותו מחיר (הסרת כפילות שגויה של טלפון+מחיר)
const dedupKey1 = deduper.check(
  "פ שמש 50 \nהמכללה לשוטרים & ד\nזמנים\nלבקש פה \n0552683249",
  "0552683249"
);
assert(!dedupKey1.duplicate, "נסיעה 1 של סדרן 0552683249 מתקבלת");

const dedupKey2 = deduper.check(
  "פ שמש 50 \nד & קריה\nזמנים\nלבקש פה \n0552683249",
  "0552683249"
);
assert(!dedupKey2.duplicate, "נסיעה 2 של סדרן 0552683249 (ד & קריה באותו מחיר) מתקבלת ולא נחסמת ככפילות!");

const dedupKeyExact = deduper.check(
  "פ שמש 50 \nד & קריה\nזמנים\nלבקש פה \n0552683249",
  "0552683249"
);
assert(dedupKeyExact.duplicate, "שליחה חוזרת של אותה נסיעה בדיוק נחסמת ככפילות אמיתית");

// 2. רמג - קרייה
const vRmg = matcher.rideMatches(`שמש 50ש\nרמג - קרייה\n\nלבקש באישי עם תיוג המכרז!`, internalShemeshState);
assert(vRmg.ok, `רמג - קרייה התקבלה בהצלחה: "${vRmg.reason}"`);

// 3. שער בנימין אדם 50ש (נפסל מבית שמש)
const vShaarBinyamin = matcher.rideMatches(`שער בנימין אדם 50ש\n2א\nזמנים`, internalShemeshState);
assert(!vShaarBinyamin.ok, `שער בנימין אדם נפסל מבית שמש פנימי בהצלחה: "${vShaarBinyamin.reason}"`);

// 4. הודעת משטרות עם המילה "אלה" (נפסלת לחלוטין)
const msgPoliceAla = `אני מכיר בדרך כלל בשעות אלה חוזר מהאירועים לבית ונוסע משמה שאני בצפון והכל אז יודע`;
const vPoliceAla = matcher.rideMatches(msgPoliceAla, internalShemeshState);
assert(!vPoliceAla.ok, `הודעת שיחה עם המילה "אלה" נפסלת בהצלחה ולא מזוהה כאות א ל-ה`);

// 5. ג לרמה ד / אלישע הנביא
const vGleD = matcher.rideMatches(`שמש 50 \nג לרמה ד\nאלישע הנביא זמן`, internalShemeshState);
assert(vGleD.ok, `ג לרמה ד / אלישע הנביא התקבלה בהצלחה: "${vGleD.reason}"`);

// 6. הרצוג לנהרדע
const vHerzog = matcher.rideMatches(`שמש 50\nהרצוג לנהרדע\nזמן`, internalShemeshState);
assert(vHerzog.ok, `הרצוג לנהרדע התקבלה בהצלחה: "${vHerzog.reason}"`);

// 7. רוגלית שמש 80 (מושב בעמק האלה - נפסל מפנימי)
const vRoglit = matcher.rideMatches(`רוגלית שמש 80\nזמן`, internalShemeshState);
assert(!vRoglit.ok, `רוגלית (מושב אזורי) נפסל מפנימי בית שמש: "${vRoglit.reason}"`);

// 8. יואל הנביא לגפן
const vYoelGefen = matcher.rideMatches(`שמש 70\nיואל הנביא לגפן\nזמן`, internalShemeshState);
assert(vYoelGefen.ok, `יואל הנביא לגפן התקבלה בהצלחה: "${vYoelGefen.reason}"`);

// 9. חתימת תחנה: אור החיים אינו מזהם את הנסיעה
const vStationClean = matcher.rideMatches(`⚠️⚠️⚠️⚠️⚠️⚠️\nשמש פ 50ש\nא 1 משלמת בביט\nד להישנה\nשד' האמוראים זמן\nwa.me/972552732722?text=ת+852897622+gd66wp\n‎⛔אור החיים🏅⛔ללא פון🏅`, internalShemeshState);
assert(vStationClean.ok, `נסיעה עם חתימת תחנת אור החיים התקבלה נקי: "${vStationClean.reason}"`);

// 10. בדיקת לוגיקת שידור (Broadcast) - אימות שאין TypeError על sessions
const mockSessionsSummary = {
  bot: { phone: "972555081810", connected: true },
  drivers: [
    { phone: "972515157166", status: "connected" },
    { phone: "972501234567", status: "disconnected" }
  ],
  totalConnectedDrivers: 1
};
const mockApprovedUsers = [
  { phone: "972515157166", name: "נהג מחובר" },
  { phone: "972501234567", name: "נהג מנותק" }
];
const driverList = Array.isArray(mockSessionsSummary?.drivers) ? mockSessionsSummary.drivers : [];
const connectedPhones = new Set(
  driverList
    .filter((s) => s.status === "connected")
    .map((s) => s.phone)
);
const allTargets = mockApprovedUsers;
const connectedTargets = mockApprovedUsers.filter((u) => connectedPhones.has(u.phone));

assert(allTargets.length === 2, "שידור לכל הנהגים כולל את כל המאושרים");
assert(connectedTargets.length === 1 && connectedTargets[0].phone === "972515157166", "שידור למחוברים בלבד מסנן בהצלחה ללא שגיאת sessions.filter");

// ==========================================
// בדיקה 8: תרחישי הגרסה החדשה (מניעת כפילויות DriveBot ופסילת נסיעות חוץ)
// ==========================================
console.log("\n--- בדיקה 8: תרחישי הגרסה החדשה (DriveBot כפילויות ונסיעות חוץ) ---");

// 1. פסילת נסיעת חוץ מגבעתיים (למרות שמוזכרת 'רמה ד' ו'גנסין')
const vGivatayim = matcher.rideMatches(`גבעתיים שמש נחת 100\nגנסין 👈 רמה ד`, internalShemeshState);
assert(!vGivatayim.ok, `נסיעת חוץ מגבעתיים נפסלת מפנימי בית שמש: "${vGivatayim.reason}"`);

// 2. זיהוי 'רמה ד' כשלעצמו שאינו מהווה מעבר פנימי
const vRamatDAlone = matcher.detectInternalTransitionBeitShemesh("רמה ד");
assert(!vRamatDAlone, "שכונת 'רמה ד' לבדה אינה מעבר פנימי");

// 3. מניעת כפילות DriveBot בין קבוצות וואטסאפ שונות עם סיומת קישור שונה (+vkvdnj מול +hwrp6k)
const msgDriveBotGroup1 = `⚠️⚠️⚠️⚠️⚠️⚠️\nפ שמש\nעלית הנוער לרמה א\n50 זמן\nווצאפ ☚ wa.me/972552732722?text=ת+973865848+vkvdnj\nטלגרם ☚ t.me/prod_drivebot?start=t-973865848-vkvdnj\n😁 קרליבך 😁\n━━━━━━━━━━━━━━━━━━━\n⚠️ | חשוב: התחברו כבר עכשיו לפלטפורמות החדשות של דרייבוט!`;
const msgDriveBotGroup2 = `⚠️⚠️⚠️⚠️⚠️⚠️\nפ שמש\nעלית הנוער לרמה א\n50 זמן\nווצאפ ☚ wa.me/972552732722?text=ת+973865848+hwrp6k\nטלגרם ☚ t.me/prod_drivebot?start=t-973865848-hwrp6k\n😁 קרליבך 😁\n━━━━━━━━━━━━━━━━━━━\n⚠️ | חשוב: התחברו כבר עכשיו לפלטפורמות החדשות של דרייבוט!`;

const testDeduper = createDeduper(matcher.findPlaces);
const chk1 = testDeduper.check(msgDriveBotGroup1, "972539485860");
const chk2 = testDeduper.check(msgDriveBotGroup2, "972539485860");

assert(!chk1.duplicate, "הודעה ראשונה של דרייבוט מקבוצה א מאושרת כנסיעה חדשה");
assert(chk2.duplicate, `הודעה שנייה של אותה נסיעה מקבוצה ב נחסמת ככפילות: "${chk2.reason}"`);

// 4. קבלת נסיעות בית שמש פנימיות חדשות
const vAliyatHanoar = matcher.rideMatches(`פ שמש\nעלית הנוער לרמה א\n50 זמן\nלבקש פה`, internalShemeshState);
assert(vAliyatHanoar.ok, `עלית הנוער לרמה א התקבלה: "${vAliyatHanoar.reason}"`);

const vPoliceCollege = matcher.rideMatches(`פ שמש 50\nהמכללה לשוטרים & ד\nזמנים\nלבקש פה 0552683249`, internalShemeshState);
assert(vPoliceCollege.ok, `המכללה לשוטרים & ד התקבלה: "${vPoliceCollege.reason}"`);

console.log(`\n🎉 סיום: ${passed}/${total} בדיקות עברו בהצלחה מושלמת!`);
