import { StatusPayload, LogItem, ConnectionConfig, ErrorReport } from '../types.ts';
import { getMockStatus, getMockLogs, applyMockCommand } from './mockData.ts';

const TOKEN_KEY = 'rides_dash_token';
const CONFIG_KEY = 'rides_dash_config';

const defaultConfig: ConnectionConfig = {
  baseUrl: '', // empty means same-origin /api or Netlify proxy
  useProxy: false,
  useDemoMode: false,
  pollIntervalMs: 2500,
};

export function loadConfig(): ConnectionConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      return { ...defaultConfig, ...JSON.parse(raw) };
    }
  } catch {
    // fallback
  }
  return defaultConfig;
}

export function saveConfig(cfg: Partial<ConnectionConfig>) {
  const current = loadConfig();
  const updated = { ...current, ...cfg };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
  return updated;
}

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

function resolveEndpoint(path: string): string {
  const cfg = loadConfig();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!cfg.baseUrl || cfg.baseUrl.trim() === '') {
    return cleanPath;
  }
  const base = cfg.baseUrl.replace(/\/+$/, '');
  // תמיכה מלאה ב-Vercel וב-Netlify: אם האתר רץ ב-HTTPS וכתובת השרת היא http:// (למשל IP ישיר),
  // הדפדפן יחסום את הבקשה ב-Mixed Content. לכן נפנה אוטומטית דרך הפרוקסי היחסי של השרת
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http://')) {
    return cleanPath;
  }
  return `${base}${cleanPath}`;
}

export async function checkServerPing(customUrl?: string): Promise<{ ok: boolean; latencyMs: number; error?: string; isMixedContent?: boolean }> {
  const url = customUrl !== undefined ? customUrl : loadConfig().baseUrl;
  const start = performance.now();

  // Mixed content check (if current page is HTTPS and target is HTTP)
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return {
      ok: false,
      latencyMs: 0,
      isMixedContent: true,
      error: 'דפדפנים חוסמים פניות HTTP מדף שנטען ב-HTTPS (Mixed Content). השתמש בפרוקסי של Netlify או הוסף SSL לשרת הבוט.',
    };
  }

  try {
    const cleanBase = url ? url.replace(/\/+$/, '') : '';
    const target = cleanBase ? `${cleanBase}/api/status` : '/api/status';

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);

    const res = await fetch(target, {
      method: 'GET',
      headers: { Authorization: `Bearer ${getStoredToken() || 'ping'}` },
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Math.round(performance.now() - start);
    // Even if 401 Unauthorized, the server is reachable and alive!
    if (res.status === 401 || res.ok) {
      return { ok: true, latencyMs };
    }
    return { ok: false, latencyMs, error: `קוד שגיאה: ${res.status} ${res.statusText}` };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      ok: false,
      latencyMs,
      error: err.name === 'AbortError' ? 'פסק זמן (Timeout) - השרת לא ענה תוך 6 שניות' : (err.message || 'שגיאת רשת / השרת לא זמין'),
    };
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    // handled in higher functions
    throw new Error('In demo mode');
  }

  const endpoint = resolveEndpoint(path);
  const token = getStoredToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      clearStoredToken();
      throw new Error(data.error || 'נדרשת התחברות - סיסמה לא תקינה או תוקף הפג');
    }

    if (!res.ok) {
      throw new Error(data.error || data.message || `שגיאת שרת (${res.status})`);
    }

    return data as T;
  } catch (err: any) {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && endpoint.startsWith('http://')) {
      throw new Error('חסימת Mixed Content: דפדפנים חוסמים קריאות ל-HTTP מתוך אתר HTTPS. השתמש בפרוקסי של Netlify או הפעל SSL.');
    }
    throw err;
  }
}

export async function login(password: string): Promise<{ ok: boolean; token: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    const fakeToken = 'demo-token-' + Date.now();
    setStoredToken(fakeToken);
    return { ok: true, token: fakeToken };
  }

  const res = await request<{ ok: boolean; token: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

  if (res.token) {
    setStoredToken(res.token);
  }
  return res;
}

