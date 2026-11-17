import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { db } from '../db/index.ts';
import {
  medicines,
  medicineImportBatches,
  medicineCatalogSnapshots,
  medicineAuditLogs,
  prescriptionMedicines,
  users,
} from '../db/schema.ts';
import {
  authenticateToken,
  requireRoles,
  logAudit,
  AuthenticatedRequest,
} from './auth.ts';
import { requirePrescriptionFeature } from './prescriptions.ts';
import { eq, desc, asc, and, sql, inArray, count } from 'drizzle-orm';

export const medicinesRouter = Router();

const INITIAL_CSV_REL_PATH =
  'public/assets/aistudio/Medicinal_Products_in_Bangladesh_A_Dataset_of_Generic_and_Brand_Names__Dosages__and_Manufacturers_293036d5.csv';

export type ImportMode = 'add_only' | 'add_and_update' | 'full_reconcile';

export interface ColumnMapping {
  genericName: string;
  brandName: string;
  packageMark: string;
  dosageType: string;
  strength: string;
  manufacturer: string;
}

export interface ParsedMedicineInput {
  rowNumber: number;
  genericName: string;
  brandName: string;
  packageMark: string;
  dosageType: string;
  strength: string;
  manufacturer: string;
  normGeneric: string;
  normBrand: string;
  normPackageMark: string;
  normDosageType: string;
  normStrength: string;
  normManufacturer: string;
  identityKey: string;
  clinicalKey: string;
}

export function normalizeText(val: string | null | undefined): string {
  return (val || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function cleanDisplayText(val: string | null | undefined): string {
  return (val || '').trim().replace(/\s+/g, ' ');
}

export function computeMedicineKeys(fields: {
  genericName: string;
  brandName: string;
  packageMark?: string | null;
  dosageType?: string | null;
  strength?: string | null;
  manufacturer?: string | null;
}) {
  const genericName = cleanDisplayText(fields.genericName);
  const brandName = cleanDisplayText(fields.brandName);
  const packageMark = cleanDisplayText(fields.packageMark);
  const dosageType = cleanDisplayText(fields.dosageType);
  const strength = cleanDisplayText(fields.strength);
  const manufacturer = cleanDisplayText(fields.manufacturer);

  const normGeneric = normalizeText(genericName);
  const normBrand = normalizeText(brandName);
  const normPackageMark = normalizeText(packageMark);
  const normDosageType = normalizeText(dosageType);
  const normStrength = normalizeText(strength);
  const normManufacturer = normalizeText(manufacturer);

  const identityKey = crypto
    .createHash('sha256')
    .update(
      [
        normBrand,
        normGeneric,
        normDosageType,
        normStrength,
        normManufacturer,
        normPackageMark,
      ].join('\x1f')
    )
    .digest('hex');

  const clinicalKey = crypto
    .createHash('sha256')
    .update(
      [normBrand, normGeneric, normDosageType, normStrength, normManufacturer].join('\x1f')
    )
    .digest('hex');

  return {
    genericName,
    brandName,
    packageMark,
    dosageType,
    strength,
    manufacturer,
    normGeneric,
    normBrand,
    normPackageMark,
    normDosageType,
    normStrength,
    normManufacturer,
    identityKey,
    clinicalKey,
  };
}

// RFC 4180 CSV parser supporting BOM, CRLF/LF, quoted fields, and escaped quotes
export function parseCsvRows(rawCsv: string): string[][] {
  const text = rawCsv.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let val = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          val += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        val += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(val);
        val = '';
      } else if (ch === '\r') {
        // Ignore CR; LF handles line break
      } else if (ch === '\n') {
        row.push(val);
        if (row.some((cell) => cell.trim() !== '')) {
          rows.push(row);
        }
        row = [];
        val = '';
      } else {
        val += ch;
      }
    }
  }
  if (val.length > 0 || row.length > 0) {
    row.push(val);
    if (row.some((cell) => cell.trim() !== '')) {
      rows.push(row);
    }
  }
  return rows;
}

function normalizeHeaderName(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function detectColumnMapping(
  headers: string[],
  customMapping?: Partial<ColumnMapping>
): ColumnMapping {
  const normHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeaderName(h) }));

  const findMatch = (aliases: string[], fallback?: string): string => {
    for (const a of aliases) {
      const hit = normHeaders.find((h) => h.norm === a);
      if (hit) return hit.raw;
    }
    for (const a of aliases) {
      const hit = normHeaders.find((h) => h.norm.includes(a));
      if (hit) return hit.raw;
    }
    return fallback || '';
  };

  return {
    genericName:
      customMapping?.genericName ||
      findMatch(['genericname', 'generic', 'composition', 'activeingredient']),
    brandName:
      customMapping?.brandName ||
      findMatch(['brandname', 'brand', 'medicinename', 'productname', 'tradename']),
    packageMark:
      customMapping?.packageMark ||
      findMatch(['packagemark', 'packmark', 'package', 'pack', 'sku', 'slug', 'productcode']),
    dosageType:
      customMapping?.dosageType ||
      findMatch(['dosagetype', 'dosageform', 'form', 'type', 'preparation']),
    strength:
      customMapping?.strength ||
      findMatch(['strength', 'dose', 'potency', 'concentration']),
    manufacturer:
      customMapping?.manufacturer ||
      findMatch(['manufacturer', 'company', 'pharma', 'companyname', 'producer']),
  };
}

function parseMappedCsvRecords(
  csvText: string,
  customMapping?: Partial<ColumnMapping>
): {
  headers: string[];
  mapping: ColumnMapping;
  totalDataRows: number;
  validRows: ParsedMedicineInput[];
  duplicateRows: { rowNumber: number; brandName: string; genericName: string; reason: string }[];
  invalidRows: { rowNumber: number; raw: Record<string, string>; reason: string }[];
} {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return {
      headers: rows[0] || [],
      mapping: {
        genericName: '',
        brandName: '',
        packageMark: '',
        dosageType: '',
        strength: '',
        manufacturer: '',
      },
      totalDataRows: 0,
      validRows: [],
      duplicateRows: [],
      invalidRows: [],
    };
  }

  const headers = rows[0].map((h) => h.trim());
  const mapping = detectColumnMapping(headers, customMapping);

  const colIdx = {
    genericName: headers.indexOf(mapping.genericName),
    brandName: headers.indexOf(mapping.brandName),
    packageMark: headers.indexOf(mapping.packageMark),
    dosageType: headers.indexOf(mapping.dosageType),
    strength: headers.indexOf(mapping.strength),
    manufacturer: headers.indexOf(mapping.manufacturer),
  };

  const validRows: ParsedMedicineInput[] = [];
  const duplicateRows: { rowNumber: number; brandName: string; genericName: string; reason: string }[] = [];
  const invalidRows: { rowNumber: number; raw: Record<string, string>; reason: string }[] = [];
  const seenIdentityKeys = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNumber = i + 1;
    const rawObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rawObj[h] = (r[idx] || '').trim();
    });

    const getVal = (idx: number) => (idx >= 0 && idx < r.length ? r[idx] || '' : '');
    const rawGeneric = getVal(colIdx.genericName);
    const rawBrand = getVal(colIdx.brandName);
    const rawPkg = getVal(colIdx.packageMark);
    const rawDosage = getVal(colIdx.dosageType);
    const rawStrength = getVal(colIdx.strength);
    const rawMfg = getVal(colIdx.manufacturer);

    if (!cleanDisplayText(rawBrand)) {
      invalidRows.push({
        rowNumber,
        raw: rawObj,
        reason: 'Missing required Brand Name',
      });
      continue;
    }

    if (!cleanDisplayText(rawGeneric)) {
      invalidRows.push({
        rowNumber,
        raw: rawObj,
        reason: 'Missing required Generic Name',
      });
      continue;
    }

    if (colIdx.dosageType >= 0 && !cleanDisplayText(rawDosage) && !cleanDisplayText(rawMfg)) {
      invalidRows.push({
        rowNumber,
        raw: rawObj,
        reason: 'Missing both Dosage Type and Manufacturer',
      });
      continue;
    }

    const keys = computeMedicineKeys({
      genericName: rawGeneric,
      brandName: rawBrand,
      packageMark: rawPkg,
      dosageType: rawDosage,
      strength: rawStrength,
      manufacturer: rawMfg,
    });

    if (seenIdentityKeys.has(keys.identityKey)) {
      duplicateRows.push({
        rowNumber,
        brandName: keys.brandName,
        genericName: keys.genericName,
        reason: 'Exact duplicate of an earlier row in the same CSV file',
      });
      continue;
    }

    seenIdentityKeys.add(keys.identityKey);
    validRows.push({
      rowNumber,
      ...keys,
    });
  }

  return {
    headers,
    mapping,
    totalDataRows: rows.length - 1,
    validRows,
    duplicateRows,
    invalidRows,
  };
}

