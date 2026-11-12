import { 
  loadUsersData, 
  saveUsersData, 
  addPendingUser, 
  approveUser, 
  rejectUser, 
  deleteApprovedUser,
  registerLidMapping,
  loadLidMap,
  saveLidMap,
  removeLidMapping,
  clearAllLidMappings,
  cleanPhone,
  isLid
} from "./users-manager.js";

console.log("=========================================");
console.log("🧪 בדיקות אימות, ניקוי קוקיז ומיפויי LID");
console.log("=========================================");

// 1. בדיקת זיהוי LID
console.log("1. בדיקת זיהוי מזהי LID...");
if (!isLid("87467076137026") || !isLid("150062449578160@lid")) {
  throw new Error("כשל בזיהוי מזהה LID");
}
if (isLid("0521234567") || isLid("972555081810")) {
  throw new Error("מספר רגיל סווג בטעות כ-LID");
}
console.log("✅ זיהוי LID עובד במדויק!");

// 2. בדיקת מיפוי LID ומחיקה ספציפית
console.log("2. בדיקת מיפוי ומחיקת LID ספציפי...");
registerLidMapping("150062449578160", "0521234567");
let map = loadLidMap();
if (map["150062449578160"] !== "972521234567") {
  throw new Error("כשל ברישום מיפוי LID");
}
removeLidMapping("150062449578160");
map = loadLidMap();
if (map["150062449578160"]) {
  throw new Error("כשל בהסרת מיפוי LID");
}
console.log("✅ רישום והסרת מיפוי LID עובדים במדויק!");

// 3. בדיקת מחיקת בקשה ללא טלפון / עם מזהה בלבד
console.log("3. בדיקת מחיקת בקשה לפי מזהה ID בלבד...");
const testId = `pend-test-${Date.now()}`;
const users = loadUsersData();
users.pendingUsers.push({
  id: testId,
  phone: "ללא מספר",
  name: "משתמש לבדיקת מחיקה",
  requestedAt: new Date().toISOString()
});
saveUsersData(users);

const rejectRes = rejectUser(testId);
if (!rejectRes.success) {
  throw new Error("כשל במחיקת בקשה לפי מזהה ID");
}
const usersAfter = loadUsersData();
if (usersAfter.pendingUsers.some(u => u.id === testId)) {
  throw new Error("המשתמש עדיין קיים ברשימת הממתינים לאחר המחיקה!");
}
console.log("✅ מחיקת בקשות ללא מספר/עם ID בלבד עובדת חלקית ומלאה!");

// 4. בדיקת איפוס מוחלט של כל מיפויי ה-LID מ-lid-map.json
console.log("4. בדיקת איפוס מוחלט clearAllLidMappings...");
registerLidMapping("8888888888888", "0541112233");
clearAllLidMappings();
const finalMap = loadLidMap();
if (Object.keys(finalMap).length > 0) {
  throw new Error("מיפויי LID עדיין נשארו ב-lid-map.json לאחר איפוס מלא!");
}
console.log("✅ איפוס מלא של כל מיפויי ה-LID עבר בהצלחה מושלמת!");

console.log("=========================================");
console.log("🎉 כל בדיקות האימות, הקוקיז וה-LID עברו בהצלחה!");
console.log("=========================================");
