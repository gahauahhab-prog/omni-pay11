import React, { useState, useEffect, useMemo } from 'react';
import {
  QrCode,
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { UpiAccount } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Table, Column } from '../../components/ui/Table';
import { QRCodeDisplay } from '../../components/QRCodeDisplay';
import { formatCurrency } from '../../lib/utils';

export const UpiAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();

  const [accounts, setAccounts] = useState<UpiAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof UpiAccount>('priority');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUpi, setSelectedUpi] = useState<UpiAccount | null>(null);

  // Form
  const [formData, setFormData] = useState<Partial<UpiAccount>>({
    upi_id: '',
    upi_app: 'Google Pay',
    qr_url: '',
    priority: 1,
    daily_limit: 100000,
    notes: '',
    status: 'active',
  });

  const loadAccounts = () => {
    setAccounts(db.getUpiAccounts());
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const filteredAccounts = useMemo(() => {
    return accounts
      .filter((acc) => {
        const matchesSearch =
          acc.upi_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          acc.upi_app.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (acc.notes && acc.notes.toLowerCase().includes(searchTerm.toLowerCase()));

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

  const handleSort = (key: keyof UpiAccount) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const openAddModal = () => {
    setSelectedUpi(null);
    setFormData({
      upi_id: '',
      upi_app: 'Google Pay',
      qr_url: '',
      priority: accounts.length + 1,
      daily_limit: 100000,
      notes: '',
      status: 'active',
    });
    setIsFormOpen(true);
  };

  const openEditModal = (account: UpiAccount) => {
    setSelectedUpi(account);
    setFormData({ ...account });
    setIsFormOpen(true);
  };

  const openPreviewModal = (account: UpiAccount) => {
    setSelectedUpi(account);
    setIsPreviewOpen(true);
  };

  const openDeleteModal = (account: UpiAccount) => {
    setSelectedUpi(account);
    setIsDeleteOpen(true);
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
      setFormData((prev) => ({
        ...prev,
        qr_url: reader.result as string,
      }));
      success('Image Uploaded', 'Custom QR code image loaded.');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.upi_id) {
      error('Missing Field', 'Please specify a valid UPI ID (e.g. handle@bank).');
      return;
    }

    try {
      await db.saveUpiAccount(formData, user?.full_name || 'Admin', user?.id || 'admin');
      success(
        selectedUpi ? 'UPI ID Updated' : 'UPI ID Created',
        `Configured ${formData.upi_id} successfully.`
      );
      setIsFormOpen(false);
      loadAccounts();
    } catch {
      error('Error', 'Unable to save UPI configuration.');
    }
  };

  const handleToggleStatus = async (account: UpiAccount) => {
    try {
      const updated = await db.toggleUpiAccountStatus(
        account.id,
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      if (updated) {
        success('Status Changed', `${updated.upi_id} is now ${updated.status}.`);
        loadAccounts();
      }
    } catch {
      error('Failed to change status');
    }
  };

  const handleDelete = async () => {
    if (!selectedUpi) return;
    try {
      await db.deleteUpiAccount(selectedUpi.id, user?.full_name || 'Admin', user?.id || 'admin');
      success('Deleted', `UPI ID ${selectedUpi.upi_id} was removed.`);
      setIsDeleteOpen(false);
      loadAccounts();
    } catch {
      error('Delete Failed', 'Could not remove UPI ID.');
    }
  };

  const columns: Column<UpiAccount>[] = [
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
      render: (item) => (
        <button
          onClick={() => openPreviewModal(item)}
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 transition-colors"
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>Preview QR</span>
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
            onClick={() => openPreviewModal(item)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            title="Preview QR Code"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => openEditModal(item)}
            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            title="Edit UPI"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => openDeleteModal(item)}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
            title="Delete UPI"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">UPI Accounts</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage merchant virtual payment addresses and downloadable QR codes for client billing.
          </p>
        </div>
        <Button onClick={openAddModal} leftIcon={<Plus className="w-4 h-4" />}>
          Add UPI ID
        </Button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search UPI ID or app..."
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

      {/* Table */}
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
        emptyMessage="No UPI IDs match your search filter."
      />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedUpi ? 'Edit UPI Account' : 'Add UPI Account'}
        description="Configure UPI handle and automated QR image generator."
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="UPI ID (VPA)"
            placeholder="e.g. payments@upi or business@icici"
            value={formData.upi_id || ''}
            onChange={(e) => setFormData({ ...formData, upi_id: e.target.value.toLowerCase().trim() })}
            required
            helperText="Standard UPI address format (user@bank)"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Primary UPI App
              </label>
              <select
                value={formData.upi_app || 'Google Pay'}
                onChange={(e) => setFormData({ ...formData, upi_app: e.target.value })}
                className="w-full h-10 px-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="Google Pay">Google Pay</option>
                <option value="PhonePe">PhonePe</option>
                <option value="Paytm">Paytm</option>
                <option value="BHIM UPI">BHIM UPI</option>
                <option value="Amazon Pay">Amazon Pay</option>
                <option value="All UPI Apps">All UPI Apps</option>
              </select>
            </div>

            <Input
              label="Priority Order #"
              type="number"
              min={1}
              value={formData.priority || 1}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 1 })}
              helperText="Determines display order on Client portal"
            />
          </div>

          <Input
            label="Daily Transaction Limit (₹)"
            type="number"
            min={0}
            step={10000}
            value={formData.daily_limit || 100000}
            onChange={(e) => setFormData({ ...formData, daily_limit: parseInt(e.target.value) || 0 })}
          />

          {/* QR Image Option */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              Custom QR Image (Optional)
            </label>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              If left blank, the portal dynamically generates a scannable standard UPI QR code on client devices.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>Upload QR Image</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
              {formData.qr_url && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, qr_url: '' })}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Remove Custom Image
                </button>
              )}
            </div>
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
                <span>Inactive (Offline)</span>
              </label>
            </div>
          </div>

          <Input
            label="Internal Notes"
            placeholder="e.g. Primary retail merchant handle"
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {selectedUpi ? 'Update UPI ID' : 'Save UPI ID'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Preview QR Modal */}
      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="UPI QR Code Preview"
        description="Verify scan fidelity and scannable payment string"
        maxWidth="sm"
      >
        {selectedUpi && (
          <div className="py-2">
            <QRCodeDisplay
              upiId={selectedUpi.upi_id}
              upiApp={selectedUpi.upi_app}
              payeeName="Payment Portal"
              qrUrl={selectedUpi.qr_url}
              size={200}
              showActions={true}
            />
            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Priority:</span>
                <span className="font-semibold text-slate-900">Rank #{selectedUpi.priority}</span>
              </div>
              <div className="flex justify-between">
                <span>Daily Limit:</span>
                <span className="font-semibold text-slate-900">{formatCurrency(selectedUpi.daily_limit)}</span>
              </div>
              <div className="flex justify-between">
                <span>Client Status:</span>
                <Badge variant={selectedUpi.status === 'active' ? 'active' : 'inactive'}>
                  {selectedUpi.status === 'active' ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Delete UPI Account"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 text-xs text-slate-600">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p>
              Are you sure you want to delete UPI ID{' '}
              <strong className="text-slate-900">{selectedUpi?.upi_id}</strong>?
              Clients will no longer be able to scan or copy this payment address.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete UPI
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
