import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Search,
  Calendar,
  UserCheck,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
  Globe,
} from 'lucide-react';
import { ActivityLog } from '../../types';
import { db } from '../../services/db';
import { Table, Column } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { formatDate } from '../../lib/utils';
import { exportToExcelFile } from '../../lib/excelExport';
import { useToast } from '../../context/ToastContext';

export const ActivityLogsPage: React.FC = () => {
  const { success, error } = useToast();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingLog, setDeletingLog] = useState<ActivityLog | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  const loadLogs = () => {
    setLogs(db.getActivityLogs());
  };

  useEffect(() => {
    loadLogs();

    const handleUpdate = () => {
      loadLogs();
    };

    window.addEventListener('portal_accounts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('portal_accounts_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      return (
        l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.user_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [logs, searchTerm]);

  const handleExportExcel = () => {
    if (filteredLogs.length === 0) {
      error('Export Failed', 'No activity logs match the criteria to export.');
      return;
    }

    const data = filteredLogs.map((log) => ({
      'Action Taken': log.action,
      'User / Actor': log.user_name,
      'User Role': log.user_role || 'Admin',
      'Activity Details': log.details,
      'IP Address': log.ip_address || 'N/A',
      'Date & Time': formatDate(log.created_at),
      'Raw Timestamp': log.created_at,
    }));

    const ok = exportToExcelFile(data, `activity_logs_${Date.now()}`, 'Activity Logs');
    if (ok) {
      success('Export Complete', `Exported ${filteredLogs.length} logs to Excel (.xlsx).`);
    } else {
      error('Export Failed', 'Could not generate Excel spreadsheet.');
    }
  };

  const confirmDeleteLog = async () => {
    if (!deletingLog) return;
    await db.deleteActivityLog(deletingLog.id);
    loadLogs();
    setDeletingLog(null);
    success('Log Deleted', 'The activity log record has been removed.');
  };

  const confirmClearAll = async () => {
    await db.clearActivityLogs();
    loadLogs();
    setIsClearModalOpen(false);
    success('Logs Cleared', 'All activity audit logs have been deleted.');
  };

  const columns: Column<ActivityLog>[] = [
    {
      header: 'Action Taken',
      accessorKey: 'action',
      sortable: true,
      render: (item) => {
        let variant: 'blue' | 'purple' | 'slate' | 'active' = 'blue';
        if (item.action.includes('Bank')) variant = 'blue';
        if (item.action.includes('UPI')) variant = 'purple';
        if (item.action.includes('Client')) variant = 'active';
        return <Badge variant={variant}>{item.action}</Badge>;
      },
    },
    {
      header: 'User / Actor',
      accessorKey: 'user_name',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-800 font-semibold">
          <UserCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>{item.user_name}</span>
          {item.user_role && (
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-normal">
              ({item.user_role})
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Activity Details',
      accessorKey: 'details',
      render: (item) => (
        <span className="text-xs text-slate-700 font-medium">{item.details}</span>
      ),
    },
    {
      header: 'IP Address',
      accessorKey: 'ip_address',
      render: (item) => (
        item.ip_address ? (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
            <Globe className="w-3 h-3 text-blue-500" />
            {item.ip_address}
          </span>
        ) : (
          <span className="text-slate-400 text-xs">-</span>
        )
      ),
    },
    {
      header: 'Timestamp',
      accessorKey: 'created_at',
      sortable: true,
      render: (item) => (
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>{formatDate(item.created_at)}</span>
        </div>
      ),
    },
    {
      header: 'Action',
      accessorKey: 'id',
      render: (item) => (
        <button
          type="button"
          onClick={() => setDeletingLog(item)}
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete log record"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Audit & Activity Logs</h2>
          <p className="text-xs text-slate-500 mt-1">
            System audit trail capturing administrative modifications, credential updates, and client logins.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
          >
            Export Excel
          </Button>
          {logs.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClearModalOpen(true)}
              className="text-red-600 hover:bg-red-50 border-red-200"
              leftIcon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      <div className="flex bg-white p-4 rounded-xl border border-slate-200">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search action, user, or details..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
      </div>

      <Table
        data={filteredLogs}
        columns={columns}
        keyExtractor={(item) => item.id}
        pageSize={10}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        emptyMessage="No activity logs found."
      />

      {/* Delete Single Log Modal */}
      <Modal
        isOpen={!!deletingLog}
        onClose={() => setDeletingLog(null)}
        title="Delete Activity Log"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700">
              <p className="font-semibold text-red-800">Are you sure you want to delete this log?</p>
              <p className="mt-1">
                Action: <span className="font-medium text-slate-800">{deletingLog?.action}</span>
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">{deletingLog?.details}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingLog(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDeleteLog}>
              Delete Log
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear All Logs Modal */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title="Clear All Activity Logs"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700">
              <p className="font-semibold text-red-800">Clear all activity audit logs?</p>
              <p className="mt-1">
                This will permanently delete all {logs.length} activity records. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsClearModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirmClearAll}>
              Yes, Clear All Logs
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
