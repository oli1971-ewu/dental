import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api.ts';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../utils/dateFormat.ts';
import {
  CatalogMedicine,
  MedicineAuditLog,
  MedicineCatalogSnapshot,
  MedicineColumnMapping,
  MedicineDetailResponse,
  MedicineImportBatch,
  MedicineImportMode,
  MedicineImportPreviewResponse,
  MedicineOverviewStats,
} from '../types/index.ts';
import {
  Database,
  Search,
  Plus,
  Edit2,
  Eye,
  Power,
  Upload,
  History,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Archive,
  X,
  RefreshCw,
  Layers,
  Info,
} from 'lucide-react';

const MAPPING_FIELDS: { key: keyof MedicineColumnMapping; label: string; required?: boolean }[] = [
  { key: 'brandName', label: 'Brand Name', required: true },
  { key: 'genericName', label: 'Generic Name', required: true },
  { key: 'dosageType', label: 'Dosage Form' },
  { key: 'strength', label: 'Strength' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'packageMark', label: 'Package Mark' },
];

function parseCsvHeaderLine(text: string): string[] {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  const headers: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (inQ) {
      if (ch === '"' && firstLine[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      headers.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0 || headers.length > 0) headers.push(cur.trim());
  return headers.filter(Boolean);
}

export const MedicineDatabaseManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'import' | 'history'>('catalog');
  const [overview, setOverview] = useState<MedicineOverviewStats | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tab 1: Catalog & Search State
  const [catalogItems, setCatalogItems] = useState<CatalogMedicine[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [pageSize] = useState(25);
  const [searchQ, setSearchQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [dosageFilter, setDosageFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dosageFacets, setDosageFacets] = useState<string[]>([]);
  const [sourceFacets, setSourceFacets] = useState<string[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Inline toggle confirmation
  const [confirmToggleId, setConfirmToggleId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Add / Edit Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<CatalogMedicine | null>(null);
  const [formState, setFormState] = useState({
    brandName: '',
    genericName: '',
    dosageType: '',
    strength: '',
    manufacturer: '',
    packageMark: '',
    isActive: true,
  });
  const [savingForm, setSavingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Detail Modal
  const [detailData, setDetailData] = useState<MedicineDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Tab 2: CSV Import & Update State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [csvFilename, setCsvFilename] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [sourceLabel, setSourceLabel] = useState('Bangladesh Medicine CSV Update');
  const [importMode, setImportMode] = useState<MedicineImportMode>('add_and_update');
  const [columnMapping, setColumnMapping] = useState<Partial<MedicineColumnMapping>>({});
  const [previewData, setPreviewData] = useState<MedicineImportPreviewResponse | null>(null);
  const [previewBucket, setPreviewBucket] = useState<
    'new' | 'updated' | 'unchanged' | 'duplicates' | 'invalid' | 'missing'
  >('new');
  const [selectedMissingIds, setSelectedMissingIds] = useState<number[]>([]);
  const [analyzingCsv, setAnalyzingCsv] = useState(false);
  const [committingCsv, setCommittingCsv] = useState(false);
  const [confirmCommit, setConfirmCommit] = useState(false);

  // Tab 3: History, Backups & Rollback State
  const [batches, setBatches] = useState<MedicineImportBatch[]>([]);
  const [snapshots, setSnapshots] = useState<MedicineCatalogSnapshot[]>([]);
  const [auditLogs, setAuditLogs] = useState<MedicineAuditLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [creatingSnap, setCreatingSnap] = useState(false);
  const [confirmRollbackId, setConfirmRollbackId] = useState<number | null>(null);
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);

  const loadOverview = async () => {
    try {
      const data = await api.getMedicineOverview();
      setOverview(data);
    } catch (e: any) {
      setBanner({ type: 'error', text: e.message || 'Failed to load medicine overview' });
    }
  };

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const res = await api.getMedicineCatalog({
        q: debouncedQ,
        status: statusFilter,
        dosageType: dosageFilter,
        source: sourceFilter,
        page: catalogPage,
        pageSize,
      });
      setCatalogItems(res.items);
      setCatalogTotal(res.total);
      setDosageFacets(res.facets.dosageTypes);
      setSourceFacets(res.facets.sources);
    } catch (e: any) {
      setBanner({ type: 'error', text: e.message || 'Failed to load medicine catalog' });
    } finally {
      setLoadingCatalog(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.getMedicineHistory();
      setBatches(res.batches);
      setSnapshots(res.snapshots);
      setAuditLogs(res.logs);
    } catch (e: any) {
      setBanner({ type: 'error', text: e.message || 'Failed to load catalog history' });
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(searchQ);
      setCatalogPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    if (activeTab === 'catalog') {
      loadCatalog();
    } else if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, debouncedQ, statusFilter, dosageFilter, sourceFilter, catalogPage]);

  const openAddModal = () => {
    setEditingMed(null);
    setFormState({
      brandName: '',
      genericName: '',
      dosageType: 'Tablet',
      strength: '',
      manufacturer: '',
      packageMark: '',
      isActive: true,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (med: CatalogMedicine) => {
    setEditingMed(med);
    setFormState({
      brandName: med.brandName,
      genericName: med.genericName,
      dosageType: med.dosageType,
      strength: med.strength || '',
      manufacturer: med.manufacturer,
      packageMark: med.packageMark || '',
      isActive: med.isActive,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSavingForm(true);
    try {
      if (editingMed) {
        await api.updateCatalogMedicine(editingMed.id, formState);
        setBanner({
          type: 'success',
          text: `Updated ${formState.brandName} (${editingMed.medicineCode}). Historical prescriptions remain untouched.`,
        });
      } else {
        const created = await api.createCatalogMedicine(formState);
        setBanner({
          type: 'success',
          text: `Added ${created.brandName} (${created.medicineCode}) to the local medicine catalog.`,
        });
      }
      setFormOpen(false);
      loadOverview();
      loadCatalog();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save medicine');
    } finally {
      setSavingForm(false);
    }
  };

  const handleToggleStatus = async (med: CatalogMedicine) => {
    setTogglingId(med.id);
    try {
      await api.toggleCatalogMedicineStatus(med.id, !med.isActive);
      setConfirmToggleId(null);
      setBanner({
        type: 'success',
        text: `${med.brandName} (${med.medicineCode}) is now ${!med.isActive ? 'Active' : 'Inactive'}. Historical prescriptions remain untouched.`,
      });
      loadOverview();
      loadCatalog();
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to update medicine status' });
    } finally {
      setTogglingId(null);
    }
  };

  const handleInspectDetail = async (id: number) => {
    setLoadingDetail(true);
    try {
      const res = await api.getMedicineDetail(id);
      setDetailData(res);
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to load medicine details' });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBanner(null);
    setPreviewData(null);
    setConfirmCommit(false);
    setSelectedMissingIds([]);
    try {
      const text = await file.text();
      setCsvFilename(file.name);
      setCsvText(text);
      const hdrs = parseCsvHeaderLine(text);
      setCsvHeaders(hdrs);
      setColumnMapping({});
    } catch {
      setBanner({ type: 'error', text: 'Could not read selected CSV file.' });
    }
  };

  const handlePreviewCsv = async () => {
    if (!csvText.trim()) return;
    setAnalyzingCsv(true);
    setBanner(null);
    setConfirmCommit(false);
    try {
      const res = await api.previewMedicineCsvImport({
        csvText,
        importMode,
        columnMapping,
      });
      setPreviewData(res);
      setColumnMapping(res.mapping);
      setSelectedMissingIds([]);
      if (res.counts.newRecords > 0) setPreviewBucket('new');
      else if (res.counts.updatedRecords > 0) setPreviewBucket('updated');
      else if (res.counts.invalidRecords > 0) setPreviewBucket('invalid');
      else setPreviewBucket('unchanged');
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'CSV analysis failed' });
    } finally {
      setAnalyzingCsv(false);
    }
  };

  const handleCommitCsv = async () => {
    if (!csvText.trim() || !previewData) return;
    setCommittingCsv(true);
    setBanner(null);
    try {
      const res = await api.commitMedicineCsvImport({
        csvText,
        filename: csvFilename || 'medicine_update.csv',
        sourceLabel: sourceLabel.trim() || 'CSV Upload Update',
        importMode,
        columnMapping,
        deactivateMissingIds: importMode === 'full_reconcile' ? selectedMissingIds : [],
      });
      setBanner({
        type: 'success',
        text: `Import Batch ${res.batch.batchCode} applied (+${res.batch.addedCount} added, ${res.batch.updatedCount} updated, ${res.batch.skippedCount} duplicates skipped, ${res.batch.rejectedCount} rejected). Automatic backup ${res.snapshot.snapshotCode} created.`,
      });
      setConfirmCommit(false);
      setPreviewData(null);
      setCsvText('');
      setCsvFilename('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadOverview();
      loadHistory();
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to apply CSV import' });
    } finally {
      setCommittingCsv(false);
    }
  };

  const handleCreateSnapshot = async () => {
    setCreatingSnap(true);
    setBanner(null);
    try {
      const snap = await api.createMedicineSnapshot(snapshotLabel.trim() || undefined);
      setSnapshotLabel('');
      setBanner({
        type: 'success',
        text: `Backup snapshot ${snap.snapshotCode} created (${snap.recordCount.toLocaleString()} catalog records).`,
      });
      loadHistory();
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Failed to create backup snapshot' });
    } finally {
      setCreatingSnap(false);
    }
  };

  const handleRollback = async (snapId: number) => {
    setRollingBackId(snapId);
    setBanner(null);
    try {
      const res = await api.rollbackMedicineCatalog(snapId);
      setConfirmRollbackId(null);
      setBanner({
        type: 'success',
        text: `Catalog rolled back to ${res.snapshotCode} (${res.restoredCount.toLocaleString()} medicines restored). Safety backup ${res.safetySnapshotCode} saved. Historical prescriptions unaffected.`,
      });
      loadOverview();
      loadCatalog();
      loadHistory();
    } catch (err: any) {
      setBanner({ type: 'error', text: err.message || 'Rollback failed' });
    } finally {
      setRollingBackId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(catalogTotal / pageSize));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden text-xs">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Medicine Database &amp; CSV Update Management
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage the local Bangladesh medicinal catalog powering Prescription smart autocomplete, safe CSV dataset updates, audit logs, and catalog-only rollback.
            </p>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start lg:self-auto">
          {[
            { id: 'catalog' as const, label: 'Catalog & Search', icon: Layers },
            { id: 'import' as const, label: 'CSV Import / Update', icon: Upload },
            { id: 'history' as const, label: 'History, Backups & Rollback', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  active
                    ? 'bg-white text-teal-800 shadow-2xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`mx-5 mt-4 p-3 rounded-xl border font-semibold flex items-center justify-between gap-2 ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{banner.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs underline opacity-75 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Overview Strip */}
      {overview && (
        <div className="p-5 pb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Total Catalog</span>
            <span className="text-lg font-extrabold text-slate-900 font-mono tabular-nums">
              {overview.totalMedicines.toLocaleString()}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[11px] text-emerald-800 block">Active / Inactive</span>
            <span className="text-lg font-extrabold text-emerald-900 font-mono tabular-nums">
              {overview.activeMedicines.toLocaleString()}{' '}
              <span className="text-xs font-semibold text-slate-500">
                / {overview.inactiveMedicines.toLocaleString()}
              </span>
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Distinct Generics</span>
            <span className="text-lg font-extrabold text-slate-900 font-mono tabular-nums">
              {overview.totalGenerics.toLocaleString()}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Manufacturers</span>
            <span className="text-lg font-extrabold text-slate-900 font-mono tabular-nums">
              {overview.totalManufacturers.toLocaleString()}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200">
            <span className="text-[11px] text-teal-800 block">7-Day Adds / Edits</span>
            <span className="text-lg font-extrabold text-teal-900 font-mono tabular-nums">
              +{overview.recentlyAddedCount.toLocaleString()}{' '}
              <span className="text-xs font-semibold text-teal-700">
                / ~{overview.recentlyUpdatedCount.toLocaleString()}
              </span>
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Last Import Batch</span>
            {overview.lastImport ? (
              <div>
                <span className="font-mono font-bold text-slate-900">
                  {overview.lastImport.batchCode}
                </span>{' '}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                  {overview.lastImport.status}
                </span>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">
                  {formatDateDDMMYYYY(overview.lastImport.createdAt)}
                </div>
              </div>
            ) : (
              <span className="text-slate-400">None yet</span>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: CATALOG & SEARCH */}
      {activeTab === 'catalog' && (
        <div className="p-5 pt-2 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search Brand, Generic, Strength, Dosage Form, Manufacturer, or MED-#..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCatalogPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>

              <select
                value={dosageFilter}
                onChange={(e) => {
                  setDosageFilter(e.target.value);
                  setCatalogPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 max-w-[160px]"
              >
                <option value="all">All Dosage Forms</option>
                {dosageFacets.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setCatalogPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 max-w-[180px]"
              >
                <option value="all">All Sources</option>
                {sourceFacets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center gap-1.5 cursor-pointer self-start lg:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Medicine</span>
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Code</th>
                    <th className="py-2.5 px-3">Brand Name &amp; Strength</th>
                    <th className="py-2.5 px-3">Generic Name</th>
                    <th className="py-2.5 px-3">Dosage Form</th>
                    <th className="py-2.5 px-3">Manufacturer</th>
                    <th className="py-2.5 px-3">Source</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-center min-w-[200px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingCatalog ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Loading medicine catalog...
                      </td>
                    </tr>
                  ) : catalogItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                        No catalog medicines match your filters.
                      </td>
                    </tr>
                  ) : (
                    catalogItems.map((med) => (
                      <tr
                        key={med.id}
                        className={`hover:bg-teal-50/30 ${!med.isActive ? 'bg-slate-50/70 opacity-75' : ''}`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                          {med.medicineCode}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">
                            {med.brandName}{' '}
                            {med.strength && (
                              <span className="text-teal-700 font-semibold">— {med.strength}</span>
                            )}
                          </div>
                          {med.packageMark && (
                            <div className="text-[10px] text-slate-500">Pkg: {med.packageMark}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{med.genericName}</td>
                        <td className="py-2.5 px-3 text-slate-700">{med.dosageType}</td>
                        <td className="py-2.5 px-3 text-slate-600">{med.manufacturer}</td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-500 max-w-[140px] truncate">
                          {med.source}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              med.isActive
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-300'
                            }`}
                          >
                            {med.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {confirmToggleId === med.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-amber-800">
                                {med.isActive ? 'Deactivate?' : 'Activate?'}
                              </span>
                              <button
                                type="button"
                                disabled={togglingId === med.id}
                                onClick={() => handleToggleStatus(med)}
                                className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold text-[11px] cursor-pointer"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmToggleId(null)}
                                className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold text-[11px] cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleInspectDetail(med.id)}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title="Inspect Details & Usage"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Details</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(med)}
                                className="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmToggleId(med.id)}
                                className={`px-2 py-1 rounded-lg font-semibold inline-flex items-center gap-1 border cursor-pointer ${
                                  med.isActive
                                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                <Power className="w-3 h-3" />
                                <span>{med.isActive ? 'Deactivate' : 'Activate'}</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span className="tabular-nums">
                Showing {catalogItems.length} of {catalogTotal.toLocaleString()} medicine(s) · Page{' '}
                {catalogPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={catalogPage <= 1}
                  onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  type="button"
                  disabled={catalogPage >= totalPages}
                  onClick={() => setCatalogPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CSV IMPORT & UPDATE */}
      {activeTab === 'import' && (
        <div className="p-5 pt-2 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Step 1: Upload & Mode Selection */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-teal-600" />
                <span>1. Select Medicine Dataset CSV &amp; Update Mode</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Upload CSV File (UTF-8)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileSelect}
                  className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-teal-300 file:bg-teal-50 file:text-teal-800 file:font-semibold hover:file:bg-teal-100 cursor-pointer"
                />
                {csvFilename && (
                  <p className="text-[11px] text-teal-800 font-semibold mt-1">
                    Loaded: {csvFilename} ({(csvText.length / 1024).toFixed(1)} KB,{' '}
                    {csvHeaders.length} column(s))
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Dataset Source Label
                </label>
                <input
                  type="text"
                  value={sourceLabel}
                  onChange={(e) => setSourceLabel(e.target.value)}
                  placeholder="e.g., Bangladesh Medicine Dataset 2026"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-slate-700">Import / Update Mode</label>
                {[
                  {
                    id: 'add_and_update' as const,
                    title: 'Mode 2: Add New + Update Existing (Default)',
                    desc: 'Adds new medicines and safely updates matching records without blanking existing non-empty fields.',
                  },
                  {
                    id: 'add_only' as const,
                    title: 'Mode 1: Add New Only',
                    desc: 'Inserts new medicines and leaves all existing catalog entries untouched.',
                  },
                  {
                    id: 'full_reconcile' as const,
                    title: 'Mode 3: Full Dataset Reconciliation',
                    desc: 'Adds & updates records, plus lists active catalog medicines missing from this CSV for optional deactivation (never auto-deleted).',
                  },
                ].map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      importMode === m.id
                        ? 'bg-teal-50 border-teal-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === m.id}
                      onChange={() => {
                        setImportMode(m.id);
                        setPreviewData(null);
                      }}
                      className="mt-0.5 accent-teal-600"
                    />
                    <div>
                      <div className="font-bold text-slate-900">{m.title}</div>
                      <div className="text-[11px] text-slate-600">{m.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Step 2: Column Mapping */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-teal-600" />
                  <span>2. CSV Column Mapping</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Columns are auto-detected on Preview. You may override any mapping when importing updated datasets with renamed headers.
                </p>

                {csvHeaders.length === 0 ? (
                  <div className="p-4 rounded-lg bg-slate-50 border border-dashed border-slate-300 text-center text-slate-400">
                    Upload a CSV file on the left to inspect and map its columns.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {MAPPING_FIELDS.map((f) => (
                      <div key={f.key}>
                        <label className="block font-semibold text-slate-700 mb-1">
                          {f.label} {f.required ? '*' : ''}
                        </label>
                        <select
                          value={columnMapping[f.key] || ''}
                          onChange={(e) =>
                            setColumnMapping((prev) => ({ ...prev, [f.key]: e.target.value }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="">-- Auto Detect / Unmapped --</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-teal-600" />
                  Preview is required before committing changes.
                </span>
                <button
                  type="button"
                  disabled={!csvText.trim() || analyzingCsv}
                  onClick={handlePreviewCsv}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold cursor-pointer disabled:opacity-40"
                >
                  {analyzingCsv ? 'Analyzing CSV...' : 'Preview Import Changes'}
                </button>
              </div>
            </div>
          </div>

          {/* Step 3: Mandatory Import Preview Inspector */}
          {previewData && (
            <div className="border border-teal-300 rounded-xl bg-white overflow-hidden space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    3. Import Preview Summary ({previewData.counts.totalRecords.toLocaleString()}{' '}
                    data row{previewData.counts.totalRecords === 1 ? '' : 's'})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Inspect all buckets below before confirming. An automatic backup snapshot will be saved prior to applying changes.
                  </p>
                </div>

                {!confirmCommit ? (
                  <button
                    type="button"
                    onClick={() => setConfirmCommit(true)}
                    className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer"
                  >
                    Proceed to Confirm Import
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-lg">
                    <span className="font-bold text-amber-900">Apply import to database?</span>
                    <button
                      type="button"
                      disabled={committingCsv}
                      onClick={handleCommitCsv}
                      className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer disabled:opacity-50"
                    >
                      {committingCsv ? 'Applying...' : 'Confirm & Commit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmCommit(false)}
                      className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Bucket Selector Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {[
                  {
                    id: 'new' as const,
                    label: 'New Records',
                    count: previewData.counts.newRecords,
                    cls: 'border-emerald-200 bg-emerald-50 text-emerald-900',
                  },
                  {
                    id: 'updated' as const,
                    label: 'To Update',
                    count: previewData.counts.updatedRecords,
                    cls: 'border-sky-200 bg-sky-50 text-sky-900',
                  },
                  {
                    id: 'unchanged' as const,
                    label: 'Unchanged',
                    count: previewData.counts.unchangedRecords,
                    cls: 'border-slate-200 bg-slate-50 text-slate-800',
                  },
                  {
                    id: 'duplicates' as const,
                    label: 'CSV Duplicates',
                    count: previewData.counts.possibleDuplicates,
                    cls: 'border-amber-200 bg-amber-50 text-amber-900',
                  },
                  {
                    id: 'invalid' as const,
                    label: 'Invalid / Rejected',
                    count: previewData.counts.invalidRecords,
                    cls: 'border-rose-200 bg-rose-50 text-rose-900',
                  },
                  {
                    id: 'missing' as const,
                    label: 'Missing (Mode 3)',
                    count: previewData.counts.missingRecords,
                    cls: 'border-purple-200 bg-purple-50 text-purple-900',
                  },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setPreviewBucket(b.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      b.cls
                    } ${previewBucket === b.id ? 'ring-2 ring-teal-500' : 'opacity-85 hover:opacity-100'}`}
                  >
                    <span className="text-[11px] font-semibold block">{b.label}</span>
                    <span className="text-lg font-extrabold font-mono tabular-nums">
                      {b.count.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>

              {/* Bucket Sample Viewer */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                {previewBucket === 'new' && (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2 px-3">Row</th>
                        <th className="py-2 px-3">Brand &amp; Strength</th>
                        <th className="py-2 px-3">Generic</th>
                        <th className="py-2 px-3">Dosage Form</th>
                        <th className="py-2 px-3">Manufacturer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.samples.newRecords.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                            No new records to add.
                          </td>
                        </tr>
                      ) : (
                        previewData.samples.newRecords.map((r, i) => (
                          <tr key={i}>
                            <td className="py-1.5 px-3 font-mono text-slate-500">#{r.rowNumber}</td>
                            <td className="py-1.5 px-3 font-bold text-slate-900">
                              {r.brandName} {r.strength ? `— ${r.strength}` : ''}
                            </td>
                            <td className="py-1.5 px-3">{r.genericName}</td>
                            <td className="py-1.5 px-3">{r.dosageType}</td>
                            <td className="py-1.5 px-3 text-slate-600">{r.manufacturer}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {previewBucket === 'updated' && (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2 px-3">Code</th>
                        <th className="py-2 px-3">Before</th>
                        <th className="py-2 px-3">After Merge</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.samples.updatedRecords.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-slate-400 italic">
                            No existing records need updates.
                          </td>
                        </tr>
                      ) : (
                        previewData.samples.updatedRecords.map((u, i) => (
                          <tr key={i}>
                            <td className="py-1.5 px-3 font-mono font-bold">{u.medicineCode}</td>
                            <td className="py-1.5 px-3 text-slate-500">
                              {u.previous.brandName} ({u.previous.genericName}){' '}
                              {u.previous.strength || ''} · {u.previous.dosageType} ·{' '}
                              {u.previous.manufacturer}
                            </td>
                            <td className="py-1.5 px-3 font-semibold text-teal-800">
                              {u.merged.brandName} ({u.merged.genericName}) {u.merged.strength || ''}{' '}
                              · {u.merged.dosageType} · {u.merged.manufacturer}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {previewBucket === 'unchanged' && (
                  <div className="p-4 text-slate-600">
                    {previewData.counts.unchangedRecords.toLocaleString()} matching catalog record(s) are already up to date and will remain unchanged.
                  </div>
                )}

                {previewBucket === 'duplicates' && (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2 px-3">Row</th>
                        <th className="py-2 px-3">Brand</th>
                        <th className="py-2 px-3">Generic</th>
                        <th className="py-2 px-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.samples.possibleDuplicates.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                            No duplicate rows detected in CSV.
                          </td>
                        </tr>
                      ) : (
                        previewData.samples.possibleDuplicates.map((d, i) => (
                          <tr key={i}>
                            <td className="py-1.5 px-3 font-mono">#{d.rowNumber}</td>
                            <td className="py-1.5 px-3 font-bold">{d.brandName}</td>
                            <td className="py-1.5 px-3">{d.genericName}</td>
                            <td className="py-1.5 px-3 text-amber-800">{d.reason}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {previewBucket === 'invalid' && (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2 px-3">Row</th>
                        <th className="py-2 px-3">Reason Rejected</th>
                        <th className="py-2 px-3">Raw Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.samples.invalidRecords.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-slate-400 italic">
                            Zero invalid rows!
                          </td>
                        </tr>
                      ) : (
                        previewData.samples.invalidRecords.map((inv, i) => (
                          <tr key={i}>
                            <td className="py-1.5 px-3 font-mono">#{inv.rowNumber}</td>
                            <td className="py-1.5 px-3 text-rose-700 font-semibold">{inv.reason}</td>
                            <td className="py-1.5 px-3 font-mono text-[11px] text-slate-500">
                              {JSON.stringify(inv.raw)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {previewBucket === 'missing' && (
                  <div className="p-3 space-y-2">
                    {importMode !== 'full_reconcile' ? (
                      <div className="py-4 text-center text-slate-500">
                        Missing-record reconciliation is only active in Mode 3 (Full Dataset Reconciliation).
                      </div>
                    ) : previewData.samples.missingRecords.length === 0 ? (
                      <div className="py-4 text-center text-slate-500">
                        All existing active catalog records are present in this CSV.
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                          <span className="text-[11px] font-semibold text-purple-900">
                            Check any missing records you wish to mark Inactive (0 auto-deleted; selected: {selectedMissingIds.length}):
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedMissingIds(previewData.allMissingIds)}
                              className="px-2 py-1 rounded bg-purple-100 text-purple-900 font-semibold text-[11px] cursor-pointer"
                            >
                              Select All ({previewData.allMissingIds.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedMissingIds([])}
                              className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-semibold text-[11px] cursor-pointer"
                            >
                              Clear Selection
                            </button>
                          </div>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {previewData.samples.missingRecords.map((m) => {
                            const checked = selectedMissingIds.includes(m.id);
                            return (
                              <label
                                key={m.id}
                                className="flex items-center gap-2.5 py-1.5 px-2 hover:bg-purple-50/40 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedMissingIds((prev) =>
                                      checked ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                                    )
                                  }
                                />
                                <span className="font-mono font-bold text-slate-700">
                                  {m.medicineCode}
                                </span>
                                <span className="font-bold text-slate-900">
                                  {m.brandName} {m.strength ? `— ${m.strength}` : ''}
                                </span>
                                <span className="text-slate-600">({m.genericName})</span>
                                <span className="text-slate-400 ml-auto">{m.manufacturer}</span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HISTORY, BACKUPS & ROLLBACK */}
      {activeTab === 'history' && (
        <div className="p-5 pt-2 space-y-5">
          {/* Backup Snapshots & Controlled Rollback */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Archive className="w-4 h-4 text-teal-600" />
                  <span>Catalog Backup Snapshots &amp; Controlled Rollback</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Restoring a snapshot rolls back the medicine catalog only — historical prescriptions and saved clinical snapshots remain 100% intact.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={snapshotLabel}
                  onChange={(e) => setSnapshotLabel(e.target.value)}
                  placeholder="Optional backup label..."
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white w-48"
                />
                <button
                  type="button"
                  disabled={creatingSnap}
                  onClick={handleCreateSnapshot}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {creatingSnap ? 'Saving...' : '+ Create Snapshot'}
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-3">Snapshot</th>
                    <th className="py-2 px-3">Label</th>
                    <th className="py-2 px-3">Records</th>
                    <th className="py-2 px-3">Created By &amp; Time</th>
                    <th className="py-2 px-3 text-right">Rollback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        Loading snapshots...
                      </td>
                    </tr>
                  ) : snapshots.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                        No backup snapshots created yet. Snapshots are created manually here or automatically before every CSV commit.
                      </td>
                    </tr>
                  ) : (
                    snapshots.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 px-3 font-mono font-bold text-teal-800">
                          {s.snapshotCode}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{s.label}</td>
                        <td className="py-2 px-3 font-mono tabular-nums">
                          {s.recordCount.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-slate-500">
                          {s.createdByName || 'System'} &bull;{' '}
                          {formatDateTimeDDMMYYYY(s.createdAt)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {confirmRollbackId === s.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-rose-700">
                                Restore catalog?
                              </span>
                              <button
                                type="button"
                                disabled={rollingBackId === s.id}
                                onClick={() => handleRollback(s.id)}
                                className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[11px] cursor-pointer"
                              >
                                {rollingBackId === s.id ? 'Restoring...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRollbackId(null)}
                                className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-[11px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRollbackId(s.id)}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Rollback Catalog</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import Batch History */}
          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 text-sm">Import Batch History</h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3">Batch</th>
                      <th className="py-2 px-3">File &amp; Source</th>
                      <th className="py-2 px-3">Mode</th>
                      <th className="py-2 px-3">Stats</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batches.map((b) => (
                      <tr key={b.id}>
                        <td className="py-2 px-3 font-mono font-bold text-teal-800">
                          {b.batchCode}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-900 max-w-xs truncate">
                            {b.filename}
                          </div>
                          <div className="text-[11px] text-slate-500">{b.sourceLabel}</div>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">{b.importMode}</td>
                        <td className="py-2 px-3 font-mono text-[11px] tabular-nums">
                          +{b.addedCount} / ~{b.updatedCount} / ={b.unchangedCount} · Skip:{' '}
                          {b.skippedCount} · Rej: {b.rejectedCount}
                          {b.missingCount > 0 ? ` · Miss:${b.missingCount}(-${b.deactivatedCount})` : ''}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              b.status === 'rolled_back'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                          {b.uploadedByName || 'Auto-Seed'} &bull;{' '}
                          {formatDateTimeDDMMYYYY(b.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Catalog Audit Log */}
          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 text-sm">Medicine Catalog Audit Logs</h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3 bg-white hover:bg-slate-50 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-teal-800 mr-2">{log.action}</span>
                      <span className="font-semibold text-slate-900">{log.targetName}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {log.userName || log.userRole} &bull;{' '}
                      {formatDateTimeDDMMYYYY(log.createdAt)}
                    </span>
                  </div>
                  {log.details && <div className="text-slate-600">{log.details}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MANUAL ADD / EDIT MEDICINE MODAL */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {editingMed
                  ? `Edit Catalog Medicine (${editingMed.medicineCode})`
                  : 'Add New Medicine to Catalog'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="text-white/70 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMedicine} className="p-5 space-y-3 text-xs">
              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {editingMed && (
                <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-[11px]">
                  Edits update future autocomplete suggestions only. All previously saved prescriptions retain their original prescribed snapshots.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Brand Name *</label>
                  <input
                    type="text"
                    required
                    value={formState.brandName}
                    onChange={(e) => setFormState((s) => ({ ...s, brandName: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                    placeholder="e.g., Napa Extend"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Generic Name *</label>
                  <input
                    type="text"
                    required
                    value={formState.genericName}
                    onChange={(e) => setFormState((s) => ({ ...s, genericName: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                    placeholder="e.g., Paracetamol"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dosage Form *</label>
                  <input
                    type="text"
                    required
                    value={formState.dosageType}
                    onChange={(e) => setFormState((s) => ({ ...s, dosageType: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                    placeholder="e.g., Tablet"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Strength</label>
                  <input
                    type="text"
                    value={formState.strength}
                    onChange={(e) => setFormState((s) => ({ ...s, strength: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                    placeholder="e.g., 665 mg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Manufacturer *</label>
                  <input
                    type="text"
                    required
                    value={formState.manufacturer}
                    onChange={(e) => setFormState((s) => ({ ...s, manufacturer: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                    placeholder="e.g., Beximco Pharmaceuticals Ltd."
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Package Mark</label>
                  <input
                    type="text"
                    value={formState.packageMark}
                    onChange={(e) => setFormState((s) => ({ ...s, packageMark: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                    placeholder="Optional identifier"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.isActive}
                  onChange={(e) => setFormState((s) => ({ ...s, isActive: e.target.checked }))}
                />
                <span className="font-semibold text-slate-800">
                  Active (available in Doctor Prescription Autocomplete)
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingForm}
                  className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingForm ? 'Saving...' : editingMed ? 'Save Changes' : 'Add Medicine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECT MEDICINE DETAILS & PRESCRIPTION USAGE MODAL */}
      {(detailData || loadingDetail) && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl border border-slate-200 shadow-2xl overflow-hidden text-xs">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {detailData
                  ? `${detailData.medicine.brandName} (${detailData.medicine.medicineCode})`
                  : 'Loading Medicine Details...'}
              </h3>
              <button
                type="button"
                onClick={() => setDetailData(null)}
                className="text-white/70 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingDetail ? (
              <div className="p-8 text-center text-slate-400">Loading medicine record...</div>
            ) : (
              detailData && (
                <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <span className="text-slate-500 block">Brand Name</span>
                      <strong className="text-slate-900">{detailData.medicine.brandName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Generic Name</span>
                      <strong className="text-slate-900">{detailData.medicine.genericName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Strength</span>
                      <strong>{detailData.medicine.strength || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Dosage Form</span>
                      <strong>{detailData.medicine.dosageType}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Manufacturer</span>
                      <strong>{detailData.medicine.manufacturer}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Package Mark</span>
                      <strong>{detailData.medicine.packageMark || '—'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Source</span>
                      <strong>{detailData.medicine.source}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Prescription Usage Count</span>
                      <strong className="font-mono text-teal-800">
                        {detailData.prescriptionUsageCount} prescription line(s)
                      </strong>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                    For clinical safety, catalog entries cannot be permanently deleted. Use Deactivate if a product should no longer appear in doctor autocomplete.
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-800 mb-1.5">Recent Audit Trail</h4>
                    {detailData.auditLogs.length === 0 ? (
                      <div className="text-slate-400 italic">No manual changes recorded for this record.</div>
                    ) : (
                      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                        {detailData.auditLogs.map((l) => (
                          <div key={l.id} className="p-2.5 space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-teal-800">{l.action}</span>
                              <span className="text-slate-500">
                                {l.userName || l.userRole} · {formatDateTimeDDMMYYYY(l.createdAt)}
                              </span>
                            </div>
                            <div className="text-slate-700">{l.details}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};
