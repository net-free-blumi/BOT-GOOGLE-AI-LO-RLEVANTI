import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  Copy, 
  Check, 
  ExternalLink, 
  Server, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface NetlifyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl?: string;
}

export const NetlifyGuideModal: React.FC<NetlifyGuideModalProps> = ({
  isOpen,
  onClose,
  serverUrl = '',
}) => {
  const [copiedRedirects, setCopiedRedirects] = useState(false);
  const [copiedToml, setCopiedToml] = useState(false);
  const [copiedStaticExpress, setCopiedStaticExpress] = useState(false);

  if (!isOpen) return null;

  const resolvedIp = serverUrl.replace(/\/+$/, '') || 'http://YOUR_SERVER_IP:3000';

  const redirectsContent = `/api/*  ${resolvedIp}/api/:splat  200!
/*      /index.html                     200`;

  const tomlContent = `[build]
  publish = "dist"
  command = "npm run build"

[[redirects]]
  from = "/api/*"
  to = "${resolvedIp}/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200`;

  const expressStaticContent = `// הוסף ב-dashboard-api.js כדי שהשרת יגיש גם את האתר ישירות:
import path from "node:path";
app.use(express.static(path.join(process.cwd(), "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "dist", "index.html"));
});`;

  const copy = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-[#0e141e] border border-[#233348] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1c293a] bg-[#121926]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">מדריך העלאה ל-Netlify וסנכרון שרת מלא</h2>
              <p className="text-xs text-slate-400">איך להעלות את לוח הבקרה לנטליפיי כך שיתקשר בצורה חלקה עם הבוט</p>
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
        <div className="p-6 space-y-6 overflow-y-auto text-xs leading-relaxed">
          {/* Explanation Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-teal-950/40 to-[#101725] border border-teal-500/30 space-y-2">
            <div className="flex items-center gap-2 font-bold text-teal-300">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              למה האתר לא היה מסונכרן קודם בנטליפיי?
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              האתר המקורי פנה לכתובת <code className="text-amber-300 font-mono">/api</code> באותו הדומיין.
              כאשר מעלים אתר ל-Netlify, נטליפיי מארחת רק קבצים סטטיים (HTML/React), בעוד הבוט שלך רץ ב-VPS נפרד על פורט 3000.
              בנוסף, אם נטליפיי רץ ב-HTTPS והשרת ב-HTTP, הדפדפן חוסם זאת (Mixed Content).
              <br />
              <b>הפתרון המנצח:</b> מגדירים ב-Netlify חוק העברה (Proxy) שמעביר כל פנייה ל-
              <code className="text-teal-300 font-mono">/api/*</code> ישירות ל-IP של השרת שלך ברקע!
            </p>
          </div>

          {/* Option 1: Netlify Proxy */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center">1</span>
                קובץ netlify.toml (מומלץ ביותר)
              </h3>
              <button
                onClick={() => copy(tomlContent, setCopiedToml)}
                className="px-3 py-1.5 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-500/30 text-amber-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {copiedToml ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedToml ? 'הועתק!' : 'העתק קוד'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              שים קובץ בשם <code className="text-amber-300 font-mono">netlify.toml</code> בתיקיית השורש של הפרויקט.
              הוא דואג לבנייה ולהעברת הבקשות לשרת הבוט:
            </p>
            <div className="relative rounded-xl bg-[#070a0f] border border-[#1d2737] p-3 text-[11px] font-mono text-slate-300 overflow-x-auto" dir="ltr">
              <pre>{tomlContent}</pre>
            </div>
          </div>

          {/* Option 2: public/_redirects */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-400 text-slate-950 font-black text-xs flex items-center justify-center">2</span>
                קובץ public/_redirects
              </h3>
              <button
                onClick={() => copy(redirectsContent, setCopiedRedirects)}
                className="px-3 py-1.5 rounded-lg bg-teal-400/15 hover:bg-teal-400/25 border border-teal-500/30 text-teal-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {copiedRedirects ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedRedirects ? 'הועתק!' : 'העתק קוד'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              קובץ זה כבר יצרנו עבורך בתיקיית <code className="text-teal-300 font-mono">public/_redirects</code>!
              כל מה שצריך הוא לוודא שה-IP של השרת שלך מעודכן בו.
            </p>
            <div className="relative rounded-xl bg-[#070a0f] border border-[#1d2737] p-3 text-[11px] font-mono text-slate-300 overflow-x-auto" dir="ltr">
              <pre>{redirectsContent}</pre>
            </div>
          </div>

          {/* Option 3: Direct Express Serving */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-400 text-slate-950 font-black text-xs flex items-center justify-center">3</span>
                אופציה חלופית: הרצת האתר ישירות מהבוט
              </h3>
              <button
                onClick={() => copy(expressStaticContent, setCopiedStaticExpress)}
                className="px-3 py-1.5 rounded-lg bg-purple-400/15 hover:bg-purple-400/25 border border-purple-500/30 text-purple-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {copiedStaticExpress ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedStaticExpress ? 'הועתק!' : 'העתק קוד'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              אם לא רוצים כלל להעלות ל-Netlify, אפשר להריץ <code className="text-purple-300 font-mono">npm run build</code>,
              ולשים את תיקיית <code className="text-purple-300 font-mono">dist</code> לצד הבוט בשרת.
            </p>
            <div className="relative rounded-xl bg-[#070a0f] border border-[#1d2737] p-3 text-[11px] font-mono text-slate-300 overflow-x-auto" dir="ltr">
              <pre>{expressStaticContent}</pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1c293a] bg-[#121926] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 transition-colors cursor-pointer"
          >
            הבנתי, תודה!
          </button>
        </div>
      </div>
    </div>
  );
};
