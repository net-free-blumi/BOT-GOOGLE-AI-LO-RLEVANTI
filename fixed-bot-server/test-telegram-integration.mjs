// test-telegram-integration.mjs
// בדיקת אינטגרציית טלגרם וסריקה מקבילה (Dual-Channel WhatsApp + Telegram)

import assert from "node:assert";
import { 
  getTelegramStatus, 
  updateDriverTelegram, 
  disconnectDriverTelegram, 
  processIncomingTelegramRide, 
  buildDriverTelegramInfoMessage 
} from "./telegram-manager.js";
import { setUserSearch } from "./users-manager.js";

console.log("=========================================");
console.log("✈️ בדיקת אינטגרציית טלגרם וסריקה כפולה");
console.log("=========================================");

// 1. קבלת סטטוס טלגרם
console.log("1. בדיקת קבלת סטטוס טלגרם...");
const status = getTelegramStatus();
assert(status.ok, "סטטוס טלגרם צריך להיות תקין");
assert(Array.isArray(status.monitoredGroups), "צריכה להיות רשימת קבוצות מנוטרות");
console.log(`✅ סטטוס טלגרם תקין: ${status.monitoredGroups.length} קבוצות מנוטרות`);

// 2. חיבור טלגרם עבור נהג
console.log("2. בדיקת חיבור טלגרם עבור נהג...");
const testDriver = "972515157166";
const conf = updateDriverTelegram(testDriver, {
  telegramPhone: "0515157166",
  username: "driver_test",
  groups: ["מאוחדים תגבור ריידר 👑", "ריידר הפצה בקבוצות"],
  forwardToWa: true,
  connected: true,
});
assert.strictEqual(conf.connected, true);
assert.strictEqual(conf.username, "driver_test");
console.log("✅ חיבור טלגרם עבור נהג נשמר בהצלחה!");

// 3. הגדרת חיפוש פעיל לנהג ובדיקת קליטת נסיעה מטלגרם
console.log("3. בדיקת התאמת נסיעה מטלגרם (בדיוק לפי Image 2)...");
// הנהג מחפש פנימי בית שמש
setUserSearch(testDriver, {
  active: true,
  mode: "internal_only",
  city: "בית שמש",
  displayText: "בית שמש (פנימי)",
  searches: [
    { mode: "internal_only", city: "בית שמש", displayText: "בית שמש (פנימי)" }
  ]
});

// סימולציית סוקט לקבלת ההודעה
let sentMessage = null;
const mockSock = {
  sendMessage: async (jid, payload) => {
    sentMessage = { jid, payload };
    return { key: { id: "mock-msg-id" } };
  }
};

const ridePayload = {
  groupTitle: "מאוחדים תגבור ריידר 👑",
  senderName: "ריידר הפצה בטלגרם",
  text: "שמש באר יעקוב 100 ש\nרמה ד נק\nאיסוף היום\nמסירה מחר בבוקר\n------------------\n*8000\nיהונתן תשובה 🤠\n👇 לחצו כאן לבקשת הנסיעה 👇\n⛔ מבקשים רק בכפתור 👈 ריידר הפצה בקבוצות",
  directUrl: "https://t.me/c/123456789/500",
};

const matchResult = await processIncomingTelegramRide(ridePayload, {
  getMainBotSock: () => mockSock,
});

assert.strictEqual(matchResult.ok, true, "עיבוד נסיעת טלגרם צריך להצליח");
assert.strictEqual(matchResult.matched, true, "הנסיעה צריכה להתאים לחיפוש של הנהג");
assert(sentMessage, "הודעה צריכה להישלח לוואטסאפ של הנהג");
assert(sentMessage.payload.text.includes("🔹 *נסיעה מטלגרם* 🔹"), "ההודעה צריכה להכיל את הכותרת המעוצבת מטלגרם");
assert(sentMessage.payload.text.includes("מאוחדים תגבור ריידר 👑"), "ההודעה צריכה להכיל את שם הקבוצה בטלגרם");
console.log("✅ נסיעה מטלגרם עובדה, סוננה ונמסרה לוואטסאפ של הנהג בעיצוב המדויק מ-Image 2!");

// 4. בדיקת מניעת כפילות נסיעה בטלגרם
console.log("4. בדיקת מניעת כפילות נסיעה חוזרת בטלגרם...");
sentMessage = null;
const duplicateResult = await processIncomingTelegramRide(ridePayload, {
  getMainBotSock: () => mockSock,
});
assert.strictEqual(duplicateResult.matched, false, "נסיעה כפולה צריכה להיפסל");
assert.strictEqual(sentMessage, null, "לא צריכה להישלח הודעה חוזרת על נסיעה כפולה");
console.log("✅ מניעת כפילות בטלגרם עובדת במדויק!");

// 5. בדיקת הודעת מידע לנהג בוואטסאפ
console.log("5. בדיקת מענה להודעת 'טלגרם' בוואטסאפ...");
const infoMsg = buildDriverTelegramInfoMessage(testDriver);
assert(infoMsg.includes("חיבור חשבון טלגרם"), "הודעת המידע צריכה להכיל הסבר על חיבור טלגרם");
assert(infoMsg.includes("מחובר וסורק"), "ההודעה צריכה להציג סטטוס מחובר");
console.log("✅ מענה לפקודת 'טלגרם' בוואטסאפ עובד במדויק!");

console.log("=========================================");
console.log("🎉 כל בדיקות אינטגרציית טלגרם עברו בהצלחה מושלמת (100%)!");
console.log("=========================================");
