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
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedUpiId, setSelectedUpiId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');

  // Generated Link Success Modal
  const [createdLink, setCreatedLink] = useState<PaymentLink | null>(null);

  // Review Proof Modal State
  const [reviewLink, setReviewLink] = useState<PaymentLink | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [fullImageView, setFullImageView] = useState<string | null>(null);

  // Copied indicator
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = () => {
    setLinks(db.getPaymentLinks());
    const cl = db.getClients();
    setClients(cl);
    if (cl.length > 0 && !clientId) {
      setClientId(cl[0].id);
    }
    const upiList = db.getActiveUpiAccounts();
    setUpis(upiList);
    if (upiList.length > 0 && !selectedUpiId) {
      setSelectedUpiId(upiList[0].id);
    }
  };

  useEffect(() => {
    loadData();
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
    const parsedAmount = parseFloat(amount);
    if (!clientId || isNaN(parsedAmount) || parsedAmount <= 0) {
      error('Invalid Input', 'Please select a client and specify a valid amount.');
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
        selectedUpiId
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
        <span className="font-bold text-sm text-slate-900">{formatCurrency(item.amount)}</span>
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
        if (item.status === 'Paid') return <Badge variant="paid">Paid</Badge>;
        if (item.status === 'Pending Confirmation') {
          return <Badge variant="review">Pending Confirmation</Badge>;
        }
        if (item.status === 'Rejected') return <Badge variant="rejected">Rejected</Badge>;
        if (item.status === 'Expired') return <Badge variant="expired">Expired</Badge>;
        return <Badge variant="pending">Pending</Badge>;
      },
    },
    {
      header: 'Proof & UTR',
      render: (item) => {
        if (item.status === 'Pending Confirmation' || item.screenshot_url) {
          return (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReviewLink(item)}
                className="group relative cursor-pointer"
                title="Click to review screenshot"
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
              className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs text-xs px-2.5 py-1"
              onClick={() => setReviewLink(item)}
              leftIcon={<Eye className="w-3.5 h-3.5" />}
            >
              Review Proof
            </Button>
          )}

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
        <Button onClick={() => setIsModalOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
          Generate Payment Link
        </Button>
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
        title="Generate Dynamic Payment Link"
        description="Creates an interactive payment link with UPI Intent (PhonePe/GPay/Paytm) and amount-encoded QR code."
        maxWidth="md"
      >
        <form onSubmit={handleCreateLink} className="space-y-4">
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
            label="Payment Amount (₹) *"
            type="number"
            min={1}
            step={1}
            placeholder="e.g. 5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
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
            helperText="Client will be automatically redirected here after uploading screenshot"
          />

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900">
            <span className="font-semibold block mb-0.5">UPI Deep Link Automation:</span>
            When the client taps on PhonePe or GPay from their phone, this exact amount will be pre-filled automatically without manual typing.
          </div>

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
          title="Payment Link Ready!"
          description="Your client can now make payment via UPI intent or scan the dynamic QR."
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
            {/* Summary Details */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div>
                <span className="text-[11px] text-slate-400 block">Client</span>
                <span className="font-bold text-slate-900">{reviewLink.client_name}</span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Amount</span>
                <span className="font-bold text-emerald-700 text-sm">
                  {formatCurrency(reviewLink.amount)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">Submitted At</span>
                <span className="text-slate-700">
                  {reviewLink.submitted_at ? formatDate(reviewLink.submitted_at) : 'Just now'}
                </span>
              </div>
              {reviewLink.utr_number && (
                <div className="col-span-2 sm:col-span-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-semibold">
                    Client Reported UTR / Ref No:
                  </span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded border border-slate-300">
                    {reviewLink.utr_number}
                  </span>
                </div>
              )}
            </div>

            {/* Screenshot Preview */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Submitted Payment Screenshot:
              </label>
              {reviewLink.screenshot_url ? (
                <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-950/5 text-center p-2">
                  <img
                    src={reviewLink.screenshot_url}
                    alt="Payment Screenshot"
                    className="max-h-72 mx-auto rounded-lg object-contain cursor-pointer hover:opacity-95 transition-opacity"
                    onClick={() => setFullImageView(reviewLink.screenshot_url || null)}
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
    </div>
  );
};
