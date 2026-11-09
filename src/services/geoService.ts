// geoService.ts - שירות מיפוי רחובות, שכונות וחישוב מרחקי נסיעה ארצי בזמן אמת לכל ערי ישראל

export interface GeoPoint {
  lat: number;
  lng: number;
  name: string;
  city: string;
  zone?: string;
}

// =======================================================================
// 1. מאגר ערים ושכונות מרכזיות בישראל (קואורדינטות GPS מדויקות)
// =======================================================================

// בית שמש
export const BEIT_SHEMESH_ZONES: Record<string, GeoPoint> = {
  'רמה ד': { lat: 31.7052, lng: 34.9904, name: "רמת בית שמש ד'", city: 'בית שמש', zone: 'דרום' },
  'רמה ג': { lat: 31.7185, lng: 34.9982, name: "רמת בית שמש ג'", city: 'בית שמש', zone: 'מזרח' },
  'רמה א': { lat: 31.7331, lng: 34.9926, name: "רמת בית שמש א'", city: 'בית שמש', zone: 'מרכז-דרום' },
  'רמה ב': { lat: 31.7258, lng: 34.9854, name: "רמת בית שמש ב'", city: 'בית שמש', zone: 'מרכז' },
  'רמה ה': { lat: 31.7224, lng: 35.0081, name: "נווה שמיר (רמה ה')", city: 'בית שמש', zone: 'דרום-מזרח' },
  'רמת אברהם': { lat: 31.7382, lng: 34.9751, name: 'רמת אברהם', city: 'בית שמש', zone: 'מערב' },
  'הקריה החרדית': { lat: 31.7456, lng: 34.9785, name: 'הקריה / חפציבה', city: 'בית שמש', zone: 'מרכז-מערב' },
  'העיר הוותיקה': { lat: 31.7554, lng: 34.9951, name: 'העיר הוותיקה (הישנה)', city: 'בית שמש', zone: 'צפון' },
  'מרכז ביג': { lat: 31.7588, lng: 34.9802, name: 'מרכז ביג / שער העיר', city: 'בית שמש', zone: 'צפון-מערב' },
  'קניון נעימי': { lat: 31.7521, lng: 34.9856, name: 'קניון נעימי / סאן מול', city: 'בית שמש', zone: 'צפון' },
  'הר טוב': { lat: 31.7654, lng: 34.9988, name: 'אזור תעשייה הר טוב / צרעה', city: 'בית שמש', zone: 'צפון-מזרח' },
};

// ירושלים
export const JERUSALEM_ZONES: Record<string, GeoPoint> = {
  'בית וגן': { lat: 31.7702, lng: 35.1834, name: 'בית וגן', city: 'ירושלים', zone: 'מערב' },
  'הר נוף': { lat: 31.7891, lng: 35.1764, name: 'הר נוף', city: 'ירושלים', zone: 'מערב' },
  'גאולה': { lat: 31.7895, lng: 35.2155, name: 'גאולה', city: 'ירושלים', zone: 'מרכז-צפון' },
  'רוממה': { lat: 31.7925, lng: 35.2032, name: 'רוממה / שמגר', city: 'ירושלים', zone: 'כניסה לעיר' },
  'רמות': { lat: 31.8155, lng: 35.1950, name: 'רמות', city: 'ירושלים', zone: 'צפון' },
  'גבעת שאול': { lat: 31.7910, lng: 35.1850, name: 'גבעת שאול', city: 'ירושלים', zone: 'מערב' },
  'בית הכרם': { lat: 31.7785, lng: 35.1885, name: 'בית הכרם', city: 'ירושלים', zone: 'מערב' },
  'מאה שערים': { lat: 31.7865, lng: 35.2225, name: 'מאה שערים', city: 'ירושלים', zone: 'מרכז' },
  'סנהדריה': { lat: 31.7985, lng: 35.2210, name: 'סנהדריה', city: 'ירושלים', zone: 'צפון' },
  'עין כרם': { lat: 31.7651, lng: 35.1582, name: 'עין כרם / הדסה', city: 'ירושלים', zone: 'דרום-מערב' },
  'הגן הבוטני': { lat: 31.7675, lng: 35.2014, name: 'הגן הבוטני / ניות', city: 'ירושלים', zone: 'דרום-מרכז' },
  'תלפיות': { lat: 31.7485, lng: 35.2150, name: 'תלפיות', city: 'ירושלים', zone: 'דרום' },
  'מלחה': { lat: 31.7515, lng: 35.1905, name: 'מלחה / קניון מלחה', city: 'ירושלים', zone: 'דרום' },
  'פסגת זאב': { lat: 31.8315, lng: 35.2415, name: 'פסגת זאב', city: 'ירושלים', zone: 'צפון-מזרח' },
  'נווה יעקב': { lat: 31.8455, lng: 35.2450, name: 'נווה יעקב', city: 'ירושלים', zone: 'צפון' },
  'קרית יובל': { lat: 31.7615, lng: 35.1750, name: 'קרית יובל', city: 'ירושלים', zone: 'דרום-מערב' },
  'קרית משה': { lat: 31.7865, lng: 35.1950, name: 'קרית משה', city: 'ירושלים', zone: 'מערב' },
  'מרכז העיר': { lat: 31.7820, lng: 35.2185, name: 'מרכז העיר / יפו', city: 'ירושלים', zone: 'מרכז' },
  'התחנה המרכזית': { lat: 31.7890, lng: 35.2005, name: 'תחנה מרכזית ירושלים', city: 'ירושלים', zone: 'כניסה לעיר' },
  'גילה': { lat: 31.7285, lng: 35.1850, name: 'גילה', city: 'ירושלים', zone: 'דרום' },
  'ארמון הנציב': { lat: 31.7480, lng: 35.2350, name: 'ארמון הנציב', city: 'ירושלים', zone: 'דרום-מזרח' },
};

