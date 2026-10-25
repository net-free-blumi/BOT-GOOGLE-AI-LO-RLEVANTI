import { StatusPayload, LogItem, DriverState } from '../types.ts';

let mockSearch: DriverState = {
  active: true,
  mode: 'route',
  origin: 'בית שמש',
  destination: 'ירושלים',
  displayText: 'בית שמש ⬅️ ירושלים',
  describe: 'רק נסיעות מבית שמש לירושלים והסביבה',
};

let mockStats = {
  day: new Date().toISOString().split('T')[0],
  scanned: 184,
  sent: 12,
  rejected: 153,
  duplicates: 19,
  commands: 7,
  groups: 14,
  dedupeSize: 28,
};

let mockLogs: LogItem[] = [
  {
    t: Date.now() - 1000 * 12,
    type: 'sent',
    message: 'נסיעה מתאימה נשלחה לוואטסאפ של הנהג',
    text: 'דרוש נהג מבית שמש (רמה ג\') לירושלים (רוממה) מיידי! 2 נוסעים + מזוודה 050-1234567',
    matchedCity: 'בית שמש -> ירושלים',
    sender: 'מוקד נסיעות מרכז',
  },
  {
    t: Date.now() - 1000 * 45,
    type: 'rejected',
    message: 'סונן: יעד לא תואם למסלול המבוקש',
    text: 'נסיעה מבית שמש למודיעין עילית ב-14:30',
    reason: 'היעד מודיעין עילית לא תואם לירושלים',
  },
  {
    t: Date.now() - 1000 * 95,
    type: 'duplicate',
    message: 'סונן: הודעה זהה הופצה כבר בקבוצה מקבילה',
    text: 'דרוש נהג מבית שמש (רמה ג\') לירושלים (רוממה) מיידי!',
  },
  {
    t: Date.now() - 1000 * 180,
    type: 'command',
    message: 'הופעל חיפוש: בית שמש ⬅️ ירושלים (route)',
  },
  {
    t: Date.now() - 1000 * 300,
    type: 'system',
    message: 'וואטסאפ מחובר בהצלחה וסורק 14 קבוצות',
  },
  {
    t: Date.now() - 1000 * 420,
    type: 'rejected',
    message: 'סונן: הודעת ספאם / ללא נסיעה',
    text: 'שבוע טוב לכולם, מישהו יודע אם כביש 1 פתוח?',
    reason: 'לא זוהתה בקשת נסיעה',
  },
];

export function getMockStatus(): StatusPayload {
  return {
    ok: true,
    apiVersion: 2,
    wa: {
      connected: true,
      registered: true,
      pairingCode: null,
      lastDisconnectReason: '',
    },
    search: { ...mockSearch },
    server: {
      cpuLoad: (0.15 + Math.random() * 0.1).toFixed(2),
      loadAvg: ['0.18', '0.12', '0.08'],
      ramUsageMB: 112,
      ramPercentage: 24,
      ramUsedMB: 1420,
      ramTotalMB: 6144,
      uptime: 86400 * 3 + 14200,
      hostUptime: 86400 * 14,
      cores: 4,
      processUptimeMs: 1000 * 60 * 60 * 26,
      pm2: 'wa-rides-bot',
      node: 'v20.18.0',
    },
    stats: { ...mockStats },
    settings: {
      dedupeMinutes: 15,
      defaultCity: 'בית שמש',
      strictDirection: true,
      debugFilter: true,
      notifyOnReset: true,
    },
    ramUsageMB: 112,
    ramPercentage: 24,
    cpuLoad: '0.18',
    uptime: 86400 * 3 + 14200,
  };
}

export function getMockLogs(type: string = 'all'): LogItem[] {
  if (type === 'all') return [...mockLogs];
  return mockLogs.filter((l) => l.type === type);
}

export function applyMockCommand(cmd: string) {
  const c = String(cmd || '').trim();
  mockStats.commands += 1;
  if (/תפוס|עצור|סגור/.test(c)) {
    mockSearch = {
      active: false,
      mode: null,
      origin: null,
      destination: null,
      displayText: 'אין חיפוש פעיל',
      describe: 'החיפוש כבוי - הבוט לא ישלח נסיעות',
    };
    mockLogs.unshift({
      t: Date.now(),
      type: 'command',
      message: 'החיפוש הופסק (תפוס)',
    });
    return { ok: true, message: 'החיפוש הופסק בהצלחה', search: { ...mockSearch } };
  }

  if (c.includes('פנימי') || c.includes('פ שמש')) {
    mockSearch = {
      active: true,
      mode: 'internal',
      origin: 'בית שמש',
      destination: null,
      displayText: 'בית שמש (פנימי)',
      describe: 'רק נסיעות פנימיות בתוך בית שמש',
    };
  } else if (c.includes('לירושלים')) {
    mockSearch = {
      active: true,
      mode: 'route',
      origin: 'בית שמש',
      destination: 'ירושלים',
      displayText: 'בית שמש ⬅️ ירושלים',
      describe: 'נסיעות שיוצאות מבית שמש ומגיעות לירושלים',
    };
  } else if (c.includes('לבית שמש')) {
    mockSearch = {
      active: true,
      mode: 'route',
      origin: 'ירושלים',
      destination: 'בית שמש',
      displayText: 'ירושלים ⬅️ בית שמש',
      describe: 'נסיעות שיוצאות מירושלים ומגיעות לבית שמש',
    };
  } else {
    mockSearch = {
      active: true,
      mode: 'from',
      origin: 'בית שמש',
      destination: null,
      displayText: c.replace(/^פנוי\s*/, '') || 'בית שמש',
      describe: 'נסיעות שיוצאות מהיעד המבוקש',
    };
  }

  mockLogs.unshift({
    t: Date.now(),
    type: 'command',
    message: `הופעל חיפוש: ${mockSearch.displayText} (${mockSearch.mode})`,
  });

  return { ok: true, message: `חיפוש הופעל: ${mockSearch.displayText}`, search: { ...mockSearch } };
}
