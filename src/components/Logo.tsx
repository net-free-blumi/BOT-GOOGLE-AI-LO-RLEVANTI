import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  subtitle?: string;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showText = true,
  subtitle,
  className = '',
}) => {
  const iconDimensions = {
    sm: 'w-8 h-8 text-base',
    md: 'w-10 h-10 text-xl',
    lg: 'w-14 h-14 text-3xl',
  }[size];

  const titleSizes = {
    sm: 'text-sm',
    md: 'text-base sm:text-lg',
    lg: 'text-xl sm:text-2xl',
  }[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Visual Emblem */}
      <div className="relative shrink-0">
        <div
          className={`${iconDimensions} rounded-2xl bg-gradient-to-br from-amber-400/25 via-[#131c28] to-emerald-500/20 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/10 relative overflow-hidden group`}
        >
          {/* Subtle Ambient Pulse Light */}
          <div className="absolute -top-4 -right-4 w-8 h-8 bg-amber-400/30 rounded-full blur-md" />
          <div className="absolute -bottom-4 -left-4 w-8 h-8 bg-emerald-400/20 rounded-full blur-md" />

          {/* Taxi Vector Icon */}
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-3/5 h-3/5 text-amber-400 relative z-10 drop-shadow-[0_2px_4px_rgba(245,158,11,0.4)]"
          >
            {/* Top Taxi Sign */}
            <path
              d="M13 5H19V8H13V5Z"
              fill="#F59E0B"
              className="drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]"
            />
            {/* Cab Body */}
            <path
              d="M7 11C7 9.89543 7.89543 9 9 9H23C24.1046 9 25 9.89543 25 11L27 18H5L7 11Z"
              fill="currentColor"
            />
            <path
              d="M4 18H28C29.1046 18 30 18.8954 30 20V24C30 24.5523 29.5523 25 29 25H27V27C27 27.5523 26.5523 28 26 28H24C23.4477 28 23 27.5523 23 27V25H9V27C9 27.5523 8.55228 28 8 28H6C5.44772 28 5 27.5523 5 27V25H3C2.44772 25 2 24.5523 2 24V20C2 18.8954 2.89543 18 4 18Z"
              fill="#D97706"
            />
            {/* Windshield */}
            <path
              d="M9 11L7.5 17H24.5L23 11H9Z"
              fill="#0F172A"
              fillOpacity="0.85"
            />
            {/* Headlights */}
            <circle cx="6.5" cy="21.5" r="1.5" fill="#FEF08A" />
            <circle cx="25.5" cy="21.5" r="1.5" fill="#FEF08A" />
            {/* Taxi Checker Line */}
            <rect x="11" y="19" width="3" height="1.5" fill="#FFFFFF" fillOpacity="0.8" />
            <rect x="15" y="19" width="3" height="1.5" fill="#0F172A" fillOpacity="0.8" />
            <rect x="19" y="19" width="3" height="1.5" fill="#FFFFFF" fillOpacity="0.8" />
          </svg>

          {/* Signal Indicator Dot */}
          <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
        </div>
      </div>

      {/* Typography Branding */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`${titleSizes} font-black tracking-tight text-white flex items-center gap-1.5`}>
              מרכז שליטה
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                נסיעות בוט
              </span>
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {subtitle || 'מערכת ניהול וסינון נסיעות חכמה · חיבור רב-נהגים'}
          </p>
        </div>
      )}
    </div>
  );
};