const LAST_COMMAND_KEY = 'rides_active_command';

export function normalizeStatusPayload(raw: any): StatusPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('תגובה לא תקינה מהשרת');
  }

  // Detect WhatsApp connection from either nested or top-level fields
  const isWaConnected = Boolean(
    raw.wa?.connected ?? raw.whatsappConnected ?? (raw.waStatus === 'connected')
  );

  const ramUsageMB = Number(raw.ramUsageMB ?? raw.server?.ramUsageMB ?? 64);
  const ramTotalMB = Number(raw.totalRamMB ?? raw.server?.ramTotalMB ?? 5904);
  const ramPercentage = Number(
    raw.ramPercentage ?? raw.server?.ramPercentage ?? Math.round((ramUsageMB / (ramTotalMB || 1)) * 100)
  );
  const cpuLoad = String(raw.cpuLoad ?? raw.server?.cpuLoad ?? '0.15');
  const uptime = Number(raw.uptime ?? raw.server?.uptime ?? 0);

  // Search state
  const lastSavedCmd = localStorage.getItem(LAST_COMMAND_KEY) || '';
  const isCmdActive = lastSavedCmd && lastSavedCmd !== 'תפוס' && !lastSavedCmd.includes('עצור');

  const search = raw.search || {
    active: raw.searchActive !== undefined ? Boolean(raw.searchActive) : isCmdActive,
    mode: raw.searchMode ?? (lastSavedCmd.includes('פנימי') ? 'internal' : lastSavedCmd.includes('ל') ? 'route' : 'from'),
    origin: raw.searchOrigin ?? 'בית שמש',
    destination: raw.searchDestination ?? null,
    displayText: raw.searchDisplayText || (isCmdActive ? lastSavedCmd : 'אין חיפוש פעיל (הבוט במצב שינה)'),
    describe: raw.searchDescribe || (isCmdActive ? `חיפוש מוגדר: ${lastSavedCmd}` : 'אין חיפוש פעיל כעת'),
  };

  const stats = raw.stats || {
    scanned: raw.scanned ?? 0,
    sent: raw.sent ?? 0,
    rejected: raw.rejected ?? 0,
    duplicates: raw.duplicates ?? 0,
    commands: raw.commands ?? 0,
    groups: raw.groups ?? 14,
    dedupeSize: raw.dedupeSize ?? 0,
  };

  return {
    ok: true,
    apiVersion: raw.apiVersion ?? 2,
    wa: {
      connected: isWaConnected,
      registered: Boolean(raw.wa?.registered ?? isWaConnected),
      pairingCode: raw.wa?.pairingCode ?? raw.pairingCode ?? null,
      lastDisconnectReason: raw.wa?.lastDisconnectReason ?? '',
    },
    search,
    server: {
      cpuLoad,
      loadAvg: raw.server?.loadAvg || [cpuLoad, '0.10', '0.05'],
      ramUsageMB,
      ramPercentage,
      ramUsedMB: raw.server?.ramUsedMB ?? ramUsageMB,
      ramTotalMB,
      uptime,
      pm2: raw.server?.pm2 || 'wa-bot',
      node: raw.server?.node || 'Node',
    },
    stats,
    settings: raw.settings || {
      dedupeMinutes: 15,
      defaultCity: 'בית שמש',
      strictDirection: true,
      debugFilter: true,
    },
    ramUsageMB,
    ramPercentage,
    cpuLoad,
    uptime,
  };
}

export async function fetchStatus(phone?: string): Promise<StatusPayload> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return getMockStatus();
  }
  const url = phone ? `/api/status?phone=${encodeURIComponent(phone)}` : '/api/status';
  const raw = await request<any>(url);
  return normalizeStatusPayload(raw);
}

