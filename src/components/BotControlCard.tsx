import React, { useState } from 'react';
import { 
  RotateCcw, 
  PowerOff, 
  QrCode, 
  KeyRound, 
  Copy, 
  Check, 
  AlertTriangle, 
  Terminal, 
  Smartphone,
  ShieldAlert,
  Loader2,
  GitBranch,
  Download,
  BellRing,
  Clock
} from 'lucide-react';
import { WhatsAppState } from '../types.ts';
import { syncFromGitHubApi, requestPairingCodeApi } from '../services/api.ts';
import { DriverQrPanel } from './DriverQrPanel.tsx';

interface BotControlCardProps {
  wa: WhatsAppState;
  onRestartBot: () => Promise<void>;
  onStopBot: () => Promise<void>;
  loading: boolean;
}

export const BotControlCard: React.FC<BotControlCardProps> = ({
  wa,
  onRestartBot,
  onStopBot,
  loading,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);
  const [restartingCountdown, setRestartingCountdown] = useState<number | null>(null);
  const [requestingPairing, setRequestingPairing] = useState(false);
  const [localPairingCode, setLocalPairingCode] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingMethod, setPairingMethod] = useState<'qr' | 'code'>('qr');

  const activePairingCode = localPairingCode || wa.pairingCode;

  const handleCopyPairing = () => {
    if (!activePairingCode) return;
    navigator.clipboard.writeText(activePairingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleRequestPairing = async () => {
    setRequestingPairing(true);
    setPairingError(null);
    try {
      const res = await requestPairingCodeApi(wa.botPhone || '0555081810', true, true);
      if (res.ok && res.code) {
        setLocalPairingCode(res.code);
        setPairingMethod('code');
      } else {
        setPairingError(res.error || 'לא התקבל קוד צימוד');
      }
    } catch (err: any) {
      setPairingError(err.message || 'שגיאה בהפקת קוד צימוד');
    } finally {
      setRequestingPairing(false);
    }
  };

  const handleRestart = async () => {
    setRestartConfirm(false);
    setRestartingCountdown(10);
    const interval = setInterval(() => {
      setRestartingCountdown((prev) => {
        if (!prev || prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      await onRestartBot();
    } catch {
      clearInterval(interval);
      setRestartingCountdown(null);
    }
  };

  const handleStop = async () => {
    setStopConfirm(false);
    await onStopBot();
  };

  const [syncingGit, setSyncingGit] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSyncGit = async () => {
    setSyncingGit(true);
    setSyncMessage(null);
    try {
      const res = await syncFromGitHubApi();
      setSyncMessage(res.message || 'הסנכרון מ-GitHub החל בהצלחה!');
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (e: any) {
      setSyncMessage(e.message || 'שגיאה בסנכרון מ-GitHub');
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setSyncingGit(false);
    }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#121822] to-[#0c1118] border border-[#223044] p-5 shadow-xl space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">שליטה בתהליך ובוואטסאפ</h2>
            <p className="text-xs text-slate-400">ניהול חיבור ה-WhatsApp והפעלה מחדש של תהליך ה-Node</p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {wa.connected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              מחובר
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              מנותק
            </span>
          )}
        </div>
      </div>

      {/* Disconnection & 30-min Watchdog Status */}
      {!wa.connected && (
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-rose-950/40 via-[#181d28] to-rose-950/30 border border-rose-500/40 text-rose-200 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>הבוט המרכזי ({wa.botPhone || '0555081810'}) מנותק כעת</span>
            </div>
            {typeof wa.disconnectedMinutes === 'number' && wa.disconnectedMinutes > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-500/30">
                <Clock className="w-3 h-3" />
                מנותק {wa.disconnectedMinutes} דקות
              </span>
            )}
          </div>

          {wa.lastDisconnectReason && (
            <p className="text-[11px] text-rose-300/80">
              סיבת ניתוק: <span className="font-mono">{wa.lastDisconnectReason}</span>
            </p>
          )}

          {/* 30-Minute Automatic Manager Alert Status */}
          {wa.alertSent30Min ? (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold text-xs">
              <BellRing className="w-4 h-4 text-amber-400 animate-bounce shrink-0" />
              <span>הבוט מנותק מעל 30 דקות! נשלחה התראת חירום לוואטסאפ של המנהל ({wa.adminPhone || 'מנהל'}).</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-[#0c121b] p-2 rounded-lg border border-[#1e2a3b]">
              <ShieldAlert className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>
                שומר ניתוק פעיל (30 דק'): אם הבוט לא יחובר תוך {Math.max(0, 30 - (wa.disconnectedMinutes || 0))} דקות, תישלח התראת וואטסאפ אוטומטית למנהל ({wa.adminPhone || 'מנהל'}).
              </span>
            </div>
          )}
        </div>
      )}

      {/* Connected State vs Dual-Mode Disconnected Pairing */}
      {wa.connected ? (
        <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="font-bold">הבוט הראשי ({wa.botPhone || '0555081810'}) מחובר ופעיל</span>
            </div>
            <span className="text-[11px] text-emerald-400/80 font-mono">200 OK</span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-[11px] text-emerald-200/90">
            <span>📡 סנכרון רב-משתמשי (Multi-Session):</span>
            <span className="font-bold font-mono">
              {wa.connectedDriversCount ? `${wa.connectedDriversCount} נהגים מחוברים ומסננים` : 'אין נהגים נוספים מחוברים כעת'}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Method Selector Tabs: QR Scan vs Pairing Code */}
          <div className="flex items-center gap-1.5 p-1 bg-[#0b1017] rounded-xl border border-[#1e2a3b]">
            <button
              type="button"
              onClick={() => setPairingMethod('qr')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                pairingMethod === 'qr'
                  ? 'bg-teal-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>סריקת קוד QR (ללא הקלדה)</span>
            </button>
            <button
              type="button"
              onClick={() => setPairingMethod('code')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                pairingMethod === 'code'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>קוד צימוד (8 תווים)</span>
            </button>
          </div>

          {/* QR Method */}
          {pairingMethod === 'qr' ? (
            <div className="p-3.5 rounded-xl bg-[#0d131d] border border-teal-500/30 space-y-3">
              <div className="flex items-center justify-between text-xs text-teal-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-teal-400" />
                  קוד QR חי לוואטסאפ של הבוט ({wa.botPhone || '0555081810'})
                </span>
                <span className="text-[11px] text-slate-400">סרוק ישירות בוואטסאפ</span>
              </div>
              <DriverQrPanel phone="bot" onConnected={onRestartBot} />
            </div>
          ) : (
            /* Pairing Code Method */
            <div className="space-y-3">
              {activePairingCode ? (
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/60 via-[#192334] to-amber-950/50 border border-amber-500/60 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-black text-amber-300">
                      <KeyRound className="w-4 h-4 text-amber-400" />
                      קוד צימוד פעיל לוואטסאפ (Pairing Code)
                    </div>
                    <button
                      onClick={handleCopyPairing}
                      className="px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedCode ? 'הועתק ללוח!' : 'העתק קוד'}
                    </button>
                  </div>

                  <div className="font-mono text-3xl font-black text-amber-300 tracking-widest text-center py-2.5 bg-[#080d16] rounded-xl border border-amber-500/40 shadow-inner select-all">
                    {activePairingCode}
                  </div>

                  <div className="text-[11px] text-amber-100/90 leading-relaxed space-y-1 bg-amber-950/30 p-2.5 rounded-lg border border-amber-500/20">
                    <div className="font-bold text-amber-300">כיצד לחבר את הבוט ב-30 שניות:</div>
                    <div>1. פתח וואטסאפ בטלפון של הבוט ({wa.botPhone || '0555081810'})</div>
                    <div>2. לחץ על 3 הנקודות למעלה &gt; <strong>מכשירים מקושרים</strong> &gt; <strong>קשר מכשיר</strong></div>
                    <div>3. בחר למטה <strong>"קשר באמצעות מספר טלפון במקום"</strong> והזן את 8 התווים הנ"ל</div>
                  </div>

                  <button
                    onClick={handleRequestPairing}
                    disabled={requestingPairing}
                    className="w-full py-1.5 text-xs text-amber-300 hover:text-amber-200 underline cursor-pointer disabled:opacity-50 text-center"
                  >
                    {requestingPairing ? 'מפיק קוד חדש...' : 'הקוד פג תוקף? לחץ כאן להפקת קוד צימוד חדש'}
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-[#131b26] border border-[#233348] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-300">
                    <span className="font-bold text-amber-300">הבוט מחכה לצימוד: </span>
                    ניתן לקשר אותו מיד באמצעות קוד בן 8 תווים ללא צורך בסריקת מצלמה.
                  </div>
                  <button
                    onClick={handleRequestPairing}
                    disabled={requestingPairing}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20 shrink-0 disabled:opacity-50"
                  >
                    {requestingPairing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        מפיק קוד...
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-3.5 h-3.5" />
                        הפק קוד צימוד (8 תווים)
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {pairingError && (
        <div className="p-2.5 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg">
          {pairingError}
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Restart Button */}
        <button
          onClick={() => setRestartConfirm(true)}
          disabled={loading || restartingCountdown !== null}
          className="p-3 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          {restartingCountdown !== null ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
              מתאתחל... ({restartingCountdown} שניות)
            </>
          ) : (
            <>
              <RotateCcw className="w-4 h-4" />
              הפעל מחדש בוט (PM2 Restart)
            </>
          )}
        </button>

        {/* Stop PM2 Button */}
        <button
          onClick={() => setStopConfirm(true)}
          disabled={loading}
          className="p-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
        >
          <PowerOff className="w-4 h-4" />
          עצור תהליך שרת (PM2 Stop)
        </button>
      </div>

      {/* 1-Click Sync from GitHub Button */}
      <div className="pt-1 space-y-2">
        <button
          onClick={handleSyncGit}
          disabled={loading || syncingGit}
          className="w-full p-3 rounded-xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-teal-500/20 hover:from-indigo-500/30 hover:to-teal-500/30 border border-indigo-500/40 text-indigo-200 hover:text-white text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-98"
          title="סנכרן את שרת ה-VPS ישירות מול הגרסה העדכנית ב-GitHub בלחיצה אחת"
        >
          {syncingGit ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>מבצע סנכרון ישיר מ-GitHub ומפעיל מחדש...</span>
            </>
          ) : (
            <>
              <GitBranch className="w-4 h-4 text-indigo-400" />
              <span>סנכרן שרת מול GitHub עכשיו (1-Click Sync)</span>
              <Download className="w-3.5 h-3.5 text-teal-400" />
            </>
          )}
        </button>
        {syncMessage && (
          <div className="text-center text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg py-1.5 px-2 animate-in fade-in">
            {syncMessage}
          </div>
        )}
      </div>

      {/* SSH CLI Helper Hint */}
      <div className="p-3 rounded-xl bg-[#090d14] border border-[#1b2635] text-[11px] text-slate-400 space-y-2">
        <div className="font-semibold text-slate-300 flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-amber-400" />
          סנכרון אוטומטי מלא ב-GitHub Webhook:
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          הגדר בהגדרות ה-Repository ב-GitHub תחת Webhooks את הכתובת הבאה, וכל Push יעדכן את השרת מיידית ללא צורך בפקודות:
        </p>
        <div className="font-mono text-[10px] text-emerald-300 bg-[#06090e] p-2 rounded-lg border border-[#233348] select-all break-all">
          http://[IP_של_השרת]:3000/api/deploy/webhook
        </div>
        <div className="flex flex-wrap gap-2 pt-1 font-mono text-[10px]">
          <code className="px-2 py-0.5 rounded bg-[#131b26] border border-[#223044] text-amber-300">
            pm2 logs
          </code>
          <code className="px-2 py-0.5 rounded bg-[#131b26] border border-[#223044] text-teal-300">
            pm2 restart all
          </code>
          <code className="px-2 py-0.5 rounded bg-[#131b26] border border-[#223044] text-slate-300">
            ./auto-sync.sh
          </code>
        </div>
      </div>

      {/* Restart Confirm Modal */}
      {restartConfirm && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setRestartConfirm(false)}
        >
          <div 
            className="w-full max-w-sm bg-[#0e141e] border border-[#233348] rounded-2xl p-5 space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 mx-auto flex items-center justify-center">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">הפעלה מחדש לבוט?</h3>
              <p className="text-xs text-slate-400 mt-1">
                הבוט יתנתק לרגע מוואטסאפ, יטען מחדש את כל הקבצים ויתחבר שוב תוך שניות בודדות.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRestartConfirm(false)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                ביטול
              </button>
              <button
                onClick={handleRestart}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-teal-400 hover:bg-teal-300 text-slate-950 cursor-pointer shadow-lg shadow-teal-500/20"
              >
                כן, הפעל מחדש
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Confirm Modal */}
      {stopConfirm && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setStopConfirm(false)}
        >
          <div 
            className="w-full max-w-sm bg-[#0e141e] border border-rose-500/30 rounded-2xl p-5 space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 mx-auto flex items-center justify-center">
              <PowerOff className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">עצירת תהליך ה-PM2?</h3>
              <p className="text-xs text-rose-200/80 mt-1">
                הבוט ייעצר לחלוטין ולא יוכל לשלוח נסיעות עד להפעלתו מחדש ידנית ב-SSH.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStopConfirm(false)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                ביטול
              </button>
              <button
                onClick={handleStop}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-400 text-white cursor-pointer shadow-lg shadow-rose-500/20"
              >
                כן, עצור עכשיו
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
