// test-telegram-integration.mjs
// בדיקת אינטגרציית טלגרם וסריקה מקבילה (חיבור לפי מספר פלאפון + קוד אימות + זיהוי קבוצות)

import assert from "node:assert";
import { 
  getTelegramStatus, 
  updateDriverTelegram, 
  disconnectDriverTelegram, 
  processIncomingTelegramRide, 
  buildDriverTelegramInfoMessage,
  requestDriverTelegramCode,
  verifyDriverTelegramCode,
  handleDriverTelegramCommand,
  hasPendingTelegramAuth
} from "./telegram-manager.js";
import { setUserSearch } from "./users-manager.js";

console.log("=========================================");
console.log("✈️ בדיקת אינטגרציית טלגרם (מספר פלאפון + קוד אימות)");
console.log("=========================================");

// 1. קבלת סטטוס טלגרם
console.log("1. בדיקת קבלת סטטוס טלגרם...");
const status = getTelegramStatus();
assert(status.ok, "סטטוס טלגרם צריך להיות תקין");
assert(Array.isArray(status.monitoredGroups), "צריכה להיות רשימת קבוצות מנוטרות");
console.log(`✅ סטטוס טלגרם תקין: ${status.monitoredGroups.length} קבוצות מנוטרות`);

// 2. בדיקת שלב א': בקשת קוד אימות לטלגרם דרך מספר טלפון
console.log("2. בדיקת שלב א' - בקשת קוד אימות למספר טלפון...");
const testDriver = "972515157166";
const reqRes = await requestDriverTelegramCode(testDriver, "0515157166");
assert.strictEqual(reqRes.ok, true, "בקשת קוד צריכה להצליח");
assert.strictEqual(reqRes.telegramPhone, "972515157166");
assert(hasPendingTelegramAuth(testDriver), "צריכה להיות בקשת אימות פעילה בהמתנה");
console.log(`✅ בקשת קוד אימות הופקה בהצלחה למספר: ${reqRes.telegramPhone}`);

// 3. בדיקת שלב ב': אימות קוד בן 5 ספרות, זיהוי קבוצות נסיעות וחיבור קבוע
console.log("3. בדיקת שלב ב' - אימות קוד בן 5 ספרות וזיהוי קבוצות נסיעות...");
const verifyRes = await verifyDriverTelegramCode(testDriver, "12345");
assert.strictEqual(verifyRes.ok, true, "אימות הקוד צריך להצליח");
assert.strictEqual(verifyRes.connected, true, "הנהג צריך להיות מחובר");
assert(Array.isArray(verifyRes.groups), "צריכות להיות קבוצות שזוהו בחשבון הנהג");
assert(verifyRes.groups.length > 0, "לפחות קבוצה אחת צריכה להיות מזוהה");
assert(verifyRes.groups.includes("מאוחדים תגבור ריידר 👑"), "קבוצת מאוחדים תגבור ריידר צריכה להיכלל");
console.log(`✅ אימות הצליח! זוהו ${verifyRes.groups.length} קבוצות נסיעות בחשבון הנהג!`);

// 4. בדיקת פקודת וואטסאפ: ניתוק עצמי "נתק טלגרם"
console.log("4. בדיקת פקודת ניתוק עצמי של נהג בוואטסאפ: 'נתק טלגרם'...");
const disconnectRes = await handleDriverTelegramCommand(testDriver, "נתק טלגרם");
assert(disconnectRes.includes("נותק מהמערכת"), "הניתוק צריך להצליח ולהחזיר אישור");
console.log("✅ ניתוק עצמי דרך פקודת וואטסאפ עובד במדויק!");

// 5. בדיקת פקודת וואטסאפ: בקשת חיבור למספר טלפון "חבר טלגרם 0515157166"
console.log("5. בדיקת פקודת חיבור נהג בוואטסאפ: 'חבר טלגרם 0515157166'...");
const connectCmdRes = await handleDriverTelegramCommand(testDriver, "חבר טלגרם 0515157166");
assert(connectCmdRes.includes("קוד אימות נשלח"), "הבוט צריך לשלוח הנחיות לקוד אימות");
assert(connectCmdRes.includes("972515157166") || connectCmdRes.includes("0515157166"), "ההודעה צריכה לציין את מספר הטלפון");
console.log("✅ פקודת 'חבר טלגרם' הפיקה קוד אימות והנחיות לנהג!");

// 6. בדיקת הזנת קוד אימות בוואטסאפ: הנהג שולח "12345"
console.log("6. בדיקת הזנת קוד אימות בוואטסאפ ע\"י הנהג: '12345'...");
const codeSubmitRes = await handleDriverTelegramCommand(testDriver, "12345");
assert(codeSubmitRes.includes("חובר בהצלחה"), "החיבור צריך להצליח לאחר הזנת הקוד");
assert(codeSubmitRes.includes("קבוצות נסיעות"), "האישור צריך להציג את הקבוצות שזוהו");
console.log("✅ הנהג הזין קוד בוואטסאפ, הקבוצות זוהו והחיבור הושלם בהצלחה!");

// 7. בדיקת דחיית שימוש ב-@username והפניה למספר טלפון
console.log("7. בדיקת מענה כאשר נהג מנסה לשלוח @username...");
const usernameAttemptRes = await handleDriverTelegramCommand(testDriver, "חבר טלגרם @driver_test");
assert(usernameAttemptRes.includes("מספר טלפון בלבד"), "הבוט צריך להבהיר שחיבור נעשה דרך מספר טלפון בלבד");
assert(!usernameAttemptRes.includes("driver_test חובר"), "אסור לחבר דרך username");
console.log("✅ ניסיון @username נדחה עם הנחיה ברורה למספר טלפון בלבד!");

// 8. הגדרת חיפוש פעיל לנהג ובדיקת קליטת נסיעה מטלגרם
console.log("8. בדיקת התאמת נסיעה מטלגרם ומסירתה לוואטסאפ...");
setUserSearch(testDriver, {
  active: true,
  mode: "internal_only",
  city: "בית שמש",
  displayText: "בית שמש (פנימי)",
  searches: [
    { mode: "internal_only", city: "בית שמש", displayText: "בית שמש (פנימי)" }
  ]
});

let sentMessages = [];
const mockSock = {
  sendMessage: async (jid, payload) => {
    sentMessages.push({ jid, payload });
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
assert(sentMessages.length > 0, "הודעה צריכה להישלח לוואטסאפ של הנהג");
const rideMsg = sentMessages.find((m) => m.payload.text && m.payload.text.includes("נסיעה מטלגרם"));
assert(rideMsg, "ההודעה צריכה להכיל את הכותרת המעוצבת מטלגרם");
assert(rideMsg.payload.text.includes("מאוחדים תגבור ריידר 👑"), "ההודעה צריכה להכיל את שם הקבוצה בטלגרם");
console.log("✅ נסיעה מטלגרם עובדה, סוננה ונמסרה לוואטסאפ של הנהג בעיצוב המדויק!");

console.log("=========================================");
console.log("🎉 כל בדיקות אינטגרציית טלגרם (טלפון + קוד) עברו בהצלחה מושלמת (100%)!");
console.log("=========================================");
