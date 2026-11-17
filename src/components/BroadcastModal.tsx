import React, { useState, useMemo } from 'react';
import { 
  X, 
  Send, 
  Megaphone, 
  Users, 
  Radio, 
  CheckCheck, 
  Sparkles, 
  Bold, 
  Italic, 
  Strikethrough, 
  Code, 
  Copy, 
  Check, 
  AlertCircle, 
  RefreshCw,
  MessageSquare
} from 'lucide-react';
import { ApprovedUser } from '../types.ts';

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedUsers: ApprovedUser[];
  activeSessionsCount: number;
  onSendBroadcast: (message: string, targetType: 'all' | 'connected') => Promise<{
    ok: boolean;
    sentCount?: number;
    failedCount?: number;
    error?: string;
  }>;
}

const PRESET_TEMPLATES = [
  {
    title: '📢 עדכון גרסה ושדרוג',
    text: `🚕 *שלום לכל נהגי נסיעות בוט!*\n\nביצענו שדרוג מקיף בשרת הבוט:\n• סינון משופר ומדויק יותר של נסיעות\n• הוספת עשרות מוקדים ושכונות חדשות\n• מניעה מוחלטת של הודעות לא רלוונטיות\n\nלהפעלת חיפוש חדש: שלח למשל *פנוי שמש* או *שמש צמצם*.\nנסיעה בטוחה ומפרנסת! 🍀`
  },
  {
    title: '🌙 תזכורת תחזוקה לילית',
    text: `🌙 *תזכורת שגרתית לכל הנהגים*\n\nהחיפושים מתאפסים אוטומטית בכל לילה ב-*02:00* למניעת עומסים.\nבבוקר, פשוט שלחו הודעה קצרה (למשל: *פנוי שמש*) והבוט יחזור לסרוק עבורכם נסיעות מיד.`
  },
  {
    title: '⚠️ הודעה דחופה לנהגים',
    text: `⚠️ *הודעה חשובה לכלל הנהגים*\n\nשימו לב: הקפידו לבדוק את פרטי הנסיעה והסדרן לפני לקיחת הנסיעה.\nלדיווח על נסיעה שגויה או באג: פשוט סמנו 👎 על הודעת הנסיעה שהבוט שלח.`
  },
  {
    title: '☀️ בוקר טוב וברכת פרנסה',
    text: `☀️ *בוקר טוב ושבוע מבורך לכל הנהגים!* 🚕\n\nהבוט סורק במלוא המרץ בכל קבוצות הנסיעות המובילות.\nרוצים לקבל נסיעות? שלחו עכשיו:\n• *פנוי שמש* (פנימי בית שמש)\n• *שמש צמצם* (פנימי ויוצא)\n• *פ ים שמש* (מירושלים לשמש)\n\nיום מוצלח ומלא פרנסה בשפע! 🙏`
  }
];

