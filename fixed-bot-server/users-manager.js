// users-manager.js - ניהול משתמשים מאושרים, זיהוי ומיפוי Meta LID, בקשות הצטרפות, מעקב התראות מנהל וחיפושים פרטניים
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_FILE = path.join(__dirname, "users.json");
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
  const p = cleanPhone(phone);
  return userSearches.get(p) || { active: false, mode: null, origin: null, destination: null, displayText: "אין חיפוש פעיל" };
}

export function setUserSearch(phone, searchState) {
  const p = cleanPhone(phone);
  userSearches.set(p, searchState);
  persistSearches();
}

export function stopUserSearch(phone) {
  const p = cleanPhone(phone);
  const empty = { active: false, mode: null, origin: null, destination: null, displayText: "מופסק (תפוס)" };
  userSearches.set(p, empty);
  persistSearches();
  return empty;
}

export function getAllUserSearches() {
  const obj = {};
  for (const [p, s] of userSearches.entries()) {
    obj[p] = s;
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

export function cleanPhone(input) {
  if (!input) return "";
  let str = String(input).split("@")[0].split(":")[0].replace(/\D/g, "");
  
  const lidMap = loadLidMap();
  if (lidMap[str]) {
    return lidMap[str];
  }

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
  return data.approvedUsers.some(
    (u) => cleanPhone(u.phone) === p || 
           (u.lid && (u.lid === String(phoneOrLid) || u.lid === raw)) ||
           (u.id && u.id === String(phoneOrLid))
  );
}

export function isUserAdmin(phoneOrLid) {
  const p = cleanPhone(phoneOrLid);
  const data = loadUsersData();
  return p === cleanPhone(data.adminPhone);
}

export function canReplyToUnapproved(phoneOrLid) {
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