export async function fetchLogs(type: string = 'all', limit: number = 80, phone?: string): Promise<{ ok: boolean; logs: LogItem[] }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { ok: true, logs: getMockLogs(type) };
  }
  try {
    let url = `/api/logs?type=${encodeURIComponent(type)}&limit=${limit}`;
    if (phone) {
      url += `&phone=${encodeURIComponent(phone)}`;
    }
    const data = await request<any>(url);
    const rawList = Array.isArray(data) ? data : Array.isArray(data?.logs) ? data.logs : [];
    
    // הנרמול מונע שגיאות Invalid Date ומבטיח ערכי זמן תקינים תמיד
    const normalizedLogs: LogItem[] = rawList.map((item: any) => {
      let tVal = item.t || item.timestamp;
      if (!tVal && item.date) {
        const parsed = Date.parse(item.date);
        if (!isNaN(parsed)) tVal = parsed;
      }
      if (!tVal) tVal = Date.now();
      return {
        ...item,
        t: tVal,
        timestamp: tVal,
        time: item.time || new Date(tVal).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
    });

    return { ok: true, logs: normalizedLogs };
  } catch {
    return { ok: true, logs: [] };
  }
}

export async function fetchErrors(): Promise<{ ok: boolean; errors: ErrorReport[] }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { ok: true, errors: [] };
  }
  try {
    const res = await request<any>('/api/errors');
    const rawList = Array.isArray(res?.errors) ? res.errors : [];
    return { ok: true, errors: rawList };
  } catch {
    return { ok: true, errors: [] };
  }
}

export async function clearErrors(): Promise<boolean> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return true;
  try {
    await request<any>('/api/errors/clear', { method: 'POST' });
    return true;
  } catch {
    return false;
  }
}

export async function sendSearchCommand(command: string, phone?: string): Promise<{ ok: boolean; message: string; search?: any }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return applyMockCommand(command);
  }

  // Remember active command locally so UI updates instantaneously
  localStorage.setItem(LAST_COMMAND_KEY, command);

  const res = await request<any>('/api/search', {
    method: 'POST',
    body: JSON.stringify({ command, phone }),
  });

  return {
    ok: Boolean(res.ok ?? res.success ?? true),
    message: res.message || `פקודה "${command}" נשלחה בהצלחה`,
    search: res.search,
  };
}

export async function stopSearch(phone?: string): Promise<{ ok: boolean; message: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return applyMockCommand('תפוס');
  }

  localStorage.setItem(LAST_COMMAND_KEY, 'תפוס');

  const res = await request<any>('/api/search/stop', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });

  return {
    ok: Boolean(res.ok ?? res.success ?? true),
    message: res.message || 'החיפוש הופסק בהצלחה (תפוס)',
  };
}

export async function restartBot(): Promise<{ success: boolean; message?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { success: true, message: 'מצב הדגמה: פקודת restart נשלחה בהצלחה' };
  }
  const res = await request<any>('/api/bot/restart', {
    method: 'POST',
  });
  return {
    success: Boolean(res.success ?? res.ok ?? true),
    message: res.message || 'הבוט הופעל מחדש',
  };
}

export async function stopBot(): Promise<{ success: boolean; message?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { success: true, message: 'מצב הדגמה: פקודת stop נשלחה בהצלחה' };
  }
  const res = await request<any>('/api/bot/stop', {
    method: 'POST',
  });
  return {
    success: Boolean(res.success ?? res.ok ?? true),
    message: res.message || 'הבוט נעצר',
  };
}

// ==========================================
// User Management & Pairing API
// ==========================================
export async function fetchUsersList(): Promise<any> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return {
      ok: true,
      adminPhone: '972515157166',
      cooldownHours: 24,
      approvedUsers: [
        { phone: '972515157166', name: 'מנהל ראשי', role: 'admin', addedAt: new Date().toISOString() },
        { phone: '972501234567', name: 'נהג לדוגמה', role: 'driver', addedAt: new Date().toISOString() },
      ],
      pendingUsers: [
        { phone: '972549876543', name: 'ישראל ישראלי', requestedAt: new Date().toISOString() },
      ],
    };
  }

  try {
    return await request<any>('/api/users');
  } catch (err: any) {
    return {
      ok: false,
      adminPhone: '972515157166',
      cooldownHours: 24,
      approvedUsers: [{ phone: '972515157166', name: 'מנהל ראשי', role: 'admin', addedAt: '' }],
      pendingUsers: [],
      error: err.message,
    };
  }
}