export const BroadcastModal: React.FC<BroadcastModalProps> = ({
  isOpen,
  onClose,
  approvedUsers,
  activeSessionsCount,
  onSendBroadcast
}) => {
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'connected'>('connected');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    sentCount?: number;
    failedCount?: number;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // חישוב כמות נמענים צפויה
  const recipientCount = useMemo(() => {
    if (targetType === 'connected') {
      return Math.max(activeSessionsCount, 1);
    }
    return approvedUsers.length > 0 ? approvedUsers.length : 1;
  }, [targetType, activeSessionsCount, approvedUsers]);

  if (!isOpen) return null;

  // הוספת תגי עיצוב של וואטסאפ לטקסט
  const insertFormatting = (prefix: string, suffix: string = prefix) => {
    setMessage(prev => {
      const textarea = document.getElementById('broadcast-textarea') as HTMLTextAreaElement | null;
      if (!textarea) return prev + `${prefix}טקסט${suffix}`;
      
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = prev.substring(start, end) || 'טקסט';
      const before = prev.substring(0, start);
      const after = prev.substring(end);
      
      const nextText = `${before}${prefix}${selected}${suffix}${after}`;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
      }, 50);
      return nextText;
    });
  };

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    setIsSending(true);
    setSendResult(null);

    try {
      const res = await onSendBroadcast(message, targetType);
      setSendResult(res);
      if (res.ok) {
        setTimeout(() => {
          // נקה תוצאה לאחר 4 שניות
        }, 4000);
      }
    } catch (err: any) {
      setSendResult({
        ok: false,
        error: err?.message || 'שגיאה בלתי צפויה בשליחת התפוצה'
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // רינדור של עיצוב וואטסאפ (מודגש, נטוי, קו חוצה, מונוספייס)
  const renderWhatsAppFormattedText = (raw: string) => {
    if (!raw) return <span className="text-slate-500 italic">הקלד הודעה משמאל כדי לראות תצוגה מקדימה...</span>;

    const lines = raw.split('\n');
    return lines.map((line, lineIdx) => {
      // 1. החלפת *מודגש*
      let parts: React.ReactNode[] = [line];

      // פונקציית עזר להחלפת סימונים
      const formatString = (textStr: string): React.ReactNode[] => {
        // מודגש: *text*
        const boldRegex = /\*([^*\n]+)\*/g;
        const italicRegex = /_([^_\n]+)_/g;
        const strikeRegex = /~([^~\n]+)~/g;
        const codeRegex = /```([^`\n]+)```/g;

        const rendered: (string | React.ReactElement)[] = [];
        let lastIdx = 0;
        
        // נשתמש בהחלפה פשוטה ומהירה של פורמט וואטסאפ
        const formatted = textStr
          .replace(codeRegex, '<code class="bg-[#18222d] text-emerald-400 px-1 py-0.5 rounded font-mono text-[11px]">$1</code>')
          .replace(boldRegex, '<strong class="font-bold text-white">$1</strong>')
          .replace(italicRegex, '<em class="italic text-slate-200">$1</em>')
          .replace(strikeRegex, '<del class="line-through text-slate-400">$1</del>');

        return [<span key={lineIdx} dangerouslySetInnerHTML={{ __html: formatted }} />];
      };

      return (
        <div key={lineIdx} className="min-h-[1.25rem] break-words">
          {formatString(line)}
        </div>
      );
    });
  };

  const nowTime = new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem'
  }).format(new Date());

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in" 
      dir="rtl"
      onClick={onClose}
    >
      <div 
        className="bg-[#0e1622] border border-[#23354d] w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#1c2a3d] flex items-center justify-between bg-[#121c2b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                שידור הודעת תפוצה לכל הנהגים
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  וואטסאפ ישיר
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                שלח הודעה מרוכזת מהבוט הראשי לכל הנהגים המחוברים בלחיצת כפתור אחת
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#182333] hover:bg-[#202f45] border border-slate-700/50 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          
          {/* Target Audience Selector */}
          <div className="bg-[#131d2b] border border-[#213247] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              קהל יעד לשידור:
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTargetType('connected')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 border ${
                  targetType === 'connected'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                    : 'bg-[#182333] text-slate-400 border-slate-700/50 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                נהגים מחוברים כעת ({activeSessionsCount})
              </button>
              <button
                type="button"
                onClick={() => setTargetType('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 border ${
                  targetType === 'all'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                    : 'bg-[#182333] text-slate-400 border-slate-700/50 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-blue-400" />
                כל הנהגים המאושרים ({approvedUsers.length})
              </button>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                תבניות מהירות להדבקה בלחיצה:
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESET_TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setMessage(tmpl.text)}
                  className="p-2.5 rounded-xl bg-[#131d2b] hover:bg-[#182436] border border-[#213247] hover:border-amber-500/40 text-right transition-all cursor-pointer text-xs group"
                >
                  <div className="font-semibold text-slate-200 group-hover:text-amber-300 truncate">
                    {tmpl.title}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                    הדבק תבנית מוכנה
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Two-Column Editor & WhatsApp Live Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Left: Input Textarea with Formatting Toolbar */}
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                  עריכת הודעה:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => insertFormatting('*')}
                    className="p-1.5 rounded bg-[#182333] hover:bg-[#202f45] border border-slate-700/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="מודגש (*טקסט*)"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('_')}
                    className="p-1.5 rounded bg-[#182333] hover:bg-[#202f45] border border-slate-700/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="נטוי (_טקסט_)"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('~')}
                    className="p-1.5 rounded bg-[#182333] hover:bg-[#202f45] border border-slate-700/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="קו חוצה (~טקסט~)"
                  >
                    <Strikethrough className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('```')}
                    className="p-1.5 rounded bg-[#182333] hover:bg-[#202f45] border border-slate-700/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="מונוספייס (```טקסט```)"
                  >
                    <Code className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1.5 rounded bg-[#182333] hover:bg-[#202f45] border border-slate-700/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="העתק טקסט"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <textarea
                id="broadcast-textarea"
                rows={10}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="הקלד או הדבק כאן את תוכן ההודעה לשליחה לכל הנהגים...
תומך בעיצוב וואטסאפ:
*טקסט מודגש*
_טקסט נטוי_
~טקסט עם קו חוצה~
אימוג'ים 🚕 ⚠️ 📢"
                className="w-full bg-[#131d2b] border border-[#213247] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 rounded-xl p-3 text-slate-200 placeholder-slate-500 text-xs sm:text-sm font-sans resize-none transition-colors leading-relaxed"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{message.length} תווים · {message.split('\n').filter(Boolean).length} שורות</span>
                {message && (
                  <button
                    type="button"
                    onClick={() => setMessage('')}
                    className="text-rose-400 hover:underline cursor-pointer"
                  >
                    נקה טקסט
                  </button>
                )}
              </div>
            </div>

            {/* Right: Live WhatsApp Chat Mockup */}
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  תצוגה מקדימה מדויקת בוואטסאפ:
                </span>
                <span className="text-[11px] text-slate-400">איך הנהג יראה את זה</span>
              </div>

              {/* Realistic WhatsApp Chat Box */}
              <div className="flex-1 min-h-[220px] rounded-xl bg-[#0b141a] border border-[#1b2b3b] p-4 flex flex-col justify-end shadow-inner relative overflow-hidden">
                {/* Background WhatsApp Doodle Pattern Opacity */}
                <div 
                  className="absolute inset-0 opacity-[0.04] pointer-events-none"
                  style={{
                    backgroundImage: `radial-gradient(#22c55e 1px, transparent 1px)`,
                    backgroundSize: '16px 16px'
                  }}
                />

                {/* WhatsApp Outgoing Bubble */}
                <div className="relative self-start max-w-[92%] bg-[#005c4b] text-white rounded-2xl rounded-tr-none px-3.5 py-2.5 shadow-md border border-emerald-600/30 text-xs sm:text-sm leading-relaxed">
                  
                  {/* Sender Tag */}
                  <div className="text-[10px] font-bold text-emerald-300 mb-1 flex items-center gap-1">
                    <span>נסיעות בוט איכותי</span>
                    <span className="text-[9px] px-1 rounded bg-emerald-700/60 text-white font-normal">הודעה רשמית</span>
                  </div>

                  {/* Formatted Content */}
                  <div className="whitespace-pre-wrap leading-relaxed select-text font-sans">
                    {renderWhatsAppFormattedText(message)}
                  </div>

                  {/* Time & Double Checkmark */}
                  <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] text-emerald-200/80 font-mono">
                    <span>{nowTime}</span>
                    <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Send Status Message */}
          {sendResult && (
            <div className={`p-3.5 rounded-xl border flex items-center gap-3 text-xs ${
              sendResult.ok
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            }`}>
              {sendResult.ok ? (
                <Check className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <div className="flex-1">
                {sendResult.ok ? (
                  <div className="font-semibold">
                    🎉 ההודעה שודרה בהצלחה ל-{sendResult.sentCount || recipientCount} נהגים!
                    {sendResult.failedCount ? ` (${sendResult.failedCount} נכשלו)` : ''}
                  </div>
                ) : (
                  <div>
                    <span className="font-bold">שגיאה בשידור:</span> {sendResult.error}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-[#1c2a3d] bg-[#121c2b] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>ההודעה תישלח בבת אחת ל-<strong>{recipientCount}</strong> נהגים מוגדרים.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#182333] hover:bg-[#202f45] border border-slate-700/50 text-slate-300 transition-colors cursor-pointer"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!message.trim() || isSending}
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-lg ${
                !message.trim() || isSending
                  ? 'bg-slate-800 text-slate-500 border border-slate-700/40 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black border border-emerald-400/50 shadow-emerald-500/20 cursor-pointer active:scale-95'
              }`}
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>משדר לנהגים...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>שדר עכשיו ל-{recipientCount} נהגים</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
