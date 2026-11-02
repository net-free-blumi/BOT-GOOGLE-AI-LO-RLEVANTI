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
};

// זיהוי שכונה וקואורדינטות מתוך טקסט
export function detectNeighborhood(text) {
  if (!text) return null;
  const clean = String(text).replace(/[.,/#!$%^&*;:{}=\-_`~()?"'ֿ]/g, ' ').replace(/\s+/g, ' ');

  // בדיקת רחובות ספציפיים
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

  // בדיקת שכונות ישירות
  const zoneEntries = Object.entries(BEIT_SHEMESH_ZONES);
  for (const [key, zone] of zoneEntries) {
    if (clean.includes(key) || clean.includes(zone.name)) {
      return {
        matchedStreet: key,
        zoneKey: key,
        zoneName: zone.name,
        coords: { lat: zone.lat, lng: zone.lng },
      };
    }
  }

  return null;
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
