// users-manager.js - ניהול משתמשים מאושרים, זיהוי ומיפוי Meta LID, בקשות הצטרפות, מעקב התראות מנהל וחיפושים פרטניים
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_FILE = path.join(__dirname, "users.json");
const USERS_BACKUP_FILE = path.join(__dirname, "users.backup.json");
const LID_MAP_FILE = path.join(__dirname, "lid-map.json");

const DEFAULT_USERS_DATA = {
  botPhone: "972555081810",     // מספר הטלפון המרכזי של הבוט (0555081810)
  adminPhone: "972515157166",   // מספר הטלפון של המנהל הראשי (0515157166)
  cooldownHours: 24,            // זמן המתנה (צינון) לפני שליחת הודעה חוזרת למספר לא מאושר
  approvedUsers: [
    {
      phone: "972515157166",
      name: "מנהל ראשי",
      role: "admin",
      addedAt: new Date().toISOString(),
    },
  ],
  pendingUsers: [],
};

// מעקב בזיכרון של תגובות אחרונות למניעת לולאה אינסופית והפצצה
const recentReplies = new Map(); // phone -> timestamp

// מעקב התראות למנהל: שולחים הודעה אחת בלבד בהצטרפות, והודעה אחת בלבד אם סיפק מספר טלפון
const adminAlertsSent = new Map(); // phone -> { initial: boolean, phoneProvided: boolean }

// חיפוש נסיעות מוגדר לפי כל נהג בנפרד (Per-User Search State)
const userSearches = new Map(); // cleanPhone -> searchState
const SEARCHES_FILE = path.join(__dirname, "searches.json");

// חיפושים פעילים נשמרים לדיסק כדי ש-pm2 restart / עדכון שרת לא יאפסו את החיפוש של הנהגים
try {
  if (existsSync(SEARCHES_FILE)) {
    const saved = JSON.parse(readFileSync(SEARCHES_FILE, "utf8"));
    for (const [p, st] of Object.entries(saved || {})) userSearches.set(p, st);
  }
} catch (err) {
  console.error("שגיאה בקריאת searches.json:", err.message);
}

