# wa-rides-bot: מסמך פרויקט ומדריך הקמה

עודכן: 2026-10-19

המסמך הזה נכתב כך שגם אדם וגם AI אחר (Gemini, ChatGPT וכו') יוכלו לקרוא אותו ולהמשיך לעזור בפרויקט. כל הקוד הנוכחי נמצא בנספחים בסוף. מספרי טלפון אמיתיים הוחלפו במספרים מזויפים (`972500000000`).

---

## 0. הוראות ל-AI שקורא את המסמך

אתה עוזר למשתמש להמשיך פרויקט קיים. המסמך הזה הוא מקור האמת על מה שנבנה עד כה.

- **שפה וסגנון:** עברית. המשתמש מכיר קצת Full Stack אבל צריך הדרכה שלב אחר שלב. תן פקודה אחת או שלב אחד בכל פעם, והסבר בקצרה מה הוא עושה. כשמשהו נכשל, בקש ממנו להעתיק את השגיאה כמו שהיא.
- **סביבה:** מחשב Windows, עורך Cursor, טרמינל PowerShell. Node.js בגרסה LTS עדכנית, ES Modules (`"type": "module"` ב-`package.json`).
- **הכל חייב להיות חינמי.** אל תציע שירות בתשלום.
- **הבוט קורא בלבד.** הוא לעולם לא שולח הודעות לקבוצות וואטסאפ. הוא כותב רק לצ'אט הפרטי של המשתמש.
- **לפני שמשנים קוד:** בקש מהמשתמש להדביק את הקובץ הנוכחי, כי ייתכן שהוא שינה אותו מאז המסמך. כשאתה נותן תיקון, ציין בדיוק איזו פונקציה להחליף. אם אתה כותב קובץ שלם, כתוב את כולו.
- **אחרי שינוי בסינון או בכפילויות:** הרץ את הבדיקות שבנספח ב' (`node test-matcher.mjs` ו-`node test-dedupe.mjs`) והוסף בדיקה חדשה לכל מקרה חדש.
- **אבטחה:** אל תבקש מהמשתמש לשלוח את תיקיית `auth/` (היא נותנת גישה מלאה לחשבון הוואטסאפ), מפתח SSH פרטי, או סיסמאות.
- **אל תנחש.** אם אתה לא בטוח בשם שדה, בגרסה, או בהתנהגות של Baileys או של Oracle, אמור זאת ובדוק במקור.

---

## 1. מטרת הפרויקט

בוט וואטסאפ אישי שמחליף בוט מסחרי בתשלום (כ-50 ש"ח לחודש). המשתמש נהג מדי פעם, ולא עובד בנסיעות.

1. הבוט מחובר לחשבון וואטסאפ כ"מכשיר מקושר" (Linked Device, באמצעות Pairing Code) וקורא הודעות מקבוצות נסיעות.
2. המשתמש כותב לבוט בצ'אט פרטי: `פנוי פ שמש`, `פנוי בית שמש`, `פנוי בית שמש לירושלים`, `תפוס`.
3. כשהודעה בקבוצה מתאימה לחיפוש, הבוט שולח למשתמש התראה בצ'אט פרטי: הטקסט המקורי, שם הקבוצה, שם הסדרן והמספר שלו, והחיפוש הפעיל. ההתראה מצטטת (Reply) את ההודעה המקורית, ולחיצה על הציטוט קופצת להודעה בקבוצה.
4. נסיעה שנשלחה כבר (באותה קבוצה או בקבוצה אחרת) לא נשלחת שוב.
5. כל לילה ב-2:00 (שעון ישראל) החיפוש מתאפס ונעצר.
6. הצד הרצוי: ריצה 24/7 בשרת חינמי אונליין, אתר ניהול מרחוק, והתראות תקלה לוואטסאפ.

**מספרים:** מספר חדש אחד הוא מספר הבוט (טלפון זמני), ושם מתבצע החיבור כמכשיר מקושר. המשתמש כותב לבוט מהמספר האישי שלו. בעתיד, כשהכל יציב, יחובר גם מספר הנסיעות האמיתי של המשתמש, בקריאה בלבד. זה השלב שבו יש סיכון חסימה, כי Baileys היא ספרייה לא רשמית.

---

## 2. מצב נוכחי (2026-10-19)

**עובד, ואושר על ידי המשתמש בבדיקה חיה:**
- התחברות עם Pairing Code, קבלת פקודות, והודעת "מצב פנוי הופעל".
- חילוץ מספר הטלפון של הסדרן (תוקן, ראה את `getRealSenderPhone` בנספח א').
- הסינון הפנימי של בית שמש ("עובד מושלם" לפי המשתמש).

**נבדק בסימולציה בלבד (בדיקות אוטומטיות והרצה מול וואטסאפ מדומה), ועדיין לא נבדק חי:**
- מצבי החיפוש `from` ו-`route`, זיהוי כפילויות, והאיפוס היומי ב-2:00.

**עדיין לא נבנה:**
- הרחבת `cities.json` לכל ערי ישראל. כרגע יש 33 ערים בלבד, ולכן נסיעה כמו "פ שמש 50 לאילת" עוברת כפנימית.
- אתר ניהול, התראות תקלה, והעלאה לשרת.
- שמירת נתונים בין הפעלות (כל הזיכרון כרגע בתוך התהליך, ונמחק בהפעלה מחדש).

**מגבלות ידועות:**
- הודעה אחת נבדקת כמכלול. הודעה שמכילה כמה נסיעות נפסלת אם אחת מהן חיצונית.
- הודעה קצרה כמו "פ שמש 50" בלי כתובת לא נבדקת לכפילויות.
- שני לקוחות בלי טלפון בהודעה, באותו רחוב ובאותו מחיר בתוך 15 דקות, ייחשבו כפילות.
- שמות רחוב של 3 אותיות ופחות לא מזוהים. שמות רחוב שהם גם מילים או שמות פרטיים נפוצים עלולים להתאים בטעות. אפשר להוסיף מילים כאלה ל-`IGNORE_WORDS` ב-`matcher.js`.
- שמות פרטיים שהם גם שם עיר (למשל "אפרת") עלולים לגרום לפסילה בטעות במצב פנימי.
- נבדק מול Baileys `7.0.0-rc14`. את הגרסה המותקנת אצל המשתמש בודקים עם `npm ls @whiskeysockets/baileys`.

---

## 3. החלטות שכבר התקבלו (לא לפתוח מחדש בלי סיבה)

- **ספרייה:** `@whiskeysockets/baileys` (לא `whatsapp-web.js`), כי היא לא פותחת דפדפן וחסכונית במשאבים.
- **חיבור:** Pairing Code ולא QR. הסשן נשמר בתיקייה `auth/`.
- **סינון:** התאמה למילים שלמות עם תחיליות עבריות (ב, ל, מ, ה, ו, ש, כ). לא `includes` על מחרוזות, כי "בש" נמצא בתוך "בשעה" ו"ים" בתוך "חיים".
- **שלושה מצבי חיפוש:** `internal` (רק בתוך העיר), `from` (יוצא מהעיר, כולל בתוכה), `route` (מעיר לעיר, עם בדיקת כיוון לפי "מ" ו"ל" או סדר המילים).
- **כפילויות:** חלון של 15 דקות. מפתחות: קישור, טקסט זהה (15 תווים לפחות), מחיר ורחוב, טלפון ומחיר.
- **איפוס יומי:** `node-cron` ב-`0 2 * * *` עם `timezone: "Asia/Jerusalem"`, מוגדר פעם אחת מחוץ ל-`start()` (שרצה שוב בכל התחברות מחדש).
- **שרת:** Oracle Cloud Always Free, והמחשב הישן בבית כגיבוי אחרון.
- **אתר הניהול:** ירוץ באותו שרת, בתוך התהליך של הבוט (Express), ויגיעו אליו דרך Tailscale בלבד. ראה סעיף 6.

---

## 4. ארכיטקטורה ותיאור הקבצים

```
wa-rides-bot/
├── index.js          חיבור לוואטסאפ, פקודות הנהג, שליחת התראות, איפוס יומי
├── matcher.js        זיהוי ערים/שכונות/רחובות, הבנת פקודות, ההחלטה אם נסיעה מתאימה
├── dedupe.js         זיהוי כפילויות, חילוץ מחיר/טלפון/קישור
├── cities.json       ערים, כינויים (aliases), שכונות ורחובות ידניים
├── streets-full.json נוצר על ידי build-streets.js: { "בית שמש": [...], "ירושלים": [...] }
├── build-streets.js  מוריד רחובות מ-data.gov.il (משאב 9ad3862c-8391-4b2f-84a4-2d4c68625f4b)
├── test-matcher.mjs  בדיקות לסינון
├── test-dedupe.mjs   בדיקות לכפילויות
├── package.json      "type": "module"
└── auth/             סשן וואטסאפ. סודי! לא ל-Git ולא לשיתוף
```

**זרימה בשעת הודעה** (`messages.upsert` ב-`index.js`):
1. הודעה בצ'אט פרטי: `תפוס/עצור/סגור` מאפס את מצב הנהג. הודעה שמתחילה ב`פנוי` או מכילה `מחפש` מפעילה חיפוש דרך `parseDriverCommand`.
2. הודעה בקבוצה כשהחיפוש פעיל: `rideMatches(text, driverState)` מחזירה `{ok, reason}`. אם `ok`, בודקים `deduper.check(text)`. אם זו לא כפילות, שולפים שם קבוצה ומספר סדרן (`getRealSenderPhone`) ושולחים התראה עם `quoted: m`.
3. עם `DEBUG_FILTER = true` מודפסות שורות `[נדחה]` ו-`[כפילות]` עם הסיבה.

**מצב הנהג** (`driverState`): `{active, mode, origin, destination, displayText}`.

**למה מספר הסדרן היה חסר:** וואטסאפ מסתיר את המספר בקבוצות מאחורי מזהה LID. ב-Baileys 7 המספר האמיתי נמצא ב-`m.key.participantAlt`. בקבוצות LID, ב-`groupMetadata().participants` השדה `id` הוא LID והשדה `phoneNumber` הוא המספר. לפי הסדר: `participantAlt`, אחר כך `sock.signalRepository.lidMapping.getPNForLID`, ואחר כך `phoneNumber` מרשימת חברי הקבוצה.

---

## 5. מדריך: הקמת שרת ב-Oracle Cloud בלי להיחשף לחיוב

### 5.1 איך מוודאים שלא יחייבו אותך

העובדות הבאות אומתו מול התיעוד הרשמי של Oracle (ראה מקורות בסוף):

- **כרטיס האשראי משמש לאימות זהות.** Oracle עשויה לבצע תפיסת מסגרת זמנית. לפי Oracle היא "אינה מהווה חיוב בפועל" והבנק משחרר אותה בדרך כלל תוך 3-5 ימים.
- **מחייבים רק על שימוש שחורג מ-Always Free, ורק אחרי שמשדרגים לחשבון בתשלום** (Pay As You Go). אם לא לוחצים על שדרוג, אי אפשר ליצור משאבים בתשלום אחרי שהקרדיט של תקופת הניסיון נגמר.
- **משאבי Always Free "לא יימחקו"** ופועלים ללא הגבלת זמן. לעומת זאת, משאבים בתשלום שנוצרו בתקופת הניסיון נמחקים כשהיא נגמרת. אחרי הניסיון יש תקופת חסד של 30 יום לשדרג, ובלי שדרוג נמחקים משאבי הניסיון והנתונים שלהם (לא משאבי Always Free).

**מה לעשות בפועל:**

1. **אל תלחץ על "Upgrade" או "Pay As You Go".** הבוט לא צריך את זה.
2. **צור רק משאבים עם התווית "Always Free-eligible".** המכונות הרלוונטיות:
   - `VM.Standard.E2.1.Micro`: עד שתי מכונות (AMD), עם 1 GB זיכרון ו-1/8 מעבד, לכל אחת.
   - `VM.Standard.A1.Flex` (ARM): בסך הכל 2 OCPU ו-12 GB זיכרון, שמתחלקים כרצונך בין מכונה אחת לשתיים.
   - אחסון: בסך הכל 200 GB (דיסק הפעלה וכוננים יחד). השאר את ברירת המחדל (כ-50 GB).
   - תעבורה יוצאת: 10 TB בחודש.
3. **צור בכל מקרה חיווי התראה, כרשת ביטחון:** בקונסולה, Billing & Cost Management ← Budgets ← **Create Budget**:
   - Budget Scope: **Compartment**, ו-Target Compartment: ה-root.
   - Schedule: **Monthly**, Budget Amount: **1**.
   - Budget Alert Rule: Threshold Metric **Actual Spend**, Threshold Type **Percentage of Budget**, Threshold: **1**, ובשדה Email Recipients: האימייל שלך.
   - ההתראה היא רשת ביטחון ולא חסימה, והיא לא מיידית. החסימה האמיתית היא לא לשדרג ולא ליצור משאבים שאינם Always Free.
4. **שים לב לבאנר "Free Tier" בקונסולה.** לפי Oracle הוא מציין שהחשבון אינו חשבון בתשלום.
5. **פעם בשבוע** תיכנס ל-Billing & Cost Management ותוודא שהחיוב הוא 0.

### 5.2 הסיכון שחשוב להכיר: מכונה "לא פעילה" עלולה להילקח בחזרה

לפי התיעוד של Oracle: "Idle Always Free compute instances may be reclaimed by Oracle". מכונה נחשבת לא פעילה אם במשך 7 ימים:
- ניצול המעבד באחוזון ה-95 נמוך מ-20%, **וגם**
- ניצול הרשת נמוך מ-20%, **וגם**
- (במכונות A1 בלבד) ניצול הזיכרון נמוך מ-20%.

בוט וואטסאפ עלול להיכנס להגדרה הזאת, כי הוא כמעט לא משתמש במעבד. התיעוד של Oracle לא מציין אם המגבלה חלה על סוגי חשבון מסוימים בלבד, ולכן אל תניח שהיא לא חלה עליך. אל תשדרג לתשלום בשביל זה בלי להבין מה אתה מקבל.

**מה עושים:**
- שמור את הקוד במקום נוסף (מחשב + מאגר Git פרטי), כדי שאפשר יהיה להקים הכל מחדש תוך כ-20 דקות לפי המדריך הזה.
- הוסף ניטור: כשהבוט מפסיק לעבוד, המשתמש צריך לדעת מזה (ראה סעיף 6).
- המחשב הישן בבית הוא הגיבוי.
- שיטות "keep-alive" שמדמות עומס קיימות בקהילה, אבל Oracle לא ממליצה עליהן ולכן הן לא כלולות כאן.

### 5.3 יצירת המכונה

שמות התפריטים ב-Oracle משתנים מדי פעם. חפש את המונחים באנגלית.

1. בקונסולה: **Compute ← Instances ← Create instance**.
2. **Name:** `wa-rides-bot`.
3. **Image:** Canonical **Ubuntu 22.04** (או 24.04).
4. **Shape:** לחץ Change shape.
   - קודם נסה **Ampere ← VM.Standard.A1.Flex** עם 2 OCPU ו-12 GB (או פחות).
   - אם מופיעה השגיאה `Out of host capacity` (נפוצה): נסה Availability Domain אחר, חכה וחזור לנסות שוב, או בחר **VM.Standard.E2.1.Micro** (AMD, 1 GB). 1 GB מספיק לבוט, בתנאי שמוסיפים swap (סעיף 5.5).
   - ודא שליד הצורה כתוב **Always Free-eligible**.
5. **Networking:** השאר את ברירת המחדל (VCN ו-Public subnet) וודא ש-**Assign a public IPv4 address** מסומן.
6. **SSH keys:** בחר **Generate a key pair for me** והורד את שני הקבצים. שמור את המפתח הפרטי (`.key`) במקום בטוח, למשל `C:\Users\שם-המשתמש\.ssh\oracle.key`. **אל תשלח אותו לאף אחד, כולל AI.** אי אפשר להוריד אותו שוב.
7. **Boot volume:** ברירת המחדל.
8. לחץ **Create**, חכה שהמצב יהיה **Running**, והעתק את ה-**Public IP address**.

### 5.4 התחברות מ-Windows

ב-PowerShell (החלף את שם המשתמש וה-IP):

```
icacls "C:\Users\USER\.ssh\oracle.key" /inheritance:r
icacls "C:\Users\USER\.ssh\oracle.key" /grant:r "$($env:USERNAME):R"
ssh -i "C:\Users\USER\.ssh\oracle.key" ubuntu@PUBLIC_IP
```

שתי הפקודות הראשונות מתקנות את השגיאה `UNPROTECTED PRIVATE KEY FILE`. בפעם הראשונה ענה `yes` לשאלה על אימות המארח. המשתמש ב-Ubuntu הוא `ubuntu`.

### 5.5 הכנת השרת

הפקודות האלה רצות בתוך ה-SSH:

```
sudo timedatectl set-timezone Asia/Jerusalem
sudo apt update && sudo apt upgrade -y

# swap, חשוב במכונה של 1 GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Node.js (אותה מהדורה כמו במחשב שלך), git ו-pm2
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs git build-essential
sudo npm install -g pm2
node -v
```

אם `setup_24.x` לא עובד, החלף ל-`setup_22.x`. Baileys דורשת Node 20 ומעלה.

### 5.6 העלאת הקוד מהמחשב לשרת

קודם יוצרים את התיקייה בשרת (ב-SSH): `mkdir -p ~/wa-rides-bot`. אחר כך, **בחלון PowerShell נפרד במחשב** (לא בתוך ה-SSH), מתוך תיקיית הפרויקט:

```
scp -i "C:\Users\USER\.ssh\oracle.key" index.js matcher.js dedupe.js cities.json streets-full.json package.json ubuntu@PUBLIC_IP:~/wa-rides-bot/
```

**אל תעלה את התיקייה `auth/`.** נחבר את הוואטסאפ מחדש ישירות מהשרת. בשרת:

```
cd ~/wa-rides-bot
npm install
```

### 5.7 חיבור הוואטסאפ והרצה קבועה

1. **עצור את הבוט במחשב** (Ctrl+C). אסור ששני עותקים ירוצו יחד, אחרת תקבל התראות כפולות.
2. בטלפון של הבוט: וואטסאפ ← מכשירים מקושרים, והסר את המכשיר הישן של המחשב.
3. בשרת, הרצה חד-פעמית בחזית כדי לחבר:
   ```
   cd ~/wa-rides-bot
   node index.js
   ```
   יופיע קוד חיבור בטרמינל. בטלפון: מכשירים מקושרים ← קישור מכשיר ← "קישור עם מספר טלפון במקום", והקלד את הקוד. כשמופיע `✅ הבוט מחובר ופעיל`, לחץ Ctrl+C.
4. הרצה קבועה עם pm2:
   ```
   pm2 start index.js --name wa-bot
   pm2 save
   pm2 startup
   ```
   הפקודה `pm2 startup` מדפיסה שורה שמתחילה ב-`sudo env PATH=...`. העתק והרץ אותה, ואז `pm2 save` שוב.
5. בדיקה: שלח לבוט `פנוי פ שמש`, וצפה בלוגים עם `pm2 logs wa-bot`.

פקודות שימושיות: `pm2 status`, `pm2 restart wa-bot`, `pm2 stop wa-bot`, `pm2 logs wa-bot --lines 100`.

### 5.8 עדכון קוד בהמשך

העתק את הקבצים שהשתנו עם `scp` (כמו בסעיף 5.6), ואז בשרת: `pm2 restart wa-bot`.

### 5.9 בעיות נפוצות

- **`Out of host capacity` ביצירת מכונה A1:** ראה סעיף 5.3, שלב 4.
- **`UNPROTECTED PRIVATE KEY FILE`:** ראה סעיף 5.4.
- **`Permission denied (publickey)`:** בדוק שהמשתמש הוא `ubuntu` ושהנתיב למפתח נכון.
- **התראות כפולות:** אותו חשבון מחובר בשני מקומות (מחשב ושרת). עצור אחד מהם.
- **`Connection Failure` או לולאת התחברות:** ייתכן שהמכשיר הוסר מהטלפון. מחק את `auth/` בשרת (`rm -rf ~/wa-rides-bot/auth`) והתחבר מחדש כמו בסעיף 5.7.
- **הבוט נעצר בלי הודעה:** `pm2 logs wa-bot --lines 100`. אם המכונה כולה כבויה, ראה סעיף 5.2.

---

## 6. אתר הניהול: איפה ואיך (תכנון, עדיין לא נבנה)

**איפה:** על אותו שרת של הבוט, בתוך אותו תהליך Node, עם Express (כבר מותקן). הסיבה: האתר צריך לקרוא ולשנות את המצב החי של הבוט (מחובר או לא, חיפוש פעיל, הודעות אחרונות), והבוט חייב לרוץ כל הזמן בתהליך אחד שמחזיק את החיבור לוואטסאפ.

**Netlify:** מתאים לאתרים סטטיים ולפונקציות קצרות, ולא יכול להחזיק חיבור וואטסאפ פתוח 24/7. המשתמש יכול להמשיך להחזיק שם את האתרים האחרים שלו. אפשר בהמשך לארח ב-Netlify רק את חזית האתר ולקרוא ל-API של השרת, אבל זה דורש חשיפת API ל-HTTPS ברשת הציבורית, ולכן לא מומלץ בשלב הזה.

**גישה מרחוק בלי לפתוח פורטים:** **Tailscale** (רשת פרטית). לפי אתר Tailscale, התוכנית החינמית Personal כוללת עד 6 משתמשים ומכשירים ללא הגבלה, ומיועדת לשימוש לא מסחרי. מתקינים אותה בשרת, במחשב ובטלפון, ופותחים את האתר בכתובת `http://<כתובת-tailscale-של-השרת>:3000`. כך לא צריך לפתוח שום פורט ב-Oracle חוץ מ-SSH, ואפשר גם להתחבר ל-SSH דרכה.

**מה האתר יכלול (תכנון):**
- סטטוס: מחובר או לא, זמן ריצה, החיפוש הפעיל.
- כפתורים: הפעלת חיפוש (`פנוי...`), עצירה (`תפוס`), איפוס.
- יומן אחרון: נסיעות שנשלחו, נדחו (עם הסיבה) וכפילויות.
- הגדרות: חלון כפילויות, כיוון מחמיר, עריכת כינויי ערים.
- הגנה בסיסמה.

**התראות תקלה:**
- התנתקות מוואטסאפ, או הפעלה מחדש של הבוט ← הודעת וואטסאפ למשתמש.
- כשהמכונה כולה נופלת הבוט לא יכול להתריע בעצמו. לכן מומלץ "דופק" (heartbeat): הבוט שולח פינג יוצא כל דקה לשירות ניטור חינמי (למשל healthchecks.io, יש לבדוק את תנאי התוכנית החינמית), והשירות שולח התראה כשהפינג מפסיק להגיע.

---

## 7. השלבים הבאים (בסדר מומלץ)

1. הרחבת `cities.json` לכל ערי ישראל מאותו מאגר שממנו מורידים רחובות.
2. אתר הניהול והתראות התקלה (סעיף 6).
3. הקמת השרת והעברת הבוט אליו (סעיף 5).
4. בדיקה חיה של כל המצבים (`from`, `route`, כפילויות, איפוס 2:00) וקריאה בשורות `[נדחה]` ו-`[כפילות]` כדי לוודא שנסיעות טובות לא נפסלות.
5. חיבור מספר הנסיעות האמיתי כמכשיר מקושר בקריאה בלבד, אחרון, בגלל סיכון החסימה.

---

## 8. מקורות

- Oracle, Always Free Resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm
- Oracle, Always Free Resources (גרסה נוספת): https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Oracle, Free Tier FAQ: https://www.oracle.com/cloud/free/faq/
- Oracle, Creating a Budget: https://docs.oracle.com/en-us/iaas/Content/Billing/Tasks/create-budget.htm
- Tailscale, Pricing: https://tailscale.com/pricing

---

## נספח א: הקוד הנוכחי

### index.js

````javascript
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import pino from "pino";
import cron from "node-cron";
import { normalizeText, parseDriverCommand, rideMatches, findPlaces } from "./matcher.js";
import { createDeduper } from "./dedupe.js";

const BOT_PHONE = "972500000000"; // מספר הבוט
const MY_PHONE = "972500000001";  // המספר האישי שלך

// true = מדפיס בטרמינל למה כל הודעה מקבוצה נדחתה. שימושי בזמן הבדיקות, אחר כך אפשר לשנות ל-false
const DEBUG_FILTER = true;

// כמה דקות נסיעה שכבר נשלחה אליך נחשבת "אותה נסיעה" אם היא מופיעה שוב
const DEDUPE_MINUTES = 15;

// true = בשעה 2:00 הבוט שולח לך הודעה שהחיפוש אופס (אבל זה יצלצל לך בלילה). false = איפוס שקט
const NOTIFY_ON_RESET = false;

// זיכרון מטמון למטא-דאטה של קבוצות
const groupMetadataCache = new Map();

// מצב הנהג. mode: internal = רק בתוך העיר | from = יוצא מהעיר (כולל בתוכה) | route = מסלול מעיר לעיר
const emptyState = { active: false, mode: null, origin: null, destination: null, displayText: "" };
let driverState = { ...emptyState };

const deduper = createDeduper(findPlaces, { windowMs: DEDUPE_MINUTES * 60 * 1000 });

// החיבור הנוכחי לוואטסאפ. start() רצה שוב בכל התחברות מחדש, ולכן האיפוס היומי מוגדר פעם אחת כאן ולא בתוכה
let currentSock = null;

// איפוס יומי ב-2:00 בלילה (שעון ישראל): מפסיק את החיפוש ומנקה את הזיכרון
cron.schedule("0 2 * * *", async () => {
  const wasActive = driverState.active;
  driverState = { ...emptyState };
  deduper.clear();
  groupMetadataCache.clear();
  console.log("🌙 איפוס יומי (2:00): החיפוש הופסק והזיכרון נוקה");

  if (wasActive && NOTIFY_ON_RESET && currentSock) {
    try {
      await currentSock.sendMessage(`${MY_PHONE}@s.whatsapp.net`, { text: "🌙 *איפוס יומי.* החיפוש הופסק. כתוב \"פנוי...\" כדי להפעיל מחדש." });
    } catch (e) {}
  }
}, { timezone: "Asia/Jerusalem" });

// מחזיר מספר טלפון רק אם זה באמת מזהה של מספר טלפון (ולא LID מוצפן)
function pnFromJid(jid) {
  const s = String(jid || "");
  if (!s.endsWith("@s.whatsapp.net")) return null;
  const num = s.split("@")[0].split(":")[0].replace(/\D/g, "");
  return num.length >= 9 ? num : null;
}

// מספר הטלפון האמיתי של השולח בקבוצה (פותר את בעיית ה-LID)
async function getRealSenderPhone(sock, groupJid, msg) {
  const key = msg.key || {};

  // 1. ב-Baileys 7 המספר האמיתי נמצא ב-participantAlt כשהמזהה הראשי הוא LID
  for (const jid of [key.participantAlt, key.participant, msg.participant]) {
    const pn = pnFromJid(jid);
    if (pn) return pn;
  }

  const lid = [key.participant, key.participantAlt, msg.participant].find((j) => String(j || "").endsWith("@lid"));

  if (lid) {
    // 2. טבלת ההמרה הפנימית של Baileys (LID <-> מספר)
    try {
      const pn = pnFromJid(await sock.signalRepository.lidMapping.getPNForLID(lid));
      if (pn) return pn;
    } catch (e) {}

    // 3. רשימת חברי הקבוצה: ב-LID, השדה id הוא LID והשדה phoneNumber הוא המספר
    try {
      const rawLid = lid.split("@")[0].split(":")[0];
      for (const fresh of [false, true]) {
        let metadata = groupMetadataCache.get(groupJid);
        if (!metadata || fresh) {
          metadata = await sock.groupMetadata(groupJid);
          groupMetadataCache.set(groupJid, metadata);
        }
        const member = metadata.participants.find(
          (p) => String(p.id || "").split("@")[0].split(":")[0] === rawLid ||
                 String(p.lid || "").split("@")[0].split(":")[0] === rawLid
        );
        const pn = pnFromJid(member?.phoneNumber) || pnFromJid(member?.id);
        if (pn) return pn;
      }
    } catch (e) {}
  }

  return "זמין בקבוצה";
}

function describeMode(state) {
  if (state.mode === "internal") return `רק נסיעות בתוך ${state.origin}`;
  if (state.mode === "route") return `רק נסיעות מ${state.origin} ל${state.destination}`;
  return `נסיעות שיוצאות מ${state.origin} (בתוך העיר ומחוצה לה)`;
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false
  });
  currentSock = sock;

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      const code = await sock.requestPairingCode(BOT_PHONE);
      console.log("-----------------------------------------");
      console.log("קוד החיבור לוואטסאפ שלך הוא:", code);
      console.log("-----------------------------------------");
    }, 6000);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") console.log("✅ הבוט מחובר ופעיל בהצלחה לוואטסאפ!");
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) start();
      else console.log("התנתקת מהוואטסאפ. מחק את התיקייה auth והרץ שוב.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      if (m.key.fromMe) continue;

      const jid = m.key.remoteJid;
      const text = (m.message?.conversation || m.message?.extendedTextMessage?.text || "").trim();
      if (!text) continue;

      const isGroup = jid.endsWith("@g.us");

      // --- 1. פקודות נהג (צ'אט פרטי) ---
      if (!isGroup) {
        const norm = normalizeText(text);

        if (/(^| )(תפוס|עצור|סגור)( |$)/.test(norm)) {
          driverState = { ...emptyState };
          await sock.sendMessage(jid, { text: "🛑 *הבוט הופסק. מצב פנוי מבוטל.*" }, { quoted: m });
          continue;
        }

        if (norm.startsWith("פנוי") || norm.includes("מחפש")) {
          driverState = { active: true, ...parseDriverCommand(text) };

          let responseMsg = `✅ *מצב פנוי הופעל!*\n\n`;
          responseMsg += `🔍 *חיפוש מוגדר:* ${driverState.displayText}\n`;
          responseMsg += `📌 ${describeMode(driverState)}`;

          console.log(`[פקודה]: "${text}" -> ${driverState.mode} | ${driverState.displayText}`);
          await sock.sendMessage(jid, { text: responseMsg }, { quoted: m });
          continue;
        }
      }

      // --- 2. סריקת קבוצות בזמן אמת (קריאה בלבד, שום דבר לא נשלח לקבוצות) ---
      if (isGroup && driverState.active) {
        const verdict = rideMatches(text, driverState);

        if (!verdict.ok) {
          if (DEBUG_FILTER) console.log(`[נדחה] ${verdict.reason} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
          continue;
        }

        // כפילויות: נסיעה שכבר נשלחה אליך (באותה קבוצה או בקבוצה אחרת) לא נשלחת שוב.
        // הבדיקה רצה לפני כל פעולה אסינכרונית כדי ששתי הודעות זהות שמגיעות יחד לא יעברו שתיהן
        const dup = deduper.check(text);
        if (dup.duplicate) {
          if (DEBUG_FILTER) console.log(`[כפילות] ${dup.reason} | "${text.replace(/\n/g, " / ").slice(0, 80)}"`);
          continue;
        }

        // שליפת שם הקבוצה
        let groupName = "קבוצת נסיעות";
        try {
          if (!groupMetadataCache.has(jid)) {
            const metadata = await sock.groupMetadata(jid);
            groupMetadataCache.set(jid, metadata);
          }
          const meta = groupMetadataCache.get(jid);
          groupName = meta?.subject || groupName;
        } catch (e) {}

        const senderPhone = await getRealSenderPhone(sock, jid, m);
        const senderName = m.pushName || "סדרן";

        let alertMsg = `${text}\n`;
        alertMsg += `───────────────\n`;
        alertMsg += `📍 *קבוצה:* ${groupName}\n`;
        alertMsg += `👤 *סדרן:* ${senderName} · ${senderPhone}\n`;
        alertMsg += `🔍 *חיפוש:* ${driverState.displayText}\n`;
        alertMsg += `───────────────`;

        const driverJid = `${MY_PHONE}@s.whatsapp.net`;

        await sock.sendMessage(driverJid, { text: alertMsg }, { quoted: m });

        console.log(`[התראה נשלחה] (${verdict.reason}): "${text.replace(/\n/g, " / ").slice(0, 80)}" | סדרן: ${senderName} (${senderPhone})`);
      }
    }
  });
}

start();
````

### matcher.js

````javascript
// matcher.js - זיהוי מקומות בהודעות נסיעה, הבנת פקודות הנהג, והחלטה אם נסיעה מתאימה

import { readFileSync } from "node:fs";

// ===== הגדרות שאפשר לשנות =====
// true  = בחיפוש מסלול (פנוי בית שמש לירושלים) הנסיעה חייבת להיות בכיוון הנכון: מבית שמש לירושלים
// false = מספיק ששתי הערים מופיעות בהודעה, בכל סדר
const STRICT_DIRECTION = true;

// מילים רגילות שנראות כמו שם עיר או רחוב ויוצרות טעויות ("יום ראשון", "ים המלח"). אפשר להוסיף עוד
const IGNORE_WORDS = ["ראשון", "ים"];

// העיר שהבוט מניח אם כתבת רק "פנוי"
const DEFAULT_CITY = "בית שמש";
// ==============================

const PREFIX_LETTERS = new Set("בלמהוכש"); // אותיות שמצטרפות לתחילת מילה: בירושלים, לירושלים, מירושלים...
const KIND_RANK = { street: 1, neighborhood: 2, alias: 3 };

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")        // ניקוד
    .replace(/["'`´׳״“”‘’]/g, "")           // גרשיים: ב"ש -> בש
    .replace(/[^א-ת0-9\s]/g, " ")  // כל מה שאינו עברית, ספרה או רווח
    .replace(/\s+/g, " ")
    .trim();
}

export function createMatcher(citiesData, streetsData = {}) {
  const ignore = new Set(IGNORE_WORDS.map(normalizeText));
  const phrases = new Map(); // ביטוי -> Map(עיר -> סוג חזק ביותר)
  const abbreviations = new Set(); // ראשי תיבות כמו ב"ש, ת"א, י-ם: מותר לצרף להם ל/מ/ב ("לת"א")

  const add = (raw, city, kind) => {
    const norm = normalizeText(raw);
    const minLen = kind === "alias" ? 2 : kind === "neighborhood" ? 3 : 4;
    if (norm.length < minLen) return;
    if (ignore.has(norm)) return;
    if (kind === "alias" && /["'׳״\-.]/.test(String(raw))) abbreviations.add(norm);
    let byCity = phrases.get(norm);
    if (!byCity) phrases.set(norm, (byCity = new Map()));
    if ((KIND_RANK[byCity.get(city)] || 0) < KIND_RANK[kind]) byCity.set(city, kind);
  };

  for (const c of citiesData.cities) {
    add(c.name, c.name, "alias");
    (c.aliases || []).forEach((a) => add(a, c.name, "alias"));
    (c.neighborhoods || []).forEach((n) => add(n, c.name, "neighborhood"));
    (c.streets || []).forEach((s) => add(s, c.name, "street"));
  }
  for (const [city, list] of Object.entries(streetsData)) list.forEach((s) => add(s, city, "street"));

  // אינדקס לפי המילה הראשונה בביטוי, לחיפוש מהיר
  const byFirstToken = new Map();
  for (const [phrase, byCity] of phrases) {
    // הסוג החזק קובע (כינוי עיר > שכונה > רחוב). אם נשארו כמה ערים, הביטוי דו-משמעי (למשל "הרצל") ומדלגים עליו
    const best = Math.max(...[...byCity.values()].map((k) => KIND_RANK[k]));
    const winners = [...byCity].filter(([, k]) => KIND_RANK[k] === best);
    if (winners.length !== 1) continue;
    const [city, kind] = winners[0];
    const tokens = phrase.split(" ");
    const isAbbr = abbreviations.has(phrase);
    const entry = {
      phrase, tokens, city, kind,
      // מילה בודדת של 1-2 אותיות (כמו "בש") לא מקבלת תחילית, כי "לבש" ו"מפת" הן מילים אחרות. ראשי תיבות כן, אות אחת
      maxCut: tokens.length === 1 && tokens[0].length <= 2 && !isAbbr ? 0 : isAbbr ? 1 : 2,
    };
    if (!byFirstToken.has(tokens[0])) byFirstToken.set(tokens[0], []);
    byFirstToken.get(tokens[0]).push(entry);
  }

  // מוצא בטקסט את כל המקומות המוכרים, כמילים שלמות (עם אפשרות לתחילית ב/ל/מ/ה/ו/ש/כ)
  function findPlaces(text) {
    const tokens = normalizeText(text).split(" ").filter(Boolean);
    const hits = [];
    tokens.forEach((tok, i) => {
      for (let cut = 0; cut <= 2 && cut < tok.length; cut++) {
        const prefix = tok.slice(0, cut);
        if ([...prefix].some((ch) => !PREFIX_LETTERS.has(ch))) break;
        for (const e of byFirstToken.get(tok.slice(cut)) || []) {
          if (cut > e.maxCut) continue;
          if (e.tokens.every((t, k) => k === 0 || tokens[i + k] === t)) {
            hits.push({ ...e, start: i, end: i + e.tokens.length - 1, prefix });
          }
        }
      }
    });

    // כשכמה התאמות חופפות, הארוכה מנצחת ("רמת בית שמש א" גוברת על "בית שמש")
    hits.sort(
      (a, b) =>
        (b.end - b.start) - (a.end - a.start) ||
        b.phrase.length - a.phrase.length ||
        KIND_RANK[b.kind] - KIND_RANK[a.kind]
    );
    const used = new Set();
    const places = [];
    for (const h of hits) {
      let free = true;
      for (let k = h.start; k <= h.end; k++) if (used.has(k)) free = false;
      if (!free) continue;
      for (let k = h.start; k <= h.end; k++) used.add(k);
      places.push({
        city: h.city,
        kind: h.kind,
        phrase: h.phrase,
        start: h.start,
        role: h.prefix.includes("מ") ? "from" : h.prefix.includes("ל") ? "to" : null,
      });
    }
    return places.sort((a, b) => a.start - b.start);
  }

  // קובע איזו עיר היא המוצא ואיזו היעד: קודם לפי "מ..." ו"ל...", ואם אין אז לפי הסדר בהודעה
  function resolveRoles(places) {
    const seen = new Map();
    for (const p of places) {
      if (!seen.has(p.city)) seen.set(p.city, { city: p.city, role: p.role });
      else if (!seen.get(p.city).role && p.role) seen.get(p.city).role = p.role;
    }
    const cities = [...seen.values()];
    const asFrom = cities.find((c) => c.role === "from");
    const asTo = cities.find((c) => c.role === "to" && c !== asFrom);
    const from = asFrom || (asTo ? cities.find((c) => c !== asTo) : cities[0]);
    const to = asTo || cities.find((c) => c !== from);
    return { from: from?.city ?? null, to: to?.city ?? null, cities: cities.map((c) => c.city) };
  }

  // הופך את ההודעה שלך לבוט ("פנוי ...") להגדרת חיפוש
  function parseDriverCommand(text) {
    const norm = normalizeText(text);
    const { from, to } = resolveRoles(findPlaces(text));

    if (/(^| )(פנימי|פש|פ שמש)( |$)/.test(norm)) {
      const city = from || to || DEFAULT_CITY;
      return { mode: "internal", origin: city, destination: null, displayText: `${city} (פנימי)` };
    }
    const origin = from || DEFAULT_CITY;
    if (to && to !== origin) {
      return { mode: "route", origin, destination: to, displayText: `${origin} ⬅️ ${to}` };
    }
    return { mode: "from", origin, destination: null, displayText: origin };
  }

  // מחליט אם נסיעה מתאימה לחיפוש. מחזיר { ok, reason } והסיבה עוזרת לדבג
  function rideMatches(text, state) {
    const yes = (reason) => ({ ok: true, reason });
    const no = (reason) => ({ ok: false, reason });
    const places = findPlaces(text);
    const home = state.origin;

    if (state.mode === "internal") {
      const mine = places.filter((p) => p.city === home);
      const others = places.filter((p) => p.city !== home);

      const strongOther = others.find((p) => p.kind !== "street");
      if (strongOther) return no(`מופיעה עיר/שכונה אחרת: "${strongOther.phrase}" (${strongOther.city})`);

      if (!mine.length) {
        if (others.length) return no(`רחוב של ${others[0].city}: "${others[0].phrase}"`);
        const hasWord = /(^| )פנימי( |$)/.test(normalizeText(text));
        return hasWord ? yes('כתוב "פנימי" ואין סימן לעיר אחרת') : no("אין בהודעה שום סימן ל" + home);
      }
      const strongMine = mine.some((p) => p.kind !== "street");
      if (!strongMine && others.length >= mine.length) return no("רחובות לא חד-משמעיים, יותר של עיר אחרת");
      return yes(`זוהה: "${mine[0].phrase}"`);
    }

    const roles = resolveRoles(places);

    if (state.mode === "from") {
      if (!roles.cities.includes(home)) return no(`${home} לא מופיעה בהודעה`);
      if (roles.from !== home) return no(`${home} מופיעה כיעד ולא כמוצא`);
      return yes(`יוצאת מ${home}`);
    }

    if (state.mode === "route") {
      const dest = state.destination;
      if (!roles.cities.includes(home)) return no(`${home} לא מופיעה בהודעה`);
      if (!roles.cities.includes(dest)) return no(`${dest} לא מופיעה בהודעה`);
      if (STRICT_DIRECTION && !(roles.from === home && roles.to === dest)) {
        return no(`הכיוון הפוך (מוצא: ${roles.from}, יעד: ${roles.to})`);
      }
      return yes(`${home} ל${dest}`);
    }

    return no("מצב חיפוש לא מוכר");
  }

  return { findPlaces, resolveRoles, parseDriverCommand, rideMatches };
}

// ----- שימוש רגיל: טוען את הקבצים מהתיקייה של הפרויקט בפעם הראשונה שצריך -----
let instance = null;
function get() {
  if (!instance) {
    const load = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8"));
    instance = createMatcher(load("cities.json"), load("streets-full.json"));
  }
  return instance;
}
export const parseDriverCommand = (text) => get().parseDriverCommand(text);
export const rideMatches = (text, state) => get().rideMatches(text, state);
export const findPlaces = (text) => get().findPlaces(text);
````

### dedupe.js

````javascript
// dedupe.js - מזהה שהודעת נסיעה כבר נשלחה אליך (נשלחה שוב באותה קבוצה, או הועברה לקבוצות אחרות)
//
// הודעה נחשבת כפילות אם אחד המפתחות שלה כבר נראה בחלון הזמן:
//   1. אותו קישור
//   2. אותו טקסט בדיוק (אחרי ניקוי סימנים), גם מקבוצה אחרת
//   3. אותו מחיר + אותו רחוב (או אותה שכונה, כשאין רחוב). ערים לבד לא נספרות, כדי לא לאחד שתי נסיעות
//      שונות באותו מסלול ובאותו מחיר. אם יש בהודעה טלפון של לקוח, הוא חלק מהמפתח
//   4. אותו טלפון של הלקוח + אותו מחיר

import { normalizeText } from "./matcher.js";

const URL_RE = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|waze\.com\/|maps\.app\.goo\.gl\/|goo\.gl\/)[^\s]+/gi;
const PHONE_RE = /(?:\+?972|0)[-\s]?5\d[-\s]?\d{3}[-\s]?\d{4}/g; // נייד ישראלי
const TIME_RE = /\b\d{1,2}[:.]\d{2}\b/g;                        // 14:30
const MIN_EXACT_TEXT_LENGTH = 15; // הודעות קצרות מדי ("פ שמש 50") לא נבדקות לפי טקסט, כי הן יכולות להיות שני אנשים שונים
const MIN_PRICE = 20;             // מספר קטן מזה הוא כנראה מספר בית ולא מחיר

function phoneDigits(raw) {
  const d = String(raw).replace(/\D/g, "");
  return d.startsWith("0") ? "972" + d.slice(1) : d;
}

export function extractPhones(text) {
  return [...new Set((String(text).match(PHONE_RE) || []).map(phoneDigits))];
}

export function extractLinks(text) {
  const links = (String(text).match(URL_RE) || []).map((u) => u.toLowerCase().replace(/[.,;!?)\]]+$/, ""));
  return [...new Set(links)];
}

