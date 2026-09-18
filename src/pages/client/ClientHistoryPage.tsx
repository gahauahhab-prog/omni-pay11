import React, { useState, useEffect } from 'react';
import { Clock, Search, Calendar, Link as LinkIcon } from 'lucide-react';
import { PaymentLink } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { Table, Column } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { formatCurrency, formatDate } from '../../lib/utils';

export const ClientHistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const loadData = () => {
      const allLinks = db.getPaymentLinks();
      if (user?.clientId) {
        const clientLinks = allLinks.filter((l) => l.client_id === user.clientId);
        setLinks(clientLinks);
      } else {
        setLinks(allLinks);
      }
    };

    loadData();
    window.addEventListener('portal_accounts_updated', loadData);
    window.addEventListener('storage', loadData);

    return () => {
      window.removeEventListener('portal_accounts_updated', loadData);
      window.removeEventListener('storage', loadData);
    };
  }, [user]);

  const filteredLinks = links.filter((l) => {
    return (
      (l.remarks && l.remarks.toLowerCase().includes(searchTerm.toLowerCase())) ||
      l.amount.toString().includes(searchTerm) ||
      l.status.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const columns: Column<PaymentLink>[] = [
    {
      header: 'Reference / Remarks',
      render: (item) => (
        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
          <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
          <span>{item.remarks || 'Standard Payment Request'}</span>
        </div>
      ),
    },
    {
      header: 'Amount',
      accessorKey: 'amount',
      sortable: true,
      render: (item) => (
        <span className="font-bold text-xs text-slate-900">{formatCurrency(item.amount)}</span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      render: (item) => {
        if (item.status === 'Paid') return <Badge variant="paid">Paid</Badge>;
        if (item.status === 'Pending Confirmation') {
          return <Badge variant="review">Pending Confirmation</Badge>;
        }
        if (item.status === 'Rejected') return <Badge variant="rejected">Rejected</Badge>;
        if (item.status === 'Expired') return <Badge variant="expired">Expired</Badge>;
        return <Badge variant="pending">Pending Payment</Badge>;
      },
    },
    {
      header: 'Date Requested',
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
      header: 'Actions',
      className: 'text-right',
      render: (item) => (
        <a
          href={`/pay/${item.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
        >
          {item.status === 'Paid' ? 'View Receipt' : 'Open Payment Page'}
        </a>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Payment History & Requests</h2>
        <p className="text-xs text-slate-500 mt-1">
          Review payment link requests and settlement logs issued for your account.
        </p>
      </div>

      <div className="flex bg-white p-4 rounded-xl border border-slate-200">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search by remarks or amount..."
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
        data={filteredLinks}
        columns={columns}
        keyExtractor={(item) => item.id}
        pageSize={8}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        emptyMessage="No payment history records found."
      />
    </div>
  );
};
