import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Power,
  Edit3,
  Copy,
  Check,
  ExternalLink,
  Share2,
  Trash2,
  Building2,
  Smartphone,
  Plus,
  Clock,
  AlertTriangle,
  FileCheck,
  Eye,
  Receipt,
} from 'lucide-react';
import { PaymentLink, PaymentSubmission, BankAccount, UpiAccount } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { formatCurrency, formatDate, copyToClipboard, buildPaymentLinkUrl } from '../../lib/utils';

export const ClientManageLinksPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();

  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [activeUpis, setActiveUpis] = useState<UpiAccount[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Submissions View & Details State
  const [viewingSubmissionsLink, setViewingSubmissionsLink] = useState<PaymentLink | null>(null);
  const [fullImageView, setFullImageView] = useState<string | null>(null);

  // Edit Link Modal State
  const [editingLink, setEditingLink] = useState<PaymentLink | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editUpiEnabled, setEditUpiEnabled] = useState(true);
  const [editBankEnabled, setEditBankEnabled] = useState(true);
  const [editCustomUpiId, setEditCustomUpiId] = useState('');
  const [editSelectedUpiId, setEditSelectedUpiId] = useState('');

  // Custom bank accounts on link
  const [editCustomBanks, setEditCustomBanks] = useState<BankAccount[]>([]);
  const [newBankName, setNewBankName] = useState('');
  const [newAccHolder, setNewAccHolder] = useState('');
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newIfsc, setNewIfsc] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [showAddBankForm, setShowAddBankForm] = useState(false);

  // Shutdown / Action loading state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [deletingLink, setDeletingLink] = useState<PaymentLink | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = () => {
    const allLinks = db.getPaymentLinks();
    const myLinks = user?.clientId
      ? allLinks.filter((l) => l.client_id === user.clientId)
      : allLinks;
    setLinks(myLinks);
    setActiveUpis(db.getActiveUpiAccounts());
  };

  const getLinkSubmissions = (l: PaymentLink): PaymentSubmission[] => {
    if (Array.isArray(l.submissions) && l.submissions.length > 0) {
      return l.submissions;
    }
    if (l.utr_number || l.screenshot_url || l.status === 'Paid') {
      return [
        {
          id: `sub_${l.id}`,
          amount: l.last_paid_amount || l.amount,
          utr_number: l.utr_number || '',
          screenshot_url: l.screenshot_url || '',
          submitted_at: l.submitted_at || l.created_at,
          status: l.status,
          confirmed_at: l.confirmed_at,
          confirmed_by: l.confirmed_by,
          rejection_reason: l.rejection_reason,
          method: 'UPI',
        },
      ];
    }
    return [];
  };

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener('portal_accounts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('portal_accounts_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [user]);

  const handleCopy = async (id: string, l: PaymentLink) => {
    const url = buildPaymentLinkUrl(l);
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedId(id);
      success('Link Copied', 'Payment checkout URL copied.');
      setTimeout(() => setCopiedId(null), 2500);
    } else {
      error('Copy Failed', 'Please copy manually.');
    }
  };

  const handleShareWhatsApp = (l: PaymentLink) => {
    const url = buildPaymentLinkUrl(l);
    const amtStr = l.amount > 0 ? `₹${l.amount.toLocaleString('en-IN')}` : 'Settlement Amount';
    const text = `Hi, please use this payment link to complete payment of ${amtStr} for ${
      l.remarks || 'Settlement'
    }: ${url}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleToggleShutdown = async (l: PaymentLink) => {
    setActionLoadingId(l.id);
    try {
      const updated = await db.togglePaymentLinkActive(
        l.id,
        user?.full_name || 'Client',
        user?.id || 'client'
      );
      if (updated) {
        success(
          updated.is_active !== false ? 'Link Reactivated' : 'Link Shutdown',
          updated.is_active !== false
            ? 'This link is now active.'
            : 'This link has been deactivated.'
        );
        loadData();
      }
    } catch {
      error('Action Failed', 'Could not toggle link status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingLink) return;
    try {
      await db.deletePaymentLink(
        deletingLink.id,
        user?.full_name || 'Client',
        user?.id || 'client'
      );
      success('Link Deleted', 'Payment link has been removed.');
      setDeletingLink(null);
      loadData();
    } catch {
      error('Delete Failed', 'Could not delete link.');
    }
  };

  const openEditLink = (l: PaymentLink) => {
    setEditingLink(l);
    setEditAmount(l.amount > 0 ? l.amount.toString() : '');
    setEditRemarks(l.remarks || '');
    setEditUpiEnabled(l.upi_enabled !== false);
    setEditBankEnabled(l.bank_enabled !== false);
    setEditCustomUpiId(l.custom_upi_id || '');
    setEditSelectedUpiId(l.upi_account_id || '');
    setEditCustomBanks(l.custom_bank_accounts ? [...l.custom_bank_accounts] : []);
    setShowAddBankForm(false);
  };

  const handleAddCustomBank = () => {
    if (!newBankName.trim() || !newAccHolder.trim() || !newAccNumber.trim() || !newIfsc.trim()) {
      error('Incomplete Bank Details', 'Please fill Bank Name, Account Holder, Account Number, and IFSC.');
      return;
    }

    const newBank: BankAccount = {
      id: `custom_bank_${Date.now()}`,
      bank_name: newBankName.trim(),
      account_holder: newAccHolder.trim(),
      account_number: newAccNumber.trim(),
      ifsc_code: newIfsc.trim().toUpperCase(),
      branch: newBranch.trim() || 'Main Branch',
      priority: editCustomBanks.length + 1,
      daily_limit: 1000000,
      status: 'active',
      created_at: new Date().toISOString(),
    };

    setEditCustomBanks([...editCustomBanks, newBank]);
    setNewBankName('');
    setNewAccHolder('');
    setNewAccNumber('');
    setNewIfsc('');
    setNewBranch('');
    setShowAddBankForm(false);
    success('Bank Added', 'Bank account added.');
  };

  const handleRemoveCustomBank = (bankId: string) => {
    setEditCustomBanks(editCustomBanks.filter((b) => b.id !== bankId));
  };

  const handleSaveLink = async (e: React.FormEvent) => {
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
      const match = activeUpis.find((u) => u.id === editSelectedUpiId);
      if (match) upiIdToSave = match.upi_id;
    }

    setIsSaving(true);
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
          custom_bank_accounts: editCustomBanks.length > 0 ? editCustomBanks : [],
        },
        user?.full_name || 'Client',
        user?.id || 'client'
      );

      success('Link Updated', 'Payment link updated live and synchronized.');
      setEditingLink(null);
      loadData();
    } catch (err: any) {
      console.error('Update payment link error:', err);
      error('Update Failed', err?.message || 'Failed to update payment link.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <LinkIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Manage Links</h1>
            <p className="text-xs text-slate-500">Previously generated payment links</p>
          </div>
        </div>

        <div>
          <Badge variant="paid">{links.length} Links</Badge>
        </div>
      </div>

      {/* Payment Links List / Table */}
      {links.length === 0 ? (
        <div className="p-12 bg-white border border-dashed border-slate-200 rounded-xl text-center space-y-2">
          <p className="text-sm font-semibold text-slate-800">No payment links created yet</p>
          <p className="text-xs text-slate-500">Generate a payment link from your dashboard to view and manage it here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Link / Reference</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Modes</th>
                  <th className="py-3 px-4">Submissions & Review Status</th>
                  <th className="py-3 px-4">Link Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {links.map((l) => {
                  const isShutdown = l.is_active === false;
                  const linkUrl = buildPaymentLinkUrl(l);
                  const submissions = getLinkSubmissions(l);
                  const hasPaid = submissions.some((s) => s.status === 'Paid');
                  const hasPending = submissions.some((s) => s.status === 'Pending Confirmation');
                  const hasRejected = submissions.some((s) => s.status === 'Rejected');

                  return (
                    <tr key={l.id} className={isShutdown ? 'bg-rose-50/20' : 'hover:bg-slate-50/60'}>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{l.remarks || 'Payment Link'}</div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">ID: {l.id}</div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {l.amount > 0 ? formatCurrency(l.amount) : 'Open'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {l.upi_enabled !== false && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                              <Smartphone className="w-3 h-3" />
                              UPI
                            </span>
                          )}
                          {l.bank_enabled !== false && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-semibold">
                              <Building2 className="w-3 h-3" />
                              Bank
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {submissions.length === 0 ? (
                          <span className="text-[11px] text-slate-400 font-medium">0 Submissions</span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {hasPaid && (
                              <button
                                type="button"
                                onClick={() => setViewingSubmissionsLink(l)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 transition-colors cursor-pointer shadow-2xs"
                                title="Click to view Review Done payment submissions"
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-700 stroke-[3]" />
                                Review Done ✓ ({submissions.filter((s) => s.status === 'Paid').length})
                              </button>
                            )}
                            {hasPending && (
                              <button
                                type="button"
                                onClick={() => setViewingSubmissionsLink(l)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors cursor-pointer shadow-2xs animate-pulse"
                                title="Click to view pending verification submissions"
                              >
                                <Clock className="w-3.5 h-3.5 text-amber-700" />
                                Pending Review ({submissions.filter((s) => s.status === 'Pending Confirmation').length})
                              </button>
                            )}
                            {!hasPaid && !hasPending && hasRejected && (
                              <button
                                type="button"
                                onClick={() => setViewingSubmissionsLink(l)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 transition-colors cursor-pointer shadow-2xs"
                              >
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                                Rejected ({submissions.filter((s) => s.status === 'Rejected').length})
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setViewingSubmissionsLink(l)}
                              className="text-[11px] text-blue-700 hover:underline font-semibold cursor-pointer ml-0.5"
                            >
                              View All ({submissions.length})
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {isShutdown ? (
                          <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                            Inactive
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">{formatDate(l.created_at)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setViewingSubmissionsLink(l)}
                            leftIcon={<Receipt className="w-3.5 h-3.5 text-blue-600" />}
                            className="font-medium text-blue-700 hover:bg-blue-50"
                            title="View submissions history & review status"
                          >
                            Submissions ({submissions.length})
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEditLink(l)}
                            leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                          >
                            Edit
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant={isShutdown ? 'outline' : 'secondary'}
                            onClick={() => handleToggleShutdown(l)}
                            isLoading={actionLoadingId === l.id}
                            leftIcon={<Power className={`w-3.5 h-3.5 ${isShutdown ? 'text-emerald-600' : 'text-rose-600'}`} />}
                            className={isShutdown ? 'text-emerald-700' : 'text-rose-700'}
                          >
                            {isShutdown ? 'Activate' : 'Shutdown'}
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(l.id, l)}
                          >
                            {copiedId === l.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleShareWhatsApp(l)}
                          >
                            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                          </Button>

                          <a
                            href={linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-500 hover:text-blue-600 rounded hover:bg-slate-100"
                            title="Open Link"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>

                          <button
                            type="button"
                            onClick={() => setDeletingLink(l)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: EDIT LINK */}
      {editingLink && (
        <Modal
          isOpen={!!editingLink}
          onClose={() => setEditingLink(null)}
          title="Edit Payment Link"
          maxWidth="lg"
        >
          <form onSubmit={handleSaveLink} className="space-y-4">
            <Input
              label="Link Reference / Title"
              value={editRemarks}
              onChange={(e) => setEditRemarks(e.target.value)}
              placeholder="e.g. Monthly Settlement / Invoice"
              required
            />

            <Input
              label="Payment Amount (₹)"
              type="number"
              min={0}
              placeholder="Amount in ₹ (Leave empty for open amount)"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
            />

            {/* Payment Mode Toggles */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="block text-xs font-semibold text-slate-800">
                Payment Modes:
              </label>
              <div className="flex items-center gap-5 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editUpiEnabled}
                    onChange={(e) => setEditUpiEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>UPI Payment</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editBankEnabled}
                    onChange={(e) => setEditBankEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Bank Account Transfer</span>
                </label>
              </div>
            </div>

            {/* UPI Settings if UPI enabled */}
            {editUpiEnabled && (
              <div className="space-y-3 p-3 border border-slate-200 rounded-xl bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-bold text-slate-800">UPI Configuration</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Select Existing UPI
                    </label>
                    <select
                      value={editSelectedUpiId}
                      onChange={(e) => {
                        setEditSelectedUpiId(e.target.value);
                        if (e.target.value) setEditCustomUpiId('');
                      }}
                      className="w-full h-9 px-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Default Account</option>
                      {activeUpis.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.upi_app} - {u.upi_id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Custom UPI ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. custom@upi"
                      value={editCustomUpiId}
                      onChange={(e) => {
                        setEditCustomUpiId(e.target.value);
                        if (e.target.value) setEditSelectedUpiId('');
                      }}
                      className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Bank Settings if Bank enabled */}
            {editBankEnabled && (
              <div className="space-y-3 p-3 border border-slate-200 rounded-xl bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-bold text-slate-800">Bank Accounts</span>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddBankForm(!showAddBankForm)}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add Bank
                  </Button>
                </div>

                {showAddBankForm && (
                  <div className="p-3 bg-white border border-slate-300 rounded-lg space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <Input
                        label="Bank Name"
                        placeholder="State Bank of India"
                        value={newBankName}
                        onChange={(e) => setNewBankName(e.target.value)}
                      />
                      <Input
                        label="Account Holder Name"
                        placeholder="Beneficiary Name"
                        value={newAccHolder}
                        onChange={(e) => setNewAccHolder(e.target.value)}
                      />
                      <Input
                        label="Account Number"
                        placeholder="1234567890"
                        value={newAccNumber}
                        onChange={(e) => setNewAccNumber(e.target.value)}
                      />
                      <Input
                        label="IFSC Code"
                        placeholder="SBIN0001234"
                        value={newIfsc}
                        onChange={(e) => setNewIfsc(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleAddCustomBank}
                      >
                        Save Bank
                      </Button>
                    </div>
                  </div>
                )}

                {/* Existing custom banks */}
                {editCustomBanks.length > 0 && (
                  <div className="space-y-2">
                    {editCustomBanks.map((b) => (
                      <div
                        key={b.id}
                        className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{b.bank_name}</span> &bull;{' '}
                          <span className="text-slate-600">{b.account_holder}</span>
                          <div className="font-mono text-slate-500 mt-0.5">
                            A/C: {b.account_number} | IFSC: {b.ifsc_code}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveCustomBank(b.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Remove bank"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setEditingLink(null)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSaving}>Save Changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingLink && (
        <Modal
          isOpen={!!deletingLink}
          onClose={() => setDeletingLink(null)}
          title="Delete Payment Link"
          maxWidth="sm"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Are you sure you want to delete this payment link?
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setDeletingLink(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Submissions & Review History Modal */}
      {viewingSubmissionsLink && (
        <Modal
          isOpen={!!viewingSubmissionsLink}
          onClose={() => setViewingSubmissionsLink(null)}
          title="Payment Link Submissions & Review Status"
          maxWidth="2xl"
        >
          <div className="space-y-4">
            {/* Header info card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-900 text-sm">
                    {viewingSubmissionsLink.remarks || 'Payment Link'}
                  </div>
                  <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                    ID: {viewingSubmissionsLink.id} &bull; Target Amount:{' '}
                    {viewingSubmissionsLink.amount > 0 ? formatCurrency(viewingSubmissionsLink.amount) : 'Open Amount'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(viewingSubmissionsLink.id, viewingSubmissionsLink)}
                    leftIcon={copiedId === viewingSubmissionsLink.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  >
                    {copiedId === viewingSubmissionsLink.id ? 'Copied' : 'Copy Link'}
                  </Button>
                  <a
                    href={buildPaymentLinkUrl(viewingSubmissionsLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                    Open Checkout
                  </a>
                </div>
              </div>

              {/* Perpetual Link Guarantee Banner */}
              <div className="text-[11px] text-emerald-900 bg-emerald-100/90 px-3 py-2 rounded-lg border border-emerald-300 font-medium flex items-center gap-2">
                <span className="text-emerald-700 font-bold shrink-0">⚡ सदाबहार सक्रिय लिंक (Perpetual Active Link):</span>
                <span>यह लिंक हमेशा सक्रिय रहेगा — जब-जब ग्राहक इस लिंक पर भुगतान करेंगे, प्रत्येक भुगतान यहां अलग-अलग सुरक्षित रूप से दर्ज होता जाएगा।</span>
              </div>
            </div>

            {/* List of submissions */}
            {(() => {
              const subs = getLinkSubmissions(viewingSubmissionsLink);

              if (subs.length === 0) {
                return (
                  <div className="p-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center space-y-2">
                    <Receipt className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs font-semibold text-slate-800">अभी तक कोई भुगतान पावती दर्ज नहीं हुई है</p>
                    <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                      जैसे ही कोई ग्राहक इस लिंक पर भुगतान करके UTR या रसीद जमा करेगा, वह पावती यहाँ अलग से दिखेगी और समीक्षा स्थिति अपडेट होगी।
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                    <span>कुल भुगतान प्रस्तुतियां (Total Submissions): {subs.length}</span>
                    <span className="text-emerald-700 font-semibold">
                      स्वीकृत (Review Done): {subs.filter((s) => s.status === 'Paid').length}
                    </span>
                  </div>

                  {subs.map((sub, index) => {
                    const isPaid = sub.status === 'Paid';
                    const isPending = sub.status === 'Pending Confirmation';
                    const isRejected = sub.status === 'Rejected';

                    return (
                      <div key={sub.id || index} className="space-y-2">
                        <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-slate-600">
                          <span>
                            भुगतान प्रविष्टि #{subs.length - index}{' '}
                            {index === 0 && (
                              <span className="text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 ml-1">
                                Latest Submission
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-slate-400">
                            {formatDate(sub.submitted_at || viewingSubmissionsLink.created_at)}
                          </span>
                        </div>

                        {/* REVIEW DONE (SETTLED) CARD */}
                        {isPaid && (
                          <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-500 rounded-xl shadow-xs space-y-2.5">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                <Check className="w-6 h-6 stroke-[3]" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-base font-bold text-emerald-950">
                                    समीक्षा पूर्ण एवं स्वीकृत (Review Done ✓ - Payment Settled)
                                  </h3>
                                  <span className="text-xs bg-emerald-600 text-white px-2.5 py-0.5 rounded-full font-mono font-bold tracking-wide shadow-xs">
                                    Review Done ✓
                                  </span>
                                </div>
                                <p className="text-xs text-emerald-900 mt-1 font-medium">
                                  संबंधित विभाग द्वारा आपका ₹{(sub.amount || viewingSubmissionsLink.amount).toLocaleString('en-IN')} का भुगतान पूर्ण रूप से सत्यापित व स्वीकृत (Review Done) कर लिया गया है।
                                </p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-emerald-950 font-mono flex-wrap bg-white/80 p-2.5 rounded-lg border border-emerald-200">
                                  {sub.confirmed_at && (
                                    <span>
                                      <strong>स्वीकृति समय:</strong> {formatDate(sub.confirmed_at)}
                                    </span>
                                  )}
                                  {sub.confirmed_by && (
                                    <span>
                                      • <strong>सत्यापित कर्ता:</strong> {sub.confirmed_by}
                                    </span>
                                  )}
                                  {sub.utr_number && (
                                    <span className="font-bold text-emerald-800">
                                      • <strong>सत्यापित UTR:</strong> {sub.utr_number}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {sub.screenshot_url && (
                              <div className="pt-2 border-t border-emerald-200/80 flex items-center gap-3">
                                <span className="text-xs text-emerald-950 font-semibold">Payment Proof / रसीद:</span>
                                <img
                                  src={sub.screenshot_url}
                                  alt="Proof Screenshot"
                                  className="w-14 h-14 object-cover rounded-lg border border-emerald-300 cursor-pointer hover:opacity-90 shadow-xs"
                                  onClick={() => setFullImageView(sub.screenshot_url || null)}
                                />
                                <button
                                  type="button"
                                  onClick={() => setFullImageView(sub.screenshot_url || null)}
                                  className="text-xs text-emerald-800 hover:text-emerald-950 underline font-medium cursor-pointer"
                                >
                                  View Full Receipt (बड़ी रसीद देखें)
                                </button>
                              </div>
                            )}
                            <div className="text-[11px] text-emerald-950 bg-emerald-100/90 px-3.5 py-2 rounded-lg border border-emerald-300 font-medium flex items-center gap-2">
                              <span className="text-emerald-700 font-bold">⚡ सदाबहार सक्रिय लिंक (Perpetual Active Link):</span>
                              <span>यह लिंक निरंतर सक्रिय रहेगा — भविष्य में इसी लिंक से नया अथवा पुनः भुगतान किया जा सकता है।</span>
                            </div>
                          </div>
                        )}

                        {/* PENDING CONFIRMATION CARD */}
                        {isPending && (
                          <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-xl shadow-xs space-y-2.5">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                                <Clock className="w-6 h-6" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-base font-bold text-amber-950">
                                    समीक्षा लंबित (Pending Review - Under Verification)
                                  </h3>
                                  <span className="text-xs bg-amber-500 text-white px-2.5 py-0.5 rounded-full font-mono font-bold tracking-wide shadow-xs animate-pulse">
                                    Pending Review
                                  </span>
                                </div>
                                <p className="text-xs text-amber-900 mt-1 font-medium">
                                  ग्राहक द्वारा ₹{(sub.amount || viewingSubmissionsLink.amount).toLocaleString('en-IN')} की भुगतान पावती दर्ज की गई है। प्रशासनिक मिलान प्रगति पर है।
                                </p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-amber-950 font-mono flex-wrap bg-white/80 p-2.5 rounded-lg border border-amber-200">
                                  <span>
                                    <strong>जमा समय:</strong> {formatDate(sub.submitted_at || viewingSubmissionsLink.created_at)}
                                  </span>
                                  {sub.utr_number && (
                                    <span className="font-bold text-amber-900">
                                      • <strong>दर्ज UTR:</strong> {sub.utr_number}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {sub.screenshot_url && (
                              <div className="pt-2 border-t border-amber-200/80 flex items-center gap-3">
                                <span className="text-xs text-amber-950 font-semibold">Payment Proof / रसीद:</span>
                                <img
                                  src={sub.screenshot_url}
                                  alt="Proof Screenshot"
                                  className="w-14 h-14 object-cover rounded-lg border border-amber-300 cursor-pointer hover:opacity-90 shadow-xs"
                                  onClick={() => setFullImageView(sub.screenshot_url || null)}
                                />
                                <button
                                  type="button"
                                  onClick={() => setFullImageView(sub.screenshot_url || null)}
                                  className="text-xs text-amber-800 hover:text-amber-950 underline font-medium cursor-pointer"
                                >
                                  View Full Receipt (बड़ी रसीद देखें)
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* REJECTED CARD */}
                        {isRejected && (
                          <div className="p-4 sm:p-5 bg-gradient-to-r from-rose-50 to-red-50 border-2 border-rose-400 rounded-xl shadow-xs space-y-2.5">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                <AlertTriangle className="w-6 h-6" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-base font-bold text-rose-950">
                                    भुगतान अस्वीकृत (Verification Rejected)
                                  </h3>
                                  <span className="text-xs bg-rose-600 text-white px-2.5 py-0.5 rounded-full font-mono font-bold tracking-wide shadow-xs">
                                    Rejected
                                  </span>
                                </div>
                                <p className="text-xs text-rose-900 mt-1 font-medium">
                                  कारण: {sub.rejection_reason || 'विवरण का मिलान नहीं हो सका'}
                                </p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-rose-950 font-mono flex-wrap bg-white/80 p-2.5 rounded-lg border border-rose-200">
                                  <span>
                                    <strong>जमा समय:</strong> {formatDate(sub.submitted_at || viewingSubmissionsLink.created_at)}
                                  </span>
                                  <span>
                                    • <strong>राशि:</strong> ₹{(sub.amount || viewingSubmissionsLink.amount).toLocaleString('en-IN')}
                                  </span>
                                  {sub.utr_number && (
                                    <span>
                                      • <strong>UTR:</strong> {sub.utr_number}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setViewingSubmissionsLink(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Full-Screen Proof Screenshot Modal */}
      {fullImageView && (
        <Modal
          isOpen={!!fullImageView}
          onClose={() => setFullImageView(null)}
          title="Payment Proof Screenshot (भुगतान रसीद)"
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-slate-900/5 p-2 rounded-lg border border-slate-200">
              <img
                src={fullImageView}
                alt="Full Payment Proof"
                className="max-h-[70vh] w-auto object-contain rounded"
              />
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <a
                href={fullImageView}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open original in new tab
              </a>
              <Button variant="outline" size="sm" onClick={() => setFullImageView(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
