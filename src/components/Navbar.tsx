import React from 'react';
import { 
  Wifi, 
  WifiOff, 
  Search, 
  Radio, 
  Server, 
  RefreshCw, 
  LogOut, 
  Settings, 
  Layers, 
  SlidersHorizontal,
  Sparkles,
  Tag,
  Scissors,
  Bot,
  Users,
  Bug
} from 'lucide-react';
import { WhatsAppState, DriverState, ConnectionConfig, ApprovedUser } from '../types.ts';

interface NavbarProps {
  wa: WhatsAppState;
  search: DriverState;
  isApiConnected: boolean;
  isRefreshing: boolean;
  config: ConnectionConfig;
  pendingUsersCount?: number;
  approvedUsers?: ApprovedUser[];
  selectedDriverPhone?: string;
  errorsCount?: number;
  onSelectDriverPhone?: (phone: string) => void;
  onRefresh: () => void;
  onOpenConnectionModal: () => void;
  onOpenNetlifyModal: () => void;
  onOpenShortcutsModal: () => void;
  onOpenSpamModal: () => void;
  onOpenAiHandoffModal: () => void;
  onOpenUsersModal: () => void;
  onOpenBugModal?: () => void;
  onLogout: () => void;
  onToggleDemoMode: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  wa,
  search,
  isApiConnected,
  isRefreshing,
  config,
  pendingUsersCount = 0,
  approvedUsers = [],
  selectedDriverPhone = '',
  errorsCount = 0,
  onSelectDriverPhone,
  onRefresh,
  onOpenConnectionModal,
  onOpenNetlifyModal,
  onOpenShortcutsModal,
  onOpenSpamModal,
  onOpenAiHandoffModal,
  onOpenUsersModal,
  onOpenBugModal,
  onLogout,
  onToggleDemoMode,
}) => {
  return (
    <header className="border-b border-[#223044] bg-[#0c121a]/90 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2.5">
        {/* Brand & Driver Selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 via-[#151b24] to-emerald-500/10 border border-amber-500/30 flex items-center justify-center text-lg shadow-inner shadow-amber-500/10">
              🚕
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                  מרכז שליטה
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium">
                    נסיעות בוט
                  </span>
                </h1>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                82.70.210.206 · סנכרון רב-משתמשי (Multi-Session)
              </p>
            </div>
          </div>

          {/* Quick Driver Selector Dropdown */}
          {approvedUsers.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[#121926] border border-[#233348] hover:border-amber-500/40 rounded-xl px-2.5 py-1 text-xs transition-colors">
              <span className="text-slate-400 font-medium text-[11px] hidden md:inline">סינון לפי נהג:</span>
              <select
                value={selectedDriverPhone}
                onChange={(e) => onSelectDriverPhone?.(e.target.value)}
                className="bg-transparent text-amber-300 font-bold focus:outline-none cursor-pointer text-xs"
                title="בחר נהג לצפייה בחיפוש, לוגים וסטטוס אישי"
              >
                <option value="" className="bg-[#0c121a] text-slate-300">👥 כל הנהגים (מבט כולל)</option>
                {approvedUsers.map((u) => (
                  <option key={u.phone} value={u.phone} className="bg-[#0c121a] text-white">
                    {u.name || 'נהג'} ({u.phone}) {u.connectionStatus === 'connected' ? '🟢' : '⚪'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {/* API Status */}
          <button
            onClick={onOpenConnectionModal}
            title="לחץ לעריכת כתובת השרת ובדיקת חיבור"
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
              config.useDemoMode
                ? 'bg-purple-950/40 border-purple-500/40 text-purple-300 hover:bg-purple-900/40'
                : isApiConnected
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:border-emerald-500/50'
                : 'bg-rose-950/40 border-rose-500/30 text-rose-300 hover:border-rose-500/50 animate-pulse'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                config.useDemoMode
                  ? 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]'
                  : isApiConnected
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-rose-400'
              }`}
            />
            <span className="flex items-center gap-1">
              <Server className="w-3 h-3 opacity-70" />
              {config.useDemoMode ? 'מצב הדגמה' : isApiConnected ? 'שרת מחובר' : 'שרת מנותק'}
            </span>
          </button>

          {/* WhatsApp Status */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              wa.connected
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                wa.connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-400'
              }`}
            />
            <span className="flex items-center gap-1">
              {wa.connected ? <Wifi className="w-3 h-3 opacity-75" /> : <WifiOff className="w-3 h-3 opacity-75" />}
              {wa.connected ? 'וואטסאפ מחובר' : 'וואטסאפ מנותק'}
            </span>
          </div>

          {/* Search Status */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              search.active
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                : 'bg-slate-900 border-slate-700/60 text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                search.active ? 'bg-amber-400 animate-ping' : 'bg-slate-500'
              }`}
            />
            <span className="flex items-center gap-1">
              <Radio className="w-3 h-3 opacity-80" />
              {search.active ? 'חיפוש פעיל' : 'מצב שינה / תפוס'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Users & Approval Management */}
          <button
            onClick={onOpenUsersModal}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#141d29] hover:bg-[#1a2535] border border-teal-500/30 text-teal-300 hover:text-teal-200 transition-colors cursor-pointer relative"
            title="ניהול משתמשים, אישור נהגים חדשים ומניעת ספאם"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden md:inline">אישור משתמשים</span>
            {pendingUsersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center animate-pulse">
                {pendingUsersCount}
              </span>
            )}
          </button>

          {/* City Shortcuts Button */}
          <button
            onClick={onOpenShortcutsModal}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#141d29] hover:bg-[#1a2535] border border-[#233348] text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
            title="ניהול קיצורי ערים (ים, שמש, בב, צמצם)"
          >
            <Tag className="w-3.5 h-3.5" />
            <span className="hidden md:inline">קיצורי ערים</span>
          </button>

          {/* Spam Cleaner Button */}
          <button
            onClick={onOpenSpamModal}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#141d29] hover:bg-[#1a2535] border border-[#233348] text-rose-300 hover:text-rose-200 transition-colors cursor-pointer"
            title="חיתוך ספאם וקישורים מיותרים מההודעות"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span className="hidden md:inline">ניקוי ספאם</span>
          </button>

          {/* Bug Tracker Button */}
          <button
            onClick={onOpenBugModal}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              errorsCount > 0
                ? 'bg-rose-950/60 hover:bg-rose-900/60 border-rose-500/40 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                : 'bg-[#141d29] hover:bg-[#1a2535] border-[#233348] text-slate-300 hover:text-white'
            }`}
            title="יומן באגים ושגיאות מערכת בזמן אמת"
          >
            <Bug className={`w-3.5 h-3.5 ${errorsCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">באגים</span>
            {errorsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center animate-pulse">
                {errorsCount}
              </span>
            )}
          </button>

          {/* AI Handoff Button */}
          <button
            onClick={onOpenAiHandoffModal}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-purple-950/40 hover:bg-purple-900/40 border border-purple-500/40 text-purple-300 hover:text-purple-200 transition-colors cursor-pointer"
            title="העתק סיכום מלא להעברה לקלוד בוט או ל-Gemini"
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">סיכום ל-AI</span>
          </button>

          {/* Netlify deployment helper */}
          <button
            onClick={onOpenNetlifyModal}
            className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#141d29] hover:bg-[#1a2535] border border-[#233348] text-teal-300 hover:text-teal-200 transition-colors cursor-pointer"
            title="מדריך וקובצי הגדרה להעלאה ל-Netlify"
          >
            <Layers className="w-3.5 h-3.5" />
            Netlify
          </button>

          {/* Server Settings */}
          <button
            onClick={onOpenConnectionModal}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#141d29] hover:bg-[#1a2535] border border-[#233348] text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="הגדרת חיבור שרת (IP / פורט / פרוקסי)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">שרת</span>
          </button>

          {/* Manual refresh */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-xs font-medium bg-[#141d29] hover:bg-[#1a2535] border border-[#233348] text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="רענן נתונים כעת"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:text-rose-200 transition-colors cursor-pointer"
            title="התנתק מהפאנל"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">יציאה</span>
          </button>
        </div>
      </div>
    </header>
  );
};
