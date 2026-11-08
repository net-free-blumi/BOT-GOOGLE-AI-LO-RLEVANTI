import { StatusPayload, LogItem, DriverState, AnalyticsSummary, ApprovedUser, DriverActivityItem } from '../types.ts';

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

  if (c.includes('פנימי') || c.includes('פנוי פ ') || c.includes('פ שמש פ') || /^[א-ת\s]+\s+פ$/.test(c)) {
    mockSearch = {
      active: true,
      mode: 'internal',
      origin: 'בית שמש',
      destination: null,
      displayText: 'בית שמש (פנימי בלבד)',
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

export function getMockAnalytics(approvedUsers?: ApprovedUser[]): AnalyticsSummary {
  const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const today = new Date();
  
  const dailyStats = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const dayName = i === 6 ? 'היום' : i === 5 ? 'אתמול' : `יום ${dayNames[d.getDay()]}`;
    const base = 420 + i * 45;
    return {
      date: d.toISOString().split('T')[0],
      dayName,
      scanned: base,
      sent: Math.round(base * 0.18),
      rejected: Math.round(base * 0.65),
      duplicates: Math.round(base * 0.17),
      commands: 18 + i * 4,
    };
  });

  const baseStructure = {
    searchCategories: [
      {
        category: 'internal',
        name: 'פנימי (תוך-עירוני)',
        count: 68,
        percentage: 48,
        avgDurationMinutes: 52,
        color: '#10b981', // emerald
      },
      {
        category: 'route',
        name: 'בינעירוני (מסלול בין ערים)',
        count: 41,
        percentage: 29,
        avgDurationMinutes: 38,
        color: '#3b82f6', // blue
      },
      {
        category: 'reduce',
        name: 'צמצם ורדיוס מרחבי',
        count: 22,
        percentage: 15,
        avgDurationMinutes: 46,
        color: '#f59e0b', // amber
      },
      {
        category: 'from',
        name: 'יציאה מעיר לכל יעד',
        count: 11,
        percentage: 8,
        avgDurationMinutes: 31,
        color: '#a855f7', // purple
      },
    ],
    topRoutes: [
      {
        route: 'בית שמש פנימי (רמות א\', ג\', ד\', קריה)',
        origin: 'בית שמש',
        destination: 'פנימי',
        count: 68,
        activeDriversCount: 4,
      },
      {
        route: 'ירושלים ⬅️ בית שמש',
        origin: 'ירושלים',
        destination: 'בית שמש',
        count: 26,
        activeDriversCount: 2,
      },
      {
        route: 'בית שמש ⬅️ בני ברק',
        origin: 'בית שמש',
        destination: 'בני ברק',
        count: 19,
        activeDriversCount: 1,
      },
      {
        route: 'בית שמש ⬅️ ירושלים',
        origin: 'בית שמש',
        destination: 'ירושלים',
        count: 15,
        activeDriversCount: 1,
      },
      {
        route: 'שמש צמצם (כולל מושבים ואזורי תעשייה)',
        origin: 'בית שמש',
        destination: 'צמצם',
        count: 14,
        activeDriversCount: 2,
      },
      {
        route: 'בני ברק פנימי (רבי עקיבא / חזון איש)',
        origin: 'בני ברק',
        destination: 'פנימי',
        count: 9,
        activeDriversCount: 1,
      },
    ],
    hourlyTraffic: [
      { hour: '06:00', ridesCount: 8, searchesCount: 2 },
      { hour: '07:00', ridesCount: 28, searchesCount: 7 },
      { hour: '08:00', ridesCount: 45, searchesCount: 11 },
      { hour: '09:00', ridesCount: 38, searchesCount: 9 },
      { hour: '10:00', ridesCount: 22, searchesCount: 5 },
      { hour: '11:00', ridesCount: 19, searchesCount: 4 },
      { hour: '12:00', ridesCount: 25, searchesCount: 6 },
      { hour: '13:00', ridesCount: 39, searchesCount: 10 },
      { hour: '14:00', ridesCount: 42, searchesCount: 12 },
      { hour: '15:00', ridesCount: 36, searchesCount: 8 },
      { hour: '16:00', ridesCount: 24, searchesCount: 5 },
      { hour: '17:00', ridesCount: 31, searchesCount: 7 },
      { hour: '18:00', ridesCount: 44, searchesCount: 11 },
      { hour: '19:00', ridesCount: 53, searchesCount: 14 },
      { hour: '20:00', ridesCount: 68, searchesCount: 16 },
      { hour: '21:00', ridesCount: 74, searchesCount: 18 },
      { hour: '22:00', ridesCount: 62, searchesCount: 15 },
      { hour: '23:00', ridesCount: 35, searchesCount: 8 },
      { hour: '00:00', ridesCount: 18, searchesCount: 4 },
      { hour: '01:00', ridesCount: 9, searchesCount: 2 },
    ],
  };

  function getDriverRecentSearches(p: string, curr: string, active: boolean) {
    return [
      {
        id: `s-${p}-1`,
        query: active ? curr : (curr.includes('תפוס') ? 'בית שמש פנימי' : curr),
        mode: curr.includes('פנימי') ? 'internal' : curr.includes('צמצם') ? 'reduce' : 'route',
        startedAt: active ? 'פעיל עכשיו (לפני 25 דק׳)' : 'לפני 45 דק׳',
        durationMinutes: 25,
        status: (active ? 'active' : 'completed') as any,
        matchesCount: active ? 6 : 3,
      },
      {
        id: `s-${p}-2`,
        query: 'ירושלים ⬅️ בית שמש',
        mode: 'route',
        startedAt: 'לפני שעתיים',
        durationMinutes: 48,
        status: 'completed' as any,
        matchesCount: 8,
      },
      {
        id: `s-${p}-3`,
        query: 'שמש צמצם',
        mode: 'reduce',
        startedAt: 'לפני 4 שעות',
        durationMinutes: 35,
        status: 'completed' as any,
        matchesCount: 5,
      },
      {
        id: `s-${p}-4`,
        query: '🛑 תפוס',
        mode: 'stop',
        startedAt: 'הבוקר 09:30',
        durationMinutes: 50,
        status: 'completed' as any,
        matchesCount: 0,
      },
    ];
  }

  function getDriverHourly() {
    return [
      { hour: '07:00', ridesCount: 3, searchesCount: 1 },
      { hour: '08:00', ridesCount: 7, searchesCount: 2 },
      { hour: '09:00', ridesCount: 4, searchesCount: 1 },
      { hour: '12:00', ridesCount: 5, searchesCount: 2 },
      { hour: '13:00', ridesCount: 8, searchesCount: 3 },
      { hour: '17:00', ridesCount: 6, searchesCount: 2 },
      { hour: '19:00', ridesCount: 11, searchesCount: 3 },
      { hour: '20:00', ridesCount: 16, searchesCount: 5 },
      { hour: '21:00', ridesCount: 14, searchesCount: 4 },
      { hour: '22:00', ridesCount: 9, searchesCount: 2 },
    ];
  }

  function getDriverCategories() {
    return [
      { category: 'internal', name: 'פנימי בית שמש', count: 28, percentage: 55, avgDurationMinutes: 48, color: '#10b981' },
      { category: 'route', name: 'בינעירוני (י-ם / ב״ב)', count: 14, percentage: 28, avgDurationMinutes: 35, color: '#3b82f6' },
      { category: 'reduce', name: 'צמצם ורדיוס', count: 6, percentage: 12, avgDurationMinutes: 40, color: '#f59e0b' },
      { category: 'from', name: 'יציאות לכל יעד', count: 3, percentage: 5, avgDurationMinutes: 28, color: '#a855f7' },
    ];
  }

  // Build real driver activity based on approved users or real system defaults
  const drivers: DriverActivityItem[] = (approvedUsers && approvedUsers.length > 0)
    ? approvedUsers.map((u) => {
        const isActive = Boolean(u.searchState?.active);
        const searchDesc = isActive 
          ? (u.searchState?.displayText || 'פנימי בית שמש') 
          : 'תפוס (ללא חיפוש)';
        const totalSearches = isActive ? 18 : 6;
        const activeMinutes = isActive ? 140 : 25;
        return {
          phone: u.phone,
          name: u.name || (u.role === 'admin' ? 'מנהל ראשי' : 'נהג'),
          totalSearches,
          activeMinutes,
          currentSearch: searchDesc,
          lastActive: u.connectionStatus === 'connected' ? 'מחובר כעת' : 'מנותק',
          status: isActive ? 'active' : 'idle',
          recentSearches: getDriverRecentSearches(u.phone, searchDesc, isActive),
          hourlyActivity: getDriverHourly(),
          searchCategories: getDriverCategories(),
        };
      })
    : [
        {
          phone: '0556706325',
          name: 'ישראל מ.',
          totalSearches: 46,
          activeMinutes: 184,
          currentSearch: 'בית שמש פנימי',
          lastActive: 'מחובר כעת',
          status: 'active',
          recentSearches: getDriverRecentSearches('0556706325', 'בית שמש פנימי', true),
          hourlyActivity: getDriverHourly(),
          searchCategories: getDriverCategories(),
        },
        {
          phone: '0507787427',
          name: 'אברהם כ.',
          totalSearches: 32,
          activeMinutes: 140,
          currentSearch: 'ירושלים ⬅️ בית שמש',
          lastActive: 'מחובר כעת',
          status: 'active',
          recentSearches: getDriverRecentSearches('0507787427', 'ירושלים ⬅️ בית שמש', true),
          hourlyActivity: getDriverHourly(),
          searchCategories: getDriverCategories(),
        },
        {
          phone: '0528991234',
          name: 'דוד ל.',
          totalSearches: 28,
          activeMinutes: 95,
          currentSearch: 'תפוס (ללא חיפוש)',
          lastActive: 'לאחרונה',
          status: 'idle',
          recentSearches: getDriverRecentSearches('0528991234', 'תפוס', false),
          hourlyActivity: getDriverHourly(),
          searchCategories: getDriverCategories(),
        },
        {
          phone: '0544123890',
          name: 'יוסי ש.',
          totalSearches: 21,
          activeMinutes: 78,
          currentSearch: 'שמש צמצם',
          lastActive: 'מחובר כעת',
          status: 'active',
          recentSearches: getDriverRecentSearches('0544123890', 'שמש צמצם', true),
          hourlyActivity: getDriverHourly(),
          searchCategories: getDriverCategories(),
        },
        {
          phone: '0515157166',
          name: 'מנהל ראשי',
          totalSearches: 18,
          activeMinutes: 65,
          currentSearch: 'בית שמש פנימי',
          lastActive: 'מחובר כעת',
          status: 'active',
          recentSearches: getDriverRecentSearches('0515157166', 'בית שמש פנימי', true),
          hourlyActivity: getDriverHourly(),
          searchCategories: getDriverCategories(),
        },
      ];

  const activeSearchesNow = drivers.filter(d => d.status === 'active').length;

  return {
    ok: true,
    totalSearchesTracked: 142,
    avgSearchDurationMinutes: 44,
    activeSearchesNow,
    peakHour: '20:00 - 22:30',
    topSearchCategory: 'פנימי בית שמש (48%)',
    dailyStats,
    searchCategories: baseStructure.searchCategories,
    topRoutes: baseStructure.topRoutes,
    hourlyTraffic: baseStructure.hourlyTraffic,
    driverActivity: drivers,
  };
}
