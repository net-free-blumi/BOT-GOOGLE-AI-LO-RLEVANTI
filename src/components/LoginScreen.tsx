import React, { useState } from 'react';
import { 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  Server, 
  Sparkles, 
  SlidersHorizontal, 
  AlertCircle, 
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { ConnectionConfig } from '../types.ts';

interface LoginScreenProps {
  onLogin: (password: string) => Promise<void>;
  onOpenConnectionModal: () => void;
  onEnterDemoMode: () => void;
  config: ConnectionConfig;
  loading: boolean;
  error?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  onOpenConnectionModal,
  onEnterDemoMode,
  config,
  loading,
  error,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    await onLogin(password);
  };

  return (
    <div className="min-h-screen bg-[#07090d] text-[#e8eef7] flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      {/* Background radial glows */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#0e141f]/90 backdrop-blur-xl border border-[#233348] rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/25 via-[#18202d] to-teal-500/15 border border-amber-500/40 flex items-center justify-center text-3xl shadow-inner shadow-amber-500/20">
            🚕
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              מרכז שליטה
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              בוט נסיעות WhatsApp · ניטור ופעולות בזמן אמת
            </p>
          </div>
        </div>

        {/* Server Target Badge */}
        <div className="p-3 rounded-xl bg-[#090d15] border border-[#1e2a3a] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 truncate">
            <Server className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-400 text-[11px]">שרת יעד:</span>
            <span className="font-mono text-emerald-300 font-semibold text-[11px] truncate" dir="ltr">
              {config.baseUrl || '82.70.210.206:3000 (פרוקסי Netlify)'}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenConnectionModal}
            className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer shrink-0"
          >
            <SlidersHorizontal className="w-3 h-3" />
            הגדרות
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">
              סיסמת מנהל הבוט
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="הזן את הסיסמה מהשרת..."
                className="w-full px-4 py-3 rounded-xl bg-[#090d14] border border-[#233348] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors pl-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                כניסה למערכת
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Demo Mode Button */}
        <div className="pt-2 border-t border-[#1a2536] text-center">
          <button
            type="button"
            onClick={onEnterDemoMode}
            className="w-full py-2.5 rounded-xl bg-purple-950/30 hover:bg-purple-950/50 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            צפה בתצוגת דמו (סימולטור פעיל לבדיקת האתר)
          </button>
        </div>

        {/* Info text */}
        <p className="text-[11px] text-slate-500 leading-relaxed text-center">
          הסיסמה נשמרת בשרת הבוט בלבד. אם זו הפעלה ראשונה, הסיסמה מודפסת בלוג של PM2 או נמצאת בקובץ{' '}
          <code className="text-amber-400/90 font-mono">dashboard.secret</code>.
        </p>
      </div>
    </div>
  );
};
