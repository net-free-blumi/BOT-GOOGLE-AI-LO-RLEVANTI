import React, { useState, useEffect } from 'react';
import { 
  X, 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Compass, 
  Users, 
  MapPin, 
  RefreshCw, 
  ArrowUpRight, 
  CheckCircle2, 
  Search,
  Activity,
  Flame,
  Calendar,
  Layers,
  ChevronRight,
  UserCheck,
  Radio,
  ArrowRight,
  Filter
} from 'lucide-react';
import { AnalyticsSummary, ApprovedUser, DriverActivityItem, DriverSearchHistoryItem } from '../types.ts';
import { fetchAnalyticsApi } from '../services/api.ts';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedUsers?: ApprovedUser[];
  initialSelectedDriverPhone?: string;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ 
  isOpen, 
  onClose, 
  approvedUsers,
  initialSelectedDriverPhone = '' 
}) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'trends' | 'categories' | 'routes' | 'drivers' | 'driver-detail'>('trends');
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [selectedDriverPhone, setSelectedDriverPhone] = useState<string>(initialSelectedDriverPhone);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchAnalyticsApi(approvedUsers);
      setData(res);
    } catch {
      // fallback handled in fetchAnalyticsApi
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (initialSelectedDriverPhone) {
        setSelectedDriverPhone(initialSelectedDriverPhone);
        setActiveTab('driver-detail');
      }
    }
  }, [isOpen, initialSelectedDriverPhone]);

  if (!isOpen) return null;

  // Selected driver object if filtered
  const selectedDriverObj: DriverActivityItem | undefined = selectedDriverPhone
    ? (data?.driverActivity || []).find((d) => {
        const cleanA = d.phone.replace(/[^0-9]/g, '');
        const cleanB = selectedDriverPhone.replace(/[^0-9]/g, '');
        return cleanA.endsWith(cleanB) || cleanB.endsWith(cleanA);
      })
    : undefined;

  const maxDailyScanned = data?.dailyStats 
    ? Math.max(...data.dailyStats.map((d) => d.scanned), 100) 
    : 500;

  const maxHourlyRides = data?.hourlyTraffic
    ? Math.max(...data.hourlyTraffic.map((h) => h.ridesCount), 10)
    : 80;

  const driverHourlyMax = selectedDriverObj?.hourlyActivity
    ? Math.max(...selectedDriverObj.hourlyActivity.map((h) => h.searchesCount), 5)
    : 10;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none" 
      dir="rtl"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-5xl bg-[#0c121d] border border-[#223249] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#1d2b3e] flex items-center justify-between bg-gradient-to-r from-[#111927] to-[#0c121d] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-blue-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shadow-inner">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  מרכז נתונים, גרפים ואנליטיקת חיפושים
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[10px] font-bold">
                  LIVE
                </span>
                <span className="px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                  v3.2.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                ניתוח פעילות נהגים, היסטוריית חיפושים אחרונים, ממוצעי זמנים ושעות שיא
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-xl bg-[#141d2b] hover:bg-[#1b273a] text-slate-300 hover:text-white border border-[#24354c] transition-all cursor-pointer"
              title="רענן נתונים"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-[#141d2b] hover:bg-[#1b273a] text-slate-400 hover:text-white border border-[#24354c] transition-all cursor-pointer"
              title="סגור חלון"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* DRIVER FILTER SELECTOR (כל הנהגים או נהג ספציפי) */}
        {/* ========================================================= */}
        <div className="px-4 sm:px-6 py-2.5 bg-[#090e17] border-b border-[#1a2638] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-teal-400" />
              סינון נתונים לפי:
            </span>

            {/* All Drivers Button */}
            <button
              onClick={() => {
                setSelectedDriverPhone('');
                if (activeTab === 'driver-detail') setActiveTab('trends');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                !selectedDriverPhone
                  ? 'bg-teal-500 text-slate-950 shadow-md ring-2 ring-teal-400/40'
                  : 'bg-[#121a26] text-slate-300 hover:text-white border border-[#223348]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>כל הנהגים (מבט כולל)</span>
            </button>

            {/* Drivers Dropdown */}
            <select
              value={selectedDriverPhone}
              onChange={(e) => {
                const phone = e.target.value;
                setSelectedDriverPhone(phone);
                if (phone) {
                  setActiveTab('driver-detail');
                } else {
                  if (activeTab === 'driver-detail') setActiveTab('trends');
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer focus:outline-none ${
                selectedDriverPhone
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm'
                  : 'bg-[#121a26] border-[#223348] text-slate-300'
              }`}
            >
              <option value="" className="bg-[#0c121d] text-slate-300">
                🔍 בחר נהג להצגת חיפושים וגרפים אישיים...
              </option>
              {(data?.driverActivity || []).map((d) => (
                <option key={d.phone} value={d.phone} className="bg-[#0c121d] text-white">
                  {d.name || 'נהג'} ({d.phone}) {d.status === 'active' ? '🟢 מחפש פעיל' : '⚪ תפוס'}
                </option>
              ))}
            </select>
          </div>

          {/* If specific driver is selected: Quick info badge & reset button */}
          {selectedDriverObj && (
            <div className="flex items-center gap-2 bg-[#141e2d] px-3 py-1 rounded-xl border border-amber-500/30">
              <span className="text-xs text-amber-300 font-bold flex items-center gap-1">
                <span>מציג נתוני נהג:</span>
                <strong className="text-white">{selectedDriverObj.name}</strong>
                <span className="font-mono text-slate-300 text-[11px]">({selectedDriverObj.phone})</span>
              </span>
              <button
                onClick={() => {
                  setSelectedDriverPhone('');
                  if (activeTab === 'driver-detail') setActiveTab('trends');
                }}
                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold cursor-pointer"
                title="חזור לתצוגת כל הנהגים"
              >
                חזור לכולם ✕
              </button>
            </div>
          )}
        </div>

        {/* Quick KPI Cards (Dynamically changes between All Drivers & Specific Driver) */}
        <div className="p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-3 bg-[#080d14] border-b border-[#1a2636] shrink-0">
          {selectedDriverObj ? (
            /* KPI CARDS FOR SELECTED DRIVER */
            <>
              <div className="p-3.5 rounded-xl bg-[#0e1623] border border-[#1e2d42] relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                  <span>חיפוש נוכחי של הנהג</span>
                  <Compass className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div className="text-base sm:text-lg font-black text-white truncate">
                  {selectedDriverObj.currentSearch || 'תפוס'}
                </div>
                <div className="text-[10px] text-teal-400 mt-1 flex items-center gap-1 font-medium">
                  <span className={`w-2 h-2 rounded-full ${selectedDriverObj.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {selectedDriverObj.status === 'active' ? 'סורק נסיעות כעת' : 'במנוחה (ללא חיפוש)'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0e1623] border border-[#1e2d42] relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                  <span>זמן פעילות היום</span>
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-blue-300 font-mono flex items-baseline gap-1">
                  {selectedDriverObj.activeMinutes} <span className="text-xs font-sans text-slate-400 font-normal">דקות</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  זמן חיפוש מצטבר היום
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0e1623] border border-[#1e2d42] relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                  <span>סך חיפושים שבוצעו</span>
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono">
                  {selectedDriverObj.totalSearches} <span className="text-xs font-sans text-slate-400 font-normal">חיפושים</span>
                </div>
                <div className="text-[10px] text-amber-400/80 mt-1">
                  פקודות שנשלחו לבוט היום
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0e1623] border border-[#1e2d42] relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                  <span>סטטוס חיבור וואטסאפ</span>
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-base sm:text-lg font-black text-emerald-400 flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${selectedDriverObj.lastActive.includes('מחובר') ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span>{selectedDriverObj.lastActive}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">
                  {selectedDriverObj.phone}
                </div>
              </div>
            </>
          ) : (
            /* KPI CARDS FOR ALL DRIVERS */
            <>
              <div className="p-3.5 rounded-xl bg-[#0e1623] border border-[#1e2d42] relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                  <span>ממוצע זמן חיפוש לנהג</span>
                  <Clock className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-white font-mono flex items-baseline gap-1">
                  {data?.avgSearchDurationMinutes || 44} <span className="text-xs font-sans text-slate-400 font-normal">דקות</span>
                </div>
                <div className="text-[10px] text-teal-400 mt-1 flex items-center gap-1 font-medium">
                  <TrendingUp className="w-3 h-3" />
                  עד קבלת נסיעה או מעבר לתפוס
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0e1623] border border-[#1e2d42] relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                  <span>סוג החיפוש המבוקש ביותר</span>
                  <Compass className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-base sm:text-lg font-black text-blue-300 truncate">
                  {data?.topSearchCategory || 'פנימי בית שמש'}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  כ-48% מכלל פקודות החיפוש בבוט
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0e1623] border border-[#1e2d42] relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                  <span>שעות השיא בנסיעות</span>
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-lg sm:text-xl font-black text-amber-300 font-mono">
                  {data?.peakHour || '20:00 - 22:30'}
                </div>
                <div className="text-[10px] text-amber-400/80 mt-1">
                  עומס מודעות סדרנים מקסימלי
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0e1623] border border-[#1e2d42] relative overflow-hidden">
                <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                  <span>נהגים פעילים בחיפוש כעת</span>
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono flex items-baseline gap-1">
                  {data?.activeSearchesNow || 4} <span className="text-xs font-sans text-slate-400 font-normal">נהגים מקבילים</span>
                </div>
                <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  חיפושים פעילים נסרקים כעת
                </div>
              </div>
            </>
          )}
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 px-4 sm:px-6 pt-3 border-b border-[#1a2636] bg-[#0c121d] shrink-0 overflow-x-auto">
          {/* Driver Detail Tab (Visible or Highlighted when driver selected) */}
          {selectedDriverObj && (
            <button
              onClick={() => setActiveTab('driver-detail')}
              className={`px-3 sm:px-4 py-2.5 text-xs font-black rounded-t-xl border-t border-x transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'driver-detail'
                  ? 'bg-[#121a27] border-[#223348] text-amber-300 border-b-transparent shadow-md ring-1 ring-amber-400/30'
                  : 'border-transparent text-amber-400/80 hover:text-amber-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>👤 חיפושים וגרף של {selectedDriverObj.name}</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('trends')}
            className={`px-3 sm:px-4 py-2.5 text-xs font-bold rounded-t-xl border-t border-x transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'trends'
                ? 'bg-[#121a27] border-[#223348] text-teal-300 border-b-transparent shadow-md'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            מגמות יומיות (7 ימים)
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`px-3 sm:px-4 py-2.5 text-xs font-bold rounded-t-xl border-t border-x transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'categories'
                ? 'bg-[#121a27] border-[#223348] text-teal-300 border-b-transparent shadow-md'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            פילוח סוגי חיפוש וממוצעי זמן
          </button>

          <button
            onClick={() => setActiveTab('routes')}
            className={`px-3 sm:px-4 py-2.5 text-xs font-bold rounded-t-xl border-t border-x transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'routes'
                ? 'bg-[#121a27] border-[#223348] text-teal-300 border-b-transparent shadow-md'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            שעות עומס ומסלולים מבוקשים
          </button>

          <button
            onClick={() => setActiveTab('drivers')}
            className={`px-3 sm:px-4 py-2.5 text-xs font-bold rounded-t-xl border-t border-x transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'drivers'
                ? 'bg-[#121a27] border-[#223348] text-teal-300 border-b-transparent shadow-md'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            פעילות כלל הנהגים ({data?.driverActivity?.length || 0})
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-xs">
          
          {/* ========================================================= */}
          {/* TAB 0: DRIVER DETAIL (SPECIFIC DRIVER FOCUS) */}
          {/* ========================================================= */}
          {activeTab === 'driver-detail' && selectedDriverObj && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Driver Summary Banner */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#101928] to-[#0d1420] border border-amber-500/30 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300 text-xl font-black">
                    🚕
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-black text-white">
                        {selectedDriverObj.name}
                      </h3>
                      <span className="font-mono text-xs px-2 py-0.5 rounded-lg bg-[#080d14] border border-[#1e2a3c] text-amber-300 font-bold">
                        {selectedDriverObj.phone}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedDriverObj.status === 'active'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {selectedDriverObj.status === 'active' ? '🟢 מחפש פעיל כעת' : '⚪ במנוחה (תפוס)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      חיפוש מוגדר כעת: <strong className="text-teal-300 font-bold">{selectedDriverObj.currentSearch}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedDriverPhone('');
                      setActiveTab('trends');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#141e2d] hover:bg-[#1a283c] border border-[#233348] text-slate-200 hover:text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>חזור לכלל הנהגים</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 1. RECENT SEARCHES HISTORY FOR THIS DRIVER */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-teal-400" />
                      היסטוריית החיפושים האחרונים של {selectedDriverObj.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      פירוט פקודות החיפוש, זמני הפעלה וכמות הנסיעות שהתקבלו
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-300 text-[10px] font-bold">
                    {selectedDriverObj.recentSearches?.length || 4} חיפושים אחרונים
                  </span>
                </div>

                <div className="divide-y divide-[#182536] border border-[#1e2d42] rounded-xl overflow-hidden bg-[#0a0f18]">
                  {(selectedDriverObj.recentSearches || []).map((sh, idx) => (
                    <div key={sh.id || idx} className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#0f1724] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                          sh.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {sh.status === 'active' ? '⚡' : '✓'}
                        </div>
                        <div>
                          <div className="font-black text-white text-xs sm:text-sm flex items-center gap-2">
                            <span>{sh.query}</span>
                            <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${
                              sh.mode === 'internal'
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : sh.mode === 'reduce'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : sh.mode === 'stop'
                                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                            }`}>
                              {sh.mode === 'internal' ? 'פנימי' : sh.mode === 'reduce' ? 'צמצם' : sh.mode === 'stop' ? 'עצירה' : 'בינעירוני'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{sh.startedAt}</span>
                            <span>•</span>
                            <span>משך זמן: {sh.durationMinutes} דקות</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-left">
                        <div className="text-right">
                          <span className="text-sm font-black text-emerald-400 font-mono">{sh.matchesCount}</span>
                          <span className="text-[10px] text-slate-400 mr-1">נסיעות שהתקבלו</span>
                        </div>
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                          sh.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {sh.status === 'active' ? 'פעיל כעת' : 'הסתיים'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. HOURLY ACTIVITY CHART FOR THIS DRIVER */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-blue-400" />
                      גרף שעות פעילות וחיפוש של {selectedDriverObj.name} לאורך היום
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      כמות החיפושים והנסיעות שהנהג קיבל בכל שעה
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                      <span>חיפושים שהופעלו</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                      <span>נסיעות שהתקבלו</span>
                    </div>
                  </div>
                </div>

                {/* Bars */}
                <div className="pt-4 pb-2">
                  <div className="flex items-end gap-2 h-36 border-b border-[#24354d] pb-2 overflow-x-auto">
                    {(selectedDriverObj.hourlyActivity || []).map((h, i) => {
                      const height = Math.max(10, Math.round((h.searchesCount / driverHourlyMax) * 100));
                      return (
                        <div
                          key={h.hour}
                          className="flex-1 min-w-[28px] flex flex-col items-center justify-end h-full group relative cursor-pointer"
                        >
                          <div className="w-full flex items-end justify-center gap-0.5 h-full">
                            <div
                              style={{ height: `${height}%` }}
                              className="w-full rounded-t bg-gradient-to-t from-teal-500 to-teal-300 transition-all hover:brightness-125"
                              title={`${h.hour}: ${h.searchesCount} חיפושים, ${h.ridesCount} נסיעות`}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono mt-1">
                            {h.hour.split(':')[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 3. SEARCH CATEGORIES PREFERENCES FOR THIS DRIVER */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-4">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  העדפות סוגי חיפוש של {selectedDriverObj.name}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(selectedDriverObj.searchCategories || []).map((cat) => (
                    <div key={cat.category} className="p-3.5 rounded-xl bg-[#090e17] border border-[#1c293c] flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-xs">{cat.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          ממוצע זמן: {cat.avgDurationMinutes} דקות
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-black text-amber-300 font-mono">{cat.percentage}%</span>
                        <div className="text-[10px] text-slate-400">{cat.count} חיפושים</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: DAILY TRENDS */}
          {activeTab === 'trends' && (
            <div className="space-y-6">
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-teal-400" />
                      פעילות נסיעות יומית (שבוע אחרון)
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      התפלגות הודעות שנסרקו, נסיעות מאושרות שנשלחו וכפילויות שנחסמו
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <span>נסיעות שנשלחו</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span>הודעות שנסרקו</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span>כפילויות שנחסמו</span>
                    </div>
                  </div>
                </div>

                {/* Bars Area */}
                <div className="pt-4 pb-2">
                  <div className="flex items-end gap-2 sm:gap-4 h-44 border-b border-[#24354d] pb-2 overflow-x-auto">
                    {(data?.dailyStats || []).map((day, idx) => {
                      const heightScanned = Math.max(10, Math.round((day.scanned / maxDailyScanned) * 100));
                      const heightSent = Math.max(6, Math.round((day.sent / maxDailyScanned) * 100));
                      const isToday = idx === 6;

                      return (
                        <div
                          key={day.date}
                          onMouseEnter={() => setHoveredDay(idx)}
                          onMouseLeave={() => setHoveredDay(null)}
                          className="flex-1 min-w-[36px] flex flex-col items-center justify-end h-full group relative cursor-pointer"
                        >
                          {/* Tooltip on hover */}
                          {hoveredDay === idx && (
                            <div className="absolute -top-20 z-20 px-3 py-2 rounded-xl bg-slate-900 border border-teal-500/40 text-[11px] whitespace-nowrap shadow-2xl animate-in fade-in duration-150">
                              <div className="font-bold text-white mb-0.5">{day.dayName} ({day.date})</div>
                              <div className="text-emerald-300">נסיעות שנשלחו: {day.sent}</div>
                              <div className="text-blue-300">הודעות שנסרקו: {day.scanned}</div>
                              <div className="text-amber-300">כפילויות: {day.duplicates}</div>
                              <div className="text-purple-300">פקודות חיפוש: {day.commands}</div>
                            </div>
                          )}

                          <div className="w-full flex items-end justify-center gap-1 h-full">
                            {/* Scanned Bar */}
                            <div
                              style={{ height: `${heightScanned}%` }}
                              className="w-1/2 rounded-t bg-blue-500/40 group-hover:bg-blue-500/60 transition-all"
                            />
                            {/* Sent Bar */}
                            <div
                              style={{ height: `${heightSent}%` }}
                              className={`w-1/2 rounded-t transition-all ${
                                isToday ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]' : 'bg-emerald-500 group-hover:bg-emerald-400'
                              }`}
                            />
                          </div>

                          <span className={`text-[10px] mt-2 font-medium ${isToday ? 'text-teal-300 font-bold' : 'text-slate-400'}`}>
                            {day.dayName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CATEGORIES BREAKDOWN */}
          {activeTab === 'categories' && (
            <div className="space-y-6">
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-4">
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-400" />
                    התפלגות סוגי חיפושים וממוצעי זמנים
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    פילוח של פקודות החיפוש שהנהגים מפעילים בבוט ומשך הזמן הממוצע עד למציאת נסיעה
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {(data?.searchCategories || []).map((cat) => (
                    <div 
                      key={cat.category}
                      className="p-4 rounded-xl bg-[#0a0f18] border border-[#1d2a3c] space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="font-bold text-white text-xs sm:text-sm">{cat.name}</span>
                        </div>
                        <span className="font-mono text-sm font-black text-white">{cat.percentage}%</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500" 
                          style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>סך חיפושים: <strong className="text-white">{cat.count}</strong></span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-teal-400" />
                          ממוצע: <strong className="text-teal-300">{cat.avgDurationMinutes} דק'</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ROUTES & PEAK HOURS */}
          {activeTab === 'routes' && (
            <div className="space-y-6">
              {/* Hourly Peak Chart */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      עומס נסיעות לפי שעות היממה (24 שעות)
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      זיהוי שעות השיא בהן מפורסמות הכי הרבה נסיעות בקבוצות הסדרנים
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="w-2.5 h-2.5 rounded bg-gradient-to-t from-amber-500 to-rose-400" />
                    <span>שעות שיא (מעל 50 נסיעות)</span>
                  </div>
                </div>

                {/* Hourly bars */}
                <div className="pt-4 pb-2">
                  <div className="flex items-end gap-1.5 h-36 border-b border-[#24354d] pb-2 overflow-x-auto">
                    {(data?.hourlyTraffic || []).map((h, i) => {
                      const height = Math.max(8, Math.round((h.ridesCount / maxHourlyRides) * 100));
                      const isPeak = h.ridesCount >= 50;
                      return (
                        <div
                          key={h.hour}
                          onMouseEnter={() => setHoveredHour(i)}
                          onMouseLeave={() => setHoveredHour(null)}
                          className="flex-1 min-w-[24px] flex flex-col items-center justify-end h-full group relative cursor-pointer"
                        >
                          {hoveredHour === i && (
                            <div className="absolute -top-12 z-20 px-2.5 py-1 rounded-lg bg-slate-900 border border-amber-500/40 text-[10px] whitespace-nowrap shadow-xl">
                              <span className="font-bold text-white">{h.hour}</span>: <span className="text-amber-300">{h.ridesCount} נסיעות</span>
                            </div>
                          )}
                          <div
                            style={{ height: `${height}%` }}
                            className={`w-full rounded-t transition-all ${
                              isPeak 
                                ? 'bg-gradient-to-t from-amber-500 to-rose-400' 
                                : 'bg-gradient-to-t from-teal-500/60 to-blue-400'
                            }`}
                          />
                          <span className="text-[9px] text-slate-400 font-mono mt-1">
                            {h.hour.split(':')[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Top Routes Ranking */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-3">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  דירוג המסלולים והיעדים המבוקשים ביותר
                </h3>

                <div className="divide-y divide-[#1e2d42]">
                  {(data?.topRoutes || []).map((route, idx) => (
                    <div key={route.route} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                          idx === 0 
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                            : idx === 1
                            ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30'
                            : idx === 2
                            ? 'bg-amber-700/20 text-amber-400 border border-amber-700/30'
                            : 'bg-[#152030] text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-white text-xs">{route.route}</div>
                          <div className="text-[11px] text-slate-400">
                            מוצא: {route.origin} {route.destination ? `⬅️ יעד: ${route.destination}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-left">
                        <div className="text-right">
                          <span className="text-sm font-black text-emerald-400 font-mono">{route.count}</span>
                          <span className="text-[10px] text-slate-400 mr-1">ביקושים</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-300 text-[10px] font-bold">
                          {route.activeDriversCount} נהגים כעת
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ALL DRIVERS ACTIVITY TABLE */}
          {activeTab === 'drivers' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    מעקב פעילות נהגים וחיפושים
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    לחץ על "הצג נתוני נהג" כדי לראות את הגרפים, שעות הפעילות והחיפושים האישיים שלו
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-[#223348] text-slate-400 text-[11px]">
                      <th className="pb-2.5 font-bold">שם הנהג</th>
                      <th className="pb-2.5 font-bold">טלפון</th>
                      <th className="pb-2.5 font-bold">חיפוש נוכחי</th>
                      <th className="pb-2.5 font-bold text-center">חיפושים שבוצעו</th>
                      <th className="pb-2.5 font-bold text-center">זמן פעיל היום</th>
                      <th className="pb-2.5 font-bold">סטטוס</th>
                      <th className="pb-2.5 font-bold text-left">אנליטיקה אישית</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#182536] text-xs">
                    {(data?.driverActivity || []).map((driver) => {
                      const isSelected = selectedDriverPhone === driver.phone;
                      return (
                        <tr 
                          key={driver.phone} 
                          className={`hover:bg-[#131d2c] transition-colors ${
                            isSelected ? 'bg-amber-500/10 border-l-2 border-amber-400' : ''
                          }`}
                        >
                          <td className="py-3 font-bold text-white flex items-center gap-1.5">
                            <span>{driver.name || 'נהג מורשה'}</span>
                            {isSelected && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                                נבחר
                              </span>
                            )}
                          </td>
                          <td className="py-3 font-mono text-slate-300">{driver.phone}</td>
                          <td className="py-3">
                            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                              driver.status === 'active'
                                ? 'bg-teal-500/15 border border-teal-500/40 text-teal-300'
                                : 'bg-slate-800/60 border border-slate-700 text-slate-400'
                            }`}>
                              {driver.currentSearch || 'תפוס'}
                            </span>
                          </td>
                          <td className="py-3 text-center font-mono font-bold text-blue-400">{driver.totalSearches}</td>
                          <td className="py-3 text-center font-mono text-slate-200">{driver.activeMinutes} דק'</td>
                          <td className="py-3">
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                              driver.status === 'active' ? 'text-emerald-400' : 'text-slate-400'
                            }`}>
                              <span className={`w-2 h-2 rounded-full ${driver.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                              {driver.status === 'active' ? 'מחפש פעיל' : 'במנוחה (תפוס)'}
                            </span>
                          </td>
                          <td className="py-3 text-left">
                            <button
                              onClick={() => {
                                setSelectedDriverPhone(driver.phone);
                                setActiveTab('driver-detail');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/35 border border-teal-500/50 text-teal-300 hover:text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-sm"
                              title={`הצג גרפים וחיפושים אישיים של ${driver.name || driver.phone}`}
                            >
                              <BarChart3 className="w-3 h-3 text-teal-400" />
                              <span>הצג נתוני נהג</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#1d2b3e] bg-[#0c121d] flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="text-slate-400 text-[11px] flex items-center gap-2">
            <span>הנתונים מתעדכנים בזמן אמת מסריקות הוואטסאפ וחיפושי הנהגים בשרת</span>
            <span className="font-mono text-amber-400 font-bold">• v3.2.0</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold transition-colors cursor-pointer"
          >
            סגור מרכז נתונים
          </button>
        </div>

      </div>
    </div>
  );
};
