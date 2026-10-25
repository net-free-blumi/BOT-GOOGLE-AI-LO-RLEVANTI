import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Filter, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  Check, 
  ArrowDownCircle, 
  ExternalLink,
  X,
  Clock,
  Sparkles
} from 'lucide-react';
import { LogItem, LogType } from '../types.ts';

interface LiveLogsCardProps {
  logs: LogItem[];
  selectedType: string;
  onSelectType: (type: string) => void;
  lastUpdated: Date | null;
  loading: boolean;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; badgeClass: string; dotClass: string }
> = {
  all: { label: 'הכל', badgeClass: 'bg-slate-800 text-slate-300 border-slate-700', dotClass: 'bg-slate-400' },
  sent: { label: 'נשלחו לנהג', badgeClass: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30', dotClass: 'bg-emerald-400' },
  rejected: { label: 'נדחו', badgeClass: 'bg-rose-950/50 text-rose-300 border-rose-500/30', dotClass: 'bg-rose-400' },
  duplicate: { label: 'כפילויות', badgeClass: 'bg-amber-950/50 text-amber-300 border-amber-500/30', dotClass: 'bg-amber-400' },
  command: { label: 'פקודות', badgeClass: 'bg-blue-950/50 text-blue-300 border-blue-500/30', dotClass: 'bg-blue-400' },
  system: { label: 'מערכת', badgeClass: 'bg-teal-950/50 text-teal-300 border-teal-500/30', dotClass: 'bg-teal-400' },
  error: { label: 'שגיאות', badgeClass: 'bg-red-950/50 text-red-300 border-red-500/30', dotClass: 'bg-red-400' },
};

export const LiveLogsCard: React.FC<LiveLogsCardProps> = ({
  logs,
  selectedType,
  onSelectType,
  lastUpdated,
  loading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [activeLogModal, setActiveLogModal] = useState<LogItem | null>(null);
  const [copiedLog, setCopiedLog] = useState(false);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedType !== 'all' && log.type !== selectedType) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        log.message?.toLowerCase().includes(term) ||
        log.text?.toLowerCase().includes(term) ||
        log.reason?.toLowerCase().includes(term) ||
        log.matchedCity?.toLowerCase().includes(term) ||
        log.sender?.toLowerCase().includes(term)
      );
    });
  }, [logs, selectedType, searchTerm]);

  const formatLogTime = (log: LogItem) => {
    if (log.time && typeof log.time === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(log.time.trim())) {
      return log.time.trim();
    }
    const val = log.t || log.timestamp;
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('he-IL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      }
    }
    if (log.date) {
      const d = new Date(log.date);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('he-IL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      }
    }
    return '--:--:--';
  };

  const formatLogDateTime = (log: LogItem) => {
    const val = log.t || log.timestamp || log.date;
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('he-IL');
      }
    }
    if (log.time) return String(log.time);
    return 'תאריך שוטף';
  };

  const handleCopyLogText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#121822] to-[#0c1118] border border-[#223044] p-5 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">יומן פעילות וסינון בזמן אמת</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#1b2636] text-slate-300 font-mono">
                {filteredLogs.length} אירועים
              </span>
            </div>
            <p className="text-xs text-slate-400">
              כל הודעה שסורק הבוט, כולל סיבת אישור/דחייה וזיהוי כפילויות
            </p>
          </div>
        </div>

        {/* Status / Timestamp */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {lastUpdated && (
            <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              עודכן: {lastUpdated.toLocaleTimeString('he-IL')}
            </span>
          )}
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        {/* Type Tabs */}
        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
            const isSelected = selectedType === type;
            return (
              <button
                key={type}
                onClick={() => onSelectType(type)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? `${cfg.badgeClass} ring-1 ring-amber-400/30 scale-[1.02]`
                    : 'bg-[#090d14] border-[#1f2c3d] text-slate-400 hover:text-slate-200 hover:bg-[#121924]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px] sm:w-64">
          <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חיפוש ביומן (עיר, רחוב, שגיאה)..."
            className="w-full pr-9 pl-3 py-1.5 rounded-xl bg-[#090d14] border border-[#223044] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
        </div>
      </div>

      {/* Logs Stream Box */}
      <div className="rounded-xl border border-[#1e2a3b] bg-[#070a0f] overflow-hidden">
        <div className="max-h-[420px] overflow-y-auto divide-y divide-[#131b26]">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <FileText className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">אין אירועים להצגה</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchTerm
                  ? 'לא נמצאו אירועים התואמים לחיפוש הנוכחי.'
                  : 'כאשר החיפוש פעיל והודעות יזרמו מקבוצות הוואטסאפ, הן יופיעו כאן מיד.'}
              </p>
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              const cfg = TYPE_CONFIG[log.type] || TYPE_CONFIG.system;
              return (
                <div
                  key={`${log.t}-${index}`}
                  onClick={() => setActiveLogModal(log)}
                  className="p-3 sm:px-4 hover:bg-[#0e141f] transition-colors cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    {/* Timestamp */}
                    <span className="font-mono text-xs text-slate-400 shrink-0 font-medium">
                      {formatLogTime(log)}
                    </span>

                    {/* Badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${cfg.badgeClass}`}
                    >
                      {cfg.label}
                    </span>

                    {/* Message */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-200 font-medium truncate group-hover:text-amber-300 transition-colors">
                        {log.message}
                      </p>
                      {log.text && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5 font-normal">
                          {log.text}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Reason or Extra Info */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 self-end sm:self-auto shrink-0">
                    {log.reason && (
                      <span className="px-2 py-0.5 rounded bg-rose-950/30 text-rose-300/90 border border-rose-500/20 text-[10px] truncate max-w-[160px]">
                        {log.reason}
                      </span>
                    )}
                    {log.matchedCity && (
                      <span className="px-2 py-0.5 rounded bg-emerald-950/30 text-emerald-300 border border-emerald-500/20 text-[10px]">
                        {log.matchedCity}
                      </span>
                    )}
                    <span className="text-slate-600 group-hover:text-amber-400 text-xs">←</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Log Details Modal */}
      {activeLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-[#0e141e] border border-[#233348] rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c293a]">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    TYPE_CONFIG[activeLogModal.type]?.badgeClass || ''
                  }`}
                >
                  {TYPE_CONFIG[activeLogModal.type]?.label || activeLogModal.type}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {formatLogDateTime(activeLogModal)}
                </span>
              </div>
              <button
                onClick={() => setActiveLogModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block mb-1">הודעת מערכת:</span>
                <div className="p-2.5 rounded-xl bg-[#080c13] border border-[#1b2636] text-slate-200">
                  {activeLogModal.message}
                </div>
              </div>

              {activeLogModal.text && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 font-semibold">תוכן ההודעה המלא (מוואטסאפ):</span>
                    <button
                      onClick={() => handleCopyLogText(activeLogModal.text || '')}
                      className="text-amber-400 hover:underline flex items-center gap-1 text-[11px]"
                    >
                      {copiedLog ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedLog ? 'הועתק!' : 'העתק תוכן'}
                    </button>
                  </div>
                  <div className="p-3 rounded-xl bg-[#080c13] border border-[#1b2636] text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                    {activeLogModal.text}
                  </div>
                </div>
              )}

              {activeLogModal.reason && (
                <div>
                  <span className="text-rose-400 font-semibold block mb-1">סיבת סינון / דחייה:</span>
                  <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-200">
                    {activeLogModal.reason}
                  </div>
                </div>
              )}

              {activeLogModal.sender && (
                <div className="flex items-center justify-between text-slate-400">
                  <span>שולח / קבוצה:</span>
                  <span className="font-mono text-slate-200">{activeLogModal.sender}</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setActiveLogModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-200 hover:text-white"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