// בני ברק
export const BNEI_BRAK_ZONES: Record<string, GeoPoint> = {
  'רבי עקיבא': { lat: 32.0864, lng: 34.8341, name: 'מרכז רבי עקיבא', city: 'בני ברק', zone: 'מרכז' },
  'חזון איש': { lat: 32.0830, lng: 34.8315, name: 'חזון איש / נחמיה', city: 'בני ברק', zone: 'דרום' },
  'סוקולוב': { lat: 32.0890, lng: 34.8360, name: 'סוקולוב', city: 'בני ברק', zone: 'צפון-מרכז' },
  'השומר': { lat: 32.0850, lng: 34.8465, name: 'אהרונוביץ / השומר', city: 'בני ברק', zone: 'מזרח' },
  'עזרא': { lat: 32.0805, lng: 34.8365, name: 'עזרא / נחמיה', city: 'בני ברק', zone: 'דרום' },
  'דסלר': { lat: 32.0815, lng: 34.8420, name: 'דסלר / רמת אהרן', city: 'בני ברק', zone: 'דרום-מזרח' },
  'סופרים': { lat: 32.0790, lng: 34.8320, name: 'סופרים / חזון איש', city: 'בני ברק', zone: 'דרום' },
  'שיכון ה': { lat: 32.0910, lng: 34.8390, name: 'שיכון ה׳', city: 'בני ברק', zone: 'צפון' },
  'פרדס כץ': { lat: 32.0945, lng: 34.8350, name: 'פרדס כץ', city: 'בני ברק', zone: 'צפון' },
  'רמת אלחנן': { lat: 32.0895, lng: 34.8510, name: 'רמת אלחנן', city: 'בני ברק', zone: 'מזרח' },
  'קרית הרצוג': { lat: 32.0965, lng: 34.8420, name: 'קרית הרצוג', city: 'בני ברק', zone: 'צפון-מזרח' },
  'ויזניץ': { lat: 32.0810, lng: 34.8385, name: 'קרית ויזניץ', city: 'בני ברק', zone: 'דרום' },
};

// מודיעין עילית (קרית ספר)
export const MODIIN_ILLIT_ZONES: Record<string, GeoPoint> = {
  'קרית ספר': { lat: 31.9317, lng: 35.0417, name: 'קרית ספר (מרכז)', city: 'מודיעין עילית' },
  'ברכפלד': { lat: 31.9420, lng: 35.0380, name: 'ברכפלד (אחוזת ברכפלד)', city: 'מודיעין עילית' },
  'נאות הפסגה': { lat: 31.9360, lng: 35.0490, name: 'נאות הפסגה', city: 'מודיעין עילית' },
  'גרין פארק': { lat: 31.9280, lng: 35.0460, name: 'גרין פארק', city: 'מודיעין עילית' },
  'חפציבה קס': { lat: 31.9340, lng: 35.0350, name: 'חפציבה (מודיעין עילית)', city: 'מודיעין עילית' },
};

// ביתר עילית
export const BEITAR_ILLIT_ZONES: Record<string, GeoPoint> = {
  'גבעה A': { lat: 31.6980, lng: 35.1140, name: 'גבעה A (גבעה א\')', city: 'ביתר עילית' },
  'גבעה B': { lat: 31.7050, lng: 35.1220, name: 'גבעה B (גבעה ב\')', city: 'ביתר עילית' },
  'גבעה C': { lat: 31.7100, lng: 35.1280, name: 'גבעה C (התמרים)', city: 'ביתר עילית' },
};

// אשדוד
export const ASHDOD_ZONES: Record<string, GeoPoint> = {
  'רובע ז': { lat: 31.8020, lng: 34.6650, name: 'רובע ז\' (החרדי)', city: 'אשדוד' },
  'רובע ג': { lat: 31.8060, lng: 34.6590, name: 'רובע ג\'', city: 'אשדוד' },
  'הסיטי': { lat: 31.7920, lng: 34.6460, name: 'הסיטי / התחנה המרכזית', city: 'אשדוד' },
  'רובע ט': { lat: 31.7970, lng: 34.6620, name: 'רובע ט\'', city: 'אשדוד' },
  'סטאר סנטר': { lat: 31.8120, lng: 34.6540, name: 'סטאר סנטר / אזור תעשייה', city: 'אשדוד' },
};

// תל אביב וגוש דן
export const TEL_AVIV_ZONES: Record<string, GeoPoint> = {
  'מרכז תל אביב': { lat: 32.0750, lng: 34.7750, name: 'דיזנגוף / סנטר', city: 'תל אביב' },
  'עזריאלי': { lat: 32.0745, lng: 34.7915, name: 'עזריאלי / רכבת השלום', city: 'תל אביב' },
  'רכבת מרכז': { lat: 32.0835, lng: 34.7980, name: 'רכבת מרכז (סבידור) / ארלוזורוב', city: 'תל אביב' },
  'יפו': { lat: 32.0520, lng: 34.7550, name: 'יפו / שדרות ירושלים', city: 'תל אביב' },
  'רמת גן': { lat: 32.0820, lng: 34.8140, name: 'רמת גן (בורסה)', city: 'רמת גן' },
  'גבעתיים': { lat: 32.0720, lng: 34.8100, name: 'גבעתיים', city: 'גבעתיים' },
};

