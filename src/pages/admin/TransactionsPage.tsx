import React, { useState, useEffect, useMemo } from 'react';
import {
  ReceiptText,
  Search,
  Download,
  Calendar,
  Filter,
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Transaction } from '../../types';
import { db } from '../../services/db';
import { Table, Column } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { formatCurrency, formatDate } from '../../lib/utils';
import { exportToExcelFile, exportToCsvFile } from '../../lib/excelExport';
import { useToast } from '../../context/ToastContext';

export const TransactionsPage: React.FC = () => {
  const { success, error } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | 'Bank Transfer' | 'UPI'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  const loadTransactions = () => {
    setTransactions(db.getTransactions());
  };

  useEffect(() => {
    loadTransactions();

    const handleUpdate = () => {
      loadTransactions();
    };

    window.addEventListener('portal_accounts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('portal_accounts_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

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

  const handleExportExcel = () => {
    if (filteredTransactions.length === 0) {
      error('Export Failed', 'No transactions found to export.');
      return;
    }

    const data = filteredTransactions.map((t) => ({
      'Transaction ID': t.id,
      'Client Name': t.client_name,
      'Payment Method': t.method,
      'Destination Account': t.destination_name,
      'Reference / UTR No': t.reference_no,
      'Amount (₹)': t.amount,
      'Status': t.status,
      'Date & Time': formatDate(t.created_at),
      'Raw Timestamp': t.created_at,
    }));

    const ok = exportToExcelFile(data, `transactions_${Date.now()}`, 'Transactions');
    if (ok) {
      success('Export Complete', `Exported ${filteredTransactions.length} transactions to Excel (.xlsx).`);
    } else {
      error('Export Failed', 'Could not generate Excel spreadsheet.');
    }
  };

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      error('Export Failed', 'No transactions found to export.');
      return;
    }

    const headers = [
      'Date & Time',
      'Client Name',
      'Payment Method',
      'Destination Account',
      'Reference / UTR No',
      'Amount',
      'Status',
      'Raw Timestamp',
    ];

    const rows = filteredTransactions.map((t) => [
      formatDate(t.created_at),
      t.client_name,
      t.method,
      t.destination_name,
      t.reference_no,
      t.amount,
      t.status,
      t.created_at,
    ]);

    const ok = exportToCsvFile(headers, rows, `transactions_${Date.now()}`);
    if (ok) {
      success('Export Complete', `Exported ${filteredTransactions.length} transactions to CSV.`);
    } else {
      error('Export Failed', 'Could not generate CSV file.');
    }
  };

  const confirmDeleteTx = async () => {
    if (!deletingTx) return;
    await db.deleteTransaction(deletingTx.id);
    loadTransactions();
    setDeletingTx(null);
    success('Transaction Deleted', 'The payment record has been removed.');
  };

  const confirmClearAll = async () => {
    await db.clearTransactions();
    loadTransactions();
    setIsClearModalOpen(false);
    success('Transactions Cleared', 'All transaction history records have been deleted.');
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
    {
      header: 'Action',
      accessorKey: 'id',
      render: (item) => (
        <button
          type="button"
          onClick={() => setDeletingTx(item)}
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete transaction record"
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
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Transactions & Payment Logs</h2>
          <p className="text-xs text-slate-500 mt-1">
            Settlement records and payment confirmations mapped against company bank and UPI endpoints.
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Export CSV
          </Button>
          {transactions.length > 0 && (
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

      {/* Delete Single Transaction Modal */}
      <Modal
        isOpen={!!deletingTx}
        onClose={() => setDeletingTx(null)}
        title="Delete Payment Record"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700">
              <p className="font-semibold text-red-800">Delete this transaction?</p>
              <p className="mt-1">
                Client: <span className="font-medium text-slate-800">{deletingTx?.client_name}</span>
              </p>
              <p className="mt-0.5">
                Ref / UTR: <span className="font-mono text-slate-800">{deletingTx?.reference_no}</span>
              </p>
              <p className="mt-0.5">
                Amount: <span className="font-bold text-slate-900">{formatCurrency(deletingTx?.amount || 0)}</span>
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingTx(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDeleteTx}>
              Delete Record
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear All Transactions Modal */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title="Clear All Transactions"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700">
              <p className="font-semibold text-red-800">Clear all transaction records?</p>
              <p className="mt-1">
                This will permanently delete all {transactions.length} payment records. This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsClearModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirmClearAll}>
              Yes, Clear All Transactions
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
