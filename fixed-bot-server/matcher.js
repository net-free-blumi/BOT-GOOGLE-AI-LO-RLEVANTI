// matcher.js - מנוע זיהוי מקומות, פענוח פקודות וסינון נסיעות מתקדם
// תומך בבדיקה מחמירה של פנימי מול חיצוני, זיהוי שכונות ומושבים, ופענוח קיצורי דרייבר

import { readFileSync } from "node:fs";
import { cleanPhone, isLid } from "./users-manager.js";

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

// זיהוי מסלול בינעירוני מרוחק (למשל ירושלים-גוש דן או חיפה-מרכז) למניעת זיהוי שגוי של נסיעות מקומיות זולות
export function isDistantRoute(from, to) {
  if (!from || !to || from === to) return false;
  const majorCities = new Set(["ירושלים", "בני ברק", "תל אביב", "חיפה", "טבריה", "צפת", "אשדוד", "באר שבע", "נתניה"]);
  if (majorCities.has(from) && majorCities.has(to)) {
    if ((from === "בני ברק" && to === "תל אביב") || (from === "תל אביב" && to === "בני ברק")) return false;
    if ((from === "צפת" && to === "מירון") || (from === "מירון" && to === "צפת")) return false;
    return true;
  }
  return false;
}

// בדיקה האם יש הצהרת פנימי מפורשת ספציפית לעיר הבית (מונע הרמטית ערבוב בין ערים!)
export function isExplicitInternal(text, home = "בית שמש") {
  const norm = normalizeText(text);

  // זיהוי הצהרות פנימי מפורשות של ערים מרכזיות
  const hasShemeshInternal =
    /(^|\s)(?:פנימי\s+שמש|שמש\s+פנימי|פ\s+שמש|שמש\s+פ|פנימי\s+בש|בש\s+פנימי|פ\s+בש|בש\s+פ|פנימי\s+בית\s+שמש|בית\s+שמש\s+פנימי)(\s|$)/i.test(norm) ||
    /^(?:פ|פנימי)\s+(?:בית\s+)?שמש(?:\s|$)/i.test(norm);

  const hasJerusalemInternal =
    /(^|\s)(?:פנימי\s+ים|ים\s+פנימי|פ\s+ים|ים\s+פ|פנימי\s+ירושלים|ירושלים\s+פנימי)(\s|$)/i.test(norm) ||
    /^(?:פ|פנימי)\s+(?:ירושלים|ים)(?:\s|$)/i.test(norm);

  const hasBneiBrakInternal =
    /(^|\s)(?:פנימי\s+בב|בב\s+פנימי|פ\s+בב|בב\s+פ|פנימי\s+בני\s+ברק|בני\s+ברק\s+פנימי)(\s|$)/i.test(norm) ||
    /^(?:פ|פנימי)\s+(?:בני\s+ברק|בב)(?:\s|$)/i.test(norm);

  const hasModiinInternal =
    /(^|\s)(?:פנימי\s+ספר|ספר\s+פנימי|פ\s+ספר|ספר\s+פ|פנימי\s+מודיעין\s+עילית)(\s|$)/i.test(norm) ||
    /^(?:פ|פנימי)\s+(?:ספר|קרית\s+ספר|מודיעין\s+עילית)(?:\s|$)/i.test(norm);

  const hasBeitarInternal =
    /(^|\s)(?:פנימי\s+ביתר|ביתר\s+פנימי|פ\s+ביתר|ביתר\s+פ)(\s|$)/i.test(norm) ||
    /^(?:פ|פנימי)\s+ביתר(?:\s|$)/i.test(norm);

  if (home === "בית שמש") return hasShemeshInternal;
  if (home === "ירושלים") return hasJerusalemInternal;
  if (home === "בני ברק") return hasBneiBrakInternal;
  if (home === "מודיעין עילית") return hasModiinInternal;
  if (home === "ביתר עילית") return hasBeitarInternal;

  // אם זו עיר אחרת (כגון צפת, מירון, טבריה וכו') ובהודעה יש פנימי מפורש של עיר אחרת – זה נפסל מיידית!
  if (hasShemeshInternal || hasJerusalemInternal || hasBneiBrakInternal || hasModiinInternal || hasBeitarInternal) {
    return false;
  }

  if (home === "מירון") {
    return (
      /(^|\s)(?:פנימי\s+מירון|מירון\s+פנימי|פ\s+מירון|מירון\s+פ)(\s|$)/i.test(norm) ||
      /^(?:פ|פנימי)\s+מירון(?:\s|$)/i.test(norm)
    );
  }

  if (home === "צפת") {
    return (
      /(^|\s)(?:פנימי\s+צפת|צפת\s+פנימי|פ\s+צפת|צפת\s+פ)(\s|$)/i.test(norm) ||
      /^(?:פ|פנימי)\s+צפת(?:\s|$)/i.test(norm)
    );
  }

  // בדיקה גנרית לכל עיר אחרת: דורש ששם העיר עצמה יופיע יחד עם המילה פנימי
  const homeNorm = normalizeText(home);
  const re = new RegExp(`(^|\\s)(?:פנימי\\s+${homeNorm}|${homeNorm}\\s+פנימי|פ\\s+${homeNorm}|${homeNorm}\\s+פ)(\\s|$)`, "i");
  return re.test(norm);
}

