import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  QrCode,
  Copy,
  Check,
  Download,
  Link as LinkIcon,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Info,
  ExternalLink,
  Share2,
  Smartphone,
} from 'lucide-react';
import { BankAccount, UpiAccount, PaymentLink } from '../../types';
import { db } from '../../services/db';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { QRCodeDisplay } from '../../components/QRCodeDisplay';
import { copyToClipboard, buildPaymentLinkUrl } from '../../lib/utils';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export const ClientDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success, error, info } = useToast();

  const [activeBanks, setActiveBanks] = useState<BankAccount[]>([]);
  const [activeUpis, setActiveUpis] = useState<UpiAccount[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [qrModalUpi, setQrModalUpi] = useState<UpiAccount | null>(null);

  // Generate Payment Link Modal
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [selectedUpiId, setSelectedUpiId] = useState('');
  const [createdLink, setCreatedLink] = useState<PaymentLink | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Real-time synchronization for direct client logins & cross-device updates
  const refreshAccounts = async () => {
    // 1. Instant local read
    const localBanks = db.getActiveBankAccounts();
    const localUpis = db.getActiveUpiAccounts();
    setActiveBanks(localBanks);
    setActiveUpis(localUpis);
    if (localUpis.length > 0 && !selectedUpiId) {
      setSelectedUpiId(localUpis[0].id);
    }

    // 2. Cloud sync if remote Supabase is configured
    try {
      const synced = await db.syncAccountsFromCloud();
      const activeRemoteBanks = synced.banks.filter((b) => b.status === 'active');
      const activeRemoteUpis = synced.upis.filter((u) => u.status === 'active');
      if (activeRemoteBanks.length > 0) setActiveBanks(activeRemoteBanks);
      if (activeRemoteUpis.length > 0) {
        setActiveUpis(activeRemoteUpis);
        if (!selectedUpiId) setSelectedUpiId(activeRemoteUpis[0].id);
      }
    } catch {
      // Local fallback active
    }
  };

  useEffect(() => {
    refreshAccounts();

    const handleUpdate = () => {
      refreshAccounts();
    };

    window.addEventListener('portal_accounts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('payment_portal_channel');
      channel.onmessage = () => {
        refreshAccounts();
      };
    } catch {
      // Ignore
    }

    // Firebase Firestore Realtime Sync across all devices & browsers
    const unsubFirestore = db.subscribeToRealtimeUpdates(() => {
      refreshAccounts();
    });

    // Realtime Supabase changes across different devices/browsers (if Supabase also present)
    let realtimeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        realtimeChannel = supabase
          .channel('client_dashboard_realtime')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'bank_accounts' },
            () => refreshAccounts()
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'upi_accounts' },
            () => refreshAccounts()
          )
          .subscribe();
      } catch (err) {
        console.warn('Realtime channel error:', err);
      }
    }

    return () => {
      window.removeEventListener('portal_accounts_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
      if (channel) {
        channel.close();
      }
      unsubFirestore();
      if (realtimeChannel && supabase) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  const handleCopy = async (id: string, text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedField(id);
      success('Copied to Clipboard', `${label}: ${text}`);
      setTimeout(() => setCopiedField(null), 2500);
    } else {
      error('Copy failed', 'Please select and copy manually.');
    }
  };

  const handleCopyAll = async (bank: BankAccount) => {
    const allText = `Bank Name: ${bank.bank_name}
Account Holder: ${bank.account_holder}
Account Number: ${bank.account_number}
IFSC Code: ${bank.ifsc_code}
Branch: ${bank.branch || 'Main Branch'}`;

    const ok = await copyToClipboard(allText);
    if (ok) {
      setCopiedField(`all_${bank.id}`);
      success('All Details Copied', 'Full bank account coordinates copied to clipboard.');
      setTimeout(() => setCopiedField(null), 2500);
    } else {
      error('Copy failed');
    }
  };

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = amount.trim() ? parseFloat(amount) : 0;
    if (amount.trim() && (isNaN(val) || val < 0)) {
      error('Invalid Amount', 'Please enter a valid positive amount or leave empty.');
      return;
    }

    if (!selectedUpiId && activeUpis.length > 0) {
      error('UPI Selection Required', 'Please choose a receiving UPI account.');
      return;
    }

    try {
      const newLink = await db.createPaymentLink(
        user?.clientId || user?.id || 'client',
        val,
        purpose || 'Client Payment Link Request',
        user?.full_name || 'Client',
        user?.id || 'client',
        '',
        selectedUpiId || undefined
      );

      setCreatedLink(newLink);
      setIsGenerateModalOpen(false);
      setAmount('');
      setPurpose('');
      success('Payment Link Ready', 'Live checkout URL generated with UPI intent.');
    } catch {
      error('Failed to submit link request');
    }
  };

  const handleShareWhatsApp = (l: PaymentLink) => {
    const url = buildPaymentLinkUrl(l);
    const text = `Hi, please complete payment of ₹${l.amount.toLocaleString(
      'en-IN'
    )} for ${l.remarks || 'Settlement'} via this verified UPI link: ${url}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-8">
      {/* Greeting Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Verified Payment Information Portal</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Hello, {user?.full_name || 'Valued Client'}
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Below are the active, authorized company bank accounts and instant UPI QR handles assigned for your settlements. All payments made to these coordinates are verified directly.
          </p>
        </div>

        {/* Generate Payment Link Card Button */}
        <div className="shrink-0">
          <Button
            size="md"
            onClick={() => setIsGenerateModalOpen(true)}
            leftIcon={<LinkIcon className="w-4 h-4" />}
          >
            Generate Payment Link
          </Button>
        </div>
      </div>

      {/* BANK ACCOUNTS SECTION - Sleek Table List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">Direct Bank Transfer Accounts</h2>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {activeBanks.length} active {activeBanks.length === 1 ? 'account' : 'accounts'}
          </span>
        </div>

        {activeBanks.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
            No active bank accounts are currently assigned.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px] font-semibold">
                    <th className="py-3 px-4">Account Holder (Beneficiary)</th>
                    <th className="py-3 px-4">Bank & Branch</th>
                    <th className="py-3 px-4">Account Number</th>
                    <th className="py-3 px-4">IFSC Code</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeBanks.map((bank) => {
                    const isAccCopied = copiedField === `acc_${bank.id}`;
                    const isIfscCopied = copiedField === `ifsc_${bank.id}`;
                    const isHolderCopied = copiedField === `holder_${bank.id}`;
                    const isAllCopied = copiedField === `all_${bank.id}`;

                    return (
                      <tr key={bank.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-sm sm:text-[15px]">
                              {bank.account_holder}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(`holder_${bank.id}`, bank.account_holder, 'Beneficiary Name')}
                              className="text-slate-400 hover:text-blue-600 p-0.5 transition-colors"
                              title="Copy Beneficiary Name"
                            >
                              {isHolderCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 font-medium text-xs text-blue-700 bg-blue-50/90 border border-blue-200 px-2.5 py-0.5 rounded-md">
                            <Building2 className="w-3 h-3 text-blue-600 shrink-0" />
                            <span className="font-semibold">{bank.bank_name}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{bank.branch || 'Main Branch'}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-900 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
                            <span>{bank.account_number}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(`acc_${bank.id}`, bank.account_number, 'Account Number')}
                              className="text-slate-400 hover:text-blue-600 p-0.5 transition-colors"
                              title="Copy Account Number"
                            >
                              {isAccCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-900 bg-slate-50 px-2 py-1 rounded border border-slate-200 uppercase">
                            <span>{bank.ifsc_code}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(`ifsc_${bank.id}`, bank.ifsc_code, 'IFSC Code')}
                              className="text-slate-400 hover:text-blue-600 p-0.5 transition-colors"
                              title="Copy IFSC Code"
                            >
                              {isIfscCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyAll(bank)}
                            leftIcon={
                              isAllCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )
                            }
                          >
                            {isAllCopied ? 'Copied' : 'Copy All'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Compact List View */}
            <div className="md:hidden divide-y divide-slate-100">
              {activeBanks.map((bank) => {
                const isAccCopied = copiedField === `acc_${bank.id}`;
                const isIfscCopied = copiedField === `ifsc_${bank.id}`;
                const isHolderCopied = copiedField === `holder_${bank.id}`;
                const isAllCopied = copiedField === `all_${bank.id}`;

                return (
                  <div key={bank.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                          Account Holder (Beneficiary)
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-bold text-slate-900 text-base">
                            {bank.account_holder}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(`holder_${bank.id}`, bank.account_holder, 'Beneficiary Name')}
                            className="p-1 text-slate-400 hover:text-blue-600"
                            title="Copy Beneficiary Name"
                          >
                            {isHolderCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                            <Building2 className="w-3 h-3 text-blue-600 shrink-0" />
                            {bank.bank_name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            ({bank.branch || 'Main Branch'})
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                        Active
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">Account No.</span>
                        <div className="flex items-center justify-between font-mono font-semibold text-slate-900 mt-0.5">
                          <span className="truncate">{bank.account_number}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(`acc_${bank.id}`, bank.account_number, 'Account Number')}
                            className="p-1 text-slate-500 hover:text-blue-600"
                          >
                            {isAccCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">IFSC Code</span>
                        <div className="flex items-center justify-between font-mono font-semibold text-slate-900 mt-0.5 uppercase">
                          <span>{bank.ifsc_code}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(`ifsc_${bank.id}`, bank.ifsc_code, 'IFSC Code')}
                            className="p-1 text-slate-500 hover:text-blue-600"
                          >
                            {isIfscCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => handleCopyAll(bank)}
                        className="w-full text-center py-1.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5"
                      >
                        {isAllCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{isAllCopied ? 'All Details Copied' : 'Copy All Details'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* UPI SECTION - Sleek Table List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">Instant UPI Accounts</h2>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {activeUpis.length} active {activeUpis.length === 1 ? 'handle' : 'handles'}
          </span>
        </div>

        {activeUpis.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
            No active UPI IDs currently configured.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px] font-semibold">
                    <th className="py-3 px-4">UPI Service / App</th>
                    <th className="py-3 px-4">UPI ID</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeUpis.map((upi) => {
                    const isUpiCopied = copiedField === `upi_${upi.id}`;

                    return (
                      <tr key={upi.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs">
                              <Smartphone className="w-3.5 h-3.5" />
                            </div>
                            <span>{upi.upi_app}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-800 text-sm">
                          {upi.upi_id}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Active
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopy(`upi_${upi.id}`, upi.upi_id, 'UPI ID')}
                              leftIcon={
                                isUpiCopied ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )
                              }
                            >
                              {isUpiCopied ? 'Copied' : 'Copy UPI'}
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setQrModalUpi(upi)}
                              leftIcon={<QrCode className="w-3.5 h-3.5" />}
                            >
                              Scan QR
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Compact List View */}
            <div className="md:hidden divide-y divide-slate-100">
              {activeUpis.map((upi) => {
                const isUpiCopied = copiedField === `upi_${upi.id}`;

                return (
                  <div key={upi.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900 text-xs">{upi.upi_app}</span>
                        <span className="text-[10px] text-emerald-700 font-medium">&bull; Active</span>
                      </div>
                      <div className="font-mono text-xs text-slate-700 truncate mt-0.5">{upi.upi_id}</div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(`upi_${upi.id}`, upi.upi_id, 'UPI ID')}
                        title="Copy UPI ID"
                      >
                        {isUpiCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setQrModalUpi(upi)}
                        leftIcon={<QrCode className="w-3.5 h-3.5" />}
                      >
                        QR
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* QR Code Focused Modal */}
      {qrModalUpi && (
        <Modal
          isOpen={!!qrModalUpi}
          onClose={() => setQrModalUpi(null)}
          title={`${qrModalUpi.upi_app} QR Code`}
          description="Scan using any UPI app on your mobile device to complete payment."
          maxWidth="sm"
        >
          <div className="flex flex-col items-center justify-center p-2 space-y-4">
            <QRCodeDisplay
              upiId={qrModalUpi.upi_id}
              upiApp={qrModalUpi.upi_app}
              payeeName="Payment Portal"
              qrUrl={qrModalUpi.qr_url}
              size={190}
              showActions={true}
            />

            <div className="w-full flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <span className="font-mono font-medium text-slate-700 truncate">{qrModalUpi.upi_id}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCopy(`modal_upi_${qrModalUpi.id}`, qrModalUpi.upi_id, 'UPI ID')}
              >
                {copiedField === `modal_upi_${qrModalUpi.id}` ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setQrModalUpi(null)}
            >
              Close
            </Button>
          </div>
        </Modal>
      )}

      {/* GENERATE PAYMENT LINK SECTION (Prompt specification: Card with Generate Payment Link button) */}
      <section>
        <Card className="border-dashed border-2 border-blue-200 bg-blue-50/20">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Custom Payment Link Request</h3>
              </div>
              <p className="text-xs text-slate-600 max-w-xl">
                Need a specific customized payment link for your accounting or settlement record? Create a payment link request below.
              </p>
            </div>
            <Button
              onClick={() => setIsGenerateModalOpen(true)}
              leftIcon={<LinkIcon className="w-4 h-4" />}
            >
              Generate Link
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Modal: Generate Payment Link */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title="Generate Payment Link"
        description="Select receiving UPI account and specify amount to generate instant payment link."
        maxWidth="md"
      >
        <form onSubmit={handleGenerateLink} className="space-y-4">
          {/* UPI Account Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Receiving UPI Account / Handle <span className="text-rose-500">*</span>
            </label>
            {activeUpis.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>No active UPI accounts found. Please contact administration.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {activeUpis.map((u) => {
                  const isSelected = selectedUpiId === u.id;
                  return (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => setSelectedUpiId(u.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/60 shadow-xs ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{u.upi_app}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                              Priority {u.priority}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-600">{u.upi_id}</span>
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'
                        }`}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-1">
              The payment link, QR code, and mobile app intents will automatically route funds to this chosen UPI handle.
            </p>
          </div>

          <Input
            label="Payment Amount (₹) (Optional - खुला छोड़ सकते हैं)"
            type="number"
            min={0}
            placeholder="Khali chhod sakte hain (e.g. 5000 ya blank)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            helperText="Khali chhodne par payer checkout page par apni marzi se amount daal sakega."
          />

          <Input
            label="Purpose / Note"
            placeholder="e.g. Monthly Settlement / Invoice #102"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-900 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              Deep-linking enabled: opens directly in Google Pay, PhonePe, or Paytm with the amount pre-filled.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsGenerateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Generate Link</Button>
          </div>
        </form>
      </Modal>

      {/* Success Modal for Created Link */}
      {createdLink && (
        <Modal
          isOpen={!!createdLink}
          onClose={() => setCreatedLink(null)}
          title="Payment Link Active"
          description="Your payment link is live with UPI deep-linking."
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
                  Amount
                </span>
                <div className="text-2xl font-bold text-emerald-950 mt-0.5">
                  ₹{createdLink.amount.toLocaleString('en-IN')}
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
                  Target UPI
                </span>
                <span className="text-xs font-mono font-bold text-emerald-900 bg-white/70 px-2.5 py-1 rounded-md border border-emerald-200 inline-block mt-0.5">
                  {createdLink.upi_id || 'primary@upi'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Shareable Payment URL:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={buildPaymentLinkUrl(createdLink)}
                  className="flex-1 h-9 px-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700 select-all"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const ok = await copyToClipboard(buildPaymentLinkUrl(createdLink));
                    if (ok) {
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }
                  }}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <a
                href={buildPaymentLinkUrl(createdLink)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Checkout Page</span>
              </a>

              <button
                type="button"
                onClick={() => handleShareWhatsApp(createdLink)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-semibold transition-colors shadow-xs"
              >
                <Share2 className="w-4 h-4" />
                <span>Share via WhatsApp</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const url = buildPaymentLinkUrl(createdLink);
                  const path = url.replace(window.location.origin, '');
                  navigate(path);
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                <span>Pay directly on this device &rarr;</span>
              </button>
              <Button variant="outline" size="sm" onClick={() => setCreatedLink(null)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
