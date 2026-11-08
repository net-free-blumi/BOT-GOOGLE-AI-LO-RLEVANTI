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
  ChevronRight
} from 'lucide-react';
import { AnalyticsSummary, ApprovedUser } from '../types.ts';
import { fetchAnalyticsApi } from '../services/api.ts';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedUsers?: ApprovedUser[];
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ isOpen, onClose, approvedUsers }) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'trends' | 'categories' | 'routes' | 'drivers'>('trends');
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

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
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const maxDailyScanned = data?.dailyStats 
    ? Math.max(...data.dailyStats.map((d) => d.scanned), 100) 
    : 500;

  const maxHourlyRides = data?.hourlyTraffic
    ? Math.max(...data.hourlyTraffic.map((h) => h.ridesCount), 10)
    : 80;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
      dir="rtl"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-5xl bg-[#0c121d] border border-[#223249] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1d2b3e] flex items-center justify-between bg-gradient-to-r from-[#111927] to-[#0c121d] shrink-0">
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
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                ניתוח פעילות נהגים, מגמות יומיות, ממוצעי זמני חיפוש ושעות לחץ בנסיעות
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
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick KPI Cards */}
        <div className="p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-3 bg-[#080d14] border-b border-[#1a2636] shrink-0">
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
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 px-4 sm:px-6 pt-3 border-b border-[#1a2636] bg-[#0c121d] shrink-0 overflow-x-auto">
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
            פעילות נהגים מפורטת
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-xs">
          
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

                {/* Bar Chart Visualization */}
                <div className="pt-6 pb-2">
                  <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-56 sm:h-64 border-b border-[#24354d] pb-2">
                    {(data?.dailyStats || []).map((day, idx) => {
                      const scannedHeight = Math.max(12, Math.round((day.scanned / maxDailyScanned) * 100));
                      const sentHeight = Math.max(8, Math.round((day.sent / maxDailyScanned) * 100));
                      const dupHeight = Math.max(6, Math.round((day.duplicates / maxDailyScanned) * 100));
                      const isHovered = hoveredDay === idx;

                      return (
                        <div
                          key={day.date}
                          onMouseEnter={() => setHoveredDay(idx)}
                          onMouseLeave={() => setHoveredDay(null)}
                          className="flex flex-col items-center h-full justify-end group cursor-pointer relative"
                        >
                          {/* Tooltip on hover */}
                          {isHovered && (
                            <div className="absolute -top-16 z-20 px-3 py-2 rounded-xl bg-slate-900 border border-teal-500/50 shadow-xl text-[10px] text-right pointer-events-none whitespace-nowrap animate-in fade-in duration-150">
                              <div className="font-bold text-white mb-0.5">{day.dayName} ({day.date})</div>
                              <div className="text-emerald-300">נשלחו: <strong>{day.sent}</strong></div>
                              <div className="text-blue-300">נסרקו: <strong>{day.scanned}</strong></div>
                              <div className="text-amber-300">כפולות: <strong>{day.duplicates}</strong></div>
                            </div>
                          )}

                          {/* Bars container */}
                          <div className="w-full max-w-[36px] flex items-end justify-center gap-1 h-full pb-1">
                            {/* Sent Bar */}
                            <div
                              style={{ height: `${sentHeight}%` }}
                              className="w-1/3 rounded-t-md bg-emerald-500 group-hover:bg-emerald-400 transition-all shadow-sm"
                            />
                            {/* Scanned Bar */}
                            <div
                              style={{ height: `${scannedHeight}%` }}
                              className="w-1/3 rounded-t-md bg-blue-500/80 group-hover:bg-blue-400 transition-all shadow-sm"
                            />
                            {/* Dups Bar */}
                            <div
                              style={{ height: `${dupHeight}%` }}
                              className="w-1/3 rounded-t-md bg-amber-500/70 group-hover:bg-amber-400 transition-all shadow-sm"
                            />
                          </div>

                          <span className="text-[11px] font-bold text-slate-300 mt-2 truncate">
                            {day.dayName}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            {day.scanned}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Weekly Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-[#0e1623] border border-[#1e2d42]">
                  <div className="text-slate-400 text-xs font-semibold mb-1">סה"כ נסיעות שנשלחו השבוע</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    {(data?.dailyStats || []).reduce((acc, d) => acc + d.sent, 0)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">נסיעות מדויקות שאושרו ונשלחו לנהגים</div>
                </div>

                <div className="p-4 rounded-xl bg-[#0e1623] border border-[#1e2d42]">
                  <div className="text-slate-400 text-xs font-semibold mb-1">כפילויות שנחסמו אוטומטית</div>
                  <div className="text-2xl font-black text-amber-400 font-mono">
                    {(data?.dailyStats || []).reduce((acc, d) => acc + d.duplicates, 0)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">הודעות ספאם ופוסטים כפולים מקבוצות</div>
                </div>

                <div className="p-4 rounded-xl bg-[#0e1623] border border-[#1e2d42]">
                  <div className="text-slate-400 text-xs font-semibold mb-1">פקודות שינוי חיפוש מנהגים</div>
                  <div className="text-2xl font-black text-blue-400 font-mono">
                    {(data?.dailyStats || []).reduce((acc, d) => acc + d.commands, 0)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">הודעות וואטסאפ לפנוי / תפוס / צמצם</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SEARCH CATEGORIES & DURATIONS */}
          {activeTab === 'categories' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Categories Breakdown */}
                <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-4">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-teal-400" />
                    התפלגות סוגי החיפושים של הנהגים
                  </h3>

                  <div className="space-y-3.5 pt-1">
                    {(data?.searchCategories || []).map((cat) => (
                      <div key={cat.category} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="flex items-center gap-2 text-slate-200">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                            {cat.name}
                          </span>
                          <span className="font-mono text-white">
                            {cat.percentage}% ({cat.count} חיפושים)
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#172230] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Average Search Durations */}
                <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-4">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    ממוצע זמן חיפוש פעיל לפי סוג
                  </h3>

                  <div className="space-y-3 pt-1">
                    {(data?.searchCategories || []).map((cat) => (
                      <div key={cat.category} className="p-3 rounded-xl bg-[#121c2c] border border-[#223348] flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-200">{cat.name}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">זמן ממוצע עד מעבר לתפוס או תפיסה</div>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black text-teal-300 font-mono">
                            {cat.avgDurationMinutes}
                          </span>
                          <span className="text-xs text-slate-400 mr-1">דקות</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Insight Box */}
              <div className="p-4 rounded-xl bg-teal-950/20 border border-teal-500/30 text-teal-300 text-xs leading-relaxed flex items-start gap-3">
                <Compass className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold mb-0.5">💡 תובנת חיפוש מרכזית:</strong>
                  חיפושים פנימיים (תוך-עירוניים) הם הפופולריים ביותר בקרב הנהגים (48%), ומחזיקים זמן ממוצע גבוה (52 דקות). נהגים בינעירוניים (כגון בית שמש ⬅️ ירושלים) מוצאים נסיעה מהר יותר בממוצע (38 דקות) ועוברים למצב תפוס.
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ROUTES & PEAK HOURS */}
          {activeTab === 'routes' && (
            <div className="space-y-6">
              {/* Hourly Traffic Chart */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      עומס נסיעות לפי שעות היממה (24 שעות)
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      מציג באילו שעות הסדרנים מפרסמים את כמות הנסיעות הגבוהה ביותר
                    </p>
                  </div>
                  <div className="text-xs text-amber-300 font-bold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30">
                    שעות שיא: 20:00 - 22:30
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
                          <span className="text-[9px] text-slate-400 font-mono mt-1 rotate-45 sm:rotate-0 origin-right">
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

          {/* TAB 4: DRIVER ACTIVITY */}
          {activeTab === 'drivers' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-[#0e1623] border border-[#1e2d42] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    מעקב פעילות נהגים וחיפושים
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    פירוט חיפוש פעיל, זמני פעילות מצטברים ומספר הפעלות חיפוש
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#182536] text-xs">
                    {(data?.driverActivity || []).map((driver) => (
                      <tr key={driver.phone} className="hover:bg-[#131d2c] transition-colors">
                        <td className="py-3 font-bold text-white">{driver.name || 'נהג מורשה'}</td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#1d2b3e] bg-[#0c121d] flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="text-slate-400 text-[11px]">
            הנתונים מתעדכנים בזמן אמת מסריקות הוואטסאפ וחיפושי הנהגים בשרת
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
