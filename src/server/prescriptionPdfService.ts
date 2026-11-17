import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

const FONT_DIR = path.resolve(process.cwd(), 'src/assets/fonts');
const FONT_EN_REG = path.join(FONT_DIR, 'NotoSans-Regular.ttf');
const FONT_EN_BOLD = path.join(FONT_DIR, 'NotoSans-Bold.ttf');
const FONT_BN_REG = path.join(FONT_DIR, 'NotoSansBengali-Regular.ttf');
const FONT_BN_BOLD = path.join(FONT_DIR, 'NotoSansBengali-Bold.ttf');

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
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

export function toBanglaDigits(str: string): string {
  return str.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)] || d);
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

interface TextSegment {
  text: string;
  isBangla: boolean;
}

const BANGLA_CHAR_RE = /[\u0964\u0965\u0980-\u09FF\u200C\u200D]/;
const NEUTRAL_CHAR_RE = /^[ \t.,:;!?()\-–—/%+'"]$/;

// Split text into script-pure segments so NotoSansBengali shapes Bengali runs
// (including Danda । U+0964, Double Danda ॥ U+0965, conjuncts, and inline punctuation)
// and NotoSans renders Latin/digits cleanly without missing glyphs or baseline jumps.
function splitByScript(text: string): TextSegment[] {
  const chars = Array.from(text);
  const segments: TextSegment[] = [];
  let current = '';
  let currentIsBn: boolean | null = null;

  const findNextStrongIsBn = (startIdx: number): boolean | null => {
    for (let j = startIdx; j < chars.length; j++) {
      const c = chars[j];
      if (BANGLA_CHAR_RE.test(c)) return true;
      if (!NEUTRAL_CHAR_RE.test(c)) return false;
    }
    return null;
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const isBnChar = BANGLA_CHAR_RE.test(ch);
    const isNeutral = NEUTRAL_CHAR_RE.test(ch);

    let nextIsBn: boolean;
    if (isNeutral) {
      if (ch === '(') {
        const upcoming = findNextStrongIsBn(i + 1);
        nextIsBn = upcoming !== null ? upcoming : (currentIsBn ?? false);
      } else {
        nextIsBn = currentIsBn !== null ? currentIsBn : (findNextStrongIsBn(i + 1) ?? false);
      }
    } else {
      nextIsBn = isBnChar;
    }

    if (currentIsBn === null) {
      currentIsBn = nextIsBn;
      current = ch;
    } else if (nextIsBn === currentIsBn) {
      current += ch;
    } else {
      segments.push({ text: current, isBangla: currentIsBn });
      current = ch;
      currentIsBn = nextIsBn;
    }
  }

  if (current) {
    segments.push({ text: current, isBangla: Boolean(currentIsBn) });
  }
  return segments;
}

interface PositionedLine {
  segments: TextSegment[];
  width: number;
}

function layoutMixedLines(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
  fontSize: number,
  bold: boolean
): PositionedLine[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: PositionedLine[] = [];

  const getFontName = (isBangla: boolean) =>
    isBangla ? (bold ? 'NotoBnBold' : 'NotoBn') : bold ? 'NotoEnBold' : 'NotoEn';

  const measureSeg = (seg: TextSegment) => {
    doc.font(getFontName(seg.isBangla)).fontSize(fontSize);
    return doc.widthOfString(seg.text);
  };

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push({ segments: [], width: 0 });
      continue;
    }

    // Tokenize by spaces while preserving words intact so Bengali conjuncts are never broken
    const words = para.split(/(\s+)/).filter((w) => w.length > 0);
    let currentLineSegs: TextSegment[] = [];
    let currentWidth = 0;

    const pushCurrentLine = () => {
      // Trim trailing whitespace segment
      while (
        currentLineSegs.length > 0 &&
        /^\s+$/.test(currentLineSegs[currentLineSegs.length - 1].text)
      ) {
        const removed = currentLineSegs.pop()!;
        currentWidth -= measureSeg(removed);
      }
      lines.push({ segments: currentLineSegs, width: Math.max(0, currentWidth) });
      currentLineSegs = [];
      currentWidth = 0;
    };

    for (const word of words) {
      const isSpace = /^\s+$/.test(word);
      if (isSpace && currentLineSegs.length === 0) continue;

      const wordSegs = splitByScript(word);
      let wordWidth = 0;
      for (const s of wordSegs) {
        wordWidth += measureSeg(s);
      }

      if (!isSpace && currentLineSegs.length > 0 && currentWidth + wordWidth > maxWidth) {
        pushCurrentLine();
      }

      // If single word exceeds maxWidth on an empty line, break character-safe only for Latin
      if (!isSpace && currentLineSegs.length === 0 && wordWidth > maxWidth) {
        const subChunks = word.match(/.{1,36}/g) || [word];
        for (let ci = 0; ci < subChunks.length; ci++) {
          const segs = splitByScript(subChunks[ci]);
          let sw = 0;
          for (const s of segs) sw += measureSeg(s);
          lines.push({ segments: segs, width: sw });
        }
        continue;
      }

      for (const seg of wordSegs) {
        const last = currentLineSegs[currentLineSegs.length - 1];
        if (last && last.isBangla === seg.isBangla) {
          last.text += seg.text;
        } else {
          currentLineSegs.push({ ...seg });
        }
      }
      currentWidth += wordWidth;
    }

    if (currentLineSegs.length > 0) {
      pushCurrentLine();
    }
  }

  return lines;
}