function encodeSnapshotPayload(records: any[]): string {
  const json = JSON.stringify(records);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8'));
  return `gzip:${gz.toString('base64')}`;
}

function decodeSnapshotPayload(data: string): any[] {
  if (data.startsWith('gzip:')) {
    const buf = Buffer.from(data.slice(5), 'base64');
    return JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
  }
  return JSON.parse(data);
}

async function createCatalogSnapshotTx(tx: any, label: string, userId: number | null) {
  const allRows = await tx
    .select({
      id: medicines.id,
      medicineCode: medicines.medicineCode,
      genericName: medicines.genericName,
      brandName: medicines.brandName,
      packageMark: medicines.packageMark,
      dosageType: medicines.dosageType,
      strength: medicines.strength,
      manufacturer: medicines.manufacturer,
      normGeneric: medicines.normGeneric,
      normBrand: medicines.normBrand,
      normPackageMark: medicines.normPackageMark,
      normDosageType: medicines.normDosageType,
      normStrength: medicines.normStrength,
      normManufacturer: medicines.normManufacturer,
      identityKey: medicines.identityKey,
      clinicalKey: medicines.clinicalKey,
      source: medicines.source,
      isActive: medicines.isActive,
      lastImportBatchId: medicines.lastImportBatchId,
      createdBy: medicines.createdBy,
      updatedBy: medicines.updatedBy,
    })
    .from(medicines)
    .orderBy(asc(medicines.id));

  const code = `SNAP-${Date.now().toString(36).toUpperCase()}`;
  const encoded = encodeSnapshotPayload(allRows);

  const [snap] = await tx
    .insert(medicineCatalogSnapshots)
    .values({
      snapshotCode: code,
      label,
      recordCount: allRows.length,
      snapshotData: encoded,
      createdBy: userId,
    })
    .returning();

  return snap;
}

async function getNextBatchCode(tx: any): Promise<string> {
  const existing = await tx
    .select({ batchCode: medicineImportBatches.batchCode })
    .from(medicineImportBatches);
  let maxNum = 1000;
  for (const r of existing) {
    const m = /^IMP-(\d+)$/.exec(r.batchCode);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `IMP-${maxNum + 1}`;
}

async function getNextMedicineSeq(tx: any): Promise<number> {
  const [res] = await tx
    .select({ maxId: sql<number>`COALESCE(MAX(${medicines.id}), 0)` })
    .from(medicines);
  return Number(res?.maxId || 0) + 1;
}

function formatMedCode(seq: number): string {
  return `MED-${String(seq).padStart(5, '0')}`;
}

// ==========================================
// INITIAL BOOTSTRAP IMPORT (21,361-RECORD BANGLADESH CSV)
// ==========================================

let bootstrapPromise: Promise<void> | null = null;

export async function ensureMedicineCatalogSeeded(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      const [countRow] = await db.select({ count: count() }).from(medicines);
      if (Number(countRow?.count || 0) > 0) {
        return;
      }

      const csvAbsPath = path.resolve(process.cwd(), INITIAL_CSV_REL_PATH);
      if (!fs.existsSync(csvAbsPath)) {
        console.warn('Initial Bangladesh medicine CSV not found at:', csvAbsPath);
        return;
      }

      const startMs = Date.now();
      const rawCsv = fs.readFileSync(csvAbsPath, 'utf8');
      const parsed = parseMappedCsvRecords(rawCsv);

      await db.transaction(async (tx) => {
        const [recheck] = await tx.select({ count: count() }).from(medicines);
        if (Number(recheck?.count || 0) > 0) return;

        const [batch] = await tx
          .insert(medicineImportBatches)
          .values({
            batchCode: 'IMP-1001',
            filename: 'Medicinal Products in Bangladesh A Dataset of Generic and Brand Names, Dosages, and Manufacturers.csv',
            sourceLabel: 'Medicinal Products in Bangladesh CSV',
            importMode: 'add_only',
            status: 'completed',
            totalRecords: parsed.totalDataRows,
            addedCount: parsed.validRows.length,
            updatedCount: 0,
            unchangedCount: 0,
            skippedCount: parsed.duplicateRows.length,
            rejectedCount: parsed.invalidRows.length,
            missingCount: 0,
            deactivatedCount: 0,
            summaryJson: JSON.stringify({
              mapping: parsed.mapping,
              sampleDuplicates: parsed.duplicateRows.slice(0, 15),
              sampleInvalid: parsed.invalidRows.slice(0, 15),
            }),
          })
          .returning();

        const CHUNK_SIZE = 1000;
        let seq = 1;
        for (let i = 0; i < parsed.validRows.length; i += CHUNK_SIZE) {
          const chunk = parsed.validRows.slice(i, i + CHUNK_SIZE);
          await tx
            .insert(medicines)
            .values(
              chunk.map((item) => ({
                medicineCode: formatMedCode(seq++),
                genericName: item.genericName,
                brandName: item.brandName,
                packageMark: item.packageMark || null,
                dosageType: item.dosageType || 'Unspecified',
                strength: item.strength || null,
                manufacturer: item.manufacturer || 'Unspecified',
                normGeneric: item.normGeneric,
                normBrand: item.normBrand,
                normPackageMark: item.normPackageMark,
                normDosageType: item.normDosageType || 'unspecified',
                normStrength: item.normStrength,
                normManufacturer: item.normManufacturer || 'unspecified',
                identityKey: item.identityKey,
                clinicalKey: item.clinicalKey,
                source: 'Medicinal Products in Bangladesh CSV',
                isActive: true,
                lastImportBatchId: batch.id,
              }))
            )
            .onConflictDoNothing({ target: medicines.identityKey });
        }

        await tx.insert(medicineAuditLogs).values({
          importBatchId: batch.id,
          userRole: 'system',
          action: 'INITIAL_CSV_IMPORT',
          targetName: `Import Batch ${batch.batchCode}`,
          details: `Bootstrapped ${parsed.validRows.length} unique medicines from ${parsed.totalDataRows} CSV records (${parsed.duplicateRows.length} exact CSV duplicates skipped, ${parsed.invalidRows.length} invalid rows rejected) in ${Date.now() - startMs}ms.`,
        });
      });

      console.log(
        `Medicine catalog bootstrapped from Bangladesh CSV: ${parsed.validRows.length} medicines imported (${parsed.duplicateRows.length} duplicates skipped).`
      );
    } catch (err) {
      console.error('Failed to bootstrap Bangladesh medicine catalog:', err);
    }
  })();

  return bootstrapPromise;
}

// ==========================================
// 1. SMART RANKED AUTOCOMPLETE SEARCH ROUTE
// ==========================================

