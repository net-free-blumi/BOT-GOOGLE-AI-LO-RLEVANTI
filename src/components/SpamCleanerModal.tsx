import React, { useState } from 'react';
import { 
  X, 
  Scissors, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Sparkles, 
  ShieldAlert, 
  CheckCircle2, 
  FileText,
  Code
} from 'lucide-react';
import { SpamTrimRule } from '../types.ts';
import { 
  DEFAULT_SPAM_RULES, 
  cleanRideMessage, 
  saveSpamRules 
} from '../services/spamCleaner.ts';

interface SpamCleanerModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: SpamTrimRule[];
  onSaveRules: (rules: SpamTrimRule[]) => void;
}

const SAMPLE_RAW_MESSAGE = `⚠️⚠️⚠️⚠️⚠️⚠️
ספר רעות 50
כיכר השבטים
זמן
ווצאפ ☚ wa.me/972552732722?text=ת+382953359+gipc2b
טלגרם ☚ t.me/prod_drivebot?start=t-382953359-gipc2b
לצירופים 0535977599
━━━━━━━━━━━━━━
⚠️ | חשוב: התחברו כבר עכשיו לפלטפורמות החדשות של דרייבוט!
הבוט בוואטסאפ ייסגר לחלוטין בימים הקרובים
🔴 | הטלגרם האדום
https://api.drivebot.co.il/api/apps/teledrivebot/latest
🔴 | הוואטסאפ האדום
drivebot.co.il
🔴 | קבוצת כל הנסיעות בטלגרם
https://t.me/+7HqnSHsvf5NiNTg0`;

