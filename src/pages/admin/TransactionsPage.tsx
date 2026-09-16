import React, { useState, useMemo } from 'react';
import { ReceiptText, Search, Download, Calendar, Filter } from 'lucide-react';
import { Transaction } from '../../types';
import { db } from '../../services/db';
import { Table, Column } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { formatCurrency, formatDate } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';

export const TransactionsPage: React.FC = () => {
  const { success } = useToast();
  const [transactions] = useState<Transaction[]>(() => db.getTransactions());
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | 'Bank Transfer' | 'UPI'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesSearch =
        tx.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.reference_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.destination_name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesMethod = methodFilter === 'all' ? true : tx.method === methodFilter;
      return matchesSearch && matchesMethod;
    });
  }, [transactions, searchTerm, methodFilter]);

  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Date,Client,Method,Destination,Reference No,Amount,Status']
        .concat(
          filteredTransactions.map(
            (t) =>
              `"${t.created_at}","${t.client_name}","${t.method}","${t.destination_name}","${t.reference_no}",${t.amount},"${t.status}"`
          )
        )
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `transactions_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    success('Export Complete', 'Downloaded transaction statement CSV.');
  };

  const columns: Column<Transaction>[] = [
    {
      header: 'Client & Reference',
      accessorKey: 'client_name',
      sortable: true,
      render: (item) => (
        <div>
          <div className="font-semibold text-slate-900">{item.client_name}</div>
          <div className="font-mono text-[11px] text-slate-500">Ref: {item.reference_no}</div>
        </div>
      ),
    },
    {
      header: 'Payment Method',
      accessorKey: 'method',
      render: (item) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
          {item.method}
        </span>
      ),
    },
    {
      header: 'Destination Account',
      accessorKey: 'destination_name',
      render: (item) => (
        <span className="text-xs text-slate-700 font-medium block max-w-xs truncate">
          {item.destination_name}
        </span>
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
      render: (item) => (
        <Badge variant={item.status === 'Completed' ? 'active' : item.status === 'Pending' ? 'pending' : 'expired'}>
          {item.status}
        </Badge>
      ),
    },
    {
      header: 'Recorded Date',
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Transactions</h2>
          <p className="text-xs text-slate-500 mt-1">
            Settlement records and payment confirmations mapped against company bank and UPI endpoints.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} leftIcon={<Download className="w-3.5 h-3.5" />}>
          Export CSV
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search by client or reference #..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-medium text-slate-500">Method:</span>
          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
            {(['all', 'Bank Transfer', 'UPI'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMethodFilter(m);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-md transition-colors ${
                  methodFilter === m ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Table
        data={filteredTransactions}
        columns={columns}
        keyExtractor={(item) => item.id}
        pageSize={8}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        emptyMessage="No transaction records match the criteria."
      />
    </div>
  );
};
