import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import { X, Stethoscope, CheckCircle2, AlertCircle } from 'lucide-react';

interface AddTreatmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: (treatment: any) => void;
  visitId: number;
  visitCode: string;
}

const PRESET_TREATMENTS = [
  { name: 'Dental Examination & Consultation', cost: 500 },
  { name: 'Composite Dental Filling', cost: 1500 },
  { name: 'Root Canal Treatment (RCT - Molar)', cost: 5000 },
  { name: 'Root Canal Treatment (RCT - Anterior)', cost: 3500 },
  { name: 'Tooth Extraction (Simple)', cost: 1200 },
  { name: 'Surgical Disimpaction (Wisdom Tooth)', cost: 6000 },
  { name: 'Ultrasonic Scaling & Polishing', cost: 2000 },
  { name: 'Porcelain Fused to Metal (PFM) Crown', cost: 4500 },
  { name: 'All-Ceramic Zirconia Crown', cost: 8500 },
  { name: 'Dental Implant (Titanium Fixture)', cost: 45000 },
];

export const AddTreatmentModal: React.FC<AddTreatmentModalProps> = ({
  isOpen,
  onClose,
  onAdded,
  visitId,
  visitCode,
}) => {
  const [treatmentName, setTreatmentName] = useState('');
  const [description, setDescription] = useState('');
  const [toothNumber, setToothNumber] = useState('');
  const [cost, setCost] = useState('0');
  const [status, setStatus] = useState('Completed');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTreatmentName('');
      setDescription('');
      setToothNumber('');
      setCost('0');
      setStatus('Completed');
      setNotes('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen, visitId]);

  if (!isOpen) return null;

  const handleSelectPreset = (item: { name: string; cost: number }) => {
    setTreatmentName(item.name);
    setCost(item.cost.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!treatmentName.trim()) {
      setError('Treatment name is required.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.addTreatment(visitId, {
        treatmentName: treatmentName.trim(),
        description: description.trim() || undefined,
        toothNumber: toothNumber.trim() || undefined,
        cost,
        status,
        notes: notes.trim() || undefined,
      });
      onAdded(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add treatment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-teal-600" />
            <h3 className="font-bold text-slate-900 text-sm">
              Add Treatment to Visit ({visitCode})
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
              Select or Enter Treatment:
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto">
              {PRESET_TREATMENTS.map((pt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(pt)}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  {pt.name} (৳{pt.cost})
                </button>
              ))}
            </div>
            <input
              type="text"
              required
              placeholder="e.g. Composite Restoration (Class II)"
              value={treatmentName}
              onChange={(e) => setTreatmentName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tooth Number (FDI or Palmer)
              </label>
              <input
                type="text"
                placeholder="e.g. 36 or 11"
                value={toothNumber}
                onChange={(e) => setToothNumber(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Treatment Cost (৳ BDT) *
              </label>
              <input
                type="number"
                min="0"
                required
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-bold text-slate-900 focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Description / Procedure Details
            </label>
            <textarea
              rows={2}
              placeholder="Details of materials used, etch, bond, composite shade..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
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
                <option value="Ongoing">Ongoing / In-progress</option>
                <option value="Planned">Planned</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Clinical Notes
              </label>
              <input
                type="text"
                placeholder="Optional notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500"
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
              className="px-4 py-1.5 text-white bg-teal-600 hover:bg-teal-700 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{loading ? 'Adding...' : 'Add Treatment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
