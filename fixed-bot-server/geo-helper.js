// geo-helper.js - שירות מיפוי שכונות, רחובות ומרחקים לשרת הוואטסאפ ול-API
// תומך בזיהוי רחובות בית שמש (כגון זכריה הנביא -> רמה ג', שדרות האמוראים -> רמה ד')

export const BEIT_SHEMESH_ZONES = {
  'רמה ד': { lat: 31.7052, lng: 34.9904, name: "רמת בית שמש ד'", city: "בית שמש", zone: "דרום" },
  'רמה ג': { lat: 31.7185, lng: 34.9982, name: "רמת בית שמש ג'", city: "בית שמש", zone: "מזרח" },
  'רמה א': { lat: 31.7331, lng: 34.9926, name: "רמת בית שמש א'", city: "בית שמש", zone: "מרכז-דרום" },
  'רמה ב': { lat: 31.7258, lng: 34.9854, name: "רמת בית שמש ב'", city: "בית שמש", zone: "מרכז" },
  'רמה ה': { lat: 31.7224, lng: 35.0081, name: "נווה שמיר (רמה ה')", city: "בית שמש", zone: "דרום-מזרח" },
  'רמת אברהם': { lat: 31.7382, lng: 34.9751, name: "רמת אברהם", city: "בית שמש", zone: "מערב" },
  'הקריה החרדית': { lat: 31.7456, lng: 34.9785, name: "הקריה / חפציבה", city: "בית שמש", zone: "מרכז-מערב" },
  'העיר הוותיקה': { lat: 31.7554, lng: 34.9951, name: "העיר הוותיקה (הישנה)", city: "בית שמש", zone: "צפון" },
  'מרכז ביג': { lat: 31.7588, lng: 34.9802, name: "מרכז ביג / שער העיר", city: "בית שמש", zone: "צפון-מערב" },
  'קניון נעימי': { lat: 31.7521, lng: 34.9856, name: "קניון נעימי / סאן מול", city: "בית שמש", zone: "צפון" },
  'הר טוב': { lat: 31.7654, lng: 34.9988, name: "אזור תעשייה הר טוב", city: "בית שמש", zone: "צפון-מזרח" },
};

export const STREET_TO_ZONE_MAP = {
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
  'רמה ג 1': 'רמה ג',
  'רמה ג 2': 'רמה ג',
  'רמג': 'רמה ג',

  // רמה ד' (אמוראים)
  'שדרות האמוראים': 'רמה ד',
  'שד האמוראים': 'רמה ד',
  'האמוראים': 'רמה ד',
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
  'נחל רפאים': 'רמה א',
  'נחל לכיש': 'רמה א',
  'נחל שחם': 'רמה א',
  'נחל ערוגות': 'רמה א',
  'רמא': 'רמה א',

  // רמה ב' (נהרות ותנאים)
  'נהר הירדן': 'רמה ב',
  'הירדן': 'רמה ב',
  'נהר הירמוך': 'רמה ב',
  'רבי יהודה הנשיא': 'רמה ב',
  'רבי עקיבא': 'רמה ב',
  'בן איש חי': 'רמה ב',
  'חזון איש': 'רמה ב',
  'בריסק': 'רמה ב',
  'רמב': 'רמה ב',

  // נווה שמיר (רמה ה')
  'נווה שמיר': 'רמה ה',
  'רמה ה': 'רמה ה',
  'רמה ה 1': 'רמה ה',
  'רמה ה 2': 'רמה ה',
  'רמה ה 3': 'רמה ה',
  'רמה ה 4': 'רמה ה',

  // רמת אברהם / חפציבה
  'רמת אברהם': 'רמת אברהם',
  'חפציבה': 'הקריה החרדית',
  'הקריה': 'הקריה החרדית',
  'סלונים': 'הקריה החרדית',
  'שפת אמת': 'הקריה החרדית',

  // מרכזים
  'ביג': 'מרכז ביג',
  'שער העיר': 'מרכז ביג',
  'נעימי': 'קניון נעימי',
  'סאן מול': 'קניון נעימי',
  'הר טוב': 'הר טוב',
  'איזור תעשיה': 'הר טוב',
  'יער צרעה': 'הר טוב',
  'צרעה': 'הר טוב',
};

export const ZONE_ALIAS_MAP = {
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

  // שכונות נוספות
  'קריה': 'הקריה החרדית',
  'הקריה': 'הקריה החרדית',
  'חפציבה': 'הקריה החרדית',
  'ישנה': 'העיר הוותיקה',
  'וותיקה': 'העיר הוותיקה',
  'הישנה': 'העיר הוותיקה',
  'הוותיקה': 'העיר הוותיקה',
  'ביג': 'מרכז ביג',
  'שער העיר': 'מרכז ביג',
  'נעימי': 'קניון נעימי',
  'הר טוב': 'הר טוב',
  'צרעה': 'הר טוב',
};

