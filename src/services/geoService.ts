// geoService.ts - שירות מיפוי רחובות, שכונות וחישוב מרחקי נסיעה בזמן אמת לנהג

export interface GeoPoint {
  lat: number;
  lng: number;
  name: string;
  city: string;
  zone?: string;
}

// נקודות ציון גיאוגרפיות מדויקות לשכונות ולמוקדים מרכזיים בבית שמש
export const BEIT_SHEMESH_ZONES: Record<string, GeoPoint> = {
  'רמה ד': { lat: 31.7052, lng: 34.9904, name: "רמת בית שמש ד'", city: 'בית שמש', zone: 'דרום' },
  'רמה ג': { lat: 31.7185, lng: 34.9982, name: "רמת בית שמש ג'", city: 'בית שמש', zone: 'מזרח' },
  'רמה א': { lat: 31.7331, lng: 34.9926, name: "רמת בית שמש א'", city: 'בית שמש', zone: 'מרכז-דרום' },
  'רמה ב': { lat: 31.7258, lng: 34.9854, name: "רמת בית שמש ב'", city: 'בית שמש', zone: 'מרכז' },
  'רמה ה': { lat: 31.7224, lng: 35.0081, name: "נווה שמיר (רמה ה')", city: 'בית שמש', zone: 'דרום-מזרח' },
  'רמת אברהם': { lat: 31.7382, lng: 34.9751, name: 'רמת אברהם', city: 'בית שמש', zone: 'מערב' },
  'הקריה החרדית': { lat: 31.7456, lng: 34.9785, name: 'הקריה / חפציבה', city: 'בית שמש', zone: 'מרכז-מערב' },
  'העיר הוותיקה': { lat: 31.7554, lng: 34.9951, name: 'העיר הוותיקה (הישנה / סמוך לנעימי)', city: 'בית שמש', zone: 'צפון' },
  'מרכז ביג': { lat: 31.7588, lng: 34.9802, name: 'מרכז ביג / שער העיר / אושר עד', city: 'בית שמש', zone: 'צפון-מערב' },
  'קניון נעימי': { lat: 31.7521, lng: 34.9856, name: 'קניון נעימי / אושר עד / סאן מול', city: 'בית שמש', zone: 'צפון' },
  'הר טוב': { lat: 31.7654, lng: 34.9988, name: 'אזור תעשייה הר טוב / צרעה', city: 'בית שמש', zone: 'צפון-מזרח' },
};

// ערים מרכזיות בישראל לזיהוי נסיעות בכל הארץ
export const MAJOR_CITIES_ZONES: Record<string, GeoPoint> = {
  'בני ברק': { lat: 32.0845, lng: 34.8341, name: 'בני ברק', city: 'בני ברק' },
  'ירושלים': { lat: 31.7850, lng: 35.2100, name: 'ירושלים', city: 'ירושלים' },
  'מודיעין עילית': { lat: 31.9317, lng: 35.0417, name: 'מודיעין עילית (קרית ספר)', city: 'מודיעין עילית' },
  'אשדוד': { lat: 31.7950, lng: 34.6450, name: 'אשדוד', city: 'אשדוד' },
  'אלעד': { lat: 32.0519, lng: 34.9511, name: 'אלעד', city: 'אלעד' },
  'צפת': { lat: 32.9658, lng: 35.4963, name: 'צפת', city: 'צפת' },
  'מירון': { lat: 32.9822, lng: 35.4397, name: 'מירון', city: 'מירון' },
  'טבריה': { lat: 32.7922, lng: 35.5312, name: 'טבריה', city: 'טבריה' },
  'תל אביב': { lat: 32.0853, lng: 34.7818, name: 'תל אביב', city: 'תל אביב' },
  'פתח תקווה': { lat: 32.0840, lng: 34.8878, name: 'פתח תקווה', city: 'פתח תקווה' },
  'נתניה': { lat: 32.3215, lng: 34.8532, name: 'נתניה', city: 'נתניה' },
};

