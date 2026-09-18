import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2,
  QrCode,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  CreditCard,
  ExternalLink,
} from 'lucide-react';
import { BankAccount, UpiAccount } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Table, Column } from '../../components/ui/Table';
import { QRCodeDisplay } from '../../components/QRCodeDisplay';
import { formatCurrency, formatDate } from '../../lib/utils';

interface BankAndUpiPageProps {
  defaultTab?: 'banks' | 'upis';
}

export const BankAndUpiPage: React.FC<BankAndUpiPageProps> = ({ defaultTab = 'banks' }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'banks' | 'upis') || defaultTab;
  const [activeTab, setActiveTab] = useState<'banks' | 'upis'>(initialTab);

  const { user } = useAuth();
  const { success, error } = useToast();

  // Keep state synced with query params
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'banks' || tabParam === 'upis') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const switchTab = (tab: 'banks' | 'upis') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // ----------------------------------------------------
  // BANK ACCOUNTS STATE & LOGIC
  // ----------------------------------------------------
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankSearch, setBankSearch] = useState('');
  const [bankStatusFilter, setBankStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [bankPage, setBankPage] = useState(1);
  const [bankSortKey, setBankSortKey] = useState<keyof BankAccount>('priority');
  const [bankSortOrder, setBankSortOrder] = useState<'asc' | 'desc'>('asc');

  // Bank Modals
  const [isBankFormOpen, setIsBankFormOpen] = useState(false);
  const [isBankDetailOpen, setIsBankDetailOpen] = useState(false);
  const [isBankDeleteOpen, setIsBankDeleteOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState<BankAccount | null>(null);

  const [bankFormData, setBankFormData] = useState<Partial<BankAccount>>({
    bank_name: '',
    account_holder: 'Payment Portal Pvt Ltd',
    account_number: '',
    ifsc_code: '',
    branch: '',
    priority: 1,
    daily_limit: 500000,
    notes: '',
    status: 'active',
  });

  // ----------------------------------------------------
  // UPI ACCOUNTS STATE & LOGIC
  // ----------------------------------------------------
  const [upiAccounts, setUpiAccounts] = useState<UpiAccount[]>([]);
  const [upiSearch, setUpiSearch] = useState('');
  const [upiStatusFilter, setUpiStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [upiPage, setUpiPage] = useState(1);
  const [upiSortKey, setUpiSortKey] = useState<keyof UpiAccount>('priority');
  const [upiSortOrder, setUpiSortOrder] = useState<'asc' | 'desc'>('asc');

  // UPI Modals
  const [isUpiFormOpen, setIsUpiFormOpen] = useState(false);
  const [isUpiPreviewOpen, setIsUpiPreviewOpen] = useState(false);
  const [isUpiDeleteOpen, setIsUpiDeleteOpen] = useState(false);
  const [selectedUpi, setSelectedUpi] = useState<UpiAccount | null>(null);

  const [upiFormData, setUpiFormData] = useState<Partial<UpiAccount>>({
    upi_id: '',
    upi_app: 'Google Pay',
    qr_url: '',
    priority: 1,
    daily_limit: 100000,
    notes: '',
    status: 'active',
  });

  // ----------------------------------------------------
  // DATA LOADING & SYNCHRONIZATION
  // ----------------------------------------------------
  const loadAllData = async () => {
    setBankAccounts(db.getBankAccounts());
    setUpiAccounts(db.getUpiAccounts());

    try {
      const synced = await db.syncAccountsFromCloud();
      if (synced.banks.length > 0) setBankAccounts(synced.banks);
      if (synced.upis.length > 0) setUpiAccounts(synced.upis);
    } catch {
      // Local fallback
    }
  };

  useEffect(() => {
    loadAllData();

    const handleUpdate = () => {
      setBankAccounts(db.getBankAccounts());
      setUpiAccounts(db.getUpiAccounts());
    };

    window.addEventListener('portal_accounts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    const unsubFirestore = db.subscribeToRealtimeUpdates(() => {
      loadAllData();
    });

    return () => {
      window.removeEventListener('portal_accounts_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
      unsubFirestore();
    };
  }, []);

  // ----------------------------------------------------
  // BANK HANDLERS
  // ----------------------------------------------------
  const filteredBanks = useMemo(() => {
    return bankAccounts
      .filter((acc) => {
        const matchesSearch =
          acc.bank_name.toLowerCase().includes(bankSearch.toLowerCase()) ||
          acc.account_holder.toLowerCase().includes(bankSearch.toLowerCase()) ||
          acc.account_number.includes(bankSearch) ||
          acc.ifsc_code.toLowerCase().includes(bankSearch.toLowerCase()) ||
          acc.branch.toLowerCase().includes(bankSearch.toLowerCase());

        const matchesStatus = bankStatusFilter === 'all' ? true : acc.status === bankStatusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const valA = a[bankSortKey];
        const valB = b[bankSortKey];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return bankSortOrder === 'asc' ? valA - valB : valB - valA;
        }
        return bankSortOrder === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
  }, [bankAccounts, bankSearch, bankStatusFilter, bankSortKey, bankSortOrder]);

  const handleBankSort = (key: keyof BankAccount) => {
    if (bankSortKey === key) {
      setBankSortOrder(bankSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setBankSortKey(key);
      setBankSortOrder('asc');
    }
  };

  const openAddBankModal = () => {
    setSelectedBank(null);
    setBankFormData({
      bank_name: '',
      account_holder: 'Payment Portal Pvt Ltd',
      account_number: '',
      ifsc_code: '',
      branch: '',
      priority: bankAccounts.length + 1,
      daily_limit: 500000,
      notes: '',
      status: 'active',
    });
    setIsBankFormOpen(true);
  };

  const openEditBankModal = (account: BankAccount) => {
    setSelectedBank(account);
    setBankFormData({ ...account });
    setIsBankFormOpen(true);
  };

  const openDetailBankModal = (account: BankAccount) => {
    setSelectedBank(account);
    setIsBankDetailOpen(true);
  };

  const openDeleteBankModal = (account: BankAccount) => {
    setSelectedBank(account);
    setIsBankDeleteOpen(true);
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !bankFormData.bank_name ||
      !bankFormData.account_holder ||
      !bankFormData.account_number ||
      !bankFormData.ifsc_code
    ) {
      error('Missing fields', 'Bank name, holder, account number, and IFSC code are required.');
      return;
    }

    try {
      await db.saveBankAccount(bankFormData, user?.full_name || 'Admin', user?.id || 'admin');
      success(
        selectedBank ? 'Bank Account Updated' : 'Bank Account Added',
        `Successfully saved ${bankFormData.bank_name} account.`
      );
      setIsBankFormOpen(false);
      loadAllData();
    } catch {
      error('Operation failed', 'Unable to save bank account details.');
    }
  };

  const handleToggleBankStatus = async (account: BankAccount) => {
    try {
      const updated = await db.toggleBankAccountStatus(
        account.id,
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      if (updated) {
        success('Status Changed', `${updated.bank_name} is now ${updated.status}.`);
        loadAllData();
      }
    } catch {
      error('Failed to change status');
    }
  };

  const handleDeleteBank = async () => {
    if (!selectedBank) return;
    try {
      await db.deleteBankAccount(selectedBank.id, user?.full_name || 'Admin', user?.id || 'admin');
      success('Account Deleted', `${selectedBank.bank_name} was removed.`);
      setIsBankDeleteOpen(false);
      loadAllData();
    } catch {
      error('Delete Failed', 'Could not delete the bank account.');
    }
  };

  // ----------------------------------------------------
  // UPI HANDLERS
  // ----------------------------------------------------
  const filteredUpis = useMemo(() => {
    return upiAccounts
      .filter((acc) => {
        const matchesSearch =
          acc.upi_id.toLowerCase().includes(upiSearch.toLowerCase()) ||
          acc.upi_app.toLowerCase().includes(upiSearch.toLowerCase()) ||
          (acc.notes && acc.notes.toLowerCase().includes(upiSearch.toLowerCase()));

        const matchesStatus = upiStatusFilter === 'all' ? true : acc.status === upiStatusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const valA = a[upiSortKey];
        const valB = b[upiSortKey];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return upiSortOrder === 'asc' ? valA - valB : valB - valA;
        }
        return upiSortOrder === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
  }, [upiAccounts, upiSearch, upiStatusFilter, upiSortKey, upiSortOrder]);

  const handleUpiSort = (key: keyof UpiAccount) => {
    if (upiSortKey === key) {
      setUpiSortOrder(upiSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setUpiSortKey(key);
      setUpiSortOrder('asc');
    }
  };

  const openAddUpiModal = () => {
    setSelectedUpi(null);
    setUpiFormData({
      upi_id: '',
      upi_app: 'Google Pay',
      qr_url: '',
      priority: upiAccounts.length + 1,
      daily_limit: 100000,
      notes: '',
      status: 'active',
    });
    setIsUpiFormOpen(true);
  };

  const openEditUpiModal = (account: UpiAccount) => {
    setSelectedUpi(account);
    setUpiFormData({ ...account });
    setIsUpiFormOpen(true);
  };

  const openPreviewUpiModal = (account: UpiAccount) => {
    setSelectedUpi(account);
    setIsUpiPreviewOpen(true);
  };

  const openDeleteUpiModal = (account: UpiAccount) => {
    setSelectedUpi(account);
    setIsUpiDeleteOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error('Invalid File', 'Please upload a valid image (PNG or JPG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUpiFormData((prev) => ({
        ...prev,
        qr_url: reader.result as string,
      }));
      success('Image Uploaded', 'Custom QR code image loaded.');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUpi = (upiFormData.upi_id || '').trim();
    if (!cleanUpi) {
      error('Missing Field', 'Please specify a valid UPI ID (e.g. handle@bank).');
      return;
    }

    if (!cleanUpi.includes('@')) {
      error('Invalid UPI ID Format', 'UPI ID must contain "@" (e.g. username@bank or mobile@upi).');
      return;
    }

    try {
      await db.saveUpiAccount(
        {
          ...upiFormData,
          upi_id: cleanUpi,
        },
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      success(
        selectedUpi ? 'UPI ID Updated' : 'UPI ID Created',
        `Configured ${cleanUpi} successfully.`
      );
      setIsUpiFormOpen(false);
      loadAllData();
    } catch {
      error('Error', 'Unable to save UPI configuration.');
    }
  };

  const handleToggleUpiStatus = async (account: UpiAccount) => {
    try {
      const updated = await db.toggleUpiAccountStatus(
        account.id,
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      if (updated) {
        success('Status Changed', `${updated.upi_id} is now ${updated.status}.`);
        loadAllData();
      }
    } catch {
      error('Failed to change status');
    }
  };

  const handleDeleteUpi = async () => {
    if (!selectedUpi) return;
    try {
      await db.deleteUpiAccount(selectedUpi.id, user?.full_name || 'Admin', user?.id || 'admin');
      success('Deleted', `UPI ID ${selectedUpi.upi_id} was removed.`);
      setIsUpiDeleteOpen(false);
      loadAllData();
    } catch {
      error('Delete Failed', 'Could not remove UPI ID.');
    }
  };

  // ----------------------------------------------------
  // TABLE COLUMNS DEFINITIONS
  // ----------------------------------------------------
  const bankColumns: Column<BankAccount>[] = [
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
          <div className="font-bold text-slate-900 text-sm">{item.account_holder}</div>
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
        <div className="font-mono text-xs font-semibold text-slate-800">{item.account_number}</div>
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
          onClick={() => handleToggleBankStatus(item)}
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
            onClick={() => openDetailBankModal(item)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => openEditBankModal(item)}
            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            title="Edit Bank"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => openDeleteBankModal(item)}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
            title="Delete Bank"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const upiColumns: Column<UpiAccount>[] = [
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
      header: 'UPI ID & Handle',
      accessorKey: 'upi_id',
      sortable: true,
      render: (item) => (
        <div>
          <span className="font-mono text-xs font-bold text-slate-900 block">{item.upi_id}</span>
          <span className="text-xs text-slate-500 mt-0.5">{item.notes || 'Direct UPI'}</span>
        </div>
      ),
    },
    {
      header: 'Preferred App',
      accessorKey: 'upi_app',
      render: (item) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
          {item.upi_app}
        </span>
      ),
    },
    {
      header: 'QR Code',
      className: 'text-center w-24',
      render: (item) => (
        <button
          onClick={() => openPreviewUpiModal(item)}
          className="group relative inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer"
          title="Click to preview QR code"
        >
          <QRCodeDisplay
            upiId={item.upi_id}
            payeeName="Portal Settlement"
            size={36}
            qrUrl={item.qr_url}
            showActions={false}
          />
          <div className="absolute inset-0 bg-slate-900/10 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Eye className="w-3.5 h-3.5 text-blue-700" />
          </div>
        </button>
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
          onClick={() => handleToggleUpiStatus(item)}
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
            onClick={() => openPreviewUpiModal(item)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            title="Preview QR Code"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => openEditUpiModal(item)}
            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            title="Edit UPI"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => openDeleteUpiModal(item)}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
            title="Delete UPI"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  // Quick summary counts
  const activeBanksCount = bankAccounts.filter((b) => b.status === 'active').length;
  const activeUpisCount = upiAccounts.filter((u) => u.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            Bank & UPI Accounts
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage corporate settlement bank accounts and UPI IDs in one centralized view.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {activeTab === 'banks' ? (
            <Button onClick={openAddBankModal} leftIcon={<Plus className="w-4 h-4" />}>
              Add Bank Account
            </Button>
          ) : (
            <Button onClick={openAddUpiModal} leftIcon={<Plus className="w-4 h-4" />}>
              Add UPI ID
            </Button>
          )}
        </div>
      </div>

      {/* Tab Navigation Pill Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            id="tab-btn-banks"
            onClick={() => switchTab('banks')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'banks'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Bank Accounts</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'banks' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {bankAccounts.length}
            </span>
          </button>

          <button
            id="tab-btn-upis"
            onClick={() => switchTab('upis')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'upis'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>UPI IDs & QR</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'upis' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {upiAccounts.length}
            </span>
          </button>
        </div>

        {/* Quick Active Indicators */}
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              <strong className="text-slate-700">{activeBanksCount}</strong> Active Banks
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
            <span>
              <strong className="text-slate-700">{activeUpisCount}</strong> Active UPIs
            </span>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* TAB 1: BANK ACCOUNTS */}
      {/* ==================================================== */}
      {activeTab === 'banks' && (
        <div className="space-y-4">
          {/* Search & Status Filter */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            <div className="w-full sm:w-80">
              <Input
                placeholder="Search bank, account #, or IFSC..."
                value={bankSearch}
                onChange={(e) => {
                  setBankSearch(e.target.value);
                  setBankPage(1);
                }}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs font-medium text-slate-500">Status:</span>
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
                {(['all', 'active', 'inactive'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setBankStatusFilter(st);
                      setBankPage(1);
                    }}
                    className={`px-3 py-1 rounded-md capitalize transition-colors ${
                      bankStatusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <Table
            data={filteredBanks}
            columns={bankColumns}
            keyExtractor={(item) => item.id}
            pageSize={8}
            currentPage={bankPage}
            onPageChange={setBankPage}
            onSort={handleBankSort}
            sortKey={bankSortKey}
            sortOrder={bankSortOrder}
            emptyMessage="No bank accounts match your search criteria."
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: UPI ACCOUNTS */}
      {/* ==================================================== */}
      {activeTab === 'upis' && (
        <div className="space-y-4">
          {/* Search & Status Filter */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            <div className="w-full sm:w-80">
              <Input
                placeholder="Search UPI ID or app..."
                value={upiSearch}
                onChange={(e) => {
                  setUpiSearch(e.target.value);
                  setUpiPage(1);
                }}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs font-medium text-slate-500">Status:</span>
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
                {(['all', 'active', 'inactive'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setUpiStatusFilter(st);
                      setUpiPage(1);
                    }}
                    className={`px-3 py-1 rounded-md capitalize transition-colors ${
                      upiStatusFilter === st
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <Table
            data={filteredUpis}
            columns={upiColumns}
            keyExtractor={(item) => item.id}
            pageSize={8}
            currentPage={upiPage}
            onPageChange={setUpiPage}
            onSort={handleUpiSort}
            sortKey={upiSortKey}
            sortOrder={upiSortOrder}
            emptyMessage="No UPI IDs match your search criteria."
          />
        </div>
      )}

      {/* ==================================================== */}
      {/* BANK MODALS */}
      {/* ==================================================== */}
      {/* Add/Edit Bank Modal */}
      <Modal
        isOpen={isBankFormOpen}
        onClose={() => setIsBankFormOpen(false)}
        title={selectedBank ? 'Edit Bank Account' : 'Add Bank Account'}
        description="Configure corporate account details. Active accounts are displayed directly to clients."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveBank} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Bank Name"
              placeholder="e.g. HDFC Bank"
              value={bankFormData.bank_name || ''}
              onChange={(e) => setBankFormData({ ...bankFormData, bank_name: e.target.value })}
              required
            />
            <Input
              label="Account Holder Name"
              placeholder="e.g. Payment Portal Pvt Ltd"
              value={bankFormData.account_holder || ''}
              onChange={(e) => setBankFormData({ ...bankFormData, account_holder: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Account Number"
              placeholder="e.g. 50200012345678"
              value={bankFormData.account_number || ''}
              onChange={(e) => setBankFormData({ ...bankFormData, account_number: e.target.value })}
              required
            />
            <Input
              label="IFSC Code"
              placeholder="e.g. HDFC0001234"
              value={bankFormData.ifsc_code || ''}
              onChange={(e) =>
                setBankFormData({ ...bankFormData, ifsc_code: e.target.value.toUpperCase() })
              }
              required
            />
          </div>

          <Input
            label="Branch Name / Location"
            placeholder="e.g. Nariman Point, Mumbai"
            value={bankFormData.branch || ''}
            onChange={(e) => setBankFormData({ ...bankFormData, branch: e.target.value })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Priority (Order #)"
              type="number"
              min={1}
              value={bankFormData.priority || 1}
              onChange={(e) =>
                setBankFormData({ ...bankFormData, priority: parseInt(e.target.value) || 1 })
              }
              helperText="Lower numbers appear first on client screen"
            />
            <Input
              label="Daily Limit (₹)"
              type="number"
              min={0}
              step={10000}
              value={bankFormData.daily_limit || 500000}
              onChange={(e) =>
                setBankFormData({ ...bankFormData, daily_limit: parseInt(e.target.value) || 0 })
              }
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="bank_status"
                  value="active"
                  checked={bankFormData.status === 'active'}
                  onChange={() => setBankFormData({ ...bankFormData, status: 'active' })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                Active (Visible to Clients)
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="bank_status"
                  value="inactive"
                  checked={bankFormData.status === 'inactive'}
                  onChange={() => setBankFormData({ ...bankFormData, status: 'inactive' })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                Inactive (Hidden)
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Internal Notes</label>
            <textarea
              className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              rows={2}
              placeholder="Settlement notes or internal comments..."
              value={bankFormData.notes || ''}
              onChange={(e) => setBankFormData({ ...bankFormData, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsBankFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {selectedBank ? 'Update Bank Account' : 'Save Bank Account'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bank Details Modal */}
      <Modal
        isOpen={isBankDetailOpen}
        onClose={() => setIsBankDetailOpen(false)}
        title="Bank Account Information"
        description="Comprehensive configuration and audit details."
        maxWidth="md"
      >
        {selectedBank && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs text-slate-500">Bank Name</span>
                  <p className="font-bold text-slate-900 text-sm">{selectedBank.bank_name}</p>
                </div>
                <Badge variant={selectedBank.status === 'active' ? 'active' : 'inactive'}>
                  {selectedBank.status.toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Account Holder</span>
                  <span className="font-medium text-slate-800">{selectedBank.account_holder}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Account Number</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedBank.account_number}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">IFSC Code</span>
                  <span className="font-mono font-medium text-slate-800">
                    {selectedBank.ifsc_code}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Branch</span>
                  <span className="font-medium text-slate-800">{selectedBank.branch || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Priority Rank</span>
                  <span className="font-bold text-slate-800">#{selectedBank.priority}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Daily Limit</span>
                  <span className="font-medium text-slate-800">
                    {formatCurrency(selectedBank.daily_limit)}
                  </span>
                </div>
              </div>

              {selectedBank.notes && (
                <div className="pt-2 border-t border-slate-200 text-xs">
                  <span className="text-slate-500 block mb-0.5">Notes</span>
                  <p className="text-slate-700 bg-white p-2 rounded border border-slate-200">
                    {selectedBank.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-400 space-y-0.5 px-1">
              <p>Created: {formatDate(selectedBank.created_at)}</p>
              <p>Last modified: {formatDate(selectedBank.updated_at)}</p>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setIsBankDetailOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Bank Modal */}
      <Modal
        isOpen={isBankDeleteOpen}
        onClose={() => setIsBankDeleteOpen(false)}
        title="Delete Bank Account"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-rose-600 bg-rose-50 p-3 rounded-lg border border-rose-200">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-xs font-medium text-rose-800">
              Are you sure you want to delete <strong>{selectedBank?.bank_name}</strong> (
              {selectedBank?.account_number})? Clients will no longer see this bank for payments.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsBankDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteBank}>
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================== */}
      {/* UPI MODALS */}
      {/* ==================================================== */}
      {/* Add/Edit UPI Modal */}
      <Modal
        isOpen={isUpiFormOpen}
        onClose={() => setIsUpiFormOpen(false)}
        title={selectedUpi ? 'Edit UPI Account' : 'Add UPI Account'}
        description="Configure UPI IDs for dynamic instant payments. You can let the system generate QR or upload a custom QR image."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveUpi} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="UPI ID / VPA"
              placeholder="e.g. companyname@okaxis"
              value={upiFormData.upi_id || ''}
              onChange={(e) =>
                setUpiFormData({ ...upiFormData, upi_id: e.target.value.toLowerCase().trim() })
              }
              required
              helperText="Exact Virtual Payment Address (e.g. merchant@icici)"
            />

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Preferred App / Gateway
              </label>
              <select
                className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-white font-medium"
                value={upiFormData.upi_app || 'Google Pay'}
                onChange={(e) => setUpiFormData({ ...upiFormData, upi_app: e.target.value })}
              >
                <option value="Google Pay">Google Pay</option>
                <option value="PhonePe">PhonePe</option>
                <option value="Paytm">Paytm</option>
                <option value="BHIM UPI">BHIM UPI</option>
                <option value="Cred">Cred</option>
                <option value="Any UPI App">Any UPI App (Universal)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Priority (Display Order)"
              type="number"
              min={1}
              value={upiFormData.priority || 1}
              onChange={(e) =>
                setUpiFormData({ ...upiFormData, priority: parseInt(e.target.value) || 1 })
              }
              helperText="Lower numbers appear first on client screen"
            />
            <Input
              label="Daily Limit (₹)"
              type="number"
              min={0}
              step={10000}
              value={upiFormData.daily_limit || 100000}
              onChange={(e) =>
                setUpiFormData({ ...upiFormData, daily_limit: parseInt(e.target.value) || 0 })
              }
            />
          </div>

          {/* QR Code Configuration Section */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-blue-600" />
              QR Code Setup
            </h4>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Live Preview */}
              <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs flex flex-col items-center">
                <QRCodeDisplay
                  upiId={upiFormData.upi_id || 'sample@upi'}
                  payeeName="Payment Portal"
                  size={120}
                  qrUrl={upiFormData.qr_url}
                  showActions={false}
                />
                <span className="text-[10px] font-semibold text-slate-500 mt-2">Live Preview</span>
              </div>

              <div className="flex-1 space-y-3 w-full">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Upload Custom Static QR Code Image (Optional)
                  </label>
                  <label className="flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 border-dashed rounded-lg cursor-pointer hover:bg-white transition-colors text-xs text-slate-600 font-medium">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span>Choose PNG/JPG from computer...</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1">
                    If left empty, a dynamic QR code will automatically be generated using standard
                    UPI protocol.
                  </p>
                </div>

                {upiFormData.qr_url && (
                  <div className="flex items-center justify-between text-xs bg-white p-2 rounded border border-emerald-200 text-emerald-800">
                    <span className="flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Custom QR image attached
                    </span>
                    <button
                      type="button"
                      onClick={() => setUpiFormData({ ...upiFormData, qr_url: '' })}
                      className="text-rose-600 hover:underline text-[11px]"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Status</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="upi_status"
                  value="active"
                  checked={upiFormData.status === 'active'}
                  onChange={() => setUpiFormData({ ...upiFormData, status: 'active' })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                Active (Enabled on Client Portal)
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="upi_status"
                  value="inactive"
                  checked={upiFormData.status === 'inactive'}
                  onChange={() => setUpiFormData({ ...upiFormData, status: 'inactive' })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                Inactive (Disabled)
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Notes</label>
            <Input
              placeholder="e.g. PhonePe Primary Merchant account"
              value={upiFormData.notes || ''}
              onChange={(e) => setUpiFormData({ ...upiFormData, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsUpiFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {selectedUpi ? 'Update UPI Account' : 'Save UPI Account'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* QR Code Preview Modal */}
      <Modal
        isOpen={isUpiPreviewOpen}
        onClose={() => setIsUpiPreviewOpen(false)}
        title="UPI QR Code & Details"
        description="Scan to verify payment routing"
        maxWidth="sm"
      >
        {selectedUpi && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center text-center">
              <QRCodeDisplay
                upiId={selectedUpi.upi_id}
                upiApp={selectedUpi.upi_app}
                payeeName="Payment Portal"
                size={190}
                qrUrl={selectedUpi.qr_url}
                showActions={true}
              />

              <div className="mt-2">
                <div className="flex justify-center">
                  <Badge variant={selectedUpi.status === 'active' ? 'active' : 'inactive'}>
                    {selectedUpi.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setIsUpiPreviewOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete UPI Modal */}
      <Modal
        isOpen={isUpiDeleteOpen}
        onClose={() => setIsUpiDeleteOpen(false)}
        title="Delete UPI Account"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-rose-600 bg-rose-50 p-3 rounded-lg border border-rose-200">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-xs font-medium text-rose-800">
              Are you sure you want to delete <strong>{selectedUpi?.upi_id}</strong>? Clients will
              no longer be able to scan or copy this UPI address.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsUpiDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteUpi}>
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
