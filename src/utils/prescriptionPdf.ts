import { Prescription } from '../types/index.ts';
import { api, getStoredToken } from '../services/api.ts';

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const BANGLA_DIGIT_MAP: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

const BANGLA_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

export type RxFieldLang = 'bn' | 'en' | 'bilingual';

export function toBanglaDigits(str: string): string {
  return str.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)] || d);
}

export function toEnglishDigits(str: string): string {
  return str.replace(/[০-৯]/g, (d) => BANGLA_DIGIT_MAP[d] ?? d);
}

export const PAIN_NOTE_BY_LANG: Record<RxFieldLang, string> = {
  bn: 'ব্যথা হলে খাবেন',
  en: 'Take if pain persists',
  bilingual: 'ব্যথা হলে খাবেন (Take if pain persists)',
};

const KNOWN_PAIN_NOTE_VARIANTS = [
  'ব্যথা হলে খাবেন (Take if pain persists)',
  'ব্যথা হলে খাবেন (Take if pain)',
  'ব্যথা হলে খাবেন',
  'ব্যাথা হলে খাবেন',
  'Take only if pain persists',
  'Take if pain persists',
  'Take if there is pain',
];

export function parseAdditionalNotes(raw?: string | null): {
  hasPainNote: boolean;
  customNote: string;
} {
  if (!raw || !raw.trim()) {
    return { hasPainNote: false, customNote: '' };
  }
  let remaining = raw.trim();
  let foundPain = false;

  for (const variant of KNOWN_PAIN_NOTE_VARIANTS) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    if (regex.test(remaining)) {
      foundPain = true;
      remaining = remaining.replace(regex, '').trim();
    }
  }

  remaining = remaining
    .replace(/^[\s,;|—–\-•]+/, '')
    .replace(/[\s,;|—–\-•]+$/, '')
    .trim();

  return {
    hasPainNote: foundPain,
    customNote: remaining,
  };
}

export function buildAdditionalNotes(
  hasPainNote: boolean,
  customNote: string,
  lang: RxFieldLang
): string {
  const cleanCustom = customNote.trim();
  const painLabel = PAIN_NOTE_BY_LANG[lang];
  if (hasPainNote && cleanCustom) {
    return `${painLabel} — ${cleanCustom}`;
  }
  if (hasPainNote) {
    return painLabel;
  }
  return cleanCustom;
}

export function convertAdditionalNotesLang(raw: string, lang: RxFieldLang): string {
  const { hasPainNote, customNote } = parseAdditionalNotes(raw);
  const convertedCustom =
    lang === 'bn'
      ? toBanglaDigits(customNote)
      : lang === 'en'
        ? toEnglishDigits(customNote)
        : customNote;
  return buildAdditionalNotes(hasPainNote, convertedCustom, lang);
}

/**
 * Formats a duration value according to the selected language ('bn' | 'en' | 'bilingual').
 * E.g., bare number "5" or "৫":
 *  - 'bn'        -> "৫ দিন"
 *  - 'en'        -> "5 days"
 *  - 'bilingual' -> "৫ দিন (5 days)"
 */
export function autoFormatDuration(raw: string, lang: RxFieldLang): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  // Match number + optional unit (day/din/দিন, week/soptaho/সপ্তাহ, month/mas/মাস) + optional parenthetical
  const durationPattern =
    /^([0-9০-৯]+(?:\.[0-9০-৯]+)?)\s*(din|day|days|দিন|soptaho|week|weeks|সপ্তাহ|mas|mash|month|months|মাস)?(?:\s*\([^)]*\))?$/i;
  const match = durationPattern.exec(trimmed);

  if (match) {
    const enNum = toEnglishDigits(match[1]);
    const bnNum = toBanglaDigits(enNum);
    const rawUnit = (match[2] || '').toLowerCase();

    let unitType: 'day' | 'week' | 'month' = 'day';
    if (['soptaho', 'week', 'weeks', 'সপ্তাহ'].includes(rawUnit)) {
      unitType = 'week';
    } else if (['mas', 'mash', 'month', 'months', 'মাস'].includes(rawUnit)) {
      unitType = 'month';
    }

    const isSingular = enNum === '1';
    const bnUnit = unitType === 'week' ? 'সপ্তাহ' : unitType === 'month' ? 'মাস' : 'দিন';
    const enUnit =
      unitType === 'week'
        ? isSingular
          ? 'week'
          : 'weeks'
        : unitType === 'month'
          ? isSingular
            ? 'month'
            : 'months'
          : isSingular
            ? 'day'
            : 'days';

    if (lang === 'bn') {
      return `${bnNum} ${bnUnit}`;
    }
    if (lang === 'en') {
      return `${enNum} ${enUnit}`;
    }
    return `${bnNum} ${bnUnit} (${enNum} ${enUnit})`;
  }

  // Fallback for custom duration strings: convert digits when in bn or en mode
  if (lang === 'bn') {
    return toBanglaDigits(trimmed);
  }
  if (lang === 'en') {
    return toEnglishDigits(trimmed);
  }
  return trimmed;
}