// מיפוי רחובות ומוקדים ידועים לשכונות בבית שמש
const STREET_TO_ZONE_MAP: Record<string, string> = {
  // רמה ג' (נביאים)
  'זכריה הנביא': 'רמה ג',
  'זכריה': 'רמה ג',
  'חגי הנביא': 'רמה ג',
  'חגי': 'רמה ג',
  'צפניה הנביא': 'רמה ג',
  'צפניה': 'רמה ג',
  'חבקוק הנביא': 'רמה ג',
  'חבקוק': 'רמה ג',
  'עמוס הנביא': 'רמה ג',
  'עמוס': 'רמה ג',
  'מיכה הנביא': 'רמה ג',
  'מיכה': 'רמה ג',
  'יונה הנביא': 'רמה ג',
  'יונה': 'רמה ג',
  'הושע הנביא': 'רמה ג',
  'הושע': 'רמה ג',
  'נחום הנביא': 'רמה ג',
  'נחום': 'רמה ג',
  'יואל הנביא': 'רמה ג',
  'יואל': 'רמה ג',
  'אלישע הנביא': 'רמה ג',
  'אלישע': 'רמה ג',
  'אליהו הנביא': 'רמה ג',
  'אליהו': 'רמה ג',
  'שמואל הנביא': 'רמה ג',
  'ישעיהו הנביא': 'רמה ג',
  'ירמיהו הנביא': 'רמה ג',
  'יחזקאל הנביא': 'רמה ג',
  'יחזקאל': 'רמה ג',
  'מרים הנביאה': 'רמה ג',
  'דבורה הנביאה': 'רמה ג',
  'חולדה הנביאה': 'רמה ג',
  'מרכז רמה ג': 'רמה ג',
  'רמה ג 1': 'רמה ג',
  'רמה ג 2': 'רמה ג',
  'רמג': 'רמה ג',

  // רמה ד' (אמוראים)
  'שדרות האמוראים': 'רמה ד',
  'שד האמוראים': 'רמה ד',
  'האמוראים': 'רמה ד',
  'אמוראים': 'רמה ד',
  'רב חנן': 'רמה ד',
  'אביי': 'רמה ד',
  'רבא': 'רמה ד',
  'רב מרי': 'רמה ד',
  'רב אשי': 'רמה ד',
  'רב הונא': 'רמה ד',
  'מר עוקבא': 'רמה ד',
  'רב ייבא סבא': 'רמה ד',
  'רב ספרא': 'רמה ד',
  'רב ביבי': 'רמה ד',
  'רב פפא': 'רמה ד',
  'תלמוד בבלי': 'רמה ד',
  'ריבל': 'רמה ד',
  'רמה ד 1': 'רמה ד',
  'רמה ד 2': 'רמה ד',
  'רמה ד 3': 'רמה ד',
  'רמה ד 4': 'רמה ד',
  'רמה ד 5': 'רמה ד',
  'לד': 'רמה ד',
  'רמד': 'רמה ד',

  // רמה א' (נחלים)
  'נחל קישון': 'רמה א',
  'הקישון': 'רמה א',
  'נחל דולב': 'רמה א',
  'הדולב': 'רמה א',
  'נחל צאלים': 'רמה א',
  'נחל שורק': 'רמה א',
  'נחל לוז': 'רמה א',
  'נחל משמר': 'רמה א',
  'משמר': 'רמה א',
  'נחל עין גדי': 'רמה א',
  'נחל ירקון': 'רמה א',
  'הירקון': 'רמה א',
  'נחל תמנע': 'רמה א',
  'נחל רפאים': 'רמה א',
  'נחל שחם': 'רמה א',
  'נחל חבר': 'רמה א',
  'נחל גרר': 'רמה א',
  'נחל ארנון': 'רמה א',
  'נחל יבניאל': 'רמה א',
  'נחל לכיש': 'רמה א',
  'נחל ערוגות': 'רמה א',
  'נחל מטע': 'רמה א',
  'לב הרמה': 'רמה א',
  'מרכז רמה א': 'רמה א',
  'רמא': 'רמה א',

  // רמה ב' (נהרות ותנאים)
  'נהר הירדן': 'רמה ב',
  'הירדן': 'רמה ב',
  'רבי יהודה הנשיא': 'רמה ב',
  'יהודה הנשיא': 'רמה ב',
  'רבי עקיבא': 'רמה ב',
  'בן איש חי': 'רמה ב',
  'רבי טרפון': 'רמה ב',
  'רבי מאיר': 'רמה ב',
  'רשבי': 'רמה ב',
  'רמבם': 'רמה ב',
  'רמב': 'רמה ב',

  // קריה / חפציבה
  'אור החיים': 'הקריה החרדית',
  'חפציבה': 'הקריה החרדית',
  'קריה': 'הקריה החרדית',
  'הקריה': 'הקריה החרדית',
  'קרייה': 'הקריה החרדית',
  'קדושת אהרן': 'הקריה החרדית',
  'חזון איש': 'הקריה החרדית',
  'שמחת משה': 'הקריה החרדית',

  // נווה שמיר / רמה ה'
  'נווה שמיר': 'רמה ה',
  'נוה שמיר': 'רמה ה',
  'שמיר': 'רמה ה',
  'יפה נוף': 'רמה ה',
  'שיינפלד': 'רמה ה',

  // עיר ישנה / וותיקה
  'הגפן': 'העיר הוותיקה',
  'סמטת הגפן': 'העיר הוותיקה',
  'הברוש': 'העיר הוותיקה',
  'ברוש': 'העיר הוותיקה',
  'וותיקה': 'העיר הוותיקה',
  'הוותיקה': 'העיר הוותיקה',
  'הישנה': 'העיר הוותיקה',
  'ישנה': 'העיר הוותיקה',
  'ברכיה': 'העיר הוותיקה',
  'ברכיהו': 'העיר הוותיקה',
  'עליית הנוער': 'העיר הוותיקה',
  'עלית הנוער': 'העיר הוותיקה',
  'המכללה לשוטרים': 'העיר הוותיקה',

  // אזורי מסחר, מוקדים וסופרמרקטים
  'אושר עד': 'מרכז ביג',
  'אושרעד': 'מרכז ביג',
  'מתחם אושר עד': 'מרכז ביג',
  'שערי העיר': 'מרכז ביג',
  'מרכז נעימי': 'קניון נעימי',
  'קניון נעימי': 'קניון נעימי',
  'מתחם נעימי': 'קניון נעימי',
  'נעימי': 'קניון נעימי',
  'הנעימי': 'קניון נעימי',
  'סאן מול': 'קניון נעימי',
  'ביג': 'מרכז ביג',
  'הביג': 'מרכז ביג',
  'מרכז ביג': 'מרכז ביג',
  'שער העיר': 'מרכז ביג',
  'יש חסד': 'רמה א',
  'יש חסד נחלים': 'רמה א',
  'יש חסד ד': 'רמה ד',
  'יש חסד ג': 'רמה ג',
  'יש חסד קריה': 'הקריה החרדית',
  'הר טוב': 'הר טוב',
  'הרטוב': 'הר טוב',
  'אזהת הרטוב': 'הר טוב',
  'אזור תעשיה הר טוב': 'הר טוב',
  'יער צרעה': 'הר טוב',
  'צרעה': 'הר טוב',
  'משקפיים': 'רמת אברהם',
  'רמת אברהם': 'רמת אברהם',
};