function persistSearches() {
  try {
    const obj = {};
    for (const [p, st] of userSearches.entries()) obj[p] = st;
    writeFileSync(SEARCHES_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.error("שגיאה בשמירת searches.json:", err.message);
  }
}

function formatSearchesSummary(searches) {
  if (!searches || !Array.isArray(searches) || searches.length === 0) return "אין חיפוש פעיל";
  if (searches.length === 1) return searches[0].displayText || "חיפוש פעיל";
  return `${searches.length} חיפושים פעילים במקביל (${searches.map((s, i) => `${i + 1}. ${s.displayText}`).join(" | ")})`;
}

function normalizeSearchState(st) {
  if (!st || typeof st !== "object") {
    return {
      active: false,
      searches: [],
      pendingSearch: null,
      mode: null,
      origin: null,
      destination: null,
      displayText: "אין חיפוש פעיל",
    };
  }

  let searches = Array.isArray(st.searches) ? [...st.searches] : [];
  if (searches.length === 0 && st.active && st.origin) {
    searches = [{
      id: "s_migrated",
      mode: st.mode || "city_all",
      origin: st.origin,
      destination: st.destination || null,
      displayText: st.displayText || `${st.origin}`,
      addedAt: new Date().toISOString(),
    }];
  }

  const active = Boolean(st.active && searches.length > 0);
  const primary = searches[0] || null;

  return {
    active,
    searches,
    pendingSearch: st.pendingSearch || null,
    mode: primary?.mode || null,
    origin: primary?.origin || null,
    destination: primary?.destination || null,
    displayText: active ? formatSearchesSummary(searches) : (st.displayText || "מופסק (תפוס)"),
  };
}

export function shouldNotifyAdminInitial(phoneOrLid) {
  const p = cleanPhone(phoneOrLid);
  const info = adminAlertsSent.get(p) || { initial: false, phoneProvided: false };
  if (info.initial) return false;
  info.initial = true;
  adminAlertsSent.set(p, info);
  return true;
}

export function shouldNotifyAdminPhoneProvided(phoneOrLid) {
  const p = cleanPhone(phoneOrLid);
  const info = adminAlertsSent.get(p) || { initial: true, phoneProvided: false };
  if (info.phoneProvided) return false;
  info.phoneProvided = true;
  adminAlertsSent.set(p, info);
  return true;
}

export function getUserSearch(phone) {
  let p = cleanPhone(phone);
  let raw = userSearches.get(p);
  const rawDigits = String(phone).split("@")[0].split(":")[0].replace(/\D/g, "");

  if (!raw && rawDigits) {
    const lidMap = loadLidMap();
    const mapped = lidMap[rawDigits] || lidMap[p];
    if (mapped) {
      raw = userSearches.get(cleanPhone(mapped));
      p = cleanPhone(mapped);
    }
  }

  // בדיקה הפוכה: אם הפנייה היא לפי טלפון רגיל, בדיקה האם שמור תחת ה-LID שלו
  if (!raw) {
    const lidMap = loadLidMap();
    for (const [l, ph] of Object.entries(lidMap)) {
      if (cleanPhone(ph) === p) {
        raw = userSearches.get(l);
        if (raw) break;
      }
    }
  }

  return normalizeSearchState(raw);
}

export function setUserSearch(phone, searchState) {
  let p = cleanPhone(phone);
  const rawDigits = String(phone).split("@")[0].split(":")[0].replace(/\D/g, "");
  const lidMap = loadLidMap();
  const mapped = lidMap[rawDigits] || lidMap[p];
  if (mapped) {
    p = cleanPhone(mapped);
  }

  const normalized = normalizeSearchState(searchState);
  userSearches.set(p, normalized);

  // סנכרון דו-כיווני גם תחת מזהה ה-LID אם קיים
  if (mapped && rawDigits && rawDigits !== p) {
    userSearches.set(rawDigits, normalized);
  }

  persistSearches();
  return normalized;
}

export function addOrStageUserSearch(phone, newParsedQuery) {
  let p = cleanPhone(phone);
  const rawDigits = String(phone).split("@")[0].split(":")[0].replace(/\D/g, "");
  const lidMap = loadLidMap();
  const mapped = lidMap[rawDigits] || lidMap[p];
  if (mapped) p = cleanPhone(mapped);

  const current = getUserSearch(p);

  // בדיקה האם חיפוש זהה לחלוטין כבר קיים ברשימה
  const exists = current.searches.some(
    (s) => s.mode === newParsedQuery.mode &&
           s.origin === newParsedQuery.origin &&
           s.destination === newParsedQuery.destination
  );

  if (exists) {
    return { status: "already_exists", current };
  }

  // אם הנהג כרגע במצב תפוס או שאין לו שום חיפוש פעיל: מפעילים מיד ללא צורך באישור
  if (!current.active || current.searches.length === 0) {
    const item = {
      id: `s_${Date.now()}`,
      ...newParsedQuery,
      addedAt: new Date().toISOString(),
    };
    current.searches = [item];
    current.pendingSearch = null;
    current.active = true;
    const saved = setUserSearch(p, current);
    return { status: "activated_immediately", current: saved, item };
  }

  // יש כבר חיפוש אחד או יותר פעיל: מעבירים למצב המתנה לאישור הנהג
  const pendingItem = {
    id: `p_${Date.now()}`,
    ...newParsedQuery,
    stagedAt: new Date().toISOString(),
  };
  current.pendingSearch = pendingItem;
  const saved = setUserSearch(p, current);
  return { status: "pending_confirmation", current: saved, pending: pendingItem };
}

export function confirmPendingSearch(phone, replace = false) {
  let p = cleanPhone(phone);
  const rawDigits = String(phone).split("@")[0].split(":")[0].replace(/\D/g, "");
  const lidMap = loadLidMap();
  const mapped = lidMap[rawDigits] || lidMap[p];
  if (mapped) p = cleanPhone(mapped);

  let current = getUserSearch(p);

  // מנגנון הגנה Fail-Safe: אם לא נמצא חיפוש ממתין למספר זה ישירות,
  // סורקים האם יש נהג כלשהו שביצע חיפוש שנכנס להמתנה ב-15 הדקות האחרונות!
  if (!current.pendingSearch) {
    for (const [key, state] of userSearches.entries()) {
      if (state && state.pendingSearch) {
        const stagedAt = new Date(state.pendingSearch.stagedAt || 0).getTime();
        if (Date.now() - stagedAt < 15 * 60 * 1000) {
          p = key;
          current = normalizeSearchState(state);
          // אם הפנייה הגיעה מחשבון LID, רושמים מיפוי קבוע לנהג זה!
          if (rawDigits && rawDigits !== p) {
            registerLidMapping(rawDigits, p);
          }
          break;
        }
      }
    }
  }

  if (!current.pendingSearch) {
    return { success: false, reason: "no_pending" };
  }

  const added = current.pendingSearch;
  if (replace) {
    current.searches = [added];
  } else {
    current.searches.push(added);
  }
  current.pendingSearch = null;
  current.active = true;
  const saved = setUserSearch(p, current);
  return { success: true, current: saved, added, driverPhone: p };
}

export function cancelPendingSearch(phone) {
  let p = cleanPhone(phone);
  const rawDigits = String(phone).split("@")[0].split(":")[0].replace(/\D/g, "");
  const lidMap = loadLidMap();
  const mapped = lidMap[rawDigits] || lidMap[p];
  if (mapped) p = cleanPhone(mapped);

  let current = getUserSearch(p);
  if (!current.pendingSearch) {
    for (const [key, state] of userSearches.entries()) {
      if (state && state.pendingSearch) {
        const stagedAt = new Date(state.pendingSearch.stagedAt || 0).getTime();
        if (Date.now() - stagedAt < 15 * 60 * 1000) {
          p = key;
          current = normalizeSearchState(state);
          if (rawDigits && rawDigits !== p) {
            registerLidMapping(rawDigits, p);
          }
          break;
        }
      }
    }
  }

  if (!current.pendingSearch) {
    return { success: false, reason: "no_pending" };
  }
  const cancelled = current.pendingSearch;
  current.pendingSearch = null;
  const saved = setUserSearch(p, current);
  return { success: true, current: saved, cancelled, driverPhone: p };
}

export function removeUserSearchByIndex(phone, index1Based) {
  const p = cleanPhone(phone);
  const current = getUserSearch(p);
  const idx = Number(index1Based) - 1;
  if (idx < 0 || idx >= current.searches.length) {
    return { success: false, reason: "invalid_index", current };
  }
  const removed = current.searches.splice(idx, 1)[0];
  if (current.searches.length === 0) {
    current.active = false;
  }
  const saved = setUserSearch(p, current);
  return { success: true, current: saved, removed };
}

export function stopUserSearch(phone) {
  const p = cleanPhone(phone);
  const empty = {
    active: false,
    searches: [],
    pendingSearch: null,
    mode: null,
    origin: null,
    destination: null,
    displayText: "מופסק (תפוס)",
  };
  userSearches.set(p, empty);
  persistSearches();
  return empty;
}

export function getAllUserSearches() {
  const obj = {};
  for (const [p, s] of userSearches.entries()) {
    obj[p] = normalizeSearchState(s);
  }
  return obj;
}

export function loadLidMap() {
  try {
    if (existsSync(LID_MAP_FILE)) {
      const raw = readFileSync(LID_MAP_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("שגיאה בקריאת lid-map.json:", err.message);
  }
  return {};
}

export function saveLidMap(map) {
  try {
    writeFileSync(LID_MAP_FILE, JSON.stringify(map, null, 2), "utf8");
  } catch (err) {
    console.error("שגיאה בשמירת lid-map.json:", err.message);
  }
}

export function removeLidMapping(phoneOrLid) {
  if (!phoneOrLid) return false;
  const p = cleanPhone(phoneOrLid);
  const raw = String(phoneOrLid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  const map = loadLidMap();
  let changed = false;
  for (const [k, v] of Object.entries(map)) {
    if (k === raw || k === p || v === p || v === raw) {
      delete map[k];
      changed = true;
    }
  }
  if (changed) {
    saveLidMap(map);
    console.log(`🧹 נמחק מיפוי LID עבור: ${raw || p}`);
  }
  return changed;
}

export function clearAllLidMappings() {
  saveLidMap({});
  console.log("🧹 כל מיפויי ה-LID אופסו ונמחקו לחלוטין מ-lid-map.json");
  return true;
}

// זיהוי האם מזהה הוא Meta LID
export function isLid(input) {
  if (!input) return false;
  const str = String(input);
  if (str.includes("@lid")) return true;
  const digits = str.replace(/\D/g, "");
  if (digits.length >= 13 && !digits.startsWith("9725") && !digits.startsWith("97205")) {
    return true;
  }
  return false;
}

export function cleanPhoneWithoutLid(input) {
  if (!input) return "";
  let str = String(input).split("@")[0].split(":")[0].replace(/\D/g, "");
  if (str.startsWith("0")) str = "972" + str.slice(1);
  return str;
}

export function cleanPhone(input) {
  if (!input) return "";
  let str = String(input).split("@")[0].split(":")[0].replace(/\D/g, "");
  
  const lidMap = loadLidMap();
  if (lidMap[str]) {
    return lidMap[str];
  }

  // בדיקת גיבוי ישירה מתוך קובץ users.json ללא קריאה ל-loadUsersData (מונע רקורסיה)
  try {
    if (existsSync(USERS_FILE)) {
      const raw = readFileSync(USERS_FILE, "utf8");
      const parsed = JSON.parse(raw);
      const foundApproved = (parsed.approvedUsers || []).find(
        (u) => (u.lid && u.lid === str) || (u.phone && cleanPhoneWithoutLid(u.phone) === str)
      );
      if (foundApproved) {
        if (foundApproved.mappedPhone) return foundApproved.mappedPhone;
        if (foundApproved.phone && !isLid(foundApproved.phone)) return cleanPhoneWithoutLid(foundApproved.phone);
      }
    }
  } catch (e) {}

  if (str.startsWith("0")) str = "972" + str.slice(1);
  return str;
}

// קביעת JID יעד מדויק לשליחת הודעת וואטסאפ
export function getDestinationJid(input) {
  if (!input) return "";
  const raw = String(input).trim();
  if (raw.endsWith("@lid") || raw.endsWith("@s.whatsapp.net")) {
    return raw;
  }

  const digits = raw.replace(/\D/g, "");
  const lidMap = loadLidMap();

  if (lidMap[digits]) {
    let p = lidMap[digits];
    if (p.startsWith("0")) p = "972" + p.slice(1);
    return `${p}@s.whatsapp.net`;
  }

  if (isLid(raw) || isLid(digits)) {
    return `${digits}@lid`;
  }

  let p = digits;
  if (p.startsWith("0")) p = "972" + p.slice(1);
  return `${p}@s.whatsapp.net`;
}

export function registerLidMapping(rawLid, realPhone) {
  const lid = String(rawLid).split("@")[0].split(":")[0].replace(/\D/g, "");
  let clean = String(realPhone).split("@")[0].split(":")[0].replace(/\D/g, "");
  if (clean.startsWith("0")) clean = "972" + clean.slice(1);

  if (!lid || !clean) return false;

  const map = loadLidMap();
  map[lid] = clean;
  saveLidMap(map);

  const users = loadUsersData();
  let changed = false;

  for (const u of users.approvedUsers) {
    if (u.phone === lid || u.phone === rawLid || u.lid === lid) {
      u.lid = lid;
      u.phone = clean;
      u.mappedPhone = clean;
      changed = true;
    }
  }

  for (const u of users.pendingUsers) {
    if (u.phone === lid || u.phone === rawLid || u.lid === lid) {
      u.lid = lid;
      u.phone = clean;
      u.mappedPhone = clean;
      changed = true;
    }
  }

  if (changed) {
    saveUsersData(users);
  }

  return true;
}

export function updateUserPhone(oldIdentifier, newPhone) {
  const oldClean = String(oldIdentifier).split("@")[0].split(":")[0].replace(/\D/g, "");
  let newClean = String(newPhone).split("@")[0].split(":")[0].replace(/\D/g, "");
  if (newClean.startsWith("0")) newClean = "972" + newClean.slice(1);

  if (!oldClean || !newClean) return { success: false, error: "מספר לא תקין" };

  const users = loadUsersData();
  let found = false;

  for (const u of users.approvedUsers) {
    if (u.phone === oldClean || u.phone === oldIdentifier || u.lid === oldClean || (u.id && u.id === oldIdentifier)) {
      if (isLid(oldClean)) u.lid = oldClean;
      u.phone = newClean;
      u.mappedPhone = newClean;
      found = true;
    }
  }

  for (const u of users.pendingUsers) {
    if (u.phone === oldClean || u.phone === oldIdentifier || u.lid === oldClean || (u.id && u.id === oldIdentifier)) {
      if (isLid(oldClean)) u.lid = oldClean;
      u.phone = newClean;
      u.mappedPhone = newClean;
      found = true;
    }
  }

  if (isLid(oldClean)) {
    registerLidMapping(oldClean, newClean);
  }

  saveUsersData(users);
  return { success: true, oldPhone: oldClean, newPhone: newClean, updated: found };
}

export function editUserDetails(oldPhone, { name, phone: newPhone, role }) {
  const users = loadUsersData();
  const oldClean = cleanPhone(oldPhone);
  const target = users.approvedUsers.find(
    (u) => cleanPhone(u.phone) === oldClean || (u.lid && u.lid === String(oldPhone))
  );

  if (!target) {
    return { success: false, error: "משתמש לא נמצא ברשימת המאושרים" };
  }

  if (name && typeof name === "string") {
    target.name = name.trim();
  }
  if (role && (role === "admin" || role === "driver" || role === "user")) {
    target.role = role;
  }
  if (newPhone) {
    let newClean = String(newPhone).split("@")[0].split(":")[0].replace(/\D/g, "");
    if (newClean.startsWith("0")) newClean = "972" + newClean.slice(1);
    if (newClean && newClean !== target.phone) {
      if (isLid(target.phone)) {
        target.lid = target.phone;
        registerLidMapping(target.phone, newClean);
      }
      target.phone = newClean;
    }
  }

  saveUsersData(users);
  return { success: true, user: target };
}

export function loadUsersData() {
  try {
    if (existsSync(USERS_FILE)) {
      const raw = readFileSync(USERS_FILE, "utf8");
      const parsed = JSON.parse(raw);
      const data = { ...DEFAULT_USERS_DATA, ...parsed };

      const lidMap = loadLidMap();
      let changed = false;

      data.approvedUsers = (data.approvedUsers || []).map((u, i) => {
        const item = { ...u };
        if (!item.id) {
          item.id = `appr-${item.phone || i}-${Date.now().toString(36)}`;
          changed = true;
        }
        if (isLid(item.phone) && lidMap[item.phone]) {
          item.lid = item.phone;
          item.phone = lidMap[item.phone];
          item.mappedPhone = lidMap[item.phone];
          changed = true;
        } else if (item.lid && lidMap[item.lid]) {
          item.mappedPhone = lidMap[item.lid];
          if (isLid(item.phone)) {
            item.phone = lidMap[item.lid];
            changed = true;
          }
        }
        return item;
      });

      data.pendingUsers = (data.pendingUsers || []).map((u, i) => {
        const item = { ...u };
        if (!item.id) {
          item.id = `pend-${item.phone || i}-${Date.now().toString(36)}`;
          changed = true;
        }
        if (isLid(item.phone) && lidMap[item.phone]) {
          item.lid = item.phone;
          item.phone = lidMap[item.phone];
          item.mappedPhone = lidMap[item.phone];
          changed = true;
        } else if (item.lid && lidMap[item.lid]) {
          item.mappedPhone = lidMap[item.lid];
          if (isLid(item.phone)) {
            item.phone = lidMap[item.lid];
            changed = true;
          }
        }
        return item;
      });

      // שחזור אוטומטי מגיבוי אם users.json נדרס בעדכון שרת
      if (existsSync(USERS_BACKUP_FILE)) {
        try {
          const backupRaw = readFileSync(USERS_BACKUP_FILE, "utf8");
          const backupParsed = JSON.parse(backupRaw);
          if (Array.isArray(backupParsed.approvedUsers)) {
            for (const bu of backupParsed.approvedUsers) {
              const buPhone = cleanPhone(bu.phone);
              if (buPhone && !data.approvedUsers.some((u) => cleanPhone(u.phone) === buPhone)) {
                console.log(`🛡️ משחזר נהג מאושר מגיבוי קבוע: ${bu.name || buPhone}`);
                data.approvedUsers.push(bu);
                changed = true;
              }
            }
          }
        } catch (e) {}
      }

      if (changed) {
        saveUsersData(data);
      }

      return data;
    }
  } catch (err) {
    console.error("שגיאה בקריאת users.json:", err.message);
  }
  saveUsersData(DEFAULT_USERS_DATA);
  return DEFAULT_USERS_DATA;
}

export function saveUsersData(data) {
  try {
    writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), "utf8");
    if (data && Array.isArray(data.approvedUsers) && data.approvedUsers.length > 0) {
      writeFileSync(USERS_BACKUP_FILE, JSON.stringify(data, null, 2), "utf8");
    }
  } catch (err) {
    console.error("שגיאה בשמירת users.json:", err.message);
  }
}

export function isUserApproved(phoneOrLid) {
  if (!phoneOrLid) return false;
  const p = cleanPhone(phoneOrLid);
  const data = loadUsersData();
  if (p === cleanPhone(data.adminPhone)) return true;
  if (p === cleanPhone(data.botPhone)) return true;

  const raw = String(phoneOrLid).split("@")[0].split(":")[0].replace(/\D/g, "");
  const lidMap = loadLidMap();
  const mapped = lidMap[raw] || lidMap[p];
  if (mapped && (cleanPhone(mapped) === cleanPhone(data.adminPhone) || cleanPhone(mapped) === cleanPhone(data.botPhone))) return true;

  return data.approvedUsers.some(
    (u) => cleanPhone(u.phone) === p || 
           (mapped && cleanPhone(u.phone) === cleanPhone(mapped)) ||
           (u.lid && (u.lid === String(phoneOrLid) || u.lid === raw || (mapped && u.lid === mapped))) ||
           (u.mappedPhone && (cleanPhone(u.mappedPhone) === p || (mapped && cleanPhone(u.mappedPhone) === cleanPhone(mapped)))) ||
           (u.id && (u.id === String(phoneOrLid) || u.id === raw))
  );
}

export function isUserAdmin(phoneOrLid) {
  const p = cleanPhone(phoneOrLid);
  const data = loadUsersData();
  return p === cleanPhone(data.adminPhone);
}

export function canReplyToUnapproved(phoneOrLid, incomingText = "") {
  const norm = typeof incomingText === "string" ? incomingText.trim().toLowerCase() : "";
  // אל תחסום לעולם פקודות חיפוש או פקודות אישור במקביל ("1", "כן", "2", "תפוס", "פנוי")
  if (
    norm === "1" || norm === "כן" || norm === "2" || norm === "הוסף" || norm === "החלף" ||
    norm === "ביטול" || norm === "לא" || norm === "תפריט" || norm === "חבר אותי" ||
    norm.startsWith("פנוי") || norm.startsWith("פ ") || norm === "תפוס" || norm === "עצור"
  ) {
    return true;
  }

  const p = cleanPhone(phoneOrLid);
  const data = loadUsersData();
  const cooldownMs = (data.cooldownHours || 24) * 60 * 60 * 1000;
  const last = recentReplies.get(p) || 0;
  const now = Date.now();

  if (now - last < cooldownMs) {
    return false;
  }
  recentReplies.set(p, now);
  return true;
}

export function resetUserCooldown(phoneOrLid) {
  const p = cleanPhone(phoneOrLid);
  const raw = String(phoneOrLid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  recentReplies.delete(p);
  if (raw) recentReplies.delete(raw);
  adminAlertsSent.delete(p);
  if (raw) adminAlertsSent.delete(raw);
  return true;
}

export function addPendingUser(phoneOrLid, name = "") {
  const p = cleanPhone(phoneOrLid);
  const data = loadUsersData();
  if (isUserApproved(p)) return { alreadyApproved: true };

  const raw = String(phoneOrLid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  const isIdentifierLid = isLid(raw) || isLid(phoneOrLid);
  const lidMap = loadLidMap();
  const mappedPhone = lidMap[raw] || lidMap[p] || (isIdentifierLid ? undefined : p);

  const existing = data.pendingUsers.find(
    (u) => (p && cleanPhone(u.phone) === p) || 
           (raw && u.lid && u.lid === raw) ||
           (raw && u.phone === raw)
  );

  let isNew = false;
  if (existing) {
    existing.requestedAt = new Date().toISOString();
    if (name) existing.name = name;
    if (isIdentifierLid) existing.lid = raw;
    if (mappedPhone) existing.mappedPhone = mappedPhone;
  } else {
    isNew = true;
    data.pendingUsers.push({
      id: `pend-${raw || Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      phone: mappedPhone || p || raw || "ללא מספר",
      lid: isIdentifierLid ? raw : undefined,
      mappedPhone: mappedPhone || undefined,
      name: name || (isIdentifierLid ? "משתמש וואטסאפ (LID)" : "משתמש חדש"),
      requestedAt: new Date().toISOString(),
    });
  }
  saveUsersData(data);
  return { success: true, isNew };
}

export function approveUser(phoneOrLid, name = "") {
  const p = cleanPhone(phoneOrLid);
  const data = loadUsersData();
  const raw = String(phoneOrLid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  const isIdentifierLid = isLid(raw) || isLid(phoneOrLid);
  const lidMap = loadLidMap();
  const mappedPhone = lidMap[raw] || lidMap[p];

  data.pendingUsers = data.pendingUsers.filter((u) => {
    if (u.id && u.id === phoneOrLid) return false;
    if (raw && (u.phone === raw || u.lid === raw)) return false;
    if (p && cleanPhone(u.phone) === p) return false;
    return true;
  });

  const effectivePhone = mappedPhone || p || raw;

  const alreadyApproved = data.approvedUsers.some(
    (u) => (effectivePhone && cleanPhone(u.phone) === cleanPhone(effectivePhone)) || 
           (raw && u.lid === raw)
  );

  if (!alreadyApproved) {
    data.approvedUsers.push({
      id: `appr-${effectivePhone}-${Math.random().toString(36).slice(2, 6)}`,
      phone: effectivePhone,
      lid: isIdentifierLid ? raw : undefined,
      mappedPhone: mappedPhone || undefined,
      name: name || `נהג (${effectivePhone})`,
      role: "driver",
      addedAt: new Date().toISOString(),
    });
  }
  saveUsersData(data);
  return { success: true, phone: effectivePhone };
}

export function rejectUser(identifier) {
  if (!identifier) return { success: false, error: "נדרש מזהה למחיקה" };
  const strId = String(identifier).trim();
  const rawDigits = strId.split("@")[0].split(":")[0].replace(/\D/g, "");
  const cleanP = cleanPhone(strId);
  const data = loadUsersData();

  const initialCount = data.pendingUsers.length + data.approvedUsers.length;

  data.pendingUsers = data.pendingUsers.filter((u) => {
    if (u.id && u.id === strId) return false;
    if (u.phone && (u.phone === strId || (cleanP && cleanPhone(u.phone) === cleanP))) return false;
    if (u.lid && (u.lid === strId || (rawDigits && u.lid === rawDigits))) return false;
    if (u.name && u.name === strId) return false;
    return true;
  });

  data.approvedUsers = data.approvedUsers.filter((u) => {
    if (cleanPhone(u.phone) === cleanPhone(data.adminPhone)) return true;
    if (u.id && u.id === strId) return false;
    if (u.phone && (u.phone === strId || (cleanP && cleanPhone(u.phone) === cleanP))) return false;
    if (u.lid && (u.lid === strId || (rawDigits && u.lid === rawDigits))) return false;
    if (u.name && u.name === strId) return false;
    return true;
  });

  if (cleanP) resetUserCooldown(cleanP);
  if (rawDigits) resetUserCooldown(rawDigits);
  removeLidMapping(identifier);
  if (cleanP) removeLidMapping(cleanP);
  if (rawDigits) removeLidMapping(rawDigits);

  saveUsersData(data);
  return { success: true, removedCount: initialCount - (data.pendingUsers.length + data.approvedUsers.length) };
}

export function deleteApprovedUser(identifier) {
  if (!identifier) return { success: false, error: "נדרש מזהה למחיקה" };
  const strId = String(identifier).trim();
  const cleanP = cleanPhone(strId);
  const rawDigits = strId.split("@")[0].split(":")[0].replace(/\D/g, "");
  const data = loadUsersData();

  if (cleanP && cleanP === cleanPhone(data.adminPhone)) {
    return { success: false, error: "לא ניתן למחוק את מנהל המערכת הראשי" };
  }

  const beforeLen = data.approvedUsers.length;
  data.approvedUsers = data.approvedUsers.filter((u) => {
    if (cleanPhone(u.phone) === cleanPhone(data.adminPhone)) return true;
    if (u.id && u.id === strId) return false;
    if (u.phone && (u.phone === strId || (cleanP && cleanPhone(u.phone) === cleanP))) return false;
    if (u.lid && (u.lid === strId || (rawDigits && u.lid === rawDigits))) return false;
    return true;
  });

  if (cleanP) resetUserCooldown(cleanP);
  if (rawDigits) resetUserCooldown(rawDigits);
  removeLidMapping(identifier);
  if (cleanP) removeLidMapping(cleanP);
  if (rawDigits) removeLidMapping(rawDigits);

  saveUsersData(data);
  return { success: true, removed: beforeLen !== data.approvedUsers.length };
}
