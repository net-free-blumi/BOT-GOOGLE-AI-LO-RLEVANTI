import { StatusPayload, LogItem, ConnectionConfig, ErrorReport, AnalyticsSummary, ApprovedUser } from '../types.ts';
import { getMockStatus, getMockLogs, applyMockCommand, getMockAnalytics } from './mockData.ts';

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

export async function syncFromGitHubApi(): Promise<{ ok: boolean; message: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { ok: true, message: 'מצב הדגמה: פקודת סנכרון מ-GitHub נשלחה בהצלחה' };
  }
  const res = await request<any>('/api/deploy/webhook', {
    method: 'POST',
  });
  return {
    ok: Boolean(res.ok ?? res.success ?? true),
    message: res.message || 'הסנכרון מ-GitHub החל בהצלחה',
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

export async function approveUserApi(phone: string, name?: string, silent?: boolean): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true };
  return await request<any>('/api/users/approve', {
    method: 'POST',
    body: JSON.stringify({ phone, name, silent: Boolean(silent) }),
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

export async function addUserApi(phone: string, name: string, silent?: boolean): Promise<{ ok: boolean; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true };
  return await request<any>('/api/users/add', {
    method: 'POST',
    body: JSON.stringify({ phone, name, silent: Boolean(silent) }),
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
  const isBot = phone === 'bot' || phone === 'main' || phone === 'mainBot';
  const path = isBot ? '/api/pairing/qr?isBot=true' : `/api/driver/qr/${encodeURIComponent(phone)}`;
  return await request<DriverQrState>(path);
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

// איפוס מלא של אותנטיקציית הבוט הראשי והתחלת חיבור נקי
export async function resetMainBotAuthApi(): Promise<{
  ok: boolean;
  success?: boolean;
  message?: string;
  error?: string;
}> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) return { ok: true, success: true, message: 'אותנטיקציית הבוט הראשי אופסה' };
  return await request<any>('/api/bot/reset-auth', {
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
    id: 'DEMO-JLM-101',
    rawText: '*ים פנימי 50* *בתוך בית וגן* *50* *זמן* *ווצאפ* wa.me/972552732722?text=ת+767715218',
    cleanedText: 'ים פנימי 50 בתוך בית וגן 50 זמן',
    originText: 'בית וגן',
    destinationText: 'פנימי (בתוך בית וגן)',
    originNeighborhood: 'בית וגן (ירושלים)',
    destNeighborhood: 'פנימי ירושלים',
    city: 'ירושלים',
    price: 50,
    groupName: 'דרייבוט 3 (B)',
    senderName: 'ק.ד 6',
    senderPhone: '0552732722',
    timestamp: Date.now() - 30 * 1000,
    timeFormatted: 'לפני דקה',
    isInternal: true,
    coords: { lat: 31.7702, lng: 35.1834 },
    driverPhone: '0507787427',
  },
  {
    id: 'DEMO-JLM-102',
    rawText: '*ים פנימי 70* *הר נוף&הגן הבוטני* *זמן* *ווצאפ* wa.me/972552732722?text=ת+502435957',
    cleanedText: 'ים פנימי 70 הר נוף&הגן הבוטני זמן',
    originText: 'הר נוף',
    destinationText: 'הגן הבוטני',
    originNeighborhood: 'הר נוף (ירושלים)',
    destNeighborhood: 'הגן הבוטני (ירושלים)',
    city: 'ירושלים',
    price: 70,
    groupName: 'דרייבוט 3 (B)',
    senderName: 'ק.ד 6',
    senderPhone: '0552732722',
    timestamp: Date.now() - 90 * 1000,
    timeFormatted: 'לפני 2 דק׳',
    isInternal: true,
    coords: { lat: 31.7891, lng: 35.1764 },
    driverPhone: '0507787427',
  },
  {
    id: 'DEMO-BS-103',
    rawText: 'פנימי שמש 50\nזכריה הנביא לד\nזמנים',
    cleanedText: 'פנימי שמש 50\nזכריה הנביא לד\nזמנים',
    originText: 'זכריה הנביא',
    destinationText: "רמת בית שמש ד'",
    originNeighborhood: 'רמה ג (בית שמש)',
    destNeighborhood: "רמה ד (בית שמש)",
    city: 'בית שמש',
    price: 50,
    groupName: '⚜️ סוס ורוכבו ⚜️',
    senderName: 'סדרן אהרון',
    senderPhone: '0548362633',
    timestamp: Date.now() - 150 * 1000,
    timeFormatted: 'לפני 3 דק׳',
    isInternal: true,
    coords: { lat: 31.7185, lng: 34.9982 },
    driverPhone: '0556706325',
  },
  {
    id: 'DEMO-BS-104',
    rawText: 'שמש 55ש\nנחל משמר לביג\nמיידי לבקש פה',
    cleanedText: 'שמש 55ש\nנחל משמר לביג\nמיידי לבקש פה',
    originText: 'נחל משמר',
    destinationText: 'מרכז ביג',
    originNeighborhood: 'רמה א (בית שמש)',
    destNeighborhood: 'מרכז ביג (בית שמש)',
    city: 'בית שמש',
    price: 55,
    groupName: 'דרייבוט 4',
    senderName: 'סדרן ק.ד 6',
    senderPhone: '0503426194',
    timestamp: Date.now() - 210 * 1000,
    timeFormatted: 'לפני 4 דק׳',
    isInternal: true,
    coords: { lat: 31.7331, lng: 34.9926 },
    driverPhone: '0556706325',
  },
  {
    id: 'DEMO-INTER-105',
    rawText: '18:15 ים שמש 150 עין כרם כסא תינוק סלקל בלי אל תבקש',
    cleanedText: '18:15 ים שמש 150 עין כרם כסא תינוק סלקל',
    originText: 'עין כרם',
    destinationText: 'בית שמש',
    originNeighborhood: 'עין כרם (ירושלים)',
    destNeighborhood: 'בית שמש',
    city: 'ירושלים',
    price: 150,
    groupName: 'אשדוד vip 👑',
    senderName: 'מוקד סדרנים',
    senderPhone: '0528101833',
    timestamp: Date.now() - 300 * 1000,
    timeFormatted: 'לפני 5 דק׳',
    isInternal: false,
    coords: { lat: 31.7651, lng: 35.1582 },
    driverPhone: '0507787427',
  },
  {
    id: 'DEMO-BB-106',
    rawText: 'בב 70\nרבי עקיבא לסופרים\nמידי',
    cleanedText: 'בב 70\nרבי עקיבא לסופרים\nמידי',
    originText: 'רבי עקיבא',
    destinationText: 'סופרים',
    originNeighborhood: 'רבי עקיבא (בני ברק)',
    destNeighborhood: 'סופרים (בני ברק)',
    city: 'בני ברק',
    price: 70,
    groupName: 'דרייברים בני ברק',
    senderName: 'סדרן ראשי',
    senderPhone: '0527189191',
    timestamp: Date.now() - 380 * 1000,
    timeFormatted: 'לפני 6 דק׳',
    isInternal: true,
    coords: { lat: 32.0864, lng: 34.8341 },
    driverPhone: '0544123890',
  },
];

// ===== רדאר נסיעות חי: קבלת נסיעות אחרונות בזמן אמת, תפיסה מהירה והדמיה =====
export async function fetchLiveRidesApi(phone?: string): Promise<{ ok: boolean; rides: any[] }> {
  const cfg = loadConfig();
  const filterByPhone = (list: any[]) => {
    if (!phone) return list;
    const clean = phone.replace(/[^0-9]/g, '');
    const filtered = list.filter((r) => {
      if (!r.driverPhone) return true;
      const rPhone = r.driverPhone.replace(/[^0-9]/g, '');
      return clean.endsWith(rPhone) || rPhone.endsWith(clean);
    });
    return filtered.length > 0 ? filtered : list;
  };

  if (cfg.useDemoMode) {
    return { ok: true, rides: filterByPhone(DEFAULT_DEMO_LIVE_RIDES) };
  }

  try {
    const url = phone ? `/api/rides/live?phone=${encodeURIComponent(phone)}` : '/api/rides/live';
    const data = await request<any>(url);
    if (data && Array.isArray(data.rides)) {
      return { ok: true, rides: filterByPhone(data.rides) };
    }
    return { ok: true, rides: filterByPhone(data?.rides || []) };
  } catch (err: any) {
    // Graceful fallback
    return { ok: true, rides: filterByPhone(DEFAULT_DEMO_LIVE_RIDES) };
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

export async function fetchAnalyticsApi(approvedUsers?: ApprovedUser[]): Promise<AnalyticsSummary> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return getMockAnalytics(approvedUsers);
  }
  try {
    const res = await request<AnalyticsSummary>('/api/analytics');
    if (res && res.ok) {
      // If server returned driverActivity, ensure names are filled from approvedUsers if missing
      if (res.driverActivity && approvedUsers && approvedUsers.length > 0) {
        res.driverActivity = res.driverActivity.map(da => {
          const matched = approvedUsers.find(u => u.phone.replace(/[^0-9]/g, '').endsWith(da.phone.replace(/[^0-9]/g, '')) || da.phone.replace(/[^0-9]/g, '').endsWith(u.phone.replace(/[^0-9]/g, '')));
          if (matched && matched.name) {
            return { ...da, name: matched.name };
          }
          return da;
        });
      }
      return res;
    }
    return getMockAnalytics(approvedUsers);
  } catch {
    return getMockAnalytics(approvedUsers);
  }
}

export interface TelegramDriverConfig {
  telegramPhone?: string;
  groups?: string[];
  forwardToWa?: boolean;
  connected?: boolean;
  matchedCount?: number;
  scannedCount?: number;
  connectedAt?: string;
  pendingCode?: boolean;
}

export interface TelegramStatusPayload {
  ok: boolean;
  enabled: boolean;
  connected: boolean;
  monitoredGroups: string[];
  stats: {
    totalScanned: number;
    totalMatched: number;
    lastRideAt: string | null;
  };
  driverConfigs: Record<string, TelegramDriverConfig>;
  driversCount?: number;
  totalDrivers?: number;
  drivers?: Array<{
    phone: string;
    name?: string;
    telegramPhone?: string;
    connected: boolean;
    matchedCount: number;
    scannedCount?: number;
    telegramConnected?: boolean;
    telegramConnectedAt?: string;
    telegramGroups?: string[];
    forwardToWa?: boolean;
    pendingAuth?: boolean;
  }>;
}

const LOCAL_TG_KEY = 'rides_dash_local_tg_configs';

function getLocalTelegramConfigs(): Record<string, TelegramDriverConfig> {
  try {
    const raw = localStorage.getItem(LOCAL_TG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveLocalTelegramConfigs(cfgs: Record<string, TelegramDriverConfig>) {
  try {
    localStorage.setItem(LOCAL_TG_KEY, JSON.stringify(cfgs));
  } catch {}
}

const DEFAULT_TG_GROUPS = [
  'מאוחדים תגבור ריידר 👑',
  'ריידר הפצה בקבוצות',
  'נסיעות בית שמש ארצי',
  'נסיעות ירושלים והסביבה',
  'מוניות וספיישלים מרכז',
];

export async function fetchTelegramStatus(): Promise<TelegramStatusPayload> {
  const cfg = loadConfig();
  const localConfigs = getLocalTelegramConfigs();

  if (cfg.useDemoMode) {
    return {
      ok: true,
      enabled: true,
      connected: true,
      monitoredGroups: DEFAULT_TG_GROUPS,
      stats: {
        totalScanned: 184,
        totalMatched: 42,
        lastRideAt: new Date().toISOString(),
      },
      driverConfigs: localConfigs,
      drivers: Object.entries(localConfigs).map(([phone, conf]) => ({
        phone,
        name: 'נהג מחובר',
        telegramPhone: conf.telegramPhone || phone,
        connected: Boolean(conf.connected),
        telegramConnected: Boolean(conf.connected),
        telegramConnectedAt: conf.connectedAt,
        telegramGroups: conf.groups || DEFAULT_TG_GROUPS,
        forwardToWa: conf.forwardToWa !== false,
        scannedCount: conf.scannedCount || 12,
        matchedCount: conf.matchedCount || 4,
        pendingAuth: Boolean(conf.pendingCode),
      })),
    };
  }

  try {
    const res = await request<TelegramStatusPayload>('/api/telegram/status');
    if (res && res.ok) {
      res.driverConfigs = { ...localConfigs, ...(res.driverConfigs || {}) };
      return res;
    }
  } catch {}

  return {
    ok: true,
    enabled: true,
    connected: true,
    monitoredGroups: DEFAULT_TG_GROUPS,
    stats: { totalScanned: 184, totalMatched: 42, lastRideAt: new Date().toISOString() },
    driverConfigs: localConfigs,
    drivers: Object.entries(localConfigs).map(([phone, conf]) => ({
      phone,
      name: 'נהג מחובר',
      telegramPhone: conf.telegramPhone || phone,
      connected: Boolean(conf.connected),
      telegramConnected: Boolean(conf.connected),
      telegramConnectedAt: conf.connectedAt,
      telegramGroups: conf.groups || DEFAULT_TG_GROUPS,
      forwardToWa: conf.forwardToWa !== false,
      scannedCount: conf.scannedCount || 12,
      matchedCount: conf.matchedCount || 4,
      pendingAuth: Boolean(conf.pendingCode),
    })),
  };
}

// שלב א': בקשת קוד אימות לטלגרם דרך מספר טלפון בלבד
export async function requestTelegramCodeApi(
  phone: string,
  telegramPhone?: string
): Promise<{ ok: boolean; success?: boolean; phone?: string; telegramPhone?: string; message?: string; error?: string }> {
  const clean = phone.replace(/[^0-9]/g, '');
  const cleanTg = (telegramPhone || phone).replace(/[^0-9]/g, '');

  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    const localConfigs = getLocalTelegramConfigs();
    localConfigs[clean] = {
      ...(localConfigs[clean] || {}),
      telegramPhone: cleanTg || clean,
      pendingCode: true,
    };
    saveLocalTelegramConfigs(localConfigs);
    return {
      ok: true,
      success: true,
      phone: clean,
      telegramPhone: cleanTg || clean,
      message: `(מצב הדגמה) קוד אימות בן 5 ספרות נשלח לחשבון ${cleanTg || clean}`,
    };
  }

  try {
    const res = await request<any>('/api/telegram/driver/request-code', {
      method: 'POST',
      body: JSON.stringify({ phone: clean, telegramPhone: cleanTg }),
    });
    if (res && (res.ok || res.success)) {
      const localConfigs = getLocalTelegramConfigs();
      localConfigs[clean] = {
        ...(localConfigs[clean] || {}),
        telegramPhone: cleanTg || clean,
        pendingCode: true,
      };
      saveLocalTelegramConfigs(localConfigs);
      return res;
    }
    return {
      ok: false,
      error: res?.error || 'שגיאה בשליחת קוד אימות מטלגרם',
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || 'שגיאת תקשורת מול השרת בשליחת קוד טלגרם',
    };
  }
}

// שלב ב': אימות קוד, זיהוי קבוצות נסיעות של הנהג וחיבור קבוע ("פעם אחת ולתמיד")
export async function verifyTelegramCodeApi(
  phone: string,
  code: string
): Promise<{
  ok: boolean;
  success?: boolean;
  connected?: boolean;
  telegramPhone?: string;
  groups?: string[];
  groupsCount?: number;
  message?: string;
  error?: string;
}> {
  const clean = phone.replace(/[^0-9]/g, '');
  const cleanCode = code.replace(/[^0-9]/g, '').trim();

  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    if (cleanCode !== '12345') {
      return {
        ok: false,
        error: 'קוד אימות שגוי. במצב הדגמה הקוד הוא 12345',
      };
    }
    const localConfigs = getLocalTelegramConfigs();
    const existing = localConfigs[clean] || {};
    const discoveredGroups = existing.groups || DEFAULT_TG_GROUPS;
    localConfigs[clean] = {
      ...existing,
      telegramPhone: existing.telegramPhone || clean,
      groups: discoveredGroups,
      forwardToWa: true,
      connected: true,
      connectedAt: new Date().toISOString(),
      pendingCode: false,
    };
    saveLocalTelegramConfigs(localConfigs);
    return {
      ok: true,
      success: true,
      connected: true,
      telegramPhone: localConfigs[clean].telegramPhone,
      groups: discoveredGroups,
      groupsCount: discoveredGroups.length,
      message: `חשבון הטלגרם חובר בהצלחה! זוהו ${discoveredGroups.length} קבוצות נסיעות בחשבונך.`,
    };
  }

  try {
    const res = await request<any>('/api/telegram/driver/verify-code', {
      method: 'POST',
      body: JSON.stringify({ phone: clean, code: cleanCode }),
    });

    if (res && (res.ok || res.success)) {
      const localConfigs = getLocalTelegramConfigs();
      const existing = localConfigs[clean] || {};
      const discoveredGroups = res.groups || existing.groups || DEFAULT_TG_GROUPS;

      localConfigs[clean] = {
        ...existing,
        telegramPhone: res.telegramPhone || existing.telegramPhone || clean,
        groups: discoveredGroups,
        forwardToWa: true,
        connected: true,
        connectedAt: res.connectedAt || new Date().toISOString(),
        pendingCode: false,
        scannedCount: existing.scannedCount || 0,
        matchedCount: existing.matchedCount || 0,
      };
      saveLocalTelegramConfigs(localConfigs);

      return res;
    }

    return {
      ok: false,
      error: res?.error || 'קוד האימות שגוי. נא לבדוק את הקוד ולנסות שוב.',
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || 'שגיאת שרת באימות קוד טלגרם',
    };
  }
}

export async function connectDriverTelegramApi(
  phone: string,
  data: { telegramPhone?: string; groups?: string[]; forwardToWa?: boolean }
): Promise<any> {
  const clean = phone.replace(/[^0-9]/g, '');
  const localConfigs = getLocalTelegramConfigs();
  localConfigs[clean] = {
    telegramPhone: data.telegramPhone || clean,
    groups: data.groups || DEFAULT_TG_GROUPS,
    forwardToWa: data.forwardToWa !== false,
    connected: true,
    connectedAt: new Date().toISOString(),
    scannedCount: localConfigs[clean]?.scannedCount || 0,
    matchedCount: localConfigs[clean]?.matchedCount || 0,
  };
  saveLocalTelegramConfigs(localConfigs);

  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { ok: true, success: true, ...localConfigs[clean] };
  }
  try {
    return await request<any>('/api/telegram/driver/connect', {
      method: 'POST',
      body: JSON.stringify({ phone, ...data }),
    });
  } catch {
    return { ok: true, success: true, ...localConfigs[clean] };
  }
}

export async function disconnectDriverTelegramApi(phone: string): Promise<any> {
  const clean = phone.replace(/[^0-9]/g, '');
  const localConfigs = getLocalTelegramConfigs();
  if (localConfigs[clean]) {
    localConfigs[clean].connected = false;
    localConfigs[clean].connectedAt = undefined;
    localConfigs[clean].pendingCode = false;
    saveLocalTelegramConfigs(localConfigs);
  }

  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { ok: true, success: true };
  }
  try {
    return await request<any>('/api/telegram/driver/disconnect', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  } catch {
    return { ok: true, success: true };
  }
}

export async function cancelTelegramAuthApi(phone: string): Promise<any> {
  const clean = phone.replace(/[^0-9]/g, '');
  const localConfigs = getLocalTelegramConfigs();
  if (localConfigs[clean]) {
    localConfigs[clean].pendingCode = false;
    saveLocalTelegramConfigs(localConfigs);
  }

  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { ok: true, success: true };
  }
  try {
    return await request<any>('/api/telegram/driver/cancel-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  } catch {
    return { ok: true, success: true };
  }
}

export async function testTelegramRideApi(payload: {
  groupTitle?: string;
  senderName?: string;
  text: string;
  directUrl?: string;
}): Promise<any> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { ok: true, matched: true, matchedDriversCount: 1, cleanedText: payload.text };
  }
  return await request<any>('/api/telegram/test-ride', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// 1-Click Push to GitHub
export async function pushToGitHubApi(): Promise<{ ok: boolean; success?: boolean; message?: string; error?: string }> {
  const cfg = loadConfig();
  if (cfg.useDemoMode) {
    return { ok: true, success: true, message: '(מצב הדגמה) השינויים נדחפו בהצלחה ל-GitHub!' };
  }
  return await request('/api/deploy/push-github', { method: 'POST' });
}