function drawMixedText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: {
    maxWidth: number;
    fontSize?: number;
    bold?: boolean;
    color?: string;
    lineHeight?: number;
    align?: 'left' | 'right' | 'center';
  }
): number {
  const fontSize = opts.fontSize ?? 9.5;
  const bold = opts.bold ?? false;
  const color = opts.color ?? '#0f172a';
  const lineHeight = opts.lineHeight ?? fontSize * 1.42;
  const align = opts.align ?? 'left';

  const lines = layoutMixedLines(doc, text, opts.maxWidth, fontSize, bold);
  let curY = y;

  for (const line of lines) {
    let curX = x;
    if (align === 'right') {
      curX = x + opts.maxWidth - line.width;
    } else if (align === 'center') {
      curX = x + (opts.maxWidth - line.width) / 2;
    }

    for (const seg of line.segments) {
      const fontName = seg.isBangla
        ? bold
          ? 'NotoBnBold'
          : 'NotoBn'
        : bold
          ? 'NotoEnBold'
          : 'NotoEn';
      doc.font(fontName).fontSize(fontSize).fillColor(color);
      const w = doc.widthOfString(seg.text);
      // Slight vertical compensation (+0.3pt) aligns NotoSansBengali visually with NotoSans
      const yOffset = seg.isBangla ? -0.4 : 0;
      doc.text(seg.text, curX, curY + yOffset, { lineBreak: false });
      curX += w;
    }
    curY += lineHeight;
  }

  return curY - y;
}

function measureMixedHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
  fontSize: number = 9.5,
  bold: boolean = false,
  lineHeight?: number
): number {
  const lh = lineHeight ?? fontSize * 1.42;
  const lines = layoutMixedLines(doc, text, maxWidth, fontSize, bold);
  return Math.max(lh, lines.length * lh);
}

const BANGLA_CARE_SECTIONS: { key: string; titleBn: string }[] = [
  { key: 'oralHygieneInstructions', titleBn: 'মুখের যত্নের নির্দেশনা' },
  { key: 'toothBrushingInstructions', titleBn: 'দাঁত ব্রাশ করার নির্দেশনা' },
  { key: 'mouthwashRecommendations', titleBn: 'মাউথওয়াশ ব্যবহারের নির্দেশনা' },
  { key: 'postExtractionInstructions', titleBn: 'দাঁত তোলার পর করণীয়' },
  { key: 'postTreatmentPrecautions', titleBn: 'চিকিৎসার পর সতর্কতা' },
  { key: 'dietaryRecommendations', titleBn: 'খাবার সংক্রান্ত নির্দেশনা' },
  { key: 'additionalClinicalAdvice', titleBn: 'পরবর্তী সাক্ষাত ও অন্যান্য নির্দেশনা' },
];

function measureMixedWidth(
  doc: PDFKit.PDFDocument,
  text: string,
  fontSize: number,
  bold: boolean = false
): number {
  const segs = splitByScript(text);
  let w = 0;
  for (const s of segs) {
    const fontName = s.isBangla ? (bold ? 'NotoBnBold' : 'NotoBn') : bold ? 'NotoEnBold' : 'NotoEn';
    doc.font(fontName).fontSize(fontSize);
    w += doc.widthOfString(s.text);
  }
  return w;
}

function shortDosagePrefix(dosageType?: string | null, medicineName?: string | null): string {
  const dt = (dosageType || '').trim();
  if (!dt) return '';
  const name = (medicineName || '').trim().toLowerCase();
  if (/^(tab\.?|cap\.?|syp\.?|susp\.?|inj\.?|supp\.?|oint\.?|drops|gel)\b/i.test(name)) {
    return '';
  }
  const lower = dt.toLowerCase();
  if (lower.includes('tablet')) return 'Tab.';
  if (lower.includes('capsule')) return 'Cap.';
  if (lower.includes('syrup')) return 'Syp.';
  if (lower.includes('suspension')) return 'Susp.';
  if (lower.includes('drop')) return 'Drops';
  if (lower.includes('ointment')) return 'Oint.';
  if (lower.includes('injection')) return 'Inj.';
  if (lower.includes('suppository')) return 'Supp.';
  return dt;
}

function formatRxDateDisplay(isoDate?: string | null): string {
  if (!isoDate) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return isoDate;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function toBulletLines(raw?: string | null): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean);
}

