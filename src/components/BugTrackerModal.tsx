import React, { useState, useMemo } from 'react';
import { 
  Bug, 
  X, 
  Copy, 
  Check, 
  Trash2, 
  RefreshCw, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  ShieldAlert, 
  CheckCircle2,
  Terminal,
  Clock
} from 'lucide-react';
import { ErrorReport } from '../types.ts';

import { ConfirmModal } from './ConfirmModal.tsx';

interface BugTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  errors: ErrorReport[];
  onClearErrors: () => Promise<void>;
  onRefreshErrors: () => void;
  isApiConnected: boolean;
}

const CATEGORY_MAP: Record<string, { label: string; badge: string }> = {
  baileys_connection: { label: 'חיבור Baileys', badge: 'bg-rose-950/60 text-rose-300 border-rose-500/30' },
  baileys_driver_disconnect: { label: 'ניתוק וואטסאפ נהג', badge: 'bg-orange-950/60 text-orange-300 border-orange-500/30' },
  pairing_rejected_lid: { label: 'חסימת צימוד LID', badge: 'bg-amber-950/60 text-amber-300 border-amber-500/30' },
  pairing_code_request: { label: 'שגיאת הפקת קוד', badge: 'bg-red-950/60 text-red-300 border-red-500/30' },
  send_approval: { label: 'שליחת אישור', badge: 'bg-purple-950/60 text-purple-300 border-purple-500/30' },
  send_approval_alt: { label: 'שליחה ביעד חלופי', badge: 'bg-indigo-950/60 text-indigo-300 border-indigo-500/30' },
  uncaught_exception: { label: 'קריסה Uncaught', badge: 'bg-rose-950/80 text-rose-200 border-rose-500/50' },
  unhandled_rejection: { label: 'חריגת Promise', badge: 'bg-red-950/80 text-red-200 border-red-500/50' },
  system_event: { label: 'שגיאת מערכת', badge: 'bg-slate-800 text-slate-300 border-slate-700' },
};

