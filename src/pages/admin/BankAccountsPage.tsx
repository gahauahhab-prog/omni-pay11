import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  AlertTriangle,
} from 'lucide-react';
import { BankAccount } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Table, Column } from '../../components/ui/Table';
import { formatCurrency, formatDate } from '../../lib/utils';

export const BankAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof BankAccount>('priority');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);

  // Form input state
  const [formData, setFormData] = useState<Partial<BankAccount>>({
    bank_name: '',
    account_holder: '',
    account_number: '',
    ifsc_code: '',
    branch: '',
    priority: 1,
    daily_limit: 500000,
    notes: '',
    status: 'active',
  });

  const loadAccounts = async () => {
    setAccounts(db.getBankAccounts());
    try {
      const synced = await db.syncAccountsFromCloud();
      if (synced.banks.length > 0) {
        setAccounts(synced.banks);
      }
    } catch {
      // Local fallback
    }
  };

  useEffect(() => {
    loadAccounts();

    const handleUpdate = () => {
      setAccounts(db.getBankAccounts());
    };

    window.addEventListener('portal_accounts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    const unsubFirestore = db.subscribeToRealtimeUpdates(() => {
      loadAccounts();
    });

    return () => {
      window.removeEventListener('portal_accounts_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
      unsubFirestore();
    };
  }, []);

  const filteredAccounts = useMemo(() => {
    return accounts
      .filter((acc) => {
        const matchesSearch =
          acc.bank_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          acc.account_holder.toLowerCase().includes(searchTerm.toLowerCase()) ||
          acc.account_number.includes(searchTerm) ||
          acc.ifsc_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          acc.branch.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesStatus = statusFilter === 'all' ? true : acc.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
        return sortOrder === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
  }, [accounts, searchTerm, statusFilter, sortKey, sortOrder]);

  const handleSort = (key: keyof BankAccount) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const openAddModal = () => {
    setSelectedAccount(null);
    setFormData({
      bank_name: '',
      account_holder: 'Payment Portal Pvt Ltd',
      account_number: '',
      ifsc_code: '',
      branch: '',
      priority: accounts.length + 1,
      daily_limit: 500000,
      notes: '',
      status: 'active',
    });
    setIsFormOpen(true);
  };

  const openEditModal = (account: BankAccount) => {
    setSelectedAccount(account);
    setFormData({ ...account });
    setIsFormOpen(true);
  };

  const openDetailModal = (account: BankAccount) => {
    setSelectedAccount(account);
    setIsDetailOpen(true);
  };

  const openDeleteModal = (account: BankAccount) => {
    setSelectedAccount(account);
    setIsDeleteOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.bank_name || !formData.account_holder || !formData.account_number || !formData.ifsc_code) {
      error('Missing fields', 'Bank name, holder, account number, and IFSC code are required.');
      return;
    }

    try {
      await db.saveBankAccount(
        formData,
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      success(
        selectedAccount ? 'Bank Account Updated' : 'Bank Account Added',
        `Successfully saved ${formData.bank_name} account.`
      );
      setIsFormOpen(false);
      loadAccounts();
    } catch {
      error('Operation failed', 'Unable to save bank account details.');
    }
  };

  const handleToggleStatus = async (account: BankAccount) => {
    try {
      const updated = await db.toggleBankAccountStatus(
        account.id,
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      if (updated) {
        success('Status Changed', `${updated.bank_name} is now ${updated.status}.`);
        loadAccounts();
      }
    } catch {
      error('Failed to change status');
    }
  };

  const handleDelete = async () => {
    if (!selectedAccount) return;
    try {
      await db.deleteBankAccount(
        selectedAccount.id,
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      success('Account Deleted', `${selectedAccount.bank_name} was removed.`);
      setIsDeleteOpen(false);
      loadAccounts();
    } catch {
      error('Delete Failed', 'Could not delete the bank account.');
    }
  };

  const columns: Column<BankAccount>[] = [
    {
      header: 'Priority',
      accessorKey: 'priority',
      sortable: true,
      className: 'w-20 font-semibold text-slate-900 text-center',
      render: (item) => (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-xs font-bold text-slate-700">
          #{item.priority}
        </span>
      ),
    },
    {
      header: 'Account Holder & Bank',
      accessorKey: 'account_holder',
      sortable: true,
      render: (item) => (
        <div>
          <div className="font-bold text-slate-900 text-sm">
            {item.account_holder}
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 mt-1">
            <Building2 className="w-3 h-3 text-blue-600 shrink-0" />
            <span className="font-semibold">{item.bank_name}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Account Number',
      accessorKey: 'account_number',
      render: (item) => (
        <div className="font-mono text-xs font-semibold text-slate-800">
          {item.account_number}
        </div>
      ),
    },
    {
      header: 'IFSC & Branch',
      accessorKey: 'ifsc_code',
      render: (item) => (
        <div>
          <span className="font-mono text-xs font-medium text-slate-800 uppercase block">
            {item.ifsc_code}
          </span>
          <span className="text-[11px] text-slate-500 truncate block max-w-xs">{item.branch}</span>
        </div>
      ),
    },
    {
      header: 'Daily Limit',
      accessorKey: 'daily_limit',
      sortable: true,
      render: (item) => (
        <span className="font-semibold text-xs text-slate-800">
          {formatCurrency(item.daily_limit)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      render: (item) => (
        <button
          onClick={() => handleToggleStatus(item)}
          className="cursor-pointer group flex items-center gap-1.5 focus:outline-none"
          title="Click to toggle status"
        >
          <Badge variant={item.status === 'active' ? 'active' : 'inactive'}>
            {item.status === 'active' ? 'Active' : 'Inactive'}
          </Badge>
        </button>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right pr-5',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => openDetailModal(item)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => openEditModal(item)}
            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            title="Edit Bank"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => openDeleteModal(item)}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
            title="Delete Bank"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Bank Accounts</h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure settlement bank accounts. Priority controls client display ordering.
          </p>
        </div>
        <Button onClick={openAddModal} leftIcon={<Plus className="w-4 h-4" />}>
          Add Bank Account
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search bank, account #, or IFSC..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-medium text-slate-500">Filter:</span>
          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
            {(['all', 'active', 'inactive'] as const).map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-md capitalize transition-colors ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Data Table */}
      <Table
        data={filteredAccounts}
        columns={columns}
        keyExtractor={(item) => item.id}
        pageSize={8}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onSort={handleSort}
        sortKey={sortKey}
        sortOrder={sortOrder}
        emptyMessage="No bank accounts match your search criteria."
      />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedAccount ? 'Edit Bank Account' : 'Add Bank Account'}
        description="Configure corporate account details. Active accounts are displayed directly to clients."
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Bank Name"
              placeholder="e.g. HDFC Bank"
              value={formData.bank_name || ''}
              onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
              required
            />
            <Input
              label="Account Holder Name"
              placeholder="e.g. Payment Portal Pvt Ltd"
              value={formData.account_holder || ''}
              onChange={(e) => setFormData({ ...formData, account_holder: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Account Number"
              placeholder="e.g. 50200012345678"
              value={formData.account_number || ''}
              onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
              required
            />
            <Input
              label="IFSC Code"
              placeholder="e.g. HDFC0001234"
              value={formData.ifsc_code || ''}
              onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value.toUpperCase() })}
              required
            />
          </div>

          <Input
            label="Branch Name / Location"
            placeholder="e.g. Nariman Point, Mumbai"
            value={formData.branch || ''}
            onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Priority (Order #)"
              type="number"
              min={1}
              value={formData.priority || 1}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
              helperText="Lower numbers appear first on client screen"
            />
            <Input
              label="Daily Limit (₹)"
              type="number"
              min={0}
              step={10000}
              value={formData.daily_limit || 500000}
              onChange={(e) => setFormData({ ...formData, daily_limit: parseInt(e.target.value) || 0 })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="active"
                  checked={formData.status === 'active'}
                  onChange={() => setFormData({ ...formData, status: 'active' })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Active (Visible to Clients)</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="inactive"
                  checked={formData.status === 'inactive'}
                  onChange={() => setFormData({ ...formData, status: 'inactive' })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Inactive (Hidden)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Internal Notes</label>
            <textarea
              rows={3}
              className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
              placeholder="e.g. Primary settlement account for vendor RTGS..."
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {selectedAccount ? 'Save Changes' : 'Create Bank Account'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* View Details Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Bank Account Overview"
        description="Complete parameters and client visibility state"
        maxWidth="md"
      >
        {selectedAccount && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl space-y-2.5 border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Bank Name</span>
                <span className="font-semibold text-slate-900">{selectedAccount.bank_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Account Holder</span>
                <span className="font-semibold text-slate-900">{selectedAccount.account_holder}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Account Number</span>
                <span className="font-mono font-semibold text-slate-900">{selectedAccount.account_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">IFSC Code</span>
                <span className="font-mono font-semibold text-slate-900 uppercase">{selectedAccount.ifsc_code}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Branch</span>
                <span className="text-slate-900">{selectedAccount.branch || 'Main Branch'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Priority Order</span>
                <span className="font-semibold text-slate-900">Rank #{selectedAccount.priority}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Daily Limit</span>
                <span className="font-semibold text-slate-900">{formatCurrency(selectedAccount.daily_limit)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <Badge variant={selectedAccount.status === 'active' ? 'active' : 'inactive'}>
                  {selectedAccount.status === 'active' ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {selectedAccount.notes && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-500 block mb-1">Notes:</span>
                  <p className="text-slate-700 italic bg-white p-2 rounded-lg border border-slate-200">
                    {selectedAccount.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Confirm Account Deletion"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 text-xs text-slate-600">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p>
              Are you sure you want to permanently delete the bank account{' '}
              <strong className="text-slate-900">
                {selectedAccount?.bank_name} ({selectedAccount?.account_number})
              </strong>
              ? This action cannot be reversed.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete Account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
