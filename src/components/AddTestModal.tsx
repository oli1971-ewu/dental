import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import { X, Radio, CheckCircle2, AlertCircle } from 'lucide-react';

interface AddTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: (test: any) => void;
  visitId: number;
  visitCode: string;
}

const PRESET_TESTS = [
  { name: 'Intraoral Periapical Radiograph (IOPA)', category: 'IOPA', cost: '' },
  { name: 'Orthopantomogram (OPG - Full Panoramic)', category: 'OPG', cost: '' },
  { name: 'Cone Beam CT (CBCT - Single Jaw)', category: 'CBCT', cost: '' },
  { name: 'Bite-wing Radiograph (Left/Right)', category: 'Dental X-ray', cost: '' },
  { name: 'Random Blood Sugar (RBS) Test', category: 'Other', cost: '' },
];

export const AddTestModal: React.FC<AddTestModalProps> = ({
  isOpen,
  onClose,
  onAdded,
  visitId,
  visitCode,
}) => {
  const [testName, setTestName] = useState('');
  const [category, setCategory] = useState<'Dental X-ray' | 'OPG' | 'IOPA' | 'CBCT' | 'Other'>('Dental X-ray');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [status, setStatus] = useState('Completed');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTestName('');
      setCategory('Dental X-ray');
      setDescription('');
      setCost('');
      setStatus('Completed');
      setNotes('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen, visitId]);

  if (!isOpen) return null;

  const handleSelectPreset = (item: { name: string; category: string; cost?: string | number }) => {
    setTestName(item.name);
    setCategory(item.category as any);
    setCost(item.cost ? String(item.cost) : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testName.trim()) {
      setError('Test name is required.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.addDiagnosticTest(visitId, {
        testName: testName.trim(),
        category,
        description: description.trim() || undefined,
        cost: cost.trim() ? cost.trim() : '0',
        status,
        notes: notes.trim() || undefined,
      });
      onAdded(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add test');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              Add Diagnostic Test / X-ray ({visitCode})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Presets */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Select or Enter Diagnostic Investigation:
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESET_TESTS.map((pt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(pt)}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-cyan-50 hover:text-cyan-700 hover:border-cyan-300 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  + {pt.name}
                </button>
              ))}
            </div>
            <input
              type="text"
              required
              placeholder="e.g. OPG or Periapical Radiograph #46"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:ring-2 focus:ring-cyan-500"
              >
                <option value="Dental X-ray">Dental X-ray</option>
                <option value="OPG">OPG</option>
                <option value="IOPA">IOPA</option>
                <option value="CBCT">CBCT</option>
                <option value="Other">Other Diagnostic</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Custom Rate (৳ Opt.)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Custom ৳ (Opt.)"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-bold text-slate-900 focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Findings / Radiographic Description
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Horizontal bone loss around #46, periapical radiolucency observed..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="Completed">Completed</option>
                <option value="Pending">Pending / Awaiting Film</option>
                <option value="Requested">Requested</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Additional Notes
              </label>
              <input
                type="text"
                placeholder="Digital film stored in clinic archive"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{loading ? 'Adding...' : 'Add Test Record'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
