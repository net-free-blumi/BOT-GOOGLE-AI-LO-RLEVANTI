import React, { useState } from 'react';
import { 
  X, 
  Tag, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Check, 
  Copy, 
  ArrowRight, 
  Sparkles,
  Search,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  MapPin,
  Compass
} from 'lucide-react';
import { CityAlias } from '../types.ts';
import { 
  DEFAULT_SHORTCUTS, 
  translateDriverShorthand, 
  simulateRideMatch, 
  SimulationResult 
} from '../services/shortcuts.ts';

interface CityShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: CityAlias[];
  onSaveShortcuts: (list: CityAlias[]) => void;
  onApplyCommand: (cmd: string) => void;
}

export const CityShortcutsModal: React.FC<CityShortcutsModalProps> = ({
  isOpen,
  onClose,
  shortcuts,
  onSaveShortcuts,
  onApplyCommand,
}) => {
  const [list, setList] = useState<CityAlias[]>(shortcuts);
  const [activeTab, setActiveTab] = useState<'shortcuts' | 'simulator' | 'villages'>('shortcuts');
  const [newShortcut, setNewShortcut] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newNote, setNewNote] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);

  // Simulator state
  const [simCommand, setSimCommand] = useState('פנוי שמש פנימי');
  const [simMessage, setSimMessage] = useState('שמש פ 80');
  const [simResult, setSimResult] = useState<SimulationResult>(() => 
    simulateRideMatch('שמש פ 80', 'פנוי שמש פנימי', shortcuts)
  );

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortcut.trim() || !newCity.trim()) return;
    const item: CityAlias = {
      id: Date.now().toString(),
      shortcut: newShortcut.trim(),
      city: newCity.trim(),
      note: newNote.trim() || 'קיצור אישי',
    };
    const updated = [item, ...list];
    setList(updated);
    onSaveShortcuts(updated);
    setNewShortcut('');
    setNewCity('');
    setNewNote('');
  };

  const handleDelete = (id: string) => {
    const updated = list.filter((i) => i.id !== id);
    setList(updated);
    onSaveShortcuts(updated);
  };

  const handleResetDefaults = () => {
    setList(DEFAULT_SHORTCUTS);
    onSaveShortcuts(DEFAULT_SHORTCUTS);
  };

  const runSimulation = (msg: string, cmd: string) => {
    setSimMessage(msg);
    setSimCommand(cmd);
    setSimResult(simulateRideMatch(msg, cmd, list));
  };

  const filteredList = list.filter(
    (item) =>
      item.shortcut.includes(searchFilter) ||
      item.city.includes(searchFilter) ||
      (item.note && item.note.includes(searchFilter))
  );

  const copyForServer = () => {
    const jsonStr = JSON.stringify(
      list.map((i) => ({ shortcut: i.shortcut, city: i.city })),
      null,
      2
    );
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const sampleMessages = [
    { label: 'פנימי שמש (80 ש"ח)', text: 'שמש פ 80', cmd: 'פנוי שמש פנימי' },
    { label: 'ביתר שמש (פסילה מפנימי!)', text: 'ביתר שמש 180 מחסום', cmd: 'פנוי שמש פנימי' },
    { label: 'מושב הר טוב (סמוך לשמש)', text: 'מהרטוב לרמה ד 110', cmd: 'פנוי שמש פנימי' },
    { label: 'פנימי ים (מאה שערים לגאולה)', text: 'מאה שערים לגאולה 50', cmd: 'פנוי פנימי ים' },
    { label: 'שמש לירושלים (חיצוני)', text: 'מרמה ב לרמות ים 180', cmd: 'פ ים שמש' },
    { label: 'בב שמש (בני ברק לבית שמש)', text: 'בב שמש 220 שח', cmd: 'פנוי שמש פנימי' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="w-full max-w-3xl bg-[#0e141e] border border-[#233348] rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#1c293a] bg-[#121926]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">מנהל קיצורי ערים וסימולטור סינון נסיעות</h2>
              <p className="text-xs text-slate-400">
                הגדרת קיצורי שמות (בב, ים, שמש), מושבים סמוכים וסימולציה מלאה למניעת הודעות שגויות
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#1c293a] bg-[#0c121c] px-4 pt-2 gap-2 text-xs">
          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`px-4 py-2.5 font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'shortcuts'
                ? 'bg-[#0e141e] text-amber-400 border-t-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            קיצורי ערים ({list.length})
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-4 py-2.5 font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'simulator'
                ? 'bg-[#0e141e] text-emerald-400 border-t-2 border-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            סימולטור בדיקת נסיעות בזמן אמת
          </button>
          <button
            onClick={() => setActiveTab('villages')}
            className={`px-4 py-2.5 font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'villages'
                ? 'bg-[#0e141e] text-blue-400 border-t-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            מושבים סמוכים לבית שמש
          </button>
        </div>

        {/* Tab 1: Shortcuts */}
        {activeTab === 'shortcuts' && (
          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto text-xs">
            {/* Search and stats */}
            <div className="flex flex-col sm:flex-row gap-2 justify-between items-center">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="חיפוש קיצור או עיר..."
                  className="w-full pr-8 pl-3 py-1.5 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={copyForServer}
                  className="px-3 py-1.5 rounded-lg bg-[#141d2a] border border-[#233348] text-[11px] text-teal-300 hover:bg-[#1a2638] flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedJson ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedJson ? 'הועתק ללוח!' : 'העתק JSON לשרת'}
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="px-3 py-1.5 rounded-lg bg-[#141d2a] border border-[#233348] text-[11px] text-slate-300 hover:text-rose-400 flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  איפוס לברירת מחדל
                </button>
              </div>
            </div>

            {/* Add New Shortcut Form */}
            <form onSubmit={handleAdd} className="p-3.5 rounded-xl bg-[#0a0f17] border border-[#1d293a] space-y-2.5">
              <span className="text-xs font-bold text-amber-300 block flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                הוסף קיצור / עיר חדשה לרשימה:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newShortcut}
                  onChange={(e) => setNewShortcut(e.target.value)}
                  placeholder='קיצור (למשל: "מוע" או "כס")'
                  required
                  className="px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
                <input
                  type="text"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder='שם העיר המלא (למשל: "מודיעין עילית")'
                  required
                  className="px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="הערה (אופציונלי)"
                    className="flex-1 px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    שמור
                  </button>
                </div>
              </div>
            </form>

            {/* Shortcuts Table */}
            <div className="rounded-xl border border-[#1e2a3b] bg-[#070a0f] divide-y divide-[#131b26] max-h-72 overflow-y-auto">
              {filteredList.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 sm:px-4 flex items-center justify-between text-xs hover:bg-[#0c121a] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {item.shortcut}
                    </span>
                    <span className="text-slate-500">←</span>
                    <span className="font-semibold text-white">{item.city}</span>
                    {item.note && (
                      <span className="text-[10px] text-slate-500 hidden sm:inline">
                        ({item.note})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const translated = translateDriverShorthand(`פ ${item.shortcut}`, list).translated;
                        onApplyCommand(translated);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded bg-[#131c28] text-slate-300 hover:text-amber-300 text-[10px] font-mono cursor-pointer border border-[#223044]"
                      title="הפעל פקודת בוט זו"
                    >
                      הפעל
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Matcher Simulator */}
        {activeTab === 'simulator' && (
          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto text-xs">
            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs">
              <strong>💡 סימולטור התאמות:</strong> מאפשר לך לבדוק בדיוק איך הבוט יגיב להודעה אמיתית מקבוצת וואטסאפ לפי פקודת החיפוש שלך, ולוודא שהנסיעות הלא-רלוונטיות נפסלות מיידית!
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-slate-400 text-[11px] block">דוגמאות מהשטח לבדיקה מהירה:</span>
              <div className="flex flex-wrap gap-1.5">
                {sampleMessages.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => runSimulation(s.text, s.cmd)}
                    className="px-2.5 py-1 rounded-lg bg-[#141e2c] hover:bg-[#1c293c] text-slate-200 border border-[#25374e] text-[11px] cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">הודעת וואטסאפ לבדיקה:</label>
                <textarea
                  rows={2}
                  value={simMessage}
                  onChange={(e) => {
                    const msg = e.target.value;
                    setSimMessage(msg);
                    setSimResult(simulateRideMatch(msg, simCommand, list));
                  }}
                  placeholder='הדבק כאן הודעה, למשל: "שמש פ 80" או "ביתר שמש 180 מחסום"'
                  className="w-full p-2.5 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">פקודת חיפוש נהג:</label>
                <input
                  type="text"
                  value={simCommand}
                  onChange={(e) => {
                    const cmd = e.target.value;
                    setSimCommand(cmd);
                    setSimResult(simulateRideMatch(simMessage, cmd, list));
                  }}
                  placeholder='למשל: "פנוי שמש פנימי", "פ ים שמש", "שמש צמצם"'
                  className="w-full p-2.5 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs focus:outline-none focus:border-emerald-400 font-mono"
                />
                <span className="text-[10px] text-slate-500 block">
                  תרגום פקודה: {translateDriverShorthand(simCommand, list).translated}
                </span>
              </div>
            </div>

            {/* Simulation Result Box */}
            <div
              className={`p-4 rounded-xl border ${
                simResult.matches
                  ? 'bg-emerald-950/30 border-emerald-500/40'
                  : 'bg-rose-950/30 border-rose-500/40'
              } space-y-3`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {simResult.matches ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                  )}
                  <span
                    className={`font-bold text-sm ${
                      simResult.matches ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {simResult.matches ? 'נסיעה תאושר ותישלח לנהג!' : 'נסיעה זו תיפסל ולא תישלח'}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-black/40 text-slate-300 border border-white/10">
                  מצב: {simResult.mode}
                </span>
              </div>

              <div className="text-xs text-slate-200 bg-[#070b10] p-3 rounded-lg border border-white/5 space-y-1.5 font-mono">
                <div>
                  <span className="text-slate-400">סיבה מדויקת: </span>
                  <span className={simResult.matches ? 'text-emerald-300 font-bold' : 'text-rose-400 font-bold'}>
                    {simResult.reason}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">ערים שזוהו בהודעה: </span>
                  <span className="text-amber-300">
                    {simResult.detectedCities.length > 0 ? simResult.detectedCities.join(', ') : 'אף עיר'}
                  </span>
                </div>
                {simResult.externalCities.length > 0 && (
                  <div>
                    <span className="text-slate-400">ערים חיצוניות שגרמו לפסילה: </span>
                    <span className="text-rose-400 font-bold">
                      {simResult.externalCities.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Surrounding Villages */}
        {activeTab === 'villages' && (
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto text-xs">
            <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/30 text-blue-300 text-xs leading-relaxed">
              <strong>📌 מושבים סמוכים לבית שמש:</strong>
              <br />
              לפי בקשתך, המושבים והאזורים הבאים מוגדרים במערכת כחלק אינטגרלי מבית שמש. אם מופיעה נסיעה ביניהם לבין בית שמש (או בתוכם), המערכת תזהה אותה הן כנסיעה פנימית והן כנסיעה יוצאת של בית שמש:
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { name: 'צרעה', desc: 'קיבוץ/מושב סמוך לבית שמש' },
                { name: 'הר טוב / הרטוב', desc: 'אזור תעשייה ומושב צמוד' },
                { name: 'עגור', desc: 'מושב בעמק האלה הסמוך' },
                { name: 'מחסיה', desc: 'מושב צמוד לדרום-מזרח בית שמש' },
                { name: 'ישעי', desc: 'מושב צמוד לצפון-מערב בית שמש' },
                { name: 'זכריה', desc: 'מושב סמוך בציר 38' },
                { name: 'לוזית', desc: 'מושב שפלת יהודה סמוך' },
                { name: 'בית ג׳מאל', desc: 'אזור מנזר/גבעה סמוכה לבית שמש' },
                { name: 'רמת לחי', desc: 'אזור תעשייה ועסקים מקומי' },
              ].map((village, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-[#090d14] border border-[#1b2636] flex flex-col justify-between"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                    <span className="font-bold text-white text-xs">{village.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">{village.desc}</span>
                  <div className="mt-2 pt-1 border-t border-[#131b26] flex items-center justify-between text-[9px] text-emerald-400 font-mono">
                    <span>משויך ל: בית שמש</span>
                    <span>פעיל ✓</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-[#1c293a] bg-[#121926] flex justify-between items-center">
          <span className="text-[11px] text-slate-400">
            הגדרות אלו נשמרות באופן מקומי בדפדפן ומסתנכרנות מול הבוט
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};