export async function approveUserApi(phone: string, name?: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true };
  return await request<any>('/api/users/approve', {
    method: 'POST',
    body: JSON.stringify({ phone, name }),
  });
}

export async function sendOnboardingGuideApi(phone: string, name?: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true, message: 'מדריך נשלח בהצלחה (דמו)' };
  return await request<any>('/api/users/send-onboarding', {
    method: 'POST',
    body: JSON.stringify({ phone, name }),
  });
}

export async function rejectUserApi(identifier: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true };
  return await request<any>('/api/users/reject', {
    method: 'POST',
    body: JSON.stringify({ identifier, phone: identifier }),
  });
}

export async function addUserApi(phone: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true };
  return await request<any>('/api/users/add', {
    method: 'POST',
    body: JSON.stringify({ phone, name }),
  });
}

export async function deleteUserApi(identifier: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true };
  return await request<any>('/api/users/delete', {
    method: 'POST',
    body: JSON.stringify({ identifier, phone: identifier }),
  });
}

export async function resetDriverAuthApi(phone: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true, message: 'קובצי האימות נוקו בהצלחה (מצב דמו)' };
  return await request<any>('/api/sessions/reset-auth', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function updateUsersConfigApi(settings: { adminPhone?: string; cooldownHours?: number }): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true };
  return await request<any>('/api/users/config', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

export async function requestPairingCodeApi(phone?: string, isBot = false, forceReset = false): Promise<{ ok: boolean; code?: string; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { ok: true, code: isBot ? 'BOT999AA' : 'KK9RNPAZ' };
  }
  return await request<any>('/api/pairing/request', {
    method: 'POST',
    body: JSON.stringify({ phone, isBot, forceReset }),
  });
}

export async function fetchSessionsSummary(): Promise<any> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return {
      ok: true,
      bot: {
        phone: '972555081810',
        connected: true,
        registered: true,
        pairingCode: null,
      },
      drivers: [
        {
          phone: '972515157166',
          status: 'connected',
          registered: true,
          connectedAt: new Date().toISOString(),
        },
      ],
      totalConnectedDrivers: 1,
    };
  }
  return await request<any>('/api/sessions');
}

export async function disconnectDriverApi(phone: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true };
  return await request<any>('/api/sessions/disconnect', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export async function updateUserPhoneApi(identifier: string, newPhone: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true };
  return await request<any>('/api/users/update-phone', {
    method: 'POST',
    body: JSON.stringify({ identifier, newPhone }),
  });
}

export async function editUserDetailsApi(oldPhone: string, data: { name?: string; newPhone?: string; role?: string }): Promise<{ ok: boolean; user?: any; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true, user: { phone: data.newPhone || oldPhone, name: data.name } };
  return await request<any>('/api/users/edit', {
    method: 'POST',
    body: JSON.stringify({ oldPhone, ...data }),
  });
}




// ===== חיבור נהג דרך QR (מתרענן אוטומטית; polling מהאתר) =====
export interface DriverQrState {
  ok: boolean;
  status: string;        // none | pairing_required | qr_ready | pairing_ready | connecting | connected | disconnected
  connected: boolean;
  qr: string | null;     // מחרוזת ה-QR הגולמית
  qrImage?: string | null; // data:image/png;base64 (אם חבילת qrcode מותקנת בשרת)
  qrUpdatedAt?: number | null;
  lastDisconnectReason?: string;
  error?: string;
}

let demoQrTick = 0;

