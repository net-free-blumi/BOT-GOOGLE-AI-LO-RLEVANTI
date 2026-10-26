// matcher.js - מנוע זיהוי מקומות, פענוח פקודות וסינון נסיעות מתקדם
// תומך בבדיקה מחמירה של פנימי מול חיצוני, זיהוי שכונות ומושבים, ופענוח קיצורי דרייבר

import { readFileSync } from "node:fs";

const STRICT_DIRECTION = true;
const DEFAULT_CITY = "בית שמש";
const PREFIX_LETTERS = new Set("בלמהוכש");

// דירוג עוצמת התאמה: כינוי עיר חזק משכונה, ושכונה חזקה מרחוב
const KIND_RANK = { street: 1, village: 2, neighborhood: 3, alias: 4 };

// מילים נפוצות בהודעות נסיעה שאסור לזהות בטעות כרחובות/מקומות
const GENERIC_EXCLUDE_WORDS = new Set([
  "זמן", "זמנים", "מידי", "מיידי", "בחוץ", "ביט", "העברה", "מזומן", "דקות", "דק", "שעות",
  "שעה", "שקית", "משלוח", "נהג", "נהגת", "ספיישל", "סיינה", "מיניק", "טנדר", "מקומות",
  "נחת", "קצר", "פתיחה", "באישי", "לקוח", "לקוחה", "לבקש", "במספר", "טלפון", "הפצה",
  "צמצם", "צמצום", "פנימי", "פ", "קבוצה", "מרכזי", "הודעה", "בדיקה", "שלום", "היום", "מחר"
]);

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/["'`´׳״“”‘’]/g, "")
    .replace(/[^א-ת0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// חילוץ מחיר נסיעה לצורך סינון מחירים חריגים
export function extractPrice(text) {
  const cleaned = String(text || "")
    .replace(/(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|waze\.com\/|maps\.app\.goo\.gl\/|goo\.gl\/)[^\s]+/gi, " ")
    .replace(/(?:\+?972|0)[-\s]?5\d[-\s]?\d{3}[-\s]?\d{4}/g, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, " ")
    .replace(/\d{6,}/g, " ");

  const withCurrency = cleaned.match(/(?<!\d)(\d{2,3})(?!\d)\s*(?:₪|שח|ש"ח|שקל|ש(?!\w))/);
  if (withCurrency && +withCurrency[1] >= 20) return +withCurrency[1];

  const re = /(?<!\d)(\d{2,3})(?!\d)(\s*(?:דק|דקות|דקה|שעות|שעה|קמ|ק"מ|km))?/gi;
  let m;
  while ((m = re.exec(cleaned))) {
    if (m[2]) continue;
    if (/שעה\s*$/.test(cleaned.slice(Math.max(0, m.index - 6), m.index))) continue;
    if (+m[1] >= 20) return +m[1];
  }
  return null;
}

export function createMatcher(citiesData, streetsData = {}) {
  const phrases = new Map();
  const abbreviations = new Set();

  const add = (raw, city, kind) => {
    const norm = normalizeText(raw);
    const minLen = kind === "alias" ? 2 : kind === "neighborhood" || kind === "village" ? 3 : 4;
    if (norm.length < minLen) return;
    if (GENERIC_EXCLUDE_WORDS.has(norm)) return;
    if (kind === "alias" && /["'׳״\-.]/.test(String(raw))) abbreviations.add(norm);

    let byCity = phrases.get(norm);
    if (!byCity) phrases.set(norm, (byCity = new Map()));
    if ((KIND_RANK[byCity.get(city)] || 0) < KIND_RANK[kind]) {
      byCity.set(city, kind);
    }
  };

  for (const c of citiesData.cities) {
    add(c.name, c.name, "alias");
    (c.aliases || []).forEach((a) => add(a, c.name, "alias"));
    (c.neighborhoods || []).forEach((n) => add(n, c.name, "neighborhood"));
    (c.surroundingVillages || []).forEach((v) => add(v, c.name, "village"));
    (c.streets || []).forEach((s) => add(s, c.name, "street"));
  }

  for (const [city, list] of Object.entries(streetsData)) {
    list.forEach((s) => add(s, city, "street"));
  }

  const byFirstToken = new Map();
  for (const [phrase, byCity] of phrases) {
    const best = Math.max(...[...byCity.values()].map((k) => KIND_RANK[k]));
    const winners = [...byCity].filter(([, k]) => KIND_RANK[k] === best);
    if (winners.length !== 1) continue;
    const [city, kind] = winners[0];
    const tokens = phrase.split(" ");
    const isAbbr = abbreviations.has(phrase);
    const entry = {
      phrase,
      tokens,
      city,
      kind,
      maxCut: tokens.length === 1 && tokens[0].length <= 2 && !isAbbr ? 0 : isAbbr ? 1 : 2,
    };
    if (!byFirstToken.has(tokens[0])) byFirstToken.set(tokens[0], []);
    byFirstToken.get(tokens[0]).push(entry);
  }

  function findPlaces(text) {
    const tokens = normalizeText(text).split(" ").filter(Boolean);
    const hits = [];

    tokens.forEach((tok, i) => {
      for (let cut = 0; cut <= 2 && cut < tok.length; cut++) {
        const prefix = tok.slice(0, cut);
        if ([...prefix].some((ch) => !PREFIX_LETTERS.has(ch))) break;

        const subWord = tok.slice(cut);
        for (const e of byFirstToken.get(subWord) || []) {
          if (cut > e.maxCut) continue;
          if (e.tokens.every((t, k) => k === 0 || tokens[i + k] === t)) {
            hits.push({ ...e, start: i, end: i + e.tokens.length - 1, prefix });
          }
        }
      }
    });

    hits.sort(
      (a, b) =>
        b.end - b.start - (a.end - a.start) ||
        b.phrase.length - a.phrase.length ||
        KIND_RANK[b.kind] - KIND_RANK[a.kind]
    );

    const used = new Set();
    const places = [];
    for (const h of hits) {
      let free = true;
      for (let k = h.start; k <= h.end; k++) {
        if (used.has(k)) free = false;
      }
      if (!free) continue;
      for (let k = h.start; k <= h.end; k++) used.add(k);

      places.push({
        city: h.city,
        kind: h.kind,
        phrase: h.phrase,
        start: h.start,
        end: h.end,
        role: h.prefix.includes("מ") ? "from" : h.prefix.includes("ל") ? "to" : null,
      });
    }

    return places.sort((a, b) => a.start - b.start);
  }

  function resolveRoles(places) {
    const seen = new Map();
    for (const p of places) {
      if (!seen.has(p.city)) {
        seen.set(p.city, { city: p.city, role: p.role });
      } else if (!seen.get(p.city).role && p.role) {
        seen.get(p.city).role = p.role;
      }
    }
    const cities = [...seen.values()];
    const asFrom = cities.find((c) => c.role === "from");
    const asTo = cities.find((c) => c.role === "to" && c !== asFrom);
    const from = asFrom || (asTo ? cities.find((c) => c !== asTo) : cities[0]);
    const to = asTo || cities.find((c) => c !== from);
    return {
      from: from?.city ?? null,
      to: to?.city ?? null,
      cities: cities.map((c) => c.city),
    };
  }

  // בדיקת מעברים פנימיים מובהקים בבית שמש (כמו "רמה ד לב", "רמה ד> ה", "רמה ד & נעימי", "חפציבה לקריה")
  // מגן בצורה הרמטית מפני מילים עבריות תמימות (כמו "בלבד", "בדודיקה", "למאזדה", "מניות")
  function detectInternalTransitionBeitShemesh(text) {
    const raw = String(text || "");
    const norm = normalizeText(raw);

    // 1. כינויים מפורשים של פנימי בית שמש
    if (/(^|\s)(פנימי\s+שמש|שמש\s+פנימי|פ\s+שמש|שמש\s+פ|פנימי\s+בש|בש\s+פנימי|פ\s+בש|בש\s+פ)(\s|$)/i.test(norm)) {
      return true;
    }

    // 2. מעבר בין שני מוקדים בבית שמש עם גבולות מילה מחמירים
    const NAMED = "רמת\\s*בית\\s*שמש\\s*[א-ה]|רמה\\s*[א-ה]|לב\\s*הרמה|חפציבה|קריה|הקריה|ביג|הביג|נעימי|הנעימי|סאן\\s*מול|שיינפלד|יפה\\s*נוף|נווה\\s*שמיר|משקפיים|רמת\\s*אברהם|הישנה|בית\\s*שמש\\s*הישנה|העיר\\s*הוותיקה|סמטת\\s*הגפן|מחסיה|אדרת|צרעה|הרטוב|ישעי|זכריה";
    const spotRe = (inner) => `(?<![א-ת])[הבלמהוכש]?(?:${inner})(?![א-ת])`;
    const sep = "\\s*(?:>|->|&|-|–|/|ל|אל|ו)?\\s*";
    const transitionRe = new RegExp(`${spotRe(NAMED)}${sep}${spotRe(`${NAMED}|[א-ה]`)}`, "i");
    if (transitionRe.test(raw) || transitionRe.test(norm)) {
      return true;
    }

    // מעבר קצר בין אותיות רמה בלבד כמילים שלמות מבודדות: "ד>ה", "ד -> ה", "ד לה", "ד > ב"
    if (/(^|\s)[א-ה]\s*(?:>|->|&|-|ל|אל)\s*[א-ה](\s|$)/i.test(raw)) {
      return true;
    }

    // "בתוך רמה ד", "בתוך שמש", "בתוך בית שמש"
    if (/(^|\s)בתוך\s+(רמה\s+[א-ה]|[א-ה]|שמש|בית שמש)(\s|$)/i.test(norm)) {
      return true;
    }

    return false;
  }

  // בדיקת מעבר פנימי מובהק בירושלים
  function detectInternalTransitionJerusalem(text) {
    const raw = String(text || "");
    const norm = normalizeText(raw);
    const patterns = [
      /(^|\s)(פנימי\s+ים|ים\s+פנימי|פ\s+ים|ים\s+פ)(\s|$)/i,
      /(^|\s)(הר נוף|גבעש|גבעת שאול|רמות|בית וגן|גילה|גאולה|מאה שערים|סנהדריה|בר אילן|טדי|קבר רחל|רוממה)\s*(?:ל|>|->|&|-|אל)\s*(הר נוף|גבעש|גבעת שאול|רמות|בית וגן|גילה|גאולה|מאה שערים|סנהדריה|בר אילן|טדי|קבר רחל|רוממה)/i
    ];
    return patterns.some((p) => p.test(raw) || p.test(norm));
  }

  function parseDriverCommand(text) {
    let clean = String(text || "").trim();
    const norm = normalizeText(clean);

    // 1. מצב צמצום (פנימי ויוצא יחד): "שמש צמצם", "ים צמצם", "צמצם שמש"
    if (/(^|\s)(צמצם|צמצום)(\s|$)/.test(norm)) {
      const places = findPlaces(clean);
      const city = places[0]?.city || DEFAULT_CITY;
      return { mode: "reduce", origin: city, destination: null, displayText: `${city} (צמצום: פנימי ויוצא)` };
    }

    // 2. פקודת פנימי: "פנוי שמש פנימי", "פנימי שמש", "פ שמש פ", "פ שמש", "שמש פ", "שמש פנימי", "פנוי שמש"
    if (
      /^(?:פנוי\s+)?(?:פנימי\s+)?(?:בית\s+)?שמש(?:\s+פנימי|\s+פ)?$/.test(norm) ||
      /^(?:פ|פנוי)\s+(?:בית\s+)?שמש(?:\s+פנימי|\s+פ)?$/.test(norm) ||
      /(^|\s)(פנימי|פש|פ שמש|פ ים|שמש פ|ים פ|פ בש|בש פ)(\s|$)/.test(norm) ||
      norm.includes("פנימי")
    ) {
      const places = findPlaces(clean);
      const city = places[0]?.city || DEFAULT_CITY;
      return { mode: "internal", origin: city, destination: null, displayText: `${city} (פנימי)` };
    }

    // 3. פקודת מסלול מקוצרת
    const routeShorthand = norm.match(/^(?:פ|פנוי)\s+([א-ת]+)\s+([א-ת]+)$/);
    if (routeShorthand) {
      const p1 = findPlaces(routeShorthand[1])[0]?.city;
      const p2 = findPlaces(routeShorthand[2])[0]?.city;
      if (p1 && p2 && p1 !== p2) {
        return { mode: "route", origin: p1, destination: p2, displayText: `${p1} ⬅️ ${p2}` };
      }
    }

    // 4. פקודת מסלול רגילה: "פנוי בית שמש לירושלים"
    const { from, to } = resolveRoles(findPlaces(clean));
    const origin = from || DEFAULT_CITY;
    if (to && to !== origin) {
      return { mode: "route", origin, destination: to, displayText: `${origin} ⬅️ ${to}` };
    }

    // 5. פקודת יציאה כללית: "פנוי בית שמש יוצא"
    return { mode: "from", origin, destination: null, displayText: origin };
  }

  function rideMatches(text, state, groupName = "") {
    const yes = (reason) => ({ ok: true, reason });
    const no = (reason) => ({ ok: false, reason });
    const places = findPlaces(text);
    const home = state.origin;

    // רשימת כל הערים שזוהו בהודעה
    const detectedCities = [...new Set(places.map((p) => p.city))];
    const externalCities = detectedCities.filter((c) => c !== home);

    // ==========================================
    // מצב 1: פנימי בלבד (internal)
    // ==========================================
    if (state.mode === "internal") {
      const norm = normalizeText(text);

      // חוק ברזל 1: אם מופיעה עיר חיצונית כלשהי (למשל ביתר, בני ברק, ירושלים, כפר חב"ד, סביון, שוהם) - פוסלים מיד!
      if (externalCities.length > 0) {
        return no(`נפסל מפנימי: מופיעה עיר חיצונית (${externalCities.join(", ")})`);
      }

      // חוק ברזל 2: הגנת מחיר פנימי: נסיעה במחיר 130 ש"ח ומעלה אינה פנימית אלא בין-עירונית
      const price = extractPrice(text);
      if (price && price >= 130 && !norm.includes("פנימי")) {
        return no(`נפסל מפנימי: מחיר גבוה לנסיעה פנימית (${price} ש"ח)`);
      }

      // בדיקת מעברים פנימיים ספציפיים לפי עיר
      if (home === "בית שמש" && detectInternalTransitionBeitShemesh(text)) {
        return yes(`פנימי בית שמש: זוהה מעבר בין שכונות/רחובות בעיר`);
      }
      if (home === "ירושלים" && detectInternalTransitionJerusalem(text)) {
        return yes(`פנימי ירושלים: זוהה מעבר פנימי בתוך ירושלים`);
      }

      // אם זוהה המקום של עיר הבית
      const mine = places.filter((p) => p.city === home);
      if (mine.length > 0) {
        return yes(`פנימי ${home}: זוהה "${mine[0].phrase}"`);
      }

      // בדיקה לפי שם הקבוצה (אם הקבוצה ייעודית לפנימי שמש)
      const groupNorm = normalizeText(groupName);
      if (groupNorm.includes("פנימי שמש") || groupNorm.includes("בית שמש בלבד")) {
        const hasPrice = /\b\d{2,3}\b/.test(text);
        if (hasPrice) {
          return yes(`פנימי ${home} (מתוך קבוצה ייעודית)`);
        }
      }

      return no(`אין בהודעה סימן לנסיעה פנימית בתוך ${home}`);
    }

    // ==========================================
    // מצב 2: מצב צמצום (reduce: פנימי ויוצא יחד)
    // ==========================================
    if (state.mode === "reduce") {
      // 1. האם זו נסיעה פנימית נקייה?
      if (externalCities.length === 0) {
        const mine = places.filter((p) => p.city === home);
        if (mine.length > 0 || (home === "בית שמש" && detectInternalTransitionBeitShemesh(text))) {
          return yes(`צמצום (${home}): נסיעה פנימית`);
        }
      }

      // 2. האם זו נסיעה שיוצאת מעיר הבית?
      const roles = resolveRoles(places);
      if (roles.cities.includes(home) && roles.from === home) {
        return yes(`צמצום (${home}): יוצאת ל${roles.to || "יעד חיצוני"}`);
      }

      return no(`צמצום: לא זוהתה יציאה או פנימי מ${home}`);
    }

    // ==========================================
    // מצב 3: יוצא מעיר לכל יעד (from)
    // ==========================================
    if (state.mode === "from") {
      const roles = resolveRoles(places);
      if (!roles.cities.includes(home)) return no(`${home} לא מופיעה בהודעה`);
      if (roles.from !== home) return no(`${home} מופיעה כיעד ולא כמוצא (נסיעה נכנסת)`);
      return yes(`יוצאת מ${home}`);
    }

    // ==========================================
    // מצב 4: מסלול ישיר (route: למשל בית שמש לירושלים)
    // ==========================================
    if (state.mode === "route") {
      const dest = state.destination;
      const roles = resolveRoles(places);

      if (!roles.cities.includes(home)) return no(`עיר מוצא (${home}) לא מופיעה בהודעה`);
      if (!roles.cities.includes(dest)) return no(`עיר יעד (${dest}) לא מופיעה בהודעה`);

      // נסיעה פנימית נפסלת במסלול בין-עירוני
      if (externalCities.length === 0) {
        return no(`נפסל ממסלול: זוהתה נסיעה פנימית`);
      }

      // בדיקת כיוון מחמירה
      if (STRICT_DIRECTION && !(roles.from === home && roles.to === dest)) {
        return no(`הכיוון הפוך: מוצא ${roles.from || "לא זוהה"}, יעד ${roles.to || "לא זוהה"}`);
      }

      return yes(`מסלול מ${home} ל${dest}`);
    }

    return no("מצב חיפוש לא מוכר");
  }

  return {
    findPlaces,
    resolveRoles,
    parseDriverCommand,
    rideMatches,
    detectInternalTransitionBeitShemesh,
    detectInternalTransitionJerusalem,
  };
}

let instance = null;
function get() {
  if (!instance) {
    const load = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8"));
    instance = createMatcher(load("cities.json"), load("streets-full.json"));
  }
  return instance;
}

export const parseDriverCommand = (text) => get().parseDriverCommand(text);
export const rideMatches = (text, state, groupName = "") => get().rideMatches(text, state, groupName);
export const findPlaces = (text) => get().findPlaces(text);
export const detectInternalTransitionBeitShemesh = (text) => get().detectInternalTransitionBeitShemesh(text);
export const detectInternalTransitionJerusalem = (text) => get().detectInternalTransitionJerusalem(text);

export function processDriverCommand(rawText) {
  const raw = String(rawText || "").trim();
  const norm = normalizeText(raw);

  // 1. פקודות פנימי ישירות:
  // "פנוי שמש", "פנוי שמש פנימי", "פנימי שמש", "שמש פנימי", "פ שמש", "שמש פ"
  if (
    /^(?:פנוי\s+)?(?:פנימי\s+)?(?:בית\s+)?שמש(?:\s+פנימי|\s+פ)?$/.test(norm) ||
    /^(?:פ|פנוי)\s+(?:בית\s+)?שמש(?:\s+פנימי|\s+פ)?$/.test(norm) ||
    /^(?:פנימי\s+)?(?:בית\s+)?שמש$/.test(norm) ||
    norm === "שמש"
  ) {
    return { mode: "internal", origin: "בית שמש", destination: null, displayText: "בית שמש (פנימי)" };
  }

  // פנימי ירושלים: "פנוי ים פנימי", "פנימי ים", "ים פנימי", "פ ים", "ים פ"
  if (
    /^(?:פנוי\s+)?(?:פנימי\s+)?(?:ירושלים|ים)(?:\s+פנימי|\s+פ)?$/.test(norm) ||
    /^(?:פ|פנוי)\s+(?:ירושלים|ים)(?:\s+פנימי|\s+פ)?$/.test(norm) ||
    norm === "ים"
  ) {
    return { mode: "internal", origin: "ירושלים", destination: null, displayText: "ירושלים (פנימי)" };
  }

  // פנימי בני ברק
  if (/^(?:פנוי\s+)?(?:פנימי\s+)?(?:בני\s+ברק|בב)(?:\s+פנימי|\s+פ)?$/.test(norm)) {
    return { mode: "internal", origin: "בני ברק", destination: null, displayText: "בני ברק (פנימי)" };
  }

  // פנימי מודיעין עילית
  if (/^(?:פנוי\s+)?(?:פנימי\s+)?(?:מודיעין\s+עילית|קרית\s+ספר|מוע)(?:\s+פנימי|\s+פ)?$/.test(norm)) {
    return { mode: "internal", origin: "מודיעין עילית", destination: null, displayText: "מודיעין עילית (פנימי)" };
  }

  // 2. מצב צמצום (פנימי + יוצא): "שמש צמצם", "צמצם שמש", "צמצום שמש", "ים צמצם"
  if (/(^|\s)(צמצם|צמצום)(\s|$)/.test(norm)) {
    let city = "בית שמש";
    if (norm.includes("ים") || norm.includes("ירושלים")) city = "ירושלים";
    else if (norm.includes("בב") || norm.includes("בני ברק")) city = "בני ברק";
    else if (norm.includes("מוע") || norm.includes("ספר")) city = "מודיעין עילית";
    return { mode: "reduce", origin: city, destination: null, displayText: `${city} (צמצום: פנימי ויוצא)` };
  }

  // 3. מסלול מקוצר עם כינויי ערים:
  const cityAliasMap = {
    "שמש": "בית שמש",
    "בש": "בית שמש",
    "בית שמש": "בית שמש",
    "ים": "ירושלים",
    "ירו": "ירושלים",
    "ירושלים": "ירושלים",
    "בב": "בני ברק",
    "בני ברק": "בני ברק",
    "מוע": "מודיעין עילית",
    "ספר": "מודיעין עילית",
    "קרית ספר": "מודיעין עילית",
    "מודיעין עילית": "מודיעין עילית",
    "תא": "תל אביב",
    "תל אביב": "תל אביב",
    "נתבג": "נתב\"ג",
    "שדה": "נתב\"ג",
    "ביתר": "ביתר עילית",
    "אלעד": "אלעד",
    "אשדוד": "אשדוד",
    "חיפה": "חיפה",
    "טבריה": "טבריה",
    "צפת": "צפת",
  };

  const cleanCmd = norm.replace(/^(?:פ|פנוי)\s+/, "");
  for (const [a1, c1] of Object.entries(cityAliasMap)) {
    for (const [a2, c2] of Object.entries(cityAliasMap)) {
      if (c1 === c2) continue;
      const routeRe = new RegExp(`^${a1}\\s+(?:ל|אל|\\-|>|)?${a2}$`);
      if (routeRe.test(cleanCmd)) {
        return { mode: "route", origin: c1, destination: c2, displayText: `${c1} ⬅️ ${c2}` };
      }
    }
  }

  // 4. שימוש במפענח הכללי
  return get().parseDriverCommand(raw);
}