// כינויי שכונות נפוצים וקיצורים (למשל: מב = רמה ב, לד = רמה ד)
export const ZONE_ALIAS_MAP: Record<string, string> = {
  // רמה ד'
  'רמה ד': 'רמה ד',
  'רמד': 'רמה ד',
  'ד': 'רמה ד',
  'ד1': 'רמה ד',
  'ד2': 'רמה ד',
  'ד3': 'רמה ד',
  'ד4': 'רמה ד',
  'ד5': 'רמה ד',
  'מד': 'רמה ד',
  'לד': 'רמה ד',

  // רמה ג'
  'רמה ג': 'רמה ג',
  'רמג': 'רמה ג',
  'ג': 'רמה ג',
  'ג1': 'רמה ג',
  'ג2': 'רמה ג',
  'מג': 'רמה ג',
  'לג': 'רמה ג',

  // רמה א'
  'רמה א': 'רמה א',
  'רמא': 'רמה א',
  'א': 'רמה א',
  'א1': 'רמה א',
  'א2': 'רמה א',
  'מא': 'רמה א',
  'לא': 'רמה א',

  // רמה ב'
  'רמה ב': 'רמה ב',
  'רמב': 'רמה ב',
  'ב': 'רמה ב',
  'ב1': 'רמה ב',
  'ב2': 'רמה ב',
  'מב': 'רמה ב',
  'לב': 'רמה ב',

  // נווה שמיר (רמה ה')
  'נווה שמיר': 'רמה ה',
  'נוה שמיר': 'רמה ה',
  'רמה ה': 'רמה ה',
  'רמה': 'רמה ה',
  'ה': 'רמה ה',
  'מה': 'רמה ה',
  'לה': 'רמה ה',

  // שכונות ומוקדים נוספים
  'קריה': 'הקריה החרדית',
  'הקריה': 'הקריה החרדית',
  'חפציבה': 'הקריה החרדית',
  'ישנה': 'העיר הוותיקה',
  'וותיקה': 'העיר הוותיקה',
  'הישנה': 'העיר הוותיקה',
  'הוותיקה': 'העיר הוותיקה',
  'אושר עד': 'מרכז ביג',
  'אושרעד': 'מרכז ביג',
  'נעימי': 'קניון נעימי',
  'הנעימי': 'קניון נעימי',
  'ביג': 'מרכז ביג',
  'שער העיר': 'מרכז ביג',
  'סאן מול': 'קניון נעימי',
  'הר טוב': 'הר טוב',
  'הרטוב': 'הר טוב',
  'צרעה': 'הר טוב',
};

