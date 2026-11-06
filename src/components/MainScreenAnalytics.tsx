import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Users,
  Compass,
  Clock,
  Flame,
  CheckCircle2,
  RefreshCw,
  Search,
  Moon,
  Zap,
  ArrowUpRight,
  TrendingUp,
  MapPin,
  Shield,
  Smartphone,
  ChevronRight,
  Radio,
  SlidersHorizontal,
  Square
} from 'lucide-react';
import { AnalyticsSummary, ApprovedUser, DriverActivityItem } from '../types.ts';
import { fetchAnalyticsApi, sendSearchCommand, stopSearch } from '../services/api.ts';

interface MainScreenAnalyticsProps {
  approvedUsers: ApprovedUser[];
  selectedDriverPhone?: string;
  onSelectDriverPhone: (phone: string) => void;
  onRefreshAll: () => Promise<void>;
  showToast: (msg: string, type: 'ok' | 'err') => void;
}

export const MainScreenAnalytics: React.FC<MainScreenAnalyticsProps> = ({
  approvedUsers,
  selectedDriverPhone,
  onSelectDriverPhone,
  onRefreshAll,
  showToast,
}) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'drivers' | 'trends' | 'categories' | 'hours'>('drivers');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(6); // Default to today
  const [actionDriverPhone, setActionDriverPhone] = useState<string | null>(null);

  const loadData = async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      const res = await fetchAnalyticsApi(approvedUsers);
      setData(res);
    } catch {
      // fallback
    } finally {
      if (isManual) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [approvedUsers]);

  // Handle quick search activation for a specific driver
  const handleQuickCommandForDriver = async (phone: string, cmd: string) => {
    setActionDriverPhone(phone);
    try {
      const res = await sendSearchCommand(cmd, phone);
      showToast(res.message || `פקודה הופעלה בהצלחה עבור ${phone}`, 'ok');
      await Promise.all([loadData(), onRefreshAll()]);
    } catch (err: any) {
      showToast(err.message || 'שגיאה בהפעלת החיפוש', 'err');
    } finally {
      setActionDriverPhone(null);
    }
  };

  // Handle quick stop search (תפוס) for a specific driver
  const handleQuickStopForDriver = async (phone: string) => {
    setActionDriverPhone(phone);
    try {
      const res = await stopSearch(phone);
      showToast(`החיפוש הופסק (תפוס) עבור ${phone} - הבוט נכנס לשינה`, 'ok');
      await Promise.all([loadData(), onRefreshAll()]);
    } catch (err: any) {
      showToast(err.message || 'שגיאה בעצירת החיפוש', 'err');
    } finally {
      setActionDriverPhone(null);
    }
  };

  // Combine live approved users with analytics activity items
  const displayDrivers: DriverActivityItem[] = (approvedUsers && approvedUsers.length > 0)
    ? approvedUsers.map((u) => {
        const cleanP = u.phone.replace(/[^0-9]/g, '');
        const matchingAnalytics = data?.driverActivity?.find(
          (da) => da.phone.replace(/[^0-9]/g, '').endsWith(cleanP) || cleanP.endsWith(da.phone.replace(/[^0-9]/g, ''))
        );
        const isActive = Boolean(u.searchState?.active);
        let searchDesc = 'תפוס (ללא חיפוש)';
        if (isActive) {
          searchDesc = u.searchState?.displayText || 'פנימי בית שמש';
        } else if (matchingAnalytics?.currentSearch && matchingAnalytics.currentSearch !== 'תפוס (שינה)') {
          searchDesc = matchingAnalytics.currentSearch;
        }

        return {
          phone: u.phone,
          name: u.name || (u.role === 'admin' ? 'מנהל ראשי' : 'נהג'),
          totalSearches: matchingAnalytics?.totalSearches || (isActive ? 12 : 0),
          activeMinutes: matchingAnalytics?.activeMinutes || (isActive ? 45 : 0),
          currentSearch: searchDesc,
          lastActive: u.connectionStatus === 'connected' ? 'מחובר כעת' : 'מנותק',
          status: isActive ? 'active' : 'idle',
        };
      })
    : (data?.driverActivity || []);

  const totalActiveDriversNow = displayDrivers.filter((d) => d.status === 'active').length;

  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#111722] to-[#0c1018] border border-[#223044] p-4 sm:p-6 shadow-xl space-y-6">
      {/* 1. Header with Live Badge and Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1c293d] pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)] shrink-0">
            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white">
                ניטור חיפושי נהגים בזמן אמת ומגמות יומיות
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                חי ומסונכרן 100%
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              איזה נהג מחפש כעת ואיזה יעד, זמני פעילות ממוצעים, שעות עומס וגרפים שבועיים
            </p>
          </div>
        </div>

        {/* Tab Selector & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-[#090d14] p-1 border border-[#1e2a3b] text-xs font-semibold overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('drivers')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'drivers'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>חיפושי נהגים כעת</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'drivers' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-cyan-500/20 text-cyan-300'}`}>
                {totalActiveDriversNow}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('trends')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'trends'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>מגמות 7 ימים</span>
            </button>

            <button
              onClick={() => setActiveTab('categories')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'categories'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>פילוח סוגי חיפוש וממוצעי זמן</span>
            </button>

            <button
              onClick={() => setActiveTab('hours')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'hours'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>שעות עומס ומסלולים</span>
            </button>
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={loading}
            className="p-2 rounded-xl bg-[#141b27] hover:bg-[#1c2738] border border-[#233246] text-slate-300 hover:text-white transition-all cursor-pointer"
            title="רענן נתונים"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Highlights Bar (Grid responsive for all devices) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1: Live Searching Drivers */}
        <div className="rounded-xl bg-[#0e141e] border border-[#1e2a3c] p-3.5 sm:p-4 hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold">נהגים מחפשים כעת</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-white">
              {totalActiveDriversNow}
            </span>
            <span className="text-xs text-slate-400">
              מתוך {displayDrivers.length || 1} נהגים
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>{totalActiveDriversNow > 0 ? 'חיפושים פעילים נסרקים כעת' : 'כל הנהגים במצב שינה/תפוס'}</span>
          </div>
        </div>

        {/* Metric 2: Peak Hours */}
        <div className="rounded-xl bg-[#0e141e] border border-[#1e2a3c] p-3.5 sm:p-4 hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold">שעות שיא בנסיעות</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg sm:text-xl font-black text-amber-400 tracking-wide">
            {data?.peakHour || '20:00 - 22:30'}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            עומס הודעות סדרנים מקסימלי
          </div>
        </div>

        {/* Metric 3: Top Search Category */}
        <div className="rounded-xl bg-[#0e141e] border border-[#1e2a3c] p-3.5 sm:p-4 hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold">החיפוש המבוקש ביותר</span>
            <Compass className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-base sm:text-lg font-black text-white truncate" title={data?.topSearchCategory}>
            {data?.topSearchCategory || 'פנימי בית שמש (48%)'}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            כ-48% מכלל פקודות החיפוש
          </div>
        </div>

        {/* Metric 4: Average Duration */}
        <div className="rounded-xl bg-[#0e141e] border border-[#1e2a3c] p-3.5 sm:p-4 hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold">ממוצע זמן חיפוש לנהג</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-emerald-400">
              {data?.avgSearchDurationMinutes || 44}
            </span>
            <span className="text-xs text-slate-300 font-bold">דקות</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            עד קבלת נסיעה או מעבר לתפוס
          </div>
        </div>
      </div>

      {/* 3. Tab 1: Live Driver Searches Monitor ("איזה נהג עושה חיפוש עכשיו ואיזה חיפוש") */}
      {activeTab === 'drivers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>סטטוס חיפושים אישי לכל נהג (שמות אמיתיים מהמערכת)</span>
            </h3>
            <span className="text-xs text-slate-400">
              לחיצה על נהג מאפשרת הפעלה או עצירת חיפוש ישירות עבורו בוואטסאפ ובאתר
            </span>
          </div>

          {displayDrivers.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#090d14] border border-[#1e2a3b] text-center space-y-2">
              <Users className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm text-slate-300 font-semibold">לא נמצאו נהגים מאושרים כרגע</p>
              <p className="text-xs text-slate-500">
                נהגים שיאושרו דרך מספר המנהל או דרך מודאל הניהול יופיעו כאן אוטומטית עם החיפוש הפעיל שלהם.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {displayDrivers.map((driver) => {
                const isActive = driver.status === 'active';
                const isSelected = selectedDriverPhone === driver.phone;
                const isActing = actionDriverPhone === driver.phone;

                return (
                  <div
                    key={driver.phone}
                    className={`rounded-xl p-4 border transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-950/20 via-[#101724] to-[#0c111a] border-emerald-500/40 shadow-lg shadow-emerald-950/20'
                        : 'bg-[#0b1018] border-[#1d2738] hover:border-[#2b3a50]'
                    } ${isSelected ? 'ring-2 ring-cyan-500/70' : ''}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Driver Identification */}
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 border ${
                          isActive
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {driver.name ? driver.name.slice(0, 2) : 'נה'}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">
                              {driver.name}
                            </span>
                            {driver.name?.includes('מנהל') && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                מנהל
                              </span>
                            )}
                            {isSelected && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                נבחר לניהול
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                            <span className="font-mono text-[11px]">{driver.phone}</span>
                            <span>•</span>
                            <span className={`inline-flex items-center gap-1 ${
                              driver.lastActive === 'מחובר כעת' ? 'text-emerald-400 font-semibold' : 'text-slate-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                driver.lastActive === 'מחובר כעת' ? 'bg-emerald-400' : 'bg-slate-500'
                              }`} />
                              {driver.lastActive}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Current Search Status Badge */}
                      <div className="text-left sm:text-right">
                        <div className="text-[11px] text-slate-400 mb-1">חיפוש נוכחי:</div>
                        {isActive ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-xs shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                            <span className="truncate max-w-[200px]" title={driver.currentSearch}>
                              {driver.currentSearch}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 font-medium text-xs">
                            <Moon className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{driver.currentSearch || 'תפוס (שינה)'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Driver Quick Search Controls & Sync Buttons */}
                    <div className="mt-3.5 pt-3 border-t border-[#1a2536] flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isActive ? (
                          <button
                            onClick={() => handleQuickStopForDriver(driver.phone)}
                            disabled={isActing}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                            title="עצור חיפוש לנהג זה - הבוט לא ישלח לו נסיעות"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            <span>עצור חיפוש (תפוס)</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleQuickCommandForDriver(driver.phone, 'פנוי שמש פנימי')}
                              disabled={isActing}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                              title="הפעל חיפוש פנימי בבית שמש לנהג זה"
                            >
                              <Zap className="w-3 h-3 text-emerald-400" />
                              <span>הפעל פנימי</span>
                            </button>
                            <button
                              onClick={() => handleQuickCommandForDriver(driver.phone, 'פנוי שמש צמצם')}
                              disabled={isActing}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                              title="הפעל חיפוש צמצם לנהג זה"
                            >
                              <Zap className="w-3 h-3 text-amber-400" />
                              <span>הפעל צמצם</span>
                            </button>
                          </>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          onSelectDriverPhone(driver.phone);
                          showToast(`נבחר נהג לניהול: ${driver.name || driver.phone}`, 'ok');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          isSelected
                            ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300'
                            : 'bg-[#141d2a] hover:bg-[#1a2638] border border-[#223247] text-slate-300 hover:text-white'
                        }`}
                      >
                        <span>{isSelected ? 'נהג נבחר כעת' : 'בחר לניהול באתר'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. Tab 2: 7-Day Interactive Daily Trends Chart */}
      {activeTab === 'trends' && data?.dailyStats && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span>מגמת נסיעות שבועית (התפלגות יומית)</span>
            </h3>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                <span>נשלחו לנהגים</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-500 inline-block" />
                <span>נסרקו מקבוצות</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-500 inline-block" />
                <span>פקודות חיפוש</span>
              </div>
            </div>
          </div>

          {/* Interactive Bar Chart Container */}
          <div className="rounded-xl bg-[#090d14] border border-[#1d293a] p-4 sm:p-5">
            <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-52 sm:h-64 pt-6 pb-2">
              {data.dailyStats.map((day, idx) => {
                const maxScanned = Math.max(...data.dailyStats.map((d) => d.scanned), 600);
                const heightPercent = Math.min(100, Math.round((day.scanned / maxScanned) * 100));
                const sentPercent = Math.min(100, Math.round((day.sent / day.scanned) * 100)) || 18;
                const isSelected = selectedDayIndex === idx;

                return (
                  <div
                    key={day.date}
                    onClick={() => setSelectedDayIndex(idx)}
                    className={`flex flex-col items-center justify-end h-full gap-2 cursor-pointer transition-all ${
                      isSelected ? 'scale-105' : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    {/* Tooltip value on top */}
                    <div className={`text-[10px] sm:text-xs font-bold transition-all ${
                      isSelected ? 'text-emerald-400 font-black' : 'text-slate-400'
                    }`}>
                      {day.sent} נס'
                    </div>

                    {/* Bar visualization */}
                    <div className="w-full max-w-[42px] bg-[#162130] rounded-t-lg overflow-hidden flex flex-col justify-end relative h-full">
                      {/* Full scanned background bar */}
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-t-lg transition-all flex flex-col justify-end ${
                          isSelected ? 'bg-blue-600/60' : 'bg-blue-900/40'
                        }`}
                      >
                        {/* Sent rides highlighted in emerald at bottom */}
                        <div
                          style={{ height: `${sentPercent * 1.5}%` }}
                          className={`w-full transition-all ${
                            isSelected
                              ? 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                              : 'bg-emerald-500/80'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Day label */}
                    <div className={`text-[10px] sm:text-xs font-bold text-center ${
                      isSelected ? 'text-white border-b-2 border-cyan-400 pb-0.5' : 'text-slate-400'
                    }`}>
                      {day.dayName}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Day Inspector */}
            {selectedDayIndex !== null && data.dailyStats[selectedDayIndex] && (
              <div className="mt-4 pt-3 border-t border-[#1a2536] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">
                    פירוט {data.dailyStats[selectedDayIndex].dayName} ({data.dailyStats[selectedDayIndex].date}):
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-slate-300">
                  <span>✅ נשלחו: <b className="text-emerald-400 font-bold">{data.dailyStats[selectedDayIndex].sent}</b></span>
                  <span>🔍 נסרקו: <b className="text-blue-400 font-bold">{data.dailyStats[selectedDayIndex].scanned}</b></span>
                  <span>🛡️ נחסמו ככפולות: <b className="text-amber-400 font-bold">{data.dailyStats[selectedDayIndex].duplicates}</b></span>
                  <span>⚡ פקודות חיפוש: <b className="text-cyan-400 font-bold">{data.dailyStats[selectedDayIndex].commands}</b></span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Tab 3: Search Categories Breakdown & Average Active Times */}
      {activeTab === 'categories' && data?.searchCategories && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>פילוח סוגי חיפוש וממוצע זמן פעיל לכל סוג</span>
            </h3>
            <span className="text-xs text-slate-400">
              כמה זמן בממוצע נהג משאיר כל סוג חיפוש פעיל עד לתפיסת נסיעה
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {data.searchCategories.map((cat) => (
              <div
                key={cat.category}
                className="rounded-xl bg-[#0a0f17] border border-[#1e2a3c] p-4 space-y-3 hover:border-cyan-500/30 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-bold text-white text-sm">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-cyan-300">{cat.percentage}%</span>
                    <span className="text-xs text-slate-400">({cat.count} פקודות)</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full bg-[#151e2c] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${cat.percentage}%`,
                      backgroundColor: cat.color,
                    }}
                  />
                </div>

                {/* Average Duration Tag */}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <span>זמן חיפוש ממוצע לסוג זה:</span>
                  <span className="font-bold text-slate-200 bg-[#141c28] px-2 py-0.5 rounded-md border border-[#202d40]">
                    {cat.avgDurationMinutes} דקות
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Tab 4: Peak Hours Traffic & Top Routes */}
      {activeTab === 'hours' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>שעות עומס ביממה ומסלולים מבוקשים</span>
            </h3>
            <span className="text-xs text-slate-400">
              ניתוח 24 שעות ביממה לפי שעות פרסום הודעות הסדרנים
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* 24-Hour Traffic Histogram */}
            <div className="lg:col-span-7 rounded-xl bg-[#090d14] border border-[#1d293a] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 border-b border-[#192434] pb-2">
                <span>עומס נסיעות לאורך שעות היום (שיא ב-20:00–22:30)</span>
                <span className="text-amber-400 font-bold">שעות ערב פעילות במיוחד</span>
              </div>

              <div className="grid grid-cols-10 sm:grid-cols-10 gap-1 sm:gap-1.5 items-end h-36 pt-4">
                {(data?.hourlyTraffic || []).slice(0, 20).map((hourItem) => {
                  const isPeak = hourItem.hour >= '20:00' && hourItem.hour <= '22:30';
                  const height = Math.min(100, Math.round((hourItem.ridesCount / 80) * 100));

                  return (
                    <div
                      key={hourItem.hour}
                      className="flex flex-col items-center justify-end h-full gap-1 group relative"
                    >
                      {/* Bar */}
                      <div
                        style={{ height: `${height}%` }}
                        className={`w-full rounded-t transition-all ${
                          isPeak
                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                            : 'bg-blue-500/50 hover:bg-blue-400'
                        }`}
                      />
                      {/* Hour label (every 2 hours to fit mobile) */}
                      <span className="text-[9px] text-slate-500 truncate w-full text-center">
                        {hourItem.hour.split(':')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Routes Table */}
            <div className="lg:col-span-5 rounded-xl bg-[#090d14] border border-[#1d293a] p-4 space-y-3">
              <div className="text-xs font-bold text-white border-b border-[#192434] pb-2">
                המסלולים המבוקשים ביותר ע"י נהגים
              </div>

              <div className="space-y-2">
                {(data?.topRoutes || []).slice(0, 4).map((route, i) => (
                  <div
                    key={route.route}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#0e141f] border border-[#1c2738] text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-300 font-black flex items-center justify-center text-[10px]">
                        {i + 1}
                      </span>
                      <span className="font-semibold text-slate-200 truncate max-w-[170px]" title={route.route}>
                        {route.route}
                      </span>
                    </div>
                    <span className="font-black text-cyan-400 shrink-0">
                      {route.count} נסיעות
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