// ערים כלליות
export const MAJOR_CITIES_ZONES: Record<string, GeoPoint> = {
  'בית שמש': { lat: 31.7456, lng: 34.9854, name: 'בית שמש', city: 'בית שמש' },
  'ירושלים': { lat: 31.7850, lng: 35.2100, name: 'ירושלים', city: 'ירושלים' },
  'בני ברק': { lat: 32.0845, lng: 34.8341, name: 'בני ברק', city: 'בני ברק' },
  'מודיעין עילית': { lat: 31.9317, lng: 35.0417, name: 'מודיעין עילית (קרית ספר)', city: 'מודיעין עילית' },
  'ביתר עילית': { lat: 31.7010, lng: 35.1180, name: 'ביתר עילית', city: 'ביתר עילית' },
  'אשדוד': { lat: 31.7950, lng: 34.6450, name: 'אשדוד', city: 'אשדוד' },
  'אלעד': { lat: 32.0519, lng: 34.9511, name: 'אלעד', city: 'אלעד' },
  'פתח תקווה': { lat: 32.0840, lng: 34.8878, name: 'פתח תקווה', city: 'פתח תקווה' },
  'תל אביב': { lat: 32.0853, lng: 34.7818, name: 'תל אביב', city: 'תל אביב' },
  'נתניה': { lat: 32.3215, lng: 34.8532, name: 'נתניה (קרית צאנז)', city: 'נתניה' },
  'צפת': { lat: 32.9658, lng: 35.4963, name: 'צפת', city: 'צפת' },
  'מירון': { lat: 32.9822, lng: 35.4397, name: 'מירון (קבר רשב"י)', city: 'מירון' },
  'טבריה': { lat: 32.7922, lng: 35.5312, name: 'טבריה', city: 'טבריה' },
  'חיפה': { lat: 32.7940, lng: 34.9896, name: 'חיפה', city: 'חיפה' },
  'רחובות': { lat: 31.8928, lng: 34.8113, name: 'רחובות', city: 'רחובות' },
  'ראשון לציון': { lat: 31.9730, lng: 34.7925, name: 'ראשון לציון', city: 'ראשון לציון' },
  'נתב"ג': { lat: 32.0005, lng: 34.8707, name: 'נתב"ג (טרמינל 3)', city: 'נתב"ג' },
};

// מפה כללית של כל השכונות והאזורים לחיפוש מהיר
export const ALL_ZONES_COMBINED: Record<string, GeoPoint> = {
  ...BEIT_SHEMESH_ZONES,
  ...JERUSALEM_ZONES,
  ...BNEI_BRAK_ZONES,
  ...MODIIN_ILLIT_ZONES,
  ...BEITAR_ILLIT_ZONES,
  ...ASHDOD_ZONES,
  ...TEL_AVIV_ZONES,
  ...MAJOR_CITIES_ZONES,
};

// =======================================================================
// 2. מיפוי רחובות, מוקדים וכינויים לכל ערי ישראל
// =======================================================================

export interface StreetMapping {
  zone: string;
  city: string;
  coords: { lat: number; lng: number };
}

