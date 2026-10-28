import React from 'react';
import { ShieldCheck, Phone, Globe, Info, Scale, Lock, Heart } from 'lucide-react';
import { LegalTab } from './LegalModal.tsx';

interface FooterProps {
  onOpenLegalTab: (tab: LegalTab) => void;
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenLegalTab,
  className = '',
}) => {
  return (
    <footer className={`border-t border-[#1a2536] bg-[#070b12]/95 backdrop-blur-md text-[#94a3b8] py-6 px-4 select-none ${className}`} dir="rtl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
        {/* Creator & Credit Line (User's Exact Specification) */}
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 sm:gap-3 text-slate-300">
          <span className="font-extrabold text-white flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            קרדיט: מ בלומי
          </span>
          <span className="text-slate-600">|</span>
          <a
            href="tel:0515157166"
            className="hover:text-amber-300 font-mono font-semibold transition-colors flex items-center gap-1"
            title="חייג ל-מ בלומי"
            dir="ltr"
          >
            <Phone className="w-3 h-3 text-amber-400/80" />
            0515157166
          </a>
          <span className="text-slate-600">|</span>
          <a
            href="https://m-blumi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-400 hover:text-teal-300 font-mono font-semibold transition-colors flex items-center gap-1"
            title="פתח אתר m-blumi.com"
            dir="ltr"
          >
            <Globe className="w-3 h-3" />
            m-blumi.com
          </a>
        </div>

        {/* Legal & Compliance Links */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-[11px] font-medium">
          <button
            onClick={() => onOpenLegalTab('about')}
            className="hover:text-amber-300 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Info className="w-3 h-3 text-slate-400" />
            אודות המערכת
          </button>

          <span className="text-slate-700 hidden sm:inline">•</span>

          <button
            onClick={() => onOpenLegalTab('accessibility')}
            className="text-amber-300/90 hover:text-amber-200 transition-colors flex items-center gap-1 cursor-pointer font-bold"
            title="הצהרת נגישות לפי תקן ת״י 5568 ברמת AA"
          >
            <span className="text-xs">♿</span>
            הצהרת נגישות (ת"י 5568)
          </button>

          <span className="text-slate-700 hidden sm:inline">•</span>

          <button
            onClick={() => onOpenLegalTab('terms')}
            className="hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Scale className="w-3 h-3 text-slate-400" />
            תנאי שימוש והגבלת אחריות
          </button>

          <span className="text-slate-700 hidden sm:inline">•</span>

          <button
            onClick={() => onOpenLegalTab('privacy')}
            className="hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Lock className="w-3 h-3 text-slate-400" />
            מדיניות פרטיות
          </button>
        </div>

        {/* Copyright & Certified Safe Badge */}
        <div className="flex items-center gap-2 text-[10px] text-slate-500 text-center">
          <span>© {new Date().getFullYear()} כל הזכויות שמורות</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
            מערכת מאובטחת
          </span>
        </div>
      </div>
    </footer>
  );
};