medicinesRouter.get(
  '/medicines/search',
  authenticateToken,
  requirePrescriptionFeature,
  async (req: AuthenticatedRequest, res) => {
    try {
      const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
      const nq = normalizeText(rawQuery);
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '10'), 10) || 10));
      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

      if (!nq) {
        const [totalRow] = await db
          .select({ count: count() })
          .from(medicines)
          .where(eq(medicines.isActive, true));

        const items = await db
          .select({
            id: medicines.id,
            medicineCode: medicines.medicineCode,
            brandName: medicines.brandName,
            genericName: medicines.genericName,
            packageMark: medicines.packageMark,
            dosageType: medicines.dosageType,
            strength: medicines.strength,
            manufacturer: medicines.manufacturer,
            source: medicines.source,
          })
          .from(medicines)
          .where(eq(medicines.isActive, true))
          .orderBy(asc(medicines.normBrand), asc(medicines.normStrength))
          .limit(limit)
          .offset(offset);

        const totalCount = Number(totalRow?.count || 0);
        return res.json({
          items,
          totalCount,
          hasMore: offset + items.length < totalCount,
        });
      }

      const prefixPattern = `${nq}%`;
      const substrPattern = `%${nq}%`;
      const tokens = nq.split(' ').filter(Boolean);

      // Multi-token AND condition across searchable fields when query has multiple words
      const tokenFilter =
        tokens.length > 1
          ? sql.join(
              tokens.map((tok) => {
                const tp = `%${tok}%`;
                return sql`(${medicines.normBrand} LIKE ${tp} OR ${medicines.normGeneric} LIKE ${tp} OR ${medicines.normStrength} LIKE ${tp} OR ${medicines.normDosageType} LIKE ${tp} OR ${medicines.normManufacturer} LIKE ${tp})`;
              }),
              sql` AND `
            )
          : sql`FALSE`;

      const whereClause = and(
        eq(medicines.isActive, true),
        orExpr(substrPattern, tokenFilter)
      );

      function orExpr(substr: string, extraTokenCond: any) {
        return sql`(
          ${medicines.normBrand} LIKE ${substr}
          OR ${medicines.normGeneric} LIKE ${substr}
          OR ${medicines.normStrength} LIKE ${substr}
          OR ${medicines.normDosageType} LIKE ${substr}
          OR ${medicines.normManufacturer} LIKE ${substr}
          OR (${extraTokenCond})
        )`;
      }

      // 7-Tier Ranking Priority (exact specification in Part 2.3)
      const rankExpr = sql<number>`CASE
        WHEN ${medicines.normBrand} = ${nq} THEN 1
        WHEN ${medicines.normBrand} LIKE ${prefixPattern} THEN 2
        WHEN ${medicines.normBrand} LIKE ${substrPattern} THEN 3
        WHEN ${medicines.normGeneric} = ${nq} THEN 4
        WHEN ${medicines.normGeneric} LIKE ${prefixPattern} THEN 5
        WHEN ${medicines.normGeneric} LIKE ${substrPattern} THEN 6
        WHEN (${medicines.normStrength} LIKE ${substrPattern} OR ${medicines.normDosageType} LIKE ${substrPattern} OR ${medicines.normManufacturer} LIKE ${substrPattern}) THEN 7
        ELSE 8
      END`;

      const [totalRow] = await db
        .select({ count: count() })
        .from(medicines)
        .where(whereClause);

      const items = await db
        .select({
          id: medicines.id,
          medicineCode: medicines.medicineCode,
          brandName: medicines.brandName,
          genericName: medicines.genericName,
          packageMark: medicines.packageMark,
          dosageType: medicines.dosageType,
          strength: medicines.strength,
          manufacturer: medicines.manufacturer,
          source: medicines.source,
        })
        .from(medicines)
        .where(whereClause)
        .orderBy(
          asc(rankExpr),
          asc(sql`LENGTH(${medicines.normBrand})`),
          asc(medicines.normBrand),
          asc(medicines.normStrength),
          asc(medicines.id)
        )
        .limit(limit)
        .offset(offset);

      const totalCount = Number(totalRow?.count || 0);
      return res.json({
        items,
        totalCount,
        hasMore: offset + items.length < totalCount,
      });
    } catch (error) {
      console.error('Medicine search error:', error);
      res.status(500).json({ error: 'Failed to search medicine catalog' });
    }
  }
);

// ==========================================
// 2. ADMIN MEDICINE DATABASE MANAGEMENT ROUTES
//    (Strictly Developer & Main Doctor ONLY; Doctors Blocked)
// ==========================================

const adminGuard = [authenticateToken, requireRoles('developer', 'main_doctor')];

// Overview KPIs
medicinesRouter.get(
  '/medicines/admin/overview',
  ...adminGuard,
  async (_req: AuthenticatedRequest, res) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

      const [
        [totals],
        [recentAdds],
        [recentUpdates],
        [lastUpdatedRow],
        latestBatches,
      ] = await Promise.all([
        db
          .select({
            totalMedicines: count(),
            activeMedicines: sql<number>`COUNT(*) FILTER (WHERE ${medicines.isActive} = true)`,
            inactiveMedicines: sql<number>`COUNT(*) FILTER (WHERE ${medicines.isActive} = false)`,
            totalGenerics: sql<number>`COUNT(DISTINCT ${medicines.normGeneric})`,
            totalManufacturers: sql<number>`COUNT(DISTINCT ${medicines.normManufacturer})`,
          })
          .from(medicines),
        db
          .select({ count: count() })
          .from(medicines)
          .where(sql`${medicines.createdAt} >= ${sevenDaysAgo}`),
        db
          .select({ count: count() })
          .from(medicines)
          .where(
            sql`${medicines.updatedAt} >= ${sevenDaysAgo} AND ${medicines.updatedAt} > ${medicines.createdAt} + INTERVAL '2 seconds'`
          ),
        db
          .select({ maxUpdated: sql<Date | null>`MAX(${medicines.updatedAt})` })
          .from(medicines),
        db
          .select({
            id: medicineImportBatches.id,
            batchCode: medicineImportBatches.batchCode,
            filename: medicineImportBatches.filename,
            sourceLabel: medicineImportBatches.sourceLabel,
            importMode: medicineImportBatches.importMode,
            status: medicineImportBatches.status,
            totalRecords: medicineImportBatches.totalRecords,
            addedCount: medicineImportBatches.addedCount,
            updatedCount: medicineImportBatches.updatedCount,
            unchangedCount: medicineImportBatches.unchangedCount,
            skippedCount: medicineImportBatches.skippedCount,
            rejectedCount: medicineImportBatches.rejectedCount,
            missingCount: medicineImportBatches.missingCount,
            deactivatedCount: medicineImportBatches.deactivatedCount,
            createdAt: medicineImportBatches.createdAt,
            uploadedByName: users.fullName,
          })
          .from(medicineImportBatches)
          .leftJoin(users, eq(medicineImportBatches.uploadedBy, users.id))
          .orderBy(desc(medicineImportBatches.id))
          .limit(1),
      ]);

      res.json({
        totalMedicines: Number(totals?.totalMedicines || 0),
        activeMedicines: Number(totals?.activeMedicines || 0),
        inactiveMedicines: Number(totals?.inactiveMedicines || 0),
        totalGenerics: Number(totals?.totalGenerics || 0),
        totalManufacturers: Number(totals?.totalManufacturers || 0),
        recentlyAddedCount: Number(recentAdds?.count || 0),
        recentlyUpdatedCount: Number(recentUpdates?.count || 0),
        lastUpdatedAt: lastUpdatedRow?.maxUpdated || null,
        lastImport: latestBatches[0] || null,
      });
    } catch (error) {
      console.error('Medicine overview error:', error);
      res.status(500).json({ error: 'Failed to load medicine catalog overview' });
    }
  }
);