export const SpamCleanerModal: React.FC<SpamCleanerModalProps> = ({
  isOpen,
  onClose,
  rules,
  onSaveRules,
}) => {
  const [activeRules, setActiveRules] = useState<SpamTrimRule[]>(rules);
  const [testText, setTestText] = useState(SAMPLE_RAW_MESSAGE);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    const updated = activeRules.map((r) =>
      r.id === id ? { ...r, enabled: !r.enabled } : r
    );
    setActiveRules(updated);
    onSaveRules(updated);
  };

  const handleDelete = (id: string) => {
    const updated = activeRules.filter((r) => r.id !== id);
    setActiveRules(updated);
    onSaveRules(updated);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRulePattern.trim()) return;
    const newRule: SpamTrimRule = {
      id: 'custom-' + Date.now(),
      name: newRuleName.trim() || newRulePattern.trim(),
      pattern: newRulePattern.trim(),
      enabled: true,
      isRegex: false,
    };
    const updated = [...activeRules, newRule];
    setActiveRules(updated);
    onSaveRules(updated);
    setNewRuleName('');
    setNewRulePattern('');
  };

  const handleReset = () => {
    setActiveRules(DEFAULT_SPAM_RULES);
    onSaveRules(DEFAULT_SPAM_RULES);
  };

  const cleanResult = cleanRideMessage(testText, activeRules);

  const serverCodeSnippet = `// פונקציה לניקוי ספאם וחפירות להוספה ב-index.js לפני שליחת ההודעה:
function cleanSpamFromRide(text) {
  let s = String(text || "");
  // חיתוך לאחר קו מפריד
  const sep = s.indexOf("━━━━━━━━━━━━━━");
  if (sep !== -1) s = s.slice(0, sep).trim();
  
  // הסרת הודעות דרייבוט וקישורי טלגרם אדום
  s = s.replace(/⚠️\\s*\\|\\s*חשוב:[\\s\\S]*$/g, "");
  s = s.replace(/🔴\\s*\\|[\\s\\S]*?(?=\\n\\n|$)/g, "");
  s = s.replace(/https?:\\/\\/[^\\s]*drivebot\\.co\\.il[^\\s]*/gi, "");
  return s.trim();
}

// בקוד שליחת ההודעה:
const cleanedAlert = cleanSpamFromRide(text);
await sock.sendMessage(driverJid, { text: cleanedAlert }, { quoted: m });`;

  const copySnippet = () => {
    navigator.clipboard.writeText(serverCodeSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="w-full max-w-3xl bg-[#0e141e] border border-[#233348] rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1c293a] bg-[#121926]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">מסנן ומנקה הודעות ספאם (חפירות וקישורים)</h2>
              <p className="text-xs text-slate-400">
                הסרה אוטומטית של קישורי דרייבוט, טלגרם אדום, חפירות וקווים מפרידים מיותרים
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs">
          {/* Side by Side Live Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                סימולטור השוואה: לפני ואחרי ניקוי
              </span>
              <button
                type="button"
                onClick={() => setTestText(SAMPLE_RAW_MESSAGE)}
                className="text-[11px] text-amber-400 hover:underline cursor-pointer"
              >
                טען דוגמת ספאם מהשטח
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Before */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-rose-300 font-medium">
                  <span>הודעה מקורית (עם ספאם):</span>
                  <span className="font-mono text-slate-500">{testText.length} תווים</span>
                </div>
                <textarea
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  rows={9}
                  className="w-full p-3 rounded-xl bg-[#080c13] border border-[#233348] text-slate-300 text-xs font-mono focus:outline-none focus:border-amber-400 resize-none leading-relaxed"
                />
              </div>

              {/* After */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-emerald-300 font-medium">
                  <span>הודעה נקייה שתשלח לנהג:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {cleanResult.cleaned.length} תווים (נחתכו {testText.length - cleanResult.cleaned.length})
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-950/15 border border-emerald-500/30 text-emerald-100 text-xs font-mono h-[180px] overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                  {cleanResult.cleaned || 'ההודעה ריקה'}
                </div>
              </div>
            </div>
          </div>

          {/* Active Rules List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">חוקי סינון מוגדרים:</span>
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] text-slate-400 hover:text-amber-400 cursor-pointer"
              >
                שחזר חוקי ברירת מחדל
              </button>
            </div>

            <div className="space-y-2">
              {activeRules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-3 rounded-xl bg-[#090e17] border border-[#1e2a3b] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => handleToggle(rule.id)}
                      className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-semibold text-slate-200">{rule.name}</div>
                      <code className="text-[10px] text-slate-500 font-mono block mt-0.5 truncate max-w-md" dir="ltr">
                        {rule.pattern}
                      </code>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(rule.id)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Add Custom Word/Phrase to Remove */}
          <form onSubmit={handleAdd} className="space-y-2">
            <span className="text-xs font-bold text-white">הוסף מילת ספאם או ביטוי להסרה:</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRulePattern}
                onChange={(e) => setNewRulePattern(e.target.value)}
                placeholder='למשל: "הצטרפו לקבוצה" או "קישור סודי"'
                required
                className="flex-1 px-3.5 py-2 rounded-xl bg-[#080c13] border border-[#233348] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                הוסף חוק
              </button>
            </div>
          </form>

          {/* Server Snippet for Claude/User */}
          <div className="p-4 rounded-xl bg-[#070a0f] border border-[#1b2535] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-teal-300 flex items-center gap-2">
                <Code className="w-4 h-4" />
                קוד מוכן להעתקה לשרת הבוט (ל-index.js):
              </div>
              <button
                type="button"
                onClick={copySnippet}
                className="px-2.5 py-1 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 text-xs font-semibold flex items-center gap-1 hover:bg-teal-500/25 cursor-pointer"
              >
                {copiedSnippet ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedSnippet ? 'הועתק!' : 'העתק קוד'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              העתק קוד זה ושלח לקלוד או הדבק ב-index.js כדי שהבוט יחתוך את הספאם עוד לפני השליחה לוואטסאפ:
            </p>
            <div className="relative rounded-lg bg-[#040609] p-3 text-[10px] font-mono text-slate-300 overflow-x-auto" dir="ltr">
              <pre>{serverCodeSnippet}</pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1c293a] bg-[#121926] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 cursor-pointer"
          >
            שמור וסגור
          </button>
        </div>
      </div>
    </div>
  );
};
