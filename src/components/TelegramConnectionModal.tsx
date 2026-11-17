import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Smartphone, 
  Lock, 
  KeyRound, 
  LogOut, 
  RefreshCw, 
  Radio, 
  ExternalLink,
  ShieldCheck,
  Check,
  RotateCcw
} from 'lucide-react';
import { ApprovedUser } from '../types.ts';
import { 
  requestTelegramCodeApi, 
  verifyTelegramCodeApi, 
  disconnectTelegramApi, 
  getTelegramStatusApi 
} from '../services/api.ts';

interface TelegramConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedUsers: ApprovedUser[];
  initialPhone?: string;
  onRefreshUsers?: () => void;
}

export const TelegramConnectionModal: React.FC<TelegramConnectionModalProps> = ({
  isOpen,
  onClose,
  approvedUsers = [],
  initialPhone = '',
  onRefreshUsers,
}) => {
  const [selectedPhone, setSelectedPhone] = useState<string>(initialPhone || (approvedUsers[0]?.phone || ''));
  const [status, setStatus] = useState<{
    connected: boolean;
    username?: string;
    hasSavedSession?: boolean;
    pendingCode?: boolean;
  }>({ connected: false });
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  
  const [code, setCode] = useState('');
  const [password2FA, setPassword2FA] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync phone on open
  useEffect(() => {
    if (initialPhone) {
      setSelectedPhone(initialPhone);
    } else if (approvedUsers.length > 0 && !selectedPhone) {
      setSelectedPhone(approvedUsers[0].phone);
    }
  }, [initialPhone, approvedUsers]);

  // Check Telegram status for selected phone
  const checkStatus = async (phone: string) => {
    if (!phone) return;
    setCheckingStatus(true);
    try {
      const res = await getTelegramStatusApi(phone);
      if (res && res.ok) {
        setStatus({
          connected: Boolean(res.connected),
          username: res.username,
          hasSavedSession: res.hasSavedSession,
          pendingCode: res.pendingCode,
        });
      }
    } catch {
      // ignore
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen && selectedPhone) {
      checkStatus(selectedPhone);
      setCode('');
      setPassword2FA('');
      setShow2FA(false);
      setMessage(null);
      setError(null);
    }
  }, [isOpen, selectedPhone]);

  if (!isOpen) return null;

  const currentDriver = approvedUsers.find(
    (u) => u.phone === selectedPhone || u.phone.replace(/\D/g, '') === selectedPhone.replace(/\D/g, '')
  );

  const handleRequestCode = async () => {
    if (!selectedPhone) return;
    setRequestingCode(true);
    setError(null);
    setMessage(null);
    try {
      const res = await requestTelegramCodeApi(selectedPhone);
      if (res.ok) {
        setMessage(res.message || 'קוד אימות נשלח ישירות לאפליקציית טלגרם שלך 📲');
        setStatus((prev) => ({ ...prev, pendingCode: true }));
      } else {
        setError(res.error || 'שגיאה בשליחת קוד אימות');
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה בחיבור לשרת');
    } finally {
      setRequestingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!selectedPhone || !code.trim()) {
      setError('נא להזין קוד אימות');
      return;
    }
    setVerifyingCode(true);
    setError(null);
    setMessage(null);
    try {
      const res = await verifyTelegramCodeApi(selectedPhone, code.trim(), password2FA.trim() || undefined);
      if (res.ok) {
        if (res.need2FA) {
          setShow2FA(true);
          setError(res.message || 'נדרשת סיסמת אימות דו-שלבי (2FA) בטלגרם');
        } else {
          setMessage(res.message || 'חשבון הטלגרם חובר בהצלחה! 🎉');
          setStatus({
            connected: true,
            username: res.username,
            hasSavedSession: true,
            pendingCode: false,
          });
          setCode('');
          setPassword2FA('');
          setShow2FA(false);
          onRefreshUsers?.();
        }
      } else {
        if (res.need2FA) {
          setShow2FA(true);
        }
        setError(res.error || res.message || 'קוד אימות שגוי');
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה באימות קוד');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleDisconnect = async () => {
    if (!selectedPhone) return;
    setDisconnecting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await disconnectTelegramApi(selectedPhone);
      if (res.ok) {
        setMessage('חשבון הטלגרם נותק בהצלחה');
        setStatus({
          connected: false,
          username: undefined,
          hasSavedSession: false,
          pendingCode: false,
        });
        onRefreshUsers?.();
      } else {
        setError(res.error || 'שגיאה בניתוק טלגרם');
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה בחיבור לשרת');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-[#0f1724] border border-[#23354d] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1c2b3e] bg-[#121c2c]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Send className="w-5 h-5 -rotate-45" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                חיבור טלגרם לנהגים (סריקת קבוצות במקביל)
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Telegram MTProto
                </span>
              </h2>
              <p className="text-xs text-slate-400">חבר את חשבון הטלגרם של הנהג לסריקת קבוצות וערוצים במקביל לוואטסאפ</p>
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
          {/* Driver Selector */}
          <div>
            <label className="text-xs font-bold text-slate-300 mb-1.5 block">בחר נהג לחיבור או ניהול טלגרם:</label>
            <select
              value={selectedPhone}
              onChange={(e) => setSelectedPhone(e.target.value)}
              className="w-full bg-[#182333] border border-[#2b3e55] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {approvedUsers.map((u) => (
                <option key={u.phone} value={u.phone}>
                  {u.name || 'נהג'} ({u.phone}) {u.telegramConnected ? '✅ טלגרם מחובר' : '⚪ טלגרם לא מחובר'}
                </option>
              ))}
            </select>
          </div>

          {/* Current Status Card */}
          <div className={`p-4 rounded-xl border transition-all ${
            status.connected 
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
              : 'bg-slate-900/60 border-slate-700/50 text-slate-300'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3.5 h-3.5 rounded-full ${status.connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    סטטוס טלגרם: {status.connected ? 'מחובר וסורק קבוצות במקביל ✅' : 'מנותק כעת ⚪'}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {status.connected 
                      ? `שם משתמש: ${status.username || currentDriver?.telegramUsername || 'נהג'} | סורק את כל קבוצות וערוצי הטלגרם שלך`
                      : 'התחבר כדי לקבל נסיעות מקבוצות הטלגרם ישירות לוואטסאפ'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(status.connected || status.hasSavedSession || currentDriver?.telegramConnected) ? (
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="נתק את חשבון הטלגרם ומחק את קובץ הסשן מהשרת"
                  >
                    {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                    נתק טלגרם
                  </button>
                ) : (
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    title="אפס נתוני טלגרם למספר זה"
                  >
                    {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    אפס חיבור
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Alert / Feedback messages */}
          {message && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Connect Flow (if not connected) */}
          {!status.connected && (
            <div className="p-5 rounded-xl bg-[#141e2d] border border-[#26384e] space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-400" />
                חיבור מהיר באמצעות קוד אימות
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>מספר הטלפון לחיבור:</span>
                  <span className="font-mono text-amber-400 font-bold dir-ltr">{selectedPhone}</span>
                </div>

                {/* Step 1 Button */}
                <button
                  onClick={handleRequestCode}
                  disabled={requestingCode || checkingStatus}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/30 cursor-pointer"
                >
                  {requestingCode ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      שולח קוד אימות לטלגרם...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 -rotate-45" />
                      1. שלח קוד אימות לאפליקציית טלגרם
                    </>
                  )}
                </button>

                {/* Step 2: Code Input */}
                <div className="pt-2 border-t border-[#1e2f42] space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1 block">
                      2. הזן את הקוד שקיבלת באפליקציית טלגרם (5 ספרות):
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="למשל: 54321"
                        maxLength={6}
                        className="w-full bg-[#182333] border border-[#2b3e55] rounded-xl pr-9 pl-3 py-2 text-sm text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* 2FA Password input (optional or required) */}
                  {(show2FA || status.pendingCode) && (
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                        <span>סיסמת אימות דו-שלבי 2FA (אם מוגדרת):</span>
                        <span className="text-[10px] text-slate-500">רק למי שהגדיר סיסמה</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          value={password2FA}
                          onChange={(e) => setPassword2FA(e.target.value)}
                          placeholder="סיסמת הענן שלך בטלגרם"
                          className="w-full bg-[#182333] border border-[#2b3e55] rounded-xl pr-9 pl-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleVerifyCode}
                    disabled={verifyingCode || !code.trim()}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer"
                  >
                    {verifyingCode ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        מאמת קוד ומתחבר לטלגרם...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        3. אשר קוד והפעל סריקת טלגרם
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Guide / Instructions banner */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2.5">
            <h4 className="text-xs font-bold text-amber-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              איך זה עובד?
            </h4>
            <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
              <li>
                <strong>סריקה במקביל:</strong> הבוט סורק במקביל הן את קבוצות הוואטסאפ והן את קבוצות הטלגרם של הנהג.
              </li>
              <li>
                <strong>התראות לוואטסאפ:</strong> כל נסיעה שתעלה בטלגרם ותתאים לחיפוש שלך תישלח ישירות לוואטסאפ עם כותרת: <code className="text-blue-300">"🔹 נסיעה מטלגרם"</code>.
              </li>
              <li>
                <strong>תפיסה חכמה בטלגרם:</strong> מענה של <code className="text-amber-300">"ת"</code> או <code className="text-amber-300">"תן"</code> בוואטסאפ ילחץ אוטומטית על כפתורי הבקשה בטלגרם!
              </li>
              <li>
                <strong>ללא כפילויות בין הפלטפורמות:</strong> אם אותה נסיעה מופיעה גם בוואטסאפ וגם בטלגרם – תקבל את שתיהן בלי שפלטפורמה אחת תחסום את השנייה.
              </li>
              <li>
                <strong>חיבור ישירות מהוואטסאפ:</strong> הנהג יכול גם לשלוח לבוט בוואטסאפ <code className="text-emerald-300">"חבר טלגרם"</code> ולקבל את הקוד ישירות!
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1c2b3e] bg-[#121c2c] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => checkStatus(selectedPhone)}
              disabled={checkingStatus}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
              רענן סטטוס
            </button>

            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="ניתוק ואיפוס מוחלט של חשבון הטלגרם לנהג זה"
            >
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              נתק / אפס טלגרם לנהג זה
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white font-bold transition-colors cursor-pointer"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};