// Searchable & Paginated Catalog List
medicinesRouter.get(
  '/medicines/admin/catalog',
  ...adminGuard,
  async (req: AuthenticatedRequest, res) => {
    try {
      const q = normalizeText(typeof req.query.q === 'string' ? req.query.q : '');
      const status = typeof req.query.status === 'string' ? req.query.status : 'all';
      const dosageType = typeof req.query.dosageType === 'string' ? req.query.dosageType : 'all';
      const source = typeof req.query.source === 'string' ? req.query.source : 'all';
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(5, parseInt(String(req.query.pageSize || '25'), 10) || 25)
      );
      const offset = (page - 1) * pageSize;

      const conditions: any[] = [];
      if (status === 'active') conditions.push(eq(medicines.isActive, true));
      else if (status === 'inactive') conditions.push(eq(medicines.isActive, false));

      if (dosageType !== 'all' && dosageType.trim()) {
        conditions.push(eq(medicines.normDosageType, normalizeText(dosageType)));
      }
      if (source !== 'all' && source.trim()) {
        conditions.push(eq(medicines.source, source));
      }
      if (q) {
        const substr = `%${q}%`;
        conditions.push(
          sql`(
            ${medicines.normBrand} LIKE ${substr}
            OR ${medicines.normGeneric} LIKE ${substr}
            OR ${medicines.normStrength} LIKE ${substr}
            OR ${medicines.normDosageType} LIKE ${substr}
            OR ${medicines.normManufacturer} LIKE ${substr}
            OR LOWER(${medicines.medicineCode}) LIKE ${substr}
          )`
        );
      }

      const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;

      const [[totalRow], items, dosageTypesRows, sourceRows] = await Promise.all([
        whereExpr
          ? db.select({ count: count() }).from(medicines).where(whereExpr)
          : db.select({ count: count() }).from(medicines),
        whereExpr
          ? db
              .select()
              .from(medicines)
              .where(whereExpr)
              .orderBy(desc(medicines.updatedAt), asc(medicines.normBrand))
              .limit(pageSize)
              .offset(offset)
          : db
              .select()
              .from(medicines)
              .orderBy(desc(medicines.updatedAt), asc(medicines.normBrand))
              .limit(pageSize)
              .offset(offset),
        db
          .selectDistinct({ dosageType: medicines.dosageType })
          .from(medicines)
          .orderBy(asc(medicines.dosageType)),
        db
          .selectDistinct({ source: medicines.source })
          .from(medicines)
          .orderBy(asc(medicines.source)),
      ]);

      res.json({
        items,
        total: Number(totalRow?.count || 0),
        page,
        pageSize,
        facets: {
          dosageTypes: dosageTypesRows.map((r) => r.dosageType).filter(Boolean),
          sources: sourceRows.map((r) => r.source).filter(Boolean),
        },
      });
    } catch (error) {
      console.error('Catalog list error:', error);
      res.status(500).json({ error: 'Failed to load medicine catalog' });
    }
  }
);

// Import History, Snapshots & Audit Logs
medicinesRouter.get(
  '/medicines/admin/history',
  ...adminGuard,
  async (_req: AuthenticatedRequest, res) => {
    try {
      const [batches, snapshots, logs] = await Promise.all([
        db
          .select({
            id: medicineImportBatches.id,
            batchCode: medicineImportBatches.batchCode,
            filename: medicineImportBatches.filename,
            sourceLabel: medicineImportBatches.sourceLabel,
            importMode: medicineImportBatches.importMode,
            status: medicineImportBatches.status,
            totalRecords: medicineImportBatches.totalRecords,
            addedCount: medicineImportBatches.addedCount,
            updatedCount: medicineImportBatches.updatedCount,
            unchangedCount: medicineImportBatches.unchangedCount,
            skippedCount: medicineImportBatches.skippedCount,
            rejectedCount: medicineImportBatches.rejectedCount,
            missingCount: medicineImportBatches.missingCount,
            deactivatedCount: medicineImportBatches.deactivatedCount,
            snapshotId: medicineImportBatches.snapshotId,
            summaryJson: medicineImportBatches.summaryJson,
            createdAt: medicineImportBatches.createdAt,
            uploadedByName: users.fullName,
          })
          .from(medicineImportBatches)
          .leftJoin(users, eq(medicineImportBatches.uploadedBy, users.id))
          .orderBy(desc(medicineImportBatches.id))
          .limit(30),
        db
          .select({
            id: medicineCatalogSnapshots.id,
            snapshotCode: medicineCatalogSnapshots.snapshotCode,
            label: medicineCatalogSnapshots.label,
            recordCount: medicineCatalogSnapshots.recordCount,
            createdAt: medicineCatalogSnapshots.createdAt,
            createdByName: users.fullName,
          })
          .from(medicineCatalogSnapshots)
          .leftJoin(users, eq(medicineCatalogSnapshots.createdBy, users.id))
          .orderBy(desc(medicineCatalogSnapshots.id))
          .limit(20),
        db
          .select({
            id: medicineAuditLogs.id,
            medicineId: medicineAuditLogs.medicineId,
            importBatchId: medicineAuditLogs.importBatchId,
            userRole: medicineAuditLogs.userRole,
            userName: users.fullName,
            action: medicineAuditLogs.action,
            targetName: medicineAuditLogs.targetName,
            previousValuesJson: medicineAuditLogs.previousValuesJson,
            newValuesJson: medicineAuditLogs.newValuesJson,
            details: medicineAuditLogs.details,
            createdAt: medicineAuditLogs.createdAt,
          })
          .from(medicineAuditLogs)
          .leftJoin(users, eq(medicineAuditLogs.userId, users.id))
          .orderBy(desc(medicineAuditLogs.id))
          .limit(60),
      ]);

      res.json({ batches, snapshots, logs });
    } catch (error) {
      console.error('Failed to load medicine history:', error);
      res.status(500).json({ error: 'Failed to load import history & audit logs' });
    }
  }
);

// Single Medicine Full Details + Usage + Logs
medicinesRouter.get(
  '/medicines/admin/:id',
  ...adminGuard,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid medicine ID' });

      const [med] = await db.select().from(medicines).where(eq(medicines.id, id));
      if (!med) return res.status(404).json({ error: 'Medicine not found' });

      const [[usageRow], medLogs] = await Promise.all([
        db
          .select({ count: count() })
          .from(prescriptionMedicines)
          .where(eq(prescriptionMedicines.medicineId, id)),
        db
          .select({
            id: medicineAuditLogs.id,
            action: medicineAuditLogs.action,
            userRole: medicineAuditLogs.userRole,
            userName: users.fullName,
            previousValuesJson: medicineAuditLogs.previousValuesJson,
            newValuesJson: medicineAuditLogs.newValuesJson,
            details: medicineAuditLogs.details,
            createdAt: medicineAuditLogs.createdAt,
          })
          .from(medicineAuditLogs)
          .leftJoin(users, eq(medicineAuditLogs.userId, users.id))
          .where(eq(medicineAuditLogs.medicineId, id))
          .orderBy(desc(medicineAuditLogs.id))
          .limit(25),
      ]);

      res.json({
        medicine: med,
        prescriptionUsageCount: Number(usageRow?.count || 0),
        auditLogs: medLogs,
      });
    } catch (error) {
      console.error('Get medicine detail error:', error);
      res.status(500).json({ error: 'Failed to load medicine details' });
    }
  }
);

