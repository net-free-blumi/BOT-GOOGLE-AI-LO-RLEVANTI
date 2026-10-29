// interactive.js - מנגנון כפתורים אינטראקטיביים ותפריט נפתח עבור וואטסאפ (Baileys)
// תומך ב-Native Flow v2 (Quick Reply / CTA / Single Select List)
// כולל Fallback בטוח לטקסט רגיל כדי להבטיח 100% מסירה לכל מכשיר

/**
 * חילוץ תגובות כפתורים מתוך מבני הודעה שונים בוואטסאפ
 */
export function extractInteractiveResponse(rawMsg) {
  if (!rawMsg) return null;
  let msg = rawMsg;

  // פירוק שכבות viewOnce או ephemeral אם קיימות
  for (let i = 0; i < 5; i++) {
    const inner =
      msg.ephemeralMessage?.message ||
      msg.viewOnceMessage?.message ||
      msg.viewOnceMessageV2?.message ||
      msg.documentWithCaptionMessage?.message ||
      msg.editedMessage?.message?.protocolMessage?.editedMessage;
    if (!inner) break;
    msg = inner;
  }

  // 1. מענה מלחיצה על כפתור רגיל (Buttons Response)
  if (msg.buttonsResponseMessage?.selectedButtonId) {
    return msg.buttonsResponseMessage.selectedButtonId.trim();
  }
  if (msg.buttonsResponseMessage?.selectedDisplayText) {
    return msg.buttonsResponseMessage.selectedDisplayText.trim();
  }

  // 2. מענה מכפתור תבנית (Template Button Reply)
  if (msg.templateButtonReplyMessage?.selectedId) {
    return msg.templateButtonReplyMessage.selectedId.trim();
  }
  if (msg.templateButtonReplyMessage?.selectedDisplayText) {
    return msg.templateButtonReplyMessage.selectedDisplayText.trim();
  }

  // 3. מענה מבחירה ברשימה נפתחת (List Response Message)
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return msg.listResponseMessage.singleSelectReply.selectedRowId.trim();
  }

  // 4. מענה מ-Native Flow Interactive Response (הפורמט המודרני של מטא)
  if (msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const parsed = JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
      if (parsed.id) return String(parsed.id).trim();
      if (parsed.selected_id) return String(parsed.selected_id).trim();
      if (parsed.text) return String(parsed.text).trim();
    } catch (e) {}
  }

  // 5. מענה מכפתור אינטראקטיבי ישיר
  if (msg.interactiveResponseMessage?.body?.text) {
    return msg.interactiveResponseMessage.body.text.trim();
  }

  return null;
}

/**
 * שליחת הודעת כפתורים אינטראקטיבית (Native Flow + Fallback)
 * @param {object} sock - חיבור ה-Baileys
 * @param {string} jid - יעד ההודעה
 * @param {object} options - תוכן ההודעה, כפתורים ואפשרויות
 */
export async function sendInteractiveButtons(sock, jid, {
  title = "",
  body = "",
  footer = "🚕 נסיעות בוט איכותי",
  buttons = [],
  quoted = null,
}) {
  if (!sock) return null;

  // בניית כפתורי Native Flow
  const nativeButtons = buttons.map((b) => {
    if (b.type === "url" || b.url) {
      return {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: b.text || b.displayText,
          url: b.url,
          merchant_url: b.url,
        }),
      };
    }
    if (b.type === "call" || b.phoneNumber) {
      return {
        name: "cta_call",
        buttonParamsJson: JSON.stringify({
          display_text: b.text || b.displayText,
          phone_number: b.phoneNumber,
        }),
      };
    }
    // כפתור Quick Reply רגיל - שולח תגובה טקסטואלית בעת לחיצה
    return {
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({
        display_text: b.text || b.displayText,
        id: b.id || b.buttonId || b.text,
      }),
    };
  });

  // ניסיון 1: שליחה כמבנה InteractiveMessage בפורמט Native Flow (הנתמך ביותר באפליקציות מודרניות)
  try {
    const interactiveMessage = {
      header: title ? { title, hasMediaAttachment: false } : undefined,
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      nativeFlowMessage: {
        buttons: nativeButtons,
        messageParamsJsonType: 1,
      },
    };

    const payload = {
      viewOnceMessage: {
        message: {
          interactiveMessage,
        },
      },
    };

    const res = await sock.sendMessage(jid, payload, quoted ? { quoted } : {});
    if (res?.key?.id) return res;
  } catch (errInteractive) {
    // ממשיכים לניסיון הבא
  }

  // ניסיון 2: מבנה Buttons רגיל של Baileys
  try {
    const legacyButtons = buttons.map((b, idx) => ({
      buttonId: b.id || b.buttonId || String(idx + 1),
      buttonText: { displayText: b.text || b.displayText },
      type: 1,
    }));

    const legacyPayload = {
      text: body,
      footer: footer,
      buttons: legacyButtons,
      headerType: 1,
    };

    const res = await sock.sendMessage(jid, legacyPayload, quoted ? { quoted } : {});
    if (res?.key?.id) return res;
  } catch (errLegacy) {
    // ממשיכים ל-Fallback
  }

  // ניסיון 3 (Fallback בטוח): שליחה כטקסט מעוצב ונוח כדי שאף הודעה לא תלך לאיבוד
  let fallbackText = body;
  if (buttons.length > 0) {
    fallbackText += `\n\n━━━━━━━━━━━━━━━━━━━━\n🔘 *פעולות מהירות (השב במספר או מילה):*\n`;
    buttons.forEach((b, i) => {
      fallbackText += `👉 *${b.id || i + 1}* ⬅️ ${b.text || b.displayText}\n`;
    });
  }

  return await sock.sendMessage(jid, { text: fallbackText }, quoted ? { quoted } : {});
}