export const BugTrackerModal: React.FC<BugTrackerModalProps> = ({
  isOpen,
  onClose,
  errors,
  onClearErrors,
  onRefreshErrors,
  isApiConnected,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const filteredErrors = useMemo(() => {
    return errors.filter((err) => {
      if (selectedCategory !== 'all' && err.category !== selectedCategory) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        err.message.toLowerCase().includes(term) ||
        err.category.toLowerCase().includes(term) ||
        (err.stack && err.stack.toLowerCase().includes(term)) ||
        (err.details && JSON.stringify(err.details).toLowerCase().includes(term))
      );
    });
  }, [errors, selectedCategory, searchTerm]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    errors.forEach((e) => set.add(e.category));
    return Array.from(set);
  }, [errors]);

  if (!isOpen) return null;

  const handleCopyReport = () => {
    let report = `# 🐞 דוח באגים ושגיאות מערכת - נסיעות בוט\n`;
    report += `תאריך הפקה: ${new Date().toLocaleString('he-IL')}\n`;
    report += `סטטוס שרת: ${isApiConnected ? 'מחובר (Online)' : 'מנותק (Offline)'}\n`;
    report += `סך כל השגיאות שנלכדו: ${errors.length}\n\n`;

    if (errors.length === 0) {
      report += `✅ אין שגיאות פעילות במערכת - הכל תקין!\n`;
    } else {
      errors.slice(0, 30).forEach((err, idx) => {
        report += `### [${idx + 1}] ${err.time} | קטגוריה: ${err.category}\n`;
        report += `**הודעה:** ${err.message}\n`;
        if (err.details && Object.keys(err.details).length > 0) {
          report += `**פרטים:** \`\`\`json\n${JSON.stringify(err.details, null, 2)}\n\`\`\`\n`;
        }
        if (err.stack) {
          report += `**Stack:**\n\`\`\`\n${err.stack.split('\n').slice(0, 5).join('\n')}\n\`\`\`\n`;
        }
        report += `──────────────────────────────────\n\n`;
      });
    }

    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const executeClear = async () => {
    setIsClearing(true);
    try {
      await onClearErrors();
      setShowClearConfirm(false);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <ConfirmModal
        isOpen={showClearConfirm}
        title="ניקוי יומן השגיאות"
        message="האם אתה בטוח שברצונך למחוק את כל דוחות השגיאות מהיומן? לא ניתן לשחזר דוחות שיימחקו."
        confirmText="נקה יומן"
        cancelText="ביטול"
        variant="danger"
        loading={isClearing}
        onConfirm={executeClear}
        onCancel={() => setShowClearConfirm(false)}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-[#0c121a] border border-[#233348] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1b2636] bg-[#0e1522] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">יומן באגים ושגיאות מערכת</h2>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                    errors.length > 0
                      ? 'bg-rose-950/60 text-rose-300 border-rose-500/30'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {errors.length} שגיאות
                </span>
              </div>
              <p className="text-xs text-slate-400">
                ניטור בזמן אמת של חריגות Baileys, שגיאות צימוד (Pairing), שליחת הודעות ומזהי LID
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefreshErrors}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="רענן יומן שגיאות"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="p-4 border-b border-[#1a2536] bg-[#0a0f16] flex flex-wrap items-center justify-between gap-2.5">
          {/* Quick Copy Button */}
          <button
            onClick={handleCopyReport}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-lg shadow-rose-950/40 transition-all cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'דוח באגים הועתק ללוח!' : '📋 העתק דוח באגים מלא ל-AI'}</span>
          </button>

          {/* Clear Button */}
          {errors.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={isClearing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-rose-300 hover:text-rose-100 bg-rose-950/40 hover:bg-rose-900/40 border border-rose-500/30 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>נקה יומן</span>
            </button>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חיפוש לפי שגיאה, קטגוריה או מספר..."
              className="w-full bg-[#111722] border border-[#233348] rounded-xl pr-8 pl-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500/50"
            />
          </div>
        </div>

        {/* Categories Bar */}
        {categories.length > 0 && (
          <div className="px-4 py-2 border-b border-[#182333] bg-[#0d141f] flex flex-wrap gap-1.5 overflow-x-auto text-xs">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-slate-700 text-white font-bold'
                  : 'bg-[#121a26] text-slate-400 hover:text-slate-200'
              }`}
            >
              הכל ({errors.length})
            </button>
            {categories.map((cat) => {
              const cfg = CATEGORY_MAP[cat] || { label: cat, badge: 'bg-slate-800 text-slate-300' };
              const count = errors.filter((e) => e.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-rose-900/60 text-rose-200 border border-rose-500/40 font-bold'
                      : 'bg-[#121a26] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cfg.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Errors List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#182333] p-2 space-y-2">
          {filteredErrors.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">
                {errors.length === 0 ? 'אין שגיאות פעילות במערכת!' : 'לא נמצאו שגיאות התואמות לחיפוש'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {errors.length === 0
                  ? 'כל סשני הוואטסאפ, הפקת קודי הצימוד, ושליחת ההודעות לנהגים פועלים באופן חלק ותקין.'
                  : 'נסה לאפס את החיפוש או לבחור קטגוריה אחרת'}
              </p>
            </div>
          ) : (
            filteredErrors.map((err) => {
              const isExpanded = expandedId === err.id;
              const catCfg = CATEGORY_MAP[err.category] || { label: err.category, badge: 'bg-slate-800 text-slate-300' };
              
              return (
                <div
                  key={err.id}
                  className="rounded-xl bg-[#111722] border border-[#202d3f] p-3 text-xs space-y-2 hover:border-[#2d3f56] transition-all"
                >
                  {/* Summary Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${catCfg.badge}`}>
                            {catCfg.label}
                          </span>
                          <span className="font-mono text-slate-400 text-[11px] flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {err.time || (err.t ? new Date(err.t).toLocaleTimeString('he-IL') : '')}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-100 break-words">{err.message}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : err.id)}
                      className="p-1 rounded text-slate-400 hover:text-white shrink-0 hover:bg-[#1a2536]"
                      title={isExpanded ? 'צמצם פרטים' : 'הרחב פרטים מלאים'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-[#1b2636] space-y-2 animate-in fade-in duration-150">
                      {err.details && Object.keys(err.details).length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 mb-1 flex items-center gap-1">
                            <Terminal className="w-3 h-3 text-amber-400" />
                            פרמטרים ופרטי האירוע:
                          </div>
                          <pre className="p-2.5 rounded-lg bg-[#080d14] border border-[#1e2a3a] text-slate-300 font-mono text-[11px] overflow-x-auto" dir="ltr">
                            {JSON.stringify(err.details, null, 2)}
                          </pre>
                        </div>
                      )}

                      {err.stack && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 mb-1">עקבת שגיאה (Stack Trace):</div>
                          <pre className="p-2.5 rounded-lg bg-[#080d14] border border-[#1e2a3a] text-rose-300/80 font-mono text-[10px] overflow-x-auto max-h-36" dir="ltr">
                            {err.stack}
                          </pre>
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => {
                            const errText = `שגיאה [${err.category}]: ${err.message}\n${err.stack || ''}\nפרטים: ${JSON.stringify(err.details || {})}`;
                            navigator.clipboard.writeText(errText);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#162130] hover:bg-[#1c2a3d] text-slate-300 text-[11px] cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          העתק שגיאה ספציפית זו
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1b2636] bg-[#0e1522] flex items-center justify-between text-xs text-slate-400">
          <span>💡 טיפ: לחץ על "העתק דוח באגים מלא" והדבק ישירות בשיחה לתיקון מיידי ע"י המערכת</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors cursor-pointer"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
    </>
  );
};
