import React, { useState } from 'react';
import { 
  Navigation, 
  MapPin, 
  ArrowLeftRight, 
  Send, 
  Square, 
  Sparkles, 
  Compass, 
  ShieldAlert,
  CheckCircle2,
  Sliders,
  ChevronDown,
  Moon,
  Zap,
  Tag
} from 'lucide-react';
import { DriverState, CityAlias } from '../types.ts';
import { translateDriverShorthand } from '../services/shortcuts.ts';

interface ActiveSearchCardProps {
  search: DriverState;
  onSendCommand: (cmd: string) => Promise<void>;
  onStopSearch: () => Promise<void>;
  shortcuts: CityAlias[];
  onOpenShortcutsModal: () => void;
  loading: boolean;
}

export const ActiveSearchCard: React.FC<ActiveSearchCardProps> = ({
  search,
  onSendCommand,
  onStopSearch,
  shortcuts,
  onOpenShortcutsModal,
  loading,
}) => {
  const [customInput, setCustomInput] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderOrigin, setBuilderOrigin] = useState('בית שמש');
  const [builderMode, setBuilderMode] = useState<'internal' | 'route' | 'from' | 'reduce'>('route');
  const [builderDest, setBuilderDest] = useState('ירושלים');

  const handleQuickCommand = (cmd: string) => {
    const { translated } = translateDriverShorthand(cmd, shortcuts);
    onSendCommand(translated);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    const { translated } = translateDriverShorthand(customInput.trim(), shortcuts);
    onSendCommand(translated);
    setCustomInput('');
  };

  const handleBuilderApply = () => {
    let cmd = '';
    if (builderMode === 'internal') {
      cmd = `פנוי פ ${builderOrigin}`;
    } else if (builderMode === 'reduce') {
      cmd = `פנוי ${builderOrigin}`; // handles both internal and outward
    } else if (builderMode === 'from') {
      cmd = `פנוי ${builderOrigin}`;
    } else {
      cmd = `פנוי ${builderOrigin} ל${builderDest}`;
    }
    onSendCommand(cmd);
  };

  const getModeLabel = (mode: string | null) => {
    switch (mode) {
      case 'internal':
        return 'נסיעות פנימיות בלבד';
      case 'route':
        return 'מסלול ישיר בין ערים';
      case 'from':
        return 'יציאה מעיר (חיצוני ופנימי)';
      case 'reduce':
        return 'מצב צמצום (פנימי וחיצוני)';
      default:
        return 'לא מוגדר';
    }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#121822] to-[#0c1118] border border-[#223044] p-5 shadow-xl space-y-5">
      {/* Header & Status Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              מצב חיפוש נסיעות
              {search.active ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  מחפש פעיל
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                  <Moon className="w-3 h-3 text-indigo-400" />
                  במצב שינה / תפוס
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              הפעלת מצב פנוי, קיצורי הקלדה מהירים, ומצב צמצום
            </p>
          </div>
        </div>

        {/* Emergency Stop / Sleep Button */}
        <button
          onClick={onStopSearch}
          disabled={loading || !search.active}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            search.active
              ? 'bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 shadow-lg shadow-rose-500/10 hover:scale-[1.02]'
              : 'bg-slate-800/40 border border-slate-700/40 text-slate-500 cursor-not-allowed'
          }`}
          title="עצור את החיפוש - הבוט ייכנס למצב שינה/תפוס ולא ישלח נסיעות"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          עצור חיפוש (תפוס / שינה)
        </button>
      </div>

      {/* Active Search Banner */}
      <div
        className={`p-4 rounded-xl border transition-all ${
          search.active
            ? 'bg-gradient-to-r from-amber-950/40 via-[#151d2a] to-emerald-950/30 border-amber-500/40 shadow-inner'
            : 'bg-[#090d14] border-[#1d2736]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              חיפוש מוגדר כעת:
            </div>
            <div className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              {search.active ? search.displayText || 'פעיל' : 'אין חיפוש פעיל (הבוט במצב שינה)'}
              {search.active && search.mode && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-[#1e2a3c] text-amber-300 border border-amber-500/20">
                  {getModeLabel(search.mode)}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-300 font-normal">
              {search.active
                ? search.describe || 'הבוט סורק ומעביר נסיעות תואמות בלבד'
                : 'הבוט לא עובד קשה כעת. לחץ על קיצור למטה כדי לעורר אותו ולהתחיל לקבל נסיעות.'}
            </div>
          </div>

          {search.active ? (
            <div className="flex items-center gap-2 self-start sm:self-auto bg-[#090e17] px-3 py-2 rounded-lg border border-[#202d3f] text-xs font-mono text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>סינון פעיל: {search.origin || 'עיר מוגדרת'}</span>
            </div>
          ) : (
            <button
              onClick={() => handleQuickCommand('פ שמש')}
              className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/15"
            >
              <Zap className="w-3.5 h-3.5" />
              הער את הבוט (פנוי שמש)
            </button>
          )}
        </div>
      </div>

      {/* Shorthand Chips Section (Requested by user) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            קיצורי הקלדה בלחיצה אחת:
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenShortcutsModal}
              className="text-xs text-teal-300 hover:text-teal-200 flex items-center gap-1 cursor-pointer font-medium"
            >
              <Tag className="w-3 h-3" />
              ערוך קיצורים
            </button>
            <button
              type="button"
              onClick={() => setShowBuilder(!showBuilder)}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer"
            >
              <Sliders className="w-3 h-3" />
              {showBuilder ? 'סגור בונה' : 'בונה מסלולים'}
              <ChevronDown className={`w-3 h-3 transition-transform ${showBuilder ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Reduced Mode chips */}
          <button
            type="button"
            onClick={() => handleQuickCommand('שמש צמצם')}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500/20 to-amber-600/10 hover:from-amber-500/30 hover:to-amber-600/20 border border-amber-500/40 text-amber-300 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            title="שמש צמצם: נסיעות פנימיות וגם יוצאות מבית שמש"
          >
            ⚡ שמש צמצם (פנימי + יוצא)
          </button>
          <button
            type="button"
            onClick={() => handleQuickCommand('ים צמצם')}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-500/20 to-teal-600/10 hover:from-teal-500/30 hover:to-teal-600/20 border border-teal-500/40 text-teal-300 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            title="ים צמצם: נסיעות פנימיות וגם יוצאות מירושלים"
          >
            ⚡ ים צמצם (פנימי + יוצא)
          </button>

          {/* Direct Route shorthand */}
          <button
            type="button"
            onClick={() => handleQuickCommand('פ ים שמש')}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#0e1520] hover:bg-[#152030] border border-[#223044] hover:border-amber-500/40 text-slate-200 hover:text-amber-300 transition-all cursor-pointer flex items-center gap-1.5"
            title="פ ים שמש: ירושלים לבית שמש"
          >
            🔄 פ ים שמש (י-ם ← בית שמש)
          </button>
          <button
            type="button"
            onClick={() => handleQuickCommand('פ שמש ים')}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#0e1520] hover:bg-[#152030] border border-[#223044] hover:border-amber-500/40 text-slate-200 hover:text-amber-300 transition-all cursor-pointer flex items-center gap-1.5"
            title="פ שמש ים: בית שמש לירושלים"
          >
            🚀 פ שמש ים (בית שמש ← י-ם)
          </button>
          <button
            type="button"
            onClick={() => handleQuickCommand('פ פנימי שמש')}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#0e1520] hover:bg-[#152030] border border-[#223044] hover:border-amber-500/40 text-slate-200 hover:text-amber-300 transition-all cursor-pointer flex items-center gap-1.5"
          >
            🚕 פ פנימי שמש
          </button>
          <button
            type="button"
            onClick={() => handleQuickCommand('פ בב')}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#0e1520] hover:bg-[#152030] border border-[#223044] hover:border-amber-500/40 text-slate-200 hover:text-amber-300 transition-all cursor-pointer flex items-center gap-1.5"
          >
            📍 פ בב (יוצא מבני ברק)
          </button>
          <button
            type="button"
            onClick={() => handleQuickCommand('פ שמש למוע')}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#0e1520] hover:bg-[#152030] border border-[#223044] hover:border-amber-500/40 text-slate-200 hover:text-amber-300 transition-all cursor-pointer flex items-center gap-1.5"
          >
            🏢 בית שמש ← מו"ע
          </button>
        </div>
      </div>

      {/* Interactive Route Builder (Collapsible) */}
      {showBuilder && (
        <div className="p-4 rounded-xl bg-[#090e17] border border-[#202d3f] space-y-3.5 animate-in fade-in duration-150">
          <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            בונה פקודות מסלול מותאם אישית
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Origin City */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-medium">עיר מוצא</label>
              <select
                value={builderOrigin}
                onChange={(e) => setBuilderOrigin(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#121926] border border-[#233348] text-white text-xs focus:outline-none focus:border-amber-400"
              >
                {shortcuts.map((s) => (
                  <option key={s.id} value={s.city}>{s.city} ({s.shortcut})</option>
                ))}
              </select>
            </div>

            {/* Mode */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-medium">סוג חיפוש</label>
              <select
                value={builderMode}
                onChange={(e) => setBuilderMode(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg bg-[#121926] border border-[#233348] text-white text-xs focus:outline-none focus:border-amber-400"
              >
                <option value="route">מסלול ישיר (מ... ל...)</option>
                <option value="reduce">מצב צמצום (פנימי וגם יוצא)</option>
                <option value="internal">פנימי בלבד בתוך העיר</option>
                <option value="from">יוצא מהעיר לכל יעד</option>
              </select>
            </div>

            {/* Destination City */}
            {builderMode === 'route' && (
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 font-medium">עיר יעד</label>
                <select
                  value={builderDest}
                  onChange={(e) => setBuilderDest(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121926] border border-[#233348] text-white text-xs focus:outline-none focus:border-amber-400"
                >
                  {shortcuts.map((s) => (
                    <option key={s.id} value={s.city}>{s.city} ({s.shortcut})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#182333]">
            <div className="text-xs font-mono text-slate-400">
              פקודה שתיווצר:{' '}
              <span className="text-amber-300 font-bold">
                {builderMode === 'internal'
                  ? `פנוי פ ${builderOrigin}`
                  : builderMode === 'reduce'
                  ? `פנוי ${builderOrigin} (צמצום)`
                  : builderMode === 'from'
                  ? `פנוי ${builderOrigin}`
                  : `פנוי ${builderOrigin} ל${builderDest}`}
              </span>
            </div>
            <button
              type="button"
              onClick={handleBuilderApply}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
            >
              הפעל חיפוש זה
            </button>
          </div>
        </div>
      )}

      {/* Free Text Command Input (With Auto Shorthand Translation) */}
      <form onSubmit={handleCustomSubmit} className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
          <span>הקלד פקודה חופשית (תומך בכל הקיצורים: ים, בב, שמש, צמצם, פנוי):</span>
          {customInput && (
            <span className="font-mono text-emerald-400 text-[10px]">
              תרגום חי: {translateDriverShorthand(customInput, shortcuts).translated}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder='למשל: "פ ים שמש", "שמש צמצם", "פ בב לאשדוד", "תפוס"'
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#090d14] border border-[#223044] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !customInput.trim()}
            className="px-5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            שגר פקודה
          </button>
        </div>
      </form>
    </div>
  );
};
