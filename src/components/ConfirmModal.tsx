import React from 'react';
import { AlertTriangle, Trash2, RefreshCw, X, Check, ShieldAlert } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'אישור',
  cancelText = 'ביטול',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150" dir="rtl">
      <div className="w-full max-w-md bg-[#0e141e] border border-[#233348] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 flex items-start gap-3.5 border-b border-[#1c293a] bg-[#121926]">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isDanger
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                : isWarning
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : 'bg-teal-500/15 border-teal-500/30 text-teal-400'
            }`}
          >
            {isDanger ? (
              <Trash2 className="w-5 h-5" />
            ) : isWarning ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <ShieldAlert className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-sm sm:text-base font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{message}</p>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actions Footer */}
        <div className="p-3.5 sm:p-4 bg-[#0a0f17] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-[#141d29] hover:bg-[#1c2838] border border-[#233348] transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md disabled:opacity-50 ${
              isDanger
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : isWarning
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                : 'bg-teal-500 hover:bg-teal-600 text-white'
            }`}
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                מבצע...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                {confirmText}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
