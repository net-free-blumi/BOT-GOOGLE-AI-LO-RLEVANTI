import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Radio,
  Navigation,
  Compass,
  MapPin,
  Car,
  Clock,
  Volume2,
  VolumeX,
  Filter,
  CheckCircle2,
  Sparkles,
  Phone,
  RefreshCw,
  LocateFixed,
  AlertCircle,
  Maximize2,
  Minimize2,
  BellRing,
  ArrowDownRight,
  ShieldCheck,
  ChevronLeft,
  MessageCircle,
  Copy,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { LiveRideItem, DriverGeoLocation } from '../types.ts';
import { fetchLiveRidesApi, claimRideApi, simulateRideApi } from '../services/api.ts';
import {
  BEIT_SHEMESH_ZONES,
  detectNeighborhood,
  calculateDistanceKm,
  generateWazeUrl,
  getProximityBadge,
  parseRideRoute,
  extractDispatcherPhone,
  getCleanWhatsAppLink,
} from '../services/geoService.ts';

// עוזר להפיכת טקסט וקישורים פעילים (wa.me, t.me, https, קישורי דרייבוט) ללחיצים
function renderClickableText(content: string) {
  if (!content) return null;
  const urlRegex = /(https?:\/\/[^\s]+|wa\.me\/[^\s]+|t\.me\/[^\s]+|drivebot\.co\.il[^\s]*)/gi;
  const parts = content.split(urlRegex);

  return parts.map((part, idx) => {
    if (!part) return null;
    const isUrl = /(https?:\/\/[^\s]+|wa\.me\/[^\s]+|t\.me\/[^\s]+|drivebot\.co\.il[^\s]*)/i.test(part);

    if (isUrl) {
      const href = part.startsWith('http://') || part.startsWith('https://')
        ? part
        : `https://${part}`;
      return (
        <a
          key={idx}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-300 hover:text-emerald-100 underline font-black break-all bg-emerald-500/25 px-2 py-0.5 rounded mx-1 inline-block shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

interface DriverRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDriverPhone?: string;
  driverName?: string;
}

export function DriverRadarModal({
  isOpen,
  onClose,
  selectedDriverPhone,
  driverName = 'נהג',
}: DriverRadarModalProps) {
  // Current driver location (defaults to Rama D in Beit Shemesh)
  const [driverLocation, setDriverLocation] = useState<DriverGeoLocation>(() => {
    const saved = localStorage.getItem('rides_driver_gps');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    const defaultZone = BEIT_SHEMESH_ZONES['רמה ד'];
    return {
      lat: defaultZone.lat,
      lng: defaultZone.lng,
      label: defaultZone.name,
      neighborhood: 'רמה ד',
      source: 'manual',
      updatedAt: Date.now(),
    };
  });

  const [rides, setRides] = useState<LiveRideItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedSuccessId, setClaimedSuccessId] = useState<string | null>(null);
  const [maxDistanceFilter, setMaxDistanceFilter] = useState<number>(0); // 0 = all
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [alertVolume, setAlertVolume] = useState<number>(() => {
    const saved = localStorage.getItem('rides_radar_volume');
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
    }
    return 0.85; // ווליום ברירת מחדל חזק וברור
  });
  const [selectedRideForDetails, setSelectedRideForDetails] = useState<LiveRideItem | null>(null);
  const [isGettingGps, setIsGettingGps] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [simulating, setSimulating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Cockpit Mode (True Fullscreen, distraction-free, 2-3 big cards)
  const [isCockpitMode, setIsCockpitMode] = useState<boolean>(false);

  // למניעת החמצת צלצול כשיש 20 נסיעות - מעקב מזהים ייחודי
  const seenRideIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef<boolean>(true);
  const prevRidesCountRef = useRef<number>(0);
  const pollIntervalRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // שחרור הגבלת אודיו בדפדפנים בכל נגיעה ראשונה במסך (Auto-unlock browser AudioContext)
  useEffect(() => {
    const unlockAudio = () => {
      try {
        if (!audioCtxRef.current) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) audioCtxRef.current = new AudioCtx();
        }
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }
      } catch (e) {}
    };

    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // עדכון שעון שניות וזמן יחסי חי בכל שנייה
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setNowMs(now.getTime());
      setCurrentTimeStr(
        now.toLocaleTimeString('he-IL', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // צלצול התראה חזק, בולט ועוצמתי ברגע שנכנסת נסיעה חדשה עם שליטה על עוצמת שמע
  const playLoudChime = (overrideVol?: number) => {
    if (!soundEnabled) return;
    const vol = overrideVol !== undefined ? overrideVol : alertVolume;
    if (vol <= 0) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'triangle'; // גל משולש חד, צורם ומעורר (חודר רעש מנוע ורדיו)
      osc2.type = 'sine';

      // דינג ראשון: 784Hz + 1174Hz
      osc1.frequency.setValueAtTime(784, now);
      osc2.frequency.setValueAtTime(1174.66, now);

      // דינג שני מודגש: 1046.5Hz + 1568Hz ב-+130ms
      osc1.frequency.setValueAtTime(1046.5, now + 0.13);
      osc2.frequency.setValueAtTime(1567.98, now + 0.13);

      // ווליום מתואם עם מחוון העוצמה של הנהג
      gain.gain.setValueAtTime(vol * 0.95, now);
      gain.gain.setValueAtTime(vol, now + 0.13);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.7);
      osc2.stop(now + 0.7);
    } catch (e) {}
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Toggle true device fullscreen mode for Cockpit
  const toggleCockpitFullscreen = () => {
    if (!isCockpitMode) {
      setIsCockpitMode(true);
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch (e) {}
      showToast('🚀 מצב קוקפיט נהג הופעל: מסך מלא ונסיעות בגדול!');
    } else {
      setIsCockpitMode(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (e) {}
      showToast('יציאה ממצב קוקפיט לתצוגה רגילה');
    }
  };

  // פונקציית עזר להצגת זמן יחסי ענקקק וחי (שניות ודקות) ממתי הנסיעה שודרה
  const getRelativeTimeDisplay = (rideTimestamp: number | undefined, currentMs: number) => {
    if (!rideTimestamp) {
      return {
        badgeText: '⚡ עכשיו ממש!',
        isFresh: true,
        styleClass: 'bg-emerald-500 text-slate-950 font-black border-2 border-emerald-300 animate-pulse shadow-[0_0_20px_rgba(52,211,153,0.7)]',
      };
    }
    const diffSec = Math.max(0, Math.floor((currentMs - rideTimestamp) / 1000));
    if (diffSec < 15) {
      return {
        badgeText: '⚡ עכשיו ממש!',
        isFresh: true,
        styleClass: 'bg-emerald-500 text-slate-950 font-black border-2 border-emerald-200 animate-pulse shadow-[0_0_25px_rgba(52,211,153,0.8)]',
      };
    }
    if (diffSec < 60) {
      return {
        badgeText: `⚡ לפני ${diffSec} שניות`,
        isFresh: true,
        styleClass: 'bg-emerald-500/30 border-2 border-emerald-400 text-emerald-200 font-black shadow-[0_0_15px_rgba(52,211,153,0.3)]',
      };
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin === 1) {
      const remainingSec = diffSec % 60;
      return {
        badgeText: `⏱️ לפני דקה ו-${remainingSec} שנ'`,
        isFresh: false,
        styleClass: 'bg-amber-500/25 border-2 border-amber-400 text-amber-200 font-black',
      };
    }
    if (diffMin < 60) {
      return {
        badgeText: `⏱️ לפני ${diffMin} דקות`,
        isFresh: false,
        styleClass: 'bg-slate-800/90 border-2 border-slate-700 text-slate-100 font-bold',
      };
    }
    const diffHours = Math.floor(diffMin / 60);
    return {
      badgeText: `לפני ${diffHours} שעות`,
      isFresh: false,
      styleClass: 'bg-slate-900 border border-slate-800 text-slate-400',
    };
  };

  // טעינת נסיעות חיות מהשרת עם מנגנון צלצול אמין 100% לפי מזהה ייחודי
  const loadRides = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetchLiveRidesApi(selectedDriverPhone);
      if (res && res.ok && Array.isArray(res.rides)) {
        const incoming = res.rides;

        // בדיקה האם הגיעה נסיעה חדשה שטרם ראינו
        if (isFirstLoadRef.current) {
          // בטעינה ראשונה שומרים את כל המזהים ללא צפצוף
          incoming.forEach((r) => seenRideIdsRef.current.add(r.id));
          isFirstLoadRef.current = false;
        } else {
          let hasBrandNewRide = false;
          for (const s of incoming) {
            if (!seenRideIdsRef.current.has(s.id)) {
              hasBrandNewRide = true;
              seenRideIdsRef.current.add(s.id);
            }
          }
          if (hasBrandNewRide) {
            playLoudChime();
          }
        }

        setRides((prev) => {
          // מפת מזהים למניעת כפילויות
          const map = new Map<string, LiveRideItem>();
          
          // שומרים נסיעות קודמות (כולל הדגמות אם היו)
          prev.forEach((r) => map.set(r.id, r));
          
          // מוסיפים / מעדכנים את הנסיעות החדשות שהגיעו מהקבוצות
          incoming.forEach((s) => {
            map.set(s.id, s);
          });

          const merged = Array.from(map.values());

          // מיון קפדני: הנסיעה האחרונה שנשלחה (הכי עדכנית) תמיד ראשונה בראש הרשימה!
          merged.sort((a, b) => {
            const timeA = a.createdAt || a.timestamp || 0;
            const timeB = b.createdAt || b.timestamp || 0;
            return timeB - timeA;
          });

          return merged;
        });

        prevRidesCountRef.current = res.rides.length;
      }
    } catch (e) {
      // Handled gracefully in api layer
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Poll live rides rapidly (every 1.2s) while modal is open
  useEffect(() => {
    if (isOpen) {
      loadRides(true);
      pollIntervalRef.current = setInterval(() => {
        loadRides(false);
      }, 1200);
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, selectedDriverPhone]);

  // Request browser GPS
  const handleRequestDeviceGps = () => {
    if (!navigator.geolocation) {
      setGpsError('מכשירך אינו תומך ב-GPS בדפדפן');
      return;
    }
    setIsGettingGps(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsGettingGps(false);
        const { latitude, longitude } = pos.coords;
        const newLoc: DriverGeoLocation = {
          lat: latitude,
          lng: longitude,
          label: 'מיקום GPS מדויק',
          source: 'gps',
          updatedAt: Date.now(),
        };
        setDriverLocation(newLoc);
        localStorage.setItem('rides_driver_gps', JSON.stringify(newLoc));
        showToast('📍 מיקום ה-GPS עודכן בדיוק מירבי!');
      },
      (err) => {
        setIsGettingGps(false);
        setGpsError('לא אושרה גישה למיקום. בחר שכונה ידנית ברשימה.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  };

  // Select predefined neighborhood
  const handleSelectZone = (zoneKey: string) => {
    const zone = BEIT_SHEMESH_ZONES[zoneKey];
    if (!zone) return;
    const newLoc: DriverGeoLocation = {
      lat: zone.lat,
      lng: zone.lng,
      label: zone.name,
      neighborhood: zoneKey,
      source: 'manual',
      updatedAt: Date.now(),
    };
    setDriverLocation(newLoc);
    localStorage.setItem('rides_driver_gps', JSON.stringify(newLoc));
    showToast(`📍 מיקומך הוגדר כעת ב-${zone.name}`);
  };

  // Trigger test simulation ride (including user exact bug scenarios)
  const handleSimulateTestRide = async () => {
    setSimulating(true);
    try {
      const sampleList = [
        {
          rawText: '⚠️ שמש פנימי 50 ש רמה א > רמה ד ביט זמנים wa.me/972552732722?text=ת+516735753',
          groupName: '👥 דרייבוט 4',
          senderName: 'ק.ד 6',
          senderPhone: '0552732722',
        },
        {
          rawText: 'פנימי שמש 40 רמה ג לרמה ד חולדה הנביאה זמן',
          groupName: 'ובזמנו פנימי בית שמש',
          senderName: 'מוקד סדרן',
          senderPhone: '0528101833',
        },
        {
          rawText: '0509150218 שמואל הנביא לבקש ב 100 שמש יער צרעה',
          groupName: 'שחור לבן איכותי 1',
          senderName: 'סדרן ראשי',
          senderPhone: '0509150218',
        },
        {
          rawText: 'פנימי שמש 150\nזכריה הנביא לד\nמיידי',
          groupName: 'חסידיש ללא פלפון',
          senderName: 'סדרן',
          senderPhone: '0548362633',
        },
        {
          rawText: 'מב לד 50 שח זמן',
          groupName: 'דרייברים נוסעים בכל הארץ',
          senderName: 'סדרן',
          senderPhone: '0527189191',
        },
      ];

      const pick = sampleList[Math.floor(Math.random() * sampleList.length)];
      const res = await simulateRideApi(pick);
      if (res && res.ride) {
        const sim = {
          ...res.ride,
          createdAt: Date.now(),
          timestamp: Date.now(),
        };
        setRides((prev) => {
          const list = [sim, ...prev.filter((r) => r.id !== sim.id)];
          list.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
          return list;
        });
      }
      playLoudChime();
      showToast('🚀 נסיעת בדיקה שודרה לרדאר בהצלחה עם צלצול חזק!');
    } catch (e: any) {
      showToast(e.message || 'שגיאה בשידור נסיעת דמה');
    } finally {
      setSimulating(false);
    }
  };

  // Handle Instant Claim ("תן" או תפיסה בדרייבוט)
  const handleClaimRide = async (ride: LiveRideItem) => {
    setClaimingId(ride.id);
    try {
      // אם זו נסיעת דרייבוט - פותחים מיד את הקישור הרשמי של דרייבוט בחלון חדש
      if (ride.drivebotUrl) {
        window.open(ride.drivebotUrl, '_blank', 'noopener,noreferrer');
      }

      const claimText = ride.isDriveBot && ride.drivebotCommand ? ride.drivebotCommand : 'תן';
      const res = await claimRideApi(ride.id, selectedDriverPhone, claimText);
      if (res.ok) {
        setClaimedSuccessId(ride.id);
        playLoudChime();
        if (ride.isDriveBot) {
          showToast(`⚡ נסיעת דרייבוט נתפסה! הפקודה נשלחה לבוט דרייבוט הרשמי ללא שליחה לקבוצה.`);
        } else {
          showToast(`🚕 הנסיעה נתפסה בהצלחה! נשלחה תגובת "תן" בקבוצה ולסדרן.`);
        }
        setTimeout(() => {
          setClaimedSuccessId(null);
        }, 5000);
      } else {
        showToast(res.error || 'שגיאה בתפיסת הנסיעה');
      }
    } catch (e: any) {
      showToast(e.message || 'שגיאה בתפיסת הנסיעה');
    } finally {
      setClaimingId(null);
    }
  };

  // פענוח נתיב נסיעה מדויק ומניעת טעויות היפוך ("מב לד")
  // חישוב המרחק נעשה תמיד לנקודת האיסוף (Origin) של הלקוח!
  const enrichedRides = useMemo(() => {
    return rides.map((ride) => {
      const rawText = ride.cleanedText || ride.rawText || '';
      const parsed = parseRideRoute(rawText, ride.senderPhone);

      // נקודת האיסוף וקואורדינטות איסוף
      const originNeighborhood = parsed.originNeighborhood;
      const originCoords = parsed.originCoords;
      const originText = parsed.originText;

      // יעד הנסיעה
      const destNeighborhood = parsed.destNeighborhood;
      const destinationText = parsed.destinationText;

      // חישוב מרחק מדויק ממיקום הנהג הנוכחי עד לנקודת האיסוף (כדי שהנהג ידע כמה זמן ייקח לו להגיע ללקוח!)
      let distanceKm: number | null = null;
      let driveTimeMinutes: number | null = null;

      if (originCoords && driverLocation) {
        const dist = calculateDistanceKm(
          driverLocation.lat,
          driverLocation.lng,
          originCoords.lat,
          originCoords.lng
        );
        distanceKm = dist.roadKm;
        driveTimeMinutes = dist.driveTimeMin;
      }

      // קישור ניווט Waze ייקח את הנהג ישירות לנקודת האיסוף של הלקוח
      const wazeUrl = generateWazeUrl(originText || originNeighborhood, 'בית שמש', originCoords);

      // חילוץ סדרן מדויק (אם היה 0 או לא צוין, מנקים ומחלצים מההודעה)
      let cleanDispatcher = parsed.dispatcherPhone || ride.senderPhone;
      if (!cleanDispatcher || cleanDispatcher === '0' || cleanDispatcher === 'לא צוין') {
        cleanDispatcher = extractDispatcherPhone(rawText) || '';
      }

      const price = parsed.price || ride.price || null;
      const isInternal = parsed.isInternal || ride.isInternal || false;

      // שעת שליחת ההודעה המדויקת בוואטסאפ (שעה ודקה)
      const timeFormatted = ride.timeFormatted || (ride.timestamp ? new Date(ride.timestamp).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }) : '');

      return {
        ...ride,
        originText,
        originNeighborhood,
        destinationText,
        destNeighborhood,
        coords: originCoords,
        distanceKm,
        driveTimeMinutes,
        wazeUrl,
        price,
        isInternal,
        cleanDispatcher,
        timeFormatted,
        isDriveBot: parsed.isDriveBot ?? ride.isDriveBot ?? false,
        drivebotUrl: parsed.drivebotUrl ?? ride.drivebotUrl ?? null,
        drivebotCommand: parsed.drivebotCommand ?? ride.drivebotCommand ?? null,
        drivebotPhone: parsed.drivebotPhone ?? ride.drivebotPhone ?? null,
      };
    }).sort((a, b) => {
      const timeA = a.createdAt || a.timestamp || 0;
      const timeB = b.createdAt || b.timestamp || 0;
      return timeB - timeA;
    });
  }, [rides, driverLocation]);

  // Filter rides by distance slider
  const filteredRides = useMemo(() => {
    if (maxDistanceFilter <= 0) return enrichedRides;
    return enrichedRides.filter((r) => r.distanceKm === null || r.distanceKm <= maxDistanceFilter);
  }, [enrichedRides, maxDistanceFilter]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 bg-[#06090e] text-slate-100 flex flex-col overflow-hidden font-sans select-none animate-in fade-in duration-200 ${
      isCockpitMode ? 'p-0' : ''
    }`}>
      {/* לחצן סגירה קבוע ובולט שתמיד נראה ופעיל בכל מצב (מסך מלא, גלילה, קוקפיט) */}
      <button
        onClick={onClose}
        className="fixed top-2.5 left-2.5 z-[100] w-10 h-10 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-[0_0_20px_rgba(225,29,72,0.6)] border-2 border-white/50 cursor-pointer transition-transform active:scale-90"
        title="סגור חלון וחזור לאתר"
      >
        <X className="w-5 h-5 stroke-[2.5]" />
      </button>

      {/* ========================================================= */}
      {/* 1. TOP HEADER & TELEMETRY BAR */}
      {/* ========================================================= */}
      <header className={`border-b flex items-center justify-between gap-3 shrink-0 transition-all ${
        isCockpitMode
          ? 'px-4 py-2 bg-[#080d14] border-[#182333] pl-16'
          : 'px-3 sm:px-6 py-2.5 bg-[#0b1018] border-[#1b2636] pl-16'
      }`}>
        <div className="flex items-center gap-3">
          {/* Radar Beacon Logo */}
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-400">
            <Radio className="w-5 h-5 animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-emerald-400 absolute top-1.5 right-1.5 shadow-[0_0_8px_#34d399]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-1.5">
                {isCockpitMode ? 'קוקפיט נהג (מסך מלא)' : 'רדאר נסיעות חי (Live Radar)'}
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black">
                  בזמן אמת ⚡
                </span>
              </h1>
            </div>
            {!isCockpitMode && (
              <p className="text-[11px] text-slate-400">
                זיהוי מדויק של מוצא (איסוף) ויעד, חישוב מרחק מיידי ותפיסה בלחיצה אחת
              </p>
            )}
          </div>
        </div>

        {/* Live Clock & Quick Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Button: True Fullscreen Cockpit Mode */}
          <button
            onClick={toggleCockpitFullscreen}
            className={`px-3 py-1.5 rounded-xl border font-black text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-md active:scale-95 ${
              isCockpitMode
                ? 'bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400'
                : 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-emerald-500/50 text-emerald-300 hover:text-white'
            }`}
            title={isCockpitMode ? 'צא ממצב קוקפיט' : 'הפעל מצב קוקפיט (מסך מלא מלא ללא הפרעות)'}
          >
            {isCockpitMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span>{isCockpitMode ? 'יציאה מקוקפיט' : 'מצב קוקפיט (מסך מלא)'}</span>
          </button>

          {/* Audio Chime Volume Slider & Test */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#080d14] border border-[#1e2b3c]">
            <button
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) playLoudChime(alertVolume);
              }}
              className="text-slate-400 hover:text-white cursor-pointer"
              title={soundEnabled ? 'השתק צליל התראה' : 'הפעל צליל התראה'}
            >
              {soundEnabled && alertVolume > 0 ? (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={soundEnabled ? Math.round(alertVolume * 100) : 0}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10) / 100;
                setAlertVolume(val);
                localStorage.setItem('rides_radar_volume', String(val));
                if (!soundEnabled && val > 0) setSoundEnabled(true);
              }}
              onMouseUp={() => playLoudChime()}
              onTouchEnd={() => playLoudChime()}
              className="w-14 sm:w-20 accent-emerald-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
              title={`עוצמת צלצול: ${Math.round(alertVolume * 100)}%`}
            />
            <span className="text-[10px] font-mono text-emerald-300 font-bold w-7 text-left">
              {soundEnabled ? `${Math.round(alertVolume * 100)}%` : '0%'}
            </span>
          </div>

          <button
            onClick={() => {
              playLoudChime();
              if (!soundEnabled) setSoundEnabled(true);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-teal-300 hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            title="בדוק צלצול חזק כעת"
          >
            <BellRing className="w-3.5 h-3.5 text-teal-300 animate-bounce" />
            <span className="hidden sm:inline">בדיקת צליל</span>
          </button>

          {/* Test Ride Simulation Button & Clear Button (only in regular view) */}
          {!isCockpitMode && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSimulateTestRide}
                disabled={simulating}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-500/20 to-blue-500/20 hover:from-teal-500/30 hover:to-blue-500/30 border border-teal-500/40 text-teal-200 hover:text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
                title="שלח נסיעת בדיקה ברגע זה לבדיקת המערכת והרדאר"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                <span>נסיעת הדגמה</span>
              </button>

              {rides.some((r) => r.id.startsWith('sim-')) && (
                <button
                  onClick={() => {
                    setRides((prev) => prev.filter((r) => !r.id.startsWith('sim-')));
                    showToast('🧹 נסיעות ההדגמה הוסרו. מוצגות רק נסיעות אמת מהקבוצות!');
                  }}
                  className="px-2 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                  title="נקה נסיעות הדגמה והשאר רק נסיעות אמת מהקבוצות"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">נקה הדגמה</span>
                </button>
              )}
            </div>
          )}

          {/* Live Clock */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#080d14] border border-[#1e2b3c] font-mono text-xs text-teal-400 font-bold">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentTimeStr || '00:00:00'}</span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadRides(true)}
            disabled={loading}
            className="p-2 rounded-xl bg-[#121924] hover:bg-[#182333] border border-[#223044] text-slate-300 hover:text-white cursor-pointer transition-colors"
            title="רענן נסיעות עכשיו"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* ========================================================= */}
      {/* 2. DRIVER LOCATION & DISTANCE FILTER (HIDDEN IN COCKPIT FOR MAX VISIBILITY) */}
      {/* ========================================================= */}
      {!isCockpitMode && (
        <section className="px-3 sm:px-6 py-2 bg-[#0e141f] border-b border-[#1b2636] flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          {/* Current Location Pill & GPS Button */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#080c13] border border-[#233348] text-slate-200">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-400">איפה אתה ברכב:</span>
              <strong className="text-emerald-300 font-bold">{driverLocation.label}</strong>
              {driverLocation.source === 'gps' && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-mono">
                  GPS
                </span>
              )}
            </div>

            {/* Button: Use device GPS */}
            <button
              onClick={handleRequestDeviceGps}
              disabled={isGettingGps}
              className="px-2.5 py-1 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-blue-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors font-medium text-xs"
              title="דקור מיקום GPS מדויק מהטלפון/מחשב"
            >
              <LocateFixed className={`w-3.5 h-3.5 ${isGettingGps ? 'animate-spin text-blue-400' : ''}`} />
              <span>{isGettingGps ? 'מאתר GPS...' : 'דקור GPS'}</span>
            </button>

            {/* Quick neighborhood pill selector */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5 sm:pb-0">
              <span className="text-slate-400 text-[11px] shrink-0 mr-1 hidden sm:inline">או בחר אזור:</span>
              {['רמה ד', 'רמה ג', 'רמה א', 'רמה ב', 'מרכז ביג', 'העיר הוותיקה', 'הר טוב'].map((k) => {
                const isSelected = driverLocation.neighborhood === k;
                return (
                  <button
                    key={k}
                    onClick={() => handleSelectZone(k)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer shrink-0 border ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 font-bold'
                        : 'bg-[#080d14] border-[#1d293a] text-slate-300 hover:text-white hover:bg-[#121924]'
                    }`}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Distance Range Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 text-[11px]">סינון לפי מרחק:</span>
            <div className="flex items-center gap-1 bg-[#080c13] p-0.5 rounded-xl border border-[#233348]">
              {[
                { val: 0, label: 'הכל' },
                { val: 2, label: 'עד 2 ק"מ' },
                { val: 4, label: 'עד 4 ק"מ' },
                { val: 6, label: 'עד 6 ק"מ' },
              ].map((f) => (
                <button
                  key={f.val}
                  onClick={() => setMaxDistanceFilter(f.val)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                    maxDistanceFilter === f.val
                      ? 'bg-emerald-500 text-slate-950 font-black'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* GPS Error Notification if any */}
      {gpsError && (
        <div className="mx-4 mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{gpsError}</span>
          </div>
          <button onClick={() => setGpsError(null)} className="text-amber-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Toast popup */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-xs shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200 border-2 border-emerald-300">
          <CheckCircle2 className="w-5 h-5 text-slate-950 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. MAIN LIVE RIDES FEED & RADAR VIEW (COCKPIT VS STANDARD) */}
      {/* ========================================================= */}
      <main className={`flex-1 overflow-y-auto ${
        isCockpitMode ? 'p-2 sm:p-4' : 'p-3 sm:p-6'
      }`}>
        {filteredRides.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-4">
            <div className="relative w-24 h-24 rounded-full border border-teal-500/30 bg-teal-500/5 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-teal-400/20 animate-ping" />
              <Compass className="w-10 h-10 text-teal-400 animate-spin duration-1000" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">
                הרדאר סורק נסיעות מהקבוצות כעת...
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                ברגע שתפורסם נסיעה בקבוצות שלך, היא תופיע כאן מיד עם צלצול חזק, איסוף מדויק ומרחק מהרכב.
              </p>
            </div>
            <button
              onClick={handleSimulateTestRide}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg hover:bg-emerald-400 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>הפעל נסיעת בדיקה לדוגמה</span>
            </button>
          </div>
        ) : (
          <div className={`grid gap-4 ${
            isCockpitMode
              ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {filteredRides.slice(0, 20).map((ride) => {
              const prox = ride.distanceKm !== null && ride.distanceKm !== undefined
                ? getProximityBadge(ride.distanceKm)
                : null;
              const isClaiming = claimingId === ride.id;
              const isClaimedSuccess = claimedSuccessId === ride.id;
              const relTime = getRelativeTimeDisplay(ride.createdAt || ride.timestamp, nowMs);

              return (
                <div
                  key={ride.id}
                  className={`relative rounded-2xl bg-[#0a0f16] border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xl ${
                    isClaimedSuccess
                      ? 'border-emerald-500 shadow-[0_0_30px_rgba(52,211,153,0.5)] bg-emerald-950/30 ring-2 ring-emerald-500'
                      : prox?.isClose
                      ? 'border-emerald-500/60 shadow-[0_0_20px_rgba(52,211,153,0.2)] hover:border-emerald-400 bg-gradient-to-b from-[#0e1622] to-[#080d14]'
                      : 'border-[#1e2a3c] hover:border-[#2f425b]'
                  }`}
                >
                  {/* ========================================= */}
                  {/* CARD HEADER: GIANT ELAPSED TIME + COMPACT PRICE */}
                  {/* ========================================= */}
                  <div className="p-3 pb-2.5 border-b border-[#182333] bg-[#0c121c] space-y-2">
                    {/* GIANT ELAPSED TIME BANNER - ענקקק וקריא מיידית ברכב */}
                    <div className="flex items-center justify-between gap-2">
                      <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 shadow-md ${relTime.styleClass}`}>
                        <Clock className="w-5 h-5 text-current shrink-0 animate-pulse" />
                        <span className="text-lg sm:text-xl md:text-2xl font-black tracking-tight leading-none">
                          {relTime.badgeText}
                        </span>
                      </div>

                      {/* Compact Smaller Price - מחיר קטן יותר כפי שביקשת */}
                      {ride.price ? (
                        <div className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-bold text-xs sm:text-sm shrink-0 flex items-center gap-1 shadow-sm">
                          <span className="text-slate-400 text-[10px]">מחיר:</span>
                          <span className="text-sm sm:text-base font-black text-emerald-300">₪{ride.price}</span>
                        </div>
                      ) : null}
                    </div>

                    {/* Metadata Sub-bar: Exact timestamp + Group name + Dispatcher */}
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      {/* Internal vs Intercity Tag */}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider ${
                          ride.isInternal
                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                            : 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                        }`}
                      >
                        {ride.isInternal ? '🚕 פנימי' : '🛣️ בינעירוני'}
                      </span>

                      {/* DriveBot Badge if applicable */}
                      {ride.isDriveBot && (
                        <span className="px-1.5 py-0.5 rounded-md text-[11px] font-black bg-amber-400/20 border border-amber-400/40 text-amber-300">
                          ⚡ דרייבוט
                        </span>
                      )}

                      {/* Exact WhatsApp Sent Time */}
                      <span className="px-2 py-0.5 rounded-md bg-[#06090f] border border-[#1b2738] text-teal-300 font-mono text-[11px] font-bold">
                        שודר ב-{ride.timeFormatted || 'בזמן אמת'}
                      </span>

                      {/* Group Name */}
                      <span className="text-[11px] text-slate-300 font-medium truncate max-w-[130px]" title={ride.groupName}>
                        👥 {ride.groupName}
                      </span>

                      {/* Dispatcher info */}
                      {ride.cleanDispatcher && (
                        <span className="text-[11px] text-slate-400 font-mono truncate">
                          👤 {ride.cleanDispatcher}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ========================================= */}
                  {/* CARD BODY: COMPACT ROUTE + DISTANCE + ENLARGED MESSAGE */}
                  {/* ========================================= */}
                  <div className="p-3 space-y-2.5">
                    {/* Visual Route Box: מוקטן מעט כדי לחסוך מקום במסך */}
                    <div className="rounded-xl bg-[#06090e] border border-[#182333] p-2.5 space-y-1.5 shadow-inner">
                      {/* ORIGIN (איסוף) */}
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-emerald-500/30 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-emerald-400 font-bold">איסוף מ:</span>
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                              {ride.originNeighborhood}
                            </span>
                          </div>
                          <div className="text-sm sm:text-base font-bold text-white leading-tight truncate mt-0.5">
                            {ride.originText || ride.originNeighborhood}
                          </div>
                        </div>
                      </div>

                      {/* Short connector */}
                      <div className="flex items-center gap-1 mr-1 text-[10px] text-slate-400 font-medium">
                        <ArrowDownRight className="w-3 h-3 text-slate-400" />
                        <span>אל יעד:</span>
                      </div>

                      {/* DESTINATION (יעד) */}
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-rose-400 ring-2 ring-rose-500/30 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-slate-400 font-medium">יעד:</span>
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px]">
                              {ride.destNeighborhood}
                            </span>
                          </div>
                          <div className="text-xs sm:text-sm font-semibold text-slate-200 leading-tight truncate mt-0.5">
                            {ride.destinationText || ride.destNeighborhood || 'יעד בעיר'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* LIVE DISTANCE TO PICKUP (מרחק מהנהג לאיסוף הלקוח) */}
                    {ride.distanceKm !== null && prox ? (
                      <div
                        className={`p-2 rounded-xl border flex items-center justify-between gap-2 shadow-sm ${prox.badgeBg}`}
                      >
                        <div className="flex items-center gap-2">
                          <Navigation className={`w-4 h-4 shrink-0 ${prox.colorClass}`} />
                          <span className="text-xs font-bold">
                            כ-{ride.distanceKm} ק"מ (כ-{ride.driveTimeMinutes} דק' נסיעה לאיסוף)
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/40 ${prox.colorClass}`}>
                          {prox.label}
                        </span>
                      </div>
                    ) : (
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-slate-400" />
                        <span>איסוף משוער ב-{ride.originNeighborhood}</span>
                      </div>
                    )}

                    {/* ORIGINAL RAW MESSAGE BOX (מוגדל בהרבה, פונט מודגש וקריא + לחץ להגדלה נוספת) */}
                    <div
                      onClick={() => setSelectedRideForDetails(ride)}
                      className="p-3 rounded-xl bg-[#060a10] hover:bg-[#0c1420] border-2 border-[#1c293a] hover:border-teal-500/60 cursor-pointer transition-all group shadow-sm"
                      title="לחץ להצגת פרטי הודעה מלאים מקבוצת הוואטסאפ בגופן ענק עם קישורים לחיצים"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1 pb-1 border-b border-[#141e2b]">
                        <span className="font-sans font-black text-teal-400 group-hover:text-teal-300 flex items-center gap-1.5">
                          📄 תוכן הודעה מקורית • {ride.groupName}
                        </span>
                        <span className="text-xs text-teal-400 font-sans group-hover:underline flex items-center gap-1 font-bold">
                          פתח בגדול <ExternalLink className="w-3 h-3" />
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm md:text-base font-bold font-mono text-slate-50 select-text leading-relaxed line-clamp-3">
                        {ride.cleanedText || ride.rawText}
                      </div>
                    </div>
                  </div>

                  {/* ========================================= */}
                  {/* CARD FOOTER ACTIONS: WAZE + הצג בוואטסאפ + תן (כפתורים מוקטנים ונוחים) */}
                  {/* ========================================= */}
                  <div className={`p-2 sm:p-2.5 bg-[#080d14] border-t border-[#182333] flex items-center gap-1.5 ${
                    isCockpitMode ? 'py-2.5' : 'py-2'
                  }`}>
                    {/* Waze Quick Navigation Button */}
                    <a
                      href={ride.wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 hover:text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0 shadow-sm"
                      title="נווט ישירות לנקודת האיסוף ב-Waze"
                    >
                      <Navigation className="w-3.5 h-3.5 text-blue-400" />
                      <span>Waze</span>
                    </a>

                    {/* WhatsApp Action Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = getCleanWhatsAppLink(ride);
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                      className="px-2.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0 shadow-sm active:scale-95"
                      title={ride.isDriveBot ? 'פתח קישור ישיר לבוט דרייבוט בוואטסאפ' : 'פתח צ\'אט בוואטסאפ עם הסדרן'}
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />
                      <span>וואטסאפ</span>
                    </button>

                    {/* CLAIM RIDE BUTTON ("תפוס נסיעה - תן" או "תפוס בדרייבוט") - מוקטן מעט כדי לא לחנוק את הכרטיס */}
                    <button
                      onClick={() => handleClaimRide(ride)}
                      disabled={isClaiming || isClaimedSuccess}
                      className={`flex-1 py-2 px-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-md ${
                        isClaimedSuccess
                          ? 'bg-emerald-500 text-slate-950 font-black'
                          : ride.isDriveBot
                          ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-black ring-2 ring-amber-400/50'
                          : prox?.isClose
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-emerald-500/30 ring-1 ring-emerald-300'
                          : 'bg-teal-500 hover:bg-teal-400 text-slate-950 font-black'
                      }`}
                      title={ride.isDriveBot ? 'תפיסה דרך בוט דרייבוט בלבד - לא שולח הודעה לקבוצה!' : 'שולח הודעת "תן" בקבוצה'}
                    >
                      {isClaimedSuccess ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                          <span>נתפס!</span>
                        </>
                      ) : isClaiming ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                          <span>שולח...</span>
                        </>
                      ) : ride.isDriveBot ? (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />
                          <span>תפוס דרייבוט ("תן")</span>
                        </>
                      ) : (
                        <>
                          <Car className="w-3.5 h-3.5 text-slate-950" />
                          <span>תפוס נסיעה ("תן")</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* 4. MODAL POP-UP FOR FULL RAW WHATSAPP MESSAGE WITH ACTIVE LINKS */}
      {/* ========================================================= */}
      {selectedRideForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-[#0b1018] border border-[#233348] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            {/* Header */}
            <div className="p-4 border-b border-[#1b2636] flex items-center justify-between bg-[#0e141f]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-300">
                  <Radio className="w-4 h-4 text-teal-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">הודעה מלאה מקבוצת הוואטסאפ</h3>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span>{selectedRideForDetails.groupName}</span>
                    <span>•</span>
                    <span className="text-teal-300 font-mono font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3 text-teal-400" />
                      {selectedRideForDetails.timeFormatted || 'בזמן אמת'}
                    </span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRideForDetails(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body with Live Links - גופן מוגדל ומודגש ביותר כפי שביקש הנהג */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 font-mono text-base sm:text-lg md:text-xl font-bold text-slate-50 leading-loose whitespace-pre-wrap select-text bg-[#05080d] border-y-2 border-[#1e2e42] tracking-wide">
              {renderClickableText(selectedRideForDetails.rawText || selectedRideForDetails.cleanedText || '')}
            </div>

            {/* Footer with actions */}
            <div className="p-3.5 bg-[#0d131c] flex items-center justify-between gap-2 flex-wrap">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedRideForDetails.rawText || selectedRideForDetails.cleanedText || '');
                  showToast('📋 נוסח ההודעה המלא הועתק בהצלחה ללוח!');
                }}
                className="px-3 py-2 rounded-xl bg-[#162130] hover:bg-[#1f2e42] border border-[#233348] text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-slate-300" />
                <span>העתק טקסט מלא</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const url = getCleanWhatsAppLink(selectedRideForDetails);
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
                >
                  <MessageCircle className="w-4 h-4 text-slate-950 fill-slate-950" />
                  <span>{selectedRideForDetails.isDriveBot ? 'פתח בוט דרייבוט בוואטסאפ' : 'פתח שיחה בוואטסאפ'}</span>
                </button>

                <button
                  onClick={() => setSelectedRideForDetails(null)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  סגור
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
