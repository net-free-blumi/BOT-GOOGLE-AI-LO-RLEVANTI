import React from 'react';
import { Sliders, CheckCircle, HelpCircle, Layers, ShieldCheck, Database } from 'lucide-react';
import { BotSettings, BotStats } from '../types.ts';

interface SettingsCardProps {
  settings?: BotSettings;
  stats: BotStats;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({ settings = {}, stats }) => {
  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#121822] to-[#0c1118] border border-[#223044] p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">הגדרות סינון הבוט</h2>
            <p className="text-xs text-slate-400">חוקי ההתאמה וזיהוי הכפילויות המוגדרים כעת בשרת</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Dedupe Window */}
        <div className="p-3 rounded-xl bg-[#090e17] border border-[#1d2737] space-y-1">
          <span className="text-[11px] text-slate-400 font-medium">חלון מניעת כפילויות</span>
          <div className="text-base font-bold text-white font-mono flex items-center gap-1.5">
            {settings.dedupeMinutes !== undefined ? `${settings.dedupeMinutes} דקות` : '—'}
          </div>
          <span className="text-[10px] text-slate-500 block">חסימת הודעות חוזרות</span>
        </div>

        {/* Default City */}
        <div className="p-3 rounded-xl bg-[#090e17] border border-[#1d2737] space-y-1">
          <span className="text-[11px] text-slate-400 font-medium">עיר ברירת מחדל</span>
          <div className="text-base font-bold text-amber-300 truncate">
            {settings.defaultCity || 'בית שמש'}
          </div>
          <span className="text-[10px] text-slate-500 block">עבור פקודות פנימיות</span>
        </div>

        {/* Strict Direction */}
        <div className="p-3 rounded-xl bg-[#090e17] border border-[#1d2737] space-y-1">
          <span className="text-[11px] text-slate-400 font-medium">כיוון מחמיר (Strict)</span>
          <div className="text-base font-bold text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-4 h-4" />
            {settings.strictDirection ? 'מופעל' : 'כבוי'}
          </div>
          <span className="text-[10px] text-slate-500 block">אי התפשרות על כיוון</span>
        </div>

        {/* Debug Filter */}
        <div className="p-3 rounded-xl bg-[#090e17] border border-[#1d2737] space-y-1">
          <span className="text-[11px] text-slate-400 font-medium">דיבאג סינון (Debug)</span>
          <div className="text-base font-bold text-purple-300">
            {settings.debugFilter ? 'פעיל בלוגים' : 'כבוי'}
          </div>
          <span className="text-[10px] text-slate-500 block">פירוט סיבות דחייה</span>
        </div>

        {/* Groups In Memory */}
        <div className="p-3 rounded-xl bg-[#090e17] border border-[#1d2737] space-y-1">
          <span className="text-[11px] text-slate-400 font-medium">קבוצות וואטסאפ</span>
          <div className="text-base font-bold text-white font-mono flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-teal-400" />
            {stats.groups !== undefined ? stats.groups : '—'}
          </div>
          <span className="text-[10px] text-slate-500 block">נסרקות במקביל</span>
        </div>

        {/* Dedupe Cache Size */}
        <div className="p-3 rounded-xl bg-[#090e17] border border-[#1d2737] space-y-1">
          <span className="text-[11px] text-slate-400 font-medium">מפתחות כפילות</span>
          <div className="text-base font-bold text-white font-mono flex items-center gap-1.5">
            <Database className="w-4 h-4 text-blue-400" />
            {stats.dedupeSize !== undefined ? stats.dedupeSize : '—'}
          </div>
          <span className="text-[10px] text-slate-500 block">הודעות במטמון</span>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-[#090d14] border border-[#1b2635] text-[11px] text-slate-400 leading-relaxed">
        💡 <b>הערת מפתח:</b> עדכון רשימת רחובות, ערים נוספות ורמת הרגישות נעשה ישירות בקובץ{' '}
        <code className="text-amber-300 font-mono">cities.json</code> ו-
        <code className="text-teal-300 font-mono">matcher.js</code> בשרת.
      </div>
    </div>
  );
};
