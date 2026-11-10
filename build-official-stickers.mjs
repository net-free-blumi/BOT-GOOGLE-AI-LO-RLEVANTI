// build-official-stickers.mjs
// יצירת מדבקות וואטסאפ עגולות שקופות לחלוטין (512x512 WebP עם אלפא)
// תואמות במדויק לדרישת המשתמש וצילומי המסך:
// 1. sticker_busy.webp: רובוט שמח + "בהצלחה בדרך!" (לפקודת "תפוס")
// 2. sticker_search.webp: רובוט עם רדאר/זכוכית מגדלת + "אני על זה!" (לפקודות "פנוי...")
// 3. sticker_confused.webp: רובוט חושב עם סימני שאלה + "לא הבנתי!" (להודעה לא מובנת)

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

const fontPath = "/usr/share/fonts/truetype/noto/NotoSansHebrew-Bold.ttf";

const items = [
  {
    name: "sticker_busy",
    srcImage: "src/assets/images/robot_mascot_success_1794314429640.jpg",
    bannerRtlText: "!ךרדב החלצהב", // "בהצלחה בדרך!"
    bannerColor1: "#047857",
    bannerColor2: "#10b981",
    maskRadius: 98,
  },
  {
    name: "sticker_search",
    srcImage: "src/assets/images/robot_mascot_search_1794314431223.jpg",
    bannerRtlText: "!הז לע ינא", // "אני על זה!"
    bannerColor1: "#047857",
    bannerColor2: "#10b981",
    maskRadius: 88,
  },
  {
    name: "sticker_confused",
    srcImage: "src/assets/images/robot_mascot_thinking_1794314431271.jpg",
    bannerRtlText: "!יתנבה אל", // "לא הבנתי!"
    bannerColor1: "#065f46",
    bannerColor2: "#0d9488",
    maskRadius: 78,
  },
];

console.log("🎨 יוצר מדבקות וואטסאפ עגולות שקופות (512x512 WebP)...");

for (const item of items) {
  const maskedCirclePng = `/tmp/${item.name}_circle.png`;
  const bannerPng = `/tmp/${item.name}_banner.png`;
  const finalPng = path.join(SERVER_ASSETS, `${item.name}.png`);
  const finalWebp = path.join(SERVER_ASSETS, `${item.name}.webp`);
  const publicPng = path.join(PUBLIC_ASSETS, `${item.name}.png`);
  const publicWebp = path.join(PUBLIC_ASSETS, `${item.name}.webp`);

  // 1. חיתוך עיגול שקוף מושלם מהרובוט
  execSync(`convert "${item.srcImage}" \\( +clone -fill black -colorize 100% -fill white -draw "circle 512,512 512,${item.maskRadius}" \\) -alpha off -compose CopyOpacity -composite -resize 440x440 "${maskedCirclePng}"`);

  // 2. יצירת סרט באנר תלת-מימדי עם כיתוב עברי ברור
  execSync(`convert -size 512x120 xc:none \\
    -fill "${item.bannerColor1}" -stroke "#ffffff" -strokewidth 4 \\
    -draw "roundrectangle 56,15 456,95 24,24" \\
    -stroke "#6ee7b7" -strokewidth 2 \\
    -draw "roundrectangle 62,21 450,89 18,18" \\
    -font "${fontPath}" \\
    -pointsize 38 -fill "#022c22" -stroke none -gravity center -annotate +0+-6 "${item.bannerRtlText}" \\
    -pointsize 38 -fill "#ffffff" -stroke "${item.bannerColor1}" -strokewidth 1.5 -gravity center -annotate +0+-8 "${item.bannerRtlText}" \\
    "${bannerPng}"`);

  // 3. קומפוזיציה: קנבס שקוף 512x512 + רובוט עגול + סרט תחתון
  execSync(`convert -size 512x512 xc:none \\
    "${maskedCirclePng}" -geometry +36+8 -composite \\
    "${bannerPng}" -geometry +0+390 -composite \\
    "${finalPng}"`);

  // 4. המרה ל-WebP שקוף לחלוטין (Lossless Alpha) עבור סטיקרים רשמיים של וואטסאפ
  execSync(`convert "${finalPng}" -define webp:lossless=true "${finalWebp}"`);

  // 5. שכפול ל-public/assets
  fs.copyFileSync(finalPng, publicPng);
  fs.copyFileSync(finalWebp, publicWebp);

  console.log(`✅ נוצרה בהצלחה מדבקת: ${item.name} (${item.bannerRtlText}) - 512x512 WebP שקופה`);
}

console.log("✨ כל המדבקות נבנו בהצלחה מלאה!");
