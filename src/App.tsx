import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  StatusPayload, 
  LogItem, 
  ConnectionConfig,
  CityAlias,
  SpamTrimRule,
  ApprovedUser,
  ErrorReport
} from './types.ts';
import { 
  loadConfig, 
  saveConfig, 
  getStoredToken, 
  setStoredToken, 
  clearStoredToken,
  login, 
  fetchStatus, 
  fetchLogs, 
  sendSearchCommand, 
  stopSearch, 
  restartBot, 
  stopBot,
  fetchUsersList,
  fetchErrors,
  clearErrors
} from './services/api.ts';
import { loadShortcuts, saveShortcuts } from './services/shortcuts.ts';
import { loadSpamRules, saveSpamRules, cleanRideMessage } from './services/spamCleaner.ts';
import { Navbar } from './components/Navbar.tsx';
import { StatsCards } from './components/StatsCards.tsx';
import { ActiveSearchCard } from './components/ActiveSearchCard.tsx';
import { BotControlCard } from './components/BotControlCard.tsx';
import { SettingsCard } from './components/SettingsCard.tsx';
import { LiveLogsCard } from './components/LiveLogsCard.tsx';
import { ConnectionModal } from './components/ConnectionModal.tsx';
import { NetlifyGuideModal } from './components/NetlifyGuideModal.tsx';
import { CityShortcutsModal } from './components/CityShortcutsModal.tsx';
import { SpamCleanerModal } from './components/SpamCleanerModal.tsx';
import { AiHandoffModal } from './components/AiHandoffModal.tsx';
import { UsersManagementModal } from './components/UsersManagementModal.tsx';
import { BugTrackerModal } from './components/BugTrackerModal.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { AlertCircle, CheckCircle2, X, Bug } from 'lucide-react';