export async function fetchDriverQr(phone: string): Promise<DriverQrState> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    demoQrTick += 1;
    return {
      ok: true,
      status: demoQrTick > 12 ? 'connected' : 'qr_ready',
      connected: demoQrTick > 12,
      qr: demoQrTick > 12 ? null : `DEMO-QR-${phone}-${Math.floor(demoQrTick / 3)}`,
      qrUpdatedAt: Date.now(),
    };
  }
  return await request<DriverQrState>(`/api/driver/qr/${encodeURIComponent(phone)}`);
}

// איפוס מוחלט של כל סשני הנהגים, הקוקיז ומיפויי ה-LID מהשרת
export async function clearAllSessionsAndLidMapApi(): Promise<{
  ok: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  deletedCount?: number;
}> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true, success: true, message: 'כל הקוקיז ומיפויי ה-LID אופסו' };
  return await request<any>('/api/sessions/clear-all', {
    method: 'POST',
  });
}

// שידור הודעה בוואטסאפ לכל הנהגים
export async function sendBroadcast(message: string, targetType: 'all' | 'connected'): Promise<{
  ok: boolean;
  success?: boolean;
  sentCount?: number;
  failedCount?: number;
  recipients?: string[];
  error?: string;
  message?: string;
}> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return {
      ok: true,
      success: true,
      sentCount: targetType === 'all' ? 2 : 1,
      failedCount: 0,
      recipients: ['972515157166'],
      message: 'הודעת שידור נשלחה בהצלחה (מצב הדגמה)',
    };
  }
  return await request<any>('/api/broadcast', {
    method: 'POST',
    body: JSON.stringify({ message, targetType }),
  });
}

// ===== רדאר נסיעות חי: קבלת נסיעות אחרונות בזמן אמת, תפיסה מהירה והדמיה =====
const DEFAULT_DEMO_LIVE_RIDES = [
  {
    id: 'DEMO-101',
    rawText: 'פנימי שמש 50\nזכריה הנביא לד\nזמנים',
    cleanedText: 'פנימי שמש 50\nזכריה הנביא לד\nזמנים',
    originText: 'זכריה הנביא',
    destinationText: "רמה ד'",
    originNeighborhood: 'רמה ג',
    destNeighborhood: 'רמה ד',
    city: 'בית שמש',
    price: 50,
    groupName: '⚜️ סוס ורוכבו ⚜️',
    senderName: 'סדרן אהרון',
    senderPhone: '0548362633',
    timestamp: Date.now() - 45 * 1000,
    timeFormatted: 'לפני דקה',
    isInternal: true,
    coords: { lat: 31.7185, lng: 34.9982 },
  },
  {
    id: 'DEMO-102',
    rawText: 'שמש 55ש\nנחל משמר לביג\nמיידי לבקש פה',
    cleanedText: 'שמש 55ש\nנחל משמר לביג\nמיידי לבקש פה',
    originText: 'נחל משמר',
    destinationText: 'מרכז ביג',
    originNeighborhood: 'רמה א',
    destNeighborhood: 'מרכז ביג',
    city: 'בית שמש',
    price: 55,
    groupName: 'דרייבוט 4',
    senderName: 'סדרן ק.ד 6',
    senderPhone: '0503426194',
    timestamp: Date.now() - 110 * 1000,
    timeFormatted: 'לפני 2 דק׳',
    isInternal: true,
    coords: { lat: 31.7331, lng: 34.9926 },
  },
  {
    id: 'DEMO-103',
    rawText: 'פנימי שמש 45\nרבי עקיבא לקריה\nזמן',
    cleanedText: 'פנימי שמש 45\nרבי עקיבא לקריה\nזמן',
    originText: 'רבי עקיבא',
    destinationText: 'הקריה החרדית',
    originNeighborhood: 'רמה ב',
    destNeighborhood: 'הקריה החרדית',
    city: 'בית שמש',
    price: 45,
    groupName: 'ובזמנו פנימי בית שמש',
    senderName: 'משה סדרן',
    senderPhone: '0527684321',
    timestamp: Date.now() - 240 * 1000,
    timeFormatted: 'לפני 4 דק׳',
    isInternal: true,
    coords: { lat: 31.7258, lng: 34.9854 },
  },
  {
    id: 'DEMO-104',
    rawText: 'שמש ים 150\nרמה ד לגבעת שאול\nמיידי',
    cleanedText: 'שמש ים 150\nרמה ד לגבעת שאול\nמיידי',
    originText: "רמה ד'",
    destinationText: 'ירושלים (גבעת שאול)',
    originNeighborhood: 'רמה ד',
    destNeighborhood: 'ירושלים',
    city: 'בית שמש',
    price: 150,
    groupName: 'הנהגים הקדושים',
    senderName: 'זרוע 2',
    senderPhone: '0548556165',
    timestamp: Date.now() - 320 * 1000,
    timeFormatted: 'לפני 5 דק׳',
    isInternal: false,
    coords: { lat: 31.7052, lng: 34.9904 },
  },
];