// המחיר: קודם מספר שצמוד ל-₪ / שח, ואחרת המספר התקין הראשון (2-3 ספרות). לא נספרים: טלפונים, שעות, "15 דק"
export function extractPrice(text) {
  const cleaned = String(text).replace(URL_RE, " ").replace(PHONE_RE, " ").replace(TIME_RE, " ").replace(/\d{6,}/g, " ");

  const withCurrency = cleaned.match(/(?<!\d)(\d{2,3})(?!\d)\s*(?:₪|שח|ש"ח|שקל)/);
  if (withCurrency && +withCurrency[1] >= MIN_PRICE) return +withCurrency[1];

  const re = /(?<!\d)(\d{2,3})(?!\d)(\s*(?:דק|דקות|דקה|שעות|שעה|קמ|ק"מ|km))?/gi;
  let m;
  while ((m = re.exec(cleaned))) {
    if (m[2]) continue;                                           // "15 דק"
    if (/שעה\s*$/.test(cleaned.slice(Math.max(0, m.index - 6), m.index))) continue;             // "בשעה 14"
    if (+m[1] >= MIN_PRICE) return +m[1];
  }
  return null;
}

// findPlaces מגיעה מ-matcher.js, כדי שנשתמש באותו זיהוי רחובות ושכונות
export function createDeduper(findPlaces, { windowMs = 15 * 60 * 1000 } = {}) {
  const seen = new Map(); // מפתח -> זמן אחרון שנראה

  function keysFor(text) {
    const keys = [];
    for (const link of extractLinks(text)) keys.push({ key: `link:${link}`, label: "אותו קישור" });

    const norm = normalizeText(text);
    if (norm.length >= MIN_EXACT_TEXT_LENGTH) keys.push({ key: `text:${norm}`, label: "אותה הודעה בדיוק" });

    const price = extractPrice(text);
    const phones = extractPhones(text);
    const places = findPlaces(text);
    const streets = [...new Set(places.filter((p) => p.kind === "street").map((p) => p.phrase))].sort();
    const hoods = [...new Set(places.filter((p) => p.kind === "neighborhood").map((p) => p.phrase))].sort();

    // אם בהודעה יש טלפון של לקוח, הוא חלק מהמפתח: שני לקוחות שונים באותו רחוב ובאותו מחיר הם לא אותה נסיעה
    const phoneTag = phones.length ? `|${phones.join(",")}` : "";
    if (price) {
      if (streets.length) {
        // רחוב מזהה נסיעה טוב יותר משכונה, ולכן כל רחוב הוא מפתח בפני עצמו (ההעתק יכול להשמיט את השכונה)
        for (const s of streets) keys.push({ key: `street:${price}|${s}${phoneTag}`, label: `אותו מחיר (${price}) ואותו רחוב (${s})` });
      } else if (hoods.length) {
        keys.push({ key: `hood:${price}|${hoods.join(",")}${phoneTag}`, label: `אותו מחיר (${price}) ואותה שכונה (${hoods.join(", ")})` });
      }
    }

    for (const phone of phones) keys.push({ key: `phone:${phone}|${price ?? ""}`, label: "אותו טלפון ואותו מחיר" });
    return keys;
  }

  return {
    // מחזיר { duplicate, reason }. אם זו לא כפילות, זוכר את ההודעה. אם כן, מרענן את הזמן כדי שהמשך שליחה חוזרת ימשיך להיחסם
    check(text, now = Date.now()) {
      for (const [k, t] of seen) if (now - t > windowMs) seen.delete(k);
      const keys = keysFor(text);
      const hit = keys.find((k) => seen.has(k.key));
      for (const k of keys) seen.set(k.key, now);
      return hit ? { duplicate: true, reason: hit.label } : { duplicate: false, reason: "" };
    },
    clear() {
      seen.clear();
    },
    get size() {
      return seen.size;
    },
  };
}
````

### build-streets.js

````javascript
// מוריד את רשימת הרחובות הרשמית של בית שמש וירושלים ממאגר data.gov.il
// הרצה: node build-streets.js
// דורש Node 18 ומעלה (יש fetch מובנה). יוצר את הקובץ streets-full.json

import { writeFileSync } from "node:fs";

const RESOURCE_ID = "9ad3862c-8391-4b2f-84a4-2d4c68625f4b"; // מאגר "רשימת רחובות בישראל"
const CITIES = ["בית שמש", "ירושלים"];

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

async function fetchCity(city) {
  const streets = new Set();
  let offset = 0;
  const limit = 1000;
  while (true) {
    const url =
      "https://data.gov.il/api/3/action/datastore_search" +
      `?resource_id=${RESOURCE_ID}&q=${encodeURIComponent(city)}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`שגיאת רשת ${res.status}. בדוק את ה-RESOURCE_ID בראש הקובץ`);
    const data = await res.json();
    const records = data?.result?.records ?? [];
    if (records.length === 0) break;

    for (const r of records) {
      const keys = Object.keys(r);
      const cityKey = keys.find((k) => k.includes("ישוב"));
      const streetKey = keys.find((k) => k.includes("רחוב") && !k.includes("סמל"));
      if (!cityKey || !streetKey) continue;
      if (clean(r[cityKey]) === city) {
        const name = clean(r[streetKey]);
        if (name) streets.add(name);
      }
    }
    offset += limit;
    if (records.length < limit) break;
  }
  return [...streets].sort((a, b) => a.localeCompare(b, "he"));
}

(async () => {
  const out = {};
  for (const city of CITIES) {
    out[city] = await fetchCity(city);
    console.log(`${city}: ${out[city].length} רחובות`);
  }
  writeFileSync("streets-full.json", JSON.stringify(out, null, 2), "utf8");
  console.log("נשמר ל-streets-full.json");
})().catch((e) => {
  console.error("נכשל:", e.message);
  process.exit(1);
});
````

### cities.json

````json
{
  "_note": "רשימת התחלה. את הרשימה המלאה של הרחובות מורידים מהמאגר הרשמי עם הסקריפט build-streets.js, והוא מייצר streets-full.json",
  "cities": [
    {
      "name": "בית שמש",
      "aliases": ["ב\"ש", "בש", "שמש", "פ שמש", "פנימי שמש", "בית שמש"],
      "neighborhoods": [
        "רמת בית שמש א'", "רמת בית שמש ב'", "רמת בית שמש ג'", "רמת בית שמש ד'",
        "רמה א", "רמה ב", "רמה ג", "רמה ד", "רמת אברהם", "עין שמש", "מרכז העיר"
      ],
      "streets": [
        "נהר הירדן", "נהר הירקון", "לביא החדש", "נחום לישנה"
      ]
    },
    {
      "name": "ירושלים",
      "aliases": ["י-ם", "ים", "ירו", "ירושלים"],
      "neighborhoods": [
        "גבעת שאול", "הר נוף", "רמות", "רמת שלמה", "רמות אלון", "פסגת זאב", "גילה", "תלפיות",
        "הגבעה הצרפתית", "מעלות דפנה", "בית וגן", "קרית יובל", "רחביה", "גאולה", "מאה שערים",
        "בר אילן", "סנהדריה", "רמת אשכול", "הר חומה", "גבעת מרדכי", "ארנונה", "קריית מנחם",
        "בקעה", "מלחה", "נחלאות", "בית הכרם", "עין כרם", "קטמון", "נווה יעקב", "רמת שרת",
        "מרכז העיר", "תחנה מרכזית"
      ],
      "streets": [
        "יפו", "בן יהודה", "עמק רפאים", "דרך חברון", "הנביאים", "שמואל הנביא", "בר אילן",
        "גולדה מאיר", "הרצל", "מלכי ישראל", "אשכול", "שזר", "הלל", "קינג ג'ורג'", "אגריפס",
        "בית הדפוס", "הר הצופים", "גולומב", "הנשיא", "דרך בית לחם", "החלוצים", "שמגר", "אצל"
      ]
    },
    { "name": "תל אביב", "aliases": ["ת\"א", "תא", "תל אביב"], "neighborhoods": [], "streets": [] },
    { "name": "בני ברק", "aliases": ["ב\"ב", "בב", "בני ברק"], "neighborhoods": [], "streets": [] },
    { "name": "פתח תקווה", "aliases": ["פ\"ת", "פת", "פתח תקווה"], "neighborhoods": [], "streets": [] },
    { "name": "ראשון לציון", "aliases": ["ראשל\"צ", "ראשלצ", "ראשון"], "neighborhoods": [], "streets": [] },
    { "name": "רחובות", "aliases": ["רחובות"], "neighborhoods": [], "streets": [] },
    { "name": "אשדוד", "aliases": ["אשדוד"], "neighborhoods": [], "streets": [] },
    { "name": "אשקלון", "aliases": ["אשקלון"], "neighborhoods": [], "streets": [] },
    { "name": "מודיעין", "aliases": ["מודיעין"], "neighborhoods": [], "streets": [] },
    { "name": "מודיעין עילית", "aliases": ["מודיעין עילית", "מוד עילית"], "neighborhoods": [], "streets": [] },
    { "name": "ביתר עילית", "aliases": ["ביתר", "ביתר עילית"], "neighborhoods": [], "streets": [] },
    { "name": "אלעד", "aliases": ["אלעד"], "neighborhoods": [], "streets": [] },
    { "name": "חיפה", "aliases": ["חיפה"], "neighborhoods": [], "streets": [] },
    { "name": "באר שבע", "aliases": ["ב\"ש דרום", "באר שבע"], "neighborhoods": [], "streets": [] },
    { "name": "נתניה", "aliases": ["נתניה"], "neighborhoods": [], "streets": [] },
    { "name": "רמת גן", "aliases": ["רמת גן"], "neighborhoods": [], "streets": [] },
    { "name": "לוד", "aliases": ["לוד"], "neighborhoods": [], "streets": [] },
    { "name": "רמלה", "aliases": ["רמלה"], "neighborhoods": [], "streets": [] },
    { "name": "קריית גת", "aliases": ["קריית גת", "קרית גת"], "neighborhoods": [], "streets": [] },
    { "name": "יבנה", "aliases": ["יבנה"], "neighborhoods": [], "streets": [] },
    { "name": "מבשרת ציון", "aliases": ["מבשרת"], "neighborhoods": [], "streets": [] },
    { "name": "מעלה אדומים", "aliases": ["מעלה אדומים"], "neighborhoods": [], "streets": [] },
    { "name": "צור הדסה", "aliases": ["צור הדסה"], "neighborhoods": [], "streets": [] },
    { "name": "אבו גוש", "aliases": ["אבו גוש"], "neighborhoods": [], "streets": [] },
    { "name": "הר אדר", "aliases": ["הר אדר"], "neighborhoods": [], "streets": [] },
    { "name": "גבעת זאב", "aliases": ["גבעת זאב"], "neighborhoods": [], "streets": [] },
    { "name": "אפרת", "aliases": ["אפרת"], "neighborhoods": [], "streets": [] },
    { "name": "נס ציונה", "aliases": ["נס ציונה"], "neighborhoods": [], "streets": [] },
    { "name": "הרצליה", "aliases": ["הרצליה"], "neighborhoods": [], "streets": [] },
    { "name": "כפר סבא", "aliases": ["כפר סבא", "כ\"ס"], "neighborhoods": [], "streets": [] },
    { "name": "חולון", "aliases": ["חולון"], "neighborhoods": [], "streets": [] },
    { "name": "בת ים", "aliases": ["בת ים"], "neighborhoods": [], "streets": [] }
  ]
}
````

---

## נספח ב: בדיקות

מריצים מתוך תיקיית הפרויקט: `node test-matcher.mjs` ו-`node test-dedupe.mjs`. כל שורה צריכה להתחיל ב-`PASS`. בזמן כתיבת המסמך: 57 בדיקות לסינון ו-29 בדיקות לכפילויות, כולן עוברות.

### test-matcher.mjs

````javascript
import { readFileSync } from "node:fs";
import { createMatcher } from "./matcher.js";
const cities = JSON.parse(readFileSync("cities.json", "utf8"));
// רשימת רחובות דמה: דומה למה שהסקריפט מוריד, כולל "הרצל" בשתי הערים
const streets = {
  "בית שמש": [...cities.cities[0].streets, "הרצל", "נחל שורק", "הנשיא", "יהודה הלוי"],
  "ירושלים": [...cities.cities[1].streets, "הרצל", "ירושלים"],
};
const m = createMatcher(cities, streets);

let bad = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `\n     קיבלתי: ${JSON.stringify(got)}\n     ציפיתי: ${JSON.stringify(want)}`); };

console.log("--- פקודות נהג ---");
const cmd = (t) => { const c = m.parseDriverCommand(t); return [c.mode, c.origin, c.destination]; };
check("פנוי בית שמש", cmd("פנוי בית שמש"), ["from", "בית שמש", null]);
check("פנוי", cmd("פנוי"), ["from", "בית שמש", null]);
check("פנוי בית שמש לירושלים", cmd("פנוי בית שמש לירושלים"), ["route", "בית שמש", "ירושלים"]);
check("פנוי מבית שמש לירושלים", cmd("פנוי מבית שמש לירושלים"), ["route", "בית שמש", "ירושלים"]);
check("פנוי מירושלים לבית שמש (הסדר ההפוך)", cmd("פנוי מירושלים לבית שמש"), ["route", "ירושלים", "בית שמש"]);
check("פנוי ירושלים לבית שמש", cmd("פנוי ירושלים לבית שמש"), ["route", "ירושלים", "בית שמש"]);
check("פנוי פ שמש", cmd("פנוי פ שמש"), ["internal", "בית שמש", null]);
check("פנוי שמש פנימי", cmd("פנוי שמש פנימי"), ["internal", "בית שמש", null]);
check("פנוי פנימי", cmd("פנוי פנימי"), ["internal", "בית שמש", null]);
check("פנוי ירושלים פנימי", cmd("פנוי ירושלים פנימי"), ["internal", "ירושלים", null]);
check("מחפש נסיעה בבית שמש", cmd("מחפש נסיעה בבית שמש"), ["from", "בית שמש", null]);
check("פנוי לירושלים", cmd("פנוי לירושלים"), ["route", "בית שמש", "ירושלים"]);
check('פנוי מי-ם לב"ש', cmd('פנוי מי-ם לב"ש'), ["route", "ירושלים", "בית שמש"]);
check('פנוי מב"ש לי-ם', cmd('פנוי מב"ש לי-ם'), ["route", "בית שמש", "ירושלים"]);
check("פנוי ב\"ש לת\"א", cmd('פנוי ב"ש לת"א'), ["route", "בית שמש", "תל אביב"]);

const st = (mode, origin, destination = null) => ({ mode, origin, destination });
const run = (label, state, rows) => {
  console.log(`--- ${label} ---`);
  for (const [t, want] of rows) {
    const r = m.rideMatches(t, state);
    check(JSON.stringify(t.replace(/\n/g, " / ")) + "  [" + r.reason + "]", r.ok, want);
  }
};

run("פנימי בית שמש", st("internal", "בית שמש"), [
  ["15 דק\nפנימי שמש 50\nנחום לישנה\nביט", true],
  ["פ שמש 50\nרמה ב לביא החדש\nזמין", true],
  ["פ שמש 50\nרמה ב לד נהר הירדן\nזמין", true],
  ["נהר הירקון 40 זמין", true],
  ['ב"ש 50 רמה א', true],
  ["פנימי 50 זמין", true],
  ["יום ראשון בבוקר פ שמש 50", true],
  ["חיים 0501234567 פ שמש 50", true],
  ["ירושלים בית שמש 150", false],
  ["מבית שמש לירושלים 150", false],
  ["פנימי ירושלים 40", false],
  ["תל אביב בית שמש 200", false],
  ["רמלה לוד 80", false],
  ["תל אביב פנימי 50", false],
  ["מתאים לי בשעה חמש", false],
  ["הרצל 30", false],
  ["הר נוף 50", false],
  ["ים המלח 300", false],
  ["חיים 0501234567 מחפש נסיעה", false],
]);

run("יוצא מבית שמש (פנוי בית שמש)", st("from", "בית שמש"), [
  ["פ שמש 50 רמה ב", true],
  ["מבית שמש לאשדוד 120", true],
  ["בית שמש ירושלים 150", true],
  ["מבית שמש לירושלים 150", true],
  ["מירושלים לבית שמש 150", false],
  ["לבית שמש 80", false],
  ["ירושלים 50", false],
  ["אשדוד תל אביב 200", false],
]);

run("מסלול בית שמש ← ירושלים", st("route", "בית שמש", "ירושלים"), [
  ["מבית שמש לירושלים 150", true],
  ["בית שמש ירושלים 150", true],
  ["נחום לישנה ירושלים 150", true],
  ["ירושלים בית שמש 150", false],
  ["מירושלים לבית שמש 150", false],
  ["פ שמש 50", false],
  ["בית שמש תל אביב 200", false],
  ["ירושלים 100", false],
]);

run("מסלול ירושלים ← בית שמש", st("route", "ירושלים", "בית שמש"), [
  ["מירושלים לבית שמש 150", true],
  ["ירושלים בית שמש 150", true],
  ["מהר נוף לרמה ב", true],
  ["מבית שמש לירושלים 150", false],
]);

run("פנימי ירושלים", st("internal", "ירושלים"), [
  ["פנימי ירושלים 40", true],
  ["הר נוף גילה 40", true],
  ["בית שמש ירושלים 150", false],
]);

process.exit(bad ? 1 : 0);
````

### test-dedupe.mjs

````javascript
import { readFileSync } from "node:fs";
import { createMatcher } from "./matcher.js";
import { createDeduper, extractPrice, extractPhones, extractLinks } from "./dedupe.js";
const cities = JSON.parse(readFileSync("cities.json", "utf8"));
const m = createMatcher(cities, { "בית שמש": cities.cities[0].streets, "ירושלים": cities.cities[1].streets });
let bad = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `\n     קיבלתי: ${JSON.stringify(got)}\n     ציפיתי: ${JSON.stringify(want)}`); };

console.log("--- מחיר, טלפון, קישור ---");
check("מחיר פשוט", extractPrice("פ שמש 50\nרמה ב לביא החדש\nזמין"), 50);
check("דקות לא מחיר", extractPrice("15 דק\nפנימי שמש 50\nנחום לישנה\nביט"), 50);
check("טלפון ומחיר", extractPrice("0500000004\n75"), 75);
check("שעה לא מחיר", extractPrice("בשעה 14:30 פ שמש 60"), 60);
check("בשעה 14 בלי נקודותיים", extractPrice("בשעה 14 פ שמש 60"), 60);
check("מספר בית לא מחיר", extractPrice("לביא החדש 12 פ שמש 50"), 50);
check("רמה ב 50 (האות ב לא נבלעת)", extractPrice("פ שמש רמה ב 50"), 50);
check("מחיר עם ₪", extractPrice("מבית שמש לירושלים 30 דק 150 ₪"), 150);
check("בלי מחיר", extractPrice("פ שמש זמין"), null);
check("טלפונים בפורמטים שונים", extractPhones("050-000-0001 ו 972500000002 ו +972 50 000 0003"), ["972500000001", "972500000002", "972500000003"]);
check("קישור", extractLinks("ראה https://waze.com/ul/abc123, תודה"), ["https://waze.com/ul/abc123"]);

console.log("--- כפילויות ---");
const T0 = 1_000_000;
const min = (n) => T0 + n * 60_000;
const fresh = () => createDeduper(m.findPlaces, { windowMs: 15 * 60_000 });
const dup = (d, t, at) => d.check(t, at).duplicate;

{ const d = fresh(); const t = "פ שמש 50\nרמה ב לביא החדש\nזמין";
  check("הודעה ראשונה לא כפילות", dup(d, t, min(0)), false);
  check("אותה הודעה אחרי 3 דקות", dup(d, t, min(3)), true);
  check("אותה הודעה מקבוצה אחרת (אותו טקסט)", dup(d, t, min(4)), true); }

{ const d = fresh();
  dup(d, "15 דק\nפנימי שמש 50\nנחום לישנה\nביט", min(0));
  check("ניסוח אחר, אותו מחיר ואותו רחוב", dup(d, "פ שמש 50 נחום לישנה", min(2)), true);
  check("אותו רחוב, מחיר אחר", dup(d, "פ שמש 60 נחום לישנה", min(3)), false);
  check("אותו מחיר, רחוב אחר", dup(d, "פ שמש 50 נהר הירקון", min(4)), false); }

{ const d = fresh();
  dup(d, "מבית שמש לירושלים 150 0501111111", min(0));
  check("אותו מסלול ומחיר, לקוח אחר (לא כפילות)", dup(d, "מבית שמש לירושלים 150 0502222222", min(1)), false);
  check("אותו לקוח ואותו מחיר", dup(d, "ירושלים בית שמש 150 050-1111111", min(2)), true); }

{ const d = fresh();
  check('"פ שמש 50" קצר לא נבדק כטקסט', [dup(d, "פ שמש 50", min(0)), dup(d, "פ שמש 50", min(1))], [false, false]); }

{ const d = fresh();
  dup(d, "נסיעה https://waze.com/ul/abc123 פ שמש", min(0));
  check("אותו קישור, טקסט אחר", dup(d, "זמין https://waze.com/ul/abc123", min(1)), true); }

{ const d = fresh(); const t = "פ שמש 50\nרמה ב לביא החדש\nזמין";
  dup(d, t, min(0));
  check("אחרי 16 דקות כבר לא כפילות", dup(d, t, min(16)), false); }

{ const d = fresh(); const t = "פ שמש 50\nרמה ב לביא החדש\nזמין";
  dup(d, t, min(0)); dup(d, t, min(10)); dup(d, t, min(20));
  check("שליחה חוזרת כל 10 דקות נשארת חסומה", dup(d, t, min(30)), true); }

{ const d = fresh(); const t = "פ שמש 50\nרמה ב לביא החדש\nזמין";
  dup(d, t, min(0)); d.clear();
  check("אחרי clear (איפוס 2:00) לא כפילות", [dup(d, t, min(1)), d.size > 0], [false, true]); }

{ const d = fresh();
  dup(d, "פ שמש 50\nרמה ב לביא החדש\nזמין", min(0));
  check("העתק עם הרחוב בלבד (בלי השכונה)", dup(d, "פנימי שמש 50 לביא החדש", min(1)), true); }

{ const d = fresh();
  dup(d, "פ שמש 50 לביא החדש 0501111111", min(0));
  check("אותו רחוב ומחיר, לקוח אחר (לא כפילות)", dup(d, "פ שמש 50 לביא החדש 0502222222", min(1)), false);
  check("אותו רחוב ומחיר ואותו לקוח", dup(d, "פנימי שמש 50 לביא החדש 050-1111111", min(2)), true); }

{ const d = fresh();
  dup(d, "פ שמש 50 רמה ב", min(0));
  check("שכונה בלבד באותו מחיר, בלי רחוב: נחשב כפילות", dup(d, "פנימי שמש 50 רמה ב", min(1)), true);
  check("שכונה אחרת: לא כפילות", dup(d, "פ שמש 50 רמה ג", min(2)), false); }

process.exit(bad ? 1 : 0);
````

---

## נספח ג: package.json ו-.gitignore

`package.json` נוצר עם `npm init -y`, ואז נוספה השורה `"type": "module",`. התלויות הותקנו עם:

```
npm install @whiskeysockets/baileys pino node-cron express better-sqlite3
```

אם מעלים את הקוד ל-Git, הקובץ `.gitignore` חייב להכיל לפחות:

```
auth/
node_modules/
```

התיקייה `auth/` מכילה את הסשן של הוואטסאפ, וכל מי שמחזיק בה שולט בחשבון. מומלץ גם להעביר בהמשך את `BOT_PHONE` ו-`MY_PHONE` מהקוד לקובץ `.env`.