export default function App() {
  const [config, setConfig] = useState<ConnectionConfig>(loadConfig);
  // Do NOT fall back to 'active-session': strictly require stored token from localStorage or authentic login
  const [token, setToken] = useState<string>(() => getStoredToken() || '');
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [selectedLogType, setSelectedLogType] = useState<string>('all');
  const [isApiConnected, setIsApiConnected] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Multi-Driver Selection
  const [selectedDriverPhone, setSelectedDriverPhone] = useState<string>(() => {
    return localStorage.getItem('rides_selected_driver') || '';
  });
  const [approvedUsersList, setApprovedUsersList] = useState<ApprovedUser[]>([]);

  // Feature States
  const [shortcuts, setShortcuts] = useState<CityAlias[]>(loadShortcuts);
  const [spamRules, setSpamRules] = useState<SpamTrimRule[]>(loadSpamRules);

  // Modals
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [netlifyModalOpen, setNetlifyModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [spamModalOpen, setSpamModalOpen] = useState(false);
  const [aiHandoffModalOpen, setAiHandoffModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [errorsList, setErrorsList] = useState<ErrorReport[]>([]);

  // Toast notifications
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  const showToast = (message: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  };

  // Poll timer reference
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const refreshData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const [statusRes, logsRes, usersRes, errorsRes] = await Promise.all([
        fetchStatus(selectedDriverPhone || undefined),
        fetchLogs(selectedLogType, 100, selectedDriverPhone || undefined),
        fetchUsersList().catch(() => null),
        fetchErrors().catch(() => ({ ok: true, errors: [] })),
      ]);
      setStatus(statusRes);

      if (usersRes?.approvedUsers) {
        setApprovedUsersList(usersRes.approvedUsers);
      }

      if (errorsRes?.errors) {
        setErrorsList(errorsRes.errors);
      }

      // Clean incoming raw logs according to user rules
      const cleanedLogs = (logsRes.logs || []).map((l) => {
        if (l.text) {
          const { cleaned } = cleanRideMessage(l.text, spamRules);
          return { ...l, text: cleaned };
        }
        return l;
      });

      setLogs(cleanedLogs);
      setIsApiConnected(true);
      setLastUpdated(new Date());
    } catch (err: any) {
      setIsApiConnected(false);
      if (err.message && err.message.includes('נדרשת התחברות')) {
        clearStoredToken();
        setToken('');
      }
    } finally {
      if (isManual) setIsRefreshing(false);
    }
  }, [selectedLogType, spamRules, selectedDriverPhone]);

  const handleClearErrors = async () => {
    const ok = await clearErrors();
    if (ok) {
      setErrorsList([]);
      showToast('יומן השגיאות נוקה בהצלחה', 'ok');
    } else {
      showToast('שגיאה בניקוי יומן השגיאות', 'err');
    }
  };

  // Dynamic Polling with Eco / Sleep mode:
  // When search is inactive (sleep), poll every 6s instead of 2.5s to reduce VPS CPU
  const isSearchActive = Boolean(status?.search?.active);
  const currentInterval = isSearchActive ? config.pollIntervalMs : Math.max(config.pollIntervalMs * 2, 5000);

  useEffect(() => {
    if (!token && !config.useDemoMode) return;

    refreshData();

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      refreshData();
    }, currentInterval);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [token, currentInterval, config.useDemoMode, refreshData]);

  // Handle Login
  const handleLogin = async (password: string) => {
    setLoginError(null);
    setActionLoading(true);
    try {
      const res = await login(password);
      setToken(res.token);
      showToast('התחברת בהצלחה למערכת!', 'ok');
      await refreshData(true);
    } catch (err: any) {
      setLoginError(
        err.message || 'התחברות נכשלה. ודא שהסיסמה נכונה ושהשרת זמין בפורט 3000.'
      );
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Enter Demo Mode
  const handleEnterDemoMode = () => {
    const updated = saveConfig({ useDemoMode: true });
    setConfig(updated);
    setToken('demo-mode-token');
    showToast('הופעל מצב הדגמה! כל הפעולות זמינות לבדיקה.', 'ok');
  };

  // Handle Logout
  const handleLogout = () => {
    clearStoredToken();
    setToken('');
    const updated = saveConfig({ useDemoMode: false });
    setConfig(updated);
    setStatus(null);
    showToast('התנתקת מהמערכת', 'ok');
  };

  // Handle Command
  const handleSendCommand = async (cmd: string) => {
    setActionLoading(true);
    try {
      const res = await sendSearchCommand(cmd, selectedDriverPhone || undefined);
      showToast(res.message || 'הפקודה בוצעה בהצלחה', 'ok');
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'שגיאה בביצוע הפקודה', 'err');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Stop Search
  const handleStopSearch = async () => {
    setActionLoading(true);
    try {
      const res = await stopSearch(selectedDriverPhone || undefined);
      showToast('החיפוש הופסק (תפוס) - הבוט עבר למצב שינה', 'ok');
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'שגיאה בעצירת החיפוש', 'err');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Restart Bot
  const handleRestartBot = async () => {
    setActionLoading(true);
    try {
      const res = await restartBot();
      showToast(res.message || 'הוראת הפעלה מחדש נשלחה לתהליך PM2', 'ok');
      setTimeout(() => refreshData(), 3000);
    } catch (err: any) {
      showToast(err.message || 'שגיאה באתחול הבוט', 'err');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Stop Bot
  const handleStopBot = async () => {
    setActionLoading(true);
    try {
      const res = await stopBot();
      showToast(res.message || 'תהליך הבוט נעצר', 'ok');
      await refreshData();
    } catch (err: any) {
      showToast(err.message || 'שגיאה בעצירת הבוט', 'err');
    } finally {
      setActionLoading(false);
    }
  };

  // If not authenticated and not demo mode, render login screen
  if (!token && !config.useDemoMode) {
    return (
      <>
        <LoginScreen
          onLogin={handleLogin}
          onOpenConnectionModal={() => setConnectionModalOpen(true)}
          onEnterDemoMode={handleEnterDemoMode}
          config={config}
          loading={actionLoading}
          error={loginError}
        />
        <ConnectionModal
          config={config}
          isOpen={connectionModalOpen}
          onClose={() => setConnectionModalOpen(false)}
          onUpdateConfig={(newCfg) => setConfig(newCfg)}
          onOpenNetlifyGuide={() => {
            setConnectionModalOpen(false);
            setNetlifyModalOpen(true);
          }}
        />
        <NetlifyGuideModal
          isOpen={netlifyModalOpen}
          onClose={() => setNetlifyModalOpen(false)}
          serverUrl={config.baseUrl}
        />
      </>
    );
  }

  // Fallback default state while initial load
  const waState = status?.wa || { connected: false };
  const searchState = status?.search || {
    active: false,
    mode: null,
    origin: null,
    destination: null,
    displayText: 'טוען נתונים...',
  };
  const serverState = status?.server || {
    cpuLoad: '—',
    ramUsageMB: 0,
    ramPercentage: 0,
    uptime: 0,
  };
  const statsState = status?.stats || {
    scanned: 0,
    sent: 0,
    rejected: 0,
    duplicates: 0,
    commands: 0,
  };

  return (
    <div className="min-h-screen bg-[#07090d] text-[#e8eef7] selection:bg-amber-500/20 selection:text-amber-300 pb-16" dir="rtl">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 animate-in slide-in-from-bottom duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold backdrop-blur-md ${
              toast.type === 'ok'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
            }`}
          >
            {toast.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="mr-2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Navbar */}
      <Navbar
        wa={waState}
        search={searchState}
        isApiConnected={isApiConnected}
        isRefreshing={isRefreshing}
        config={config}
        pendingUsersCount={status?.stats?.pendingUsersCount ?? 0}
        approvedUsers={approvedUsersList}
        selectedDriverPhone={selectedDriverPhone}
        onSelectDriverPhone={(phone) => {
          setSelectedDriverPhone(phone);
          localStorage.setItem('rides_selected_driver', phone);
        }}
        onRefresh={() => refreshData(true)}
        onOpenConnectionModal={() => setConnectionModalOpen(true)}
        onOpenNetlifyModal={() => setNetlifyModalOpen(true)}
        onOpenShortcutsModal={() => setShortcutsModalOpen(true)}
        onOpenSpamModal={() => setSpamModalOpen(true)}
        onOpenAiHandoffModal={() => setAiHandoffModalOpen(true)}
        onOpenUsersModal={() => setUsersModalOpen(true)}
        onOpenBugModal={() => setBugModalOpen(true)}
        errorsCount={errorsList.length}
        onLogout={handleLogout}
        onToggleDemoMode={() => {
          const updated = saveConfig({ useDemoMode: !config.useDemoMode });
          setConfig(updated);
        }}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Offline Banner (if not in demo mode and disconnected) */}
        {!isApiConnected && !config.useDemoMode && (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex flex-wrap items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <span className="font-bold block">השרת (82.70.210.206:3000) אינו מגיב כרגע</span>
                <span className="text-rose-200/80 text-[11px]">
                  ודא שקובץ <code className="font-mono">dashboard-api.js</code> פועל ב-PM2, או עבור למצב הדגמה לבחינת האתר.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleEnterDemoMode}
                className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 font-semibold cursor-pointer"
              >
                הפעל מצב הדגמה
              </button>
              <button
                onClick={() => setConnectionModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-semibold cursor-pointer"
              >
                הגדרות חיבור
              </button>
            </div>
          </div>
        )}

        {/* 1. Stats Telemetry Cards */}
        <StatsCards server={serverState} stats={statsState} />

        {/* 2. Search Control and Bot Control (2-Column Grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <ActiveSearchCard
              search={searchState}
              onSendCommand={handleSendCommand}
              onStopSearch={handleStopSearch}
              shortcuts={shortcuts}
              onOpenShortcutsModal={() => setShortcutsModalOpen(true)}
              loading={actionLoading}
            />
          </div>
          <div className="lg:col-span-5 space-y-6">
            <BotControlCard
              wa={waState}
              onRestartBot={handleRestartBot}
              onStopBot={handleStopBot}
              loading={actionLoading}
            />
            <SettingsCard
              settings={status?.settings}
              stats={statsState}
            />
          </div>
        </div>

        {/* 3. Live Logs Stream with spam filtering */}
        <LiveLogsCard
          logs={logs}
          selectedType={selectedLogType}
          onSelectType={(type) => {
            setSelectedLogType(type);
          }}
          lastUpdated={lastUpdated}
          loading={isRefreshing}
        />
      </main>

      {/* Modals */}
      <ConnectionModal
        config={config}
        isOpen={connectionModalOpen}
        onClose={() => setConnectionModalOpen(false)}
        onUpdateConfig={(newCfg) => {
          setConfig(newCfg);
          refreshData(true);
        }}
        onOpenNetlifyGuide={() => {
          setConnectionModalOpen(false);
          setNetlifyModalOpen(true);
        }}
      />

      <NetlifyGuideModal
        isOpen={netlifyModalOpen}
        onClose={() => setNetlifyModalOpen(false)}
        serverUrl={config.baseUrl || 'http://82.70.210.206:3000'}
      />

      <CityShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
        shortcuts={shortcuts}
        onSaveShortcuts={(newShortcuts) => {
          setShortcuts(newShortcuts);
          saveShortcuts(newShortcuts);
        }}
        onApplyCommand={handleSendCommand}
      />

      <SpamCleanerModal
        isOpen={spamModalOpen}
        onClose={() => setSpamModalOpen(false)}
        rules={spamRules}
        onSaveRules={(newRules) => {
          setSpamRules(newRules);
          saveSpamRules(newRules);
          refreshData();
        }}
      />

      <AiHandoffModal
        isOpen={aiHandoffModalOpen}
        onClose={() => setAiHandoffModalOpen(false)}
      />

      <UsersManagementModal
        isOpen={usersModalOpen}
        onClose={() => setUsersModalOpen(false)}
        onUserModified={() => refreshData(true)}
      />

      <BugTrackerModal
        isOpen={bugModalOpen}
        onClose={() => setBugModalOpen(false)}
        errors={errorsList}
        onClearErrors={handleClearErrors}
        onRefreshErrors={() => refreshData(true)}
        isApiConnected={isApiConnected}
      />

      {/* Discrete Floating Bug Tracker Button */}
      <button
        onClick={() => setBugModalOpen(true)}
        className={`fixed bottom-4 left-4 z-40 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border shadow-xl backdrop-blur-md transition-all cursor-pointer ${
          errorsList.length > 0
            ? 'bg-rose-950/90 text-rose-200 border-rose-500/50 shadow-rose-950/50 hover:bg-rose-900 animate-bounce'
            : 'bg-[#0f1724]/90 text-slate-300 border-[#233348] hover:bg-[#162132] hover:text-white'
        }`}
        title="פתיחת יומן באגים ושגיאות מערכת בזמן אמת"
      >
        <Bug className={`w-4 h-4 ${errorsList.length > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
        <span className="hidden sm:inline">באגים</span>
        {errorsList.length > 0 && (
          <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
            {errorsList.length}
          </span>
        )}
      </button>
    </div>
  );
}
