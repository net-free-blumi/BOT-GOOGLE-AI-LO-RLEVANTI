import { SpamTrimRule } from '../types.ts';

const SPAM_RULES_KEY = 'rides_spam_cleaner_rules';

export const DEFAULT_SPAM_RULES: SpamTrimRule[] = [
  {
    id: 'separator-cut',
    enabled: true,
    name: 'חיתוך לאחר קו מפריד (━━━━━━━━━━━━━━)',
    pattern: '━━━━━━━━━━━━━━',
    isRegex: false,
  },
  {
    id: 'drivebot-promo',
    enabled: true,
    name: 'חסימת פרסומות דרייבוט ("התחברו לפלטפורמות...")',
    pattern: 'חשוב: התחברו כבר עכשיו לפלטפורמות החדשות של דרייבוט',
    isRegex: false,
  },
  {
    id: 'telegram-red',
    enabled: true,
    name: 'הסרת קישורי טלגרם אדום / וואטסאפ אדום',
    pattern: '🔴\\s*\\|\\s*(?:הטלגרם האדום|הוואטסאפ האדום|קבוצת כל הנסיעות)[^\\n]*(\\nhttps?://[^\\s]+)?',
    isRegex: true,
  },
  {
    id: 'drivebot-url',
    enabled: true,
    name: 'הסרת קישורי drivebot.co.il',
    pattern: 'https?:\\/\\/[^\\s]*drivebot\\.co\\.il[^\\s]*',
    isRegex: true,
  },
  {
    id: 'bot-closure-warning',
    enabled: true,
    name: 'הסרת אזהרת "הבוט ייסגר בימים הקרובים"',
    pattern: 'הבוט בוואטסאפ ייסגר לחלוטין בימים הקרובים',
    isRegex: false,
  },
];

export function loadSpamRules(): SpamTrimRule[] {
  try {
    const raw = localStorage.getItem(SPAM_RULES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return DEFAULT_SPAM_RULES;
}

export function saveSpamRules(rules: SpamTrimRule[]) {
  localStorage.setItem(SPAM_RULES_KEY, JSON.stringify(rules));
}

/**
 * Cleans spam, ads, and long unnecessary text from a ride message
 */
export function cleanRideMessage(
  rawText: string,
  rules: SpamTrimRule[]
): { cleaned: string; removedCount: number } {
  if (!rawText) return { cleaned: '', removedCount: 0 };
  let result = rawText;
  let removedCount = 0;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.id === 'separator-cut' || rule.pattern === '━━━━━━━━━━━━━━') {
      const idx = result.indexOf('━━━━━━━━━━━━━━');
      if (idx !== -1) {
        result = result.slice(0, idx).trim();
        removedCount++;
        continue;
      }
      const altIdx = result.indexOf('───────────────');
      if (altIdx !== -1 && altIdx > 30) {
        // If it appears near the bottom
        // keep upper part
      }
    }

    if (rule.isRegex) {
      try {
        const re = new RegExp(rule.pattern, 'gi');
        if (re.test(result)) {
          result = result.replace(re, '');
          removedCount++;
        }
      } catch {
        // invalid regex safe skip
      }
    } else {
      if (result.includes(rule.pattern)) {
        result = result.split(rule.pattern).join('');
        removedCount++;
      }
    }
  }

  // Clean trailing empty lines
  result = result
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleaned: result, removedCount };
}
