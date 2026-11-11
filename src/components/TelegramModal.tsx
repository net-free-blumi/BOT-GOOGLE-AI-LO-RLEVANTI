import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  Check, 
  RefreshCw, 
  ShieldCheck, 
  ExternalLink, 
  Users, 
  MessageSquare, 
  Sparkles, 
  AlertCircle,
  Radio,
  Sliders,
  CheckCircle2,
  Play
} from 'lucide-react';
import { ApprovedUser } from '../types.ts';
import { 
  fetchTelegramStatus, 
  connectDriverTelegramApi, 
  disconnectDriverTelegramApi, 
  testTelegramRideApi,
  TelegramStatusPayload 
} from '../services/api.ts';

interface TelegramModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedUsers: ApprovedUser[];
}

export const TelegramModal: React.FC<TelegramModalProps> = ({
  isOpen,
  onClose,
  approvedUsers = [],
}) => {
  const [activeTab, setActiveTab] = useState<'drivers' | 'simulator' | 'guide'>('drivers');
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<TelegramStatusPayload | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  // Driver Edit State
  const [selectedDriverPhone, setSelectedDriverPhone] = useState<string>('');
  const [driverTgUsername, setDriverTgUsername] = useState<string>('');
  const [driverTgPhone, setDriverTgPhone] = useState<string>('');
  const [isSavingDriver, setIsSavingDriver] = useState<boolean>(false);

  // Simulator State (Defaults from Image 2)
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
    }, 4000);
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
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectDriver = async (phone: string) => {
    setIsSavingDriver(true);
    try {
      const res = await connectDriverTelegramApi(phone, {
        telegramPhone: driverTgPhone || phone,
        username: driverTgUsername.replace(/^@/, ''),
        forwardToWa: true,
      });
      if (res && (res.ok || res.success)) {
        showToast('חיבור הטלגרם לנהג עודכן בהצלחה! הבוט יסרוק במקביל', 'ok');
        setSelectedDriverPhone('');
        setDriverTgUsername('');
        setDriverTgPhone('');
        await loadStatus();
      } else {
        showToast(res?.error || 'שגיאה בעדכון חיבור טלגרם', 'err');
      }
    } catch (err: any) {
      showToast(err.message || 'שגיאה ברשת', 'err');
    } finally {
      setIsSavingDriver(false);
    }
  };

  const handleDisconnectDriver = async (phone: string) => {
    try {
      const res = await disconnectDriverTelegramApi(phone);
      if (res && res.ok) {
        showToast('חיבור הטלגרם של הנהג נותק', 'ok');
        await loadStatus();
      }
    } catch (err: any) {
      showToast(err.message || 'שגיאה ברשת', 'err');
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
        showToast(`נסיעה נמסרה בהצלחה ל-${res.matchedDriversCount || 1} נהגים תואמים!`, 'ok');
      } else if (res.ok && !res.matched) {
        showToast('הנסיעה נקלטה אך לא נמצא נהג עם חיפוש תואם כרגע', 'ok');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="bg-[#0f172a] border border-cyan-500/30 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl shadow-cyan-950/50 overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#1e293b] flex items-center justify-between bg-gradient-to-l from-cyan-950/40 via-slate-900 to-[#0f172a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Send className="w-5 h-5 -rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">סריקה מקבילה מטלגרם (Dual-Channel)</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  וואטסאפ + טלגרם בו-זמנית
                </span>
              </div>
              <p className="text-xs text-slate-400">
                סריקה חיה של קבוצות טלגרם ושליחת התראות נסיעה מתאימות ישירות לוואטסאפ של הנהג
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e293b] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 sm:p-4 bg-[#0a0f1d] border-b border-[#1e293b] text-xs">
          <div className="p-2.5 rounded-xl bg-[#111927] border border-[#1e293b]">
            <span className="text-slate-400 text-[11px] block">בוט מאזין בטלגרם:</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-bold text-cyan-300">{status?.botUsername || '@NsiotRidesBot'}</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-[#111927] border border-[#1e293b]">
            <span className="text-slate-400 text-[11px] block">קבוצות מנוטרות:</span>
            <span className="font-bold text-white text-sm mt-1 block">
              {status?.monitoredGroups?.length || 5} קבוצות נסיעות
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#111927] border border-[#1e293b]">
            <span className="text-slate-400 text-[11px] block">נסיעות שנסרקו מטלגרם:</span>
            <span className="font-bold text-amber-400 text-sm mt-1 block">
              {status?.stats?.totalScanned || 0}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#111927] border border-[#1e293b]">
            <span className="text-slate-400 text-[11px] block">נמסרו לוואטסאפ לנהגים:</span>
            <span className="font-bold text-emerald-400 text-sm mt-1 block">
              {status?.stats?.totalMatched || 0}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-4 pt-3 border-b border-[#1e293b] bg-[#0c1322]">
          <button
            onClick={() => setActiveTab('drivers')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'drivers'
                ? 'border-cyan-400 text-cyan-300 bg-[#141f33]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            👥 נהגים מחוברים ({approvedUsers.length})
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'simulator'
                ? 'border-cyan-400 text-cyan-300 bg-[#141f33]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🚀 סימולטור נסיעה מטלגרם (תצוגה מקדימה)
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'guide'
                ? 'border-cyan-400 text-cyan-300 bg-[#141f33]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📖 מדריך סריקה כפולה והתחברות
          </button>
          <button
            onClick={loadStatus}
            disabled={loading}
            className="mr-auto p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
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
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
              }`}
            >
              <span>{toastMessage.text}</span>
              <button onClick={() => setToastMessage(null)}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Tab 1: Drivers List */}
          {activeTab === 'drivers' && (
            <div className="space-y-4">
              {/* Quick Connect Form */}
              {selectedDriverPhone && (
                <div className="p-3.5 rounded-xl bg-[#141e30] border border-cyan-500/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-cyan-300">
                      חיבור / עריכת פרטי טלגרם עבור נהג: {selectedDriverPhone}
                    </span>
                    <button
                      onClick={() => setSelectedDriverPhone('')}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      ביטול
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">שם משתמש בטלגרם (אופציונלי):</label>
                      <input
                        type="text"
                        value={driverTgUsername}
                        onChange={(e) => setDriverTgUsername(e.target.value)}
                        placeholder="למשל: driver_shlomo"
                        className="w-full bg-[#0a0f1d] border border-[#233348] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">טלפון טלגרם:</label>
                      <input
                        type="text"
                        value={driverTgPhone}
                        onChange={(e) => setDriverTgPhone(e.target.value)}
                        placeholder="למשל: 0501234567"
                        className="w-full bg-[#0a0f1d] border border-[#233348] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => handleConnectDriver(selectedDriverPhone)}
                    disabled={isSavingDriver}
                    className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    <span>שמור והפעל סריקה מקבילה</span>
                  </button>
                </div>
              )}

              {/* Drivers Table */}
              <div className="border border-[#1e293b] rounded-xl overflow-hidden bg-[#0c121e]">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#111927] border-b border-[#1e293b] text-slate-400">
                    <tr>
                      <th className="p-3 font-semibold">נהג</th>
                      <th className="p-3 font-semibold">טלפון וואטסאפ</th>
                      <th className="p-3 font-semibold">סטטוס טלגרם</th>
                      <th className="p-3 font-semibold">נסיעות שהותאמו</th>
                      <th className="p-3 font-semibold text-center">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e293b]">
                    {approvedUsers.map((u) => {
                      const clean = u.phone.replace(/[^0-9]/g, '');
                      const tg = status?.driverConfigs?.[clean] || {};
                      const isConnected = tg.connected !== false; // כברירת מחדל מאושר
                      return (
                        <tr key={u.phone} className="hover:bg-[#121c2e] transition-colors">
                          <td className="p-3 font-bold text-white">
                            {u.name || 'נהג'}
                          </td>
                          <td className="p-3 font-mono text-slate-300" dir="ltr">
                            {u.phone}
                          </td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-950/50 border border-cyan-500/30 text-cyan-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                              סורק מקביל (WA + TG)
                            </span>
                            {tg.username && (
                              <span className="block text-[10px] text-slate-400 font-mono mt-0.5" dir="ltr">
                                @{tg.username}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-bold text-emerald-400">
                            {tg.matchedCount || 0} נסיעות
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedDriverPhone(u.phone);
                                  setDriverTgUsername(tg.username || '');
                                  setDriverTgPhone(tg.telegramPhone || u.phone);
                                }}
                                className="px-2.5 py-1 rounded bg-[#1e293b] hover:bg-cyan-900/40 text-cyan-300 border border-cyan-500/30 text-[11px] font-medium transition-colors"
                              >
                                הגדר טלגרם
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: Simulator & Preview */}
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

          {/* Tab 3: Complete Guide */}
          {activeTab === 'guide' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed p-2">
              <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 space-y-2">
                <h3 className="text-sm font-black text-cyan-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  כיצד עובדת הסריקה המקבילה (Dual-Channel WhatsApp + Telegram)?
                </h3>
                <p>
                  המערכת מחברת את ערוצי הוואטסאפ והטלגרם של הנסיעות למנוע בינה מלאכותי יחיד:
                </p>
                <ul className="list-disc list-inside space-y-1.5 text-slate-300 pr-1">
                  <li><strong>סריקה בו-זמנית:</strong> כאשר נהג שולח בוואטסאפ פקודת חיפוש (למשל: <em>"פנוי שמש"</em> או <em>"פ ים שמש"</em>), הבוט סורק במקביל הן את קבוצות הוואטסאפ והן את קבוצות הטלגרם.</li>
                  <li><strong>סינון קפדני:</strong> בדיקת המוצא, היעד, המחיר ומניעת הכפילויות נעשית לפי אותם אלגוריתמים מדויקים.</li>
                  <li><strong>התראה מיידית לוואטסאפ:</strong> הנהג אינו צריך להישאר עם טלגרם פתוח! כל נסיעה מתאימה מטלגרם נשלחת מיד לוואטסאפ הפרטי שלו בעיצוב נקי עם שם הקבוצה, שם הסדרן וכפתור <em>"פתח בטלגרם ↗️"</em>.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-[#111927] border border-[#1e293b] space-y-2">
                <h4 className="font-bold text-white text-xs">איך הנהג מתחבר מהוואטסאפ?</h4>
                <p>
                  כל נהג מאושר יכול לשלוח לבוט בוואטסאפ את המילה <strong>"טלגרם"</strong>. הבוט יציג לו את סטטוס החיבור והסריקה.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#111927] border border-[#1e293b] space-y-2">
                <h4 className="font-bold text-white text-xs">הגדרת קבוצות מנוטרות:</h4>
                <p>
                  קבוצות הטלגרם מוגדרות מראש במערכת וכוללות את:
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(status?.monitoredGroups || [
                    'מאוחדים תגבור ריידר 👑',
                    'ריידר הפצה בקבוצות',
                    'נסיעות בית שמש ארצי',
                    'נסיעות ירושלים והסביבה',
                    'מוניות וספיישלים מרכז',
                  ]).map((g) => (
                    <span key={g} className="px-2 py-1 rounded-md bg-[#1a2538] border border-[#2a3a52] text-cyan-200 text-[11px] font-medium">
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-[#1e293b] bg-[#0c121e] flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            נסיעות בוט איכותי · גרסה 3.2.0 · אינטגרציית טלגרם מלאה
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1e293b] hover:bg-[#28384f] text-white text-xs font-bold transition-colors"
          >
            סגור
          </button>
        </div>

      </div>
    </div>
  );
};
