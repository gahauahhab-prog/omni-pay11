import React, { useState, useEffect, useMemo } from 'react';
import {
  Link as LinkIcon,
  Plus,
  Search,
  Calendar,
  CheckCircle,
  Clock,
  Ban,
  Copy,
  Check,
  ExternalLink,
  Share2,
  Eye,
  AlertTriangle,
  X,
  FileCheck,
  FileSpreadsheet,
  Trash2,
  Download,
  Edit3,
} from 'lucide-react';
import { PaymentLink, Client, UpiAccount } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Table, Column } from '../../components/ui/Table';
import { formatCurrency, formatDate, copyToClipboard, buildPaymentLinkUrl } from '../../lib/utils';
import { exportToExcelFile } from '../../lib/excelExport';

export const PaymentLinksPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error, info } = useToast();

  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [upis, setUpis] = useState<UpiAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'Pending' | 'Pending Confirmation' | 'Paid' | 'Rejected'
  >('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Create Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [linkType, setLinkType] = useState<'one_time' | 'live'>('one_time');
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [bankEnabled, setBankEnabled] = useState(true);
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedUpiId, setSelectedUpiId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');

  // Generated Link Success Modal
  const [createdLink, setCreatedLink] = useState<PaymentLink | null>(null);

  // Review Proof Modal State
  const [reviewLink, setReviewLink] = useState<PaymentLink | null>(null);
  const [selectedSubmissionIndex, setSelectedSubmissionIndex] = useState<number>(0);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [fullImageView, setFullImageView] = useState<string | null>(null);

  // Copied indicator
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingLink, setDeletingLink] = useState<PaymentLink | null>(null);

  // Edit Link Modal State
  const [editingLink, setEditingLink] = useState<PaymentLink | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editUpiEnabled, setEditUpiEnabled] = useState(true);
  const [editBankEnabled, setEditBankEnabled] = useState(true);
  const [editSelectedUpiId, setEditSelectedUpiId] = useState('');
  const [editCustomUpiId, setEditCustomUpiId] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const openEditLink = (l: PaymentLink) => {
    setEditingLink(l);
    setEditAmount(l.amount > 0 ? l.amount.toString() : '');
    setEditRemarks(l.remarks || '');
    setEditUpiEnabled(l.upi_enabled !== false);
    setEditBankEnabled(l.bank_enabled !== false);
    setEditSelectedUpiId(l.upi_account_id || '');
    setEditCustomUpiId(l.custom_upi_id || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink) return;

    if (!editUpiEnabled && !editBankEnabled) {
      error('Select Payment Mode', 'Please keep at least UPI or Bank Account enabled.');
      return;
    }

    const val = editAmount.trim() ? parseFloat(editAmount) : 0;
    if (editAmount.trim() && (isNaN(val) || val < 0)) {
      error('Invalid Amount', 'Please provide a valid positive amount.');
      return;
    }

    let upiIdToSave = editingLink.upi_id;
    if (editCustomUpiId.trim()) {
      upiIdToSave = editCustomUpiId.trim();
    } else if (editSelectedUpiId) {
      const match = upis.find((u) => u.id === editSelectedUpiId);
      if (match) upiIdToSave = match.upi_id;
    }

    setIsSavingEdit(true);
    try {
      await db.updateLivePaymentLink(
        editingLink.id,
        {
          amount: val,
          remarks: editRemarks.trim() || 'Payment Request',
          upi_enabled: editUpiEnabled,
          bank_enabled: editBankEnabled,
          upi_account_id: editSelectedUpiId || '',
          custom_upi_id: editCustomUpiId.trim() || '',
          upi_id: upiIdToSave,
        },
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );

      success('Link Updated', 'Payment link updated live and synchronized.');
      setEditingLink(null);
      loadData();
    } catch (err: any) {
      error('Update Failed', err?.message || 'Failed to update payment link.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const loadData = async () => {
    setLinks(db.getPaymentLinks());
    const cl = db.getClients();
    setClients(cl);
    if (cl.length > 0 && !clientId) {
      setClientId(cl[0].id);
    }
    let upiList = db.getActiveUpiAccounts();
    setUpis(upiList);
    if (upiList.length > 0 && !selectedUpiId) {
      setSelectedUpiId(upiList[0].id);
    }

    try {
      const syncedLinks = await db.syncPaymentLinksFromCloud();
      setLinks(syncedLinks);
    } catch {
      // Local fallback
    }

    try {
      const synced = await db.syncAccountsFromCloud();
      const freshUpis = synced.upis.filter((u) => u.status === 'active');
      setUpis(freshUpis);
      if (freshUpis.length > 0 && (!selectedUpiId || !freshUpis.some((u) => u.id === selectedUpiId))) {
        setSelectedUpiId(freshUpis[0].id);
      }
    } catch {
      // Local fallback
    }
  };

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener('portal_accounts_updated', handleUpdate);
    window.addEventListener('payment_link_edited_saved', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('payment_portal_channel');
      channel.onmessage = () => {
        loadData();
      };
    } catch {
      // Ignore
    }

    return () => {
      window.removeEventListener('portal_accounts_updated', handleUpdate);
      window.removeEventListener('payment_link_edited_saved', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
      if (channel) {
        channel.close();
      }
    };
  }, []);

  const filteredLinks = useMemo(() => {
    return links.filter((l) => {
      const clientName = l.client_name || '';
      const matchesSearch =
        clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.amount.toString().includes(searchTerm) ||
        (l.remarks && l.remarks.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.utr_number && l.utr_number.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'all' ? true : l.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [links, searchTerm, statusFilter]);

  const getFullPaymentUrl = (linkOrId: PaymentLink | string) => {
    if (typeof linkOrId === 'object' && linkOrId !== null) {
      return buildPaymentLinkUrl(linkOrId);
    }
    const found = links.find((l) => l.id === linkOrId);
    if (found) return buildPaymentLinkUrl(found);
    return `${window.location.origin}/pay/${linkOrId}`;
  };

  const handleCopyLink = async (linkOrId: PaymentLink | string) => {
    const url = getFullPaymentUrl(linkOrId);
    const id = typeof linkOrId === 'string' ? linkOrId : linkOrId.id;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedId(id);
      success('Link Copied', 'Payment link copied to clipboard.');
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      error('Failed to copy');
    }
  };

  const handleShareWhatsApp = (l: PaymentLink) => {
    const url = getFullPaymentUrl(l);
    const text = `Hello ${l.client_name || 'there'}, please complete your payment of ${formatCurrency(
      l.amount
    )} using this verified payment link: ${url}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = amount.trim() ? parseFloat(amount) : 0;
    if (!clientId) {
      error('Invalid Input', 'Please select a client.');
      return;
    }
    if (amount.trim() && (isNaN(parsedAmount) || parsedAmount < 0)) {
      error('Invalid Amount', 'Please specify a valid amount or leave blank for open amount.');
      return;
    }

    if (!upiEnabled && !bankEnabled) {
      error('Select at least one mode', 'Please enable at least UPI or Bank Account transfer.');
      return;
    }

    try {
      const newLink = await db.createPaymentLink(
        clientId,
        parsedAmount,
        remarks || 'Payment Link Request',
        user?.full_name || 'Admin',
        user?.id || 'admin',
        redirectUrl.trim(),
        selectedUpiId,
        linkType,
        {
          upi_enabled: upiEnabled,
          bank_enabled: bankEnabled,
        }
      );

      setIsModalOpen(false);
      setAmount('');
      setRemarks('');
      setRedirectUrl('');
      setCreatedLink(newLink);
      loadData();
      success('Payment Link Active', 'Dynamic checkout URL created successfully.');
    } catch {
      error('Failed to create payment link record');
    }
  };

  // Admin Confirmation Flow
  const handleConfirmPayment = async () => {
    if (!reviewLink) return;
    setActionLoading(true);
    try {
      await db.confirmPaymentLink(reviewLink.id, user?.full_name || 'Admin', user?.id || 'admin');
      success(
        'Payment Confirmed',
        `Payment of ${formatCurrency(reviewLink.amount)} for ${
          reviewLink.client_name || 'Client'
        } is verified and settled.`
      );
      setReviewLink(null);
      loadData();
    } catch {
      error('Confirmation Failed', 'Could not confirm payment at this time.');
    } finally {
      setActionLoading(false);
    }
  };

  // Admin Rejection Flow
  const handleRejectPayment = async () => {
    if (!reviewLink) return;
    setActionLoading(true);
    try {
      await db.rejectPaymentLink(
        reviewLink.id,
        rejectReason.trim() || 'Payment verification could not be validated',
        user?.full_name || 'Admin',
        user?.id || 'admin'
      );
      info('Payment Proof Rejected', 'The payment proof was marked as rejected.');
      setReviewLink(null);
      setIsRejecting(false);
      setRejectReason('');
      loadData();
    } catch {
      error('Rejection Failed', 'Could not reject payment.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredLinks.length === 0) {
      error('Export Failed', 'No payment links found to export.');
      return;
    }

    const data = filteredLinks.map((l) => ({
      'Link ID': l.id,
      'Client Name': l.client_name,
      'Amount (₹)': l.amount,
      'Status': l.status,
      'Receiving UPI': l.upi_id,
      'Remarks': l.remarks || '',
      'UTR Number': l.utr_number || '',
      'Created Date': formatDate(l.created_at),
      'Submitted Date': l.submitted_at ? formatDate(l.submitted_at) : '',
      'Confirmed Date': l.confirmed_at ? formatDate(l.confirmed_at) : '',
      'Direct URL': buildPaymentLinkUrl(l),
    }));

    const ok = exportToExcelFile(data, `payment_links_${Date.now()}`, 'Payment Links');
    if (ok) {
      success('Export Complete', `Exported ${filteredLinks.length} payment links to Excel (.xlsx).`);
    } else {
      error('Export Failed', 'Could not generate Excel spreadsheet.');
    }
  };

  const confirmDeleteLink = async () => {
    if (!deletingLink) return;
    await db.deletePaymentLink(deletingLink.id, user?.full_name || 'Admin', user?.id || 'admin');
    loadData();
    setDeletingLink(null);
    success('Payment Link Deleted', 'The payment link record has been removed.');
  };

  const pendingConfirmationCount = links.filter((l) => l.status === 'Pending Confirmation').length;

  const columns: Column<PaymentLink>[] = [
    {
      header: 'Client Name',
      accessorKey: 'client_name',
      sortable: true,
      render: (item) => (
        <div>
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
            <LinkIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>{item.client_name || 'Unassigned Client'}</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 block ml-5">
            Ref: {item.id}
          </span>
        </div>
      ),
    },
    {
      header: 'Amount',
      accessorKey: 'amount',
      sortable: true,
      render: (item) => (
        item.amount > 0 ? (
          <span className="font-bold text-sm text-slate-900">{formatCurrency(item.amount)}</span>
        ) : (
          <span className="inline-flex items-center text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            Open (ग्राहक द्वारा)
          </span>
        )
      ),
    },
    {
      header: 'Receiving UPI',
      render: (item) => (
        <div>
          <span className="font-mono text-xs font-semibold text-slate-800 block">
            {item.upi_id || 'primary@upi'}
          </span>
          <span className="text-[10px] text-slate-400">
            {upis.find((u) => u.upi_id === item.upi_id)?.account_name || 'Designated UPI'}
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      render: (item) => {
        if (item.status === 'Paid') {
          return (
            <div className="space-y-0.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                Review Done ✓
              </span>
              {item.confirmed_at && (
                <span className="text-[10px] text-emerald-700 font-mono block">
                  {formatDate(item.confirmed_at)}
                </span>
              )}
            </div>
          );
        }
        if (item.status === 'Pending Confirmation') {
          return (
            <div className="space-y-0.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                <Clock className="w-3 h-3 text-amber-600" />
                Pending Review
              </span>
              <span className="text-[10px] text-amber-700 font-medium block">
                Proof Uploaded
              </span>
            </div>
          );
        }
        if (item.status === 'Rejected') return <Badge variant="rejected">Rejected</Badge>;
        if (item.status === 'Expired') return <Badge variant="expired">Expired</Badge>;
        return <Badge variant="pending">Active / Pending</Badge>;
      },
    },
    {
      header: 'Proof & UTR',
      render: (item) => {
        if (item.status === 'Pending Confirmation' || item.status === 'Paid' || item.screenshot_url) {
          return (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReviewLink(item)}
                className="group relative cursor-pointer"
                title="Click to review screenshot and proof details"
              >
                {item.screenshot_url ? (
                  <img
                    src={item.screenshot_url}
                    alt="Proof thumbnail"
                    className="w-8 h-8 rounded border border-slate-300 object-cover group-hover:ring-2 group-hover:ring-blue-500 transition-all"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
                    <FileCheck className="w-4 h-4" />
                  </div>
                )}
              </button>
              <div className="text-left">
                {item.utr_number ? (
                  <span className="text-[11px] font-mono font-medium text-slate-800 block">
                    {item.utr_number}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 italic block">Screenshot only</span>
                )}
                {item.submitted_at && (
                  <span className="text-[10px] text-slate-400 block">
                    {formatDate(item.submitted_at)}
                  </span>
                )}
              </div>
            </div>
          );
        }
        return <span className="text-xs text-slate-400">—</span>;
      },
    },
    {
      header: 'Created',
      accessorKey: 'created_at',
      sortable: true,
      render: (item) => (
        <div className="text-xs text-slate-500 flex items-center gap-1">
          <Calendar className="w-3 h-3 text-slate-400" />
          <span>{formatDate(item.created_at)}</span>
        </div>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          {item.status === 'Pending Confirmation' && (
            <Button
              size="sm"
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs text-xs px-2.5 py-1 font-semibold"
              onClick={() => setReviewLink(item)}
              leftIcon={<Eye className="w-3.5 h-3.5" />}
            >
              Review Proof
            </Button>
          )}

          {item.status === 'Paid' && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs px-2.5 py-1 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 font-semibold"
              onClick={() => setReviewLink(item)}
              leftIcon={<Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />}
              title="Click to view verified settlement details"
            >
              Review Done ✓
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="text-xs px-2 py-1 text-slate-700 hover:bg-slate-50"
            onClick={() => openEditLink(item)}
            title="Edit Payment Link"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="text-xs px-2 py-1"
            onClick={() => handleCopyLink(item)}
            title="Copy Public Link"
          >
            {copiedId === item.id ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="text-xs px-2 py-1 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200"
            onClick={() => handleShareWhatsApp(item)}
            title="Share on WhatsApp"
          >
            <Share2 className="w-3.5 h-3.5" />
          </Button>

          <a
            href={getFullPaymentUrl(item)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Open Checkout Page"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={() => setDeletingLink(item)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-0.5"
            title="Delete Payment Link"
          >
            <Trash2 className="w-3.5 h-3.5" />
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
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Payment Links</h2>
          <p className="text-xs text-slate-500 mt-1">
            Generate dynamic UPI Intent & QR payment links for clients and verify submitted payment proofs.
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
          <Button onClick={() => setIsModalOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
            Generate Payment Link
          </Button>
        </div>
      </div>

      {/* Pending Confirmation Alert Banner */}
      {pendingConfirmationCount > 0 && (
        <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 animate-spin" />
            </div>
            <div>
              <span className="font-bold text-amber-950 block">
                {pendingConfirmationCount} Payment{pendingConfirmationCount > 1 ? 's' : ''} Awaiting Admin Confirmation
              </span>
              <p className="text-amber-800 text-[11px] mt-0.5">
                Clients have uploaded payment screenshots and are waiting for your verification.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => setStatusFilter('Pending Confirmation')}
          >
            View Pending ({pendingConfirmationCount})
          </Button>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search client, UTR, remarks..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <span className="text-xs font-medium text-slate-500">Filter:</span>
          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600 flex-wrap">
            {(
              [
                'all',
                'Pending',
                'Pending Confirmation',
                'Paid',
                'Rejected',
              ] as const
            ).map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-md transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'hover:text-slate-900'
                }`}
              >
                {st === 'all' ? 'All' : st}
                {st === 'Pending Confirmation' && pendingConfirmationCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-amber-500 text-white text-[10px] rounded-full font-bold">
                    {pendingConfirmationCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <Table
        data={filteredLinks}
        columns={columns}
        keyExtractor={(item) => item.id}
        pageSize={8}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        emptyMessage="No payment links match the selected filter."
      />

      {/* CREATE PAYMENT LINK MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Generate Payment Link"
        maxWidth="md"
      >
        <form onSubmit={handleCreateLink} className="space-y-4">
          {/* PAYMENT MODES SELECTION */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <label className="block text-xs font-semibold text-slate-800">
              Payment Modes:
            </label>
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={upiEnabled}
                  onChange={(e) => setUpiEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>UPI Payment (QR & Apps)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={bankEnabled}
                  onChange={(e) => setBankEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Bank Account Transfer</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select Client <span className="text-rose-500">*</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full h-10 px-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              required
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.email})
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Payment Amount (₹)"
            type="number"
            min={0}
            step={1}
            placeholder="Amount in ₹ (Leave empty for open amount)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Receiving UPI Account
            </label>
            <select
              value={selectedUpiId}
              onChange={(e) => setSelectedUpiId(e.target.value)}
              className="w-full h-10 px-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            >
              {upis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.upi_id} ({u.upi_app})
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Invoice Purpose / Remarks"
            placeholder="e.g. Web Development Invoice #402"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />

          <Input
            label="Custom Redirect URL (Optional)"
            placeholder="https://yourwebsite.com/thank-you"
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Generate Link</Button>
          </div>
        </form>
      </Modal>

      {/* NEWLY CREATED LINK SUCCESS MODAL */}
      {createdLink && (
        <Modal
          isOpen={!!createdLink}
          onClose={() => setCreatedLink(null)}
          title="Payment Link Ready"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
              <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
                Amount Requested
              </span>
              <div className="text-2xl font-bold text-emerald-950 mt-0.5">
                {formatCurrency(createdLink.amount)}
              </div>
              <span className="text-xs text-emerald-700 block mt-1">
                For {createdLink.client_name}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Shareable Payment URL:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getFullPaymentUrl(createdLink)}
                  className="flex-1 h-10 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700 select-all"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleCopyLink(createdLink)}
                  leftIcon={copiedId === createdLink.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                >
                  {copiedId === createdLink.id ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                variant="outline"
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                onClick={() => handleShareWhatsApp(createdLink)}
                leftIcon={<Share2 className="w-4 h-4" />}
              >
                Share on WhatsApp
              </Button>

              <a
                href={getFullPaymentUrl(createdLink)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Checkout</span>
              </a>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <Button variant="outline" onClick={() => setCreatedLink(null)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* REVIEW PROOF & CONFIRMATION MODAL */}
      {reviewLink && (
        <Modal
          isOpen={!!reviewLink}
          onClose={() => {
            setReviewLink(null);
            setIsRejecting(false);
          }}
          title="Verify Payment Confirmation"
          description={`Review submitted proof and UTR reference for ${reviewLink.client_name || 'Client'}.`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            {/* Perpetual link submissions selector if multiple exist */}
            {reviewLink.submissions && reviewLink.submissions.length > 1 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-2">
                <div className="font-semibold text-blue-950 flex items-center justify-between">
                  <span>Submissions on this Perpetual Link ({reviewLink.submissions.length}):</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-300">
                    Always Active Link
                  </span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {reviewLink.submissions.map((s, idx) => (
                    <button
                      key={s.id || idx}
                      type="button"
                      onClick={() => setSelectedSubmissionIndex(idx)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer border transition-colors ${
                        selectedSubmissionIndex === idx
                          ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      #{reviewLink.submissions!.length - idx} &bull; ₹{s.amount.toLocaleString('en-IN')}{' '}
                      <span className={`text-[10px] ml-1 px-1 rounded ${s.status === 'Paid' ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'}`}>
                        {s.status === 'Paid' ? '✓ Paid' : 'Pending'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              const activeSub = (reviewLink.submissions && reviewLink.submissions[selectedSubmissionIndex]) || {
                amount: reviewLink.last_paid_amount || reviewLink.amount,
                submitted_at: reviewLink.submitted_at,
                utr_number: reviewLink.utr_number,
                screenshot_url: reviewLink.screenshot_url,
                status: reviewLink.status,
              };

              return (
                <>
                  {/* Summary Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div>
                      <span className="text-[11px] text-slate-400 block">Client</span>
                      <span className="font-bold text-slate-900">{reviewLink.client_name}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Submission Amount</span>
                      <span className="font-bold text-emerald-700 text-sm">
                        {formatCurrency(activeSub.amount || reviewLink.amount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Submitted At</span>
                      <span className="text-slate-700">
                        {activeSub.submitted_at ? formatDate(activeSub.submitted_at) : 'Just now'}
                      </span>
                    </div>
                    {activeSub.utr_number && (
                      <div className="col-span-2 sm:col-span-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-semibold">
                          Client Reported UTR / Ref No:
                        </span>
                        <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded border border-slate-300">
                          {activeSub.utr_number}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Screenshot Preview */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Submitted Payment Screenshot:
                    </label>
                    {activeSub.screenshot_url ? (
                      <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-950/5 text-center p-2">
                        <img
                          src={activeSub.screenshot_url}
                          alt="Payment Screenshot"
                          className="max-h-72 mx-auto rounded-lg object-contain cursor-pointer hover:opacity-95 transition-opacity"
                          onClick={() => setFullImageView(activeSub.screenshot_url || null)}
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          Click image to view full size
                        </p>
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                        No screenshot uploaded.
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Rejection Form Input */}
            {isRejecting && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2 animate-in fade-in">
                <label className="block text-xs font-semibold text-rose-900">
                  Specify Reason for Rejection:
                </label>
                <Input
                  placeholder="e.g. UTR not matching bank statement, duplicate screenshot"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                {!isRejecting ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                    onClick={() => setIsRejecting(true)}
                  >
                    Reject Proof
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsRejecting(false)}
                  >
                    Cancel Rejection
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setReviewLink(null);
                    setIsRejecting(false);
                  }}
                >
                  Close
                </Button>

                {isRejecting ? (
                  <Button
                    type="button"
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    isLoading={actionLoading}
                    onClick={handleRejectPayment}
                  >
                    Confirm Rejection
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    isLoading={actionLoading}
                    onClick={handleConfirmPayment}
                    leftIcon={<CheckCircle className="w-4 h-4" />}
                  >
                    Confirm & Settle Payment
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* FULL-SIZE IMAGE PREVIEW MODAL */}
      {fullImageView && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFullImageView(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-auto">
            <button
              type="button"
              onClick={() => setFullImageView(null)}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={fullImageView}
              alt="Full Size Proof"
              className="max-w-full max-h-[85vh] rounded-lg mx-auto object-contain"
            />
          </div>
        </div>
      )}

      {/* Delete Payment Link Confirmation Modal */}
      <Modal
        isOpen={!!deletingLink}
        onClose={() => setDeletingLink(null)}
        title="Delete Payment Link"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700">
              <p className="font-semibold text-red-800">Delete this payment link?</p>
              <p className="mt-1">
                Client: <span className="font-medium text-slate-800">{deletingLink?.client_name}</span>
              </p>
              <p className="mt-0.5">
                Amount: <span className="font-bold text-slate-900">{formatCurrency(deletingLink?.amount || 0)}</span>
              </p>
              <p className="mt-0.5">
                Link ID: <span className="font-mono text-slate-800">{deletingLink?.id}</span>
              </p>
              <p className="mt-2 text-slate-500">
                This will remove the payment link and clients will no longer be able to submit proofs through it.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingLink(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirmDeleteLink}>
              Delete Link
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Payment Link Modal */}
      {editingLink && (
        <Modal
          isOpen={!!editingLink}
          onClose={() => setEditingLink(null)}
          title={`Edit Payment Link (${editingLink.id})`}
          maxWidth="md"
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div>
                <span className="text-slate-500">Client:</span>{' '}
                <span className="font-semibold text-slate-800">{editingLink.client_name}</span>
              </div>
              <div>
                <span className="text-slate-500">Created At:</span>{' '}
                <span className="font-mono text-slate-700">{formatDate(editingLink.created_at)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Amount (₹)
              </label>
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="Leave blank for open amount"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Enter an amount or leave blank to allow the customer to enter their own amount.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Remarks / Purpose
              </label>
              <Input
                type="text"
                placeholder="e.g. Service Fee"
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
              />
            </div>

            {/* Payment Modes */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700">
                Payment Modes
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={editUpiEnabled}
                    onChange={(e) => setEditUpiEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-xs font-medium text-slate-800">UPI Payment</div>
                    <div className="text-[10px] text-slate-500">QR & Apps</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={editBankEnabled}
                    onChange={(e) => setEditBankEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-xs font-medium text-slate-800">Bank Transfer</div>
                    <div className="text-[10px] text-slate-500">IMPS / NEFT</div>
                  </div>
                </label>
              </div>
            </div>

            {/* UPI Option */}
            {editUpiEnabled && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700">
                  UPI ID (VPA)
                </label>
                {upis.length > 0 && (
                  <select
                    value={editSelectedUpiId}
                    onChange={(e) => {
                      setEditSelectedUpiId(e.target.value);
                      if (e.target.value) setEditCustomUpiId('');
                    }}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    <option value="">Select Existing UPI</option>
                    {upis.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.account_name} ({u.upi_id})
                      </option>
                    ))}
                  </select>
                )}

                <Input
                  type="text"
                  placeholder="Or enter custom UPI (e.g. name@okhdfcbank)"
                  value={editCustomUpiId}
                  onChange={(e) => {
                    setEditCustomUpiId(e.target.value);
                    if (e.target.value) setEditSelectedUpiId('');
                  }}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingLink(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={isSavingEdit}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