export const STREET_TO_LOCATION_MAP: Record<string, StreetMapping> = {
  // --- ירושלים ---
  'בית וגן': { zone: 'בית וגן', city: 'ירושלים', coords: { lat: 31.7702, lng: 35.1834 } },
  'הר נוף': { zone: 'הר נוף', city: 'ירושלים', coords: { lat: 31.7891, lng: 35.1764 } },
  'הגן הבוטני': { zone: 'הגן הבוטני', city: 'ירושלים', coords: { lat: 31.7675, lng: 35.2014 } },
  'גן בוטני': { zone: 'הגן הבוטני', city: 'ירושלים', coords: { lat: 31.7675, lng: 35.2014 } },
  'עין כרם': { zone: 'עין כרם', city: 'ירושלים', coords: { lat: 31.7651, lng: 35.1582 } },
  'עיכ': { zone: 'עין כרם', city: 'ירושלים', coords: { lat: 31.7651, lng: 35.1582 } },
  'גאולה': { zone: 'גאולה', city: 'ירושלים', coords: { lat: 31.7895, lng: 35.2155 } },
  'רוממה': { zone: 'רוממה', city: 'ירושלים', coords: { lat: 31.7925, lng: 35.2032 } },
  'שמגר': { zone: 'רוממה', city: 'ירושלים', coords: { lat: 31.7915, lng: 35.2065 } },
  'ירמיהו': { zone: 'רוממה', city: 'ירושלים', coords: { lat: 31.7905, lng: 35.2110 } },
  'רמות': { zone: 'רמות', city: 'ירושלים', coords: { lat: 31.8155, lng: 35.1950 } },
  'רמות א': { zone: 'רמות', city: 'ירושלים', coords: { lat: 31.8155, lng: 35.1950 } },
  'רמות ב': { zone: 'רמות', city: 'ירושלים', coords: { lat: 31.8180, lng: 35.1980 } },
  'רמות ג': { zone: 'רמות', city: 'ירושלים', coords: { lat: 31.8210, lng: 35.1930 } },
  'רמות ד': { zone: 'רמות', city: 'ירושלים', coords: { lat: 31.8240, lng: 35.1900 } },
  'גבעת שאול': { zone: 'גבעת שאול', city: 'ירושלים', coords: { lat: 31.7910, lng: 35.1850 } },
  'בית הכרם': { zone: 'בית הכרם', city: 'ירושלים', coords: { lat: 31.7785, lng: 35.1885 } },
  'מאה שערים': { zone: 'מאה שערים', city: 'ירושלים', coords: { lat: 31.7865, lng: 35.2225 } },
  'סנהדריה': { zone: 'סנהדריה', city: 'ירושלים', coords: { lat: 31.7985, lng: 35.2210 } },
  'תלפיות': { zone: 'תלפיות', city: 'ירושלים', coords: { lat: 31.7485, lng: 35.2150 } },
  'מלחה': { zone: 'מלחה', city: 'ירושלים', coords: { lat: 31.7515, lng: 35.1905 } },
  'קניון מלחה': { zone: 'מלחה', city: 'ירושלים', coords: { lat: 31.7515, lng: 35.1905 } },
  'פסגת זאב': { zone: 'פסגת זאב', city: 'ירושלים', coords: { lat: 31.8315, lng: 35.2415 } },
  'נווה יעקב': { zone: 'נווה יעקב', city: 'ירושלים', coords: { lat: 31.8455, lng: 35.2450 } },
  'קרית יובל': { zone: 'קרית יובל', city: 'ירושלים', coords: { lat: 31.7615, lng: 35.1750 } },
  'קרית משה': { zone: 'קרית משה', city: 'ירושלים', coords: { lat: 31.7865, lng: 35.1950 } },
  'התחנה המרכזית': { zone: 'התחנה המרכזית', city: 'ירושלים', coords: { lat: 31.7890, lng: 35.2005 } },
  'תחנה מרכזית ירושלים': { zone: 'התחנה המרכזית', city: 'ירושלים', coords: { lat: 31.7890, lng: 35.2005 } },
  'הדסה עין כרם': { zone: 'עין כרם', city: 'ירושלים', coords: { lat: 31.7630, lng: 35.1480 } },
  'הדסה הר הצופים': { zone: 'הר הצופים', city: 'ירושלים', coords: { lat: 31.7960, lng: 35.2425 } },
  'בר אילן': { zone: 'סנהדריה', city: 'ירושלים', coords: { lat: 31.7940, lng: 35.2165 } },
  'שמואל הנביא': { zone: 'סנהדריה', city: 'ירושלים', coords: { lat: 31.7925, lng: 35.2205 } },
  'שרי ישראל': { zone: 'רוממה', city: 'ירושלים', coords: { lat: 31.7880, lng: 35.2080 } },
  'מלכי ישראל': { zone: 'גאולה', city: 'ירושלים', coords: { lat: 31.7890, lng: 35.2160 } },
  'הכותל': { zone: 'העיר העתיקה', city: 'ירושלים', coords: { lat: 31.7767, lng: 35.2345 } },

  // --- בני ברק ---
  'רבי עקיבא': { zone: 'רבי עקיבא', city: 'בני ברק', coords: { lat: 32.0864, lng: 34.8341 } },
  'חזון איש': { zone: 'חזון איש', city: 'בני ברק', coords: { lat: 32.0830, lng: 34.8315 } },
  'סוקולוב': { zone: 'סוקולוב', city: 'בני ברק', coords: { lat: 32.0890, lng: 34.8360 } },
  'אהרונוביץ': { zone: 'השומר', city: 'בני ברק', coords: { lat: 32.0880, lng: 34.8450 } },
  'השומר': { zone: 'השומר', city: 'בני ברק', coords: { lat: 32.0850, lng: 34.8465 } },
  'עזרא': { zone: 'עזרא', city: 'בני ברק', coords: { lat: 32.0805, lng: 34.8365 } },
  'דסלר': { zone: 'דסלר', city: 'בני ברק', coords: { lat: 32.0815, lng: 34.8420 } },
  'סופרים': { zone: 'סופרים', city: 'בני ברק', coords: { lat: 32.0790, lng: 34.8320 } },
  'שיכון ה': { zone: 'שיכון ה', city: 'בני ברק', coords: { lat: 32.0910, lng: 34.8390 } },
  'פרדס כץ': { zone: 'פרדס כץ', city: 'בני ברק', coords: { lat: 32.0945, lng: 34.8350 } },
  'רמת אלחנן': { zone: 'רמת אלחנן', city: 'בני ברק', coords: { lat: 32.0895, lng: 34.8510 } },
  'קרית הרצוג': { zone: 'קרית הרצוג', city: 'בני ברק', coords: { lat: 32.0965, lng: 34.8420 } },
  'ויזניץ': { zone: 'ויזניץ', city: 'בני ברק', coords: { lat: 32.0810, lng: 34.8385 } },

  // --- בית שמש (כל השכונות והרחובות) ---
  'זכריה הנביא': { zone: 'רמה ג', city: 'בית שמש', coords: { lat: 31.7185, lng: 34.9982 } },
  'חגי הנביא': { zone: 'רמה ג', city: 'בית שמש', coords: { lat: 31.7190, lng: 34.9970 } },
  'צפניה הנביא': { zone: 'רמה ג', city: 'בית שמש', coords: { lat: 31.7170, lng: 34.9960 } },
  'חבקוק הנביא': { zone: 'רמה ג', city: 'בית שמש', coords: { lat: 31.7160, lng: 34.9950 } },
  'חולדה הנביאה': { zone: 'רמה ג', city: 'בית שמש', coords: { lat: 31.7205, lng: 34.9995 } },
  'מרים הנביאה': { zone: 'רמה ג', city: 'בית שמש', coords: { lat: 31.7175, lng: 34.9985 } },
  'שדרות האמוראים': { zone: 'רמה ד', city: 'בית שמש', coords: { lat: 31.7052, lng: 34.9904 } },
  'האמוראים': { zone: 'רמה ד', city: 'בית שמש', coords: { lat: 31.7052, lng: 34.9904 } },
  'אמוראים': { zone: 'רמה ד', city: 'בית שמש', coords: { lat: 31.7052, lng: 34.9904 } },
  'רב חנן': { zone: 'רמה ד', city: 'בית שמש', coords: { lat: 31.7060, lng: 34.9890 } },
  'אביי': { zone: 'רמה ד', city: 'בית שמש', coords: { lat: 31.7040, lng: 34.9920 } },
  'רבא': { zone: 'רמה ד', city: 'בית שמש', coords: { lat: 31.7035, lng: 34.9910 } },
  'רב מרי': { zone: 'רמה ד', city: 'בית שמש', coords: { lat: 31.7070, lng: 34.9880 } },
  'תלמוד בבלי': { zone: 'רמה ד', city: 'בית שמש', coords: { lat: 31.7080, lng: 34.9870 } },
  'נחל קישון': { zone: 'רמה א', city: 'בית שמש', coords: { lat: 31.7331, lng: 34.9926 } },
  'הקישון': { zone: 'רמה א', city: 'בית שמש', coords: { lat: 31.7331, lng: 34.9926 } },
  'נחל דולב': { zone: 'רמה א', city: 'בית שמש', coords: { lat: 31.7350, lng: 34.9910 } },
  'הדולב': { zone: 'רמה א', city: 'בית שמש', coords: { lat: 31.7350, lng: 34.9910 } },
  'נחל משמר': { zone: 'רמה א', city: 'בית שמש', coords: { lat: 31.7310, lng: 34.9940 } },
  'משמר': { zone: 'רמה א', city: 'בית שמש', coords: { lat: 31.7310, lng: 34.9940 } },
  'נחל צאלים': { zone: 'רמה א', city: 'בית שמש', coords: { lat: 31.7340, lng: 34.9950 } },
  'נחל שורק': { zone: 'רמה א', city: 'בית שמש', coords: { lat: 31.7320, lng: 34.9900 } },
  'נהר הירדן': { zone: 'רמה ב', city: 'בית שמש', coords: { lat: 31.7258, lng: 34.9854 } },
  'הירדן': { zone: 'רמה ב', city: 'בית שמש', coords: { lat: 31.7258, lng: 34.9854 } },
  'רבי יהודה הנשיא': { zone: 'רמה ב', city: 'בית שמש', coords: { lat: 31.7270, lng: 34.9840 } },
  'בן איש חי': { zone: 'רמה ב', city: 'בית שמש', coords: { lat: 31.7240, lng: 34.9860 } },
  'חפציבה': { zone: 'הקריה החרדית', city: 'בית שמש', coords: { lat: 31.7456, lng: 34.9785 } },
  'הקריה': { zone: 'הקריה החרדית', city: 'בית שמש', coords: { lat: 31.7456, lng: 34.9785 } },
  'רמת אברהם': { zone: 'רמת אברהם', city: 'בית שמש', coords: { lat: 31.7382, lng: 34.9751 } },
  'נווה שמיר': { zone: 'רמה ה', city: 'בית שמש', coords: { lat: 31.7224, lng: 35.0081 } },
  'מרכז ביג': { zone: 'מרכז ביג', city: 'בית שמש', coords: { lat: 31.7588, lng: 34.9802 } },
  'ביג': { zone: 'מרכז ביג', city: 'בית שמש', coords: { lat: 31.7588, lng: 34.9802 } },
  'אושר עד': { zone: 'מרכז ביג', city: 'בית שמש', coords: { lat: 31.7588, lng: 34.9802 } },
  'נעימי': { zone: 'קניון נעימי', city: 'בית שמש', coords: { lat: 31.7521, lng: 34.9856 } },
  'קניון נעימי': { zone: 'קניון נעימי', city: 'בית שמש', coords: { lat: 31.7521, lng: 34.9856 } },
  'הר טוב': { zone: 'הר טוב', city: 'בית שמש', coords: { lat: 31.7654, lng: 34.9988 } },
  'הרטוב': { zone: 'הר טוב', city: 'בית שמש', coords: { lat: 31.7654, lng: 34.9988 } },
  'יער צרעה': { zone: 'הר טוב', city: 'בית שמש', coords: { lat: 31.7654, lng: 34.9988 } },
  'העיר הוותיקה': { zone: 'העיר הוותיקה', city: 'בית שמש', coords: { lat: 31.7554, lng: 34.9951 } },
  'וותיקה': { zone: 'העיר הוותיקה', city: 'בית שמש', coords: { lat: 31.7554, lng: 34.9951 } },
  'ברכיה': { zone: 'העיר הוותיקה', city: 'בית שמש', coords: { lat: 31.7540, lng: 34.9960 } },
  'ברוש': { zone: 'העיר הוותיקה', city: 'בית שמש', coords: { lat: 31.7530, lng: 34.9940 } },
  'עלית הנוער': { zone: 'העיר הוותיקה', city: 'בית שמש', coords: { lat: 31.7520, lng: 34.9930 } },

  // --- מודיעין עילית ---
  'קרית ספר': { zone: 'קרית ספר', city: 'מודיעין עילית', coords: { lat: 31.9317, lng: 35.0417 } },
  'ברכפלד': { zone: 'ברכפלד', city: 'מודיעין עילית', coords: { lat: 31.9420, lng: 35.0380 } },
  'נאות הפסגה': { zone: 'נאות הפסגה', city: 'מודיעין עילית', coords: { lat: 31.9360, lng: 35.0490 } },
  'גרין פארק': { zone: 'גרין פארק', city: 'מודיעין עילית', coords: { lat: 31.9280, lng: 35.0460 } },

  // --- ביתר עילית ---
  'גבעה a': { zone: 'גבעה A', city: 'ביתר עילית', coords: { lat: 31.6980, lng: 35.1140 } },
  'גבעה b': { zone: 'גבעה B', city: 'ביתר עילית', coords: { lat: 31.7050, lng: 35.1220 } },
  'גבעה c': { zone: 'גבעה C', city: 'ביתר עילית', coords: { lat: 31.7100, lng: 35.1280 } },
  'גבעה א': { zone: 'גבעה A', city: 'ביתר עילית', coords: { lat: 31.6980, lng: 35.1140 } },
  'גבעה ב': { zone: 'גבעה B', city: 'ביתר עילית', coords: { lat: 31.7050, lng: 35.1220 } },

  // --- אשדוד ---
  'רובע ז': { zone: 'רובע ז', city: 'אשדוד', coords: { lat: 31.8020, lng: 34.6650 } },
  'רובע ג': { zone: 'רובע ג', city: 'אשדוד', coords: { lat: 31.8060, lng: 34.6590 } },
  'הסיטי אשדוד': { zone: 'הסיטי', city: 'אשדוד', coords: { lat: 31.7920, lng: 34.6460 } },

  // --- מירון וצפת ---
  'קבר רשבי': { zone: 'מירון', city: 'מירון', coords: { lat: 32.9822, lng: 35.4397 } },
  'מושב מירון': { zone: 'מירון', city: 'מירון', coords: { lat: 32.9822, lng: 35.4397 } },
  'העיר העתיקה צפת': { zone: 'צפת', city: 'צפת', coords: { lat: 32.9658, lng: 35.4963 } },
};

