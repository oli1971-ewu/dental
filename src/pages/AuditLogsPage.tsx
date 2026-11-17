import React, { useState, useEffect } from 'react';
import { api } from '../services/api.ts';
import { AuditLog } from '../types/index.ts';
import { ShieldAlert, Shield, Clock, User as UserIcon } from 'lucide-react';
import { formatDateTimeDDMMYYYY } from '../utils/dateFormat.ts';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAuditLogs().then(setLogs).finally(() => setLoading(false));
  }, []);

  const getActionBadge = (action: string) => {
    if (action.includes('CREATE') || action.includes('ADD')) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    if (action.includes('UPDATE') || action.includes('RESET') || action.includes('TOGGLE')) {
      return 'bg-blue-50 text-blue-800 border-blue-200';
    }
    if (action.includes('DELETE')) {
      return 'bg-red-50 text-red-800 border-red-200';
    }
    if (action.includes('PAYMENT')) {
      return 'bg-teal-50 text-teal-800 border-teal-200';
    }
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">System Audit Trail</h1>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
            Administrative Access
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Immutable audit records of doctor logins, patient registrations, visit updates, payments, and system changes.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Affected Record</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {formatDateTimeDDMMYYYY(log.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {log.userName || log.username || 'System'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 uppercase">
                        {log.userRole}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{log.affectedRecord}</td>
                    <td className="py-3 px-4 text-slate-500 max-w-sm truncate">{log.details || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No audit logs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