// Manually Add a New Medicine
medicinesRouter.post(
  '/medicines/admin',
  ...adminGuard,
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        genericName,
        brandName,
        packageMark,
        dosageType,
        strength,
        manufacturer,
        isActive = true,
      } = req.body;

      if (!cleanDisplayText(brandName) || !cleanDisplayText(genericName)) {
        return res.status(400).json({
          error: 'Brand Name and Generic Name are required.',
        });
      }
      if (!cleanDisplayText(dosageType) || !cleanDisplayText(manufacturer)) {
        return res.status(400).json({
          error: 'Dosage Type and Manufacturer are required.',
        });
      }

      const keys = computeMedicineKeys({
        genericName,
        brandName,
        packageMark,
        dosageType,
        strength,
        manufacturer,
      });

      const dup = await db
        .select()
        .from(medicines)
        .where(eq(medicines.identityKey, keys.identityKey));

      if (dup.length > 0) {
        return res.status(409).json({
          error: `Duplicate medicine already exists (${dup[0].medicineCode}: ${dup[0].brandName} ${dup[0].strength || ''} — ${dup[0].dosageType}, ${dup[0].manufacturer}).`,
        });
      }

      const created = await db.transaction(async (tx) => {
        const nextSeq = await getNextMedicineSeq(tx);
        const [inserted] = await tx
          .insert(medicines)
          .values({
            medicineCode: formatMedCode(nextSeq),
            genericName: keys.genericName,
            brandName: keys.brandName,
            packageMark: keys.packageMark || null,
            dosageType: keys.dosageType,
            strength: keys.strength || null,
            manufacturer: keys.manufacturer,
            normGeneric: keys.normGeneric,
            normBrand: keys.normBrand,
            normPackageMark: keys.normPackageMark,
            normDosageType: keys.normDosageType,
            normStrength: keys.normStrength,
            normManufacturer: keys.normManufacturer,
            identityKey: keys.identityKey,
            clinicalKey: keys.clinicalKey,
            source: 'manual',
            isActive: Boolean(isActive),
            createdBy: req.user!.id,
            updatedBy: req.user!.id,
          })
          .returning();

        await tx.insert(medicineAuditLogs).values({
          medicineId: inserted.id,
          userId: req.user!.id,
          userRole: req.user!.role,
          action: 'MANUAL_CREATE',
          targetName: `${inserted.brandName} (${inserted.medicineCode})`,
          newValuesJson: JSON.stringify({
            brandName: inserted.brandName,
            genericName: inserted.genericName,
            dosageType: inserted.dosageType,
            strength: inserted.strength,
            manufacturer: inserted.manufacturer,
            packageMark: inserted.packageMark,
            isActive: inserted.isActive,
          }),
          details: `Manually added ${inserted.brandName} (${inserted.genericName}) ${inserted.strength || ''} ${inserted.dosageType} to medicine catalog.`,
        });

        return inserted;
      });

      await logAudit(
        req.user,
        'MEDICINE_MANUAL_CREATE',
        `Medicine ${created.medicineCode} (${created.brandName})`,
        `Added ${created.genericName} ${created.strength || ''} (${created.dosageType})`
      );

      res.status(201).json(created);
    } catch (error: any) {
      console.error('Manual medicine create error:', error);
      res.status(500).json({ error: error.message || 'Failed to add medicine' });
    }
  }
);

// Edit Existing Medicine (Historical prescription snapshots remain unchanged!)
medicinesRouter.put(
  '/medicines/admin/:id',
  ...adminGuard,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid medicine ID' });

      const [existing] = await db.select().from(medicines).where(eq(medicines.id, id));
      if (!existing) return res.status(404).json({ error: 'Medicine not found' });

      const {
        genericName,
        brandName,
        packageMark,
        dosageType,
        strength,
        manufacturer,
        isActive,
      } = req.body;

      const nextGeneric = genericName !== undefined ? genericName : existing.genericName;
      const nextBrand = brandName !== undefined ? brandName : existing.brandName;
      const nextPkg = packageMark !== undefined ? packageMark : existing.packageMark;
      const nextDosage = dosageType !== undefined ? dosageType : existing.dosageType;
      const nextStrength = strength !== undefined ? strength : existing.strength;
      const nextMfg = manufacturer !== undefined ? manufacturer : existing.manufacturer;

      if (!cleanDisplayText(nextBrand) || !cleanDisplayText(nextGeneric)) {
        return res.status(400).json({ error: 'Brand Name and Generic Name cannot be empty.' });
      }

      const keys = computeMedicineKeys({
        genericName: nextGeneric,
        brandName: nextBrand,
        packageMark: nextPkg,
        dosageType: nextDosage,
        strength: nextStrength,
        manufacturer: nextMfg,
      });

      const conflict = await db
        .select()
        .from(medicines)
        .where(and(eq(medicines.identityKey, keys.identityKey), sql`${medicines.id} != ${id}`));

      if (conflict.length > 0) {
        return res.status(409).json({
          error: `Another catalog entry already matches these exact details (${conflict[0].medicineCode}).`,
        });
      }

      const nextActive = typeof isActive === 'boolean' ? isActive : existing.isActive;

      const prevSnap = {
        brandName: existing.brandName,
        genericName: existing.genericName,
        packageMark: existing.packageMark,
        dosageType: existing.dosageType,
        strength: existing.strength,
        manufacturer: existing.manufacturer,
        isActive: existing.isActive,
      };
      const newSnap = {
        brandName: keys.brandName,
        genericName: keys.genericName,
        packageMark: keys.packageMark || null,
        dosageType: keys.dosageType,
        strength: keys.strength || null,
        manufacturer: keys.manufacturer,
        isActive: nextActive,
      };

      const [updated] = await db
        .update(medicines)
        .set({
          genericName: keys.genericName,
          brandName: keys.brandName,
          packageMark: keys.packageMark || null,
          dosageType: keys.dosageType,
          strength: keys.strength || null,
          manufacturer: keys.manufacturer,
          normGeneric: keys.normGeneric,
          normBrand: keys.normBrand,
          normPackageMark: keys.normPackageMark,
          normDosageType: keys.normDosageType,
          normStrength: keys.normStrength,
          normManufacturer: keys.normManufacturer,
          identityKey: keys.identityKey,
          clinicalKey: keys.clinicalKey,
          isActive: nextActive,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(medicines.id, id))
        .returning();

      await db.insert(medicineAuditLogs).values({
        medicineId: updated.id,
        userId: req.user!.id,
        userRole: req.user!.role,
        action: 'MANUAL_UPDATE',
        targetName: `${updated.brandName} (${updated.medicineCode})`,
        previousValuesJson: JSON.stringify(prevSnap),
        newValuesJson: JSON.stringify(newSnap),
        details: `Updated catalog record ${updated.medicineCode} (${updated.brandName}). Historical prescriptions remain unchanged.`,
      });

      await logAudit(
        req.user,
        'MEDICINE_MANUAL_UPDATE',
        `Medicine ${updated.medicineCode} (${updated.brandName})`,
        `Updated catalog metadata (historical prescriptions preserved)`
      );

      res.json(updated);
    } catch (error: any) {
      console.error('Update medicine error:', error);
      res.status(500).json({ error: error.message || 'Failed to update medicine' });
    }
  }
);

