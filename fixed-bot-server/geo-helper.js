// geo-helper.js - שירות מיפוי שכונות, רחובות ומרחקים לכל ערי ישראל עבור שרת הוואטסאפ

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

export const JERUSALEM_ZONES = {
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
};

export const BNEI_BRAK_ZONES = {
  'רבי עקיבא': { lat: 32.0864, lng: 34.8341, name: 'מרכז רבי עקיבא', city: 'בני ברק', zone: 'מרכז' },
  'חזון איש': { lat: 32.0830, lng: 34.8315, name: 'חזון איש / נחמיה', city: 'בני ברק', zone: 'דרום' },
  'סוקולוב': { lat: 32.0890, lng: 34.8360, name: 'סוקולוב', city: 'בני ברק', zone: 'צפון-מרכז' },
  'השומר': { lat: 32.0850, lng: 34.8465, name: 'אהרונוביץ / השומר', city: 'בני ברק', zone: 'מזרח' },
  'עזרא': { lat: 32.0805, lng: 34.8365, name: 'עזרא / נחמיה', city: 'בני ברק', zone: 'דרום' },
  'דסלר': { lat: 32.0815, lng: 34.8420, name: 'דסלר / רמת אהרן', city: 'בני ברק', zone: 'דרום-מזרח' },
  'סופרים': { lat: 32.0790, lng: 34.8320, name: 'סופרים / חזון איש', city: 'בני ברק', zone: 'דרום' },
  'שיכון ה': { lat: 32.0910, lng: 34.8390, name: 'שיכון ה׳', city: 'בני ברק', zone: 'צפון' },
  'פרדס כץ': { lat: 32.0945, lng: 34.8350, name: 'פרדס כץ', city: 'בני ברק', zone: 'צפון' },
};

export const MAJOR_CITIES_ZONES = {
  'בית שמש': { lat: 31.7456, lng: 34.9854, name: 'בית שמש', city: 'בית שמש' },
  'ירושלים': { lat: 31.7850, lng: 35.2100, name: 'ירושלים', city: 'ירושלים' },
  'בני ברק': { lat: 32.0845, lng: 34.8341, name: 'בני ברק', city: 'בני ברק' },
  'מודיעין עילית': { lat: 31.9317, lng: 35.0417, name: 'מודיעין עילית (קרית ספר)', city: 'מודיעין עילית' },
  'ביתר עילית': { lat: 31.7010, lng: 35.1180, name: 'ביתר עילית', city: 'ביתר עילית' },
  'אשדוד': { lat: 31.7950, lng: 34.6450, name: 'אשדוד', city: 'אשדוד' },
  'אלעד': { lat: 32.0519, lng: 34.9511, name: 'אלעד', city: 'אלעד' },
  'תל אביב': { lat: 32.0853, lng: 34.7818, name: 'תל אביב', city: 'תל אביב' },
  'צפת': { lat: 32.9658, lng: 35.4963, name: 'צפת', city: 'צפת' },
  'מירון': { lat: 32.9822, lng: 35.4397, name: 'מירון', city: 'מירון' },
  'טבריה': { lat: 32.7922, lng: 35.5312, name: 'טבריה', city: 'טבריה' },
};

export const ALL_ZONES_MAP = {
  ...BEIT_SHEMESH_ZONES,
  ...JERUSALEM_ZONES,
  ...BNEI_BRAK_ZONES,
  ...MAJOR_CITIES_ZONES,
};

