import React, { useState } from 'react';
import { 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  Sparkles, 
  SlidersHorizontal, 
  AlertCircle, 
  KeyRound
} from 'lucide-react';
import { ConnectionConfig } from '../types.ts';
import { Logo } from './Logo.tsx';
import { Footer } from './Footer.tsx';
import { LegalTab } from './LegalModal.tsx';

interface LoginScreenProps {
  onLogin: (password: string) => Promise<void>;
  onOpenConnectionModal: () => void;
  onEnterDemoMode: () => void;
  onOpenLegalTab: (tab: LegalTab) => void;
  config: ConnectionConfig;
  loading: boolean;
  error?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  onOpenConnectionModal,
  onEnterDemoMode,
  onOpenLegalTab,
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
    <div className="min-h-screen bg-[#07090d] text-[#e8eef7] flex flex-col justify-between relative overflow-hidden" dir="rtl">
      {/* Background ambient radial glows */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 -left-20 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top subtle bar with discrete technical settings toggle */}
      <header className="w-full max-w-7xl mx-auto px-4 py-3 flex items-center justify-between z-10">
        <Logo size="sm" showText={true} />

        <div className="flex items-center gap-2">
          {/* Subtle Settings Gear */}
          <button
            type="button"
            onClick={onOpenConnectionModal}
            title="הגדרות מתקדמות"
            className="p-2 rounded-xl bg-[#101725]/60 hover:bg-[#152033] border border-[#223348]/60 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer text-xs flex items-center gap-1.5"
            aria-label="הגדרות מתקדמות"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">הגדרות</span>
          </button>
        </div>
      </header>

      {/* Center Login Box */}
      <main className="flex-1 flex items-center justify-center p-4 z-10 my-4">
        <div className="w-full max-w-md bg-[#0e141f]/95 backdrop-blur-xl border border-[#23354c] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center space-y-3">
            <Logo size="lg" showText={false} />
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                מרכז שליטה
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                בוט נסיעות WhatsApp · כניסה מאובטחת
              </p>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div 
              role="alert" 
              className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {/* Clean Login Form - No IP displayed */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5 text-right">
              <label 
                htmlFor="admin-password-input" 
                className="text-xs font-bold text-slate-300 flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                קוד / סיסמת כניסה:
              </label>
              <div className="relative">
                <input
                  id="admin-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  placeholder="הזן את סיסמת הבוט..."
                  className="w-full px-4 py-3 rounded-xl bg-[#090d14] border border-[#233348] text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all pl-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-4 focus:ring-amber-400/40"
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
              className="w-full py-2.5 rounded-xl bg-purple-950/30 hover:bg-purple-950/50 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer focus:ring-2 focus:ring-purple-400"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              צפה בתצוגת דמו (סימולטור פעיל לבדיקת האתר)
            </button>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed text-center">
            גישה מורשית בלבד לנהגים וסדרנים מורשים
          </p>
        </div>
      </main>

      {/* Footer */}
      <Footer onOpenLegalTab={onOpenLegalTab} />
    </div>
  );
};
