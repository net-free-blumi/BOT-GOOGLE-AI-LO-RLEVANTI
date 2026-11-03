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
  ChevronLeft
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
} from '../services/geoService.ts';

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
  const [isGettingGps, setIsGettingGps] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [simulating, setSimulating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Cockpit Mode (True Fullscreen, distraction-free, 2-3 big cards)
  const [isCockpitMode, setIsCockpitMode] = useState<boolean>(false);

  const prevRidesCountRef = useRef<number>(0);
  const pollIntervalRef = useRef<any>(null);

  // Update live clock every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
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

  // צלצול התראה חזק, בולט ועוצמתי ברגע שנכנסת נסיעה חדשה (תואם מסוף מוניות ורכב)
  const playLoudChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'triangle'; // גל משולש חד ועוצמתי
      osc2.type = 'sine';

      // דינג ראשון: 784Hz + 1174Hz (סולם התראה ברור)
      osc1.frequency.setValueAtTime(784, now);
      osc2.frequency.setValueAtTime(1174.66, now);

      // דינג שני מודגש: 1046.5Hz + 1568Hz ב-+130ms
      osc1.frequency.setValueAtTime(1046.5, now + 0.13);
      osc2.frequency.setValueAtTime(1567.98, now + 0.13);

      // ווליום עוצמתי (0.90) כדי שישמעו היטב בנסיעה מעל רעש כביש
      gain.gain.setValueAtTime(0.85, now);
      gain.gain.setValueAtTime(0.92, now + 0.13);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.58);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.58);
      osc2.stop(now + 0.58);
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

  // Load live rides from backend
  const loadRides = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetchLiveRidesApi(selectedDriverPhone);
      if (res && res.ok && Array.isArray(res.rides)) {
        setRides((prev) => {
          const simRides = prev.filter((r) => r.id.startsWith('sim-'));
          const incoming = res.rides;
          const merged = [...simRides];
          for (const s of incoming) {
            if (!merged.some((m) => m.id === s.id)) {
              merged.push(s);
            }
          }
          return merged;
        });

        // צלצול חזק אם נוספה נסיעה חדשה
        if (prevRidesCountRef.current > 0 && res.rides.length > prevRidesCountRef.current) {
          playLoudChime();
        }
        prevRidesCountRef.current = res.rides.length;
      }
    } catch (e) {
      // Handled gracefully in api layer
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Poll live rides rapidly (every 1.2s instead of 3s) while modal is open
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
        setRides((prev) => [res.ride, ...prev.filter((r) => r.id !== res.ride.id)]);
      }
      playLoudChime();
      showToast('🚀 נסיעת בדיקה שודרה לרדאר בהצלחה עם צלצול חזק!');
    } catch (e: any) {
      showToast(e.message || 'שגיאה בשידור נסיעת דמה');
    } finally {
      setSimulating(false);
    }
  };

  // Handle Instant Claim ("תן")
  const handleClaimRide = async (ride: LiveRideItem) => {
    setClaimingId(ride.id);
    try {
      const res = await claimRideApi(ride.id, selectedDriverPhone, 'תן');
      if (res.ok) {
        setClaimedSuccessId(ride.id);
        playLoudChime();
        showToast(`🚕 הנסיעה נתפסה בהצלחה! נשלחה תגובת "תן" בקבוצה ולסדרן.`);
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
      };
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
      {/* ========================================================= */}
      {/* 1. TOP HEADER & TELEMETRY BAR */}
      {/* ========================================================= */}
      <header className={`border-b flex items-center justify-between gap-3 shrink-0 transition-all ${
        isCockpitMode
          ? 'px-4 py-2 bg-[#080d14] border-[#182333]'
          : 'px-3 sm:px-6 py-2.5 bg-[#0b1018] border-[#1b2636]'
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
                {isCockpitMode ? 'קוקפיט נהג (מסך מלא מלא)' : 'רדאר נסיעות חי (Live Radar)'}
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

          {/* Loud Audio Chime Toggle & Test */}
          <button
            onClick={() => {
              playLoudChime();
              if (!soundEnabled) setSoundEnabled(true);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-teal-300 hover:text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            title="בדוק צלצול חזק כעת"
          >
            <BellRing className="w-3.5 h-3.5 text-teal-300 animate-bounce" />
            <span className="hidden sm:inline">בדוק צליל חזק</span>
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border text-xs flex items-center gap-1 cursor-pointer transition-colors ${
              soundEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-[#121924] border-[#223044] text-slate-400 hover:text-white'
            }`}
            title={soundEnabled ? 'צליל התראה מופעל' : 'צליל התראה מושתק'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Test Ride Simulation Button (only in regular view) */}
          {!isCockpitMode && (
            <button
              onClick={handleSimulateTestRide}
              disabled={simulating}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-500/20 to-blue-500/20 hover:from-teal-500/30 hover:to-blue-500/30 border border-teal-500/40 text-teal-200 hover:text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
              title="שלח נסיעת בדיקה ברגע זה לבדיקת המערכת והרדאר"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-300" />
              <span>נסיעת הדגמה</span>
            </button>
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

          {/* Close Modal Button */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:text-white cursor-pointer transition-colors"
            title="סגור חלונית מסך מלא"
          >
            <X className="w-4 h-4" />
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
          <div className={`grid gap-3.5 ${
            isCockpitMode
              ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {filteredRides.slice(0, isCockpitMode ? 6 : 40).map((ride) => {
              const prox = ride.distanceKm !== null && ride.distanceKm !== undefined
                ? getProximityBadge(ride.distanceKm)
                : null;
              const isClaiming = claimingId === ride.id;
              const isClaimedSuccess = claimedSuccessId === ride.id;

              return (
                <div
                  key={ride.id}
                  className={`relative rounded-2xl bg-[#0a0f16] border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-lg ${
                    isClaimedSuccess
                      ? 'border-emerald-500 shadow-[0_0_25px_rgba(52,211,153,0.4)] bg-emerald-950/25 ring-2 ring-emerald-500'
                      : prox?.isClose
                      ? 'border-emerald-500/50 shadow-[0_0_18px_rgba(52,211,153,0.15)] hover:border-emerald-400 bg-gradient-to-b from-[#0d141e] to-[#080d14]'
                      : 'border-[#1b2636] hover:border-[#2a3c54]'
                  }`}
                >
                  {/* ========================================= */}
                  {/* CARD HEADER: BADGE + PRICE + SENDER */}
                  {/* ========================================= */}
                  <div className="p-3 sm:p-4 pb-2.5 border-b border-[#162130] flex items-start justify-between gap-2 bg-[#0d131c]">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Internal vs Intercity Tag (Fixed: Shows פנימי בעיר in Emerald!) */}
                        <span
                          className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black uppercase tracking-wider ${
                            ride.isInternal
                              ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 shadow-sm'
                              : 'bg-purple-500/20 border border-purple-500/40 text-purple-300 shadow-sm'
                          }`}
                        >
                          {ride.isInternal ? '🚕 פנימי (בתוך העיר)' : '🛣️ בינעירוני'}
                        </span>

                        {/* Group Name */}
                        <span className="text-[11px] text-slate-300 font-medium truncate max-w-[150px]" title={ride.groupName}>
                          📍 {ride.groupName}
                        </span>
                      </div>

                      {/* Dispatcher: Never shows 0! */}
                      {ride.cleanDispatcher ? (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                          <span>👤 סדרן:</span>
                          <strong className="text-teal-300 font-bold">{ride.cleanDispatcher}</strong>
                          {ride.senderName && ride.senderName !== 'סדרן' && (
                            <span className="text-slate-400">({ride.senderName})</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400">
                          <span>👤 שולח: {ride.senderName || 'סדרן בקבוצה'}</span>
                        </div>
                      )}
                    </div>

                    {/* Prominent Price Tag */}
                    {ride.price ? (
                      <div className="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-black text-base sm:text-lg shrink-0 shadow-sm">
                        ₪ {ride.price}
                      </div>
                    ) : null}
                  </div>

                  {/* ========================================= */}
                  {/* CARD BODY: CLEAR ROUTE + DISTANCE TO PICKUP */}
                  {/* ========================================= */}
                  <div className={`space-y-2.5 ${isCockpitMode ? 'p-3 sm:p-4' : 'p-3 sm:p-4'}`}>
                    {/* Visual Route Box: איסוף ו-יעד בגדול וברור */}
                    <div className="rounded-xl bg-[#06090e] border border-[#182333] p-3 space-y-2.5 shadow-inner">
                      {/* ORIGIN (איסוף) - הובלט בגדול כי זה הכי חשוב לנהג! */}
                      <div className="flex items-start gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-emerald-400 font-black uppercase tracking-wider flex items-center gap-1">
                            <span>נקודת איסוף (מאיפה נוסעים):</span>
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-200 text-[10px] font-bold">
                              {ride.originNeighborhood}
                            </span>
                          </div>
                          <div className="text-sm sm:text-base font-black text-white truncate mt-0.5">
                            {ride.originText || ride.originNeighborhood}
                          </div>
                        </div>
                      </div>

                      {/* Line connector with direction arrow */}
                      <div className="flex items-center gap-2 mr-1">
                        <div className="border-r-2 border-dashed border-[#243346] h-3 mr-1" />
                        <span className="text-[10px] text-slate-400 font-bold flex items-center gap-0.5">
                          <ArrowDownRight className="w-3 h-3 text-slate-400" />
                          <span>נוסע אל</span>
                        </span>
                      </div>

                      {/* DESTINATION (יעד) */}
                      <div className="flex items-start gap-2.5">
                        <div className="w-3.5 h-3.5 rounded-full bg-rose-400 ring-4 ring-rose-500/20 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                            <span>יעד נסיעה:</span>
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px]">
                              {ride.destNeighborhood}
                            </span>
                          </div>
                          <div className="text-xs sm:text-sm font-bold text-slate-200 truncate mt-0.5">
                            {ride.destinationText || ride.destNeighborhood || 'יעד בעיר'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* LIVE DISTANCE TO PICKUP (מרחק מהנהג לאיסוף הלקוח) */}
                    {ride.distanceKm !== null && prox ? (
                      <div
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 shadow-sm ${prox.badgeBg}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Navigation className={`w-5 h-5 shrink-0 ${prox.colorClass}`} />
                          <div>
                            <span className="text-[10px] block opacity-90 font-medium">מרחק ממיקומך לאיסוף:</span>
                            <span className="text-xs sm:text-sm font-black tracking-tight">
                              כ-{ride.distanceKm} ק"מ (כ-{ride.driveTimeMinutes} דק' נסיעה לאיסוף)
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full bg-black/40 ${prox.colorClass}`}>
                          {prox.label}
                        </span>
                      </div>
                    ) : (
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Compass className="w-4 h-4 text-slate-400" />
                        <span>מרחק משוער: מחושב לאיסוף ב-{ride.originNeighborhood}</span>
                      </div>
                    )}

                    {/* ORIGINAL RAW MESSAGE SNIPPET */}
                    <div className="p-2 rounded-lg bg-[#05080c] border border-[#141d29] text-[11px] font-mono text-slate-300 line-clamp-2 select-text">
                      {ride.cleanedText || ride.rawText}
                    </div>
                  </div>

                  {/* ========================================= */}
                  {/* CARD FOOTER ACTIONS: WAZE + PHONE + "תן" */}
                  {/* ========================================= */}
                  <div className={`p-3 bg-[#080d14] border-t border-[#162130] flex items-center gap-2 ${
                    isCockpitMode ? 'py-3' : 'py-2.5'
                  }`}>
                    {/* Waze Quick Navigation Button (Takes to PICKUP SPOT!) */}
                    <a
                      href={ride.wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-blue-300 hover:text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 shadow-sm"
                      title="נווט ישירות לנקודת האיסוף ב-Waze"
                    >
                      <Navigation className="w-4 h-4 text-blue-400" />
                      <span>Waze לאיסוף</span>
                    </a>

                    {/* Direct WhatsApp to Dispatcher */}
                    {ride.cleanDispatcher && (
                      <a
                        href={`https://wa.me/${ride.cleanDispatcher.replace(/\D/g, '').startsWith('0') ? '972' + ride.cleanDispatcher.replace(/\D/g, '').slice(1) : ride.cleanDispatcher.replace(/\D/g, '')}?text=${encodeURIComponent(
                          `שלום, לגבי הנסיעה שפרסמת בקבוצה: ${ride.cleanedText || ride.rawText}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 rounded-xl bg-[#141d29] hover:bg-[#1b2737] border border-[#233348] text-teal-300 hover:text-white transition-colors cursor-pointer shrink-0"
                        title="פנה לסדרן בוואטסאפ אישי"
                      >
                        <Phone className="w-4 h-4 text-teal-400" />
                      </a>
                    )}

                    {/* GIANT CLAIM RIDE BUTTON ("תפוס נסיעה - תן") */}
                    <button
                      onClick={() => handleClaimRide(ride)}
                      disabled={isClaiming || isClaimedSuccess}
                      className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md ${
                        isClaimedSuccess
                          ? 'bg-emerald-500 text-slate-950 font-black'
                          : prox?.isClose
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-emerald-500/30 ring-1 ring-emerald-300'
                          : 'bg-teal-500 hover:bg-teal-400 text-slate-950 font-black'
                      }`}
                    >
                      {isClaimedSuccess ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-slate-950" />
                          <span>נתפס בהצלחה! ("תן")</span>
                        </>
                      ) : isClaiming ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                          <span>שולח "תן"...</span>
                        </>
                      ) : (
                        <>
                          <Car className="w-4 h-4 text-slate-950" />
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
    </div>
  );
}
