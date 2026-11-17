import React, { useState } from 'react';
import { 
  X, 
  ShieldCheck, 
  FileText, 
  Lock, 
  Info, 
  Phone, 
  Globe, 
  Mail, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle,
  Scale
} from 'lucide-react';

export type LegalTab = 'about' | 'accessibility' | 'terms' | 'privacy';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalTab;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'about',
}) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      dir="rtl"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-3xl bg-[#0c121c] border border-[#23354b] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-[#e8eef7]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-[#1d2b3c] flex items-center justify-between bg-[#0e1624]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-teal-500/20 border border-amber-500/30 flex items-center justify-center text-xl">
              ⚖️
            </div>
            <div>
              <h2 id="legal-modal-title" className="text-base sm:text-lg font-black text-white">
                מרכז מידע, משפט ונגישות
              </h2>
              <p className="text-xs text-slate-400">
                פרטי המערכת, עמידה בחוקי מדינת ישראל, תנאי שימוש והצהרת נגישות
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-[#162132] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="סגור חלון"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-2.5 bg-[#090d15] border-b border-[#1c293a] overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('about')}
            className={`px-3 py-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'about'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                : 'text-slate-400 hover:text-white hover:bg-[#141d2c]'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            אודות והתקשרות
          </button>

          <button
            onClick={() => setActiveTab('accessibility')}
            className={`px-3 py-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'accessibility'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                : 'text-slate-400 hover:text-white hover:bg-[#141d2c]'
            }`}
          >
            <span className="text-sm leading-none">♿</span>
            הצהרת נגישות (ת"י 5568)
          </button>

          <button
            onClick={() => setActiveTab('terms')}
            className={`px-3 py-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'terms'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                : 'text-slate-400 hover:text-white hover:bg-[#141d2c]'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            תנאי שימוש והגבלת אחריות
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`px-3 py-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                : 'text-slate-400 hover:text-white hover:bg-[#141d2c]'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            מדיניות פרטיות ואבטחה
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6 text-sm text-slate-300 leading-relaxed">
          {/* TAB 1: ABOUT */}
          {activeTab === 'about' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-[#111927] border border-[#223348] space-y-3">
                <span className="text-xs uppercase tracking-wider font-extrabold text-amber-400 block">
                  יוצר ומפעיל המערכת
                </span>
                <h3 className="text-xl font-black text-white">
                  קרדיט: מ בלומי
                </h3>
                <p className="text-xs text-slate-300">
                  מערכת בקרה וניהול מתקדמת לחלוקת נסיעות, סינון חכם של הודעות וואטסאפ בזמן אמת, וניתוב ממוקד לנהגי מוניות וסדרנים. המערכת מותאמת באופן מלא לכל מכשיר נייד, טאבלט ומחשב נייח.
                </p>
              </div>

              {/* Direct Contact Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Phone */}
                <a
                  href="tel:0515157166"
                  className="p-4 rounded-2xl bg-[#101826] hover:bg-[#162234] border border-[#1f2f44] hover:border-amber-400/40 transition-all flex flex-col gap-1.5 group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center">
                    <Phone className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] text-slate-400">טלפון ישיר:</span>
                  <span className="font-mono font-bold text-white text-base group-hover:text-amber-300" dir="ltr">
                    051-5157166
                  </span>
                </a>

                {/* Website */}
                <a
                  href="https://m-blumi.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-2xl bg-[#101826] hover:bg-[#162234] border border-[#1f2f44] hover:border-teal-400/40 transition-all flex flex-col gap-1.5 group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-teal-500/15 text-teal-300 flex items-center justify-center">
                    <Globe className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] text-slate-400">אתר אינטרנט:</span>
                  <span className="font-mono font-bold text-teal-300 text-sm group-hover:underline flex items-center gap-1" dir="ltr">
                    m-blumi.com
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </span>
                </a>

                {/* Email */}
                <a
                  href="mailto:123123mushh@gmail.com"
                  className="p-4 rounded-2xl bg-[#101826] hover:bg-[#162234] border border-[#1f2f44] hover:border-purple-400/40 transition-all flex flex-col gap-1.5 group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-300 flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] text-slate-400">אימייל לפניות:</span>
                  <span className="font-mono font-bold text-slate-200 text-xs truncate group-hover:text-purple-300" dir="ltr">
                    123123mushh@gmail.com
                  </span>
                </a>
              </div>

              {/* System Info */}
              <div className="p-4 rounded-2xl bg-[#090e17] border border-[#1b2636] space-y-2 text-xs">
                <span className="font-bold text-white block">גרסת מערכת פעילה: 2.9 (Build 2026)</span>
                <p className="text-slate-400">
                  פותחה בדגש על מהירות תגובה אפסית, חסימת ספאם, סינון כפילויות רב-שכבתי, שמירה על פרטיות הנהגים, ועמידה מלאה בדרישות החוק.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: ACCESSIBILITY STATEMENT */}
          {activeTab === 'accessibility' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-emerald-200 text-sm">
                    הצהרת נגישות לפי תקן ת"י 5568 והנחיות WCAG 2.1 ברמת AA
                  </h4>
                  <p className="text-xs text-emerald-200/80 mt-1">
                    אנו רואים חשיבות עליונה במתן שירות שוויוני, נגיש ומכבד לכלל המשתמשים, לרבות אנשים עם מוגבלות. האתר והדשבורד הותאמו בקפידה על פי חוק שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013.
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <h4 className="font-bold text-white text-sm">התאמות הנגישות שבוצעו במערכת:</h4>
                <ul className="list-disc list-inside space-y-1.5 text-slate-300 pr-2">
                  <li><strong>ניווט מלא באמצעות מקלדת:</strong> כל הכפתורים, השדות והחלונות נגישים באמצעות מקש Tab ו-Enter / Space.</li>
                  <li><strong>תפריט נגישות ייעודי (כפתור ♿):</strong> מאפשר הגדלת טקסט עד 140%, הפעלת ניגודיות גבוהה, גווני אפור, היפוך צבעים, פונט קריא ועצירת אנימציות.</li>
                  <li><strong>תאימות לקוראי מסך:</strong> שימוש בתגיות סמנטיות תקינות (ARIA landmarks, role="dialog", aria-label).</li>
                  <li><strong>עיצוב מותאם רשתית ומסכים שונים:</strong> תמיכה מלאה בהגדלת תצוגה (Zoom) עד 200% ללא שבירת תוכן.</li>
                  <li><strong>יחסי ניגודיות מחמירים:</strong> טקסטים וכפתורים עומדים ביחס ניגודיות מינימלי של 4.5:1 לפחות.</li>
                </ul>
              </div>

              {/* Accessibility Coordinator Contact */}
              <div className="p-4 rounded-2xl bg-[#111927] border border-[#223348] space-y-2 text-xs">
                <h4 className="font-bold text-amber-300 text-sm">פרטי רכז הנגישות ודרכי פנייה:</h4>
                <p className="text-slate-300">
                  אם נתקלתם בקושי בגלישה או שיש לכם הצעה לשיפור הנגישות, נשמח לעמוד לרשותכם:
                </p>
                <div className="pt-2 flex flex-wrap gap-4 text-slate-300">
                  <div><strong>רכז נגישות:</strong> מ בלומי</div>
                  <div><strong>טלפון / וואטסאפ:</strong> <a href="tel:0515157166" className="text-amber-400 font-mono">051-5157166</a></div>
                  <div><strong>דוא״ל:</strong> <a href="mailto:123123mushh@gmail.com" className="text-amber-400 font-mono">123123mushh@gmail.com</a></div>
                </div>
                <p className="text-[11px] text-slate-400 pt-1">
                  מועד עדכון הצהרת הנגישות: 28 באוקטובר 2026.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: TERMS OF SERVICE */}
          {activeTab === 'terms' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-200 text-sm">
                    תנאי שימוש והגבלת אחריות משפטית
                  </h4>
                  <p className="text-xs text-amber-200/80 mt-1">
                    השימוש במערכת "מרכז שליטה · בוט נסיעות" מותנה בקבלת התנאים המפורטים להלן במלואם.
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <h5 className="font-bold text-white">1. מהות השירות וכלי עזר טכנולוגי</h5>
                  <p className="text-slate-300">
                    המערכת מהווה כלי עזר טכנולוגי בלבד לסינון, הצגת הודעות שנשלחו בקבוצות וואטסאפ ציבוריות או פרטיות של סדרנים, וסיוע בניתוב נסיעות. המערכת אינה מעסיקה של נהגים, אינה חברת הסעות ואינה צד לכל התקשרות או עסקה שבין נהג לסדרן או לנוסע.
                  </p>
                </div>

                <div className="space-y-1">
                  <h5 className="font-bold text-white">2. הגבלת אחריות מוחלטת</h5>
                  <p className="text-slate-300">
                    מפעיל המערכת ויוצריה אינם נושאים בכל אחריות, ישירה או עקיפה, לנכונות המידע, לדיוק מחירי הנסיעות, לכתובות, לביטולי נסיעות, לתשלומים, לזמינות שרתי וואטסאפ או ספקי תקשורת, או לכל נזק ממוני, פיזי או תוצאתי שייגרם למשתמש או לצד שלישי. השימוש במערכת ובנסיעות הוא על אחריות המשתמש הבלעדית.
                  </p>
                </div>

                <div className="space-y-1">
                  <h5 className="font-bold text-white">3. שימוש מורשה ומניעת שימוש לרעה</h5>
                  <p className="text-slate-300">
                    הגישה למערכת מותרת אך ורק למשתמשים שאושרו על ידי הנהלת המערכת. חל איסור מוחלט על הפעלת בוטים עוינים, ניסיונות פריצה, הצפת הודעות, הנדסה לאחור או העברת פרטי גישה לגורמים בלתי מורשים.
                  </p>
                </div>

                <div className="space-y-1">
                  <h5 className="font-bold text-white">4. קניין רוחני וסמכות שיפוט</h5>
                  <p className="text-slate-300">
                    כל זכויות היוצרים, סימני המסחר, קוד המקור, אלגוריתמי הסינון ועיצוב המערכת שמורים ל-מ בלומי. על תנאים אלה יחולו אך ורק דיני מדינת ישראל, וסמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים במחוז ירושלים.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PRIVACY POLICY */}
          {activeTab === 'privacy' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-teal-950/30 border border-teal-500/30 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-teal-200 text-sm">
                    מדיניות פרטיות ואבטחת מידע (חוק הגנת הפרטיות, התשמ"א-1981)
                  </h4>
                  <p className="text-xs text-teal-200/80 mt-1">
                    אנו מכבדים את פרטיותך ומתחייבים לשמור על סודיות ואבטחת המידע שנמסר לנו.
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <h5 className="font-bold text-white">1. סוג המידע הנאסף</h5>
                  <p className="text-slate-300">
                    המערכת אוספת אך ורק מידע טכני הנחוץ לתפעול השירות: מספר הטלפון המורשה של הנהג לצורך אימות וחיבור לסשן, ושאילתות חיפוש נסיעות מוגדרות ("פנימי", "שמש", וכו'). המערכת אינה שומרת פרטי אשראי, מסמכים אישיים או מיקומי GPS חיים.
                  </p>
                </div>

                <div className="space-y-1">
                  <h5 className="font-bold text-white">2. שימוש במידע</h5>
                  <p className="text-slate-300">
                    המידע משמש אך ורק למטרת שליחת התראות נסיעה מבוקשות למכשיר הנהג וניהול הרשאות הגישה. המידע אינו מועבר, נמכר או מושכר לשום גוף מסחרי, מפרסם או צד שלישי אחר.
                  </p>
                </div>

                <div className="space-y-1">
                  <h5 className="font-bold text-white">3. אבטחת מידע וניהול לוגים</h5>
                  <p className="text-slate-300">
                    לוגים של הודעות נסיעה נשמרים בזיכרון השרת המקומי לפרק זמן קצר לצרכי ניפוי שגיאות תפעוליות בלבד, ונמחקים אוטומטית במחזורי ניקוי תקופתיים. התקשורת מול השרת מאובטחת באמצעות מפתחות סיסמה ואימות ייחודי.
                  </p>
                </div>

                <div className="space-y-1">
                  <h5 className="font-bold text-white">4. זכות לעיון ומחיקת מידע</h5>
                  <p className="text-slate-300">
                    כל משתמש רשאי לפנות בכל עת למנהל המערכת בטלפון 051-5157166 או בדוא"ל 123123mushh@gmail.com בבקשה להסיר את מספרו מהמערכת ולמחוק את כל הנתונים הקשורים לחשבונו לצמיתות.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#090e17] border-t border-[#1c293a] flex items-center justify-between text-xs text-slate-400">
          <span>© 2026 מ בלומי · כל הזכויות שמורות</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold transition-colors cursor-pointer"
          >
            אישור וסגירה
          </button>
        </div>
      </div>
    </div>
  );
};
