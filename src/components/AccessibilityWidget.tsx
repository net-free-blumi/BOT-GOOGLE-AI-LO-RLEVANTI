import React, { useState, useEffect } from 'react';
import { 
  X, 
  RotateCcw, 
  FileText, 
  Type, 
  SunMedium, 
  Palette, 
  Link2, 
  Eye, 
  Sliders, 
  Check,
  Sparkles
} from 'lucide-react';

interface AccessibilityState {
  fontSize: 'normal' | 'lg' | 'xl' | 'xxl';
  contrast: 'normal' | 'high' | 'monochrome' | 'inverted';
  readableFont: boolean;
  highlightLinks: boolean;
  stopAnimations: boolean;
}

const DEFAULT_A11Y_STATE: AccessibilityState = {
  fontSize: 'normal',
  contrast: 'normal',
  readableFont: false,
  highlightLinks: false,
  stopAnimations: false,
};

const STORAGE_KEY = 'a11y_preferences_rides_dash';

interface AccessibilityWidgetProps {
  onOpenAccessibilityStatement: () => void;
}

export const AccessibilityWidget: React.FC<AccessibilityWidgetProps> = ({
  onOpenAccessibilityStatement,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<AccessibilityState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_A11Y_STATE, ...JSON.parse(saved) };
    } catch {
      // fallback
    }
    return DEFAULT_A11Y_STATE;
  });

  // Apply state to <html> element
  useEffect(() => {
    const html = document.documentElement;

    // Font size
    html.classList.remove('a11y-font-lg', 'a11y-font-xl', 'a11y-font-xxl');
    if (state.fontSize === 'lg') html.classList.add('a11y-font-lg');
    if (state.fontSize === 'xl') html.classList.add('a11y-font-xl');
    if (state.fontSize === 'xxl') html.classList.add('a11y-font-xxl');

    // Contrast
    html.classList.remove('a11y-high-contrast', 'a11y-monochrome', 'a11y-inverted');
    if (state.contrast === 'high') html.classList.add('a11y-high-contrast');
    if (state.contrast === 'monochrome') html.classList.add('a11y-monochrome');
    if (state.contrast === 'inverted') html.classList.add('a11y-inverted');

    // Readable font
    if (state.readableFont) {
      html.classList.add('a11y-readable-font');
    } else {
      html.classList.remove('a11y-readable-font');
    }

    // Highlight links
    if (state.highlightLinks) {
      html.classList.add('a11y-highlight-links');
    } else {
      html.classList.remove('a11y-highlight-links');
    }

    // Stop animations
    if (state.stopAnimations) {
      html.classList.add('a11y-no-animations');
    } else {
      html.classList.remove('a11y-no-animations');
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  const handleReset = () => {
    setState(DEFAULT_A11Y_STATE);
  };

  const isAnyActive = 
    state.fontSize !== 'normal' ||
    state.contrast !== 'normal' ||
    state.readableFont ||
    state.highlightLinks ||
    state.stopAnimations;

  return (
    <>
      {/* Floating Accessibility Trigger Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="פתח תפריט נגישות"
        title="תפריט נגישות (תקן ת״י 5568 / WCAG 2.1)"
        className={`fixed bottom-4 right-4 z-40 w-12 h-12 rounded-2xl flex items-center justify-center shadow-2xl border transition-all cursor-pointer focus:outline-none focus:ring-4 focus:ring-amber-400 ${
          isOpen
            ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-400/50 scale-105'
            : isAnyActive
            ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
            : 'bg-[#101725] text-amber-400 hover:text-amber-300 border-[#223348] hover:border-amber-400/40 hover:bg-[#162132]'
        }`}
      >
        {/* Universal Accessibility Icon */}
        <span className="text-xl font-bold select-none leading-none">♿</span>
        {isAnyActive && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0c121a]" />
        )}
      </button>

      {/* Accessibility Dialog Modal */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-start p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          dir="rtl"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full sm:w-96 bg-[#0e1420] border border-[#23354a] rounded-3xl p-5 shadow-2xl relative space-y-5 text-white max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="תפריט נגישות"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1c293a]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/30 flex items-center justify-center text-lg">
                  ♿
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    תפריט נגישות
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                      ת"י 5568 AA
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    התאמת תצוגה לאנשים עם מוגבלויות
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-xl bg-[#162030] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="סגור תפריט נגישות"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Controls List */}
            <div className="space-y-4 text-xs">
              {/* 1. Font Size */}
              <div className="space-y-2">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-amber-400" />
                  גודל טקסט:
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'normal', label: 'רגיל' },
                    { id: 'lg', label: '110%' },
                    { id: 'xl', label: '125%' },
                    { id: 'xxl', label: '140%' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setState((s) => ({ ...s, fontSize: f.id as any }))}
                      className={`py-2 px-1 rounded-xl text-center font-bold transition-all cursor-pointer border ${
                        state.fontSize === f.id
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/20'
                          : 'bg-[#141d2c] text-slate-300 border-[#223348] hover:bg-[#1a2538]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Contrast */}
              <div className="space-y-2">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-amber-400" />
                  ניגודיות וצבעים:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setState((s) => ({ ...s, contrast: s.contrast === 'high' ? 'normal' : 'high' }))}
                    className={`p-2.5 rounded-xl border text-right font-medium transition-all cursor-pointer flex items-center justify-between ${
                      state.contrast === 'high'
                        ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                        : 'bg-[#141d2c] border-[#223348] text-slate-300 hover:bg-[#1a2538]'
                    }`}
                  >
                    <span>ניגודיות גבוהה</span>
                    {state.contrast === 'high' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </button>

                  <button
                    onClick={() => setState((s) => ({ ...s, contrast: s.contrast === 'monochrome' ? 'normal' : 'monochrome' }))}
                    className={`p-2.5 rounded-xl border text-right font-medium transition-all cursor-pointer flex items-center justify-between ${
                      state.contrast === 'monochrome'
                        ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                        : 'bg-[#141d2c] border-[#223348] text-slate-300 hover:bg-[#1a2538]'
                    }`}
                  >
                    <span>גווני אפור</span>
                    {state.contrast === 'monochrome' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </button>

                  <button
                    onClick={() => setState((s) => ({ ...s, contrast: s.contrast === 'inverted' ? 'normal' : 'inverted' }))}
                    className={`p-2.5 rounded-xl border text-right font-medium transition-all cursor-pointer flex items-center justify-between col-span-2 ${
                      state.contrast === 'inverted'
                        ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                        : 'bg-[#141d2c] border-[#223348] text-slate-300 hover:bg-[#1a2538]'
                    }`}
                  >
                    <span>היפוך צבעים (Invert)</span>
                    {state.contrast === 'inverted' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </button>
                </div>
              </div>

              {/* 3. Toggles */}
              <div className="space-y-2 pt-1 border-t border-[#1c293a]">
                {/* Readable Font */}
                <button
                  onClick={() => setState((s) => ({ ...s, readableFont: !s.readableFont }))}
                  className={`w-full p-2.5 rounded-xl border text-right font-medium transition-all cursor-pointer flex items-center justify-between ${
                    state.readableFont
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                      : 'bg-[#141d2c] border-[#223348] text-slate-300 hover:bg-[#1a2538]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Type className="w-3.5 h-3.5 text-slate-400" />
                    פונט קריא (Arial נקי)
                  </span>
                  {state.readableFont && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </button>

                {/* Highlight Links */}
                <button
                  onClick={() => setState((s) => ({ ...s, highlightLinks: !s.highlightLinks }))}
                  className={`w-full p-2.5 rounded-xl border text-right font-medium transition-all cursor-pointer flex items-center justify-between ${
                    state.highlightLinks
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                      : 'bg-[#141d2c] border-[#223348] text-slate-300 hover:bg-[#1a2538]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5 text-slate-400" />
                    הדגשת קישורים וכפתורים
                  </span>
                  {state.highlightLinks && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </button>

                {/* Stop Animations */}
                <button
                  onClick={() => setState((s) => ({ ...s, stopAnimations: !s.stopAnimations }))}
                  className={`w-full p-2.5 rounded-xl border text-right font-medium transition-all cursor-pointer flex items-center justify-between ${
                    state.stopAnimations
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                      : 'bg-[#141d2c] border-[#223348] text-slate-300 hover:bg-[#1a2538]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    עצירת תנועה והבהובים
                  </span>
                  {state.stopAnimations && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </button>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="pt-3 border-t border-[#1c293a] flex flex-col gap-2">
              <button
                onClick={handleReset}
                disabled={!isAnyActive}
                className="w-full py-2.5 rounded-xl bg-[#141d2c] hover:bg-[#1c283c] border border-[#23354a] text-slate-300 hover:text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                איפוס כל התאמות הנגישות
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenAccessibilityStatement();
                }}
                className="w-full py-2.5 rounded-xl bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-amber-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                צפה בהצהרת הנגישות המלאה
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