// חילוץ מספר טלפון אמיתי של סדרן מתוך טקסט הנסיעה (מונע סדרן: 0 לחלוטין)
export function extractDispatcherPhone(text: string, rawPhone?: string): string | null {
  if (rawPhone && typeof rawPhone === 'string') {
    const cleanDigits = rawPhone.replace(/\D/g, '');
    if (cleanDigits.length >= 9 && cleanDigits.length <= 12 && cleanDigits !== '0') {
      if (cleanDigits.startsWith('9725')) {
        return `0${cleanDigits.slice(3)}`;
      }
      if (cleanDigits.startsWith('05')) {
        return cleanDigits;
      }
    }
  }

  if (!text) return null;

  // 1. חיפוש קישור wa.me
  const waMatch = text.match(/wa\.me\/(\d+)/i);
  if (waMatch && waMatch[1]) {
    const digits = waMatch[1].replace(/\D/g, '');
    if (digits.startsWith('9725')) {
      return `0${digits.slice(3)}`;
    }
    if (digits.startsWith('05')) {
      return digits;
    }
  }

  // 2. חיפוש ביטויים כמו "לבקש ב 0501234567" או "סדרן 052-1234567"
  const promptMatch = text.match(/(?:לבקש ב|אצל|סדרן|טלפון|נייד|בווצאפ|בוואטסאפ|וואטסאפ|טל)?\s*(05\d[- ]?\d{3}[- ]?\d{4})/i);
  if (promptMatch && promptMatch[1]) {
    return promptMatch[1].replace(/[- ]/g, '');
  }

  // 3. חיפוש מספר ישראלי סלולרי רגיל בטקסט
  const anyPhoneMatch = text.match(/\b(05\d{8})\b/);
  if (anyPhoneMatch && anyPhoneMatch[1]) {
    return anyPhoneMatch[1];
  }

  return null;
}

