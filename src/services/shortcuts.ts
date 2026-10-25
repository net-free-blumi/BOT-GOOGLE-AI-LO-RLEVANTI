import { CityAlias } from '../types.ts';

const SHORTCUTS_KEY = 'rides_city_shortcuts';

export const DEFAULT_SHORTCUTS: CityAlias[] = [
  // ערי יעד ומוצא ראשיות + קיצורים
  { id: '1', shortcut: 'שמש', city: 'בית שמש', note: 'ברירת מחדל מרכזית' },
  { id: '2', shortcut: 'ים', city: 'ירושלים', note: 'קיצור טקסי נפוץ' },
  { id: '3', shortcut: 'בב', city: 'בני ברק', note: 'ראשי תיבות' },
  { id: '4', shortcut: 'מוע', city: 'מודיעין עילית', note: 'ראשי תיבות' },
  { id: '5', shortcut: 'תא', city: 'תל אביב', note: 'ראשי תיבות' },
  { id: '6', shortcut: 'פת', city: 'פתח תקווה', note: 'ראשי תיבות' },
  { id: '7', shortcut: 'ביתר', city: 'ביתר עילית', note: 'עיר שכנה' },
  { id: '8', shortcut: 'ספר', city: 'קריית ספר', note: 'מודיעין עילית' },
  { id: '9', shortcut: 'קס', city: 'קריית ספר', note: 'ראשי תיבות' },
  { id: '10', shortcut: 'אשדוד', city: 'אשדוד', note: 'עיר חוף' },
  { id: '11', shortcut: 'אלעד', city: 'אלעד', note: 'מרכז חרדי' },
  { id: '12', shortcut: 'רה', city: 'ראש העין', note: 'ראשי תיבות' },
  { id: '13', shortcut: 'ראש העין', city: 'ראש העין', note: 'שם מלא' },
  { id: '14', shortcut: 'נוף הגליל', city: 'נוף הגליל', note: 'צפון' },
  { id: '15', shortcut: 'טלזסטון', city: 'טלז סטון', note: 'קריית יערים' },
  { id: '16', shortcut: 'טלז סטון', city: 'טלז סטון', note: 'שם מלא' },
  { id: '17', shortcut: 'גב שמואל', city: 'גבעת שמואל', note: 'ראשי תיבות' },
  { id: '18', shortcut: 'גבעת שמואל', city: 'גבעת שמואל', note: 'שם מלא' },
  { id: '19', shortcut: 'חיפה', city: 'חיפה', note: 'צפון' },
  { id: '20', shortcut: 'נתניה', city: 'נתניה', note: 'שרון' },
  { id: '21', shortcut: 'צפת', city: 'צפת', note: 'גליל' },
  { id: '22', shortcut: 'טבריה', city: 'טבריה', note: 'כנרת' },
  { id: '23', shortcut: 'מירון', city: 'מירון', note: 'גליל עליון' },
  { id: '24', shortcut: 'עפולה', city: 'עפולה', note: 'עמק יזרעאל' },
  { id: '25', shortcut: 'רכסים', city: 'רכסים', note: 'צפון' },
  { id: '26', shortcut: 'חריש', city: 'חריש', note: 'מרכז-צפון' },
  { id: '27', shortcut: 'נתיבות', city: 'נתיבות', note: 'דרום' },
  { id: '28', shortcut: 'אופקים', city: 'אופקים', note: 'דרום' },
  { id: '29', shortcut: 'קוממיות', city: 'קוממיות', note: 'דרום' },
  { id: '30', shortcut: 'נתבג', city: 'נתב"ג', note: 'שדה תעופה' },
  { id: '31', shortcut: 'שדה', city: 'נתב"ג', note: 'כינוי נתב"ג' },
  // מושבים סמוכים לבית שמש הנכללים אוטומטית בהגדרה
  { id: '32', shortcut: 'צרעה', city: 'בית שמש', note: 'מושב סמוך לבית שמש' },
  { id: '33', shortcut: 'הרטוב', city: 'בית שמש', note: 'אזור תעשייה / מושב הר טוב' },
  { id: '34', shortcut: 'הר טוב', city: 'בית שמש', note: 'מושב סמוך לבית שמש' },
  { id: '35', shortcut: 'עגור', city: 'בית שמש', note: 'מושב סמוך לבית שמש' },
  { id: '36', shortcut: 'מחסיה', city: 'בית שמש', note: 'מושב סמוך לבית שמש' },
  { id: '37', shortcut: 'ישעי', city: 'בית שמש', note: 'מושב סמוך לבית שמש' },
  { id: '38', shortcut: 'זכריה', city: 'בית שמש', note: 'מושב סמוך לבית שמש' },
  { id: '39', shortcut: 'לוזית', city: 'בית שמש', note: 'מושב סמוך לבית שמש' },
  { id: '40', shortcut: 'בית גמאל', city: 'בית שמש', note: 'מנזר / מושב סמוך' },
  { id: '41', shortcut: 'רמת לחי', city: 'בית שמש', note: 'אזור סמוך' },
];

