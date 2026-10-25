import React, { useState } from 'react';
import { 
  X, 
  Server, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Activity, 
  HelpCircle, 
  Globe, 
  ShieldCheck, 
  Sparkles,
  ExternalLink 
} from 'lucide-react';
import { ConnectionConfig } from '../types.ts';
import { checkServerPing, saveConfig } from '../services/api.ts';

interface ConnectionModalProps {
  config: ConnectionConfig;
  isOpen: boolean;
  onClose: () => void;
  onUpdateConfig: (cfg: ConnectionConfig) => void;
  onOpenNetlifyGuide: () => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  config,
  isOpen,
  onClose,
  onUpdateConfig,
  onOpenNetlifyGuide,
}) => {
  const [url, setUrl] = useState(config.baseUrl || '');
  const [demoMode, setDemoMode] = useState(config.useDemoMode);
  const [pollInterval, setPollInterval] = useState(config.pollIntervalMs);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    error?: string;
    isMixedContent?: boolean;
  } | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await checkServerPing(url.trim());
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = () => {
    const updated = saveConfig({
      baseUrl: url.trim(),
      useDemoMode: demoMode,
      pollIntervalMs: pollInterval,
    });
    onUpdateConfig(updated);
    onClose();
  };

  const isCurrentPageHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isInputHttp = url.trim().startsWith('http://');
  const showMixedContentWarning = isCurrentPageHttps && isInputHttp;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl bg-[#0e141e] border border-[#233348] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1c293a] bg-[#121926]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">הגדרות חיבור וסנכרון שרת</h2>
              <p className="text-xs text-slate-400">חבר את לוח הבקרה לתהליך הבוט שרץ על השרת שלך</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Demo Mode Toggle Banner */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-[#121a28] border border-purple-500/30">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-purple-200">מצב הדגמה (סימולטור פעיל)</h4>
                <p className="text-xs text-purple-300/80 leading-relaxed mt-0.5">
                  מאפשר לבחון ולשלוט בכל יכולות האתר עם נתוני אמת מדומים גם כשהשרת עדיין לא מחובר
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mr-3">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {/* Server URL Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-amber-400" />
                כתובת שרת הבוט (API URL)
              </label>
              <button
                type="button"
                onClick={() => setUrl('')}
                className="text-[11px] text-amber-400/90 hover:underline cursor-pointer"
              >
                איפוס לנתיב יחסי (/api)
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTestResult(null);
                }}
                placeholder="למשל: http://YOUR_VPS_IP:3000 או השאר ריק עבור נטליפיי"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#090d14] border border-[#233348] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400 font-mono transition-colors"
                dir="ltr"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <Activity className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                {testing ? 'בודק...' : 'בדיקת חיבור'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              • אם האתר מועלה ל-Netlify: השאר <b>ריק</b> (נתיב יחסי <code className="text-amber-300">/api</code>) והפעל פרוקסי ב-Netlify לקבלת חיבור מאובטח וללא בעיות CORS.
              <br />
              • אם ברצונך לפנות ישירות לשרת: הזן כתובת מלאה כגון <code className="text-amber-300">http://192.168.1.50:3000</code>.
            </p>
          </div>

          {/* Mixed Content Warning */}
          {showMixedContentWarning && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                שימו לב לחסימת Mixed Content בדפדפן!
              </div>
              <p className="text-amber-200/90 leading-relaxed text-[11px]">
                האתר הנוכחי נטען ב-HTTPS, אך הזנת כתובת שרת ב-HTTP (<code className="font-mono">http://</code>).
                דפדפנים מודרניים יחסמו בקשות כאלה אוטומטית. הפתרון הטוב ביותר להעלאה לנטליפיי הוא שימוש ב-
                <b>פרוקסי נטליפיי (Netlify Proxy)</b> שמעביר את הבקשות ישירות ל-IP של השרת שלך.
              </p>
              <button
                type="button"
                onClick={onOpenNetlifyGuide}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-white underline mt-1 cursor-pointer"
              >
                צפה במדריך הגדרת פרוקסי ב-Netlify
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Test Ping Result */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.ok
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div className="font-semibold">
                  {testResult.ok
                    ? `השרת מגיב מצוין! זמן תגובה: ${testResult.latencyMs}ms`
                    : 'החיפוש לשרת נכשל'}
                </div>
                {testResult.error && (
                  <p className="text-[11px] opacity-90">{testResult.error}</p>
                )}
              </div>
            </div>
          )}

          {/* Polling Interval */}
          <div className="space-y-1.5 pt-2 border-t border-[#1c293a]">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-300">
                קצב סנכרון חי (Polling Interval)
              </label>
              <span className="text-xs font-mono text-amber-400">
                {(pollInterval / 1000).toFixed(1)} שניות
              </span>
            </div>
            <input
              type="range"
              min="1000"
              max="10000"
              step="500"
              value={pollInterval}
              onChange={(e) => setPollInterval(Number(e.target.value))}
              className="w-full accent-amber-500 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>1 שניה (מהיר)</span>
              <span>2.5 שניות (מומלץ)</span>
              <span>10 שניות (חיסכון)</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[#1c293a] bg-[#121926]">
          <button
            type="button"
            onClick={onOpenNetlifyGuide}
            className="text-xs text-teal-300 hover:text-teal-200 flex items-center gap-1.5 cursor-pointer font-medium"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            איך מעלים ל-Netlify?
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-colors cursor-pointer shadow-lg shadow-amber-500/20"
            >
              שמור הגדרות
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
