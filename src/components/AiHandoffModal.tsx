import React, { useState } from 'react';
import { 
  X, 
  Bot, 
  Copy, 
  Check, 
  FileText, 
  ExternalLink,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

interface AiHandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiHandoffModal: React.FC<AiHandoffModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handoffMarkdown = `# סיכום עדכון מערכת ואתר ניהול (להעברה לקלוד / Gemini)
תאריך: 2026-10-20
שרת: 82.70.210.206 (פורט 3000)

## 1. מה בוצע באתר הניהול (Frontend & Netlify):
- **מעבר לפרויקט React + Vite + Tailwind RTL מודרני:** האתר נבנה מחדש מאפס עבור Netlify.
- **פתרון בעיית סנכרון השרת ו-Mixed Content בנטליפיי:**
  - הוגדר קובץ \`_redirects\` וקובץ \`netlify.toml\` שמבצעים Reverse Proxy מ-\`/api/*\` אל \`http://82.70.210.206:3000/api/:splat\` עם קוד 200!.
  - זה מאפשר לאתר ב-Netlify לתקשר בצורה חלקה ומאובטחת ללא חסימת דפדפן (CORS/Mixed Content).
- **תמיכה מלאה בכל קיצורי ההקלדה של הנהג:**
  - \`שמש צמצם\` / \`ים צמצם\` – חיפוש צמצום (הן נסיעות פנימיות והן נסיעות יוצאות).
  - \`פ ים שמש\` – תרגום אוטומטי ל-\`פנוי ירושלים לבית שמש\`.
  - \`פ ים\` – תרגום אוטומטי ל-\`פנוי ירושלים\`.
  - \`פ פנימי שמש\` – תרגום אוטומטי ל-\`פנוי פ שמש\`.
- **מנהל קיצורי ערים וכינויים (City Aliases):**
  - תמיכה מלאה בהוספת כינויים חדשים (ב"ב = בני ברק, מו"ע = מודיעין עילית, פ"ת = פתח תקווה, ת"א = תל אביב) ישירות מהאתר.
- **מסנן ומנקה ספאם וחפירות (Spam Trimmer):**
  - מודול ייעודי לחיתוך הודעות אחרי קו מפריד (━━━━━━━━━━━━━━) והסרת פרסומות דרייבוט / טלגרם אדום / קישורי שיווק.
- **מצב חיסכון / שינה (Eco Standby Mode):**
  - כאשר החיפוש נעצר (תפוס), האתר עובר למצב המתנה חסכוני ומוריד עומס מהשרת.
- **שליטה בתהליך ובוואטסאפ:**
  - כפתור עצירה מוחלטת (תפוס), הפעלה מחדש (PM2 restart), עצירת תהליך (PM2 stop), ותצוגת Pairing Code עם כפתור העתקה.

---

## 2. קוד מומלץ להוספה ב-index.js בשרת (לניקוי ספאם לפני שליחה):
\`\`\`javascript
// חיתוך וניקוי ספאם וקישורים מיותרים מהודעות בוטים
function cleanSpamFromRide(text) {
  let s = String(text || "");
  const sep = s.indexOf("━━━━━━━━━━━━━━");
  if (sep !== -1) s = s.slice(0, sep).trim();
  s = s.replace(/⚠️\\s*\\|\\s*חשוב:[\\s\\S]*$/g, "");
  s = s.replace(/🔴\\s*\\|[\\s\\S]*?(?=\\n\\n|$)/g, "");
  s = s.replace(/https?:\\/\\/[^\\s]*drivebot\\.co\\.il[^\\s]*/gi, "");
  return s.trim();
}

// בקוד שליחת ההודעה לנהג:
const cleanedAlert = cleanSpamFromRide(text);
await sock.sendMessage(driverJid, { text: cleanedAlert }, { quoted: m });
\`\`\`

## 3. קבצי הגדרה ב-Netlify:
קובץ \`public/_redirects\`:
\`\`\`
/api/*  http://82.70.210.206:3000/api/:splat  200!
/*      /index.html                           200
\`\`\`
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(handoffMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="w-full max-w-3xl bg-[#0e141e] border border-[#233348] rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1c293a] bg-[#121926]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">סיכום מסודר להעברה לקלוד בוט / Gemini</h2>
              <p className="text-xs text-slate-400">
                העתק את כל המידע והקוד בלחיצה אחת כדי לעדכן את קלוד שבונה את השרת
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
        <div className="p-6 space-y-4 overflow-y-auto text-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              תצוגת הטקסט המלא שיועתק:
            </span>
            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'הועתק בהצלחה ללוח!' : 'העתק את כל הסיכום'}
            </button>
          </div>

          <div className="rounded-xl bg-[#070a0f] border border-[#1b2535] p-4 text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[460px] overflow-y-auto" dir="rtl">
            {handoffMarkdown}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1c293a] bg-[#121926] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 cursor-pointer"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};
