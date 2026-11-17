// matcher.js - זיהוי מקומות בהודעות נסיעה, הבנת פקודות הנהג, והחלטה אם נסיעה מתאימה

import { readFileSync } from "node:fs";

// ===== הגדרות שאפשר לשנות =====
// true  = בחיפוש מסלול (פנוי בית שמש לירושלים) הנסיעה חייבת להיות בכיוון הנכון: מבית שמש לירושלים
// false = מספיק ששתי הערים מופיעות בהודעה, בכל סדר
const STRICT_DIRECTION = true;

// מילים רגילות שנראות כמו שם עיר או רחוב ויוצרות טעויות ("יום ראשון", "ים המלח"). אפשר להוסיף עוד
const IGNORE_WORDS = ["ראשון", "ים"];

// העיר שהבוט מניח אם כתבת רק "פנוי"
const DEFAULT_CITY = "בית שמש";
// ==============================

const PREFIX_LETTERS = new Set("בלמהוכש"); // אותיות שמצטרפות לתחילת מילה: בירושלים, לירושלים, מירושלים...
const KIND_RANK = { street: 1, neighborhood: 2, alias: 3 };

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")        // ניקוד
    .replace(/["'`´׳״“”‘’]/g, "")           // גרשיים: ב"ש -> בש
    .replace(/[^א-ת0-9\s]/g, " ")  // כל מה שאינו עברית, ספרה או רווח
    .replace(/\s+/g, " ")
    .trim();
}

export function createMatcher(citiesData, streetsData = {}) {
  const ignore = new Set(IGNORE_WORDS.map(normalizeText));
  const phrases = new Map(); // ביטוי -> Map(עיר -> סוג חזק ביותר)
  const abbreviations = new Set(); // ראשי תיבות כמו ב"ש, ת"א, י-ם: מותר לצרף להם ל/מ/ב ("לת"א")

  const add = (raw, city, kind) => {
    const norm = normalizeText(raw);
    const minLen = kind === "alias" ? 2 : kind === "neighborhood" ? 3 : 4;
    if (norm.length < minLen) return;
    if (ignore.has(norm)) return;
    if (kind === "alias" && /["'׳״\-.]/.test(String(raw))) abbreviations.add(norm);
    let byCity = phrases.get(norm);
    if (!byCity) phrases.set(norm, (byCity = new Map()));
    if ((KIND_RANK[byCity.get(city)] || 0) < KIND_RANK[kind]) byCity.set(city, kind);
  };

  for (const c of citiesData.cities) {
    add(c.name, c.name, "alias");
    (c.aliases || []).forEach((a) => add(a, c.name, "alias"));
    (c.neighborhoods || []).forEach((n) => add(n, c.name, "neighborhood"));
    (c.streets || []).forEach((s) => add(s, c.name, "street"));
  }
  for (const [city, list] of Object.entries(streetsData)) list.forEach((s) => add(s, city, "street"));

  // אינדקס לפי המילה הראשונה בביטוי, לחיפוש מהיר
  const byFirstToken = new Map();
  for (const [phrase, byCity] of phrases) {
    // הסוג החזק קובע (כינוי עיר > שכונה > רחוב). אם נשארו כמה ערים, הביטוי דו-משמעי (למשל "הרצל") ומדלגים עליו
    const best = Math.max(...[...byCity.values()].map((k) => KIND_RANK[k]));
    const winners = [...byCity].filter(([, k]) => KIND_RANK[k] === best);
    if (winners.length !== 1) continue;
    const [city, kind] = winners[0];
    const tokens = phrase.split(" ");
    const isAbbr = abbreviations.has(phrase);
    const entry = {
      phrase, tokens, city, kind,
      // מילה בודדת של 1-2 אותיות (כמו "בש") לא מקבלת תחילית, כי "לבש" ו"מפת" הן מילים אחרות. ראשי תיבות כן, אות אחת
      maxCut: tokens.length === 1 && tokens[0].length <= 2 && !isAbbr ? 0 : isAbbr ? 1 : 2,
    };
    if (!byFirstToken.has(tokens[0])) byFirstToken.set(tokens[0], []);
    byFirstToken.get(tokens[0]).push(entry);
  }

  // מוצא בטקסט את כל המקומות המוכרים, כמילים שלמות (עם אפשרות לתחילית ב/ל/מ/ה/ו/ש/כ)
  function findPlaces(text) {
    const tokens = normalizeText(text).split(" ").filter(Boolean);
    const hits = [];
    tokens.forEach((tok, i) => {
      for (let cut = 0; cut <= 2 && cut < tok.length; cut++) {
        const prefix = tok.slice(0, cut);
        if ([...prefix].some((ch) => !PREFIX_LETTERS.has(ch))) break;
        for (const e of byFirstToken.get(tok.slice(cut)) || []) {
          if (cut > e.maxCut) continue;
          if (e.tokens.every((t, k) => k === 0 || tokens[i + k] === t)) {
            hits.push({ ...e, start: i, end: i + e.tokens.length - 1, prefix });
          }
        }
      }
    });

    // כשכמה התאמות חופפות, הארוכה מנצחת ("רמת בית שמש א" גוברת על "בית שמש")
    hits.sort(
      (a, b) =>
        (b.end - b.start) - (a.end - a.start) ||
        b.phrase.length - a.phrase.length ||
        KIND_RANK[b.kind] - KIND_RANK[a.kind]
    );
    const used = new Set();
    const places = [];
    for (const h of hits) {
      let free = true;
      for (let k = h.start; k <= h.end; k++) if (used.has(k)) free = false;
      if (!free) continue;
      for (let k = h.start; k <= h.end; k++) used.add(k);
      places.push({
        city: h.city,
        kind: h.kind,
        phrase: h.phrase,
        start: h.start,
        role: h.prefix.includes("מ") ? "from" : h.prefix.includes("ל") ? "to" : null,
      });
    }
    return places.sort((a, b) => a.start - b.start);
  }

  // קובע איזו עיר היא המוצא ואיזו היעד: קודם לפי "מ..." ו"ל...", ואם אין אז לפי הסדר בהודעה
  function resolveRoles(places) {
    const seen = new Map();
    for (const p of places) {
      if (!seen.has(p.city)) seen.set(p.city, { city: p.city, role: p.role });
      else if (!seen.get(p.city).role && p.role) seen.get(p.city).role = p.role;
    }
    const cities = [...seen.values()];
    const asFrom = cities.find((c) => c.role === "from");
    const asTo = cities.find((c) => c.role === "to" && c !== asFrom);
    const from = asFrom || (asTo ? cities.find((c) => c !== asTo) : cities[0]);
    const to = asTo || cities.find((c) => c !== from);
    return { from: from?.city ?? null, to: to?.city ?? null, cities: cities.map((c) => c.city) };
  }

  // הופך את ההודעה שלך לבוט ("פנוי ...") להגדרת חיפוש
  function parseDriverCommand(text) {
    const norm = normalizeText(text);
    const { from, to } = resolveRoles(findPlaces(text));

    if (/(^| )(פנימי|פש|פ שמש)( |$)/.test(norm)) {
      const city = from || to || DEFAULT_CITY;
      return { mode: "internal", origin: city, destination: null, displayText: `${city} (פנימי)` };
    }
    const origin = from || DEFAULT_CITY;
    if (to && to !== origin) {
      return { mode: "route", origin, destination: to, displayText: `${origin} ⬅️ ${to}` };
    }
    return { mode: "from", origin, destination: null, displayText: origin };
  }

  // מחליט אם נסיעה מתאימה לחיפוש. מחזיר { ok, reason } והסיבה עוזרת לדבג
  function rideMatches(text, state) {
    const yes = (reason) => ({ ok: true, reason });
    const no = (reason) => ({ ok: false, reason });
    const places = findPlaces(text);
    const home = state.origin;

    if (state.mode === "internal") {
      const mine = places.filter((p) => p.city === home);
      const others = places.filter((p) => p.city !== home);

      const strongOther = others.find((p) => p.kind !== "street");
      if (strongOther) return no(`מופיעה עיר/שכונה אחרת: "${strongOther.phrase}" (${strongOther.city})`);

      if (!mine.length) {
        if (others.length) return no(`רחוב של ${others[0].city}: "${others[0].phrase}"`);
        const hasWord = /(^| )פנימי( |$)/.test(normalizeText(text));
        return hasWord ? yes('כתוב "פנימי" ואין סימן לעיר אחרת') : no("אין בהודעה שום סימן ל" + home);
      }
      const strongMine = mine.some((p) => p.kind !== "street");
      if (!strongMine && others.length >= mine.length) return no("רחובות לא חד-משמעיים, יותר של עיר אחרת");
      return yes(`זוהה: "${mine[0].phrase}"`);
    }

    const roles = resolveRoles(places);

    if (state.mode === "from") {
      if (!roles.cities.includes(home)) return no(`${home} לא מופיעה בהודעה`);
      if (roles.from !== home) return no(`${home} מופיעה כיעד ולא כמוצא`);
      return yes(`יוצאת מ${home}`);
    }

    if (state.mode === "route") {
      const dest = state.destination;
      if (!roles.cities.includes(home)) return no(`${home} לא מופיעה בהודעה`);
      if (!roles.cities.includes(dest)) return no(`${dest} לא מופיעה בהודעה`);
      if (STRICT_DIRECTION && !(roles.from === home && roles.to === dest)) {
        return no(`הכיוון הפוך (מוצא: ${roles.from}, יעד: ${roles.to})`);
      }
      return yes(`${home} ל${dest}`);
    }

    return no("מצב חיפוש לא מוכר");
  }

  return { findPlaces, resolveRoles, parseDriverCommand, rideMatches };
}

// ----- שימוש רגיל: טוען את הקבצים מהתיקייה של הפרויקט בפעם הראשונה שצריך -----
let instance = null;
function get() {
  if (!instance) {
    const load = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8"));
    instance = createMatcher(load("cities.json"), load("streets-full.json"));
  }
  return instance;
}
export const parseDriverCommand = (text) => get().parseDriverCommand(text);
export const rideMatches = (text, state) => get().rideMatches(text, state);