// זיהוי השכונה מתוך שם רחוב או טקסט נסיעה
export function detectNeighborhood(text: string): { key: string; name: string; point: GeoPoint; street?: string } | null {
  if (!text) return null;
  const clean = String(text)
    .replace(/[֑-ׇ"'\-.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. בדיקת שכונות רשמיות וצירופים מלאים (רמה א, רמה ב, רמה ג, רמה ד, רמה ה, נווה שמיר וכו')
  const multiWordZones = [
    { key: 'רמת בית שמש ד', zoneKey: 'רמה ד' },
    { key: 'רמת בית שמש ג', zoneKey: 'רמה ג' },
    { key: 'רמת בית שמש ב', zoneKey: 'רמה ב' },
    { key: 'רמת בית שמש א', zoneKey: 'רמה א' },
    { key: 'רמה ד', zoneKey: 'רמה ד' },
    { key: 'רמה ג', zoneKey: 'רמה ג' },
    { key: 'רמה ב', zoneKey: 'רמה ב' },
    { key: 'רמה א', zoneKey: 'רמה א' },
    { key: 'רמה ה', zoneKey: 'רמה ה' },
    { key: 'נווה שמיר', zoneKey: 'רמה ה' },
    { key: 'נוה שמיר', zoneKey: 'רמה ה' },
    { key: 'רמת אברהם', zoneKey: 'רמת אברהם' },
    { key: 'הקריה החרדית', zoneKey: 'הקריה החרדית' },
    { key: 'העיר הוותיקה', zoneKey: 'העיר הוותיקה' },
    { key: 'העיר הישנה', zoneKey: 'העיר הוותיקה' },
    { key: 'מרכז ביג', zoneKey: 'מרכז ביג' },
    { key: 'שער העיר', zoneKey: 'מרכז ביג' },
    { key: 'קניון נעימי', zoneKey: 'קניון נעימי' },
    { key: 'סאן מול', zoneKey: 'קניון נעימי' },
    { key: 'הר טוב', zoneKey: 'הר טוב' },
    { key: 'יער צרעה', zoneKey: 'הר טוב' },
  ];

  for (const item of multiWordZones) {
    const re = new RegExp(`(^|\\s)${item.key}(\\s|$)`, 'i');
    if (re.test(clean)) {
      const zone = BEIT_SHEMESH_ZONES[item.zoneKey];
      if (zone) {
        return { key: item.zoneKey, name: zone.name, point: zone, street: item.key };
      }
    }
  }

  // 2. בדיקה מול מפת הרחובות (הארוכים קודם)
  const sortedStreets = Object.keys(STREET_TO_ZONE_MAP).sort((a, b) => b.length - a.length);
  for (const street of sortedStreets) {
    const re = new RegExp(`(^|\\s)${street}(\\s|$)`, 'i');
    if (re.test(clean)) {
      const zoneKey = STREET_TO_ZONE_MAP[street];
      const point = BEIT_SHEMESH_ZONES[zoneKey];
      if (point) {
        return { key: zoneKey, name: point.name, point, street };
      }
    }
  }

  // 3. בדיקה לפי קיצורים במפת הכינויים
  for (const [alias, zoneKey] of Object.entries(ZONE_ALIAS_MAP)) {
    const re = new RegExp(`(^|\\s)${alias}(\\s|$)`, 'i');
    if (re.test(clean)) {
      const point = BEIT_SHEMESH_ZONES[zoneKey];
      if (point) {
        return { key: zoneKey, name: point.name, point, street: alias };
      }
    }
  }

  return null;
}

// חילוץ מידע ייעודי עבור דרייבוט (קישור תפיסה, פקודת תפיסה, טלפון בוט)
export function extractDriveBotInfo(rawText: string) {
  const text = String(rawText || '');
  const waMatch = text.match(/(?:https?:\/\/)?wa\.me\/(\d+)\?text=([^&\s\n]+)/i);
  const isDriveBot = Boolean(waMatch) || /prod_drivebot|drivebot|דרייבוט/i.test(text);

  let drivebotPhone = '972552732722';
  let drivebotUrl: string | null = null;
  let drivebotCommand: string | null = null;

  if (waMatch) {
    drivebotPhone = waMatch[1] || '972552732722';
    drivebotUrl = `https://wa.me/${drivebotPhone}?text=${waMatch[2]}`;
    try {
      drivebotCommand = decodeURIComponent(waMatch[2].replace(/\+/g, ' '));
    } catch (e) {
      drivebotCommand = waMatch[2].replace(/\+/g, ' ');
    }
  } else {
    const tgMatch = text.match(/(?:https?:\/\/)?t\.me\/prod_drivebot\?start=([^&\s\n]+)/i);
    if (tgMatch) {
      drivebotUrl = `https://t.me/prod_drivebot?start=${tgMatch[1]}`;
    }
  }

  return {
    isDriveBot,
    drivebotPhone,
    drivebotUrl,
    drivebotCommand,
  };
}

export interface ParsedRideRoute {
  originText: string;
  originNeighborhood: string;
  originCoords: { lat: number; lng: number };
  destinationText: string;
  destNeighborhood: string;
  destCoords: { lat: number; lng: number } | null;
  city: string;
  isInternal: boolean;
  price: number | null;
  dispatcherPhone: string | null;
  isDriveBot: boolean;
  drivebotUrl: string | null;
  drivebotCommand: string | null;
  drivebotPhone: string;
  rawText: string;
}

// זיהוי עיר ראשית מתוך הטקסט של הנסיעה
export function detectCityFromText(text: string): { city: string; point: GeoPoint; isExternal: boolean } {
  const clean = text.toLowerCase();

  // בני ברק
  if (
    /(?:^|\s)(?:בני\s*ברק|ב"ב|בב|ז'בוטינסקי|זבוטינסקי|סופרים|דסלר|רשב"ם|אהרונוביץ)(?:\s|$|[0-9ש₪])/i.test(clean) ||
    (clean.includes('בב') && (clean.includes('רע') || clean.includes('סופרים')))
  ) {
    return { city: 'בני ברק', point: MAJOR_CITIES_ZONES['בני ברק'], isExternal: true };
  }

  // ירושלים
  if (
    /(?:^|\s)(?:ירושלים|י-ם|י\s*ם|גאולה|שמגר|ירמיהו|רמות|בית\s*וגן|רוממה|הר\s*נוף|מלכי\s*ישראל|מאה\s*שערים)(?:\s|$|[0-9ש₪])/i.test(clean)
  ) {
    return { city: 'ירושלים', point: MAJOR_CITIES_ZONES['ירושלים'], isExternal: true };
  }

  // מודיעין עילית
  if (/(?:^|\s)(?:מודיעין\s*עילית|קרית\s*ספר|ברכפלד|נאות\s*הפסגה|גרין\s*פארק)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'מודיעין עילית', point: MAJOR_CITIES_ZONES['מודיעין עילית'], isExternal: true };
  }

  // אשדוד
  if (/(?:^|\s)(?:אשדוד|רובע\s*[א-י]|רובע\s*ז|רובע\s*ג)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'אשדוד', point: MAJOR_CITIES_ZONES['אשדוד'], isExternal: true };
  }

  // אלעד
  if (/(?:^|\s)(?:אלעד|בן\s*זכאי|שמעיה|אבטליון)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'אלעד', point: MAJOR_CITIES_ZONES['אלעד'], isExternal: true };
  }

  // מירון
  if (/(?:^|\s)(?:מירון|קבר\s*רשב"?י|מושב\s*מירון)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'מירון', point: MAJOR_CITIES_ZONES['מירון'], isExternal: true };
  }

  // צפת
  if (/(?:^|\s)(?:צפת|העתיקה\s*צפת)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'צפת', point: MAJOR_CITIES_ZONES['צפת'], isExternal: true };
  }

  // טבריה
  if (/(?:^|\s)(?:טבריה)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'טבריה', point: MAJOR_CITIES_ZONES['טבריה'], isExternal: true };
  }

  // ברירת מחדל בית שמש
  return { city: 'בית שמש', point: BEIT_SHEMESH_ZONES['רמה ד'], isExternal: false };
}