/**
 * Live onChange handler for the Duration input so typing "5" immediately becomes "৫ দিন"
 * (in Bangla mode), "5 days" (in English mode), or "৫ দিন (5 days)" (in Bilingual mode),
 * while allowing multi-digit typing (e.g. typing "1" then "4" -> "১৪ দিন") and clean Backspace deletion.
 */
export function handleLiveDurationInput(
  newValue: string,
  prevValue: string,
  lang: RxFieldLang
): { value: string; cursorIndex: number | null } {
  const trimmed = newValue.trim();
  if (!trimmed) {
    return { value: '', cursorIndex: null };
  }

  // Detect if user pressed Backspace at the end of an auto-formatted string (e.g. "৫ দিন" -> "৫ দি" or "5 days" -> "5 day")
  const isDeleting = newValue.length < prevValue.length;
  if (isDeleting) {
    const prevDigitsMatch = /^([0-9০-৯]+)\s*(?:দিন|days?|সপ্তাহ|weeks?|মাস|months?)/i.exec(
      prevValue.trim()
    );
    const newCompleteMatch =
      /^([0-9০-৯]+)\s*(?:দিন|days?|সপ্তাহ|weeks?|মাস|months?)(?:\s*\([^)]*\))?$/i.exec(trimmed);

    // If previous value was an auto-formatted duration and user deleted part of the suffix or last digit
    if (prevDigitsMatch && !newCompleteMatch) {
      const prevEnDigits = toEnglishDigits(prevDigitsMatch[1]);
      // Check if digits themselves were shortened (user backspaced right after the digits)
      const currentLeadingDigits = /^([0-9০-৯]+)/.exec(trimmed);
      const curEnDigits = currentLeadingDigits ? toEnglishDigits(currentLeadingDigits[1]) : '';

      const remainingDigits =
        curEnDigits.length < prevEnDigits.length
          ? curEnDigits
          : prevEnDigits.slice(0, Math.max(0, prevEnDigits.length - 1));

      if (!remainingDigits) {
        return { value: '', cursorIndex: 0 };
      }
      const formatted = autoFormatDuration(remainingDigits, lang);
      const numPrefixLen =
        lang === 'en' ? remainingDigits.length : toBanglaDigits(remainingDigits).length;
      return { value: formatted, cursorIndex: numPrefixLen };
    }
  }

  // If user typed a bare number (e.g. "5" or "৫")
  if (/^[0-9০-৯]+$/.test(trimmed)) {
    const formatted = autoFormatDuration(trimmed, lang);
    const numPrefixLen =
      lang === 'en' ? toEnglishDigits(trimmed).length : toBanglaDigits(trimmed).length;
    return { value: formatted, cursorIndex: numPrefixLen };
  }

  // If user typed another digit while an auto-formatted suffix was present
  // e.g. "৫ দিন2" (cursor at end) or "৫2 দিন" (cursor after digit)
  const appendedDigitMatch =
    /^([0-9০-৯]+)\s*(?:দিন|days?)(?:\s*\([0-9]+\s*days?\))?\s*([0-9০-৯]+)$/i.exec(trimmed);
  if (appendedDigitMatch) {
    const combinedDigits = toEnglishDigits(appendedDigitMatch[1] + appendedDigitMatch[2]);
    const formatted = autoFormatDuration(combinedDigits, lang);
    const numPrefixLen =
      lang === 'en' ? combinedDigits.length : toBanglaDigits(combinedDigits).length;
    return { value: formatted, cursorIndex: numPrefixLen };
  }

  // If user typed "5 din" or "5 days" or "1 week" explicitly
  if (
    /^([0-9০-৯]+)\s*(din|days?|দিন|soptaho|weeks?|সপ্তাহ|mas|mash|months?|মাস)$/i.test(trimmed)
  ) {
    const formatted = autoFormatDuration(trimmed, lang);
    return { value: formatted, cursorIndex: formatted.length };
  }

  // Otherwise custom free text: convert digits if in Bangla mode
  const customOut =
    lang === 'bn'
      ? toBanglaDigits(newValue)
      : lang === 'en'
        ? toEnglishDigits(newValue)
        : newValue;
  return { value: customOut, cursorIndex: null };
}