export function loadShortcuts(): CityAlias[] {
  try {
    const raw = localStorage.getItem(SHORTCUTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_SHORTCUTS;
}

export function saveShortcuts(list: CityAlias[]) {
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(list));
}

/**
 * Translates driver shorthand into clean bot commands
 * e.g.
 * "פ ים שמש" -> "פנוי ירושלים לבית שמש"
 * "שמש צמצם" -> "פנוי בית שמש" (מצב צמצום: פנימי וחיצוני)
 * "פ ים" -> "פנוי ירושלים"
 * "פנוי פנימי ים" / "פנימי ים" -> "פנוי פ ירושלים"
 * "פנוי שמש פנימי" / "שמש פ" -> "פנוי פ בית שמש"
 */
export function translateDriverShorthand(raw: string, shortcuts: CityAlias[]): { translated: string; isReducedMode?: boolean } {
  let clean = raw.trim();
  const lower = clean.replace(/["'״׳]/g, '').trim();

  // Map of shortcuts
  const map: Record<string, string> = {};
  for (const item of shortcuts) {
    const s = item.shortcut.replace(/["'״׳]/g, '').trim();
    map[s] = item.city;
  }

  // 1. צמצם (Reduced mode: both internal and external for city)
  // e.g. "שמש צמצם", "ים צמצם", "צמצם שמש"
  if (lower.includes('צמצם') || lower.includes('צמצום')) {
    const parts = lower.split(/\s+/).filter((p) => !['צמצם', 'צמצום', 'פ', 'פנוי'].includes(p));
    const target = parts[0] || 'שמש';
    const resolvedCity = map[target] || target;
    return {
      translated: `פנוי ${resolvedCity}`,
      isReducedMode: true,
    };
  }

  // 2. פקודת פנימי מפורשת: "פנוי פנימי ים", "פנימי ים", "פ פנימי ים", "פנוי שמש פנימי", "שמש פנימי"
  const internalPrefixMatch = lower.match(/^(?:פ|פנוי)?\s*פנימי\s+([א-ת\s]+)$/);
  if (internalPrefixMatch) {
    const token = internalPrefixMatch[1].trim();
    const city = map[token] || token;
    return { translated: `פנוי פ ${city}` };
  }

  const internalSuffixMatch = lower.match(/^(?:פ|פנוי)?\s*([א-ת]+)\s+פנימי$/);
  if (internalSuffixMatch) {
    const token = internalSuffixMatch[1].trim();
    const city = map[token] || token;
    return { translated: `פנוי פ ${city}` };
  }

  // 3. קיצורי פנימי מהירים: "פ שמש", "שמש פ", "פ ים", "ים פ" כשהדפוס מכיל "פ" בודדת
  const fastInternal = lower.match(/^([א-ת]+)\s+פ(?:\s+\d+)?$/);
  if (fastInternal) {
    const token = fastInternal[1].trim();
    const city = map[token] || token;
    return { translated: `פנוי פ ${city}` };
  }

  // 4. Handle "פ ים שמש" or "פנוי ים שמש" or "ים שמש" (Route: from City1 to City2)
  const routeMatch = lower.match(/^(?:פ|פנוי)?\s*([א-ת]+)\s+([א-ת]+)$/);
  if (routeMatch) {
    const originToken = routeMatch[1];
    const destToken = routeMatch[2];

    // If second word is "פנימי"
    if (destToken === 'פנימי') {
      const city = map[originToken] || originToken;
      return { translated: `פנוי פ ${city}` };
    }
    // If first word is "פנימי"
    if (originToken === 'פנימי') {
      const city = map[destToken] || destToken;
      return { translated: `פנוי פ ${city}` };
    }

    const fromCity = map[originToken] || originToken;
    const toCity = map[destToken] || destToken;
    return { translated: `פנוי ${fromCity} ל${toCity}` };
  }

  // 5. Handle "פ ים" (from city)
  const fromMatch = lower.match(/^(?:פ|פנוי)\s+([א-ת]+)$/);
  if (fromMatch) {
    const token = fromMatch[1];
    if (token === 'פנימי') {
      return { translated: 'פנוי פ בית שמש' };
    }
    const city = map[token] || token;
    return { translated: `פנוי ${city}` };
  }

  // Standard return
  return { translated: clean };
}

/**
 * Client-Side Ride Match Simulator
 * Allows driver to test any WhatsApp message against any command right in the UI
 */
export interface SimulationResult {
  matches: boolean;
  mode: 'internal' | 'route' | 'from' | 'reduce';
  origin: string;
  destination: string | null;
  reason: string;
  detectedCities: string[];
  externalCities: string[];
}

export function simulateRideMatch(messageText: string, commandInput: string, shortcuts: CityAlias[]): SimulationResult {
  const { translated, isReducedMode } = translateDriverShorthand(commandInput, shortcuts);
  const normMsg = messageText.toLowerCase().replace(/["'״׳]/g, '').trim();

  // Create dictionary of cities and aliases
  const aliasToCity: Record<string, string> = {};
  for (const item of shortcuts) {
    aliasToCity[item.shortcut.toLowerCase()] = item.city;
  }
  // add base cities
  aliasToCity['בית שמש'] = 'בית שמש';
  aliasToCity['ירושלים'] = 'ירושלים';
  aliasToCity['בני ברק'] = 'בני ברק';
  aliasToCity['מודיעין עילית'] = 'מודיעין עילית';
  aliasToCity['תל אביב'] = 'תל אביב';
  aliasToCity['פתח תקווה'] = 'פתח תקווה';
  aliasToCity['ביתר עילית'] = 'ביתר עילית';
  aliasToCity['קריית ספר'] = 'קריית ספר';
  aliasToCity['חריש'] = 'חריש';
  aliasToCity['אשדוד'] = 'אשדוד';
  aliasToCity['נתבג'] = 'נתב"ג';
  aliasToCity['הר טוב'] = 'בית שמש';
  aliasToCity['צרעה'] = 'בית שמש';
  aliasToCity['עגור'] = 'בית שמש';
  aliasToCity['מחסיה'] = 'בית שמש';
  aliasToCity['ישעי'] = 'בית שמש';

  // Determine command mode & cities
  let mode: 'internal' | 'route' | 'from' | 'reduce' = isReducedMode ? 'reduce' : 'from';
  let origin = 'בית שמש';
  let destination: string | null = null;

  if (translated.includes('פנוי פ ') || translated.includes(' פנימי')) {
    mode = 'internal';
    const target = translated.replace(/פנוי\s+פ\s+/g, '').replace(' פנימי', '').trim();
    origin = aliasToCity[target.toLowerCase()] || target;
  } else if (translated.includes(' ל')) {
    mode = 'route';
    const parts = translated.replace('פנוי ', '').split(' ל');
    origin = parts[0]?.trim() || 'בית שמש';
    destination = parts[1]?.trim() || null;
  } else {
    const rawTarget = translated.replace('פנוי ', '').trim();
    origin = aliasToCity[rawTarget.toLowerCase()] || rawTarget || 'בית שמש';
  }

  // Detect cities in message
  const detectedCitiesSet = new Set<string>();
  for (const [alias, city] of Object.entries(aliasToCity)) {
    const regex = new RegExp(`(^|\\s|[בלמהוכש])${alias}(\\s|$|[,.])`, 'i');
    if (regex.test(normMsg)) {
      detectedCitiesSet.add(city);
    }
  }

  // Check Beit Shemesh neighborhoods & internal indicators
  const bsNeighborhoods = ['רמה א', 'רמה ב', 'רמה ג', 'רמה ד', 'חפציבה', 'קריה', 'נעימי', 'ביג', 'סאן מול', 'סלונים', 'גור', 'ישנה', 'מרכז מסחרי'];
  let hasBsNeighborhood = bsNeighborhoods.some((n) => normMsg.includes(n));
  if (/(\b[א-ד]\b.*?\bל[א-ד]\b)/.test(normMsg)) {
    hasBsNeighborhood = true;
  }
  if (hasBsNeighborhood) {
    detectedCitiesSet.add('בית שמש');
  }

  // Check Jerusalem neighborhoods
  const jlmNeighborhoods = ['הר נוף', 'גבעת שאול', 'גבעש', 'רמות', 'בית וגן', 'גילה', 'גאולה', 'מאה שערים', 'סנהדריה', 'רוממה'];
  const hasJlmNeighborhood = jlmNeighborhoods.some((n) => normMsg.includes(n));
  if (hasJlmNeighborhood) {
    detectedCitiesSet.add('ירושלים');
  }

  const detectedCities = [...detectedCitiesSet];
  const externalCities = detectedCities.filter((c) => c !== origin);

  // Match decision
  if (mode === 'internal') {
    if (externalCities.length > 0) {
      return {
        matches: false,
        mode,
        origin,
        destination,
        reason: `נפסל מפנימי: מופיעה עיר חיצונית בהודעה (${externalCities.join(', ')})`,
        detectedCities,
        externalCities,
      };
    }
    if (detectedCities.includes(origin) || (origin === 'בית שמש' && hasBsNeighborhood) || (origin === 'ירושלים' && hasJlmNeighborhood)) {
      return {
        matches: true,
        mode,
        origin,
        destination,
        reason: `התאמה מלאה! נסיעה פנימית בתוך ${origin}`,
        detectedCities,
        externalCities,
      };
    }
    return {
      matches: false,
      mode,
      origin,
      destination,
      reason: `לא זוהו סממנים לפנימי בתוך ${origin}`,
      detectedCities,
      externalCities,
    };
  }

  if (mode === 'reduce') {
    // Both internal or leaving origin
    if (detectedCities.includes(origin) || (origin === 'בית שמש' && hasBsNeighborhood)) {
      return {
        matches: true,
        mode,
        origin,
        destination,
        reason: `התאמה במצב צמצום עבור ${origin}`,
        detectedCities,
        externalCities,
      };
    }
    return {
      matches: false,
      mode,
      origin,
      destination,
      reason: `ההודעה אינה קשורה ל${origin}`,
      detectedCities,
      externalCities,
    };
  }

  if (mode === 'route') {
    if (destination && detectedCities.includes(origin) && detectedCities.includes(destination)) {
      return {
        matches: true,
        mode,
        origin,
        destination,
        reason: `התאמה מלאה למסלול מ${origin} אל ${destination}`,
        detectedCities,
        externalCities,
      };
    }
    return {
      matches: false,
      mode,
      origin,
      destination,
      reason: `הודעה חסרה לפחות אחת מערי המסלול (${origin} ⬅️ ${destination})`,
      detectedCities,
      externalCities,
    };
  }

  // Mode: from
  if (detectedCities.includes(origin) || (origin === 'בית שמש' && hasBsNeighborhood)) {
    return {
      matches: true,
      mode,
      origin,
      destination,
      reason: `התאמה לנסיעה יוצאת מ${origin}`,
      detectedCities,
      externalCities,
    };
  }

  return {
    matches: false,
    mode,
    origin,
    destination,
    reason: `עיר המוצא ${origin} לא זוהתה בהודעה`,
    detectedCities,
    externalCities,
  };
}