// סינון שורות חתימת תחנה וקישורים (למשל "⛔אור החיים🏅⛔ללא פון🏅" או "🎩8080*🎩")
// כדי ששם תחנת המוניות לא יזוהה בטעות כעיר או רחוב של הנסיעה
export function stripStationAndLinks(text) {
  return String(text || "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^(?:⛔|🎩|🏆|🎖️|🏅|👑|⭐️|🌟).*?(?:⛔|🎩|🏆|🎖️|🏅|👑|⭐️|🌟|פון)/.test(trimmed)) return false;
      if (/ללא\s+פון|לתחנת\s+|כוכבית\s+שמונת|8080\*/.test(trimmed)) return false;
      if (/^(?:ווצאפ|טלגרם|וואטסאפ|לינק|קישור)\s*☚/i.test(trimmed)) return false;
      if (/(?:wa\.me|t\.me|chat\.whatsapp\.com)/i.test(trimmed)) return false;
      return true;
    })
    .join("\n");
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
      // אם המילה השלמה היא "מנחם", אסור לחתוך "מ" כדי להתאים למושב "נחם"
      const isMenachemName = tok === "מנחם";

      for (let cut = 0; cut <= 2 && cut < tok.length; cut++) {
        if (cut > 0 && isMenachemName) continue;

        const prefix = tok.slice(0, cut);
        if ([...prefix].some((ch) => !PREFIX_LETTERS.has(ch))) break;

        const subWord = tok.slice(cut);
        for (const e of byFirstToken.get(subWord) || []) {
          if (cut > e.maxCut) continue;

          // אם המילה היא "מלאכי" ואחריה "הנביא" - זה רחוב מלאכי הנביא בבית שמש, לא קריית מלאכי!
          if (e.phrase === "מלאכי" && tokens[i + 1] === "הנביא") continue;

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

  // מילים מקובלות שיכולות להקדים עיר מוצא מבלי להפוך אותה ליעד
  const ROUTE_PREFIX_MODIFIERS = new Set([
    "דחוף", "מיידי", "מידי", "זמן", "זמנים", "הלוך", "הוש", "הלוש", "הלוך ושוב",
    "ספיישל", "טנדר", "מיניק", "וואן", "משלוח", "שקית", "חבילה", "הפצה",
    "נסיעה", "מ", "יוצא", "יציאה", "פ", "פנימי", "קבוצה", "סדרן", "נהג",
    "שמ", "בוט", "דרייבוט", "אובר", "רעדליך", "חסדיש", "חסידיש", "הקפצה", "מינק", "גגון"
  ]);

  function resolveRoles(places, text = "") {
    const seen = new Map();
    for (const p of places) {
      if (!seen.has(p.city)) {
        seen.set(p.city, {
          city: p.city,
          role: p.role,
          start: p.start,
          end: p.end,
          phrase: p.phrase,
          kind: p.kind
        });
      } else if (!seen.get(p.city).role && p.role) {
        seen.get(p.city).role = p.role;
      }
    }
    const cities = [...seen.values()];
    if (cities.length === 0) {
      return { from: null, to: null, cities: [] };
    }

    if (cities.length === 1) {
      const single = cities[0];

      // אם העיר קיבלה תפקיד 'to' מפורש (כגון "לשמש", "לבית שמש", "ל-ים", "אל שמש")
      if (single.role === "to") {
        return {
          from: null,
          to: single.city,
          cities: [single.city],
        };
      }

      // בדיקת הטוקנים המקדימים שמופיעים לפני העיר
      const normTokens = normalizeText(text).split(" ").filter(Boolean);
      const tokensBefore = normTokens.slice(0, single.start);

      // בדיקה האם בטקסט לפני הביטוי יש סימן מחבר ברור (למשל: "נווה דניאל & שמש", "צור הדסה - שמש")
      const rawStr = String(text || "");
      const phraseIdx = rawStr.indexOf(single.phrase);
      const textBefore = phraseIdx > 0 ? rawStr.slice(0, phraseIdx) : "";
      const hasConnectorBefore = /(?:&|\-|–|->|>|⬅️|➡️|ל|אל|עד)\s*$/.test(textBefore.trim());

      // האם קיימים טוקנים לפני העיר שאינם מילות סטטוס מותרות?
      const nonStatusTokens = tokensBefore.filter((t) => !ROUTE_PREFIX_MODIFIERS.has(t));

      if (hasConnectorBefore || nonStatusTokens.length > 0) {
        // העיר מופיעה במיקום השני, וקודם לה מוקד/מילה שאינה סטטוס!
        // במבנה מוניות ישראלי קלאסי: [מוצא] [יעד] [מחיר] -> העיר היא היעד ולא המוצא!
        return {
          from: null,
          to: single.city,
          cities: [single.city],
        };
      }

      return {
        from: single.city,
        to: null,
        cities: [single.city],
      };
    }

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

    // 2. מעבר בין שני מוקדים בבית שמש עם גבולות מילה מחמירים ומחבר מפורש חובה
    const NAMED = "רמת\\s*בית\\s*שמש\\s*[א-ה]|רמה\\s*[א-ה]|רמ[א-ה]|לב\\s*הרמה|חפציבה|ה?קרייה|ה?קריה|מרכז\\s*ביג|אזור\\s*התעשייה\\s*ביג|אזה\"ת\\s*ביג|ה?ביג|ה?נעימי|סאן\\s*מול|שיינפלד|יפה\\s*נוף|נווה\\s*שמיר|משקפיים|רמת\\s*אברהם|בית\\s*שמש\\s*הישנה|העיר\\s*הוותיקה|ה?וותיקה|הישנה|סמטת\\s*הגפן|(?:סמטת\\s*)?ה?גפן|כינור\\s*דוד|הר\\s*מירון|מלאכי\\s*הנביא|זכריה\\s*הנביא|חגי\\s*הנביא|צפניה\\s*הנביא|חבקוק\\s*הנביא|עמוס\\s*הנביא|מיכה\\s*הנביא|יונה\\s*הנביא|הושע\\s*הנביא|נחום\\s*הנביא|יואל\\s*הנביא|אלישע\\s*הנביא|אליהו\\s*הנביא|שמואל\\s*הנביא|ישעיהו\\s*הנביא|ירמיהו\\s*הנביא|יחזקאל\\s*הנביא|עליית\\s*הנוער|עלית\\s*הנוער|שדרות\\s*האמוראים|שד'?\\s*האמוראים|קדושת\\s*אהרן|קדושת\\s*אהרון|הרב\\s*הרצוג|הרצוג|נהרדעא?|המכללה\\s*לשוטרים|מכללת\\s*השוטרים|מכללה\\s*לשוטרים|ריבל|תלמוד\\s*בבלי|אור\\s*שמח|נהר\\s*הירדן|הירדן|נחל\\s*[א-ת]+|משמר|ברכיהו?|ה?ברוש|מחסיה|אדרת|צרעה|הרטוב|הר\\s*טוב|אזה\"ת\\s*הרטוב|ישעי|זכריה";

    const SYMBOL_CONN = "(?:=>|->>|-->|->|>|⬅️|➡️|👈|👉|—|-|–|&|\\+|\\/|\\\\)";

    // א. מוקד נקוב או אות רמה עם סימן מפריד ("ברוש - לד", "נחל משמר & ד")
    const symRe1 = new RegExp(`(?<![א-ת])(?:${NAMED})\\s*${SYMBOL_CONN}\\s*(?:${NAMED}|ל?[א-ה])(?![א-ת])`, "i");
    const symRe2 = new RegExp(`(?<![א-ת])[א-ה]\\s*${SYMBOL_CONN}\\s*(?:${NAMED})(?![א-ת])`, "i");

    // ב. מחבר מילולי ("נחל משמר לברכיה", "רמה ד לביג", "רמה ב לד", "ד להישנה")
    const toNamedRe1 = new RegExp(`(?<![א-ת])(?:${NAMED})\\s+(?:ל|אל|עד)\\s*(?:${NAMED})(?![א-ת])`, "i");
    const toLetterRe1 = new RegExp(`(?<![א-ת])(?:${NAMED})\\s+(?:ל|אל|עד|לרמה|אל\\s+רמה)\\s*[א-ה](?![א-ת])`, "i");
    const toNamedRe2 = new RegExp(`(?<![א-ת])[א-ה]\\s+(?:ל|אל|עד)\\s*(?:${NAMED})(?![א-ת])`, "i");

    // ג. מעבר קצר בין אותיות רמה בלבד כמילים שלמות מבודדות: "ד>ה", "ד -> ה", "ד לה", "ד > ב"
    const toLetterRe2 = /(?<![א-ת])[א-ה](?:\s*(?:=>|->>|-->|->|>|⬅️|➡️|👈|👉|—|-|–|&|\+|\/|\\)\s*|\s+(?:ל|אל|עד|לרמה|אל\s+רמה)\s*)[א-ה](?![א-ת])/i;

    if (
      symRe1.test(raw) || symRe1.test(norm) ||
      symRe2.test(raw) || symRe2.test(norm) ||
      toNamedRe1.test(raw) || toNamedRe1.test(norm) ||
      toLetterRe1.test(raw) || toLetterRe1.test(norm) ||
      toNamedRe2.test(raw) || toNamedRe2.test(norm) ||
      toLetterRe2.test(raw)
    ) {
      return true;
    }

    // ד. שני מוקדים נקובים מובהקים בבית שמש על שורות נפרדות או מופרדים במחיר (למשל: "שמש הר טוב 70\nמלאכי הנביא זמן")
    const namedRe = new RegExp(`(?<![א-ת])(?:${NAMED})(?![א-ת])`, "gi");
    const allNamedMatches = [...norm.matchAll(namedRe)].map((m) => m[0].trim());
    const uniqueNamed = [...new Set(allNamedMatches)];
    if (uniqueNamed.length >= 2) {
      const price = extractPrice(raw);
      if (!price || price <= 110) {
        return true;
      }
    }

    // "בתוך רמה ד", "בתוך שמש", "בתוך בית שמש", "בתוך הרמה"
    if (/(^|\s)בתוך\s+(?:רמה\s+[א-ה]|[א-ה]|שמש|בית\s+שמש|הרמה)(\s|$)/i.test(norm)) {
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

  function checkInternalRide(text, home, places, externalCities, groupName) {
    const norm = normalizeText(text);
    const isExplicitHomeInternal = isExplicitInternal(text, home);
    const price = extractPrice(text);

    // הגנת מחיר פנימי: נסיעה במחיר 130 ש"ח ומעלה אינה פנימית רגילה
    const isMultiOrHourly = /(^|\s)(?:הוש|הלוש|הלוך\s+ושוב|מיניק|לפיש|לפי\s+שעה|לפי\s+שעות|נגרר)(\s|$)/i.test(text);
    const maxInternalPrice = isMultiOrHourly ? 230 : 125;
    if (price && price > maxInternalPrice && !norm.includes("פנימי")) {
      return { ok: false, reason: `נפסל מפנימי: מחיר גבוה לנסיעה פנימית (${price} ש"ח)` };
    }

    // בדיקת מסלול בינעירוני מובהק:
    const detectedCityAliases = places.filter((p) => p.kind === "alias").map((p) => p.city);
    const distinctCities = [...new Set(detectedCityAliases)];
    if (distinctCities.length >= 2) {
      return { ok: false, reason: `נפסל מפנימי: מזוהה מסלול בינעירוני בין ${distinctCities.join(" ל-")}` };
    }

    // טיפול בערים חיצוניות
    if (externalCities.length > 0) {
      if (isExplicitHomeInternal && (!price || price <= 110 || isMultiOrHourly)) {
        return { ok: true, reason: `פנימי ${home}: הוגדר מפורשות כפנימי (${price ? price + " ש\"ח" : "מחיר מקומי"})` };
      }
      return { ok: false, reason: `נפסל מפנימי: מופיעה עיר חיצונית (${externalCities.join(", ")})` };
    }

    // בדיקת מעברים פנימיים ספציפיים לפי עיר
    if (home === "בית שמש" && detectInternalTransitionBeitShemesh(text)) {
      return { ok: true, reason: `פנימי בית שמש: זוהה מעבר בין שכונות/רחובות בעיר` };
    }
    if (home === "ירושלים" && detectInternalTransitionJerusalem(text)) {
      return { ok: true, reason: `פנימי ירושלים: זוהה מעבר פנימי בתוך ירושלים` };
    }

    // אם זוהתה הצהרת פנימי מפורשת של עיר הבית
    if (isExplicitHomeInternal) {
      return { ok: true, reason: `פנימי ${home}: צוין מפורשות` };
    }

    // אם כל המוקדים שזוהו בהודעה שייכים אך ורק לעיר הבית ואין אף עיר חיצונית
    // (מושבים ואזורים כפריים כמו רוגלית או נס הרים אינם נחשבים נסיעה פנימית בעיר!)
    if (externalCities.length === 0) {
      const nonVillageSpots = places.filter((p) => p.city === home && p.kind !== "village");
      const homePhrases = [...new Set(nonVillageSpots.map((p) => p.phrase))];
      if (homePhrases.length >= 2 && (!price || price <= 110 || isMultiOrHourly)) {
        return { ok: true, reason: `פנימי ${home}: מעבר בין מוקדים בעיר (${homePhrases.join(" ⬅️ ")})` };
      }
    }

    // אם זוהתה שכונה או רחוב של עיר הבית
    const localSpots = places.filter((p) => p.city === home && (p.kind === "neighborhood" || p.kind === "street"));
    if (localSpots.length > 0) {
      if (price && (price <= 90 || isMultiOrHourly)) {
        return { ok: true, reason: `פנימי ${home}: זוהה מוקד מקומי "${localSpots[0].phrase}" עם מחיר (${price} ש"ח)` };
      }
      if (norm.includes("בתוך") || isExplicitHomeInternal) {
        return { ok: true, reason: `פנימי ${home}: זוהה מוקד מקומי "${localSpots[0].phrase}"` };
      }
    }

    // בדיקה לפי שם הקבוצה (אם הקבוצה ייעודית לפנימי שמש)
    const groupNorm = normalizeText(groupName);
    if (groupNorm.includes("פנימי שמש") || groupNorm.includes("בית שמש בלבד")) {
      const hasPrice = /\b\d{2,3}\b/.test(text);
      if (hasPrice) {
        return { ok: true, reason: `פנימי ${home} (מתוך קבוצה ייעודית)` };
      }
    }

    return { ok: false, reason: `אין בהודעה סימן לנסיעה פנימית בתוך ${home}` };
  }

  function parseDriverCommand(text) {
    let clean = String(text || "").trim();
    const norm = normalizeText(clean);

    // 1. פקודת מסלול מקוצרת (שתי ערים שונות)
    const routeShorthand = norm.match(/^(?:פ|פנוי)\s+([א-ת]+)\s+([א-ת]+)$/);
    if (routeShorthand) {
      const p1 = findPlaces(routeShorthand[1])[0]?.city;
      const p2 = findPlaces(routeShorthand[2])[0]?.city;
      if (p1 && p2 && p1 !== p2) {
        return { mode: "route", origin: p1, destination: p2, displayText: `${p1} ⬅️ ${p2}` };
      }
    }

    // פקודת מסלול רגילה: "פנוי בית שמש לירושלים"
    const roles = resolveRoles(findPlaces(clean), clean);
    if (roles.from && roles.to && roles.from !== roles.to) {
      return { mode: "route", origin: roles.from, destination: roles.to, displayText: `${roles.from} ⬅️ ${roles.to}` };
    }

    // 2. פקודת פנימי מפורשת: מכילה את המילה "פנימי"
    // "פנוי שמש פנימי", "שמש פנימי", "פנימי שמש", "פנוי מירון פנימי", "פנוי ים פנימי", "פ שמש פ", "פ ים פ"
    const isExplicitInternalCmd = /(^|\s)פנימי(\s|$)/.test(norm) ||
      /^(?:פ|פנוי)\s+[א-ת]+\s+פ$/.test(norm) ||
      /^[א-ת]+\s+פ$/.test(norm);

    if (isExplicitInternalCmd) {
      const cleanWithoutInternal = clean.replace(/פנימי/g, "").replace(/\bפ\b/g, "").trim();
      const places = findPlaces(cleanWithoutInternal.length > 0 ? cleanWithoutInternal : clean);
      const city = places[0]?.city || DEFAULT_CITY;
      return { mode: "internal", origin: city, destination: null, displayText: `${city} (פנימי בלבד)` };
    }

    // 3. חיפוש עיר יחידה (ללא המילה "פנימי"):
    // "פנוי ים", "פנוי שמש", "פנוי מירון", "פ ים", "פ שמש", "שמש", "ים", "מירון", "שמש צמצם"
    // לפי ההגדרה החדשה: מחפש בתוך ומחוץ לעיר כאחד!
    const singlePlaces = findPlaces(clean);
    const city = singlePlaces[0]?.city || DEFAULT_CITY;
    return { mode: "city_all", origin: city, destination: null, displayText: `${city} (בתוך ומחוץ לעיר)` };
  }

  function rideMatches(text, state, groupName = "") {
    const yes = (reason) => ({ ok: true, reason });
    const no = (reason) => ({ ok: false, reason });

    // ניקוי חתימת תחנה וקישורים כדי ששם התחנה בתחתית ההודעה לא יזהם את זיהוי המקומות
    const matchText = stripStationAndLinks(text) || text;
    const places = findPlaces(matchText);
    const home = state.origin;

    // רשימת כל הערים שזוהו בהודעה
    const detectedCities = [...new Set(places.map((p) => p.city))];
    const externalCities = detectedCities.filter((c) => c !== home);

    // ==========================================
    // מצב 1: פנימי בלבד (internal)
    // ==========================================
    if (state.mode === "internal") {
      const internalCheck = checkInternalRide(text, home, places, externalCities, groupName);
      if (internalCheck.ok) {
        return yes(internalCheck.reason);
      }
      return no(internalCheck.reason);
    }

    // ==========================================
    // מצב 2: בתוך ומחוץ לעיר (city_all או reduce / צמצום)
    // ==========================================
    if (state.mode === "city_all" || state.mode === "reduce") {
      // 1. האם זו נסיעה פנימית בעיר?
      const internalCheck = checkInternalRide(text, home, places, externalCities, groupName);
      if (internalCheck.ok) {
        return yes(`${home} (בתוך העיר): ${internalCheck.reason}`);
      }

      // 2. האם זו נסיעה שיוצאת מעיר הבית לכל יעד בינעירוני?
      const roles = resolveRoles(places, matchText);
      if (roles.cities.includes(home)) {
        // הגנה 1: אם ההודעה פותחת בכינוי מובהק של עיר אחרת (כמו "בב 70" או "שמש 50"),
        // עיר המוצא היא אותה עיר ולא עיר הבית!
        const firstAlias = places.find((p) => p.kind === "alias");
        if (firstAlias && firstAlias.start <= 1 && firstAlias.city !== home) {
          return no(`ההודעה פותחת בכינוי של עיר אחרת (${firstAlias.city})`);
        }

        // הגנה 2: בדיקת מחיר מינימלי לנסיעות בינעירוניות רחוקות (כמו ירושלים-בני ברק ב-70 ש"ח)
        const price = extractPrice(text);
        if (roles.to && roles.to !== home && isDistantRoute(home, roles.to) && price && price <= 110) {
          return no(`נפסל מיציאה מ${home}: מחיר נמוך (${price} ש"ח) לנסיעה בינעירונית ל-${roles.to}`);
        }

        if (roles.from === home) {
          return yes(`${home} (מחוץ לעיר): יוצאת ל${roles.to || "יעד חיצוני"}`);
        } else {
          return no(`${home} מופיעה כיעד ולא כמוצא (נסיעה נכנסת)`);
        }
      }

      return no(`לא זוהתה נסיעה פנימית ולא יציאה מ${home}`);
    }

    // ==========================================
    // מצב 3: יוצא מעיר לכל יעד (from)
    // ==========================================
    if (state.mode === "from") {
      const roles = resolveRoles(places, matchText);
      if (!roles.cities.includes(home)) return no(`${home} לא מופיעה בהודעה`);
      if (roles.from !== home) return no(`${home} מופיעה כיעד ולא כמוצא (נסיעה נכנסת)`);
      return yes(`יוצאת מ${home}`);
    }

    // ==========================================
    // מצב 4: מסלול ישיר (route: למשל בית שמש לירושלים)
    // ==========================================
    if (state.mode === "route") {
      const dest = state.destination;
      const roles = resolveRoles(places, matchText);

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

export function matchesAnySearch(rideText, userSearchState, groupName = "") {
  if (!userSearchState || !userSearchState.active) {
    return { ok: false, reason: "אין חיפוש פעיל" };
  }
  const searches = Array.isArray(userSearchState.searches) && userSearchState.searches.length > 0
    ? userSearchState.searches
    : [userSearchState];

  for (const s of searches) {
    const verdict = get().rideMatches(rideText, s, groupName);
    if (verdict.ok) {
      return {
        ok: true,
        reason: verdict.reason,
        matchedSearch: s,
      };
    }
  }
  return { ok: false, reason: "לא תואם לאף אחד מהחיפושים הפעילים" };
}

export const CITY_ALIAS_MAP = {
  "שמש": "בית שמש",
  "בש": "בית שמש",
  "בית שמש": "בית שמש",
  "ים": "ירושלים",
  "ירו": "ירושלים",
  "ירושלים": "ירושלים",
  "מירון": "מירון",
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
  "ביתר עילית": "ביתר עילית",
  "אלעד": "אלעד",
  "אשדוד": "אשדוד",
  "סבא": "כפר סבא",
  "כפר סבא": "כפר סבא",
  "פת": "פתח תקווה",
  "פתח": "פתח תקווה",
  "פתח תקווה": "פתח תקווה",
  "ראשון": "ראשון לציון",
  "ראשלצ": "ראשון לציון",
  "ראשון לציון": "ראשון לציון",
  "גבעז": "גבעת זאב",
  "גבעת זאב": "גבעת זאב",
  "גת": "קריית גת",
  "קרית גת": "קריית גת",
  "טלז": "טלזסטון",
  "טלזסטון": "טלזסטון",
  "חיפה": "חיפה",
  "טבריה": "טבריה",
  "צפת": "צפת",
  "רחובות": "רחובות",
  "חולון": "חולון",
  "בת ים": "בת ים",
  "לוד": "לוד",
  "רמלה": "רמלה",
  "עפולה": "עפולה",
  "נתיבות": "נתיבות",
  "רכסים": "רכסים",
  "קוממיות": "קוממיות",
  "יסודות": "יסודות",
  "כפר קאסם": "כפר קאסם",
  "קסם": "כפר קאסם",
  "נווה דניאל": "נווה דניאל",
  "נוה דניאל": "נווה דניאל",
  "בית חנן": "בית חנן",
  "עיכ": "עין כרם",
  "עין כרם": "עין כרם",
  "בית חלקיה": "בית חלקיה",
  "חזון יחזקאל": "חזון יחזקאל",
  "אלומה": "חזון יחזקאל",
};

export function processDriverCommand(rawText) {
  const raw = String(rawText || "").trim();
  const norm = normalizeText(raw);

  // 1. האם יש פקודת מסלול מקוצרת עם שני כינויים שונים? (למשל: "פ ים שמש", "ים שמש", "פנוי שמש בב")
  const cleanCmd = norm.replace(/^(?:פ|פנוי)\s+/, "");
  for (const [a1, c1] of Object.entries(CITY_ALIAS_MAP)) {
    for (const [a2, c2] of Object.entries(CITY_ALIAS_MAP)) {
      if (c1 === c2) continue;
      const routeRe = new RegExp(`^${a1}\\s+(?:ל|אל|\\-|>|)?${a2}$`);
      if (routeRe.test(cleanCmd)) {
        return { mode: "route", origin: c1, destination: c2, displayText: `${c1} ⬅️ ${c2}` };
      }
    }
  }

  // 2. האם יש פקודת פנימי מפורשת? (חובה שתכיל "פנימי" או קיצור פנימי מובהק כמו "פנוי שמש פנימי", "שמש פנימי", "פנוי פ שמש", "פ פ שמש")
  const isExplicitInternalCmd = /(^|\s)פנימי(\s|$)/.test(norm) ||
    /^(?:פ|פנוי)\s+פ\s+/.test(norm) ||
    /^(?:פ|פנוי)\s+[א-ת\s]+\s+פ$/.test(norm) ||
    /^[א-ת\s]+\s+פ$/.test(norm);

  if (isExplicitInternalCmd) {
    const cleanWithoutInternal = cleanCmd
      .replace(/(^|\s)פנימי(\s|$)/g, " ")
      .replace(/^פ\s+/, "")
      .replace(/\s+פ$/, "")
      .replace(/\bפ\b/g, " ")
      .trim();
    let city = CITY_ALIAS_MAP[cleanWithoutInternal];
    if (!city) {
      const places = findPlaces(cleanWithoutInternal.length > 0 ? cleanWithoutInternal : raw);
      city = places[0]?.city || "בית שמש";
    }
    return { mode: "internal", origin: city, destination: null, displayText: `${city} (פנימי בלבד)` };
  }

  // 3. עיר יחידה ללא המילה "פנימי": "פנוי ים", "פנוי שמש", "פנוי מירון", "פ ים", "שמש", "ים", "מירון", "שמש צמצם"
  // חיפוש בתוך ומחוץ לעיר כאחד!
  let singleCity = CITY_ALIAS_MAP[cleanCmd.replace(/(^|\s)(צמצם|צמצום)(\s|$)/g, "").trim()];
  if (!singleCity) {
    const places = findPlaces(raw);
    singleCity = places[0]?.city || (raw.length > 0 ? raw : "בית שמש");
  }

  return { mode: "city_all", origin: singleCity, destination: null, displayText: `${singleCity} (בתוך ומחוץ לעיר)` };
}

// חילוץ איש קשר/טלפון של הסדרן מתוך טקסט הנסיעה או פרטי השולח
export function extractDispatcherContact(alertInfo) {
  if (!alertInfo) return null;
  const text = alertInfo.rawText || alertInfo.rideData?.rawText || alertInfo.rideData?.cleanedText || "";

  // 1. חיפוש טלפון ישיר מתוך תוכן ההודעה (למשל "לבקש פה 0507787427" או "0542086154")
  if (text) {
    const matchContext = text.match(/(?:לבקש|אצל|טלפון|טל|פלאפון|סדרן|וואטסאפ|פרטי|נייד|דברו עם)[^\d\n\r]{0,15}(05\d[- ]?\d{7})/);
    if (matchContext && matchContext[1]) {
      const p = cleanPhone(matchContext[1]);
      if (p && p.length >= 9 && !isLid(p)) return p;
    }
    const matchGeneral = text.match(/(?:^|[^\d])(05\d[- ]?\d{7})(?:$|[^\d])/);
    if (matchGeneral && matchGeneral[1]) {
      const p = cleanPhone(matchGeneral[1]);
      if (p && p.length >= 9 && !isLid(p)) return p;
    }
  }

  // 2. מספר הטלפון המפוענח של השולח/סדרן
  const senderPhone = cleanPhone(alertInfo.senderPhone);
  if (senderPhone && senderPhone.length >= 9 && !isLid(senderPhone) && senderPhone !== "זמין בקבוצה") {
    return senderPhone;
  }

  // 3. JID ישיר
  if (alertInfo.senderJid && !isLid(alertInfo.senderJid)) {
    const p = cleanPhone(alertInfo.senderJid);
    if (p && p.length >= 9 && !isLid(p)) return p;
  }

  return null;
}

// יצירת אובייקט ציטוט של הודעת הנסיעה המקורית (לתגובה בקבוצה ולתגובה אישית לסדרן)
export function buildQuotedRideMessage(alertInfo) {
  if (!alertInfo) return undefined;
  const rawText = alertInfo.rawText || alertInfo.rideData?.rawText || alertInfo.rideData?.cleanedText || "";
  const origKey = alertInfo.originalMsgKey || {};
  const groupJid = alertInfo.groupJid || origKey.remoteJid;
  const participant = alertInfo.senderJid || origKey.participant || origKey.remoteJid;
  const id = origKey.id || alertInfo.msgId;

  if (!id) return undefined;

  return {
    key: {
      remoteJid: groupJid,
      participant: participant,
      id: id,
      fromMe: false,
    },
    message: alertInfo.originalMessage || {
      conversation: rawText,
    },
  };
}