// יצירת קישור וואטסאפ אמין ויציב שפועל 100% בכל מכשיר (מחשב/סלולר)
export function getCleanWhatsAppLink(ride: {
  cleanDispatcher?: string;
  senderPhone?: string;
  rawText?: string;
  cleanedText?: string;
  drivebotUrl?: string | null;
}): string {
  if (ride.drivebotUrl) {
    if (!ride.drivebotUrl.startsWith('http://') && !ride.drivebotUrl.startsWith('https://')) {
      return `https://${ride.drivebotUrl}`;
    }
    return ride.drivebotUrl;
  }

  const text = ride.cleanedText || ride.rawText || '';
  const cand = [ride.cleanDispatcher, ride.senderPhone, extractDispatcherPhone(text)];
  let phoneDigits = '';
  for (const c of cand) {
    if (!c) continue;
    const d = String(c).replace(/@.*$/, '').replace(/\D/g, '');
    if (d.length >= 7 && d !== '0') {
      phoneDigits = d;
      break;
    }
  }

  if (phoneDigits) {
    const intl = phoneDigits.startsWith('0')
      ? '972' + phoneDigits.slice(1)
      : phoneDigits.startsWith('972')
      ? phoneDigits
      : '972' + phoneDigits;
    const msg = `שלום, לגבי הנסיעה שפרסמת בקבוצה:\n${text}`;
    return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
  }

  return 'https://web.whatsapp.com';
}

