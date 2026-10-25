export type LogType = 'scan' | 'sent' | 'rejected' | 'duplicate' | 'command' | 'system' | 'error';

export interface LogItem {
  id?: string;
  t: number;
  timestamp?: number;
  time?: string;
  date?: string;
  type: LogType;
  message: string;
  text?: string;
  reason?: string;
  groupId?: string;
  sender?: string;
  matchedCity?: string;
  [key: string]: any;
}

export interface ErrorReport {
  id: string;
  t: number;
  timestamp: number;
  time: string;
  date: string;
  category: string;
  message: string;
  stack?: string | null;
  details?: Record<string, any>;
}

export interface DriverState {
  active: boolean;
  mode: 'internal' | 'from' | 'route' | 'reduce' | null;
  origin: string | null;
  destination: string | null;
  displayText: string;
  describe?: string;
}

export interface ServerMetrics {
  cpuLoad: string;
  loadAvg?: string[];
  ramUsageMB: number;
  ramPercentage: number;
  ramUsedMB?: number;
  ramTotalMB?: number;
  uptime: number;
  hostUptime?: number;
  cores?: number;
  processUptimeMs?: number;
  pm2?: string;
  node?: string;
}

export interface BotStats {
  day?: string;
  scanned: number;
  sent: number;
  rejected: number;
  duplicates: number;
  commands: number;
  groups?: number;
  dedupeSize?: number;
  pendingUsersCount?: number;
  approvedUsersCount?: number;
}

export interface BotSettings {
  dedupeMinutes?: number;
  defaultCity?: string;
  strictDirection?: boolean;
  debugFilter?: boolean;
  notifyOnReset?: boolean;
  [key: string]: any;
}

export interface WhatsAppState {
  connected: boolean;
  registered?: boolean;
  pairingCode?: string | null;
  lastDisconnectReason?: string;
  botPhone?: string;
  adminPhone?: string;
  connectedDriversCount?: number;
}

export interface DriverSessionItem {
  phone: string;
  status: 'connected' | 'disconnected' | 'pairing_required' | 'pairing_ready' | string;
  registered?: boolean;
  pairingCode?: string | null;
  lastDisconnectReason?: string;
  connectedAt?: string;
}

export interface SessionsSummary {
  bot: WhatsAppState;
  drivers: DriverSessionItem[];
  totalConnectedDrivers: number;
}

export interface StatusPayload {
  ok: boolean;
  apiVersion?: number;
  wa: WhatsAppState;
  sessions?: SessionsSummary;
  search: DriverState;
  server: ServerMetrics;
  stats: BotStats;
  settings?: BotSettings;
  ramUsageMB?: number;
  ramPercentage?: number;
  cpuLoad?: string;
  uptime?: number;
}

export interface ConnectionConfig {
  baseUrl: string;
  useProxy: boolean;
  useDemoMode: boolean;
  pollIntervalMs: number;
}

export interface CityAlias {
  id: string;
  shortcut: string;
  city: string;
  note?: string;
}

export interface SpamTrimRule {
  id: string;
  enabled: boolean;
  name: string;
  pattern: string;
  isRegex?: boolean;
}

export interface ApprovedUser {
  id?: string;
  phone: string;
  name: string;
  role: 'admin' | 'driver' | 'user';
  addedAt: string;
  lid?: string;
  mappedPhone?: string;
  connectionStatus?: 'connected' | 'disconnected' | 'pairing_required' | 'pairing_ready' | string;
  searchState?: DriverState;
  connectedAt?: string | null;
}

export interface PendingUser {
  id?: string;
  phone: string;
  name: string;
  requestedAt: string;
  lid?: string;
  mappedPhone?: string;
}

export interface UsersDataPayload {
  ok: boolean;
  botPhone?: string;
  adminPhone: string;
  cooldownHours: number;
  approvedUsers: ApprovedUser[];
  pendingUsers: PendingUser[];
}

