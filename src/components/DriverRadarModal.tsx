import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Radio,
  Navigation,
  Compass,
  MapPin,
  Car,
  Clock,
  Send,
  ExternalLink,
  Volume2,
  VolumeX,
  Filter,
  Play,
  CheckCircle2,
  Sparkles,
  Zap,
  Phone,
  RefreshCw,
  LocateFixed,
  AlertCircle
} from 'lucide-react';
import { LiveRideItem, DriverGeoLocation } from '../types.ts';
import { fetchLiveRidesApi, claimRideApi, simulateRideApi } from '../services/api.ts';
import {
  BEIT_SHEMESH_ZONES,
  detectNeighborhood,
  calculateDistanceKm,
  generateWazeUrl,
  getProximityBadge,
  GeoPoint
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

  // Play audio chime on new close ride
  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {}
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Load live rides from backend / demo
  const loadRides = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetchLiveRidesApi(selectedDriverPhone);
      if (res && res.ok && Array.isArray(res.rides)) {
        setRides(res.rides);

        // If new ride arrived and it is close, ring chime
        if (prevRidesCountRef.current > 0 && res.rides.length > prevRidesCountRef.current) {
          playChime();
        }
        prevRidesCountRef.current = res.rides.length;
      }
    } catch (e) {
      console.error('Failed to load live rides:', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Poll live rides every 3 seconds while modal is open
  useEffect(() => {
    if (isOpen) {
      loadRides(true);
      pollIntervalRef.current = setInterval(() => {
        loadRides(false);
      }, 3000);
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

  // Trigger test simulation ride
  const handleSimulateTestRide = async () => {
    setSimulating(true);
    try {
      const sampleList = [
        {
          rawText: 'פנימי שמש 50\nזכריה הנביא לד\nזמנים',
          originText: 'זכריה הנביא',
          destinationText: "רמה ד'",
          originNeighborhood: 'רמה ג',
          destNeighborhood: 'רמה ד',
          city: 'בית שמש',
          price: 50,
          groupName: '⚜️ סוס ורוכבו ⚜️',
          senderName: 'אהרון סדרן',
          senderPhone: '0548362633',
        },
        {
          rawText: 'שמש 55ש\nנחל משמר לביג\nמיידי לבקש פה',
          originText: 'נחל משמר',
          destinationText: 'מרכז ביג',
          originNeighborhood: 'רמה א',
          destNeighborhood: 'מרכז ביג',
          city: 'בית שמש',
          price: 55,
          groupName: 'דרייבוט 4',
          senderName: 'ק.ד 6',
          senderPhone: '0503426194',
        },
        {
          rawText: 'פנימי שמש 45\nסמטת הגפן לקריה\nזמן',
          originText: 'סמטת הגפן',
          destinationText: 'הקריה החרדית',
          originNeighborhood: 'העיר הוותיקה',
          destNeighborhood: 'הקריה החרדית',
          city: 'בית שמש',
          price: 45,
          groupName: 'ובזמנו פנימי בית שמש',
          senderName: 'מוקד סדרן',
          senderPhone: '0528101833',
        },
      ];

      const pick = sampleList[Math.floor(Math.random() * sampleList.length)];
      await simulateRideApi(pick);
      playChime();
      await loadRides(false);
      showToast('🚀 נסיעת בדיקה שודרה לרדאר בהצלחה!');
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
        playChime();
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

  // Enrich rides with real-time calculated distance from driver's location
  const enrichedRides = useMemo(() => {
    return rides.map((ride) => {
      // Determine origin coords
      let coords = ride.coords;
      let originNeighborhood = ride.originNeighborhood;

      if (!coords || !originNeighborhood) {
        const detected = detectNeighborhood(ride.originText || ride.cleanedText || ride.rawText);
        if (detected) {
          originNeighborhood = detected.name;
          coords = { lat: detected.point.lat, lng: detected.point.lng };
        }
      }

      // Detect destination neighborhood
      let destNeighborhood = ride.destNeighborhood;
      if (!destNeighborhood) {
        const detectedDest = detectNeighborhood(ride.destinationText);
        if (detectedDest) {
          destNeighborhood = detectedDest.name;
        }
      }

      // Calculate distance if coords exist
      let distanceKm: number | null = null;
      let driveTimeMinutes: number | null = null;

      if (coords && driverLocation) {
        const dist = calculateDistanceKm(
          driverLocation.lat,
          driverLocation.lng,
          coords.lat,
          coords.lng
        );
        distanceKm = dist.roadKm;
        driveTimeMinutes = dist.driveTimeMin;
      }

      const wazeUrl = generateWazeUrl(ride.originText || originNeighborhood || 'בית שמש', 'בית שמש', coords || undefined);

      return {
        ...ride,
        originNeighborhood: originNeighborhood || 'בית שמש',
        destNeighborhood: destNeighborhood || ride.destinationText || 'יעד',
        coords,
        distanceKm,
        driveTimeMinutes,
        wazeUrl,
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
    <div className="fixed inset-0 z-50 bg-[#070a0f] text-slate-100 flex flex-col overflow-hidden font-sans select-none animate-in fade-in duration-200">
      {/* ========================================================= */}
      {/* 1. TOP HEADER & TELEMETRY BAR */}
      {/* ========================================================= */}
      <header className="px-3 sm:px-6 py-2.5 bg-[#0b1018] border-b border-[#1b2636] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          {/* Radar Beacon Logo */}
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-400">
            <Radio className="w-5 h-5 animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-emerald-400 absolute top-1.5 right-1.5 shadow-[0_0_8px_#34d399]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-1.5">
                רדאר נסיעות חי (Live Radar)
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                  בזמן אמת
                </span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400">
              חישוב מרחק מיידי, זיהוי שכונות ותפיסה סופר-מהירה בלחיצה אחת
            </p>
          </div>
        </div>

        {/* Live Clock & Quick Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Audio Chime Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border text-xs flex items-center gap-1 cursor-pointer transition-colors ${
              soundEnabled
                ? 'bg-teal-500/10 border-teal-500/30 text-teal-300 hover:bg-teal-500/20'
                : 'bg-[#121924] border-[#223044] text-slate-400 hover:text-white'
            }`}
            title={soundEnabled ? 'צליל התראה מופעל' : 'צליל התראה מושתק'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-teal-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline text-[11px]">{soundEnabled ? 'צליל פעיל' : 'מושתק'}</span>
          </button>

          {/* Test Ride Simulation Button */}
          <button
            onClick={handleSimulateTestRide}
            disabled={simulating}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-500/20 to-blue-500/20 hover:from-teal-500/30 hover:to-blue-500/30 border border-teal-500/40 text-teal-200 hover:text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
            title="שלח נסיעת דמה ברגע זה לבדיקת המערכת והרדאר"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-300" />
            <span>נסיעת הדגמה</span>
          </button>

          {/* Live Clock */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#080d14] border border-[#1e2b3c] font-mono text-xs text-teal-400">
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
      {/* 2. DRIVER LOCATION & DISTANCE FILTER TOOLBAR */}
      {/* ========================================================= */}
      <section className="px-3 sm:px-6 py-2.5 bg-[#0e141f] border-b border-[#1b2636] flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
        {/* Current Location Pill & GPS Button */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#080c13] border border-[#233348] text-slate-200">
            <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="text-slate-400">איפה אתה כרגע:</span>
            <strong className="text-teal-300 font-bold">{driverLocation.label}</strong>
            {driverLocation.source === 'gps' && (
              <span className="px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 text-[9px] font-mono">
                GPS
              </span>
            )}
          </div>

          {/* Button: Use device GPS */}
          <button
            onClick={handleRequestDeviceGps}
            disabled={isGettingGps}
            className="px-2.5 py-1.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-blue-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors font-medium text-xs"
            title="דקור מיקום GPS מדויק מהטלפון/מחשב"
          >
            <LocateFixed className={`w-3.5 h-3.5 ${isGettingGps ? 'animate-spin text-blue-400' : ''}`} />
            <span>{isGettingGps ? 'מאתר מיקום...' : 'דקור GPS מהמכשיר'}</span>
          </button>

          {/* Quick neighborhood pill selector */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5 sm:pb-0">
            <span className="text-slate-400 text-[11px] shrink-0 mr-1 hidden sm:inline">או בחר אזור:</span>
            {['רמה ד', 'רמה ג', 'רמה א', 'רמה ב', 'מרכז ביג', 'העיר הוותיקה', 'הר טוב'].map((k) => {
              const zone = BEIT_SHEMESH_ZONES[k];
              const isSelected = driverLocation.neighborhood === k;
              return (
                <button
                  key={k}
                  onClick={() => handleSelectZone(k)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer shrink-0 border ${
                    isSelected
                      ? 'bg-teal-500/20 border-teal-400 text-teal-200 font-bold'
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
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  maxDistanceFilter === f.val
                    ? 'bg-teal-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </section>

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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-slate-950" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. MAIN LIVE RIDES FEED & RADAR VIEW */}
      {/* ========================================================= */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
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
                ברגע שתפורסם נסיעה באחת מקבוצות הוואטסאפ שלך, היא תופיע כאן מיד עם חישוב מרחק מדויק ממיקומך, זיהוי השכונה וכפתור תפיסה מהיר.
              </p>
            </div>
            <button
              onClick={handleSimulateTestRide}
              className="px-4 py-2 rounded-xl bg-teal-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg hover:bg-teal-400 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>הפעל נסיעת בדיקה לדוגמה</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredRides.map((ride) => {
              const prox = ride.distanceKm !== null && ride.distanceKm !== undefined
                ? getProximityBadge(ride.distanceKm)
                : null;
              const isClaiming = claimingId === ride.id;
              const isClaimedSuccess = claimedSuccessId === ride.id;

              return (
                <div
                  key={ride.id}
                  className={`relative rounded-2xl bg-[#0c121b] border transition-all duration-200 flex flex-col justify-between overflow-hidden ${
                    isClaimedSuccess
                      ? 'border-emerald-500 shadow-[0_0_20px_rgba(52,211,153,0.3)] bg-emerald-950/20'
                      : prox?.isClose
                      ? 'border-emerald-500/40 shadow-[0_0_15px_rgba(52,211,153,0.1)] hover:border-emerald-400'
                      : 'border-[#1b2636] hover:border-[#2a3c54]'
                  }`}
                >
                  {/* Card Header: Meta + Time + Proximity */}
                  <div className="p-3 sm:p-4 pb-2 border-b border-[#162130] flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Internal vs Outgoing Tag */}
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            ride.isInternal
                              ? 'bg-purple-500/15 border border-purple-500/30 text-purple-300'
                              : 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                          }`}
                        >
                          {ride.isInternal ? 'פנימי בעיר' : 'בינעירוני'}
                        </span>

                        {/* Group Name */}
                        <span className="text-[11px] text-slate-400 truncate max-w-[140px]" title={ride.groupName}>
                          📍 {ride.groupName}
                        </span>
                      </div>

                      {/* Dispatcher */}
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <span>👤 סדרן:</span>
                        <strong className="text-slate-200">{ride.senderName}</strong>
                        <span>({ride.senderPhone})</span>
                      </div>
                    </div>

                    {/* Price Tag */}
                    {ride.price ? (
                      <div className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-sm shrink-0">
                        {ride.price} ₪
                      </div>
                    ) : null}
                  </div>

                  {/* Card Body: Route, Neighborhood, and Live Distance */}
                  <div className="p-3 sm:p-4 space-y-3">
                    {/* Visual Route */}
                    <div className="rounded-xl bg-[#080c13] border border-[#182333] p-3 space-y-2">
                      {/* Origin Spot & Neighborhood */}
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {ride.originText || 'נקודת איסוף'}
                          </div>
                          <div className="text-[11px] text-teal-400 font-medium">
                            🏷️ שכונה: <strong>{ride.originNeighborhood}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Line connector */}
                      <div className="ml-1 border-r-2 border-dashed border-[#243346] h-3 my-0.5 mr-1" />

                      {/* Destination Spot & Neighborhood */}
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {ride.destinationText || 'יעד נסיעה'}
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium">
                            🏁 {ride.destNeighborhood}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Live Distance from Driver's current position */}
                    {ride.distanceKm !== null && prox ? (
                      <div
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${prox.badgeBg}`}
                      >
                        <div className="flex items-center gap-2">
                          <Navigation className={`w-4 h-4 shrink-0 ${prox.colorClass}`} />
                          <div>
                            <span className="text-[10px] block opacity-80">מרחק ממיקומך הנוכחי:</span>
                            <span className="text-xs font-black">
                              כ-{ride.distanceKm} ק"מ ({ride.driveTimeMinutes} דק' נסיעה)
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full bg-black/30 ${prox.colorClass}`}>
                          {prox.label}
                        </span>
                      </div>
                    ) : (
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5" />
                        <span>מרחק משוער: מחושב לפי שכונת {ride.originNeighborhood}</span>
                      </div>
                    )}

                    {/* Original Raw Ride Snippet */}
                    <div className="p-2 rounded-lg bg-[#070a0f] border border-[#141d29] text-[11px] font-mono text-slate-400 line-clamp-2">
                      {ride.cleanedText || ride.rawText}
                    </div>
                  </div>

                  {/* Card Footer Actions: Waze Button + Instant Claim Button */}
                  <div className="p-3 bg-[#090e17] border-t border-[#162130] flex items-center gap-2">
                    {/* Waze Quick Navigation Button */}
                    <a
                      href={ride.wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-blue-300 hover:text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                      title="פתח כתובת זו ישירות באפליקציית Waze"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Waze</span>
                    </a>

                    {/* Direct WhatsApp to Dispatcher */}
                    {ride.senderPhone && (
                      <a
                        href={`https://wa.me/${ride.senderPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          `שלום, לגבי הנסיעה שפרסמת בקבוצה: ${ride.cleanedText || ride.rawText}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-[#141d29] hover:bg-[#1b2737] border border-[#233348] text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
                        title="פנה לסדרן בוואטסאפ אישי"
                      >
                        <Phone className="w-3.5 h-3.5 text-teal-400" />
                      </a>
                    )}

                    {/* Giant Claim Ride Button ("תפוס נסיעה - תן") */}
                    <button
                      onClick={() => handleClaimRide(ride)}
                      disabled={isClaiming || isClaimedSuccess}
                      className={`flex-1 py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-md ${
                        isClaimedSuccess
                          ? 'bg-emerald-500 text-slate-950'
                          : prox?.isClose
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-emerald-500/20'
                          : 'bg-teal-500 hover:bg-teal-400 text-slate-950'
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
                          <span>שולח תגובת "תן"...</span>
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