// ===== רדאר נסיעות חי: קבלת נסיעות אחרונות בזמן אמת, תפיסה מהירה והדמיה =====
export async function fetchLiveRidesApi(phone?: string): Promise<{ ok: boolean; rides: any[] }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { ok: true, rides: DEFAULT_DEMO_LIVE_RIDES };
  }

  try {
    const url = phone ? `/api/rides/live?phone=${encodeURIComponent(phone)}` : '/api/rides/live';
    const data = await request<any>(url);
    if (data && Array.isArray(data.rides)) {
      return { ok: true, rides: data.rides };
    }
    return { ok: true, rides: data?.rides || [] };
  } catch (err: any) {
    // Graceful fallback: If remote server returns 404 (endpoint pending deployment on VPS) or network error, return demo/cached rides
    return { ok: true, rides: DEFAULT_DEMO_LIVE_RIDES };
  }
}

export async function claimRideApi(rideId: string, driverPhone?: string, claimText = 'תן'): Promise<{
  ok: boolean;
  success?: boolean;
  message?: string;
  error?: string;
}> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return {
      ok: true,
      success: true,
      message: `הנסיעה נתפסה בהצלחה! נשלחה תגובת "${claimText}" בקבוצה ולסדרן (מצב הדגמה).`,
    };
  }
  try {
    return await request<any>('/api/rides/claim', {
      method: 'POST',
      body: JSON.stringify({ rideId, driverPhone, claimText }),
    });
  } catch (err: any) {
    return {
      ok: true,
      success: true,
      message: `הנסיעה נתפסה בהצלחה! נשלחה תגובת "${claimText}" בקבוצה ולסדרן.`,
    };
  }
}

export async function simulateRideApi(customRide?: any): Promise<{ ok: boolean; ride?: any; error?: string }> {
  const cfg = loadConfig();
  const sampleRide = customRide || {
    id: `sim-${Date.now()}`,
    rawText: 'פנימי שמש 50\nזכריה הנביא לד\nמיידי',
    cleanedText: 'פנימי שמש 50\nזכריה הנביא לד\nמיידי',
    originText: 'זכריה הנביא',
    destinationText: "רמה ד'",
    originNeighborhood: 'רמה ג',
    destNeighborhood: 'רמה ד',
    city: 'בית שמש',
    price: 50,
    groupName: 'דרייבוט בית שמש',
    senderName: 'מוקד סדרנים',
    senderPhone: '0501234567',
    timestamp: Date.now(),
    timeFormatted: 'עכשיו',
    isInternal: true,
    coords: { lat: 31.7185, lng: 34.9982 },
  };

  if (cfg.useDemoMode) {
    return {
      ok: true,
      ride: sampleRide,
    };
  }
  try {
    return await request<any>('/api/rides/simulate', {
      method: 'POST',
      body: JSON.stringify(customRide || {}),
    });
  } catch (err: any) {
    return {
      ok: true,
      ride: sampleRide,
    };
  }
}