export function formatBanglaDate(isoDate?: string | null): string {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return isoDate;
  const year = toBanglaDigits(match[1]);
  const monthIdx = parseInt(match[2], 10) - 1;
  const day = toBanglaDigits(String(parseInt(match[3], 10)));
  const monthName = BANGLA_MONTHS[monthIdx] || match[2];
  return `${day} ${monthName} ${year}`;
}

export const BANGLA_CARE_CATEGORIES = [
  {
    key: 'oralHygieneInstructions' as const,
    titleBn: 'মুখের যত্নের নির্দেশনা',
    helperBn: 'মুখ পরিষ্কার ও সুস্থ রাখতে সাধারণ পরামর্শ',
    placeholder: 'যেমন: প্রতিবার খাবারের পর কুসুম গরম লবণ পানি দিয়ে কুলকুচি করুন...',
  },
  {
    key: 'toothBrushingInstructions' as const,
    titleBn: 'দাঁত ব্রাশ করার নির্দেশনা',
    helperBn: 'ব্রাশ করার সঠিক সময়, পদ্ধতি ও টুথব্রাশের ধরন',
    placeholder: 'যেমন: নরম ব্রাশ দিয়ে দিনে দুবার (সকাল ও রাতে খাবারের পর) হালকাভাবে ব্রাশ করুন...',
  },
  {
    key: 'mouthwashRecommendations' as const,
    titleBn: 'মাউথওয়াশ ব্যবহারের নির্দেশনা',
    helperBn: 'মাউথওয়াশ ব্যবহারের পরিমাণ, সময়কাল ও নিয়ম',
    placeholder: 'যেমন: ক্লোরহেক্সিডিন মাউথওয়াশ ১০ মি.লি. নিয়ে ৩০ সেকেন্ড কুলকুচি করে ফেলে দিন...',
  },
  {
    key: 'postExtractionInstructions' as const,
    titleBn: 'দাঁত তোলার পর করণীয়',
    helperBn: 'দাঁত তোলার পর রক্ত বন্ধ ও ক্ষতস্থানের যত্ন',
    placeholder: 'যেমন: তুলা বা গজ ৪৫ মিনিট কামড়ে ধরে রাখুন, ২৪ ঘণ্টা থুথু বা জোরে কুলকুচি করবেন না...',
  },
  {
    key: 'postTreatmentPrecautions' as const,
    titleBn: 'চিকিৎসার পর সতর্কতা',
    helperBn: 'চিকিৎসা পরবর্তী সাবধানতা ও জরুরি যোগাযোগের পরামর্শ',
    placeholder: 'যেমন: অবশ ভাব থাকা অবস্থায় গরম খাবার বা গাল কামড়ানো থেকে বিরত থাকুন...',
  },
  {
    key: 'dietaryRecommendations' as const,
    titleBn: 'খাবার সংক্রান্ত নির্দেশনা',
    helperBn: 'কী খাবেন এবং কী ধরনের খাবার এড়িয়ে চলবেন',
    placeholder: 'যেমন: প্রথম ২৪-৪৮ ঘণ্টা নরম ও ঠান্ডা/স্বাভাবিক তাপমাত্রার খাবার খান; শক্ত ও ঝাল খাবার পরিহার করুন...',
  },
  {
    key: 'additionalClinicalAdvice' as const,
    titleBn: 'পরবর্তী সাক্ষাতের নির্দেশনা ও অন্যান্য নির্দেশনা',
    helperBn: 'পরবর্তী অ্যাপয়েন্টমেন্ট ও অতিরিক্ত পরামর্শ',
    placeholder: 'যেমন: অ্যান্টিবায়োটিকের সম্পূর্ণ কোর্স শেষ করুন এবং নির্ধারিত তারিখে ফলো-আপের জন্য আসুন...',
  },
];

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRxDateDisplay(iso?: string | null): string {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function shortDosagePrefix(dosageType?: string | null, medName?: string | null): string {
  const dt = (dosageType || '').trim().toLowerCase();
  const mn = (medName || '').trim().toLowerCase();
  if (
    mn.startsWith('tab.') ||
    mn.startsWith('cap.') ||
    mn.startsWith('syp.') ||
    mn.startsWith('inj.')
  ) {
    return '';
  }
  if (!dt) return '';
  if (dt.includes('tablet') || dt === 'tab') return 'Tab.';
  if (dt.includes('capsule') || dt === 'cap') return 'Cap.';
  if (dt.includes('syrup') || dt.includes('suspension') || dt === 'syp') return 'Syp.';
  if (dt.includes('mouthwash') || dt.includes('gargle') || dt.includes('solution'))
    return 'Mouthwash';
  if (dt.includes('gel') || dt.includes('paste')) return 'Gel';
  if (dt.includes('drop')) return 'Drops';
  if (dt.includes('injection') || dt === 'inj') return 'Inj.';
  if (dt.includes('ointment') || dt.includes('cream')) return 'Oint.';
  if (dt.includes('suppository')) return 'Supp.';
  return dosageType || '';
}

function splitToLines(text?: string | null): string[] {
  if (!text || !text.trim()) return [];
  return text
    .split(/\r?\n|;|•/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Generates a standalone, print-ready A4 HTML document for a Prescription and triggers the browser
 * print dialog via a hidden same-origin iframe (with fallback to main-window print).
 */
export function printPrescription(rx: Prescription): void {
  // Log print export asynchronously so the browser's synchronous user-activation token is never lost
  api.logPrescriptionExport(rx.id, 'print').catch(() => {});

  const clinicName = rx.clinic?.clinicName || 'Dental Care';
  const clinicAddress =
    rx.clinic?.clinicAddress || 'House 42, Road 11, Banani, Dhaka-1213, Bangladesh';
  const clinicPhone = rx.clinic?.clinicPhone || '+880 2-9876543, +880 1711-234567';
  const showPlanCosts = rx.showPlanCosts !== false;

  const planItems = (rx.treatmentPlanItems || []).filter((item) => item.treatmentName?.trim());
  const testItems = (rx.advisedTests || []).filter((item) => item.testName?.trim());
  const customSections = (rx.customSections || []).filter(
    (s) => s.heading?.trim() && s.content?.trim()
  );

  // Build left-column sidebar sections
  const sidebarSections: Array<{ title: string; bullets: string[] }> = [];
  const ccLines = splitToLines(rx.chiefComplaints);
  if (ccLines.length > 0) sidebarSections.push({ title: 'Chief Complaint', bullets: ccLines });

  const historyLines: string[] = [];
  if (
    rx.patientExistingDiseases &&
    !['none', 'n/a', '-'].includes(rx.patientExistingDiseases.trim().toLowerCase())
  ) {
    historyLines.push(`Medical: ${rx.patientExistingDiseases.trim()}`);
  }
  if (
    rx.patientAllergies &&
    !['none', 'n/a', '-'].includes(rx.patientAllergies.trim().toLowerCase())
  ) {
    historyLines.push(`Drug Allergies: ${rx.patientAllergies.trim()}`);
  }
  if (
    rx.patientMedicalHistory &&
    !['none', 'n/a', '-'].includes(rx.patientMedicalHistory.trim().toLowerCase())
  ) {
    historyLines.push(...splitToLines(rx.patientMedicalHistory));
  }
  if (historyLines.length > 0) sidebarSections.push({ title: 'History', bullets: historyLines });

  const cfLines = splitToLines(rx.clinicalFindings);
  if (cfLines.length > 0) sidebarSections.push({ title: 'On Examinations', bullets: cfLines });

  const dxLines = splitToLines(rx.diagnosis);
  if (dxLines.length > 0) sidebarSections.push({ title: 'Diagnosis', bullets: dxLines });

  const tpLines = splitToLines(rx.treatmentPlan);
  if (tpLines.length > 0) sidebarSections.push({ title: 'Treatment Plan', bullets: tpLines });

  for (const sec of customSections) {
    const lines = splitToLines(sec.content);
    if (lines.length > 0) sidebarSections.push({ title: sec.heading.trim(), bullets: lines });
  }

  if (testItems.length > 0) {
    const testBullets = testItems.map((t) => {
      const c =
        showPlanCosts && t.cost !== null && t.cost !== undefined && String(t.cost).trim() !== ''
          ? ` (৳${Number(t.cost).toLocaleString('en-BD')})`
          : '';
      const n = t.notes?.trim() ? ` — ${t.notes.trim()}` : '';
      return `${t.testName}${c}${n}`;
    });
    sidebarSections.push({ title: 'Investigations', bullets: testBullets });
  }

  const dentalInstructionRows = [
    { label: 'মুখের যত্নের নির্দেশনা', value: rx.oralHygieneInstructions },
    { label: 'দাঁত ব্রাশ করার নির্দেশনা', value: rx.toothBrushingInstructions },
    { label: 'মাউথওয়াশ ব্যবহারের নির্দেশনা', value: rx.mouthwashRecommendations },
    { label: 'দাঁত তোলার পর করণীয়', value: rx.postExtractionInstructions },
    { label: 'চিকিৎসার পর সতর্কতা', value: rx.postTreatmentPrecautions },
    { label: 'খাবার সংক্রান্ত নির্দেশনা', value: rx.dietaryRecommendations },
    { label: 'অতিরিক্ত পরামর্শ', value: rx.additionalClinicalAdvice },
  ].filter((item) => item.value && item.value.trim().length > 0);

  const hasAllergyAlert =
    rx.patientAllergies &&
    !['none', 'n/a', 'nil', '-'].includes(rx.patientAllergies.trim().toLowerCase());

  const html = `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8" />
  <title>Prescription ${escapeHtml(rx.prescriptionNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Plus Jakarta Sans', 'Noto Sans Bengali', system-ui, -apple-system, sans-serif;
      color: #0f172a;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.45;
    }
    .sheet {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 270mm;
      border: 1px solid #cbd5e1;
    }
    .top-bar {
      height: 6px;
      background: #1e293b;
    }
    .content-pad {
      padding: 16px 24px 12px 24px;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 12px;
    }
    .doc-name {
      font-size: 19px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 2px 0;
    }
    .doc-qual {
      font-size: 11.5px;
      color: #334155;
    }
    .doc-desig {
      font-size: 12.5px;
      font-weight: 700;
      color: #9f1239;
    }
    .clinic-title {
      font-size: 18px;
      font-weight: 800;
      color: #115e59;
      margin: 0 0 2px 0;
    }
    .meta-strip {
      border-top: 2px solid #1e293b;
      border-bottom: 2px solid #1e293b;
      background: #f8fafc;
      padding: 7px 10px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px 12px;
      font-size: 11.5px;
    }
    .allergy-bar {
      background: #fef2f2;
      border-bottom: 1px solid #334155;
      color: #7f1d1d;
      padding: 5px 10px;
      font-weight: 700;
      font-size: 11.5px;
    }
    .main-grid {
      display: grid;
      grid-template-columns: 34% 66%;
      min-height: 185mm;
    }
    .left-col {
      border-right: 1px solid #334155;
      padding: 14px 14px 14px 0;
    }
    .sec-block {
      margin-bottom: 14px;
      break-inside: avoid;
    }
    .sec-title {
      font-size: 12.5px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
    }
    .sec-list {
      margin: 0;
      padding-left: 14px;
      font-size: 11.5px;
      color: #1e293b;
    }
    .sec-list li {
      margin-bottom: 2px;
    }
    .right-col {
      padding: 14px 0 14px 18px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .rx-symbol {
      font-family: Georgia, serif;
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 10px;
    }
    .med-item {
      margin-bottom: 11px;
      break-inside: avoid;
    }
    .med-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }
    .med-generic {
      font-weight: 400;
      font-size: 11.5px;
      color: #475569;
      margin-left: 5px;
    }
    .med-dosing {
      padding-left: 18px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #1e293b;
      margin-top: 2px;
    }
    .leader {
      flex: 1;
      border-bottom: 1px dashed #64748b;
      min-width: 20px;
      height: 1px;
    }
    .med-note {
      padding-left: 18px;
      font-size: 11px;
      color: #115e59;
      font-weight: 600;
      margin-top: 2px;
    }
    .sub-box {
      margin-top: 12px;
      break-inside: avoid;
    }
    .sub-heading {
      font-size: 11.5px;
      font-weight: 800;
      color: #115e59;
      margin: 0 0 4px 0;
    }
    .followup-box {
      margin-top: 12px;
      padding: 6px 10px;
      background: #f0fdfa;
      border: 1px solid #99f6e4;
      border-radius: 4px;
      font-size: 11.5px;
      font-weight: 700;
      color: #134e4a;
      break-inside: avoid;
    }
    .sig-row {
      padding-top: 28px;
      display: flex;
      justify-content: flex-end;
      break-inside: avoid;
    }
    .sig-box {
      min-width: 190px;
      text-align: right;
      border-top: 1px dashed #475569;
      padding-top: 5px;
    }
    .footer-bar {
      border-top: 2px solid #1e293b;
      background: #f1f5f9;
      padding: 10px 24px;
      display: grid;
      grid-template-columns: 33% 42% 25%;
      gap: 10px;
      align-items: center;
      font-size: 10.5px;
      break-inside: avoid;
    }
    .safety-box {
      border: 1px solid #334155;
      background: #ffffff;
      padding: 5px 8px;
      font-size: 10px;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div>
      <div class="top-bar"></div>
      <div class="content-pad">
        <div class="header-row">
          <div>
            <h1 class="doc-name">${escapeHtml(rx.doctorName)}</h1>
            ${rx.doctorQualification ? `<div class="doc-qual">${escapeHtml(rx.doctorQualification)}</div>` : ''}
            <div class="doc-desig">${escapeHtml(rx.doctorDesignation || 'Dental Surgeon')}</div>
            <div style="font-size:11.5px;font-weight:700;color:#115e59;">${escapeHtml(clinicName)}</div>
            ${rx.doctorRegistrationNumber ? `<div style="font-size:11px;font-weight:600;color:#334155;">Reg. No. ${escapeHtml(rx.doctorRegistrationNumber)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div class="clinic-title">${escapeHtml(clinicName)}</div>
            <div style="font-size:11.5px;color:#334155;">${escapeHtml(clinicAddress)}</div>
            <div style="font-size:11.5px;font-weight:700;color:#0f172a;">ফোন / Tel: ${escapeHtml(clinicPhone)}</div>
            <div style="font-size:11px;font-weight:700;color:#115e59;font-family:monospace;margin-top:2px;">
              Rx No: ${escapeHtml(rx.prescriptionNumber)} &bull; ${escapeHtml(rx.status)}${rx.revisionNumber > 1 ? ` (v${rx.revisionNumber})` : ''}
            </div>
          </div>
        </div>

        <div class="meta-strip">
          <div><strong>PID:</strong> <span style="font-family:monospace;font-weight:700;">${escapeHtml(rx.patientCode)}</span></div>
          <div><strong>Name:</strong> <strong>${escapeHtml(rx.patientName)}</strong></div>
          <div><strong>Age:</strong> <strong>${rx.patientAge ? `${escapeHtml(String(rx.patientAge))} Y` : 'N/A'} / ${escapeHtml(rx.patientGender)}</strong></div>
          <div><strong>Date:</strong> <strong>${escapeHtml(formatRxDateDisplay(rx.prescriptionDate))}</strong></div>
          <div><strong>Address:</strong> ${escapeHtml(rx.patientAddress || '-')}</div>
          <div><strong>Phone:</strong> ${escapeHtml(rx.patientPhone)}</div>
          <div><strong>Visit Ref:</strong> <span style="font-family:monospace;">${escapeHtml(rx.visitCode)}</span></div>
          <div><strong>Rx:</strong> <span style="font-family:monospace;font-weight:700;color:#115e59;">${escapeHtml(rx.prescriptionNumber)}</span></div>
        </div>

        ${
          hasAllergyAlert
            ? `<div class="allergy-bar">ALLERGY ALERT: ${escapeHtml(rx.patientAllergies)}</div>`
            : ''
        }

        <div class="main-grid">
          <div class="left-col">
            ${
              sidebarSections.length === 0
                ? `<div style="color:#94a3b8;font-style:italic;font-size:11px;">No clinical notes recorded.</div>`
                : sidebarSections
                    .map(
                      (sec) => `
              <div class="sec-block">
                <h3 class="sec-title">${escapeHtml(sec.title)}</h3>
                <ul class="sec-list">
                  ${sec.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
                </ul>
              </div>`
                    )
                    .join('')
            }
          </div>

          <div class="right-col">
            <div>
              <div class="rx-symbol">Rx,</div>
              ${
                rx.medicines.length === 0
                  ? `<div style="color:#94a3b8;font-style:italic;font-size:11.5px;padding:8px 0;">No medications listed on this prescription.</div>`
                  : rx.medicines
                      .map((med, i) => {
                        const prefix = shortDosagePrefix(med.dosageType, med.medicineName);
                        const partLeft = [med.frequency?.trim(), med.dosage?.trim()]
                          .filter(Boolean)
                          .join(' · ');
                        const partMid = med.mealInstructions?.trim() || '';
                        const partRight = med.duration?.trim() || '';
                        const hasDosing = Boolean(partLeft || partMid || partRight);

                        return `
                <div class="med-item">
                  <div class="med-title">
                    ${i + 1}. ${prefix ? `${escapeHtml(prefix)} ` : ''}${escapeHtml(med.medicineName)}${med.strength ? ` ${escapeHtml(med.strength)}` : ''}
                    ${med.genericName ? `<span class="med-generic">(${escapeHtml(med.genericName)})</span>` : ''}
                  </div>
                  ${
                    hasDosing
                      ? `<div class="med-dosing">
                          ${partLeft ? `<span>${escapeHtml(partLeft)}</span>` : ''}
                          ${partLeft && (partMid || partRight) ? `<span class="leader"></span>` : ''}
                          ${partMid ? `<span>${escapeHtml(partMid)}</span>` : ''}
                          ${partMid && partRight ? `<span class="leader"></span>` : ''}
                          ${partRight ? `<span>${escapeHtml(partRight)}</span>` : ''}
                        </div>`
                      : ''
                  }
                  ${
                    med.additionalNotes?.trim()
                      ? `<div class="med-note">Note: ${escapeHtml(med.additionalNotes.trim())}</div>`
                      : ''
                  }
                </div>`;
                      })
                      .join('')
              }

              ${
                planItems.length > 0
                  ? `<div class="sub-box">
                      <div class="sub-heading" style="color:#0f172a;text-transform:uppercase;">Recommended Treatment Plan:</div>
                      ${planItems
                        .map((item, idx) => {
                          const c =
                            showPlanCosts &&
                            item.cost !== null &&
                            item.cost !== undefined &&
                            String(item.cost).trim() !== ''
                              ? `৳${Number(item.cost).toLocaleString('en-BD')}`
                              : '';
                          return `<div style="font-size:11.5px;margin-bottom:3px;">
                            <div style="display:flex;justify-content:space-between;">
                              <strong>${idx + 1}. ${escapeHtml(item.treatmentName)}${item.toothNumber ? ` (Tooth: ${escapeHtml(item.toothNumber)})` : ''}</strong>
                              ${c ? `<strong style="color:#115e59;">${escapeHtml(c)}</strong>` : ''}
                            </div>
                            ${item.notes ? `<div style="font-size:10.5px;color:#475569;padding-left:14px;">Note: ${escapeHtml(item.notes)}</div>` : ''}
                          </div>`;
                        })
                        .join('')}
                    </div>`
                  : ''
              }

              ${
                dentalInstructionRows.length > 0
                  ? `<div class="sub-box">
                      <div class="sub-heading">দাঁতের যত্ন ও চিকিৎসা-পরবর্তী নির্দেশনা:</div>
                      <ul class="sec-list" style="font-size:11px;">
                        ${dentalInstructionRows
                          .map(
                            (r) =>
                              `<li><strong>${escapeHtml(r.label)}:</strong> ${escapeHtml(r.value)}</li>`
                          )
                          .join('')}
                      </ul>
                    </div>`
                  : ''
              }

              ${
                rx.followUpDate
                  ? `<div class="followup-box">পরবর্তী সাক্ষাতের তারিখ: ${escapeHtml(formatBanglaDate(rx.followUpDate))} (${escapeHtml(formatRxDateDisplay(rx.followUpDate))})</div>`
                  : ''
              }
            </div>

            <div class="sig-row">
              <div class="sig-box">
                <div style="font-size:12px;font-weight:800;color:#0f172a;">${escapeHtml(rx.doctorName)}</div>
                <div style="font-size:10.5px;color:#475569;">
                  ${escapeHtml(rx.doctorDesignation || 'Dental Surgeon')}${rx.doctorRegistrationNumber ? ` • ${escapeHtml(rx.doctorRegistrationNumber)}` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="footer-bar">
      <div>
        <div style="font-weight:700;color:#0f172a;">চেম্বার : ${escapeHtml(clinicName)}</div>
        <div>${escapeHtml(clinicAddress)}</div>
        <div style="font-weight:600;">ফোন : ${escapeHtml(clinicPhone)}</div>
        ${rx.doctorEmail ? `<div>ইমেইল : ${escapeHtml(rx.doctorEmail)}</div>` : ''}
      </div>
      <div class="safety-box">
        <div>- কোন ঔষধ খেয়ে অসুবিধা বা পার্শ্ব প্রতিক্রিয়া হলে ঐ ঔষধ বন্ধ রেখে ডাক্তারের পরামর্শ নিন অথবা নিকটস্থ ক্লিনিকে যোগাযোগ করুন।</div>
        <div>- জরুরী চিকিৎসার জন্য নিকটস্থ হাসপাতাল বা ক্লিনিকে যোগাযোগ করুন।</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700;color:#0f172a;">প্রেসক্রিপশন তথ্য :</div>
        <div style="font-family:monospace;font-weight:700;color:#115e59;">নং : ${escapeHtml(rx.prescriptionNumber)}</div>
        <div>তারিখ : ${escapeHtml(formatRxDateDisplay(rx.prescriptionDate))}</div>
        ${rx.followUpDate ? `<div style="font-weight:600;color:#134e4a;">পরবর্তী সাক্ষাৎ : ${escapeHtml(formatRxDateDisplay(rx.followUpDate))}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;

  // Create a hidden same-origin iframe to trigger the print dialog cleanly without window.open
  const existingFrame = document.getElementById('rx-hidden-print-frame');
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'rx-hidden-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (frameDoc && iframe.contentWindow) {
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    let printed = false;
    const triggerFramePrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // Fallback to main window print if iframe print is restricted
        document.body.classList.add('printing-prescription');
        window.print();
        setTimeout(() => document.body.classList.remove('printing-prescription'), 1000);
      }
      setTimeout(() => {
        iframe.remove();
      }, 4000);
    };

    iframe.onload = triggerFramePrint;
    // Fallback timeout in case onload already fired on synchronous document.write
    setTimeout(triggerFramePrint, 250);
  } else {
    document.body.classList.add('printing-prescription');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-prescription'), 1000);
  }
}

export async function downloadPrescriptionPdf(rx: Prescription): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`/api/prescriptions/${rx.id}/pdf`, {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    let errorMsg = 'Failed to generate A4 PDF';
    let errorCode: string | undefined;
    try {
      const errData = await response.json();
      errorMsg = errData.error || errorMsg;
      errorCode = errData.code;
    } catch {
      errorMsg = response.statusText || errorMsg;
    }
    if (errorCode === 'FEATURE_DISABLED' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('prescription-feature-disabled', { detail: errorMsg }));
    }
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  const cleanPatient = (rx.patientName || 'Patient').replace(/[^a-zA-Z0-9_-]+/g, '_');
  a.href = url;
  a.download = `${rx.prescriptionNumber}_${cleanPatient}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