// Activate / Deactivate Medicine
medicinesRouter.put(
  '/medicines/admin/:id/status',
  ...adminGuard,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid medicine ID' });

      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive boolean is required.' });
      }

      const [existing] = await db.select().from(medicines).where(eq(medicines.id, id));
      if (!existing) return res.status(404).json({ error: 'Medicine not found' });

      const [updated] = await db
        .update(medicines)
        .set({
          isActive,
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(eq(medicines.id, id))
        .returning();

      await db.insert(medicineAuditLogs).values({
        medicineId: updated.id,
        userId: req.user!.id,
        userRole: req.user!.role,
        action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
        targetName: `${updated.brandName} (${updated.medicineCode})`,
        previousValuesJson: JSON.stringify({ isActive: existing.isActive }),
        newValuesJson: JSON.stringify({ isActive: updated.isActive }),
        details: `${isActive ? 'Activated' : 'Deactivated'} ${updated.brandName} (${updated.medicineCode}). Historical prescriptions remain intact.`,
      });

      await logAudit(
        req.user,
        isActive ? 'MEDICINE_ACTIVATE' : 'MEDICINE_DEACTIVATE',
        `Medicine ${updated.medicineCode} (${updated.brandName})`,
        `Catalog status set to ${isActive ? 'Active' : 'Inactive'}`
      );

      res.json(updated);
    } catch (error) {
      console.error('Toggle medicine status error:', error);
      res.status(500).json({ error: 'Failed to update medicine status' });
    }
  }
);

// Safe Delete Guard (Never hard-delete medicines used in historical prescriptions)
medicinesRouter.delete(
  '/medicines/admin/:id',
  ...adminGuard,
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid medicine ID' });

      const [existing] = await db.select().from(medicines).where(eq(medicines.id, id));
      if (!existing) return res.status(404).json({ error: 'Medicine not found' });

      const [usage] = await db
        .select({ count: count() })
        .from(prescriptionMedicines)
        .where(eq(prescriptionMedicines.medicineId, id));

      if (Number(usage?.count || 0) > 0) {
        return res.status(400).json({
          error: `Cannot delete ${existing.brandName} (${existing.medicineCode}) because it is referenced by ${usage.count} historical prescription record(s). Deactivate it instead.`,
        });
      }

      return res.status(400).json({
        error:
          'Hard deletion of catalog medicines is disabled for clinical audit safety. Use Deactivate instead.',
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to process delete check' });
    }
  }
);

// CSV Import Analysis Helper (Shared between Preview and Commit)
async function analyzeCsvImport(
  csvText: string,
  importMode: ImportMode,
  customMapping?: Partial<ColumnMapping>
) {
  const parsed = parseMappedCsvRecords(csvText, customMapping);

  const existingAll = await db
    .select({
      id: medicines.id,
      medicineCode: medicines.medicineCode,
      genericName: medicines.genericName,
      brandName: medicines.brandName,
      packageMark: medicines.packageMark,
      dosageType: medicines.dosageType,
      strength: medicines.strength,
      manufacturer: medicines.manufacturer,
      normGeneric: medicines.normGeneric,
      normBrand: medicines.normBrand,
      normPackageMark: medicines.normPackageMark,
      normDosageType: medicines.normDosageType,
      normStrength: medicines.normStrength,
      normManufacturer: medicines.normManufacturer,
      identityKey: medicines.identityKey,
      clinicalKey: medicines.clinicalKey,
      isActive: medicines.isActive,
      source: medicines.source,
    })
    .from(medicines);

  const byIdentity = new Map<string, (typeof existingAll)[number]>();
  const byClinical = new Map<string, (typeof existingAll)[number]>();
  for (const row of existingAll) {
    byIdentity.set(row.identityKey, row);
    if (!byClinical.has(row.clinicalKey)) {
      byClinical.set(row.clinicalKey, row);
    }
  }

  const newRecords: ParsedMedicineInput[] = [];
  const updatedRecords: {
    existingId: number;
    medicineCode: string;
    previous: any;
    incoming: ParsedMedicineInput;
    merged: any;
  }[] = [];
  const unchangedRecords: { existingId: number; medicineCode: string; brandName: string; strength: string }[] = [];
  const possibleDuplicates: {
    rowNumber: number;
    brandName: string;
    genericName: string;
    strength: string;
    reason: string;
  }[] = parsed.duplicateRows.map((d) => ({
    rowNumber: d.rowNumber,
    brandName: d.brandName,
    genericName: d.genericName,
    strength: '',
    reason: d.reason,
  }));

  const matchedExistingIds = new Set<number>();

  for (const item of parsed.validRows) {
    const exactMatch = byIdentity.get(item.identityKey);
    const clinicalMatch = !exactMatch ? byClinical.get(item.clinicalKey) : undefined;
    const target = exactMatch || clinicalMatch;

    if (!target) {
      newRecords.push(item);
      continue;
    }

    matchedExistingIds.add(target.id);

    if (importMode === 'add_only') {
      unchangedRecords.push({
        existingId: target.id,
        medicineCode: target.medicineCode,
        brandName: target.brandName,
        strength: target.strength || '',
      });
      continue;
    }

    // Mode 2 & Mode 3: Never overwrite existing non-empty fields with blank incoming CSV values
    const nextGeneric = item.genericName || target.genericName;
    const nextBrand = item.brandName || target.brandName;
    const nextPkg = item.packageMark || target.packageMark || '';
    const nextDosage = item.dosageType || target.dosageType;
    const nextStrength = item.strength || target.strength || '';
    const nextMfg = item.manufacturer || target.manufacturer;

    const mergedKeys = computeMedicineKeys({
      genericName: nextGeneric,
      brandName: nextBrand,
      packageMark: nextPkg,
      dosageType: nextDosage,
      strength: nextStrength,
      manufacturer: nextMfg,
    });

    const changed =
      mergedKeys.genericName !== target.genericName ||
      mergedKeys.brandName !== target.brandName ||
      (mergedKeys.packageMark || null) !== (target.packageMark || null) ||
      mergedKeys.dosageType !== target.dosageType ||
      (mergedKeys.strength || null) !== (target.strength || null) ||
      mergedKeys.manufacturer !== target.manufacturer ||
      !target.isActive;

    if (changed) {
      updatedRecords.push({
        existingId: target.id,
        medicineCode: target.medicineCode,
        previous: {
          genericName: target.genericName,
          brandName: target.brandName,
          packageMark: target.packageMark,
          dosageType: target.dosageType,
          strength: target.strength,
          manufacturer: target.manufacturer,
          isActive: target.isActive,
        },
        incoming: item,
        merged: {
          ...mergedKeys,
          packageMark: mergedKeys.packageMark || null,
          strength: mergedKeys.strength || null,
        },
      });
    } else {
      unchangedRecords.push({
        existingId: target.id,
        medicineCode: target.medicineCode,
        brandName: target.brandName,
        strength: target.strength || '',
      });
    }
  }

  // Mode 3: Identify existing active catalog records missing from uploaded CSV (never auto-deleted!)
  const missingRecords =
    importMode === 'full_reconcile'
      ? existingAll
          .filter((row) => row.isActive && !matchedExistingIds.has(row.id))
          .map((row) => ({
            id: row.id,
            medicineCode: row.medicineCode,
            brandName: row.brandName,
            genericName: row.genericName,
            dosageType: row.dosageType,
            strength: row.strength || '',
            manufacturer: row.manufacturer,
          }))
      : [];

  return {
    headers: parsed.headers,
    mapping: parsed.mapping,
    totalDataRows: parsed.totalDataRows,
    newRecords,
    updatedRecords,
    unchangedRecords,
    possibleDuplicates,
    invalidRecords: parsed.invalidRows,
    missingRecords,
  };
}