// אלגוריתם לפענוח נתיב הנסיעה (איסוף מול יעד - מותאם לכל עיר בישראל)
export function parseRideRoute(rawText: string, rawSenderPhone?: string): ParsedRideRoute {
  const text = String(rawText || '').trim();

  // 1. מחיר
  let price: number | null = null;
  const priceMatch = text.match(/(?:₪|\b)(\d{2,4})\s*(?:₪|ש"ח|שח|ש\b|מידי|מיידי|\b)/i) ||
                     text.match(/(?:פנימי|שמש|בינעירוני)\s+(\d{2,4})/i);
  if (priceMatch && priceMatch[1]) {
    const p = parseInt(priceMatch[1], 10);
    if (p >= 20 && p <= 1200) {
      price = p;
    }
  }

  // 2. סדרן / טלפון
  const dispatcherPhone = extractDispatcherPhone(text, rawSenderPhone);

  // 3. זיהוי דרייבוט
  const driveBotInfo = extractDriveBotInfo(text);

  // 4. זיהוי עיר
  const cityInfo = detectCityFromText(text);
  const city = cityInfo.city;

  // 5. האם נסיעה פנימית
  const isInternal =
    text.includes('פנימי') ||
    text.includes('שמש פנימי') ||
    text.includes('בתוך העיר') ||
    text.includes('פנימי שמש') ||
    (cityInfo.isExternal && text.includes('פנימי'));

  // ברירת מחדל לאיסוף - תלוי עיר (לא הכל רמה ד'!)
  let defaultOriginCoords = { lat: cityInfo.point.lat, lng: cityInfo.point.lng };
  let defaultOriginName = cityInfo.isExternal ? cityInfo.city : "בית שמש (מרכז)";

  let originText = '';
  let originNeighborhood = defaultOriginName;
  let originCoords = defaultOriginCoords;

  let destinationText = '';
  let destNeighborhood = cityInfo.isExternal ? cityInfo.city : 'יעד בעיר';
  let destCoords: { lat: number; lng: number } | null = null;

  let originCandidate = '';
  let destCandidate = '';

  // 1. בדיקת חץ: A > B או A -> B או A ➔ B
  const arrowMatch = text.match(/(.*?)(?:>|->|➔|>>)(.*)/);
  if (arrowMatch) {
    originCandidate = arrowMatch[1].trim();
    destCandidate = arrowMatch[2].trim();
  } else {
    // 2. בדיקת קיצור נפוץ במוניות: מב לד, מא לג, מג לד
    const shortRouteMatch = text.match(/(?:^|\s)מ([א-ה]|רמ[א-ה]|רמה\s+[א-ה]|קריה|חפציבה|ישנה|ביג|נעימי|אושר\s*עד|הר\s*טוב)\s+ל([א-ה]|רמ[א-ה]|רמה\s+[א-ה]|קריה|חפציבה|ישנה|ביג|נעימי|אושר\s*עד|הר\s*טוב)(?:\s|$|[0-9ש₪])/i);
    if (shortRouteMatch) {
      originCandidate = shortRouteMatch[1].trim();
      destCandidate = shortRouteMatch[2].trim();
    } else {
      // 3. בדיקת "מ... ל..." כללית
      const generalMlMatch = text.match(/(?:^|\s)מ\s*([א-ת0-9'"]+(?:\s+[א-ת0-9'"]+){0,3})\s+ל(?:-|\s*)?([א-ת0-9'"]+(?:\s+[א-ת0-9'"]+){0,3})/i);
      if (generalMlMatch) {
        originCandidate = generalMlMatch[1].trim();
        destCandidate = generalMlMatch[2].trim();
      } else {
        // 4. בדיקת " ל " (למשל: "רמה ג לרמה ד חולדה הנביאה", "זכריה הנביא לד", "נחל משמר לביג", "ז'בוטינסקי רע לסופרים")
        const lMatch = text.match(/(.*?)\s+ל(רמה\s+[א-ה]|רמ[א-ה]|[א-ה]\b|ביג|קריה|חפציבה|ישנה|וותיקה|הר טוב|נעימי|אושר\s*עד|סופרים|[א-ת]+ הנביא|[א-ת]+ הנביאה|נחל [א-ת]+|נהר [א-ת]+)(.*)/i);
        if (lMatch) {
          originCandidate = lMatch[1].trim();
          destCandidate = (lMatch[2] + (lMatch[3] || '')).trim();
        }
      }
    }
  }

  // זיהוי האיסוף (Origin)
  if (originCandidate) {
    const originFound = detectNeighborhood(originCandidate);
    if (originFound) {
      originNeighborhood = originFound.name;
      originCoords = { lat: originFound.point.lat, lng: originFound.point.lng };
      originText = originFound.street || originCandidate.replace(/[*\-_#]/g, '').trim();
    } else {
      originText = originCandidate.replace(/[*\-_#]/g, '').trim();
      if (cityInfo.isExternal) {
        originNeighborhood = `${cityInfo.city} (${originText})`;
      }
    }
  }

  // זיהוי היעד (Destination)
  if (destCandidate) {
    const destFound = detectNeighborhood(destCandidate);
    if (destFound) {
      destNeighborhood = destFound.name;
      destCoords = { lat: destFound.point.lat, lng: destFound.point.lng };
      destinationText = destFound.street || destCandidate.replace(/[*\-_#]/g, '').trim();
    } else {
      destinationText = destCandidate.replace(/[*\-_#]/g, '').trim();
      if (cityInfo.isExternal) {
        destNeighborhood = `${cityInfo.city} (${destinationText})`;
      }
    }
  }

  // אם לא נמצא חילוק מפורש, נזהה מוקדים מתוך כלל הטקסט
  if (!originText && !destinationText) {
    const detectedAll = detectNeighborhood(text);
    if (detectedAll) {
      originNeighborhood = detectedAll.name;
      originCoords = { lat: detectedAll.point.lat, lng: detectedAll.point.lng };
      originText = detectedAll.street || detectedAll.name;
      destinationText = 'יעד בעיר';
    } else {
      originText = cityInfo.isExternal ? `איסוף ב${cityInfo.city}` : 'איסוף בעיר';
      destinationText = cityInfo.isExternal ? `יעד ב${cityInfo.city}` : 'יעד בעיר';
    }
  } else if (!originText) {
    originText = originNeighborhood;
  } else if (!destinationText) {
    destinationText = destNeighborhood;
  }

  // ניקוי ביטויי ספאם/מחיר משם המוקד
  originText = originText.replace(/(?:פנימי|שמש|בינעירוני|\b\d{2,4}\s*(?:ש|שח|ש"ח|₪)?\b|זמן|מיידי|מידי)/gi, '').trim();
  destinationText = destinationText.replace(/(?:פנימי|שמש|בינעירוני|\b\d{2,4}\s*(?:ש|שח|ש"ח|₪)?\b|זמן|מיידי|מידי)/gi, '').trim();

  return {
    originText: originText || originNeighborhood,
    originNeighborhood,
    originCoords,
    destinationText: destinationText || 'יעד בעיר',
    destNeighborhood,
    destCoords,
    city,
    isInternal: isInternal || (originNeighborhood.includes('בית שמש') && destNeighborhood.includes('בית שמש')),
    price,
    dispatcherPhone,
    isDriveBot: driveBotInfo.isDriveBot,
    drivebotUrl: driveBotInfo.drivebotUrl,
    drivebotCommand: driveBotInfo.drivebotCommand,
    drivebotPhone: driveBotInfo.drivebotPhone,
    rawText: text,
  };
}

// חישוב מרחק אווירי ומעשי בקילומטרים (נוסחת Haversine עם פקטור פיתולי כביש x1.25)
export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): { straightKm: number; roadKm: number; driveTimeMin: number } {
  const R = 6371; // רדיוס כדור הארץ בק"מ
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = R * c;

  // פקטור עקלתון לכבישים עירוניים ובינעירוניים
  const roadKm = Math.round(straightKm * 1.25 * 10) / 10;

  // הערכת זמן נסיעה (בממוצע 30-35 קמ"ש בעיר, מינימום 2 דקות)
  const driveTimeMin = Math.max(2, Math.round((roadKm / 32) * 60));

  return {
    straightKm: Math.round(straightKm * 10) / 10,
    roadKm,
    driveTimeMin,
  };
}

// יצירת קישור Waze ישיר לניווט
export function generateWazeUrl(destinationName: string, city: string = 'בית שמש', coords?: { lat: number; lng: number }): string {
  if (coords && coords.lat && coords.lng) {
    return `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`;
  }
  const query = encodeURIComponent(`${destinationName} ${city}`);
  return `https://waze.com/ul?q=${query}&navigate=yes`;
}

export function getProximityBadge(distanceKm: number): {
  label: string;
  colorClass: string;
  badgeBg: string;
  isClose: boolean;
} {
  if (distanceKm <= 1.8) {
    return {
      label: 'קרוב מאוד (מיידי)',
      colorClass: 'text-emerald-400',
      badgeBg: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
      isClose: true,
    };
  }
  if (distanceKm <= 3.8) {
    return {
      label: 'מרחק בינוני',
      colorClass: 'text-amber-400',
      badgeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
      isClose: false,
    };
  }
  if (distanceKm > 15) {
    return {
      label: 'עיר אחרת / בינעירוני',
      colorClass: 'text-sky-400',
      badgeBg: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
      isClose: false,
    };
  }
  return {
    label: 'רחוק יחסית',
    colorClass: 'text-slate-400',
    badgeBg: 'bg-slate-800 border-slate-700 text-slate-300',
    isClose: false,
  };
}
