import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  KeyRound,
  LogIn,
  AlertTriangle,
  Mail,
  Phone,
  Globe,
} from 'lucide-react';
import { Client } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Table, Column } from '../../components/ui/Table';
import { formatDate } from '../../lib/utils';

export const ClientsPage: React.FC = () => {
  const { user, impersonateClient } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof Client>('full_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isResetPassOpen, setIsResetPassOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Form states
  const [formData, setFormData] = useState<Partial<Client>>({
    full_name: '',
    email: '',
    phone: '',
    password: 'Client@123',
    status: 'active',
  });
  const [newPassword, setNewPassword] = useState('Client@123');

  const loadClients = () => {
    setClients(db.getClients());
  };

  useEffect(() => {
    loadClients();
    db.syncClientsFromCloud().then((synced) => {
      setClients(synced);
    });

    const handleUpdate = () => {
      loadClients();
    };

    window.addEventListener('portal_accounts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    const unsubFirestore = db.subscribeToRealtimeUpdates(() => {
      loadClients();
    });

    return () => {
      window.removeEventListener('portal_accounts_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
      unsubFirestore();
    };
  }, []);

  const filteredClients = useMemo(() => {
    return clients
      .filter((c) => {
        const matchesSearch =
          c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.phone.includes(searchTerm);

        const matchesStatus = statusFilter === 'all' ? true : c.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const valA = a[sortKey] || '';
        const valB = b[sortKey] || '';
        return sortOrder === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
  }, [clients, searchTerm, statusFilter, sortKey, sortOrder]);

  const handleSort = (key: keyof Client) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const openAddModal = () => {
    setSelectedClient(null);
    setFormData({
      full_name: '',
      email: '',
      phone: '+91 ',
      password: 'Client@123',
      status: 'active',
    });
    setIsFormOpen(true);
  };

  const openEditModal = (client: Client) => {
    setSelectedClient(client);
    setFormData({ ...client });
    setIsFormOpen(true);
  };

  const openResetPassModal = (client: Client) => {
    setSelectedClient(client);
    setNewPassword('Client@123');
    setIsResetPassOpen(true);
  };

  const openDeleteModal = (client: Client) => {
    setSelectedClient(client);
    setIsDeleteOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name || !formData.email) {
      error('Required Fields', 'Full name and email address are required.');
      return;
    }

    try {
      await db.saveClient(formData, user?.full_name || 'Admin', user?.id || 'admin');
      success(
        selectedClient ? 'Client Updated' : 'Client Created',
        `Client profile for ${formData.full_name} saved successfully.`
      );
      setIsFormOpen(false);
      loadClients();
    } catch {
      error('Failed to save client');
    }
  };

  const handleToggleStatus = async (client: Client) => {
    try {
      const updated = await db.toggleClientStatus(
        client.id,
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      if (updated) {
        success('Client Status Updated', `${updated.full_name} is now ${updated.status}.`);
        loadClients();
      }
    } catch {
      error('Status update failed');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient) return;
    try {
      await db.resetClientPassword(
        selectedClient.id,
        newPassword,
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      success('Password Reset', `Updated credentials for ${selectedClient.full_name}.`);
      setIsResetPassOpen(false);
      loadClients();
    } catch {
      error('Failed to reset password');
    }
  };

  const handleDelete = async () => {
    if (!selectedClient) return;
    try {
      await db.deleteClient(selectedClient.id, user?.full_name || 'Admin', user?.id || 'admin');
      success('Client Removed', `${selectedClient.full_name} has been deleted.`);
      setIsDeleteOpen(false);
      loadClients();
    } catch {
      error('Failed to delete client');
    }
  };

  const handleLoginAsClient = (client: Client) => {
    impersonateClient(client);
    success('Client Session Active', `Now viewing client portal as ${client.full_name}.`);
    navigate('/client/dashboard');
  };

  const columns: Column<Client>[] = [
    {
      header: 'Client Name',
      accessorKey: 'full_name',
      sortable: true,
      render: (item) => (
        <div>
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            <span>{item.full_name}</span>
          </div>
          <span className="text-[11px] text-slate-400">Created {formatDate(item.created_at)}</span>
        </div>
      ),
    },
    {
      header: 'Email',
      accessorKey: 'email',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-700">
          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{item.email}</span>
        </div>
      ),
    },
    {
      header: 'Phone',
      accessorKey: 'phone',
      render: (item) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-700">
          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{item.phone || '—'}</span>
        </div>
      ),
    },
    {
      header: 'Last Login (IP)',
      accessorKey: 'last_login_at',
      render: (item) => (
        item.last_login_at ? (
          <div className="space-y-0.5">
            <span className="text-[11px] text-slate-700 font-medium block">
              {formatDate(item.last_login_at)}
            </span>
            {item.last_login_ip && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                <Globe className="w-2.5 h-2.5 text-blue-500" />
                {item.last_login_ip}
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-400 text-xs">Never</span>
        )
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
            {item.status === 'active' ? 'Active' : 'Disabled'}
          </Badge>
        </button>
      ),
    },
    {
      header: 'Quick Login',
      render: (item) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleLoginAsClient(item)}
          leftIcon={<LogIn className="w-3.5 h-3.5 text-blue-600" />}
          className="text-xs font-semibold text-blue-700 hover:bg-blue-50"
        >
          Login As Client
        </Button>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right pr-5',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => openResetPassModal(item)}
            className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
            title="Reset Password"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            onClick={() => openEditModal(item)}
            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            title="Edit Client"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => openDeleteModal(item)}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
            title="Delete Client"
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
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Clients Management</h2>
          <p className="text-xs text-slate-500 mt-1">
            Create customer accounts, manage login credentials, and preview client view via "Login As Client".
          </p>
        </div>
        <Button onClick={openAddModal} leftIcon={<Plus className="w-4 h-4" />}>
          Add New Client
        </Button>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search by client name, email, or phone..."
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
            {(['all', 'active', 'disabled'] as const).map((st) => (
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
        data={filteredClients}
        columns={columns}
        keyExtractor={(item) => item.id}
        pageSize={8}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onSort={handleSort}
        sortKey={sortKey}
        sortOrder={sortOrder}
        emptyMessage="No clients found matching the search criteria."
      />

      {/* Add / Edit Client Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedClient ? 'Edit Client Account' : 'Add New Client'}
        description="Provision client credentials. Clients cannot register themselves."
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="e.g. Rahul Sharma"
            value={formData.full_name || ''}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            required
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. rahul.sharma@example.com"
            value={formData.email || ''}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            helperText="Used for client portal login"
          />

          <Input
            label="Phone Number"
            placeholder="e.g. +91 98765 43210"
            value={formData.phone || ''}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />

          {!selectedClient && (
            <Input
              label="Temporary Password"
              type="text"
              placeholder="Client@123"
              value={formData.password || ''}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              helperText="Initial password client can use to sign in"
            />
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Portal Status</label>
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
                <span>Active (Can sign in)</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="disabled"
                  checked={formData.status === 'disabled'}
                  onChange={() => setFormData({ ...formData, status: 'disabled' })}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Disabled (Blocked)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {selectedClient ? 'Save Changes' : 'Create Client'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={isResetPassOpen}
        onClose={() => setIsResetPassOpen(false)}
        title="Reset Client Password"
        description={`Set a new temporary password for ${selectedClient?.full_name}`}
        maxWidth="sm"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <Input
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            helperText="Provide this to the client for login"
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsResetPassOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Update Password</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Delete Client Account"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 text-xs text-slate-600">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p>
              Are you sure you want to permanently delete the client account for{' '}
              <strong className="text-slate-900">{selectedClient?.full_name}</strong> (
              {selectedClient?.email})?
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete Client
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