export async function generatePrescriptionPdfBuffer(rx: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        bufferPages: true,
        info: {
          Title: `Prescription ${rx.prescriptionNumber} - ${rx.patientName || 'Patient'}`,
          Author: rx.doctorName || 'Dental Care',
          Subject: 'Dental Prescription',
          Creator: 'Dental Care Clinic Management System',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (const fPath of [FONT_EN_REG, FONT_EN_BOLD, FONT_BN_REG, FONT_BN_BOLD]) {
        if (!fs.existsSync(fPath)) {
          throw new Error(`Required Unicode font missing: ${fPath}`);
        }
      }
      doc.registerFont('NotoEn', FONT_EN_REG);
      doc.registerFont('NotoEnBold', FONT_EN_BOLD);
      doc.registerFont('NotoBn', FONT_BN_REG);
      doc.registerFont('NotoBnBold', FONT_BN_BOLD);

      const pageWidth = 595.28; // A4 width in pt
      const pageHeight = 841.89; // A4 height in pt
      const marginX = 34;
      const contentWidth = pageWidth - marginX * 2;
      const bodyBottomY = pageHeight - 102; // Footer band starts cleanly below this line

      const TEAL = '#0f766e';
      const CRIMSON = '#991b1b';
      const SLATE_DARK = '#0f172a';
      const SLATE_MUTED = '#475569';
      const RULE_DARK = '#334155';
      const BORDER_LIGHT = '#cbd5e1';
      const FOOTER_BG = '#f1f5f9';
      const TEAL_SOFT = '#f0fdfa';
      const TEAL_BORDER = '#99f6e4';

      const clinicName = rx.clinic?.clinicName || 'Dental Care';
      const clinicAddress =
        rx.clinic?.clinicAddress || 'House 42, Road 11, Banani, Dhaka-1213, Bangladesh';
      const clinicPhone = rx.clinic?.clinicPhone || '+880 2-9876543, +880 1711-234567';

      const leftColX = marginX;
      const leftColW = 172;
      const splitX = marginX + 182;
      const rightColX = marginX + 194;
      const rightColW = contentWidth - 194;

      const formatCostPdf = (val: any): string | null => {
        if (val === null || val === undefined || String(val).trim() === '') return null;
        const n = Number(val);
        if (!Number.isFinite(n)) return null;
        const formatted = Number.isInteger(n)
          ? n.toLocaleString('en-US')
          : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `৳ ${formatted}`;
      };

      const hasValidCost = (val: any): boolean => {
        if (val === null || val === undefined || String(val).trim() === '') return false;
        return Number.isFinite(Number(val));
      };

      const drawHeaderAndPatientBar = (includeAllergyAlert: boolean): number => {
        // Subtle top strip
        doc.rect(0, 0, pageWidth, 6).fill('#1e293b');

        // LEFT HEADER: Attending Doctor Credentials
        let leftY = 20;
        leftY += drawMixedText(doc, rx.doctorName || 'Attending Dental Surgeon', marginX, leftY, {
          maxWidth: 285,
          fontSize: 13.5,
          bold: true,
          color: SLATE_DARK,
          lineHeight: 17,
        });
        if (rx.doctorQualification) {
          leftY += drawMixedText(doc, rx.doctorQualification, marginX, leftY, {
            maxWidth: 285,
            fontSize: 8.3,
            color: SLATE_DARK,
            lineHeight: 11.5,
          });
        }
        leftY += drawMixedText(doc, rx.doctorDesignation || 'Dental Surgeon', marginX, leftY, {
          maxWidth: 285,
          fontSize: 9,
          bold: true,
          color: CRIMSON,
          lineHeight: 12.5,
        });
        leftY += drawMixedText(doc, clinicName, marginX, leftY, {
          maxWidth: 285,
          fontSize: 8.5,
          bold: true,
          color: TEAL,
          lineHeight: 12,
        });
        if (rx.doctorRegistrationNumber) {
          leftY += drawMixedText(doc, `Reg. No. ${rx.doctorRegistrationNumber}`, marginX, leftY, {
            maxWidth: 285,
            fontSize: 8.2,
            bold: true,
            color: SLATE_DARK,
            lineHeight: 11.5,
          });
        }

        // RIGHT HEADER: Clinic Branding & Prescription Ref
        const rightHdrX = marginX + 292;
        const rightHdrW = contentWidth - 292;
        let rightHdrY = 20;
        rightHdrY += drawMixedText(doc, clinicName, rightHdrX, rightHdrY, {
          maxWidth: rightHdrW,
          fontSize: 13.5,
          bold: true,
          color: TEAL,
          align: 'right',
          lineHeight: 17,
        });
        rightHdrY += drawMixedText(doc, clinicAddress, rightHdrX, rightHdrY, {
          maxWidth: rightHdrW,
          fontSize: 8.2,
          color: SLATE_DARK,
          align: 'right',
          lineHeight: 11.5,
        });
        rightHdrY += drawMixedText(doc, `ফোন / Tel: ${clinicPhone}`, rightHdrX, rightHdrY, {
          maxWidth: rightHdrW,
          fontSize: 8.2,
          bold: true,
          color: SLATE_DARK,
          align: 'right',
          lineHeight: 11.5,
        });
        const rxMetaLine = `Rx No: ${rx.prescriptionNumber}  •  ${rx.status}${
          rx.revisionNumber > 1 ? ` (v${rx.revisionNumber})` : ''
        }`;
        rightHdrY += drawMixedText(doc, rxMetaLine, rightHdrX, rightHdrY + 1, {
          maxWidth: rightHdrW,
          fontSize: 8,
          bold: true,
          color: TEAL,
          align: 'right',
          lineHeight: 11.5,
        });

        const metaTopY = Math.max(leftY, rightHdrY) + 7;

        // PATIENT META STRIP (Bounded top and bottom by crisp dark rules, matching reference pad)
        const metaRow1Y = metaTopY + 5;
        const metaRow2Y = metaTopY + 18.5;
        const metaHeight = 34;

        doc.rect(marginX, metaTopY, contentWidth, metaHeight).fill('#f8fafc');
        doc
          .moveTo(marginX, metaTopY)
          .lineTo(pageWidth - marginX, metaTopY)
          .lineWidth(1.2)
          .strokeColor(RULE_DARK)
          .stroke();

        // 4 aligned columns across patient strip
        const pCol1 = marginX + 4;
        const pCol2 = marginX + 140;
        const pCol3 = marginX + 305;
        const pCol4 = marginX + 418;

        drawMixedText(doc, `PID: ${rx.patientCode || '-'}`, pCol1, metaRow1Y, {
          maxWidth: 132,
          fontSize: 8.6,
          bold: true,
          color: SLATE_DARK,
        });
        drawMixedText(doc, `Name: ${rx.patientName || '-'}`, pCol2, metaRow1Y, {
          maxWidth: 160,
          fontSize: 8.6,
          bold: true,
          color: SLATE_DARK,
        });
        const ageGenderStr = `Age: ${rx.patientAge ? `${rx.patientAge} Y` : 'N/A'} / ${
          rx.patientGender || '-'
        }`;
        drawMixedText(doc, ageGenderStr, pCol3, metaRow1Y, {
          maxWidth: 108,
          fontSize: 8.6,
          bold: true,
          color: SLATE_DARK,
        });
        drawMixedText(doc, `Date: ${formatRxDateDisplay(rx.prescriptionDate)}`, pCol4, metaRow1Y, {
          maxWidth: 108,
          fontSize: 8.6,
          bold: true,
          color: SLATE_DARK,
        });

        drawMixedText(
          doc,
          `Address: ${rx.patientAddress || '-'}`,
          pCol1,
          metaRow2Y,
          { maxWidth: 132, fontSize: 8.2, bold: true, color: SLATE_MUTED }
        );
        drawMixedText(doc, `Phone: ${rx.patientPhone || '-'}`, pCol2, metaRow2Y, {
          maxWidth: 160,
          fontSize: 8.2,
          bold: true,
          color: SLATE_MUTED,
        });
        drawMixedText(doc, `Visit Ref: ${rx.visitCode || '-'}`, pCol3, metaRow2Y, {
          maxWidth: 108,
          fontSize: 8.2,
          bold: true,
          color: SLATE_MUTED,
        });
        drawMixedText(doc, `Rx: ${rx.prescriptionNumber || '-'}`, pCol4, metaRow2Y, {
          maxWidth: 108,
          fontSize: 8.2,
          bold: true,
          color: TEAL,
        });

        const metaBottomY = metaTopY + metaHeight;
        doc
          .moveTo(marginX, metaBottomY)
          .lineTo(pageWidth - marginX, metaBottomY)
          .lineWidth(1.2)
          .strokeColor(RULE_DARK)
          .stroke();

        let bodyTop = metaBottomY;

        if (
          includeAllergyAlert &&
          rx.patientAllergies &&
          !['none', 'n/a', 'nil', '-'].includes(rx.patientAllergies.trim().toLowerCase())
        ) {
          const alertText = `ALLERGY ALERT: ${rx.patientAllergies}`;
          const alertH = measureMixedHeight(doc, alertText, contentWidth - 16, 8.2, true, 11) + 7;
          doc
            .rect(marginX, bodyTop + 3, contentWidth, alertH)
            .fillAndStroke('#fef2f2', '#fca5a5');
          drawMixedText(doc, alertText, marginX + 8, bodyTop + 6.5, {
            maxWidth: contentWidth - 16,
            fontSize: 8.2,
            bold: true,
            color: '#b91c1c',
            lineHeight: 11,
          });
          bodyTop += alertH + 5;
          doc
            .moveTo(marginX, bodyTop)
            .lineTo(pageWidth - marginX, bodyTop)
            .lineWidth(0.8)
            .strokeColor(RULE_DARK)
            .stroke();
        }

        return bodyTop;
      };

      // Track each page's top Y for the two-column body so divider lines & switchToPage align cleanly
      const pageBodyTopY: number[] = [drawHeaderAndPatientBar(true)];

      const addBodyPage = (): number => {
        doc.addPage();
        const topY = drawHeaderAndPatientBar(false);
        pageBodyTopY.push(topY);
        return pageBodyTopY.length - 1;
      };

      // ========================================================
      // BUILD LEFT COLUMN SECTIONS (Clinical Sidebar)
      // ========================================================
      interface SidebarSection {
        title: string;
        bullets: string[];
      }
      const leftSections: SidebarSection[] = [];

      const ccBullets = toBulletLines(rx.chiefComplaints);
      if (ccBullets.length > 0) leftSections.push({ title: 'Chief Complaint', bullets: ccBullets });

      const cfBullets = toBulletLines(rx.clinicalFindings);
      if (cfBullets.length > 0) leftSections.push({ title: 'Clinical Findings', bullets: cfBullets });

      const customSections = Array.isArray(rx.customSections) ? rx.customSections : [];
      const postDiagPattern = /investigat|test|plan|advice|differen|provisional/i;
      const preDiagCustom = customSections.filter(
        (s: any) => s.heading?.trim() && s.content?.trim() && !postDiagPattern.test(s.heading)
      );
      const postDiagCustom = customSections.filter(
        (s: any) => s.heading?.trim() && s.content?.trim() && postDiagPattern.test(s.heading)
      );

      for (const sec of preDiagCustom) {
        const bullets = toBulletLines(sec.content);
        if (bullets.length > 0) {
          leftSections.push({ title: String(sec.heading).trim(), bullets });
        }
      }

      const diagBullets = toBulletLines(rx.diagnosis);
      if (diagBullets.length > 0) leftSections.push({ title: 'Diagnosis', bullets: diagBullets });

      for (const sec of postDiagCustom) {
        const bullets = toBulletLines(sec.content);
        if (bullets.length > 0) {
          leftSections.push({ title: String(sec.heading).trim(), bullets });
        }
      }

      const tpTextBullets = toBulletLines(rx.treatmentPlan);
      if (tpTextBullets.length > 0) {
        leftSections.push({ title: 'Treatment Plan Notes', bullets: tpTextBullets });
      }

      const advisedTestItems = Array.isArray(rx.advisedTests) ? rx.advisedTests : [];
      const showPlanCosts = rx.showPlanCosts !== false;
      if (advisedTestItems.length > 0) {
        const testBullets = advisedTestItems.map((t: any) => {
          const catPart = t.category ? ` [${t.category}]` : '';
          const costPart = showPlanCosts ? formatCostPdf(t.cost) : null;
          const costSuffix = costPart ? ` (${costPart})` : '';
          const noteSuffix = t.notes?.trim() ? ` — ${t.notes.trim()}` : '';
          return `${t.testName}${catPart}${costSuffix}${noteSuffix}`;
        });
        leftSections.push({ title: 'Investigation', bullets: testBullets });
      }

      // Draw Left Column sequentially across pages
      let leftPageIdx = 0;
      let leftY = pageBodyTopY[0] + 10;
      doc.switchToPage(0);

      const ensureLeftSpace = (neededPt: number) => {
        if (leftY + neededPt > bodyBottomY) {
          leftPageIdx++;
          if (leftPageIdx >= pageBodyTopY.length) {
            addBodyPage();
          } else {
            doc.switchToPage(leftPageIdx);
          }
          leftY = pageBodyTopY[leftPageIdx] + 10;
        }
      };

      for (const sec of leftSections) {
        const titleH = measureMixedHeight(doc, sec.title, leftColW, 10, true, 14);
        const firstBullet = sec.bullets[0] ? `• ${sec.bullets[0]}` : '';
        const firstH = firstBullet
          ? measureMixedHeight(doc, firstBullet, leftColW - 8, 8.8, false, 12.5)
          : 0;
        ensureLeftSpace(titleH + firstH + 4);

        leftY += drawMixedText(doc, sec.title, leftColX, leftY, {
          maxWidth: leftColW,
          fontSize: 10,
          bold: true,
          color: SLATE_DARK,
          lineHeight: 14,
        });
        leftY += 1;

        for (const bullet of sec.bullets) {
          const bH = measureMixedHeight(doc, bullet, leftColW - 12, 8.8, false, 12.5);
          ensureLeftSpace(bH + 2);
          drawMixedText(doc, '•', leftColX + 4, leftY, {
            maxWidth: 8,
            fontSize: 8.8,
            bold: true,
            color: SLATE_DARK,
            lineHeight: 12.5,
          });
          leftY += drawMixedText(doc, bullet, leftColX + 12, leftY, {
            maxWidth: leftColW - 12,
            fontSize: 8.8,
            color: SLATE_DARK,
            lineHeight: 12.5,
          });
          leftY += 1.5;
        }

        leftY += 9;
      }

      // ========================================================
      // DRAW RIGHT COLUMN (Rx, Medications, Plan, Bangla Care, Follow-Up, Signature)
      // ========================================================
      let rightPageIdx = 0;
      doc.switchToPage(0);
      let rightY = pageBodyTopY[0] + 10;

      const ensureRightSpace = (neededPt: number) => {
        if (rightY + neededPt > bodyBottomY) {
          rightPageIdx++;
          if (rightPageIdx >= pageBodyTopY.length) {
            addBodyPage();
          } else {
            doc.switchToPage(rightPageIdx);
          }
          rightY = pageBodyTopY[rightPageIdx] + 10;
        }
      };

      const meds = Array.isArray(rx.medicines) ? rx.medicines : [];
      const planItems = Array.isArray(rx.treatmentPlanItems) ? rx.treatmentPlanItems : [];

      // Large "Rx," Header (just like uploaded reference photo)
      ensureRightSpace(26);
      rightY += drawMixedText(doc, 'Rx,', rightColX, rightY, {
        maxWidth: rightColW,
        fontSize: 16,
        bold: true,
        color: SLATE_DARK,
        lineHeight: 20,
      });
      rightY += 4;

      if (meds.length === 0 && planItems.length === 0) {
        ensureRightSpace(18);
        rightY += drawMixedText(
          doc,
          'No medications listed on this prescription.',
          rightColX + 10,
          rightY,
          { maxWidth: rightColW - 10, fontSize: 9, color: SLATE_MUTED, lineHeight: 13 }
        );
        rightY += 6;
      } else {
        for (let idx = 0; idx < meds.length; idx++) {
          const m = meds[idx];
          const prefix = shortDosagePrefix(m.dosageType, m.medicineName);
          const mainName = [
            `${idx + 1}.`,
            prefix,
            m.medicineName,
            m.strength || '',
          ]
            .filter(Boolean)
            .join(' ');
          const genericSuffix = m.genericName?.trim() ? ` (${m.genericName.trim()})` : '';
          const fullTitle = `${mainName}${genericSuffix}`;

          const partLeft = [m.frequency?.trim(), m.dosage?.trim()].filter(Boolean).join(' · ');
          const partMid = m.mealInstructions?.trim() || '';
          const partRight = m.duration?.trim() || '';
          const noteLine = m.additionalNotes?.trim() ? `Note: ${m.additionalNotes.trim()}` : '';

          const titleH = measureMixedHeight(doc, fullTitle, rightColW - 8, 9.8, true, 13.5);
          const indentX = rightColX + 16;
          const lineW = rightColW - 20;

          const hasDosing = Boolean(partLeft || partMid || partRight);
          const leftW = partLeft ? measureMixedWidth(doc, partLeft, 9, false) : 0;
          const midW = partMid ? measureMixedWidth(doc, partMid, 9, false) : 0;
          const rightW = partRight ? measureMixedWidth(doc, partRight, 9, false) : 0;
          const fitsOneLine = leftW + midW + rightW + 28 <= lineW;

          const dosingH = hasDosing
            ? fitsOneLine
              ? 14
              : measureMixedHeight(
                  doc,
                  [partLeft, partMid, partRight].filter(Boolean).join('  —  '),
                  lineW,
                  9,
                  false,
                  13
                )
            : 0;
          const noteH = noteLine ? measureMixedHeight(doc, noteLine, lineW, 8.3, false, 12) : 0;

          ensureRightSpace(titleH + dosingH + noteH + 8);

          // Medicine Title Line
          rightY += drawMixedText(doc, fullTitle, rightColX + 6, rightY, {
            maxWidth: rightColW - 8,
            fontSize: 9.8,
            bold: true,
            color: SLATE_DARK,
            lineHeight: 13.5,
          });

          // Dotted / Dashed Leader Dosing Line
          if (hasDosing) {
            if (fitsOneLine) {
              const lineY = rightY + 6.5;

              const drawDashedConnector = (x1: number, x2: number) => {
                if (x2 - x1 < 8) return;
                doc
                  .save()
                  .moveTo(x1, lineY)
                  .lineTo(x2, lineY)
                  .dash(2, { space: 2 })
                  .lineWidth(0.7)
                  .strokeColor('#64748b')
                  .stroke()
                  .restore();
              };

              if (partLeft) {
                drawMixedText(doc, partLeft, indentX, rightY, {
                  maxWidth: leftW + 4,
                  fontSize: 9,
                  color: SLATE_DARK,
                  lineHeight: 13,
                });
              }

              if (partRight) {
                drawMixedText(doc, partRight, indentX + lineW - rightW - 2, rightY, {
                  maxWidth: rightW + 2,
                  fontSize: 9,
                  color: SLATE_DARK,
                  align: 'right',
                  lineHeight: 13,
                });
              }

              if (partMid) {
                let midX: number;
                if (partLeft && partRight) {
                  const freeSpace = lineW - leftW - rightW - midW;
                  midX = indentX + leftW + Math.max(12, freeSpace * 0.4);
                } else if (partLeft) {
                  midX = indentX + leftW + 36;
                } else {
                  midX = indentX;
                }

                drawMixedText(doc, partMid, midX, rightY, {
                  maxWidth: midW + 4,
                  fontSize: 9,
                  color: SLATE_DARK,
                  lineHeight: 13,
                });

                if (partLeft) {
                  drawDashedConnector(indentX + leftW + 5, midX - 5);
                }
                if (partRight) {
                  drawDashedConnector(midX + midW + 5, indentX + lineW - rightW - 5);
                }
              } else if (partLeft && partRight) {
                drawDashedConnector(indentX + leftW + 5, indentX + lineW - rightW - 5);
              }

              rightY += 14;
            } else {
              const fallbackLine = [partLeft, partMid, partRight].filter(Boolean).join('  —  ');
              rightY += drawMixedText(doc, fallbackLine, indentX, rightY, {
                maxWidth: lineW,
                fontSize: 9,
                color: SLATE_DARK,
                lineHeight: 13,
              });
            }
          }

          if (noteLine) {
            rightY += drawMixedText(doc, noteLine, indentX, rightY, {
              maxWidth: lineW,
              fontSize: 8.3,
              color: TEAL,
              lineHeight: 12,
            });
          }

          rightY += 7;
        }
      }

      // Compute cost totals for optional Treatment Plan & Advised Tests
      let totalPlanCost = 0;
      let anyPlanCost = false;
      for (const p of planItems) {
        if (hasValidCost(p.cost)) {
          totalPlanCost += Number(p.cost);
          anyPlanCost = true;
        }
      }

      let totalTestsCost = 0;
      let anyTestCost = false;
      for (const t of advisedTestItems) {
        if (hasValidCost(t.cost)) {
          totalTestsCost += Number(t.cost);
          anyTestCost = true;
        }
      }

      // Optional Recommended Treatment Plan in Right Column
      if (planItems.length > 0) {
        rightY += 4;
        ensureRightSpace(28);
        rightY += drawMixedText(doc, 'Recommended Treatment Plan:', rightColX, rightY, {
          maxWidth: rightColW,
          fontSize: 10,
          bold: true,
          color: SLATE_DARK,
          lineHeight: 14,
        });
        rightY += 3;

        for (let idx = 0; idx < planItems.length; idx++) {
          const item = planItems[idx];
          const costStr = showPlanCosts ? formatCostPdf(item.cost) : null;
          const titleLine = [
            `${idx + 1}. ${item.treatmentName}`,
            item.toothNumber ? `(Tooth: ${item.toothNumber})` : '',
          ]
            .filter(Boolean)
            .join(' ');
          const notesLine = item.notes?.trim() ? `Note: ${item.notes.trim()}` : '';
          const leftW = costStr ? rightColW - 86 : rightColW - 10;

          const titleH = measureMixedHeight(doc, titleLine, leftW, 9, true, 12.5);
          const notesH = notesLine ? measureMixedHeight(doc, notesLine, leftW - 10, 8.2, false, 11.5) : 0;
          ensureRightSpace(titleH + notesH + 5);

          if (costStr) {
            drawMixedText(doc, costStr, rightColX + rightColW - 76, rightY, {
              maxWidth: 74,
              fontSize: 9,
              bold: true,
              color: TEAL,
              align: 'right',
              lineHeight: 12.5,
            });
          }

          rightY += drawMixedText(doc, titleLine, rightColX + 6, rightY, {
            maxWidth: leftW,
            fontSize: 9,
            bold: true,
            color: SLATE_DARK,
            lineHeight: 12.5,
          });
          if (notesLine) {
            rightY += drawMixedText(doc, notesLine, rightColX + 16, rightY, {
              maxWidth: leftW - 10,
              fontSize: 8.2,
              color: SLATE_MUTED,
              lineHeight: 11.5,
            });
          }
          rightY += 3;
        }
        rightY += 4;
      }

      // Optional Estimated Cost Summary Bar
      if (showPlanCosts && (anyPlanCost || anyTestCost)) {
        const parts: string[] = [];
        if (anyPlanCost) parts.push(`Treatment Plan: ${formatCostPdf(totalPlanCost)}`);
        if (anyTestCost) parts.push(`Advised Tests: ${formatCostPdf(totalTestsCost)}`);
        const combined = totalPlanCost + totalTestsCost;
        const leftSummary = parts.join(' • ');
        const rightTotal = `Total: ${formatCostPdf(combined)}`;

        const sumH = 22;
        ensureRightSpace(sumH + 8);
        doc.roundedRect(rightColX, rightY, rightColW, sumH, 3).fillAndStroke(TEAL_SOFT, TEAL_BORDER);
        drawMixedText(doc, leftSummary, rightColX + 7, rightY + 5.5, {
          maxWidth: rightColW - 110,
          fontSize: 8.2,
          bold: true,
          color: SLATE_DARK,
          lineHeight: 11,
        });
        drawMixedText(doc, rightTotal, rightColX + rightColW - 105, rightY + 5.5, {
          maxWidth: 98,
          fontSize: 8.8,
          bold: true,
          color: TEAL,
          align: 'right',
          lineHeight: 11,
        });
        rightY += sumH + 8;
      }

      // Optional Bangla Dental Care & Post-Treatment Instructions
      const activeCareRows = BANGLA_CARE_SECTIONS.map((sec) => ({
        titleBn: sec.titleBn,
        text: (rx[sec.key] || '').trim(),
      })).filter((r) => r.text.length > 0);

      if (activeCareRows.length > 0) {
        rightY += 4;
        ensureRightSpace(26);
        rightY += drawMixedText(doc, 'দাঁতের যত্ন ও চিকিৎসা-পরবর্তী নির্দেশনা:', rightColX, rightY, {
          maxWidth: rightColW,
          fontSize: 10,
          bold: true,
          color: TEAL,
          lineHeight: 14,
        });
        rightY += 3;

        for (const item of activeCareRows) {
          const line = `• ${item.titleBn}: ${item.text}`;
          const h = measureMixedHeight(doc, line, rightColW - 8, 8.6, false, 12.5);
          ensureRightSpace(h + 4);
          rightY += drawMixedText(doc, line, rightColX + 4, rightY, {
            maxWidth: rightColW - 8,
            fontSize: 8.6,
            color: SLATE_DARK,
            lineHeight: 12.5,
          });
          rightY += 2.5;
        }
        rightY += 4;
      }

      // Follow-Up Date (Bangla Label)
      if (rx.followUpDate?.trim()) {
        const bnDate = formatBanglaDate(rx.followUpDate);
        const followText = `পরবর্তী সাক্ষাতের তারিখ: ${bnDate} (${formatRxDateDisplay(rx.followUpDate)})`;
        const fh = measureMixedHeight(doc, followText, rightColW - 16, 9, true, 13) + 10;
        ensureRightSpace(fh + 8);
        doc.roundedRect(rightColX, rightY, rightColW, fh, 3).fillAndStroke(TEAL_SOFT, TEAL_BORDER);
        drawMixedText(doc, followText, rightColX + 8, rightY + 5, {
          maxWidth: rightColW - 16,
          fontSize: 9,
          bold: true,
          color: TEAL,
          lineHeight: 13,
        });
        rightY += fh + 8;
      }

      // Doctor Signature Block at bottom-right of Right Column (just like uploaded reference photo)
      ensureRightSpace(52);
      const sigY = Math.max(rightY + 18, bodyBottomY - 46);
      doc
        .save()
        .moveTo(pageWidth - marginX - 180, sigY)
        .lineTo(pageWidth - marginX, sigY)
        .dash(3, { space: 2 })
        .lineWidth(0.8)
        .strokeColor(RULE_DARK)
        .stroke()
        .restore();

      drawMixedText(doc, rx.doctorName || 'Attending Dental Surgeon', pageWidth - marginX - 195, sigY + 5, {
        maxWidth: 195,
        fontSize: 9.2,
        bold: true,
        color: SLATE_DARK,
        align: 'right',
        lineHeight: 12.5,
      });
      drawMixedText(
        doc,
        [rx.doctorDesignation || 'Dental Surgeon', rx.doctorRegistrationNumber]
          .filter(Boolean)
          .join(' • '),
        pageWidth - marginX - 210,
        sigY + 18.5,
        {
          maxWidth: 210,
          fontSize: 7.8,
          color: SLATE_MUTED,
          align: 'right',
          lineHeight: 11,
        }
      );

      // ========================================================
      // DRAW VERTICAL COLUMN DIVIDER & 3-COLUMN FOOTER ON EVERY PAGE
      // ========================================================
      const totalPages = pageBodyTopY.length;
      const footerRuleY = bodyBottomY;

      for (let p = 0; p < totalPages; p++) {
        doc.switchToPage(p);

        // Full-height vertical divider separating Clinical Sidebar and Rx Column
        doc
          .moveTo(splitX, pageBodyTopY[p])
          .lineTo(splitX, footerRuleY)
          .lineWidth(0.9)
          .strokeColor(RULE_DARK)
          .stroke();

        // Bottom Footer Background Band & Top Rule (matching reference Bangladeshi pad)
        doc.rect(0, footerRuleY, pageWidth, pageHeight - footerRuleY).fill(FOOTER_BG);
        doc
          .moveTo(marginX, footerRuleY)
          .lineTo(pageWidth - marginX, footerRuleY)
          .lineWidth(1.2)
          .strokeColor(RULE_DARK)
          .stroke();

        const fTop = footerRuleY + 10;

        // Footer Col 1 (Left): Chamber Address & Contact in Bangla/English
        let fLeftY = fTop;
        fLeftY += drawMixedText(doc, `চেম্বার : ${clinicName}`, marginX, fLeftY, {
          maxWidth: 175,
          fontSize: 8.5,
          bold: true,
          color: SLATE_DARK,
          lineHeight: 11.5,
        });
        fLeftY += drawMixedText(doc, clinicAddress, marginX, fLeftY, {
          maxWidth: 175,
          fontSize: 7.6,
          color: SLATE_DARK,
          lineHeight: 10.5,
        });
        fLeftY += drawMixedText(doc, `ফোন : ${clinicPhone}`, marginX, fLeftY, {
          maxWidth: 175,
          fontSize: 7.6,
          bold: true,
          color: SLATE_DARK,
          lineHeight: 10.5,
        });
        if (rx.doctorEmail) {
          drawMixedText(doc, `ইমেইল : ${rx.doctorEmail}`, marginX, fLeftY, {
            maxWidth: 175,
            fontSize: 7.4,
            color: SLATE_MUTED,
            lineHeight: 10,
          });
        }

        // Footer Col 2 (Center): Bordered Bangla Safety & Emergency Notice Box
        const boxX = marginX + 184;
        const boxW = 210;
        const boxH = 66;
        doc.rect(boxX, fTop, boxW, boxH).lineWidth(0.8).strokeColor(RULE_DARK).stroke();
        drawMixedText(
          doc,
          '- কোন ঔষধ খেয়ে অসুবিধা বা পার্শ্ব প্রতিক্রিয়া হলে ঐ ঔষধ বন্ধ রেখে ডাক্তারের পরামর্শ নিন অথবা নিকটস্থ ক্লিনিকে যোগাযোগ করুন।\n- জরুরী চিকিৎসার জন্য নিকটস্থ হাসপাতাল বা ক্লিনিকে যোগাযোগ করুন।',
          boxX + 6,
          fTop + 6,
          {
            maxWidth: boxW - 12,
            fontSize: 7.4,
            color: SLATE_DARK,
            lineHeight: 10.5,
          }
        );

        // Footer Col 3 (Right): Prescription & Follow-up Reference
        const fRightX = marginX + 402;
        const fRightW = contentWidth - 402;
        let fRightY = fTop;
        fRightY += drawMixedText(doc, 'প্রেসক্রিপশন তথ্য :', fRightX, fRightY, {
          maxWidth: fRightW,
          fontSize: 8.5,
          bold: true,
          color: SLATE_DARK,
          align: 'right',
          lineHeight: 11.5,
        });
        fRightY += drawMixedText(
          doc,
          `নং : ${rx.prescriptionNumber}`,
          fRightX,
          fRightY,
          {
            maxWidth: fRightW,
            fontSize: 7.8,
            bold: true,
            color: TEAL,
            align: 'right',
            lineHeight: 11,
          }
        );
        fRightY += drawMixedText(
          doc,
          `তারিখ : ${formatRxDateDisplay(rx.prescriptionDate)}`,
          fRightX,
          fRightY,
          {
            maxWidth: fRightW,
            fontSize: 7.6,
            color: SLATE_DARK,
            align: 'right',
            lineHeight: 10.5,
          }
        );
        if (rx.followUpDate) {
          fRightY += drawMixedText(
            doc,
            `পরবর্তী সাক্ষাৎ : ${formatRxDateDisplay(rx.followUpDate)}`,
            fRightX,
            fRightY,
            {
              maxWidth: fRightW,
              fontSize: 7.6,
              bold: true,
              color: TEAL,
              align: 'right',
              lineHeight: 10.5,
            }
          );
        }
        drawMixedText(doc, `Page ${p + 1} of ${totalPages}`, fRightX, pageHeight - 24, {
          maxWidth: fRightW,
          fontSize: 7.2,
          color: SLATE_MUTED,
          align: 'right',
          lineHeight: 10,
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
