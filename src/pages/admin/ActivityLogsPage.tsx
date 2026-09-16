import React, { useState, useEffect, useMemo } from 'react';
import { History, Search, Calendar, UserCheck } from 'lucide-react';
import { ActivityLog } from '../../types';
import { db } from '../../services/db';
import { Table, Column } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { formatDate } from '../../lib/utils';

export const ActivityLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setLogs(db.getActivityLogs());
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
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Audit & Activity Logs</h2>
        <p className="text-xs text-slate-500 mt-1">
          Immutable audit trail capturing administrative modifications, credential updates, and client logins.
        </p>
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
    </div>
  );
};
