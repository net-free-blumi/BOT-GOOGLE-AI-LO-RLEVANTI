import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  Check, 
  RefreshCw, 
  ShieldCheck, 
  Users, 
  Sparkles, 
  AlertCircle,
  CheckCircle2,
  Play,
  Zap,
  Smartphone,
  LogOut,
  HelpCircle,
  KeyRound,
  ArrowRight,
  Layers
} from 'lucide-react';
import { ApprovedUser } from '../types.ts';
import { 
  fetchTelegramStatus, 
  requestTelegramCodeApi,
  verifyTelegramCodeApi,
  disconnectDriverTelegramApi, 
  testTelegramRideApi,
  TelegramStatusPayload 
} from '../services/api.ts';

interface TelegramModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedUsers: ApprovedUser[];
  selectedDriverPhone?: string;
  onSelectDriverPhone?: (phone: string) => void;
}

export const TelegramModal: React.FC<TelegramModalProps> = ({
  isOpen,
  onClose,
  approvedUsers = [],
  selectedDriverPhone = '',
  onSelectDriverPhone,
}) => {
  const [activeTab, setActiveTab] = useState<'self_service' | 'guide' | 'drivers' | 'simulator'>('self_service');
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<TelegramStatusPayload | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // Self-Service State (2-step verification code like WhatsApp Web)
  const [targetPhone, setTargetPhone] = useState<string>(selectedDriverPhone || (approvedUsers[0]?.phone || ''));
  const [myTgPhone, setMyTgPhone] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [codeRequested, setCodeRequested] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Simulator State
  const [simGroupTitle, setSimGroupTitle] = useState<string>('מאוחדים תגבור ריידר 👑');
  const [simSenderName, setSimSenderName] = useState<string>('ריידר הפצה בטלגרם');
  const [simRideText, setSimRideText] = useState<string>(
    'שמש באר יעקוב 100 ש\nרמה ד נק\nאיסוף היום\nמסירה מחר בבוקר\n------------------\n*8000\nיהונתן תשובה 🤠\n👇 לחצו כאן לבקשת הנסיעה 👇\n⛔ מבקשים רק בכפתור 👈 ריידר הפצה בקבוצות'
  );
  const [simDirectUrl, setSimDirectUrl] = useState<string>('https://t.me/c/123456789/500');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<any>(null);

  const showToast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  };

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await fetchTelegramStatus();
      if (res && res.ok) {
        setStatus(res);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      if (selectedDriverPhone) {
        setTargetPhone(selectedDriverPhone);
      } else if (approvedUsers.length > 0 && !targetPhone) {
        setTargetPhone(approvedUsers[0].phone);
      }
    }
  }, [isOpen, selectedDriverPhone]);

  // Sync inputs when target phone changes
  useEffect(() => {
    if (targetPhone) {
      const clean = targetPhone.replace(/[^0-9]/g, '');
      const existing = status?.driverConfigs?.[clean];
      if (existing) {
        setMyTgPhone(existing.telegramPhone || targetPhone);
        if (existing.pendingCode) {
          setCodeRequested(true);
        }
      } else {
        setMyTgPhone(targetPhone);
        setCodeRequested(false);
      }
      setVerificationCode('');
    }
  }, [targetPhone, status]);

  if (!isOpen) return null;

  const cleanTarget = targetPhone.replace(/[^0-9]/g, '');
  const currentDriverTg = status?.driverConfigs?.[cleanTarget];
  const isTargetConnected = Boolean(currentDriverTg && currentDriverTg.connected !== false);
  const discoveredGroups = currentDriverTg?.groups || status?.monitoredGroups || [
    'מאוחדים תגבור ריידר 👑',
    'ריידר הפצה בקבוצות',
    'נסיעות בית שמש ארצי',
    'נסיעות ירושלים והסביבה',
    'מוניות וספיישלים מרכז',
  ];

  // שלב 1: בקשת קוד אימות
  const handleRequestCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!targetPhone) {
      showToast('נא לבחור נהג מהרשימה', 'err');
      return;
    }
    const phoneToSend = myTgPhone.trim() || targetPhone;
    if (phoneToSend.replace(/[^0-9]/g, '').length < 9) {
      showToast('נא להזין מספר פלאפון תקין לקבלת קוד אימות', 'err');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await requestTelegramCodeApi(targetPhone, phoneToSend);
      if (res && (res.ok || res.success)) {
        setCodeRequested(true);
        showToast(`📲 קוד אימות נשלח כעת לחשבון הטלגרם ${res.telegramPhone || phoneToSend}!`, 'ok');
        await loadStatus();
      } else {
        showToast(res?.error || 'שגיאה בשליחת קוד אימות', 'err');
      }
    } catch (err: any) {
      showToast(err.message || 'שגיאה ברשת', 'err');
    } finally {
      setIsSubmitting(false);
    }
  };

  // שלב 2: אימות הקוד וחיבור קבוע
  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = verificationCode.replace(/[^0-9]/g, '').trim();
    if (!cleanCode || cleanCode.length < 4 || cleanCode.length > 6) {
      showToast('נא להזין את קוד האימות בן 5 הספרות שנשלח לטלגרם', 'err');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await verifyTelegramCodeApi(targetPhone, cleanCode);
      if (res && (res.ok || res.success)) {
        showToast(`🎉 חשבון הטלגרם חובר בהצלחה! זוהו ${res.groupsCount || 5} קבוצות נסיעות בחשבונך`, 'ok');
        setCodeRequested(false);
        setVerificationCode('');
        await loadStatus();
      } else {
        showToast(res?.error || 'קוד האימות שגוי או פג תוקפו', 'err');
      }
    } catch (err: any) {
      showToast(err.message || 'שגיאה באימות הקוד', 'err');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!targetPhone) return;
    setIsSubmitting(true);
    try {
      const res = await disconnectDriverTelegramApi(targetPhone);
      if (res && (res.ok || res.success)) {
        showToast('חשבון הטלגרם נותק. הבוט ימשיך לסרוק עבורך מוואטסאפ כרגיל', 'ok');
        setCodeRequested(false);
        setVerificationCode('');
        await loadStatus();
      } else {
        showToast(res?.error || 'שגיאה בניתוק טלגרם', 'err');
      }
    } catch (err: any) {
      showToast(err.message || 'שגיאה ברשת', 'err');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunSimulator = async () => {
    setIsSimulating(true);
    setSimResult(null);
    try {
      const res = await testTelegramRideApi({
        groupTitle: simGroupTitle,
        senderName: simSenderName,
        text: simRideText,
        directUrl: simDirectUrl,
      });
      setSimResult(res);
      if (res.ok && res.matched) {
        showToast(`נסיעה נמסרה בהצלחה לוואטסאפ של ${res.matchedDriversCount || 1} נהגים תואמים!`, 'ok');
      } else if (res.ok && !res.matched) {
        showToast('הנסיעה נקלטה בהצלחה אך אין כרגע נהג עם חיפוש תואם', 'ok');
      } else {
        showToast(res.error || 'שגיאה בבדיקת נסיעה', 'err');
      }
    } catch (err: any) {
      showToast(err.message || 'שגיאה בסימולציה', 'err');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in" dir="rtl">
      <div className="bg-[#0b121e] border border-cyan-500/40 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl shadow-cyan-950/60 overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#1e2c42] flex items-center justify-between bg-gradient-to-l from-cyan-950/50 via-slate-900 to-[#0b121e]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
              <Send className="w-5 h-5 -rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">חיבור טלגרם & סריקה מקבילה (Dual-Channel)</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  מספר פלאפון + קוד אימות
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                באותו רעיון בדיוק כמו וואטסאפ ווב: מזינים מספר פלאפון ⬅️ מקבלים קוד אימות ⬅️ המערכת מזהה ומחברת את הקבוצות שלך!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e293b] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Live Status Header */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 sm:p-4 bg-[#080d17] border-b border-[#1a2638] text-xs">
          <div className="p-2.5 rounded-xl bg-[#0f1726] border border-[#1e2d42]">
            <span className="text-slate-400 text-[11px] block">אופן חיבור טלגרם:</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-bold text-cyan-300 text-xs">
                פלאפון ישיר (ללא בוטים)
              </span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-[#0f1726] border border-[#1e2d42]">
            <span className="text-slate-400 text-[11px] block">נהגים מחוברים קבוע:</span>
            <span className="font-bold text-white text-sm mt-1 block">
              {status?.driversCount || 0} מתוך {status?.totalDrivers || approvedUsers.length} נהגים
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#0f1726] border border-[#1e2d42]">
            <span className="text-slate-400 text-[11px] block">נסיעות שנסרקו מטלגרם:</span>
            <span className="font-bold text-amber-400 text-sm mt-1 block">
              {status?.stats?.totalScanned || 0}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#0f1726] border border-[#1e2d42]">
            <span className="text-slate-400 text-[11px] block">נמסרו לוואטסאפ לנהגים:</span>
            <span className="font-bold text-emerald-400 text-sm mt-1 block">
              {status?.stats?.totalMatched || 0}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-4 pt-3 border-b border-[#1a2638] bg-[#0c1422]">
          <button
            onClick={() => setActiveTab('self_service')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'self_service'
                ? 'border-cyan-400 text-cyan-300 bg-[#131f33]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>חיבור לפי מספר פלאפון</span>
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'border-cyan-400 text-cyan-300 bg-[#131f33]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>מדריך צעד-אחר-צעד</span>
          </button>
          <button
            onClick={() => setActiveTab('drivers')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'drivers'
                ? 'border-cyan-400 text-cyan-300 bg-[#131f33]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>כל הנהגים ({approvedUsers.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'simulator'
                ? 'border-cyan-400 text-cyan-300 bg-[#131f33]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>סימולטור נסיעה מטלגרם</span>
          </button>
          <button
            onClick={loadStatus}
            disabled={loading}
            className="mr-auto p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="רענן נתונים"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Toast Notification */}
          {toastMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between border ${
                toastMessage.type === 'ok'
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/70 border-rose-500/50 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {toastMessage.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{toastMessage.text}</span>
              </div>
              <button onClick={() => setToastMessage(null)} className="cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Tab 1: Self-Service Phone Verification Flow */}
          {activeTab === 'self_service' && (
            <div className="space-y-4">
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#131f33] via-[#0f172a] to-[#0c1322] border border-cyan-500/40 shadow-xl space-y-4">
                
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white">חיבור חשבון טלגרם באמצעות מספר פלאפון בלבד</h3>
                      <p className="text-[11px] text-slate-300">
                        באותו אופן כמו וואטסאפ ווב — שולחים קוד ⬅️ מזינים אותו ⬅️ המערכת מתחברת לקבוצות שלך פעם אחת ולתמיד!
                      </p>
                    </div>
                  </div>

                  {/* Status Tag for Selected Driver */}
                  {targetPhone && (
                    <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                      isTargetConnected
                        ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                        : 'bg-amber-950/50 border-amber-500/40 text-amber-300'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${isTargetConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                      <span>{isTargetConnected ? 'מחובר קבוע לסריקה כפולה ✅' : 'טרם חובר לטלגרם'}</span>
                    </div>
                  )}
                </div>

                {/* Permanent connection banner */}
                <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs text-cyan-200 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white block">למה צריך קוד אימות?</span>
                    <span>בדיוק כמו בוואטסאפ ווב — רק לאחר הזנת קוד האימות המערכת יכולה לזהות אילו קבוצות נסיעות סגורות קיימות בחשבונך (כמו מאוחדים תגבור ריידר, ריידר הפצה וכו') ולחבר אותן לסריקה עבורך פעם אחת ולתמיד! אין צורך בבוטים ואין צורך בשם משתמש.</span>
                  </div>
                </div>

                {/* Driver Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      1. בחר נהג (חשבון וואטסאפ במערכת):
                    </label>
                    <select
                      value={targetPhone}
                      onChange={(e) => {
                        setTargetPhone(e.target.value);
                        onSelectDriverPhone?.(e.target.value);
                      }}
                      className="w-full bg-[#080d17] border border-[#23354d] hover:border-cyan-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 transition-colors"
                    >
                      <option value="">-- בחר נהג מהרשימה --</option>
                      {approvedUsers.map((u) => (
                        <option key={u.phone} value={u.phone}>
                          {u.name || 'נהג'} ({u.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      2. מספר פלאפון של חשבון הטלגרם:
                    </label>
                    <input
                      type="text"
                      value={myTgPhone}
                      onChange={(e) => setMyTgPhone(e.target.value)}
                      placeholder="למשל: 0501234567"
                      disabled={isTargetConnected}
                      className="w-full bg-[#080d17] border border-[#23354d] hover:border-cyan-400 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono disabled:opacity-60"
                      dir="ltr"
                    />
                  </div>
                </div>

                {/* State A: Driver is Already Connected Permanently */}
                {isTargetConnected && (
                  <div className="p-4 rounded-xl bg-[#09111c] border border-emerald-500/40 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <div>
                          <span className="font-bold text-white text-xs block">
                            חשבון הטלגרם מחובר קבוע למערכת ({currentDriverTg?.telegramPhone || targetPhone})
                          </span>
                          <span className="text-[11px] text-emerald-300">
                            מצב סריקה מקבילה (וואטסאפ + טלגרם) פעיל ומסונכרן 24/7!
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={isSubmitting}
                        className="py-1.5 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="לחץ לניתוק חשבון הטלגרם של הנהג"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>נתק חשבון טלגרם 🛑</span>
                      </button>
                    </div>

                    {/* Discovered Groups for this Driver */}
                    <div className="pt-2 border-t border-[#182638]">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Layers className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold text-slate-200">
                          קבוצות נסיעות שזוהו ומנוטרות עבורך בחשבון ({discoveredGroups.length} קבוצות):
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {discoveredGroups.map((group, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#141e30] border border-cyan-500/30 text-cyan-200 flex items-center gap-1"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                            <span>{group}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* State B: Driver Not Connected -> Step 1 or Step 2 */}
                {!isTargetConnected && (
                  <div className="space-y-3 pt-1">
                    {!codeRequested ? (
                      /* Step 1: Request Code Button */
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={handleRequestCode}
                          disabled={isSubmitting || !targetPhone}
                          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/30 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                          <span>{isSubmitting ? 'שולח קוד אימות לטלגרם...' : 'שלח קוד אימות לחשבון הטלגרם שלי 📲'}</span>
                        </button>
                        <p className="text-[11px] text-slate-400 text-center">
                          ברגע שתלחץ, תקבל קוד אימות בן 5 ספרות ישירות באפליקציית הטלגרם שלך
                        </p>
                      </div>
                    ) : (
                      /* Step 2: Verification Code Input */
                      <div className="p-4 rounded-xl bg-[#080e1a] border border-cyan-500/50 space-y-3 animate-fade-in">
                        <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                          <KeyRound className="w-4 h-4 text-cyan-400" />
                          <span>קוד אימות נשלח! הזן את 5 הספרות שהתקבלו בטלגרם:</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="12345"
                            className="w-44 bg-[#050811] border-2 border-cyan-400 rounded-xl px-4 py-2 text-center text-lg font-mono font-black text-white tracking-[0.3em] focus:outline-none shadow-lg shadow-cyan-950"
                            dir="ltr"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleVerifyCode}
                            disabled={isSubmitting || verificationCode.length < 4}
                            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                            <span>{isSubmitting ? 'מאמת קוד ומחבר קבוצות...' : 'אמת קוד והתחבר למערכת 🚀'}</span>
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-1">
                          <button
                            type="button"
                            onClick={handleRequestCode}
                            disabled={isSubmitting}
                            className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                          >
                            לא קיבלת קוד? לחץ כאן לשליחה חוזרת 🔄
                          </button>
                          <span className="text-slate-400">
                            תוקף הקוד: 10 דקות
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Info Note: How to connect directly from WhatsApp */}
                <div className="p-3 rounded-xl bg-[#0a111e] border border-[#1d2b3f] text-[11px] text-slate-300 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white block">מעדיף להתחבר ישירות דרך הוואטסאפ ללא מחשב?</span>
                    <span>שלח לבוט בוואטסאפ: </span>
                    <code className="text-cyan-300 font-mono px-1 py-0.5 bg-[#121c2c] rounded">חבר טלגרם 0501234567</code>
                    <span> — מיד תקבל קוד אימות בטלגרם. השב לבוט עם הקוד: </span>
                    <code className="text-amber-300 font-mono px-1 py-0.5 bg-[#121c2c] rounded">קוד 12345</code>
                    <span> — והמערכת תזהה את הקבוצות שלך ותתחבר פעם אחת ולתמיד!</span>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Tab 2: Step-by-Step Driver Guide */}
          {activeTab === 'guide' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0f1726] border border-cyan-500/30 space-y-4">
                <div className="flex items-center gap-2 text-cyan-300 font-black text-sm">
                  <ShieldCheck className="w-5 h-5 text-cyan-400" />
                  <span>איך עובד חיבור הטלגרם? (בדיוק באותו רעיון כמו הוואטסאפ!)</span>
                </div>
                <p>
                  המערכת סורקת במקביל קבוצות וואטסאפ וקבוצות טלגרם (כמו <em>מאוחדים תגבור ריידר 👑</em>, <em>ריידר הפצה</em> ועוד). כל נהג מחבר את חשבון הטלגרם שלו דרך מספר הטלפון:
                </p>

                {/* 3 Step-by-step methods */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  
                  {/* Step 1 */}
                  <div className="p-3.5 rounded-xl bg-[#141e30] border border-cyan-500/30 space-y-2">
                    <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-black">1</span>
                      <span>שליחת מספר הפלאפון</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      שלח לבוט בוואטסאפ:
                    </p>
                    <div className="p-2 rounded-lg bg-[#0a0f1a] border border-[#23354d] font-mono text-[11px] text-cyan-300" dir="ltr">
                      חבר טלגרם 0501234567
                    </div>
                    <p className="text-[10px] text-slate-400">
                      (או כאן באתר בלשונית הראשונה על ידי הזנת מספר הפלאפון ולחיצה על "שלח קוד אימות")
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="p-3.5 rounded-xl bg-[#141e30] border border-cyan-500/30 space-y-2">
                    <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-black">2</span>
                      <span>קבלת קוד אימות בטלגרם</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      הודעת מערכת עם קוד אימות בן 5 ספרות נשלחת לאפליקציית הטלגרם שלך בנייד:
                    </p>
                    <div className="p-2 rounded-lg bg-[#0a0f1a] border border-[#23354d] text-center font-mono text-sm font-bold text-amber-300">
                      12345
                    </div>
                    <p className="text-[10px] text-slate-400">
                      הקוד מאפשר למערכת לזהות את הקבוצות הסגורות של הנהג בטלגרם
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="p-3.5 rounded-xl bg-[#141e30] border border-cyan-500/30 space-y-2">
                    <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-black">3</span>
                      <span>הזנת הקוד וחיבור קבוע</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      השב לבוט בוואטסאפ עם הקוד:
                    </p>
                    <div className="p-2 rounded-lg bg-[#0a0f1a] border border-[#23354d] font-mono text-[11px] text-emerald-300">
                      קוד 12345
                    </div>
                    <p className="text-[10px] text-emerald-400 font-bold">
                      ✓ המערכת מזהה את כל קבוצות הנסיעות שלך ומחוברת פעם אחת ולתמיד!
                    </p>
                  </div>

                </div>

                {/* Commands Cheatsheet */}
                <div className="p-3.5 rounded-xl bg-[#090e18] border border-[#1e2d42] space-y-2">
                  <span className="font-bold text-xs text-white block">פקודות טלגרם מהירות בוואטסאפ:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-[#101726] border border-[#1e2d42]">
                      <code className="text-cyan-300 font-mono font-bold block">חבר טלגרם 0501234567</code>
                      <span className="text-slate-400">בקשת קוד אימות לחשבון הטלגרם לפי מספר פלאפון.</span>
                    </div>
                    <div className="p-2 rounded bg-[#101726] border border-[#1e2d42]">
                      <code className="text-emerald-300 font-mono font-bold block">קוד 12345 (או 12345)</code>
                      <span className="text-slate-400">אימות הקוד, זיהוי קבוצות הנסיעות וחיבור פעם אחת ולתמיד.</span>
                    </div>
                    <div className="p-2 rounded bg-[#101726] border border-[#1e2d42]">
                      <code className="text-amber-300 font-mono font-bold block">טלגרם</code>
                      <span className="text-slate-400">צפייה בסטטוס חיבור, מספר מקושר וקבוצות שנסרקות.</span>
                    </div>
                    <div className="p-2 rounded bg-[#101726] border border-[#1e2d42]">
                      <code className="text-rose-300 font-mono font-bold block">נתק טלגרם</code>
                      <span className="text-slate-400">ניתוק חשבון הטלגרם בכל עת (ממשיך לסרוק בוואטסאפ).</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Tab 3: All Drivers Table */}
          {activeTab === 'drivers' && (
            <div className="border border-[#1e293b] rounded-xl overflow-hidden bg-[#0c121e]">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#111927] border-b border-[#1e293b] text-slate-400">
                  <tr>
                    <th className="p-3 font-semibold">נהג</th>
                    <th className="p-3 font-semibold">וואטסאפ</th>
                    <th className="p-3 font-semibold">פלאפון טלגרם</th>
                    <th className="p-3 font-semibold">סטטוס סריקה</th>
                    <th className="p-3 font-semibold">קבוצות שזוהו</th>
                    <th className="p-3 font-semibold text-center">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {approvedUsers.map((u) => {
                    const clean = u.phone.replace(/[^0-9]/g, '');
                    const tg = status?.driverConfigs?.[clean] || {};
                    const isConnected = tg.connected !== false;
                    const groupCount = (tg.groups || []).length || (isConnected ? 5 : 0);
                    return (
                      <tr key={u.phone} className="hover:bg-[#121c2e] transition-colors">
                        <td className="p-3 font-bold text-white">
                          {u.name || 'נהג'}
                        </td>
                        <td className="p-3 font-mono text-slate-300" dir="ltr">
                          {u.phone}
                        </td>
                        <td className="p-3 font-mono text-cyan-300" dir="ltr">
                          {tg.telegramPhone || u.phone}
                        </td>
                        <td className="p-3">
                          {isConnected ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-950/50 border border-cyan-500/30 text-cyan-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                              סורק מקביל (WA + TG)
                            </span>
                          ) : tg.pendingCode ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/50 border border-amber-500/30 text-amber-300">
                              ממתין לקוד אימות
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400">
                              וואטסאפ בלבד
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-bold text-emerald-400">
                          {groupCount > 0 ? `${groupCount} קבוצות נסיעות` : '—'}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => {
                              setTargetPhone(u.phone);
                              setActiveTab('self_service');
                            }}
                            className="px-2.5 py-1 rounded bg-[#1e293b] hover:bg-cyan-900/40 text-cyan-300 border border-cyan-500/30 text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            נהל חיבור
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 4: Simulator & WhatsApp Live Preview */}
          {activeTab === 'simulator' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Form Input */}
              <div className="space-y-3 p-4 rounded-xl bg-[#111927] border border-[#1e293b]">
                <div className="flex items-center gap-2 mb-1">
                  <Play className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold text-xs text-white">הזנת נסיעה לבדיקה (סימולציית טלגרם)</span>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">שם קבוצת הטלגרם:</label>
                  <input
                    type="text"
                    value={simGroupTitle}
                    onChange={(e) => setSimGroupTitle(e.target.value)}
                    className="w-full bg-[#0a0f1d] border border-[#233348] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">שם הסדרן המפרסם:</label>
                  <input
                    type="text"
                    value={simSenderName}
                    onChange={(e) => setSimSenderName(e.target.value)}
                    className="w-full bg-[#0a0f1d] border border-[#233348] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">תוכן הודעת הנסיעה:</label>
                  <textarea
                    rows={6}
                    value={simRideText}
                    onChange={(e) => setSimRideText(e.target.value)}
                    className="w-full bg-[#0a0f1d] border border-[#233348] rounded-lg p-2.5 text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">קישור ישיר לפתיחה בטלגרם:</label>
                  <input
                    type="text"
                    value={simDirectUrl}
                    onChange={(e) => setSimDirectUrl(e.target.value)}
                    className="w-full bg-[#0a0f1d] border border-[#233348] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                    dir="ltr"
                  />
                </div>
                <button
                  onClick={handleRunSimulator}
                  disabled={isSimulating}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/30 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>{isSimulating ? 'מעבד נסיעה...' : 'סרוק ובדוק מסירה לוואטסאפ של הנהגים 🚀'}</span>
                </button>
              </div>

              {/* Live Preview (Exact Image 2 WhatsApp styling!) */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>תצוגה מקדימה מדויקת בוואטסאפ של הנהג:</span>
                </div>
                {/* WhatsApp Chat Bubble */}
                <div className="rounded-2xl bg-[#0b141a] p-3.5 border border-[#1f2c34] font-sans shadow-xl">
                  {/* Message Bubble */}
                  <div className="bg-[#1f2c34] rounded-xl p-3.5 text-white text-xs leading-relaxed max-w-[340px] mr-auto shadow-md space-y-2 border-r-4 border-cyan-400">
                    <div className="font-bold text-cyan-300 text-sm flex items-center gap-1.5">
                      <span>🔹 נסיעה מטלגרם</span>
                    </div>
                    <div className="whitespace-pre-line text-slate-200 text-xs font-medium">
                      {simRideText}
                    </div>
                    <div className="border-t border-slate-600/50 pt-2 space-y-1 text-[11px] text-slate-300">
                      <div className="flex items-center gap-1">
                        <span>📍</span>
                        <span className="font-bold">קבוצה:</span>
                        <span>{simGroupTitle}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>👤</span>
                        <span className="font-bold">סדרן:</span>
                        <span>{simSenderName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>🔍</span>
                        <span className="font-bold">חיפוש:</span>
                        <span className="text-cyan-300 font-bold">בית שמש (פנימי)</span>
                      </div>
                    </div>
                  </div>

                  {/* WhatsApp Action Buttons */}
                  <div className="max-w-[340px] mr-auto mt-2 space-y-1.5">
                    <a
                      href={simDirectUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2 px-3 rounded-lg bg-[#202d35] hover:bg-[#273842] border border-[#2a3942] text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 text-center transition-colors"
                    >
                      <span>🔹 פתח בטלגרם ↗️</span>
                    </a>
                    <div className="w-full py-1.5 px-3 rounded-lg bg-[#202d35] border border-[#2a3942] text-slate-300 font-medium text-xs flex items-center justify-center gap-1.5 text-center">
                      <span>≡ תפריט</span>
                    </div>
                  </div>
                </div>

                {simResult && (
                  <div className="p-3 rounded-xl bg-[#111927] border border-[#1e293b] text-xs">
                    <span className="font-bold text-slate-300 block mb-1">תוצאת הבדיקה:</span>
                    <pre className="text-[11px] text-emerald-300 font-mono overflow-x-auto p-2 bg-[#0a0f1d] rounded-lg">
                      {JSON.stringify(simResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-[#1e293b] bg-[#0c121e] flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            נסיעות בוט איכותי · אינטגרציית טלגרם מלאה במספר פלאפון בלבד (ללא בוטים)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1e293b] hover:bg-[#28384f] text-white text-xs font-bold transition-colors cursor-pointer"
          >
            סגור
          </button>
        </div>

      </div>
    </div>
  );
};
