// dedupe.js - מזהה שהודעת נסיעה כבר נשלחה אליך (נשלחה שוב באותה קבוצה, או הועברה לקבוצות אחרות)
//
// הודעה נחשבת כפילות אם אחד המפתחות שלה כבר נראה בחלון הזמן:
//   1. אותו קישור
//   2. אותו טקסט בדיוק (אחרי ניקוי סימנים), גם מקבוצה אחרת
//   3. אותו מחיר + אותו רחוב (או אותה שכונה, כשאין רחוב). ערים לבד לא נספרות, כדי לא לאחד שתי נסיעות
//      שונות באותו מסלול ובאותו מחיר. אם יש בהודעה טלפון של לקוח, הוא חלק מהמפתח
//   4. אותו טלפון של הלקוח + אותו מחיר

import { normalizeText } from "./matcher.js";

const URL_RE = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|waze\.com\/|maps\.app\.goo\.gl\/|goo\.gl\/)[^\s]+/gi;
const PHONE_RE = /(?:\+?972|0)[-\s]?5\d[-\s]?\d{3}[-\s]?\d{4}/g; // נייד ישראלי
const TIME_RE = /\b\d{1,2}[:.]\d{2}\b/g;                        // 14:30
const MIN_EXACT_TEXT_LENGTH = 15; // הודעות קצרות מדי ("פ שמש 50") לא נבדקות לפי טקסט, כי הן יכולות להיות שני אנשים שונים
const MIN_PRICE = 20;             // מספר קטן מזה הוא כנראה מספר בית ולא מחיר

function phoneDigits(raw) {
  const d = String(raw).replace(/\D/g, "");
  return d.startsWith("0") ? "972" + d.slice(1) : d;
}

export function extractPhones(text) {
  return [...new Set((String(text).match(PHONE_RE) || []).map(phoneDigits))];
}

export function extractLinks(text) {
  const links = (String(text).match(URL_RE) || []).map((u) => u.toLowerCase().replace(/[.,;!?)\]]+$/, ""));
  return [...new Set(links)];
}

// המחיר: קודם מספר שצמוד ל-₪ / שח, ואחרת המספר התקין הראשון (2-3 ספרות). לא נספרים: טלפונים, שעות, "15 דק"
export function extractPrice(text) {
  const cleaned = String(text).replace(URL_RE, " ").replace(PHONE_RE, " ").replace(TIME_RE, " ").replace(/\d{6,}/g, " ");

  const withCurrency = cleaned.match(/(?<!\d)(\d{2,3})(?!\d)\s*(?:₪|שח|ש"ח|שקל)/);
  if (withCurrency && +withCurrency[1] >= MIN_PRICE) return +withCurrency[1];

  const re = /(?<!\d)(\d{2,3})(?!\d)(\s*(?:דק|דקות|דקה|שעות|שעה|קמ|ק"מ|km))?/gi;
  let m;
  while ((m = re.exec(cleaned))) {
    if (m[2]) continue;                                           // "15 דק"
    if (/שעה\s*$/.test(cleaned.slice(Math.max(0, m.index - 6), m.index))) continue;             // "בשעה 14"
    if (+m[1] >= MIN_PRICE) return +m[1];
  }
  return null;
}

// findPlaces מגיעה מ-matcher.js, כדי שנשתמש באותו זיהוי רחובות ושכונות
export function createDeduper(findPlaces, { windowMs = 15 * 60 * 1000 } = {}) {
  const seen = new Map(); // מפתח -> זמן אחרון שנראה

  function keysFor(text) {
    const keys = [];
    for (const link of extractLinks(text)) keys.push({ key: `link:${link}`, label: "אותו קישור" });

    const norm = normalizeText(text);
    if (norm.length >= MIN_EXACT_TEXT_LENGTH) keys.push({ key: `text:${norm}`, label: "אותה הודעה בדיוק" });

    const price = extractPrice(text);
    const phones = extractPhones(text);
    const places = findPlaces(text);
    const streets = [...new Set(places.filter((p) => p.kind === "street").map((p) => p.phrase))].sort();
    const hoods = [...new Set(places.filter((p) => p.kind === "neighborhood").map((p) => p.phrase))].sort();

    // אם בהודעה יש טלפון של לקוח, הוא חלק מהמפתח: שני לקוחות שונים באותו רחוב ובאותו מחיר הם לא אותה נסיעה
    const phoneTag = phones.length ? `|${phones.join(",")}` : "";
    if (price) {
      if (streets.length) {
        // רחוב מזהה נסיעה טוב יותר משכונה, ולכן כל רחוב הוא מפתח בפני עצמו (ההעתק יכול להשמיט את השכונה)
        for (const s of streets) keys.push({ key: `street:${price}|${s}${phoneTag}`, label: `אותו מחיר (${price}) ואותו רחוב (${s})` });
      } else if (hoods.length) {
        keys.push({ key: `hood:${price}|${hoods.join(",")}${phoneTag}`, label: `אותו מחיר (${price}) ואותה שכונה (${hoods.join(", ")})` });
      }
    }

    for (const phone of phones) keys.push({ key: `phone:${phone}|${price ?? ""}`, label: "אותו טלפון ואותו מחיר" });
    return keys;
  }

  return {
    // מחזיר { duplicate, reason }. אם זו לא כפילות, זוכר את ההודעה. אם כן, מרענן את הזמן כדי שהמשך שליחה חוזרת ימשיך להיחסם
    check(text, now = Date.now()) {
      for (const [k, t] of seen) if (now - t > windowMs) seen.delete(k);
      const keys = keysFor(text);
      const hit = keys.find((k) => seen.has(k.key));
      for (const k of keys) seen.set(k.key, now);
      return hit ? { duplicate: true, reason: hit.label } : { duplicate: false, reason: "" };
    },
    clear() {
      seen.clear();
    },
    get size() {
      return seen.size;
    },
  };
}