export const STREET_TO_ZONE_MAP = {
  // בית שמש
  'זכריה הנביא': 'רמה ג',
  'זכריה': 'רמה ג',
  'חגי הנביא': 'רמה ג',
  'חגי': 'רמה ג',
  'צפניה הנביא': 'רמה ג',
  'צפניה': 'רמה ג',
  'חבקוק הנביא': 'רמה ג',
  'חבקוק': 'רמה ג',
  'עמוס הנביא': 'רמה ג',
  'חולדה הנביאה': 'רמה ג',
  'מרים הנביאה': 'רמה ג',
  'רמה ג 1': 'רמה ג',
  'רמה ג 2': 'רמה ג',
  'רמג': 'רמה ג',
  'שדרות האמוראים': 'רמה ד',
  'שד האמוראים': 'רמה ד',
  'האמוראים': 'רמה ד',
  'אמוראים': 'רמה ד',
  'רב חנן': 'רמה ד',
  'אביי': 'רמה ד',
  'רבא': 'רמה ד',
  'רב מרי': 'רמה ד',
  'תלמוד בבלי': 'רמה ד',
  'רמה ד 1': 'רמה ד',
  'רמה ד 2': 'רמה ד',
  'רמה ד 3': 'רמה ד',
  'רמה ד 4': 'רמה ד',
  'רמה ד 5': 'רמה ד',
  'רמד': 'רמה ד',
  'לד': 'רמה ד',
  'נחל קישון': 'רמה א',
  'הקישון': 'רמה א',
  'נחל דולב': 'רמה א',
  'הדולב': 'רמה א',
  'נחל צאלים': 'רמה א',
  'נחל שורק': 'רמה א',
  'נחל לוז': 'רמה א',
  'נחל משמר': 'רמה א',
  'משמר': 'רמה א',
  'רמא': 'רמה א',
  'לא': 'רמה א',
  'נהר הירדן': 'רמה ב',
  'הירדן': 'רמה ב',
  'רבי יהודה הנשיא': 'רמה ב',
  'בן איש חי': 'רמה ב',
  'רמב': 'רמה ב',
  'לב': 'רמה ב',
  'נווה שמיר': 'רמה ה',
  'רמה ה': 'רמה ה',
  'רמת אברהם': 'רמת אברהם',
  'חפציבה': 'הקריה החרדית',
  'הקריה': 'הקריה החרדית',
  'אושר עד': 'מרכז ביג',
  'מרכז ביג': 'מרכז ביג',
  'ביג': 'מרכז ביג',
  'נעימי': 'קניון נעימי',
  'קניון נעימי': 'קניון נעימי',
  'הר טוב': 'הר טוב',
  'הרטוב': 'הר טוב',
  'יער צרעה': 'הר טוב',
  'העיר הוותיקה': 'העיר הוותיקה',
  'וותיקה': 'העיר הוותיקה',
  'ברכיה': 'העיר הוותיקה',
  'ברוש': 'העיר הוותיקה',
  'עלית הנוער': 'העיר הוותיקה',

  // ירושלים
  'בית וגן': 'בית וגן',
  'הר נוף': 'הר נוף',
  'הגן הבוטני': 'הגן הבוטני',
  'עין כרם': 'עין כרם',
  'עיכ': 'עין כרם',
  'גאולה': 'גאולה',
  'רוממה': 'רוממה',
  'שמגר': 'רוממה',
  'ירמיהו': 'רוממה',
  'רמות': 'רמות',
  'גבעת שאול': 'גבעת שאול',
  'בית הכרם': 'בית הכרם',
  'מאה שערים': 'מאה שערים',
  'סנהדריה': 'סנהדריה',
  'תלפיות': 'תלפיות',
  'מלחה': 'מלחה',
  'פסגת זאב': 'פסגת זאב',

  // בני ברק
  'רבי עקיבא': 'רבי עקיבא',
  'חזון איש': 'חזון איש',
  'סוקולוב': 'סוקולוב',
  'אהרונוביץ': 'השומר',
  'השומר': 'השומר',
  'עזרא': 'עזרא',
  'דסלר': 'דסלר',
  'סופרים': 'סופרים',
  'שיכון ה': 'שיכון ה',
  'פרדס כץ': 'פרדס כץ',
};

export const ZONE_ALIAS_MAP = {
  'לד': 'רמה ד',
  'רמד': 'רמה ד',
  'לג': 'רמה ג',
  'רמג': 'רמה ג',
  'לב': 'רמה ב',
  'רמב': 'רמה ב',
  'לא': 'רמה א',
  'רמא': 'רמה א',
  'ד': 'רמה ד',
  'ג': 'רמה ג',
  'ב': 'רמה ב',
  'א': 'רמה א',
  'ה': 'רמה ה',
  'וותיקה': 'העיר הוותיקה',
  'ישנה': 'העיר הוותיקה',
  'קריה': 'הקריה החרדית',
  'קרייה': 'הקריה החרדית',
  'נעימי': 'קניון נעימי',
  'ביג': 'מרכז ביג',
  'שער העיר': 'מרכז ביג',
  'שמיר': 'רמה ה',
  'נוה שמיר': 'רמה ה',
};