// Import Preview Endpoint (Inspect before Commit)
medicinesRouter.post(
  '/medicines/admin/import/preview',
  ...adminGuard,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { csvText, importMode = 'add_and_update', columnMapping } = req.body;
      if (!csvText || typeof csvText !== 'string') {
        return res.status(400).json({ error: 'CSV content is required for import preview.' });
      }
      if (!['add_only', 'add_and_update', 'full_reconcile'].includes(importMode)) {
        return res.status(400).json({ error: 'Invalid importMode specified.' });
      }

      const analysis = await analyzeCsvImport(csvText, importMode as ImportMode, columnMapping);

      res.json({
        headers: analysis.headers,
        mapping: analysis.mapping,
        importMode,
        counts: {
          totalRecords: analysis.totalDataRows,
          newRecords: analysis.newRecords.length,
          updatedRecords: analysis.updatedRecords.length,
          unchangedRecords: analysis.unchangedRecords.length,
          possibleDuplicates: analysis.possibleDuplicates.length,
          invalidRecords: analysis.invalidRecords.length,
          missingRecords: analysis.missingRecords.length,
        },
        samples: {
          newRecords: analysis.newRecords.slice(0, 40),
          updatedRecords: analysis.updatedRecords.slice(0, 40),
          unchangedRecords: analysis.unchangedRecords.slice(0, 25),
          possibleDuplicates: analysis.possibleDuplicates.slice(0, 40),
          invalidRecords: analysis.invalidRecords.slice(0, 40),
          missingRecords: analysis.missingRecords.slice(0, 200),
        },
        allMissingIds: analysis.missingRecords.map((m) => m.id),
      });
    } catch (error: any) {
      console.error('CSV import preview error:', error);
      res.status(500).json({ error: error.message || 'Failed to analyze CSV file' });
    }
  }
);

// Import Commit Endpoint (Transactional + Auto Pre-Import Snapshot)
medicinesRouter.post(
  '/medicines/admin/import/commit',
  ...adminGuard,
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        csvText,
        filename = 'medicine_update.csv',
        sourceLabel = 'CSV Upload Update',
        importMode = 'add_and_update',
        columnMapping,
        deactivateMissingIds = [],
      } = req.body;

      if (!csvText || typeof csvText !== 'string') {
        return res.status(400).json({ error: 'CSV content is required.' });
      }
      if (!['add_only', 'add_and_update', 'full_reconcile'].includes(importMode)) {
        return res.status(400).json({ error: 'Invalid importMode specified.' });
      }

      const analysis = await analyzeCsvImport(csvText, importMode as ImportMode, columnMapping);
      const missingIdsToDeactivate =
        importMode === 'full_reconcile' && Array.isArray(deactivateMissingIds)
          ? deactivateMissingIds.map((x) => parseInt(String(x), 10)).filter((n) => !isNaN(n))
          : [];

      const result = await db.transaction(async (tx) => {
        // 1. Pre-import automatic backup snapshot for controlled rollback
        const snapshot = await createCatalogSnapshotTx(
          tx,
          `Pre-Import Backup (${filename})`,
          req.user!.id
        );

        const batchCode = await getNextBatchCode(tx);

        const [batch] = await tx
          .insert(medicineImportBatches)
          .values({
            batchCode,
            filename,
            sourceLabel,
            importMode,
            status: 'completed',
            uploadedBy: req.user!.id,
            totalRecords: analysis.totalDataRows,
            addedCount: analysis.newRecords.length,
            updatedCount: analysis.updatedRecords.length,
            unchangedCount: analysis.unchangedRecords.length,
            skippedCount: analysis.possibleDuplicates.length,
            rejectedCount: analysis.invalidRecords.length,
            missingCount: analysis.missingRecords.length,
            deactivatedCount: missingIdsToDeactivate.length,
            snapshotId: snapshot.id,
            summaryJson: JSON.stringify({
              mapping: analysis.mapping,
              sampleInvalid: analysis.invalidRecords.slice(0, 20),
              sampleDuplicates: analysis.possibleDuplicates.slice(0, 20),
            }),
          })
          .returning();

        // 2. Insert New Records in chunks
        let seq = await getNextMedicineSeq(tx);
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < analysis.newRecords.length; i += CHUNK_SIZE) {
          const chunk = analysis.newRecords.slice(i, i + CHUNK_SIZE);
          await tx
            .insert(medicines)
            .values(
              chunk.map((item) => ({
                medicineCode: formatMedCode(seq++),
                genericName: item.genericName,
                brandName: item.brandName,
                packageMark: item.packageMark || null,
                dosageType: item.dosageType || 'Unspecified',
                strength: item.strength || null,
                manufacturer: item.manufacturer || 'Unspecified',
                normGeneric: item.normGeneric,
                normBrand: item.normBrand,
                normPackageMark: item.normPackageMark,
                normDosageType: item.normDosageType || 'unspecified',
                normStrength: item.normStrength,
                normManufacturer: item.normManufacturer || 'unspecified',
                identityKey: item.identityKey,
                clinicalKey: item.clinicalKey,
                source: sourceLabel,
                isActive: true,
                lastImportBatchId: batch.id,
                createdBy: req.user!.id,
                updatedBy: req.user!.id,
              }))
            )
            .onConflictDoNothing({ target: medicines.identityKey });
        }

        // 3. Apply Updates (Mode 2 & Mode 3)
        for (const upd of analysis.updatedRecords) {
          await tx
            .update(medicines)
            .set({
              genericName: upd.merged.genericName,
              brandName: upd.merged.brandName,
              packageMark: upd.merged.packageMark,
              dosageType: upd.merged.dosageType,
              strength: upd.merged.strength,
              manufacturer: upd.merged.manufacturer,
              normGeneric: upd.merged.normGeneric,
              normBrand: upd.merged.normBrand,
              normPackageMark: upd.merged.normPackageMark,
              normDosageType: upd.merged.normDosageType,
              normStrength: upd.merged.normStrength,
              normManufacturer: upd.merged.normManufacturer,
              identityKey: upd.merged.identityKey,
              clinicalKey: upd.merged.clinicalKey,
              source: sourceLabel,
              isActive: true,
              lastImportBatchId: batch.id,
              updatedBy: req.user!.id,
              updatedAt: new Date(),
            })
            .where(eq(medicines.id, upd.existingId));
        }

        // 4. Optional Deactivation of Missing Records in Mode 3 (never auto-deleted)
        if (missingIdsToDeactivate.length > 0) {
          await tx
            .update(medicines)
            .set({
              isActive: false,
              updatedBy: req.user!.id,
              updatedAt: new Date(),
            })
            .where(inArray(medicines.id, missingIdsToDeactivate));
        }

        await tx.insert(medicineAuditLogs).values({
          importBatchId: batch.id,
          userId: req.user!.id,
          userRole: req.user!.role,
          action: 'CSV_IMPORT_COMMIT',
          targetName: `Import ${batch.batchCode} (${filename})`,
          newValuesJson: JSON.stringify({
            mode: importMode,
            added: analysis.newRecords.length,
            updated: analysis.updatedRecords.length,
            unchanged: analysis.unchangedRecords.length,
            skippedDuplicates: analysis.possibleDuplicates.length,
            rejected: analysis.invalidRecords.length,
            missing: analysis.missingRecords.length,
            deactivated: missingIdsToDeactivate.length,
            snapshotCode: snapshot.snapshotCode,
          }),
          details: `Imported CSV "${filename}" using mode ${importMode}: +${analysis.newRecords.length} added, ${analysis.updatedRecords.length} updated, ${analysis.unchangedRecords.length} unchanged, ${analysis.possibleDuplicates.length} duplicate/skipped, ${analysis.invalidRecords.length} rejected, ${missingIdsToDeactivate.length} missing records deactivated.`,
        });

        return { batch, snapshot };
      });

      await logAudit(
        req.user,
        'MEDICINE_CSV_IMPORT',
        `Batch ${result.batch.batchCode} (${filename})`,
        `Mode: ${importMode}; Added: ${result.batch.addedCount}, Updated: ${result.batch.updatedCount}, Rejected: ${result.batch.rejectedCount}`
      );

      res.status(201).json({
        success: true,
        batch: result.batch,
        snapshot: {
          id: result.snapshot.id,
          snapshotCode: result.snapshot.snapshotCode,
          label: result.snapshot.label,
        },
      });
    } catch (error: any) {
      console.error('CSV import commit error:', error);
      res.status(500).json({ error: error.message || 'Failed to apply CSV import' });
    }
  }
);

