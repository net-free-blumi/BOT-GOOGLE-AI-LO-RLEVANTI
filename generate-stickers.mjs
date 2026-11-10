// generate-stickers.mjs - יצירת מדבקות וואטסאפ עגולות שקופות לחלוטין (512x512 WebP)
// בסגנון רובוט מודרני ידידותי עם סרטים מעוצבים בעברית:
// 1. "בהצלחה בדרך!" (עצירת חיפוש / תפוס)
// 2. "אני על זה!" (הפעלת חיפוש נסיעות / פנוי)
// 3. "לא הבנתי 🤔" (פקודה לא מוכרת / הודעה מבלבלת)

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_ASSETS = path.join(__dirname, "fixed-bot-server", "assets");
const PUBLIC_ASSETS = path.join(__dirname, "public", "assets");

if (!fs.existsSync(SERVER_ASSETS)) fs.mkdirSync(SERVER_ASSETS, { recursive: true });
if (!fs.existsSync(PUBLIC_ASSETS)) fs.mkdirSync(PUBLIC_ASSETS, { recursive: true });

function createSvg({ title, type, bannerText }) {
  // סגנון רובוט עגול, רקע שקוף לחלוטין (ללא שום מלבן רקע!)
  let eyesSvg = '';
  let accessorySvg = '';
  let bannerColor1 = '#047857';
  let bannerColor2 = '#10b981';

  if (type === 'busy') {
    // בהצלחה בדרך: עיניים שמחות ומחייכות (קשתות זוהרות ^ ^), צ'קמארק וכוכבים
    eyesSvg = `
      <!-- Happy smiling curved eyes -->
      <path d="M 205 235 Q 225 210 245 235" fill="none" stroke="#34d399" stroke-width="12" stroke-linecap="round" />
      <path d="M 267 235 Q 287 210 307 235" fill="none" stroke="#34d399" stroke-width="12" stroke-linecap="round" />
      <!-- Cheerful blush dots -->
      <circle cx="195" cy="250" r="10" fill="#10b981" opacity="0.5" />
      <circle cx="317" cy="250" r="10" fill="#10b981" opacity="0.5" />
    `;
    accessorySvg = `
      <!-- Checkmark badge on right side -->
      <g transform="translate(350, 220)">
        <circle cx="0" cy="0" r="28" fill="#10b981" stroke="#ffffff" stroke-width="4" filter="url(#glow)" />
        <path d="M -12 0 L -3 10 L 14 -8" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      </g>
      <!-- Sparkles -->
      <path d="M 360 140 Q 360 155 375 155 Q 360 155 360 170 Q 360 155 345 155 Q 360 155 360 140" fill="#6ee7b7" />
      <path d="M 140 160 Q 140 170 150 170 Q 140 170 140 180 Q 140 170 130 170 Q 140 170 140 160" fill="#34d399" />
    `;
  } else if (type === 'search') {
    // אני על זה: עיניים ממוקדות וערניות + זכוכית מגדלת זוהרת עם גלי רדאר
    eyesSvg = `
      <!-- Wide focused eyes with tech shine -->
      <circle cx="225" cy="230" r="18" fill="#34d399" filter="url(#glow)" />
      <circle cx="228" cy="227" r="7" fill="#ffffff" />
      <circle cx="287" cy="230" r="18" fill="#34d399" filter="url(#glow)" />
      <circle cx="290" cy="227" r="7" fill="#ffffff" />
      <!-- Focused smile -->
      <path d="M 240 258 Q 256 268 272 258" fill="none" stroke="#6ee7b7" stroke-width="6" stroke-linecap="round" />
    `;
    accessorySvg = `
      <!-- Glowing high-tech Magnifying Glass on right side -->
      <g transform="translate(365, 225) rotate(-20)">
        <circle cx="0" cy="0" r="32" fill="#042f2e" stroke="#34d399" stroke-width="7" filter="url(#glow)" />
        <circle cx="0" cy="0" r="23" fill="#0f766e" opacity="0.6" />
        <path d="M -10 -10 Q 0 -18 12 -12" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.8" />
        <!-- Handle -->
        <rect x="-6" y="30" width="12" height="34" rx="6" fill="#14b8a6" stroke="#ffffff" stroke-width="3" />
        <!-- Radar rings inside lens -->
        <circle cx="0" cy="0" r="10" fill="none" stroke="#a7f3d0" stroke-width="2" stroke-dasharray="3,3" />
        <circle cx="0" cy="0" r="4" fill="#6ee7b7" />
      </g>
      <!-- Sparkles -->
      <path d="M 130 145 Q 130 160 145 160 Q 130 160 130 175 Q 130 160 115 160 Q 130 160 130 145" fill="#34d399" />
      <path d="M 370 130 Q 370 140 380 140 Q 370 140 370 150 Q 370 140 360 140 Q 370 140 370 130" fill="#a7f3d0" />
    `;
  } else {
    // לא הבנתי: ראש מוטה קלות, גבה מורמת, סימן שאלה זוהר
    bannerColor1 = '#065f46';
    bannerColor2 = '#0d9488';
    eyesSvg = `
      <!-- One eye normal, one squinting / thinking -->
      <circle cx="225" cy="230" r="18" fill="#34d399" filter="url(#glow)" />
      <circle cx="228" cy="227" r="7" fill="#ffffff" />
      <!-- Curious eyebrow above right eye -->
      <path d="M 275 208 Q 290 200 305 212" fill="none" stroke="#34d399" stroke-width="6" stroke-linecap="round" />
      <path d="M 275 235 Q 290 220 305 235" fill="none" stroke="#34d399" stroke-width="10" stroke-linecap="round" />
      <!-- Puzzled curved mouth -->
      <path d="M 245 264 Q 256 254 268 262" fill="none" stroke="#6ee7b7" stroke-width="6" stroke-linecap="round" />
    `;
    accessorySvg = `
      <!-- Floating Glowing 3D Question Mark -->
      <g transform="translate(355, 155)">
        <circle cx="0" cy="0" r="28" fill="#064e3b" stroke="#34d399" stroke-width="4" filter="url(#glow)" />
        <text x="0" y="11" font-family="'Noto Sans Hebrew', sans-serif" font-weight="900" font-size="34" fill="#ffffff" text-anchor="middle">?</text>
      </g>
      <!-- Small question mark on other side -->
      <g transform="translate(145, 185) scale(0.7)">
        <circle cx="0" cy="0" r="24" fill="#042f2e" stroke="#10b981" stroke-width="3" />
        <text x="0" y="9" font-family="'Noto Sans Hebrew', sans-serif" font-weight="900" font-size="28" fill="#a7f3d0" text-anchor="middle">?</text>
      </g>
    `;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Filter for soft neon glow -->
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#022c22" flood-opacity="0.8" />
    </filter>
    <filter id="banner-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.7" />
    </filter>

    <!-- Gradients -->
    <linearGradient id="haloGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="50%" stop-color="#059669" />
      <stop offset="100%" stop-color="#047857" />
    </linearGradient>

    <linearGradient id="helmetGrad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="40%" stop-color="#f0fdf4" />
      <stop offset="100%" stop-color="#d1fae5" />
    </linearGradient>

    <linearGradient id="visorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#064e3b" />
      <stop offset="40%" stop-color="#022c22" />
      <stop offset="100%" stop-color="#011b15" />
    </linearGradient>

    <linearGradient id="bannerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${bannerColor2}" />
      <stop offset="50%" stop-color="${bannerColor1}" />
      <stop offset="100%" stop-color="#022c22" />
    </linearGradient>
  </defs>

  <!-- 1. Glowing outer circular tech halo (transparent outside!) -->
  <g filter="url(#drop-shadow)">
    <!-- Outer dashed / glowing accent ring -->
    <circle cx="256" cy="215" r="165" fill="none" stroke="#10b981" stroke-width="4" opacity="0.6" stroke-dasharray="16,8" />
    <circle cx="256" cy="215" r="156" fill="#042f2e" stroke="#34d399" stroke-width="8" filter="url(#glow)" />
    <!-- Inner soft circular gradient -->
    <circle cx="256" cy="215" r="148" fill="#022c22" opacity="0.95" />
  </g>

  <!-- Robot Head Group -->
  <g filter="url(#drop-shadow)">
    <!-- Cute Ears / Headphones on sides -->
    <g>
      <!-- Left ear -->
      <rect x="142" y="190" width="22" height="50" rx="10" fill="#10b981" stroke="#ffffff" stroke-width="4" />
      <circle cx="153" cy="215" r="5" fill="#a7f3d0" />
      <!-- Right ear -->
      <rect x="348" y="190" width="22" height="50" rx="10" fill="#10b981" stroke="#ffffff" stroke-width="4" />
      <circle cx="359" cy="215" r="5" fill="#a7f3d0" />
    </g>

    <!-- Top Antenna / Taxi Light -->
    <g>
      <rect x="250" y="105" width="12" height="28" rx="6" fill="#10b981" />
      <circle cx="256" cy="100" r="16" fill="#34d399" stroke="#ffffff" stroke-width="4" filter="url(#glow)" />
      <circle cx="256" cy="100" r="6" fill="#ffffff" />
    </g>

    <!-- Robot Main Helmet (Chubby Cute Round Shape) -->
    <rect x="156" y="130" width="200" height="170" rx="68" fill="url(#helmetGrad)" stroke="#10b981" stroke-width="6" />

    <!-- Visor Screen (Dark glossy screen inside helmet) -->
    <rect x="176" y="168" width="160" height="116" rx="42" fill="url(#visorGrad)" stroke="#047857" stroke-width="4" />

    <!-- Screen Glass Sheen (Gloss reflection) -->
    <path d="M 186 178 Q 256 168 326 182 Q 316 200 256 190 Q 196 200 186 178" fill="#ffffff" opacity="0.25" />

    <!-- Eyes and Mouth -->
    ${eyesSvg}

    <!-- Small Taxi / AI Chest Badge -->
    <circle cx="256" cy="316" r="14" fill="#059669" stroke="#ffffff" stroke-width="3" filter="url(#glow)" />
    <path d="M 251 316 L 261 316 M 256 311 L 256 321" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
  </g>

  <!-- Specific Accessories (e.g. Magnifying Glass, Checkmark, Question Marks) -->
  ${accessorySvg}

  <!-- 3. Curved 3D Ribbon Banner at Bottom with Bold Hebrew Text -->
  <g filter="url(#banner-shadow)">
    <!-- Ribbon Fold Wings behind banner -->
    <path d="M 60 415 L 115 385 L 115 445 Z" fill="#022c22" />
    <path d="M 452 415 L 397 385 L 397 445 Z" fill="#022c22" />

    <!-- Banner Folded Ribbon Ribs -->
    <path d="M 90 395 L 125 380 L 125 435 L 90 445 Z" fill="#047857" stroke="#022c22" stroke-width="3" />
    <path d="M 422 395 L 387 380 L 387 435 L 422 445 Z" fill="#047857" stroke="#022c22" stroke-width="3" />

    <!-- Main Front Ribbon Body (Curved 3D Banner) -->
    <path d="M 95 380 C 180 370, 332 370, 417 380 C 427 382, 432 392, 430 405 L 422 440 C 420 452, 410 458, 398 456 C 320 448, 192 448, 114 456 C 102 458, 92 452, 90 440 L 82 405 C 80 392, 85 382, 95 380 Z"
          fill="url(#bannerGrad)" stroke="#ffffff" stroke-width="6" />

    <!-- Inner Golden/Neon Accent Line on Banner -->
    <path d="M 104 390 C 185 380, 327 380, 408 390 C 414 391, 418 398, 416 408 L 412 430 C 410 438, 403 444, 394 443 C 322 435, 190 435, 118 443 C 109 444, 102 438, 100 430 L 96 408 C 94 398, 98 391, 104 390 Z"
          fill="none" stroke="#6ee7b7" stroke-width="2.5" opacity="0.8" />

    <!-- Bold Hebrew Text on Banner -->
    <text x="256" y="426"
          font-family="'Noto Sans Hebrew', 'Arial Black', sans-serif"
          font-weight="900"
          font-size="36"
          fill="#022c22"
          text-anchor="middle"
          letter-spacing="1">
      ${bannerText}
    </text>
    <text x="256" y="424"
          font-family="'Noto Sans Hebrew', 'Arial Black', sans-serif"
          font-weight="900"
          font-size="36"
          fill="#ffffff"
          stroke="#047857"
          stroke-width="1.5"
          text-anchor="middle"
          letter-spacing="1">
      ${bannerText}
    </text>
  </g>
</svg>`;
}

const stickers = [
  { name: 'sticker_busy', title: 'נסיעה טובה / עצור', type: 'busy', bannerText: 'בהצלחה בדרך!' },
  { name: 'sticker_search', title: 'פנוי / חיפוש נסיעות', type: 'search', bannerText: 'אני על זה!' },
  { name: 'sticker_confused', title: 'הודעה לא מובנת', type: 'confused', bannerText: 'לא הבנתי 🤔' },
];

console.log("🎨 מתחיל ביצוע רינדור מדבקות וואטסאפ שקופות (512x512 WebP)...");

for (const s of stickers) {
  const svg = createSvg(s);
  const tempSvgPath = path.join("/tmp", `${s.name}.svg`);
  fs.writeFileSync(tempSvgPath, svg, "utf8");

  const serverWebp = path.join(SERVER_ASSETS, `${s.name}.webp`);
  const serverPng = path.join(SERVER_ASSETS, `${s.name}.png`);
  const publicWebp = path.join(PUBLIC_ASSETS, `${s.name}.webp`);
  const publicPng = path.join(PUBLIC_ASSETS, `${s.name}.png`);

  try {
    // רינדור ישיר ל-PNG שקוף 512x512 עם ערוץ אלפא
    execSync(`convert -background none -density 300 "${tempSvgPath}" -resize 512x512 "${serverPng}"`, { stdio: "ignore" });
    // המרה ל-WebP שקוף 512x512
    execSync(`convert "${serverPng}" -define webp:lossless=true "${serverWebp}"`, { stdio: "ignore" });

    // העתקה גם ל-public/assets לגישה ישירה מהאתר
    fs.copyFileSync(serverWebp, publicWebp);
    fs.copyFileSync(serverPng, publicPng);

    console.log(`✅ נוצרה בהצלחה מדבקת ${s.name}: "${s.bannerText}" (WebP + PNG 512x512 שקוף)`);
  } catch (err) {
    console.error(`❌ שגיאה ביצירת ${s.name}:`, err.message);
  }
}

console.log("✨ כל המדבקות נוצרו והוטמעו ב-fixed-bot-server וב-public/assets!");