// חילוץ מספר טלפון אמיתי של סדרן מתוך טקסט הנסיעה (מונע סדרן: 0 לחלוטין)
export function extractDispatcherPhone(text, rawPhone = null) {
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

  const waMatch = String(text).match(/wa\.me\/(\d+)/i);
  if (waMatch && waMatch[1]) {
    const digits = waMatch[1].replace(/\D/g, '');
    if (digits.startsWith('9725')) {
      return `0${digits.slice(3)}`;
    }
    if (digits.startsWith('05')) {
      return digits;
    }
  }

  const promptMatch = String(text).match(/(?:לבקש ב|אצל|סדרן|טלפון|נייד|בווצאפ|בוואטסאפ|וואטסאפ|טל)?\s*(05\d[- ]?\d{3}[- ]?\d{4})/i);
  if (promptMatch && promptMatch[1]) {
    return promptMatch[1].replace(/[- ]/g, '');
  }

  const anyPhoneMatch = String(text).match(/\b(05\d{8})\b/);
  if (anyPhoneMatch && anyPhoneMatch[1]) {
    return anyPhoneMatch[1];
  }

  return null;
}

// זיהוי שכונה וקואורדינטות מתוך טקסט
export function detectNeighborhood(text) {
  if (!text) return null;
  const clean = String(text).replace(/[.,/#!$%^&*;:{}=\-_`~()?"'ֿ]/g, ' ').replace(/\s+/g, ' ').trim();

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
    const regex = new RegExp(`(^|\\s)${item.key}(\\s|$)`, 'i');
    if (regex.test(clean)) {
      const zone = BEIT_SHEMESH_ZONES[item.zoneKey];
      return {
        matchedStreet: item.key,
        zoneKey: item.zoneKey,
        zoneName: zone ? zone.name : item.zoneKey,
        coords: zone ? { lat: zone.lat, lng: zone.lng } : null,
      };
    }
  }

  // 2. בדיקת רחובות ספציפיים (נביאים, אמוראים, נחלים, נהרות - ארוכים קודם)
  const streetKeys = Object.keys(STREET_TO_ZONE_MAP).sort((a, b) => b.length - a.length);
  for (const street of streetKeys) {
    const regex = new RegExp(`(^|\\s)${street.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
    if (regex.test(clean)) {
      const zoneKey = STREET_TO_ZONE_MAP[street];
      const zone = BEIT_SHEMESH_ZONES[zoneKey];
      return {
        matchedStreet: street,
        zoneKey,
        zoneName: zone ? zone.name : zoneKey,
        coords: zone ? { lat: zone.lat, lng: zone.lng } : null,
      };
    }
  }

  // 3. בדיקת קיצורים ישירים וכינויים (מב, לד, רמד, רמב, ביג, חפציבה וכו')
  for (const [alias, zoneKey] of Object.entries(ZONE_ALIAS_MAP)) {
    const regex = new RegExp(`(^|\\s)${alias}(\\s|$)`, 'i');
    if (regex.test(clean)) {
      const zone = BEIT_SHEMESH_ZONES[zoneKey];
      return {
        matchedStreet: alias,
        zoneKey,
        zoneName: zone ? zone.name : zoneKey,
        coords: zone ? { lat: zone.lat, lng: zone.lng } : null,
      };
    }
  }

  return null;
}


// פענוח נתיב נסיעה מלא (מוצא מול יעד - שלילה של טעויות היפוך "מב לד")
export function parseRideRoute(rawText, rawSenderPhone = null) {
  const text = String(rawText || '').trim();

  let price = null;
  const priceMatch = text.match(/(?:₪|\b)(\d{2,4})\s*(?:₪|ש"ח|שח|ש\b|מידי|מיידי|\b)/i) ||
                     text.match(/(?:פנימי|שמש|בינעירוני)\s+(\d{2,4})/i);
  if (priceMatch && priceMatch[1]) {
    const p = parseInt(priceMatch[1], 10);
    if (p >= 20 && p <= 1200) price = p;
  }

  const dispatcherPhone = extractDispatcherPhone(text, rawSenderPhone);
  const isInternal =
    text.includes('פנימי') ||
    text.includes('שמש פנימי') ||
    text.includes('בתוך העיר') ||
    text.includes('פנימי שמש');

  const defaultOrigin = BEIT_SHEMESH_ZONES['רמה ד'];
  let originText = '';
  let originNeighborhood = defaultOrigin.name;
  let originCoords = { lat: defaultOrigin.lat, lng: defaultOrigin.lng };

  let destinationText = '';
  let destNeighborhood = 'יעד בעיר';
  let destCoords = null;

  let originCandidate = '';
  let destCandidate = '';

  // 1. בדיקת חץ: A > B או A -> B או A ➔ B
  const arrowMatch = text.match(/(.*?)(?:>|->|➔|>>)(.*)/);
  if (arrowMatch) {
    originCandidate = arrowMatch[1].trim();
    destCandidate = arrowMatch[2].trim();
  } else {
    // 2. בדיקת קיצור נפוץ במוניות: מב לד, מא לג, מג לד
    const shortRouteMatch = text.match(/(?:^|\s)מ([א-ה]|רמ[א-ה]|רמה\s+[א-ה]|קריה|חפציבה|ישנה|ביג|נעימי|הר\s*טוב)\s+ל([א-ה]|רמ[א-ה]|רמה\s+[א-ה]|קריה|חפציבה|ישנה|ביג|נעימי|הר\s*טוב)(?:\s|$|[0-9ש₪])/i);
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
        // 4. בדיקת " ל "
        const lMatch = text.match(/(.*?)\s+ל(רמה\s+[א-ה]|רמ[א-ה]|[א-ה]\b|ביג|קריה|חפציבה|ישנה|וותיקה|הר טוב|נעימי|[א-ת]+ הנביא|[א-ת]+ הנביאה|נחל [א-ת]+|נהר [א-ת]+)(.*)/i);
        if (lMatch) {
          originCandidate = lMatch[1].trim();
          destCandidate = (lMatch[2] + (lMatch[3] || '')).trim();
        }
      }
    }
  }

  if (originCandidate) {
    const found = detectNeighborhood(originCandidate);
    if (found) {
      originNeighborhood = found.zoneName;
      originCoords = found.coords || originCoords;
      originText = found.matchedStreet || originCandidate.replace(/[*\-_#]/g, '').trim();
    } else {
      originText = originCandidate.replace(/[*\-_#]/g, '').trim();
    }
  }

  if (destCandidate) {
    const found = detectNeighborhood(destCandidate);
    if (found) {
      destNeighborhood = found.zoneName;
      destCoords = found.coords || null;
      destinationText = found.matchedStreet || destCandidate.replace(/[*\-_#]/g, '').trim();
    } else {
      destinationText = destCandidate.replace(/[*\-_#]/g, '').trim();
    }
  }

  if (!originText && !destinationText) {
    const detectedAll = detectNeighborhood(text);
    if (detectedAll) {
      originNeighborhood = detectedAll.zoneName;
      originCoords = detectedAll.coords || originCoords;
      originText = detectedAll.matchedStreet || detectedAll.zoneName;
      destinationText = 'יעד בעיר';
    } else {
      originText = 'נקודת איסוף (בית שמש)';
      destinationText = 'יעד נסיעה';
    }
  } else if (!originText) {
    originText = originNeighborhood;
  } else if (!destinationText) {
    destinationText = destNeighborhood;
  }

  return {
    originText: originText || originNeighborhood,
    originNeighborhood,
    originCoords,
    destinationText: destinationText || 'יעד בעיר',
    destNeighborhood,
    destCoords,
    isInternal: isInternal || (originNeighborhood.includes('בית שמש') && destNeighborhood.includes('בית שמש')),
    price,
    dispatcherPhone,
    rawText: text,
  };
}

// חישוב מרחק בקילומטרים וזמן נסיעה מוערך בדקות
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return { km: 0, timeMinutes: 0 };
  const R = 6371; // רדיוס כדור הארץ בק"מ
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightLineKm = R * c;
  
  // פקטור עקלתון כבישים עירוניים (כ-1.25)
  const roadKm = Math.round(straightLineKm * 1.25 * 10) / 10;
  const timeMinutes = Math.max(2, Math.round(roadKm * 2.2));
  return {
    km: roadKm,
    timeMinutes,
  };
}

// יצירת קישור ניווט Waze ישיר
export function generateWazeUrl(destinationName, city = 'בית שמש', coords = null) {
  if (coords && coords.lat && coords.lng) {
    return `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`;
  }
  const query = encodeURIComponent(`${destinationName || ''} ${city || ''}`.trim());
  return `https://waze.com/ul?q=${query}&navigate=yes`;
}