// Create Manual Catalog Backup Snapshot
medicinesRouter.post(
  '/medicines/admin/snapshots',
  ...adminGuard,
  async (req: AuthenticatedRequest, res) => {
    try {
      const label =
        cleanDisplayText(req.body?.label) ||
        `Manual Backup Snapshot (${new Date().toISOString().split('T')[0]})`;

      const snap = await db.transaction(async (tx) => {
        const created = await createCatalogSnapshotTx(tx, label, req.user!.id);
        await tx.insert(medicineAuditLogs).values({
          userId: req.user!.id,
          userRole: req.user!.role,
          action: 'BACKUP_SNAPSHOT',
          targetName: `${created.snapshotCode} (${created.label})`,
          details: `Created catalog backup snapshot containing ${created.recordCount} medicine records.`,
        });
        return created;
      });

      res.status(201).json({
        id: snap.id,
        snapshotCode: snap.snapshotCode,
        label: snap.label,
        recordCount: snap.recordCount,
        createdAt: snap.createdAt,
      });
    } catch (error: any) {
      console.error('Create snapshot error:', error);
      res.status(500).json({ error: 'Failed to create catalog backup snapshot' });
    }
  }
);

// Controlled Catalog-Only Rollback (Preserves Historical Prescriptions!)
medicinesRouter.post(
  '/medicines/admin/rollback/:snapshotId',
  ...adminGuard,
  async (req: AuthenticatedRequest, res) => {
    try {
      const snapshotId = parseInt(req.params.snapshotId, 10);
      if (isNaN(snapshotId)) return res.status(400).json({ error: 'Invalid snapshot ID' });

      const [snap] = await db
        .select()
        .from(medicineCatalogSnapshots)
        .where(eq(medicineCatalogSnapshots.id, snapshotId));

      if (!snap) return res.status(404).json({ error: 'Backup snapshot not found' });

      const snapshotRecords: any[] = decodeSnapshotPayload(snap.snapshotData);

      const rollbackResult = await db.transaction(async (tx) => {
        // Save a safety snapshot of current state before rolling back
        const safetySnap = await createCatalogSnapshotTx(
          tx,
          `Pre-Rollback Safety Backup (before ${snap.snapshotCode})`,
          req.user!.id
        );

        const snapIds = new Set<number>(snapshotRecords.map((r) => r.id));
        const currentRows = await tx.select().from(medicines);
        const currentById = new Map(currentRows.map((r) => [r.id, r]));

        // 1. Remove catalog records created AFTER the snapshot
        //    (prescription_medicines.medicine_id uses ON DELETE SET NULL, preserving all text snapshots on historical Rx!)
        const postSnapshotIds = currentRows.filter((r) => !snapIds.has(r.id)).map((r) => r.id);
        for (let i = 0; i < postSnapshotIds.length; i += 1000) {
          await tx
            .delete(medicines)
            .where(inArray(medicines.id, postSnapshotIds.slice(i, i + 1000)));
        }

        // 2. Restore only changed records by ID + batch re-insert any missing snapshot IDs
        const toInsert: any[] = [];
        for (const rec of snapshotRecords) {
          const cur = currentById.get(rec.id);
          if (cur) {
            const changed =
              cur.medicineCode !== rec.medicineCode ||
              cur.genericName !== rec.genericName ||
              cur.brandName !== rec.brandName ||
              (cur.packageMark || null) !== (rec.packageMark || null) ||
              cur.dosageType !== rec.dosageType ||
              (cur.strength || null) !== (rec.strength || null) ||
              cur.manufacturer !== rec.manufacturer ||
              cur.identityKey !== rec.identityKey ||
              cur.clinicalKey !== rec.clinicalKey ||
              cur.source !== rec.source ||
              cur.isActive !== Boolean(rec.isActive) ||
              (cur.lastImportBatchId ?? null) !== (rec.lastImportBatchId ?? null);

            if (changed) {
              await tx
                .update(medicines)
                .set({
                  medicineCode: rec.medicineCode,
                  genericName: rec.genericName,
                  brandName: rec.brandName,
                  packageMark: rec.packageMark || null,
                  dosageType: rec.dosageType,
                  strength: rec.strength || null,
                  manufacturer: rec.manufacturer,
                  normGeneric: rec.normGeneric,
                  normBrand: rec.normBrand,
                  normPackageMark: rec.normPackageMark || '',
                  normDosageType: rec.normDosageType,
                  normStrength: rec.normStrength || '',
                  normManufacturer: rec.normManufacturer,
                  identityKey: rec.identityKey,
                  clinicalKey: rec.clinicalKey,
                  source: rec.source,
                  isActive: Boolean(rec.isActive),
                  lastImportBatchId: rec.lastImportBatchId ?? null,
                  updatedBy: req.user!.id,
                  updatedAt: new Date(),
                })
                .where(eq(medicines.id, rec.id));
            }
          } else {
            toInsert.push({
              id: rec.id,
              medicineCode: rec.medicineCode,
              genericName: rec.genericName,
              brandName: rec.brandName,
              packageMark: rec.packageMark || null,
              dosageType: rec.dosageType,
              strength: rec.strength || null,
              manufacturer: rec.manufacturer,
              normGeneric: rec.normGeneric,
              normBrand: rec.normBrand,
              normPackageMark: rec.normPackageMark || '',
              normDosageType: rec.normDosageType,
              normStrength: rec.normStrength || '',
              normManufacturer: rec.normManufacturer,
              identityKey: rec.identityKey,
              clinicalKey: rec.clinicalKey,
              source: rec.source,
              isActive: Boolean(rec.isActive),
              lastImportBatchId: rec.lastImportBatchId ?? null,
              createdBy: rec.createdBy ?? req.user!.id,
              updatedBy: req.user!.id,
            });
          }
        }

        for (let i = 0; i < toInsert.length; i += 1000) {
          await tx.insert(medicines).values(toInsert.slice(i, i + 1000));
        }

        // Sync PostgreSQL serial sequence
        await tx.execute(
          sql`SELECT setval(pg_get_serial_sequence('medicines', 'id'), COALESCE((SELECT MAX(id) FROM medicines), 1))`
        );

        // Mark import batches created after this snapshot as 'rolled_back'
        await tx
          .update(medicineImportBatches)
          .set({ status: 'rolled_back' })
          .where(sql`${medicineImportBatches.createdAt} > ${snap.createdAt}`);

        await tx.insert(medicineAuditLogs).values({
          userId: req.user!.id,
          userRole: req.user!.role,
          action: 'CATALOG_ROLLBACK',
          targetName: `${snap.snapshotCode} (${snap.label})`,
          details: `Rolled back medicine catalog to snapshot ${snap.snapshotCode} (${snapshotRecords.length} records). Historical prescriptions were completely preserved. Safety snapshot ${safetySnap.snapshotCode} created prior to rollback.`,
        });

        return { restoredCount: snapshotRecords.length, safetySnapCode: safetySnap.snapshotCode };
      });

      await logAudit(
        req.user,
        'MEDICINE_CATALOG_ROLLBACK',
        `Snapshot ${snap.snapshotCode}`,
        `Restored ${rollbackResult.restoredCount} catalog records; historical prescriptions preserved`
      );

      res.json({
        success: true,
        restoredCount: rollbackResult.restoredCount,
        snapshotCode: snap.snapshotCode,
        safetySnapshotCode: rollbackResult.safetySnapCode,
      });
    } catch (error: any) {
      console.error('Catalog rollback error:', error);
      res.status(500).json({ error: error.message || 'Failed to roll back medicine catalog' });
    }
  }
);