/**
 * שליחת תפריט נפתח (Interactive Single Select List)
 */
export async function sendInteractiveList(sock, jid, {
  title = "📋 תפריט פעולות",
  body = "בחר פעולה מהרשימה:",
  buttonText = "📋 פתח תפריט אפשרויות",
  sections = [],
  footer = "🚕 נסיעות בוט איכותי",
  quoted = null,
}) {
  if (!sock) return null;

  // ניסיון 1: שליחה כ-Native Flow Single Select
  try {
    const nativeListPayload = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: { title, hasMediaAttachment: false },
            body: { text: body },
            footer: { text: footer },
            nativeFlowMessage: {
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    title: buttonText,
                    sections: sections.map((sec) => ({
                      title: sec.title,
                      rows: sec.rows.map((r) => ({
                        header: r.header || "",
                        title: r.title,
                        description: r.description || "",
                        id: r.id || r.rowId || r.title,
                      })),
                    })),
                  }),
                },
              ],
            },
          },
        },
      },
    };

    const res = await sock.sendMessage(jid, nativeListPayload, quoted ? { quoted } : {});
    if (res?.key?.id) return res;
  } catch (errNativeList) {}

  // ניסיון 2: מבנה רשימה קלאסי של Baileys
  try {
    const classicListPayload = {
      text: body,
      footer: footer,
      title: title,
      buttonText: buttonText,
      sections: sections.map((sec) => ({
        title: sec.title,
        rows: sec.rows.map((r) => ({
          title: r.title,
          description: r.description || "",
          rowId: r.id || r.rowId || r.title,
        })),
      })),
    };

    const res = await sock.sendMessage(jid, classicListPayload, quoted ? { quoted } : {});
    if (res?.key?.id) return res;
  } catch (errClassicList) {}

  // ניסיון 3 (Fallback בטוח): שליחה כטקסט
  let fallbackText = `*${title}*\n${body}\n\n`;
  sections.forEach((sec) => {
    fallbackText += `📂 *${sec.title}*\n`;
    sec.rows.forEach((r) => {
      fallbackText += `• *${r.title}* ${r.description ? `(${r.description})` : ""}\n`;
    });
    fallbackText += `\n`;
  });

  return await sock.sendMessage(jid, { text: fallbackText.trim() }, quoted ? { quoted } : {});
}

/**
 * שליחת התראת נסיעה עם כפתור תפיסה מהיר "ת" וכפתור וואטסאפ לסדרן
 */
export async function sendRideAlertWithButtons(sock, jid, rideData, quoted = null) {
  const alertBody = `${rideData.cleanedText}\n\n` +
    `📍 ${rideData.groupName}\n` +
    `👤 ${rideData.senderName} · ${rideData.senderPhone}`;

  const buttons = [
    {
      id: "ת",
      text: "🚕 ת (תן לי)",
      type: "quick_reply",
    },
  ];

  // אם יש מספר סדרן תקין, הוספת כפתור קישור ישיר לוואטסאפ של הסדרן
  const rawPhone = String(rideData.senderPhone || "").replace(/\D/g, "");
  if (rawPhone && rawPhone.length >= 9 && rawPhone !== "זמין בקבוצה") {
    let intlPhone = rawPhone;
    if (intlPhone.startsWith("0")) intlPhone = "972" + intlPhone.slice(1);
    buttons.push({
      text: "💬 וואטסאפ לסדרן",
      url: `https://wa.me/${intlPhone}`,
      type: "url",
    });
  }

  return await sendInteractiveButtons(sock, jid, {
    body: alertBody,
    footer: "💡 לחץ 'ת' לתפיסה מהירה · סמן 👎 לדיווח תקלה",
    buttons,
    quoted,
  });
}

