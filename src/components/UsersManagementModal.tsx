import React, { useState, useEffect } from 'react';
import { 
  X, 
  Users, 
  UserCheck, 
  UserX, 
  UserPlus, 
  Trash2, 
  Shield, 
  Smartphone, 
  Clock, 
  Check, 
  Copy, 
  RefreshCw,
  AlertTriangle,
  QrCode,
  Edit3,
  Bot,
  Radio,
  Unplug,
  Search,
  PowerOff,
  Phone,
  User,
  KeyRound,
  ExternalLink,
  Send,
  BellOff
} from 'lucide-react';
import { ApprovedUser, PendingUser, DriverSessionItem } from '../types.ts';
import { 
  fetchUsersList, 
  approveUserApi, 
  rejectUserApi, 
  addUserApi, 
  deleteUserApi, 
  updateUsersConfigApi,
  requestPairingCodeApi,
  updateUserPhoneApi,
  editUserDetailsApi,
  fetchSessionsSummary,
  disconnectDriverApi,
  resetDriverAuthApi,
  sendSearchCommand,
  stopSearch,
  sendOnboardingGuideApi
} from '../services/api.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import { DriverQrPanel } from './DriverQrPanel.tsx';

interface UsersManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserModified?: () => void;
}

export const UsersManagementModal: React.FC<UsersManagementModalProps> = ({
  isOpen,
  onClose,
  onUserModified,
}) => {
  const [activeTab, setActiveTab] = useState<'approved' | 'pending' | 'pairing' | 'sessions' | 'settings'>('approved');
  const [loading, setLoading] = useState(false);
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [adminPhone, setAdminPhone] = useState('972515157166');
  const [botPhone, setBotPhone] = useState('972555081810');
  const [cooldownHours, setCooldownHours] = useState(24);

  // Quick search filter for drivers list
  const [filterQuery, setFilterQuery] = useState('');

  // Form states (Add Direct User)
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit User Dialog State
  const [editingUser, setEditingUser] = useState<ApprovedUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'driver' | 'user'>('driver');

  // Driver Command Dialog
  const [commandingUser, setCommandingUser] = useState<ApprovedUser | null>(null);
  const [customCommand, setCustomCommand] = useState('');

  // Confirmation Modal State (Zero browser alerts/popups)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Manual Phone Input Modal for Pending Request
  const [pendingPhoneEdit, setPendingPhoneEdit] = useState<{
    identifier: string;
    name: string;
    phone: string;
  } | null>(null);
  const [inputPhoneValue, setInputPhoneValue] = useState('');

  // Pairing code state
  const [pairingTarget, setPairingTarget] = useState<'bot' | 'driver'>('driver');
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingMethod, setPairingMethod] = useState<'code' | 'qr'>('qr');
  const [generatedPairingCode, setGeneratedPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Active Sessions
  const [sessionsData, setSessionsData] = useState<{
    bot: any;
    drivers: DriverSessionItem[];
    totalConnectedDrivers: number;
  } | null>(null);

  const isLidNumber = (p: string) => {
    if (!p) return false;
    const digits = String(p).replace(/\D/g, '');
    return digits.length >= 13 && !digits.startsWith('9725') && !digits.startsWith('97205');
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [res, sess] = await Promise.all([
        fetchUsersList(),
        fetchSessionsSummary().catch(() => null),
      ]);
      if (res) {
        setApprovedUsers(res.approvedUsers || []);
        setPendingUsers(res.pendingUsers || []);
        if (res.adminPhone) setAdminPhone(res.adminPhone);
        if (res.botPhone) setBotPhone(res.botPhone);
        if (res.cooldownHours) setCooldownHours(res.cooldownHours);
      }
      if (sess) {
        setSessionsData(sess);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle Approve + Immediate Onboarding Guide or Silent Approval
  const handleApprove = async (phone: string, name?: string, silent = false) => {
    setLoading(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      const res = await approveUserApi(phone, name, silent);
      if (res.ok) {
        setActionSuccess(
          silent
            ? `משתמש ${name || phone} אושר במצב שקט (ללא שליחת הודעה לנהג).`
            : `משתמש ${name || phone} אושר בהצלחה! נשלחה לו הודעת וואטסאפ עם מדריך חיבור מיידי.`
        );
        await loadData();
        onUserModified?.();
      } else {
        setActionError(res.error || 'שגיאה באישור המשתמש');
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // שליחה חוזרת של מדריך חיבור ואישור לוואטסאפ של המשתמש
  const handleSendOnboarding = async (phone: string, name?: string) => {
    setLoading(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      const res = await sendOnboardingGuideApi(phone, name);
      if (res.ok) {
        setActionSuccess(`הודעת אישור ומדריך חיבור ווב נשלחו בהצלחה לוואטסאפ של ${name || phone}!`);
      } else {
        setActionError(res.error || 'שגיאה בשליחת המדריך');
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // מחיקת / דחיית בקשת הצטרפות בצורה בטוחה עם מודל אישור פנימי
  const promptRejectUser = (identifier: string, name?: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'דחיית בקשת הצטרפות',
      message: `האם לדחות ולמחוק את בקשת ההצטרפות של "${name || identifier}"? הבקשה תוסר לצמיתות.`,
      confirmText: 'דחה ומחק',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await rejectUserApi(identifier);
          if (res.ok) {
            setActionSuccess(`בקשת "${name || identifier}" נמחקה בהצלחה מהמערכת.`);
            await loadData();
            onUserModified?.();
          } else {
            setActionError(res.error || 'שגיאה בדחיית הבקשה');
          }
        } catch (e: any) {
          setActionError(e.message);
        } finally {
          setConfirmLoading(false);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // מחיקת משתמש מאושר וניקוי מוחלט של כל קובצי האימות (קוקיז) וסשן הוואטסאפ
  const promptDeleteUser = (identifier: string, name?: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'הסרת נהג ומחיקת קוקיז/אימות',
      message: `האם להסיר את הנהג "${name || identifier}" מהמערכת? פעולה זו תסגור את הסשן ותמחק לצמיתות את כל קובצי האימות (קוקיז) של הנהג מהשרת.`,
      confirmText: 'מחק נהג וקוקיז',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await deleteUserApi(identifier);
          if (res.ok) {
            setActionSuccess(`המשתמש "${name || identifier}" הוסר וקובצי האימות נוקו בהצלחה.`);
            await loadData();
            onUserModified?.();
          } else {
            setActionError(res.error || 'שגיאה בהסרת המשתמש');
          }
        } catch (e: any) {
          setActionError(e.message);
        } finally {
          setConfirmLoading(false);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // ניתוק סשן וואטסאפ לנהג
  const promptDisconnectDriver = (phone: string, name?: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'ניתוק חיבור וואטסאפ לנהג',
      message: `האם לנתק את חיבור הוואטסאפ של הנהג "${name || phone}"? הנהג לא יסרוק קבוצות עד שיבצע קישור מחדש.`,
      confirmText: 'נתק סשן',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await disconnectDriverApi(phone);
          setActionSuccess(`סשן וואטסאפ של ${name || phone} נותק.`);
          await loadData();
          onUserModified?.();
        } catch (e: any) {
          setActionError(e.message);
        } finally {
          setConfirmLoading(false);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // איפוס קוקיז/תיקיות אימות של נהג - פותר תקיעות חיבורים ומאפשר חיבור מחדש
  const promptResetDriverAuth = (phone: string, name?: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'איפוס קוקיז וחיבורי וואטסאפ',
      message: `פעולה זו תמחק את כל קובצי האימות (Cookies/Tokens) של "${name || phone}" בשרת, תסגור חיבורים תקועים ותאפשר הפקת קוד צימוד חדש ונקי. להמשיך?`,
      confirmText: 'נקה קוקיז ואפס חיבור',
      variant: 'warning',
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          const res = await resetDriverAuthApi(phone);
          if (res.ok) {
            setActionSuccess(`קובצי האימות (קוקיז) של ${name || phone} אופסו בהצלחה. כעת תוכל לבקש קוד צימוד חדש!`);
            await loadData();
            onUserModified?.();
          } else {
            setActionError(res.error || 'שגיאה באיפוס קוקיז');
          }
        } catch (e: any) {
          setActionError(e.message);
        } finally {
          setConfirmLoading(false);
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // שמירת מספר טלפון שהוזן ידנית עבור בקשה ממתינה
  const handleSavePendingPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPhoneEdit || !inputPhoneValue.trim()) return;
    setLoading(true);
    setActionError(null);
    try {
      const res = await updateUserPhoneApi(pendingPhoneEdit.identifier, inputPhoneValue.trim());
      if (res.ok) {
        setActionSuccess(`מספר הטלפון עבור "${pendingPhoneEdit.name}" עודכן בהצלחה ל-${inputPhoneValue.trim()}!`);
        setPendingPhoneEdit(null);
        setInputPhoneValue('');
        await loadData();
        onUserModified?.();
      } else {
        setActionError(res.error || 'שגיאה בעדכון מספר הטלפון');
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDirect = async (e?: React.FormEvent, silent = false) => {
    if (e) e.preventDefault();
    if (!newPhone.trim()) return;
    setLoading(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      const res = await addUserApi(newPhone.trim(), newName.trim(), silent);
      if (res.ok) {
        setActionSuccess(
          silent
            ? `המשתמש ${newPhone} נוסף בהצלחה במצב שקט (ללא שליחת הודעת וואטסאפ לנהג).`
            : `המשתמש ${newPhone} נוסף בהצלחה ונשלחה אליו הדרכת חיבור!`
        );
        setNewPhone('');
        setNewName('');
        await loadData();
        onUserModified?.();
      } else {
        setActionError(res.error || 'שגיאה בהוספת המשתמש');
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Open Edit User Dialog
  const handleOpenEdit = (user: ApprovedUser) => {
    setEditingUser(user);
    setEditName(user.name || '');
    setEditPhone(user.phone || '');
    setEditRole(user.role || 'driver');
  };

  // Save Edit User
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setLoading(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      const res = await editUserDetailsApi(editingUser.phone, {
        name: editName.trim(),
        newPhone: editPhone.trim(),
        role: editRole,
      });
      if (res.ok) {
        setActionSuccess(`פרטי המשתמש עודכנו בהצלחה!`);
        setEditingUser(null);
        await loadData();
        onUserModified?.();
      } else {
        setActionError(res.error || 'שגיאה בעדכון פרטי המשתמש');
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Stop Search (תפוס) for Specific Driver
  const handleStopDriverSearch = async (userPhone: string) => {
    setLoading(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      const res = await stopSearch(userPhone);
      if (res.ok) {
        setActionSuccess(`החיפוש הופסק בהצלחה (תפוס) עבור ${userPhone}!`);
        await loadData();
        onUserModified?.();
      } else {
        setActionError(res.message || 'שגיאה בעצירת חיפוש');
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Apply Custom Search for Specific Driver
  const handleApplyDriverCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandingUser || !customCommand.trim()) return;
    setLoading(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      const res = await sendSearchCommand(customCommand.trim(), commandingUser.phone);
      if (res.ok) {
        setActionSuccess(`החיפוש הופעל בהצלחה עבור ${commandingUser.name || commandingUser.phone}!`);
        setCommandingUser(null);
        setCustomCommand('');
        await loadData();
        onUserModified?.();
      } else {
        setActionError(res.message || 'שגיאה בהפעלת חיפוש');
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      const res = await updateUsersConfigApi({ adminPhone, cooldownHours });
      if (res.ok) {
        setActionSuccess('הגדרות אבטחה ומנהל נשמרו בהצלחה בשרת!');
        await loadData();
        onUserModified?.();
      } else {
        setActionError(res.error || 'שגיאה בשמירת הגדרות');
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // פותח את לשונית החיבור על שיטת QR עבור נהג מסוים (כפתור "QR" בשורת הנהג)
  const openQrForDriver = (phone: string) => {
    setPairingTarget('driver');
    setPairingPhone(phone);
    setPairingMethod('qr');
    setActiveTab('pairing');
  };

  const handleGeneratePairingCode = async (targetOverridePhone?: string, forceReset = false) => {
    if (targetOverridePhone) {
      setPairingTarget('driver');
      setPairingPhone(targetOverridePhone);
      setPairingMethod('code');
    }
    setPairingLoading(true);
    setActionError(null);
    setGeneratedPairingCode(null);
    try {
      const isBot = !targetOverridePhone && pairingTarget === 'bot';
      const targetNum = targetOverridePhone || (isBot ? botPhone : (pairingPhone || adminPhone));
      const res = await requestPairingCodeApi(targetNum, isBot, forceReset);
      if (res.ok && res.code) {
        setGeneratedPairingCode(res.code);
        setActionSuccess(`נוצר קוד צימוד עבור ${isBot ? 'הבוט הראשי (' + botPhone + ')' : targetNum}: ${res.code}`);
        setActiveTab('pairing');
      } else {
        setActionError(res.error || 'לא ניתן להפיק קוד חיבור. ודא שהבוט פועל.');
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setPairingLoading(false);
    }
  };

  const copyCode = () => {
    if (!generatedPairingCode) return;
    navigator.clipboard.writeText(generatedPairingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const filteredApproved = approvedUsers.filter((u) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      (u.name || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q) ||
      (u.searchState?.displayText || '').toLowerCase().includes(q)
    );
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" 
      dir="rtl"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl bg-[#0e141e] border border-[#233348] rounded-2xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-[#1c293a] bg-[#121926]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                פאנל ניהול נהגים, ריבוי וואטסאפ ומורשים
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Multi-Session
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                עריכת פרטי משתמשים, ביטול והפעלת חיפושים, הפקת קודי צימוד וסנכרון מיידי
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#1c293a] bg-[#0c121c] px-2 sm:px-4 pt-2 gap-1 overflow-x-auto text-xs no-scrollbar">
          <button
            onClick={() => setActiveTab('approved')}
            className={`px-3 py-2 font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'approved'
                ? 'bg-[#0e141e] text-emerald-400 border-t-2 border-emerald-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            ניהול נהגים ({approvedUsers.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-2 font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 relative ${
              activeTab === 'pending'
                ? 'bg-[#0e141e] text-amber-400 border-t-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            בקשות ממתינות ({pendingUsers.length})
            {pendingUsers.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute -top-0.5 right-1" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('pairing')}
            className={`px-3 py-2 font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'pairing'
                ? 'bg-[#0e141e] text-teal-400 border-t-2 border-teal-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            חיבור וואטסאפ: סריקת QR / קוד צימוד
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-3 py-2 font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'sessions'
                ? 'bg-[#0e141e] text-purple-400 border-t-2 border-purple-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            סשנים מחוברים ({sessionsData?.totalConnectedDrivers ?? 0})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-2 font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'settings'
                ? 'bg-[#0e141e] text-blue-400 border-t-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            הגדרות ואבטחה
          </button>
        </div>

        {/* Notifications */}
        {actionSuccess && (
          <div className="mx-3 sm:mx-4 mt-2.5 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}
        {actionError && (
          <div className="mx-3 sm:mx-4 mt-2.5 p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: APPROVED DRIVERS & USERS PANEL */}
        {/* ========================================================= */}
        {activeTab === 'approved' && (
          <div className="p-3 sm:p-5 space-y-4 overflow-y-auto text-xs">
            {/* Top Toolbar: Search + Quick Add */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="חיפוש נהג לפי שם, טלפון או יעד חיפוש..."
                  className="w-full pr-8 pl-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-teal-400 font-sans"
                />
              </div>

              {/* Add Driver inline */}
              <form onSubmit={(e) => handleAddDirect(e, false)} className="flex flex-wrap items-center gap-1.5 shrink-0">
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  required
                  className="w-28 sm:w-32 px-2.5 py-1.5 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs placeholder:text-slate-500 font-mono focus:outline-none focus:border-emerald-400"
                />
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="שם הנהג"
                  className="w-24 sm:w-28 px-2.5 py-1.5 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0 transition-colors shadow-sm"
                  title="הוסף נהג מאושר ישירות ושלח לו הודעת אישור והדרכה לוואטסאפ"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>הוסף עם הדרכה</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddDirect(undefined, true)}
                  disabled={loading}
                  className="px-2.5 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-teal-300 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                  title="הוסף נהג מאושר ישירות בשקט ללא שליחת שום הודעה לוואטסאפ שלו"
                >
                  <BellOff className="w-3.5 h-3.5 text-teal-400" />
                  <span>הוסף שקט (ללא הודעה)</span>
                </button>
              </form>
            </div>

            {/* Drivers Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredApproved.length === 0 ? (
                <div className="col-span-full p-8 text-center rounded-xl border border-dashed border-[#233348] text-slate-500">
                  לא נמצאו נהגים התואמים את החיפוש.
                </div>
              ) : (
                filteredApproved.map((user) => {
                  const isLid = isLidNumber(user.phone);
                  const isConnected = user.connectionStatus === 'connected';
                  const hasActiveSearch = Boolean(user.searchState?.active);

                  return (
                    <div
                      key={user.phone}
                      className="p-3.5 rounded-xl bg-[#0a0f17] border border-[#1c2838] hover:border-[#2d3f56] transition-all space-y-3 shadow-md flex flex-col justify-between"
                    >
                      {/* Top Row: Name + Roles */}
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white text-sm">{user.name || 'נהג'}</span>
                              {user.role === 'admin' ? (
                                <span className="text-[10px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 font-bold">
                                  👑 מנהל ראשי
                                </span>
                              ) : (
                                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                  🚕 נהג מורשה
                                </span>
                              )}
                              {isLid && (
                                <span className="text-[10px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                                  ⚠️ מזהה LID
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-slate-400 font-mono text-xs">
                              <span>{user.phone}</span>
                            </div>
                          </div>

                          {/* WhatsApp Connection Indicator */}
                          <div className="shrink-0">
                            {isConnected ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                וואטסאפ מחובר
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                וואטסאפ מנותק
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle: Active Search Status */}
                        <div className="mt-2.5 p-2 rounded-lg bg-[#06090e] border border-[#16202c] flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-slate-400 text-[11px]">חיפוש:</span>
                            {hasActiveSearch ? (
                              <span className="text-amber-300 font-bold truncate">
                                🔍 {user.searchState?.displayText}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">מצב שינה (תפוס)</span>
                            )}
                          </div>

                          {/* Quick stop search button if active */}
                          {hasActiveSearch && (
                            <button
                              type="button"
                              onClick={() => handleStopDriverSearch(user.phone)}
                              className="text-[10px] text-rose-400 hover:text-rose-300 px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 cursor-pointer shrink-0"
                              title="עצור חיפוש לנהג זה"
                            >
                              בטל חיפוש
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Bottom Row: Actions Bar */}
                      <div className="pt-2 border-t border-[#16202c] flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1 flex-wrap">
                          {/* Edit User Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(user)}
                            className="px-2 py-1 rounded-lg bg-[#141d29] hover:bg-[#1a2636] border border-[#233348] text-slate-300 hover:text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                            title="ערוך שם ומספר טלפון לתצוגה"
                          >
                            <Edit3 className="w-3 h-3 text-amber-400" />
                            ערוך פרטים
                          </button>

                          {/* Set Custom Search */}
                          <button
                            type="button"
                            onClick={() => {
                              setCommandingUser(user);
                              setCustomCommand('');
                            }}
                            className="px-2 py-1 rounded-lg bg-[#141d29] hover:bg-[#1a2636] border border-[#233348] text-slate-300 hover:text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                            title="הגדר חיפוש נסיעות ספציפי לנהג זה"
                          >
                            <Search className="w-3 h-3 text-teal-400" />
                            הפעל חיפוש
                          </button>

                          {/* Connect via live QR (scan from the computer screen) */}
                          <button
                            type="button"
                            onClick={() => openQrForDriver(user.phone)}
                            className="px-2 py-1 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-teal-200 hover:text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            title="חבר את הוואטסאפ של הנהג בסריקת קוד QR מהמסך"
                          >
                            <QrCode className="w-3 h-3 text-teal-300" />
                            חיבור QR
                          </button>

                          {/* Generate Pairing Code */}
                          <button
                            type="button"
                            onClick={() => handleGeneratePairingCode(user.phone, false)}
                            disabled={pairingLoading}
                            className="px-2 py-1 rounded-lg bg-[#141d29] hover:bg-[#1a2636] border border-[#233348] text-teal-300 hover:text-teal-200 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                            title="הפק קוד צימוד לוואטסאפ של נהג זה"
                          >
                            <KeyRound className="w-3 h-3 text-teal-400" />
                            קוד צימוד
                          </button>

                          {/* Send Onboarding Guide Button */}
                          <button
                            type="button"
                            onClick={() => handleSendOnboarding(user.phone, user.name)}
                            disabled={loading}
                            className="px-2 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-blue-200 hover:text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                            title="שלח הודעת אישור ומדריך חיבור ווב ישירות לוואטסאפ של הנהג"
                          >
                            <Send className="w-3 h-3 text-blue-400" />
                            שלח מדריך וחיבור
                          </button>

                          {/* Reset Auth Cookies Button */}
                          <button
                            type="button"
                            onClick={() => promptResetDriverAuth(user.phone, user.name)}
                            className="px-2 py-1 rounded-lg bg-[#141d29] hover:bg-amber-500/10 border border-[#233348] hover:border-amber-500/30 text-slate-400 hover:text-amber-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                            title="מחק קוקיז ואפס סשן תקוע של נהג זה"
                          >
                            <RefreshCw className="w-3 h-3 text-amber-400" />
                            איפוס קוקיז
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Disconnect driver session if connected */}
                          {isConnected && (
                            <button
                              type="button"
                              onClick={() => promptDisconnectDriver(user.phone, user.name)}
                              className="p-1 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                              title="נתק סשן וואטסאפ"
                            >
                              <Unplug className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete user */}
                          {user.role !== 'admin' && (
                            <button
                              type="button"
                              onClick={() => promptDeleteUser(user.id || user.phone, user.name)}
                              className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="הסר משתמש ומחק את כל קובצי האימות מהשרת"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: PENDING APPROVALS */}
        {/* ========================================================= */}
        {activeTab === 'pending' && (
          <div className="p-3 sm:p-5 space-y-4 overflow-y-auto text-xs">
            <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs leading-relaxed flex items-start gap-2.5">
              <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <strong>אישור לקוחות חדשים + הדרכת חיבור אוטומטית:</strong>
                <br />
                ברגע שאתה לוחץ <strong>"אשר"</strong>, הבוט שולח לנהג הודעת וואטסאפ רשמית מיידית המאשרת את הצטרפותו ומדריכה אותו להשיב <strong>"חבר אותי"</strong> כדי לסנכרן את הוואטסאפ ווב שלו ללא צורך במחשב!
              </div>
            </div>

            {pendingUsers.length === 0 ? (
              <div className="p-12 text-center rounded-xl border border-dashed border-[#233348] text-slate-500">
                אין כרגע בקשות הצטרפות ממתינות. כל הנהגים טופלו!
              </div>
            ) : (
              <div className="rounded-xl border border-[#1e2a3b] bg-[#070a0f] divide-y divide-[#131b26]">
                {pendingUsers.map((user, idx) => {
                  const isLid = isLidNumber(user.phone) || Boolean(user.lid);
                  const effectivePhone = user.mappedPhone || (!isLid && user.phone && user.phone !== 'ללא מספר' ? user.phone : null);
                  const userIdentifier = user.id || user.phone || user.lid || String(idx);

                  return (
                    <div key={userIdentifier} className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0a0f17] rounded-xl border border-[#1b2738] mb-2">
                      <div className="space-y-1.5 flex-1">
                        <div className="font-bold text-white text-sm flex items-center gap-2 flex-wrap">
                          <span>{user.name || 'משתמש חדש'}</span>
                          {effectivePhone ? (
                            <span className="font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-xs border border-emerald-500/30 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {effectivePhone}
                            </span>
                          ) : (
                            <span className="font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-xs border border-amber-500/30">
                              {user.phone || 'ללא מספר'}
                            </span>
                          )}
                          {isLid && (
                            <span className="text-[10px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                              מזהה חסוי (Meta LID)
                            </span>
                          )}
                        </div>

                        {/* Phone status & manual input button */}
                        <div className="flex items-center gap-2 flex-wrap text-[11px]">
                          {effectivePhone ? (
                            <span className="text-emerald-400/90 font-medium">
                              ✅ מספר טלפון מאומת ומסונכרן (מוכן לקישור והדרכה)
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-amber-400/90">
                                ⚠️ טרם התקבל מספר סלולרי רגיל מוואטסאפ
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingPhoneEdit({
                                    identifier: userIdentifier,
                                    name: user.name || 'משתמש חדש',
                                    phone: '',
                                  });
                                  setInputPhoneValue('');
                                }}
                                className="px-2 py-0.5 rounded bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Edit3 className="w-3 h-3" />
                                הזן מספר טלפון
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-500">
                          הוגשה בתאריך: {user.requestedAt ? new Date(user.requestedAt).toLocaleString('he-IL') : 'זה עתה'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => handleApprove(effectivePhone || user.phone, user.name, false)}
                          disabled={loading}
                          className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-md"
                          title="אשר ושלח לנהג הודעת אישור והדרכת חיבור לוואטסאפ"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          אשר ושלח הדרכה
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(effectivePhone || user.phone, user.name, true)}
                          disabled={loading}
                          className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          title="אשר את הנהג במערכת בשקט, ללא שליחת שום הודעה לוואטסאפ של הנהג"
                        >
                          <BellOff className="w-3.5 h-3.5 text-teal-400" />
                          אשר שקט (ללא הודעה)
                        </button>
                        <button
                          type="button"
                          onClick={() => promptRejectUser(userIdentifier, user.name)}
                          disabled={loading}
                          className="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          title="דחה ומחק בקשה זו"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          דחה ומחק
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: PAIRING CODE GENERATOR */}
        {/* ========================================================= */}
        {activeTab === 'pairing' && (
          <div className="p-3 sm:p-5 space-y-4 overflow-y-auto text-xs">
            <div className="p-3.5 rounded-xl bg-teal-950/20 border border-teal-500/30 text-teal-300 text-xs leading-relaxed">
              <strong>🔗 הפקת קוד צימוד לוואטסאפ (Pairing Code):</strong>
              <br />
              הבוט המרכזי (0555081810) נשאר מחובר תמיד. בנוסף, כל נהג מקשר את הוואטסאפ שלו ללא ניתוק הבוט, כדי שהשרת יסרוק עבורו את הקבוצות הפרטיות שלו!
            </div>

            {/* Target Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPairingTarget('driver')}
                className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                  pairingTarget === 'driver'
                    ? 'bg-teal-500/15 border-teal-500/50 text-white shadow-inner'
                    : 'bg-[#080c13] border-[#1d293a] text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-bold flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-teal-400" />
                  וואטסאפ של נהג מורשה (Multi-Session)
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  חיבור חשבון נהג לסריקת קבוצות הנסיעות שלו במקביל לבוט
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPairingTarget('bot')}
                className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                  pairingTarget === 'bot'
                    ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-inner'
                    : 'bg-[#080c13] border-[#1d293a] text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-bold flex items-center gap-2">
                  <Bot className="w-4 h-4 text-amber-400" />
                  הבוט המרכזי ({botPhone})
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  חיבור ראשוני של חשבון הבוט המרכזי (Dispatcher)
                </div>
              </button>
            </div>

            {/* Phone Input & Generate */}
            <div className="p-4 rounded-xl bg-[#090e15] border border-[#1b2636] space-y-3">
              {pairingTarget === 'driver' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPairingMethod('code')}
                      className={`py-2 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                        pairingMethod === 'code'
                          ? 'bg-teal-500/20 border-teal-500/50 text-white'
                          : 'bg-[#080c13] border-[#1d293a] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      📱 קוד צימוד (Pairing Code)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPairingMethod('qr')}
                      className={`py-2 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                        pairingMethod === 'qr'
                          ? 'bg-teal-500/20 border-teal-500/50 text-white'
                          : 'bg-[#080c13] border-[#1d293a] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      📷 סריקת קוד QR
                    </button>
                  </div>
                  <label className="text-slate-300 font-bold block">מספר הטלפון של הנהג לחיבור:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pairingPhone}
                      onChange={(e) => setPairingPhone(e.target.value)}
                      placeholder="למשל: 0515157166 או בחר מרשימת הנהגים"
                      className="flex-1 px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-teal-400 font-mono"
                    />
                    {pairingMethod === 'code' && (
                      <button
                        type="button"
                        onClick={() => handleGeneratePairingCode()}
                        disabled={pairingLoading}
                        className="px-4 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${pairingLoading ? 'animate-spin' : ''}`} />
                        הפק קוד צימוד
                      </button>
                    )}
                  </div>
                  {pairingMethod === 'qr' && (
                    <DriverQrPanel
                      phone={pairingPhone || adminPhone}
                      onConnected={() => setActionSuccess('הוואטסאפ של הנהג חובר בהצלחה דרך QR!')}
                    />
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="text-slate-300 text-xs">
                    חיבור הבוט הראשי במספר: <strong className="font-mono text-amber-400">{botPhone}</strong>
                  </div>
                  {pairingMethod === 'code' ? (
                    <button
                      type="button"
                      onClick={() => handleGeneratePairingCode()}
                      disabled={pairingLoading}
                      className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-md"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${pairingLoading ? 'animate-spin' : ''}`} />
                      הפק קוד לבוט הראשי
                    </button>
                  ) : (
                    <DriverQrPanel
                      phone={botPhone}
                      onConnected={() => setActionSuccess('הבוט המרכזי חובר בהצלחה דרך QR!')}
                    />
                  )}
                </div>
              )}

              {generatedPairingCode && (pairingTarget === 'bot' || pairingMethod === 'code') && (
                <div className="p-4 rounded-xl bg-teal-950/40 border border-teal-500/40 text-center space-y-2 mt-3 animate-in fade-in">
                  <span className="text-xs text-teal-300 block font-bold">קוד הצימוד (הזן בוואטסאפ במכשירים מקושרים):</span>
                  <div className="text-2xl font-mono font-black text-amber-300 tracking-widest bg-black/60 py-2.5 px-6 rounded-lg inline-block border border-amber-500/40 shadow-lg">
                    {generatedPairingCode}
                  </div>
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={copyCode}
                      className="px-3.5 py-1.5 rounded-lg bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-teal-500/30 transition-colors"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedCode ? 'הקוד הועתק!' : 'העתק קוד'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Instruction Steps */}
            <div className="rounded-xl border border-[#1a2534] bg-[#070b10] p-4 space-y-2 text-slate-300">
              <span className="font-bold text-white block">מדריך הזנה בטלפון הנהג (תוך 10 שניות):</span>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 text-xs leading-relaxed">
                <li>פתח את הוואטסאפ בטלפון ⬅️ <strong>הגדרות</strong> ⬅️ <strong>מכשירים מקושרים</strong>.</li>
                <li>לחץ על <strong>קישור מכשיר</strong>.</li>
                <li>בתחתית המסך לחץ: <strong>"קישור עם מספר טלפון במקום"</strong>.</li>
                <li>הזן את הקוד שקיבלת למעלה.</li>
              </ol>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: CONNECTED SESSIONS OVERVIEW */}
        {/* ========================================================= */}
        {activeTab === 'sessions' && (
          <div className="p-3 sm:p-5 space-y-4 overflow-y-auto text-xs">
            <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 text-purple-300 text-xs leading-relaxed">
              <strong>📻 סטטוס סשנים פעילים (ריבוי וואטסאפ):</strong>
              <br />
              השרת מנהל את הבוט המרכזי וכן את חשבונות כל הנהגים המחוברים שמסננים נסיעות מקבוצותיהם ללא ניתוק הדדי.
            </div>

            {/* Bot status */}
            <div className="p-3.5 rounded-xl bg-[#090e15] border border-[#1b2636] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    <span>בוט מרכזי (Dispatcher)</span>
                    <span className="font-mono text-slate-400 text-[11px]">{botPhone}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    נשאר מחובר תמיד, מקבל פקודות ומפיק קודי צימוד לנהגים
                  </div>
                </div>
              </div>
              <div>
                {sessionsData?.bot?.connected ? (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                    🟢 מחובר
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold">
                    🔴 מנותק
                  </span>
                )}
              </div>
            </div>

            {/* Drivers Sessions List */}
            <div className="space-y-2">
              <span className="font-bold text-slate-300 block text-xs">חשבונות נהגים מקושרים (Driver Sessions):</span>
              {(!sessionsData?.drivers || sessionsData.drivers.length === 0) ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-[#233348] text-slate-500">
                  אין כרגע חשבונות נהגים מקושרים. נהג יכול להתחבר בלשונית "קישור מכשיר" או בשליחת "חבר אותי" לבוט.
                </div>
              ) : (
                <div className="rounded-xl border border-[#1e2a3b] bg-[#070a0f] divide-y divide-[#131b26]">
                  {sessionsData.drivers.map((drv, idx) => (
                    <div key={idx} className="p-3 sm:px-4 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Smartphone className="w-4 h-4 text-teal-400" />
                        <div>
                          <div className="font-bold text-white font-mono text-xs">{drv.phone}</div>
                          <div className="text-[10px] text-slate-500">
                            {drv.connectedAt ? `חובר: ${new Date(drv.connectedAt).toLocaleString('he-IL')}` : 'סשן פעיל'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {drv.status === 'connected' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            🟢 מחובר ומסנן
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            ⏳ ממתין לצימוד
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => promptResetDriverAuth(drv.phone)}
                          className="p-1 rounded text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                          title="מחק קוקיז ואפס סשן נהג"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => promptDisconnectDriver(drv.phone)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="נתק סשן נהג"
                        >
                          <Unplug className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: ADMIN & ANTI-LOOP SETTINGS */}
        {/* ========================================================= */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="p-3 sm:p-5 space-y-4 overflow-y-auto text-xs">
            <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/30 text-blue-300 text-xs leading-relaxed">
              <strong>🛡️ הגנת ספאם (Anti-Loop):</strong>
              <br />
              הבוט שולח למנהל הודעה מסודרת אחת בלבד בכל בקשת הצטרפות. אם הנהג מוסר טלפון נשלחת הודעת עדכון אחת. בנוסף, מנגנון צינון קפדני מונע לולאות הודעות חוזרות.
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-300 font-bold block mb-1">טלפון מנהל ראשי (Admin Phone):</label>
                <input
                  type="text"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  placeholder="972515157166"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs font-mono focus:outline-none focus:border-blue-400"
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  למספר זה מגיעות בקשות ההצטרפות (הודעה אחת ומסודרת לכל נהג)
                </span>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">טלפון הבוט המרכזי (Bot Phone):</label>
                <input
                  type="text"
                  value={botPhone}
                  onChange={(e) => setBotPhone(e.target.value)}
                  placeholder="972555081810"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs font-mono focus:outline-none focus:border-blue-400"
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  מספר הבוט שנשאר מחובר תמיד ואינו סורק קבוצות בעצמו
                </span>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">זמן צינון למספרים לא מאושרים (שעות):</label>
                <input
                  type="number"
                  min={1}
                  max={72}
                  value={cooldownHours}
                  onChange={(e) => setCooldownHours(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white text-xs font-mono focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                שמור הגדרות מנהל
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="p-3.5 border-t border-[#1c293a] bg-[#121926] flex justify-between items-center text-xs">
          <span className="text-[11px] text-slate-400">
            האישורים וההגדרות נשמרים ישירות בקבצי השרת (users.json)
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-teal-400 text-slate-950 hover:bg-teal-300 transition-colors cursor-pointer"
          >
            סגור
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* EDIT USER POPUP MODAL */}
      {/* ========================================================= */}
      {editingUser && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm animate-in fade-in" 
          dir="rtl"
          onClick={() => setEditingUser(null)}
        >
          <div 
            className="w-full max-w-md bg-[#101724] border border-[#233348] rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1c293a]">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">עריכת פרטי נהג</h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1">שם הנהג / כינוי:</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="למשל: מוישי ב"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">מספר טלפון לתצוגה ולחיבור:</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white font-mono focus:outline-none focus:border-amber-400"
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  החלפה ממזהה LID או שינוי מספר ישירות
                </span>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">תפקיד במערכת:</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  <option value="driver">נהג מורשה</option>
                  <option value="admin">מנהל ראשי</option>
                  <option value="user">משתמש רגיל</option>
                </select>
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer transition-colors"
                >
                  שמור שינויים
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SET CUSTOM SEARCH FOR DRIVER POPUP MODAL */}
      {/* ========================================================= */}
      {commandingUser && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm animate-in fade-in" 
          dir="rtl"
          onClick={() => setCommandingUser(null)}
        >
          <div 
            className="w-full max-w-md bg-[#101724] border border-[#233348] rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1c293a]">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-teal-400" />
                <h3 className="font-bold text-white text-sm">
                  הפעלת חיפוש עבור {commandingUser.name || commandingUser.phone}
                </h3>
              </div>
              <button
                onClick={() => setCommandingUser(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyDriverCommand} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1">הזן פקודת חיפוש (למשל: "פנוי שמש פנימי", "פ ים שמש", "שמש צמצם"):</label>
                <input
                  type="text"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  placeholder='למשל: פנוי שמש פנימי'
                  required
                  className="w-full px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white focus:outline-none focus:border-teal-400"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {['שמש פנימי', 'פנימי ים', 'פ ים שמש', 'שמש צמצם'].map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => setCustomCommand(`פנוי ${cmd}`)}
                    className="px-2 py-1 rounded bg-[#0a0f18] border border-[#233348] text-teal-300 hover:border-teal-400 text-[10px] cursor-pointer"
                  >
                    פנוי {cmd}
                  </button>
                ))}
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setCommandingUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={loading || !customCommand.trim()}
                  className="px-5 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 text-xs font-bold cursor-pointer transition-colors"
                >
                  הפעל חיפוש
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ========================================================= */}
      {/* MANUAL PHONE INPUT MODAL FOR PENDING USER */}
      {/* ========================================================= */}
      {pendingPhoneEdit && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm animate-in fade-in" 
          dir="rtl"
          onClick={() => setPendingPhoneEdit(null)}
        >
          <div 
            className="w-full max-w-md bg-[#101724] border border-[#233348] rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1c293a]">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-white text-sm">
                  הזנת מספר טלפון עבור {pendingPhoneEdit.name}
                </h3>
              </div>
              <button
                onClick={() => setPendingPhoneEdit(null)}
                className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePendingPhone} className="space-y-3 text-xs">
              <p className="text-slate-400 leading-relaxed text-[11px]">
                המשתמש שלח פנייה ממזהה חסוי (LID). הזן כאן את מספר הטלפון הסלולרי שלו כדי שהמערכת תוכל להפיק עבורו קוד צימוד ולשלוח לו הדרכה בוואטסאפ:
              </p>
              <div>
                <label className="text-slate-300 font-bold block mb-1">מספר טלפון סלולרי:</label>
                <input
                  type="text"
                  value={inputPhoneValue}
                  onChange={(e) => setInputPhoneValue(e.target.value)}
                  placeholder="05XXXXXXXX"
                  required
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl bg-[#080c13] border border-[#223044] text-white font-mono focus:outline-none focus:border-emerald-400 text-sm"
                />
              </div>

              <div className="pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setPendingPhoneEdit(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={loading || !inputPhoneValue.trim()}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer transition-colors"
                >
                  שמור מספר טלפון
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL (Replaces all window.confirm) */}
      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        variant={confirmDialog.variant}
        loading={confirmLoading}
        onConfirm={() => confirmDialog.onConfirm()}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
