import { readFileSync } from "node:fs";
import { createMatcher } from "./matcher.js";

const cities = JSON.parse(readFileSync(new URL("./cities.json", import.meta.url), "utf8"));
const streets = JSON.parse(readFileSync(new URL("./streets-full.json", import.meta.url), "utf8"));

const m = createMatcher(cities, streets);

let bad = 0;
function assertMatch(desc, text, state, expectedOk, groupName = "") {
  const result = m.rideMatches(text, state, groupName);
  const pass = result.ok === expectedOk;
  if (!pass) bad++;
  console.log(
    pass ? "✅ PASS" : "❌ FAIL",
    `[${desc}]`,
    `\n   טקסט: "${text.replace(/\n/g, " / ")}"`,
    `\n   תוצאה: ${result.ok} (${result.reason}) | ציפינו ל: ${expectedOk}\n`
  );
}

console.log("=========================================");
console.log(" בדיקות מצב פנימי בית שמש (פנימי שמש)");
console.log("=========================================");
const internalShemesh = { mode: "internal", origin: "בית שמש", destination: null };

assertMatch("פנימי רגיל עם רחובות", "פנימי שמש 50\nסמטת הגפן לנחום הנביא", internalShemesh, true);
assertMatch("מעבר שכונות חפציבה לב", "חפציבה לב 50\nספיישל", internalShemesh, true);
assertMatch("מעבר שכונות רמה ד לב", "רמה ד לב 50", internalShemesh, true);
assertMatch("פנימי עם מושב סמוך צרעה", "שמש פ 80\nלוי אשכול & צרעה", internalShemesh, true);
assertMatch("פנימי עם סאן מול", "פנימי שמש 50\nרמה ד לקריה\nסאן מול", internalShemesh, true);
assertMatch("פנימי עם נעימי", "פנימי שמש 50\nרמה ד לנעימי", internalShemesh, true);
assertMatch("פסילת עיר חיצונית (ביתר)", "ביתר שמש 50\nשלום רב\nנחת", internalShemesh, false);
assertMatch("פסילת עיר חיצונית (ירושלים)", "ים שמש 150 משלם בהעברה\nהר נוף זמן", internalShemesh, false);
assertMatch("פסילת עיר חיצונית (חריש)", "חריש שמש נחת 130", internalShemesh, false);
assertMatch("פסילת עיר חיצונית (בני ברק)", "בב שמש 70 נהגת", internalShemesh, false);

console.log("=========================================");
console.log(" בדיקות מצב פנימי ירושלים (פנימי ים)");
console.log("=========================================");
const internalJerusalem = { mode: "internal", origin: "ירושלים", destination: null };

assertMatch("פנימי ירושלים עם שכונות", "פנימי ים\nירמיהו & גילה\nתחנה על ירמיהו", internalJerusalem, true);
assertMatch("פנימי ירושלים קבר רחל ומאה שערים", "ים 120 סיינה\nקבר רחל & מאה שערים", internalJerusalem, true);
assertMatch("פנימי ירושלים טדי ישיבת מיר", "פנימי ים 70\nטדי - ישיבת מיר\nזמן", internalJerusalem, true);
assertMatch("פסילת שדה תעופה (שדה=נתבג)", "ים שדה 200 ללא פון", internalJerusalem, false);
assertMatch("פסילת ביתר", "ים ביתר 120ש\nרמות\nזמן", internalJerusalem, false);
assertMatch("פסילת מעלה אדומים", "ים מעלה אדומים 150", internalJerusalem, false);
assertMatch("פסילת מגדל העמק (לא ירושלים!)", "מגדל העמק לכרם שלום 3300", internalJerusalem, false);

console.log("=========================================");
console.log(" בדיקות מסלול בית שמש ⬅️ ירושלים (פנוי שמש ים)");
console.log("=========================================");
const routeShemeshToJerusalem = { mode: "route", origin: "בית שמש", destination: "ירושלים" };

assertMatch("מסלול ישיר בית שמש לירושלים", "4. שמש ים 51\nמשלוח שקית\nנהר הירדן > שמגר", routeShemeshToJerusalem, true);
assertMatch("מסלול ישיר כיוון הפוך (ים שמש)", "ים שמש 190ש\nהדסה עין כרם", routeShemeshToJerusalem, false);
assertMatch("פסילת פנימי שמש במסלול", "פנימי שמש 50\nרמה ד לרמה ג", routeShemeshToJerusalem, false);

console.log("=========================================");
console.log(" בדיקות מצב צמצום בית שמש (שמש צמצם)");
console.log("=========================================");
const reduceShemesh = { mode: "reduce", origin: "בית שמש", destination: null };

assertMatch("צמצום מאשר פנימי", "פנימי שמש 50\nרמה ב לרמה ד", reduceShemesh, true);
assertMatch("צמצום מאשר יוצא לירושלים", "שמש ים 150ש\nנהר הירדן", reduceShemesh, true);
assertMatch("צמצום מאשר יוצא לבני ברק", "שמש בב 120", reduceShemesh, true);
assertMatch("צמצום פוסל נסיעה שאינה קשורה", "תא רעננה 150", reduceShemesh, false);

if (bad > 0) {
  console.error(`❌ נכשלו ${bad} בדיקות`);
  process.exit(1);
} else {
  console.log("🎉 כל הבדיקות עברו בהצלחה מושלמת (100% דיוק)!");
}