/**
 * שליחת הודעת אישור חיפוש מקבילי עם 3 כפתורים
 */
export async function sendPendingSearchConfirmationWithButtons(sock, jid, { currentSearches = [], newSearch, modeDesc = "" }) {
  const currentList = currentSearches.map((s, idx) => `${idx + 1}. ${s.displayText}`).join("\n");
  
  let body = `🔍 *יש לך כרגע חיפוש פעיל במערכת:*\n${currentList}\n\n`;
  body += `❓ *האם להוסיף את החיפוש החדש במקביל?*\n`;
  body += `📍 *חיפוש חדש:* ${newSearch.displayText} (${modeDesc})`;

  const buttons = [
    {
      id: "1",
      text: "➕ הוסף במקביל",
      type: "quick_reply",
    },
    {
      id: "2",
      text: "🔄 החלף את הקיים",
      type: "quick_reply",
    },
    {
      id: "ביטול",
      text: "❌ ביטול",
      type: "quick_reply",
    },
  ];

  return await sendInteractiveButtons(sock, jid, {
    title: "⚡ חיפוש מקבילי - אישור",
    body,
    footer: "בחר בלחיצה על אחד הכפתורים למטה",
    buttons,
  });
}

/**
 * שליחת תפריט פעולות נפתח מלא (אינטראקטיבי)
 */
export async function sendFullInteractiveMenu(sock, jid, { activeSearches = [], describeMode }) {
  let body = `📊 *סטטוס נוכחי:* `;
  if (activeSearches.length > 0) {
    body += `🟢 ${activeSearches.length} חיפושים פעילים במקביל:\n`;
    activeSearches.forEach((s, idx) => {
      body += `${idx + 1}. ${s.displayText} (${describeMode(s)})\n`;
    });
  } else {
    body += `🔴 מופסק (תפוס / לא מחפש כרגע)\n`;
  }
  body += `\nבחר פעולה מהירה מתוך התפריט הנפתח:`;

  const sections = [
    {
      title: "🛑 שליטה ובקרה",
      rows: [
        {
          id: "תפוס",
          title: "🛑 תפוס (עצור הכל)",
          description: "מפסיק את כל החיפושים הפעילים מיד",
        },
        {
          id: "תפריט",
          title: "📋 רענן סטטוס",
          description: "מציג שוב את רשימת החיפושים הפעילים",
        },
      ],
    },
    {
      title: "🏠 חיפושים מהירים - בית שמש",
      rows: [
        {
          id: "פנוי שמש",
          title: "🚕 פנוי שמש (בתוך ומחוץ לעיר)",
          description: "נסיעות פנימיות + נסיעות מבית שמש החוצה",
        },
        {
          id: "פנוי שמש פנימי",
          title: "🔒 פנוי שמש פנימי בלבד",
          description: "רק נסיעות בתוך בית שמש",
        },
        {
          id: "פ שמש ים",
          title: "🚗 בית שמש ⬅️ ירושלים",
          description: "נסיעות מבית שמש לירושלים בלבד",
        },
      ],
    },
    {
      title: "🏛️ חיפושים מהירים - ירושלים ומירון",
      rows: [
        {
          id: "פנוי ים",
          title: "🚕 פנוי ים (בתוך ומחוץ לעיר)",
          description: "נסיעות פנימיות + מירושלים החוצה",
        },
        {
          id: "פנוי ים פנימי",
          title: "🔒 פנוי ים פנימי בלבד",
          description: "רק נסיעות בתוך ירושלים",
        },
        {
          id: "פ ים שמש",
          title: "🚗 ירושלים ⬅️ בית שמש",
          description: "נסיעות מירושלים לבית שמש בלבד",
        },
        {
          id: "פנוי מירון",
          title: "⛰️ פנוי מירון",
          description: "נסיעות מאזור מירון וצפת",
        },
      ],
    },
    {
      title: "🔗 הגדרות וסנכרון",
      rows: [
        {
          id: "חבר אותי",
          title: "🔗 קישור וואטסאפ (ווב)",
          description: "הפקת קוד צימוד לסריקת הקבוצות שלך",
        },
      ],
    },
  ];

  return await sendInteractiveList(sock, jid, {
    title: "🚕 תפריט נסיעות בוט איכותי",
    body,
    buttonText: "📋 לחץ כאן לבחירת פקודה",
    sections,
    footer: "נסיעות בוט איכותי · שליטה קלה בלחיצה אחת",
  });
}