// =======================================================================
// 3. ניקוי ופילוח טקסט הודעות וואטסאפ (ניקוי כוכביות, הדגשות, אימוג'ים)
// =======================================================================

export function cleanTextForGeo(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/[*_~`"'\-]/g, ' ')
    .replace(/[֑-ׇ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// חילוץ טלפון סדרן מתוך תוכן ההודעה או השולח
export function extractDispatcherPhone(rawText: string, rawSenderPhone?: string): string | null {
  const text = String(rawText || '');

  // 1. חילוץ מקישורי wa.me
  const waMatch = text.match(/(?:https?:\/\/)?wa\.me\/(\d+)/i);
  if (waMatch && waMatch[1]) {
    const digits = waMatch[1];
    if (digits.startsWith('972')) {
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

  if (rawSenderPhone && rawSenderPhone.length >= 7 && rawSenderPhone !== '0') {
    return rawSenderPhone.replace(/@.*$/, '').replace(/\D/g, '');
  }

  return null;
}

// חילוץ מידע דרייבוט
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

// =======================================================================
// 4. זיהוי עיר ושכונה חכם מכל טקסט נסיעה בישראל
// =======================================================================

export function detectCityFromText(text: string): { city: string; point: GeoPoint; isExternal: boolean } {
  const clean = cleanTextForGeo(text).toLowerCase();

  // ירושלים (כולל ים, י-ם, ירושלים וכל השכונות הירושלמיות)
  if (
    /(?:^|\s)(?:ירושלים|ים|י\s*ם|ירוש|גאולה|שמגר|ירמיהו|רמות|בית\s*וגן|רוממה|הר\s*נוף|מלכי\s*ישראל|מאה\s*שערים|עין\s*כרם|עיכ|הגן\s*הבוטני|סנהדריה|תלפיות|פסגת\s*זאב|נווה\s*יעקב|מלחה|הדסה|קרית\s*משה|קרית\s*יובל)(?:\s|$|[0-9ש₪])/i.test(clean) ||
    clean.includes('בית וגן') ||
    clean.includes('הר נוף') ||
    clean.includes('הגן הבוטני') ||
    clean.includes('ים פנימי') ||
    clean.includes('פנימי ים')
  ) {
    return { city: 'ירושלים', point: MAJOR_CITIES_ZONES['ירושלים'], isExternal: true };
  }

  // בני ברק
  if (
    /(?:^|\s)(?:בני\s*ברק|ב"ב|בב|ז'בוטינסקי|זבוטינסקי|סופרים|דסלר|רשב"ם|אהרונוביץ|רבי\s*עקיבא|חזון\s*איש|סוקולוב|פרדס\s*כץ|רמת\s*אלחנן|ויזניץ)(?:\s|$|[0-9ש₪])/i.test(clean) ||
    (clean.includes('בב') && (clean.includes('רע') || clean.includes('סופרים') || clean.includes('70') || clean.includes('50')))
  ) {
    return { city: 'בני ברק', point: MAJOR_CITIES_ZONES['בני ברק'], isExternal: true };
  }

  // מודיעין עילית
  if (/(?:^|\s)(?:מודיעין\s*עילית|קרית\s*ספר|קס|ק"ס|ברכפלד|נאות\s*הפסגה|גרין\s*פארק)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'מודיעין עילית', point: MAJOR_CITIES_ZONES['מודיעין עילית'], isExternal: true };
  }

  // ביתר עילית
  if (/(?:^|\s)(?:ביתר|ביתר\s*עילית|ביתר\s*עלית|גבעה\s*[a-cא-ג])(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'ביתר עילית', point: MAJOR_CITIES_ZONES['ביתר עילית'], isExternal: true };
  }

  // אשדוד
  if (/(?:^|\s)(?:אשדוד|רובע\s*[א-יזגט]|סטאר\s*סנטר)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'אשדוד', point: MAJOR_CITIES_ZONES['אשדוד'], isExternal: true };
  }

  // אלעד
  if (/(?:^|\s)(?:אלעד|בן\s*זכאי|שמעיה|אבטליון)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'אלעד', point: MAJOR_CITIES_ZONES['אלעד'], isExternal: true };
  }

  // תל אביב
  if (/(?:^|\s)(?:תל\s*אביב|ת"א|תא|עזריאלי|דיזנגוף|רוטשילד|יפו|רמת\s*גן|גבעתיים)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'תל אביב', point: MAJOR_CITIES_ZONES['תל אביב'], isExternal: true };
  }

  // צפת / מירון
  if (/(?:^|\s)(?:מירון|רשב"י|רשבי|קבר\s*רשב"?י)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'מירון', point: MAJOR_CITIES_ZONES['מירון'], isExternal: true };
  }
  if (/(?:^|\s)(?:צפת|כנען)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'צפת', point: MAJOR_CITIES_ZONES['צפת'], isExternal: true };
  }

  // טבריה
  if (/(?:^|\s)(?:טבריה)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'טבריה', point: MAJOR_CITIES_ZONES['טבריה'], isExternal: true };
  }

  // פתח תקווה
  if (/(?:^|\s)(?:פתח\s*תקווה|פ"ת|פת|אם\s*המושבות|כפר\s*גנים)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'פתח תקווה', point: MAJOR_CITIES_ZONES['פתח תקווה'], isExternal: true };
  }

  // נתניה
  if (/(?:^|\s)(?:נתניה|צאנז|קרית\s*צאנז)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'נתניה', point: MAJOR_CITIES_ZONES['נתניה'], isExternal: true };
  }

  // חיפה
  if (/(?:^|\s)(?:חיפה|הקריות|הכרמל)(?:\s|$|[0-9ש₪])/i.test(clean)) {
    return { city: 'חיפה', point: MAJOR_CITIES_ZONES['חיפה'], isExternal: true };
  }

  // בית שמש (כולל שמש, רמות וכו')
  return { city: 'בית שמש', point: BEIT_SHEMESH_ZONES['רמה ד'], isExternal: false };
}

// זיהוי שכונה ורחוב מתוך טקסט נסיעה ארצי
export function detectNeighborhood(text: string, defaultCity?: string): { 
  key: string; 
  name: string; 
  point: GeoPoint; 
  street?: string;
  city: string;
} | null {
  if (!text) return null;
  const clean = cleanTextForGeo(text);

  // 1. בדיקה מול מפת הרחובות הארצית המלאה (מהארוכים לקצרים)
  const sortedStreets = Object.keys(STREET_TO_LOCATION_MAP).sort((a, b) => b.length - a.length);
  for (const street of sortedStreets) {
    const re = new RegExp(`(^|\\s)${street}(\\s|$)`, 'i');
    if (re.test(clean)) {
      const info = STREET_TO_LOCATION_MAP[street];
      return {
        key: info.zone,
        name: `${info.zone} (${info.city})`,
        point: {
          lat: info.coords.lat,
          lng: info.coords.lng,
          name: info.zone,
          city: info.city,
        },
        street,
        city: info.city,
      };
    }
  }

  // 2. בדיקה מול מאגר כלל השכונות בישראל (ALL_ZONES_COMBINED)
  const sortedZones = Object.keys(ALL_ZONES_COMBINED).sort((a, b) => b.length - a.length);
  for (const zoneKey of sortedZones) {
    const re = new RegExp(`(^|\\s)${zoneKey}(\\s|$)`, 'i');
    if (re.test(clean)) {
      const z = ALL_ZONES_COMBINED[zoneKey];
      return {
        key: zoneKey,
        name: `${z.name} (${z.city})`,
        point: z,
        street: zoneKey,
        city: z.city,
      };
    }
  }

  // 3. קיצורי בית שמש ייעודיים (לד, לג, לב, לא, רמד, רמג)
  const bsAliases: Record<string, string> = {
    'לד': 'רמה ד',
    'רמד': 'רמה ד',
    'ד': 'רמה ד',
    'לג': 'רמה ג',
    'רמג': 'רמה ג',
    'ג': 'רמה ג',
    'לב': 'רמה ב',
    'רמב': 'רמה ב',
    'ב': 'רמה ב',
    'לא': 'רמה א',
    'רמא': 'רמה א',
    'א': 'רמה א',
  };

  // בדיקת קיצור אם אין עיר אחרת
  if (!defaultCity || defaultCity === 'בית שמש') {
    for (const [alias, zoneKey] of Object.entries(bsAliases)) {
      const re = new RegExp(`(^|\\s)${alias}(\\s|$)`, 'i');
      if (re.test(clean)) {
        const p = BEIT_SHEMESH_ZONES[zoneKey];
        if (p) {
          return { key: zoneKey, name: p.name, point: p, street: alias, city: 'בית שמש' };
        }
      }
    }
  }

  return null;
}

// =======================================================================
// 5. אלגוריתם מתקדם לפענוח נתיב הנסיעה (איסוף מול יעד) לכל עיר בארץ
// =======================================================================

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

export function parseRideRoute(rawText: string, rawSenderPhone?: string): ParsedRideRoute {
  const text = String(rawText || '').trim();
  const cleanedText = cleanTextForGeo(text);

  // 1. מחיר
  let price: number | null = null;
  const priceMatch = cleanedText.match(/(?:₪|\b)(\d{2,4})\s*(?:₪|ש"ח|שח|ש\b|מידי|מיידי|\b)/i) ||
                     cleanedText.match(/(?:פנימי|שמש|בינעירוני|ים|בב)\s+(\d{2,4})/i);
  if (priceMatch && priceMatch[1]) {
    const p = parseInt(priceMatch[1], 10);
    if (p >= 20 && p <= 1200) {
      price = p;
    }
  }

  // 2. סדרן ודרייבוט
  const dispatcherPhone = extractDispatcherPhone(text, rawSenderPhone);
  const driveBotInfo = extractDriveBotInfo(text);

  // 3. זיהוי עיר
  const cityInfo = detectCityFromText(text);
  const city = cityInfo.city;

  // 4. האם נסיעה פנימית
  const isInternal =
    cleanedText.includes('פנימי') ||
    cleanedText.includes('בתוך העיר') ||
    cleanedText.includes('שמש פנימי') ||
    cleanedText.includes('ים פנימי') ||
    cleanedText.includes('בב פנימי') ||
    cleanedText.includes('בתוך');

  // ברירות מחדל לעיר
  let originNeighborhood = city;
  let originCoords = { lat: cityInfo.point.lat, lng: cityInfo.point.lng };
  let originText = '';

  let destNeighborhood = isInternal ? `פנימי ${city}` : 'יעד';
  let destCoords: { lat: number; lng: number } | null = null;
  let destinationText = '';

  let originCandidate = '';
  let destCandidate = '';

  // 1. חץ ברור: A > B או A -> B או A ➔ B או A >> B
  const arrowMatch = text.match(/(.*?)(?:>|->|➔|>>)(.*)/);
  if (arrowMatch) {
    originCandidate = cleanTextForGeo(arrowMatch[1]);
    destCandidate = cleanTextForGeo(arrowMatch[2]);
  } else {
    // 2. קיצור מוניות פנימי: מב לד, מא לג, מג לד
    const shortRouteMatch = cleanedText.match(/(?:^|\s)מ([א-ה]|רמ[א-ה]|רמה\s+[א-ה]|קריה|חפציבה|ישנה|ביג|נעימי|אושר\s*עד|הר\s*טוב)\s+ל([א-ה]|רמ[א-ה]|רמה\s+[א-ה]|קריה|חפציבה|ישנה|ביג|נעימי|אושר\s*עד|הר\s*טוב)(?:\s|$)/i);
    if (shortRouteMatch) {
      originCandidate = shortRouteMatch[1];
      destCandidate = shortRouteMatch[2];
    } else {
      // 3. סימן & (כמו "הר נוף&הגן הבוטני")
      const ampersandMatch = cleanedText.match(/([א-ת0-9\s]+)&([א-ת0-9\s]+)/);
      if (ampersandMatch) {
        originCandidate = ampersandMatch[1];
        destCandidate = ampersandMatch[2];
      } else {
        // 4. "מ... ל..." כללי
        const generalMlMatch = cleanedText.match(/(?:^|\s)מ\s*([א-ת0-9]+(?:\s+[א-ת0-9]+){0,3})\s+ל(?:-|\s*)?([א-ת0-9]+(?:\s+[א-ת0-9]+){0,3})/i);
        if (generalMlMatch) {
          originCandidate = generalMlMatch[1];
          destCandidate = generalMlMatch[2];
        } else {
          // 5. " ל " (למשל: "רמה ג לרמה ד", "רבי עקיבא לסופרים", "זכריה הנביא לד", "עין כרם לבית שמש")
          const lMatch = cleanedText.match(/(.*?)\s+ל([א-ת0-9\s]+)/i);
          if (lMatch && lMatch[1].trim().length > 1) {
            originCandidate = lMatch[1].trim();
            destCandidate = lMatch[2].trim();
          }
        }
      }
    }
  }

  // זיהוי איסוף מפורט
  if (originCandidate) {
    const originFound = detectNeighborhood(originCandidate, city);
    if (originFound) {
      originNeighborhood = originFound.name;
      originCoords = { lat: originFound.point.lat, lng: originFound.point.lng };
      originText = originFound.street || originCandidate;
    } else {
      originText = originCandidate;
      originNeighborhood = `${city} (${originCandidate})`;
    }
  }

  // זיהוי יעד מפורט
  if (destCandidate) {
    const destFound = detectNeighborhood(destCandidate, city);
    if (destFound) {
      destNeighborhood = destFound.name;
      destCoords = { lat: destFound.point.lat, lng: destFound.point.lng };
      destinationText = destFound.street || destCandidate;
    } else {
      destinationText = destCandidate;
      destNeighborhood = `${city} (${destCandidate})`;
    }
  }

  // אם לא זוהה חילוק ידני, מזהים מוקדים מתוך כלל הטקסט
  if (!originText && !destinationText) {
    const allFound = detectNeighborhood(cleanedText, city);
    if (allFound) {
      originNeighborhood = allFound.name;
      originCoords = { lat: allFound.point.lat, lng: allFound.point.lng };
      originText = allFound.street || allFound.name;
      destinationText = isInternal ? `פנימי ב${allFound.city}` : 'יעד בעיר';
      destNeighborhood = destinationText;
    } else {
      // אם יש "בתוך X" (למשל בתוך בית וגן)
      const insideMatch = cleanedText.match(/בתוך\s+([א-ת0-9\s]+)/i);
      if (insideMatch) {
        const spot = insideMatch[1].trim();
        const found = detectNeighborhood(spot, city);
        if (found) {
          originNeighborhood = found.name;
          originCoords = { lat: found.point.lat, lng: found.point.lng };
          originText = found.street || spot;
        } else {
          originText = spot;
          originNeighborhood = `${city} (${spot})`;
        }
        destinationText = `פנימי (בתוך ${originText})`;
        destNeighborhood = destinationText;
      } else {
        originText = `איסוף ב${city}`;
        originNeighborhood = city;
        destinationText = isInternal ? `פנימי ב${city}` : `יעד ב${city}`;
        destNeighborhood = destinationText;
      }
    }
  } else if (!originText) {
    originText = originNeighborhood;
  } else if (!destinationText) {
    destinationText = isInternal ? `פנימי ב${city}` : destNeighborhood;
  }

  // ניקוי ביטויים מיותרים משמות המוקדים תוך שמירה מלאה על שמות כמו ירושלים וסופרים
  const stripNoise = (str: string) => str
    .replace(/(?:\bפנימי\b|\bשמש\b|\bבינעירוני\b|\bים\b|\bבב\b|\b\d{2,4}\s*(?:ש|שח|ש"ח|₪)?\b|\bזמן\b|\bמיידי\b|\bמידי\b|\bווצאפ\b|\bוואטסאפ\b|לבקש\s*ב|\bביט\b)/gi, '')
    .trim();

  originText = stripNoise(originText) || originNeighborhood;
  destinationText = stripNoise(destinationText) || destNeighborhood;

  return {
    originText,
    originNeighborhood,
    originCoords,
    destinationText,
    destNeighborhood,
    destCoords,
    city,
    isInternal,
    price,
    dispatcherPhone,
    isDriveBot: driveBotInfo.isDriveBot,
    drivebotUrl: driveBotInfo.drivebotUrl,
    drivebotCommand: driveBotInfo.drivebotCommand,
    drivebotPhone: driveBotInfo.drivebotPhone,
    rawText: text,
  };
}

// =======================================================================
// 6. חישוב מרחק וזמן נסיעה (נוסחת Haversine עם עקלתון כבישים)
// =======================================================================

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

  // פקטור פיתולי כבישים (x1.25)
  const roadKm = Math.round(straightKm * 1.25 * 10) / 10;

  // הערכת זמן נסיעה (עירוני כ-32 קמ"ש, בינעירוני מהיר יותר למרחקים גדולים)
  const speedKmh = roadKm > 15 ? 55 : 32;
  const driveTimeMin = Math.max(2, Math.round((roadKm / speedKmh) * 60));

  return {
    straightKm: Math.round(straightKm * 10) / 10,
    roadKm,
    driveTimeMin,
  };
}

// יצירת קישור Waze ישיר ומדויק לנקודת האיסוף
export function generateWazeUrl(destinationName: string, city: string = 'ירושלים', coords?: { lat: number; lng: number }): string {
  if (coords && coords.lat && coords.lng) {
    return `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`;
  }
  const query = encodeURIComponent(`${destinationName} ${city}`);
  return `https://waze.com/ul?q=${query}&navigate=yes`;
}

// תגית קרבה (צבע והתרעה לפי מרחק)
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
  if (distanceKm <= 4.0) {
    return {
      label: 'מרחק קצר-בינוני',
      colorClass: 'text-amber-400',
      badgeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
      isClose: false,
    };
  }
  if (distanceKm > 16) {
    return {
      label: 'בינעירוני / עיר אחרת',
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

// קישור וואטסאפ אמין לסדרן או לבוט דרייבוט
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
