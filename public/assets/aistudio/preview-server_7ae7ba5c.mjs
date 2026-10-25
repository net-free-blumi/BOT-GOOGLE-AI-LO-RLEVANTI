import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "HTML");
const PORT = 4173;
const PASSWORD = process.env.DASHBOARD_PASSWORD || "demo";
const token = "preview-token";
const started = Date.now();

let search = { active: false, mode: null, origin: null, destination: null, displayText: "", describe: "אין חיפוש פעיל" };
const logs = [
  { t: Date.now() - 40000, type: "system", message: "שרת תצוגה מקומי פעיל (לא הבוט האמיתי)" },
];

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function applyCommand(command) {
  const c = String(command || "").trim();
  if (/תפוס|עצור|סגור/.test(c)) {
    search = { active: false, mode: null, origin: null, destination: null, displayText: "", describe: "אין חיפוש פעיל" };
    logs.unshift({ t: Date.now(), type: "command", message: "חיפוש הופסק" });
    return { ok: true, message: "החיפוש הופסק", search };
  }
  if (c.includes("פנימי") || c.includes("פ שמש")) {
    search = { active: true, mode: "internal", origin: "בית שמש", destination: null, displayText: "בית שמש (פנימי)", describe: "רק נסיעות בתוך בית שמש" };
  } else if (c.includes("לירושלים")) {
    search = { active: true, mode: "route", origin: "בית שמש", destination: "ירושלים", displayText: "בית שמש ⬅️ ירושלים", describe: "רק נסיעות מבית שמש לירושלים" };
  } else if (c.includes("לבית שמש")) {
    search = { active: true, mode: "route", origin: "ירושלים", destination: "בית שמש", displayText: "ירושלים ⬅️ בית שמש", describe: "רק נסיעות מירושלים לבית שמש" };
  } else {
    search = { active: true, mode: "from", origin: "בית שמש", destination: null, displayText: "בית שמש", describe: "נסיעות שיוצאות מבית שמש" };
  }
  logs.unshift({ t: Date.now(), type: "command", message: "הופעל חיפוש: " + search.displayText });
  return { ok: true, message: "חיפוש הופעל: " + search.displayText, search };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let body = "";
  if (req.method !== "GET") {
    for await (const chunk of req) body += chunk;
  }
  let payload = {};
  if (body) {
    try { payload = JSON.parse(body); } catch { payload = {}; }
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    if (payload.password !== PASSWORD) return json(res, 401, { error: "סיסמה שגויה" });
    return json(res, 200, { ok: true, token });
  }

  if (url.pathname.startsWith("/api/")) {
    const auth = req.headers.authorization || "";
    if (auth !== "Bearer " + token) return json(res, 401, { error: "נדרשת התחברות" });
  }

  if (url.pathname === "/api/status") {
    const uptime = Math.floor((Date.now() - started) / 1000);
    return json(res, 200, {
      ok: true,
      apiVersion: 2,
      wa: { connected: true, registered: true, pairingCode: null },
      search,
      server: { cpuLoad: "0.12", loadAvg: ["0.12", "0.08", "0.05"], ramUsageMB: 96, ramPercentage: 18, ramUsedMB: 1100, ramTotalMB: 5900, uptime, pm2: "preview", node: process.version },
      stats: { scanned: 24, sent: 3, rejected: 18, duplicates: 3, groups: 4, dedupeSize: 7 },
      settings: { dedupeMinutes: 15, debugFilter: true, notifyOnReset: false, defaultCity: "בית שמש", strictDirection: true },
      ramUsageMB: 96, ramPercentage: 18, cpuLoad: "0.12", uptime
    });
  }

  if (url.pathname === "/api/logs") {
    const type = url.searchParams.get("type") || "all";
    const rows = type === "all" ? logs : logs.filter((l) => l.type === type);
    return json(res, 200, { ok: true, logs: rows });
  }

  if (url.pathname === "/api/search" && req.method === "POST") return json(res, 200, applyCommand(payload.command));
  if (url.pathname === "/api/search/stop" && req.method === "POST") return json(res, 200, applyCommand("תפוס"));
  if (url.pathname === "/api/bot/restart" && req.method === "POST") return json(res, 200, { success: true, message: "תצוגה מקומית: restart מדומה" });
  if (url.pathname === "/api/bot/stop" && req.method === "POST") return json(res, 200, { success: true, message: "תצוגה מקומית: stop מדומה" });

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = readFileSync(join(root, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Preview: http://127.0.0.1:" + PORT + "  password: " + PASSWORD);
});
