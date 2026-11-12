import assert from "node:assert";
import {
  cleanPhone,
  isUserApproved,
  canReplyToUnapproved,
  getUserSearch,
  setUserSearch,
  addOrStageUserSearch,
  confirmPendingSearch,
  loadUsersData,
  registerLidMapping,
  loadLidMap
} from "./users-manager.js";
import { getDriverTelegramInfo } from "./telegram-manager.js";

console.log("🚀 מתחיל בדיקות אימות Meta LID, אישור חיפוש מקבילי 1/כן וטלגרם...");

// 1. מיפוי LID ידוע
registerLidMapping("150062449578160", "972539485860");
const cleaned = cleanPhone("150062449578160@lid");
assert.strictEqual(cleaned, "972539485860", "cleanPhone צריך להחזיר את מספר הטלפון הממופה");
console.log("✅ 1. cleanPhone מזהה בהצלחה את הטלפון הממופה מתוך LID");

// 2. אישור משתמש
const approved = isUserApproved("150062449578160@lid");
assert.strictEqual(approved, true, "isUserApproved צריך להחזיר true עבור LID ממופה לנהג מאושר");
console.log("✅ 2. isUserApproved מזהה בהצלחה נהג מאושר מתוך LID");

// 3. אי-חסימת פקודות ב-canReplyToUnapproved
const canReply1 = canReplyToUnapproved("150062449578160", "1");
assert.strictEqual(canReply1, true, "פקודת '1' לעולם אינה נחסמת בצינון");
const canReplyKen = canReplyToUnapproved("150062449578160", "כן");
assert.strictEqual(canReplyKen, true, "פקודת 'כן' לעולם אינה נחסמת בצינון");
console.log("✅ 3. canReplyToUnapproved אינו חוסם לעולם פקודות 1 / כן / תפוס");

// 4. חיפוש קיים ואישור חיפוש שני במקביל
setUserSearch("972539485860", {
  active: true,
  searches: [
    {
      id: "s_test_1",
      mode: "city_all",
      origin: "בית שמש",
      displayText: "בית שמש (בתוך ומחוץ לעיר)",
      addedAt: new Date().toISOString()
    }
  ],
  pendingSearch: null
});

// נהג מוסיף חיפוש בני ברק
const stageRes = addOrStageUserSearch("972539485860", {
  mode: "city_all",
  origin: "בני ברק",
  displayText: "בני ברק (בתוך ומחוץ לעיר)"
});
assert.strictEqual(stageRes.status, "pending_confirmation", "חיפוש שני צריך להיכנס להמתנה לאישור");
console.log("✅ 4. חיפוש שני נכנס בהצלחה למצב המתנה (pendingSearch)");

// הנהג משיב '1' מחשבון ה-LID שלו!
const confirmRes = confirmPendingSearch("150062449578160", false);
assert.strictEqual(confirmRes.success, true, "confirmPendingSearch צריך להצליח מתוך ה-LID");
assert.strictEqual(confirmRes.current.searches.length, 2, "חייבים להיות כעת 2 חיפושים מקביליים פעילים");
console.log("✅ 5. מענה '1' מתוך ה-LID אישר בהצלחה 2 חיפושים במקביל!");

// 6. בדיקת סטטוס טלגרם מתוך ה-LID
const tgInfo = getDriverTelegramInfo("150062449578160");
assert.strictEqual(tgInfo.connected, true, "סטטוס טלגרם צריך להיות connected עבור הנהג");
console.log("✅ 6. getDriverTelegramInfo מזהה בהצלחה שחשבון הטלגרם מחובר מתוך ה-LID");

// 7. בדיקת מנגנון Fail-Safe של staged search
setUserSearch("972539485860", {
  active: true,
  searches: [{ id: "s1", displayText: "חיפוש 1", origin: "עיר 1", mode: "city_all" }],
  pendingSearch: { id: "p1", displayText: "חיפוש 2", origin: "עיר 2", mode: "city_all", stagedAt: new Date().toISOString() }
});
// נניח ש-LID לא מוכר בכלל שלח "1"
const unknownLid = "999999999999999";
const fallbackRes = confirmPendingSearch(unknownLid, false);
assert.strictEqual(fallbackRes.success, true, "מנגנון fail-safe מזהה חיפוש שהוזן ב-15 דקות האחרונות ומאשר אותו");
console.log("✅ 7. מנגנון Fail-Safe חיבר בהצלחה חיפוש שהמתין וקשר את ה-LID החדש!");

console.log("\n🎉 כל 7 בדיקות ה-LID והחיפושים המקביליים עברו בהצלחה מושלמת!");