export function cleanText(text) {
  if (!text) return '';
  return String(text)
    .replace(/[*_~`"'\-]/g, ' ')
    .replace(/[֑-ׇ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractDispatcherPhone(rawText, rawSenderPhone = null) {
  const text = String(rawText || '');
  const waMatch = text.match(/(?:https?:\/\/)?wa\.me\/(\d+)/i);
  if (waMatch && waMatch[1]) {
    const digits = waMatch[1];
    if (digits.startsWith('972')) return `0${digits.slice(3)}`;
    if (digits.startsWith('05')) return digits;
  }
  const promptMatch = text.match(/(?:לבקש ב|אצל|סדרן|טלפון|נייד|בווצאפ|בוואטסאפ|וואטסאפ|טל)?\s*(05\d[- ]?\d{3}[- ]?\d{4})/i);
  if (promptMatch && promptMatch[1]) {
    return promptMatch[1].replace(/[- ]/g, '');
  }
  const anyPhoneMatch = text.match(/\b(05\d{8})\b/);
  if (anyPhoneMatch && anyPhoneMatch[1]) {
    return anyPhoneMatch[1];
  }
  if (rawSenderPhone && rawSenderPhone.length >= 7 && rawSenderPhone !== '0') {
    return rawSenderPhone.replace(/@.*$/, '').replace(/\D/g, '');
  }
  return null;
}

export function extractDriveBotInfo(rawText) {
  const text = String(rawText || '');
  const waMatch = text.match(/(?:https?:\/\/)?wa\.me\/(\d+)\?text=([^&\s\n]+)/i);
  const isDriveBot = Boolean(waMatch) || /prod_drivebot|drivebot|דרייבוט/i.test(text);

  let drivebotPhone = '972552732722';
  let drivebotUrl = null;
  let drivebotCommand = null;

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

  return { isDriveBot, drivebotPhone, drivebotUrl, drivebotCommand };
}

export function detectNeighborhood(text) {
  if (!text) return null;
  const clean = cleanText(text);

  const sortedStreets = Object.keys(STREET_TO_ZONE_MAP).sort((a, b) => b.length - a.length);
  for (const street of sortedStreets) {
    const re = new RegExp(`(^|\\s)${street}(\\s|$)`, 'i');
    if (re.test(clean)) {
      const zoneKey = STREET_TO_ZONE_MAP[street];
      const point = ALL_ZONES_MAP[zoneKey] || BEIT_SHEMESH_ZONES[zoneKey];
      if (point) {
        return { key: zoneKey, name: point.name, point, street };
      }
    }
  }

  for (const [alias, zoneKey] of Object.entries(ZONE_ALIAS_MAP)) {
    const re = new RegExp(`(^|\\s)${alias}(\\s|$)`, 'i');
    if (re.test(clean)) {
      const point = ALL_ZONES_MAP[zoneKey] || BEIT_SHEMESH_ZONES[zoneKey];
      if (point) {
        return { key: zoneKey, name: point.name, point, street: alias };
      }
    }
  }

  return null;
}

export function parseRideRoute(rawText, rawSenderPhone = null) {
  const text = String(rawText || '').trim();
  const cleaned = cleanText(text);

  let price = null;
  const priceMatch = cleaned.match(/(?:₪|\b)(\d{2,4})\s*(?:₪|ש"ח|שח|ש\b|מידי|מיידי|\b)/i) ||
                     cleaned.match(/(?:פנימי|שמש|בינעירוני|ים|בב)\s+(\d{2,4})/i);
  if (priceMatch && priceMatch[1]) {
    const p = parseInt(priceMatch[1], 10);
    if (p >= 20 && p <= 1200) price = p;
  }

  const dispatcherPhone = extractDispatcherPhone(text, rawSenderPhone);
  const driveBotInfo = extractDriveBotInfo(text);
  const isInternal =
    cleaned.includes('פנימי') ||
    cleaned.includes('בתוך העיר') ||
    cleaned.includes('שמש פנימי') ||
    cleaned.includes('ים פנימי') ||
    cleaned.includes('בב פנימי') ||
    cleaned.includes('בתוך');

  // זיהוי עיר
  let isJerusalem = /(?:^|\s)(?:ירושלים|ים|י\s*ם|ירוש|גאולה|שמגר|ירמיהו|רמות|בית\s*וגן|רוממה|הר\s*נוף|מלכי\s*ישראל|מאה\s*שערים|עין\s*כרם|עיכ|הגן\s*הבוטני)(?:\s|$|[0-9ש₪])/i.test(cleaned) ||
                    cleaned.includes('בית וגן') || cleaned.includes('הר נוף') || cleaned.includes('הגן הבוטני');
  let isBneiBrak = /(?:^|\s)(?:בני\s*ברק|ב"ב|בב|ז'בוטינסקי|זבוטינסקי|סופרים|דסלר|רשב"ם|אהרונוביץ|רבי\s*עקיבא|חזון\s*איש|סוקולוב)(?:\s|$|[0-9ש₪])/i.test(cleaned) ||
                   (cleaned.includes('בב') && (cleaned.includes('רע') || cleaned.includes('סופרים')));

  let cityName = isJerusalem ? "ירושלים" : isBneiBrak ? "בני ברק" : "בית שמש";
  let defaultOriginCoords = isJerusalem 
    ? { lat: 31.7850, lng: 35.2100 } 
    : isBneiBrak 
    ? { lat: 32.0845, lng: 34.8341 } 
    : { lat: 31.7456, lng: 34.9854 };

  let originText = '';
  let originNeighborhood = cityName;
  let originCoords = defaultOriginCoords;

  let destinationText = '';
  let destNeighborhood = isInternal ? `פנימי ${cityName}` : 'יעד';
  let destCoords = null;

  let originCandidate = '';
  let destCandidate = '';

  const arrowMatch = text.match(/(.*?)(?:>|->|➔|>>)(.*)/);
  if (arrowMatch) {
    originCandidate = cleanText(arrowMatch[1]);
    destCandidate = cleanText(arrowMatch[2]);
  } else {
    const ampersandMatch = cleaned.match(/([א-ת0-9\s]+)&([א-ת0-9\s]+)/);
    if (ampersandMatch) {
      originCandidate = ampersandMatch[1];
      destCandidate = ampersandMatch[2];
    } else {
      const shortRouteMatch = cleaned.match(/(?:^|\s)מ([א-ה]|רמ[א-ה]|רמה\s+[א-ה]|קריה|חפציבה|ישנה|ביג|נעימי|אושר\s*עד|הר\s*טוב)\s+ל([א-ה]|רמ[א-ה]|רמה\s+[א-ה]|קריה|חפציבה|ישנה|ביג|נעימי|אושר\s*עד|הר\s*טוב)(?:\s|$)/i);
      if (shortRouteMatch) {
        originCandidate = shortRouteMatch[1];
        destCandidate = shortRouteMatch[2];
      } else {
        const generalMlMatch = cleaned.match(/(?:^|\s)מ\s*([א-ת0-9]+(?:\s+[א-ת0-9]+){0,3})\s+ל(?:-|\s*)?([א-ת0-9]+(?:\s+[א-ת0-9]+){0,3})/i);
        if (generalMlMatch) {
          originCandidate = generalMlMatch[1];
          destCandidate = generalMlMatch[2];
        } else {
          const lMatch = cleaned.match(/(.*?)\s+ל([א-ת0-9\s]+)/i);
          if (lMatch && lMatch[1].trim().length > 1) {
            originCandidate = lMatch[1].trim();
            destCandidate = lMatch[2].trim();
          }
        }
      }
    }
  }

  if (originCandidate) {
    const originFound = detectNeighborhood(originCandidate);
    if (originFound) {
      originNeighborhood = originFound.name;
      originCoords = { lat: originFound.point.lat, lng: originFound.point.lng };
      originText = originFound.street || originCandidate;
    } else {
      originText = originCandidate;
      originNeighborhood = `${cityName} (${originCandidate})`;
    }
  }

  if (destCandidate) {
    const destFound = detectNeighborhood(destCandidate);
    if (destFound) {
      destNeighborhood = destFound.name;
      destCoords = { lat: destFound.point.lat, lng: destFound.point.lng };
      destinationText = destFound.street || destCandidate;
    } else {
      destinationText = destCandidate;
      destNeighborhood = `${cityName} (${destCandidate})`;
    }
  }

  if (!originText && !destinationText) {
    const detectedAll = detectNeighborhood(cleaned);
    if (detectedAll) {
      originNeighborhood = detectedAll.name;
      originCoords = { lat: detectedAll.point.lat, lng: detectedAll.point.lng };
      originText = detectedAll.street || detectedAll.name;
      destinationText = isInternal ? `פנימי ${cityName}` : 'יעד בעיר';
    } else {
      const insideMatch = cleaned.match(/בתוך\s+([א-ת0-9\s]+)/i);
      if (insideMatch) {
        const spot = insideMatch[1].trim();
        const found = detectNeighborhood(spot);
        if (found) {
          originNeighborhood = found.name;
          originCoords = { lat: found.point.lat, lng: found.point.lng };
          originText = found.street || spot;
        } else {
          originText = spot;
          originNeighborhood = `${cityName} (${spot})`;
        }
        destinationText = `פנימי (בתוך ${originText})`;
      } else {
        originText = `איסוף ב${cityName}`;
        destinationText = isInternal ? `פנימי ב${cityName}` : `יעד ב${cityName}`;
      }
    }
  } else if (!originText) {
    originText = originNeighborhood;
  } else if (!destinationText) {
    destinationText = isInternal ? `פנימי ב${cityName}` : destNeighborhood;
  }

  const stripNoise = (str) => String(str || '')
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
    city: cityName,
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

export function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
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
  const roadKm = Math.round(straightKm * 1.25 * 10) / 10;
  const speedKmh = roadKm > 15 ? 55 : 32;
  const driveTimeMin = Math.max(2, Math.round((roadKm / speedKmh) * 60));
  return {
    straightKm: Math.round(straightKm * 10) / 10,
    roadKm,
    driveTimeMin,
  };
}

export function generateWazeUrl(destinationName, city = 'ירושלים', coords = null) {
  if (coords && coords.lat && coords.lng) {
    return `https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`;
  }
  const query = encodeURIComponent(`${destinationName} ${city}`);
  return `https://waze.com/ul?q=${query}&navigate=yes`;
}
