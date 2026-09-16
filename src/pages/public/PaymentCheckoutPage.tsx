import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  Building2,
  QrCode,
  Copy,
  Check,
  Upload,
  AlertCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import { db } from '../../services/db';
import { PaymentLink, BankAccount, UpiAccount, Settings } from '../../types';
import { QRCodeDisplay } from '../../components/QRCodeDisplay';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { copyToClipboard, formatCurrency, formatDate } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export const PaymentCheckoutPage: React.FC = () => {
  const { linkId } = useParams<{ linkId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { success, error, info } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [settings, setSettings] = useState<Settings>(() => db.getSettings());
  const [activeBanks, setActiveBanks] = useState<BankAccount[]>([]);
  const [activeUpis, setActiveUpis] = useState<UpiAccount[]>([]);
  const [selectedUpi, setSelectedUpi] = useState<UpiAccount | null>(null);

  // Tabs: 'upi' | 'bank'
  const [activeTab, setActiveTab] = useState<'upi' | 'bank'>('upi');

  // Proof form state
  const [screenshotData, setScreenshotData] = useState<string>('');
  const [utrNumber, setUtrNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  // Copy helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadLinkData = async () => {
    setIsLoading(true);
    if (!linkId) {
      setIsLoading(false);
      return;
    }

    const cleanId = (linkId || '').trim().replace(/\/$/, '');
    let item = db.getPaymentLinkById(cleanId);

    const s = db.getSettings();
    setSettings(s);

    let banks = db.getActiveBankAccounts();
    setActiveBanks(banks);

    let upis = db.getActiveUpiAccounts();
    setActiveUpis(upis);

    // If link not yet stored in this browser (e.g. opened in mobile browser or from whatsapp):
    if (!item) {
      const amt = parseFloat(searchParams.get('amt') || '0');
      if (amt > 0) {
        const upiId = searchParams.get('upi') || (upis[0]?.upi_id || 'payments@upi');
        const clientName = searchParams.get('cli') || 'Client';
        const remarks = searchParams.get('rem') || 'Payment Request';
        const accId = searchParams.get('acc') || '';
        const redUrl = searchParams.get('red') || '';

        item = {
          id: cleanId,
          client_id: 'client',
          client_name: clientName,
          amount: amt,
          status: 'Pending',
          remarks: remarks,
          upi_id: upiId,
          upi_account_id: accId,
          redirect_url: redUrl,
          created_at: new Date().toISOString(),
        };
        db.savePaymentLink(item);
      }
    }

    setLink(item);

    if (item?.upi_account_id) {
      const match = upis.find((u) => u.id === item.upi_account_id);
      setSelectedUpi(match || upis.find((u) => u.upi_id === item?.upi_id) || upis[0] || null);
    } else if (item?.upi_id) {
      const match = upis.find((u) => u.upi_id === item.upi_id);
      setSelectedUpi(match || upis[0] || null);
    } else if (upis.length > 0) {
      setSelectedUpi(upis[0]);
    }

    setIsLoading(false);

    // Async sync from cloud to get latest live accounts
    try {
      const synced = await db.syncAccountsFromCloud();
      const freshBanks = synced.banks.filter((b) => b.status === 'active');
      const freshUpis = synced.upis.filter((u) => u.status === 'active');
      setActiveBanks(freshBanks);
      setActiveUpis(freshUpis);
      if (freshUpis.length > 0 && (!selectedUpi || !freshUpis.some((u) => u.id === selectedUpi?.id))) {
        setSelectedUpi(freshUpis[0]);
      }
    } catch {
      // Local fallback
    }
  };

  useEffect(() => {
    loadLinkData();

    const handleUpdate = () => {
      loadLinkData();
    };

    window.addEventListener('portal_accounts_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('focus', handleUpdate);

    let realtimeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        realtimeChannel = supabase
          .channel('checkout_accounts_realtime')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'bank_accounts' },
            () => loadLinkData()
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'upi_accounts' },
            () => loadLinkData()
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
      if (realtimeChannel && supabase) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [linkId]);

  // Handle countdown and redirect after submission
  useEffect(() => {
    if (!submittedSuccess) return;

    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          triggerRedirect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [submittedSuccess]);

  const triggerRedirect = () => {
    if (link?.redirect_url) {
      window.location.href = link.redirect_url;
      return;
    }
    if (document.referrer && !document.referrer.includes('/pay/')) {
      window.location.href = document.referrer;
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate('/client/dashboard');
    }
  };

  const handleCopy = async (key: string, text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      success('Copied', `${label} copied to clipboard`);
      setTimeout(() => setCopiedKey(null), 2000);
    } else {
      error('Copy failed');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error('Invalid File', 'Please upload an image screenshot (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      error('File Too Large', 'Please upload a screenshot under 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotData(reader.result as string);
      success('Screenshot Attached', 'Ready to submit proof.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link) return;

    if (!screenshotData) {
      error('Screenshot Required', 'Please attach your payment screenshot or receipt before confirming.');
      return;
    }

    setIsSubmitting(true);
    try {
      await db.submitPaymentProof(link.id, {
        screenshot_url: screenshotData,
        utr_number: utrNumber.trim(),
      });

      setSubmittedSuccess(true);
      success('Proof Submitted', 'Your payment is now pending admin confirmation.');
      loadLinkData();
    } catch {
      error('Submission Error', 'Failed to submit payment proof. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-sm w-full p-8 rounded-2xl border border-slate-200 text-center space-y-4 shadow-sm">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div>
            <h3 className="text-base font-bold text-slate-900">Loading Payment Details</h3>
            <p className="text-xs text-slate-500 mt-1">Verifying secure UPI & settlement link...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full p-8 rounded-2xl shadow-sm border border-slate-200 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Payment Link Not Found</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            This payment link is either invalid, has expired, or was revoked by administration.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button variant="outline" onClick={() => navigate('/login')}>
              Go to Portal Login
            </Button>
            <Button onClick={() => navigate('/client/dashboard')}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Active UPI details
  const upiId = selectedUpi?.upi_id || link.upi_id || 'primary@upi';
  const payeeName = settings.company_name || 'Payment Portal';
  const noteText = link.remarks || `Settlement Ref #${link.id.slice(-6)}`;

  // Construct UPI Intent URIs
  const rawIntentUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    payeeName
  )}&am=${link.amount}&cu=INR&tn=${encodeURIComponent(noteText)}`;

  const phonepeIntent = `phonepe://upi/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    payeeName
  )}&am=${link.amount}&cu=INR&tn=${encodeURIComponent(noteText)}`;

  const gpayIntent = `tez://upi/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    payeeName
  )}&am=${link.amount}&cu=INR&tn=${encodeURIComponent(noteText)}`;

  const paytmIntent = `paytmmp://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    payeeName
  )}&am=${link.amount}&cu=INR&tn=${encodeURIComponent(noteText)}`;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between py-6 px-4 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="max-w-xl mx-auto w-full mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              settings.company_name.charAt(0) || 'P'
            )}
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">
              {settings.company_name || 'Payment Portal'}
            </h1>
            <p className="text-[10px] text-slate-500">Official Settlement Portal</p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Verified Gateway</span>
        </div>
      </div>

      {/* Main Card */}
      <div className="max-w-xl mx-auto w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Invoice Summary Header */}
        <div className="bg-gradient-to-b from-slate-50 to-white p-6 border-b border-slate-100 text-center">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Amount Due
          </span>
          <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            {formatCurrency(link.amount)}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-left text-xs">
            <div>
              <span className="text-[11px] text-slate-400 block">Billed To</span>
              <span className="font-semibold text-slate-800">{link.client_name || 'Valued Client'}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Payment Purpose</span>
              <span className="font-medium text-slate-700 truncate block">
                {link.remarks || 'Account Settlement'}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="text-xs text-slate-500">Status:</span>
            {link.status === 'Paid' && <Badge variant="paid">Payment Confirmed</Badge>}
            {link.status === 'Pending Confirmation' && (
              <Badge variant="review">Pending Admin Confirmation</Badge>
            )}
            {link.status === 'Pending' && <Badge variant="pending">Awaiting Payment</Badge>}
            {link.status === 'Rejected' && <Badge variant="rejected">Verification Rejected</Badge>}
          </div>
        </div>

        {/* IF ALREADY PAID */}
        {link.status === 'Paid' && (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border-2 border-emerald-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Payment Successfully Verified!</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                This transaction was confirmed by the finance desk. Your settlement is complete.
              </p>
            </div>
            {link.confirmed_at && (
              <p className="text-[11px] text-slate-400">
                Verified on {formatDate(link.confirmed_at)}
              </p>
            )}
            <div className="pt-2">
              <Button variant="outline" onClick={triggerRedirect}>
                Return to Portal
              </Button>
            </div>
          </div>
        )}

        {/* IF PENDING CONFIRMATION */}
        {link.status === 'Pending Confirmation' && !submittedSuccess && (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border-2 border-amber-200">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Proof Under Verification</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Your payment screenshot has been received and is currently in the administrator's review queue. It will be confirmed shortly.
              </p>
            </div>

            {link.screenshot_url && (
              <div className="pt-2">
                <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">
                  Submitted Receipt:
                </span>
                <img
                  src={link.screenshot_url}
                  alt="Proof"
                  className="w-36 h-36 object-cover rounded-xl border border-slate-200 mx-auto shadow-xs"
                />
              </div>
            )}

            {link.utr_number && (
              <div className="inline-block px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-mono text-slate-700">
                Reference / UTR: <strong className="text-slate-900">{link.utr_number}</strong>
              </div>
            )}

            <div className="pt-3">
              <Button variant="outline" onClick={triggerRedirect}>
                Back to Dashboard
              </Button>
            </div>
          </div>
        )}

        {/* IF PENDING PAYMENT (Normal Flow) */}
        {link.status === 'Pending' && (
          <div className="p-6 space-y-6">
            {/* Method Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => setActiveTab('upi')}
                className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'upi'
                    ? 'bg-white text-blue-600 shadow-xs font-bold'
                    : 'hover:text-slate-900'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>Instant UPI & QR</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('bank')}
                className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'bank'
                    ? 'bg-white text-blue-600 shadow-xs font-bold'
                    : 'hover:text-slate-900'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Bank Transfer (NEFT/IMPS)</span>
              </button>
            </div>

            {/* TAB 1: UPI & APP INTENT */}
            {activeTab === 'upi' && (
              <div className="space-y-5">
                {/* Active Receiving UPI Card & Switcher */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                        <Smartphone className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900">
                            {selectedUpi?.account_name || 'Designated UPI'}
                          </span>
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold border border-emerald-200">
                            Active Payee
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-600 block">{upiId}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy('active_upi', upiId, 'Receiving UPI ID')}
                      className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs flex items-center gap-1 transition-colors"
                      title="Copy UPI ID"
                    >
                      {copiedKey === 'active_upi' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-[11px] font-medium text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-medium">Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {activeUpis.length > 1 && (
                    <div className="pt-2 border-t border-slate-200/60">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                          Switch Receiving UPI Handle:
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {activeUpis.length} accounts available
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {activeUpis.map((u) => {
                          const isCurrent = upiId === u.upi_id;
                          return (
                            <button
                              type="button"
                              key={u.id}
                              onClick={() => setSelectedUpi(u)}
                              className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1.5 ${
                                isCurrent
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <span className="font-semibold">{u.account_name}</span>
                              <span
                                className={`text-[10px] font-mono ${
                                  isCurrent ? 'text-blue-100' : 'text-slate-400'
                                }`}
                              >
                                {u.upi_id}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile One-Click Pay via App Buttons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Pay Directly Via Installed App
                    </span>
                    <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded">
                      Pre-filled Amount
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* PhonePe */}
                    <a
                      href={phonepeIntent}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#5f259f]/5 hover:bg-[#5f259f]/10 border border-[#5f259f]/20 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#5f259f] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                          P
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-bold text-slate-900 block group-hover:text-[#5f259f]">
                            PhonePe
                          </span>
                          <span className="text-[10px] text-slate-500">Tap to pay ₹{link.amount}</span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#5f259f] group-hover:translate-x-0.5 transition-transform" />
                    </a>

                    {/* Google Pay */}
                    <a
                      href={gpayIntent}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#1a73e8]/5 hover:bg-[#1a73e8]/10 border border-[#1a73e8]/20 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#1a73e8] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                          G
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-bold text-slate-900 block group-hover:text-[#1a73e8]">
                            Google Pay
                          </span>
                          <span className="text-[10px] text-slate-500">Tap to pay ₹{link.amount}</span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#1a73e8] group-hover:translate-x-0.5 transition-transform" />
                    </a>

                    {/* Paytm */}
                    <a
                      href={paytmIntent}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#00b9f5]/5 hover:bg-[#00b9f5]/10 border border-[#00b9f5]/20 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#002e6e] text-[#00b9f5] flex items-center justify-center font-bold text-xs shadow-xs">
                          ₹
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-bold text-slate-900 block group-hover:text-[#002e6e]">
                            Paytm UPI
                          </span>
                          <span className="text-[10px] text-slate-500">Tap to pay ₹{link.amount}</span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#002e6e] group-hover:translate-x-0.5 transition-transform" />
                    </a>

                    {/* Any Other UPI App */}
                    <a
                      href={rawIntentUri}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                          ⚡
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-bold text-slate-900 block">
                            Other UPI App
                          </span>
                          <span className="text-[10px] text-slate-500">BHIM, Cred, Amazon</span>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-900" />
                    </a>
                  </div>
                </div>

                {/* QR Code Divider / Alternative */}
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink mx-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Or Scan QR Code
                  </span>
                  <div className="flex-grow border-t border-slate-200"></div>
                </div>

                {/* Scannable Dynamic QR Code */}
                <div className="flex flex-col items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <QRCodeDisplay
                    upiId={upiId}
                    payeeName={payeeName}
                    amount={link.amount}
                    size={175}
                    showActions={false}
                  />

                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono">{upiId}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('upi', upiId, 'UPI ID')}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white rounded transition-colors"
                      title="Copy UPI ID"
                    >
                      {copiedKey === 'upi' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 text-center">
                    Amount of {formatCurrency(link.amount)} is automatically locked into this QR code.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: BANK TRANSFER */}
            {activeTab === 'bank' && (
              <div className="space-y-4">
                {activeBanks.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    No active bank accounts are currently available. Please use UPI.
                  </div>
                ) : (
                  activeBanks.map((b) => (
                    <div
                      key={b.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{b.bank_name}</span>
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold border border-blue-200">
                          IMPS / NEFT / RTGS
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                              Account Number
                            </span>
                            <span className="font-mono font-bold text-slate-900">
                              {b.account_number}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(`acc_${b.id}`, b.account_number, 'Account Number')}
                          >
                            {copiedKey === `acc_${b.id}` ? 'Copied' : 'Copy'}
                          </Button>
                        </div>

                        <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                              IFSC Code
                            </span>
                            <span className="font-mono font-bold text-slate-900 uppercase">
                              {b.ifsc_code}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(`ifsc_${b.id}`, b.ifsc_code, 'IFSC Code')}
                          >
                            {copiedKey === `ifsc_${b.id}` ? 'Copied' : 'Copy'}
                          </Button>
                        </div>

                        <div className="pt-1">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                            Beneficiary Name
                          </span>
                          <span className="font-semibold text-slate-800">{b.account_holder}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* PAYMENT CONFIRMATION / PROOF UPLOAD (User requested flow) */}
            <form onSubmit={handleSubmitProof} className="pt-4 border-t border-slate-200 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Step 2: Upload Payment Screenshot <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Required for verification</span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  After completing payment via your UPI app or bank, upload the screenshot or receipt below.
                </p>

                {/* Screenshot Upload Dropzone */}
                <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-4 text-center transition-colors bg-slate-50/50">
                  {screenshotData ? (
                    <div className="space-y-3">
                      <img
                        src={screenshotData}
                        alt="Uploaded Proof"
                        className="max-h-48 rounded-lg mx-auto border border-slate-200 object-contain shadow-xs"
                      />
                      <div className="flex items-center justify-center gap-3">
                        <label className="text-xs text-blue-600 hover:underline cursor-pointer font-semibold">
                          Change Screenshot
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </label>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => setScreenshotData('')}
                          className="text-xs text-rose-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer block py-4">
                      <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
                        <Upload className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Click or Tap to Upload Screenshot
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Supports JPG, PNG, WebP (Max 8MB)
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                        required
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* UTR / Reference No */}
              <Input
                label="UTR / UPI Reference Number (Optional)"
                placeholder="e.g. 12-digit UPI reference (e.g. 428910482910)"
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value)}
                helperText="Found on your payment app receipt"
              />

              {/* Submit Confirmation Button */}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                isLoading={isSubmitting}
                disabled={!screenshotData}
                leftIcon={<Check className="w-4 h-4" />}
              >
                Submit Payment Confirmation
              </Button>

              <p className="text-[11px] text-center text-slate-400">
                Once submitted, this page will close and you will be redirected automatically.
              </p>
            </form>
          </div>
        )}
      </div>

      {/* SUCCESS OVERLAY (User requested: "jese hi ss daalta he payment page waha se close ho jaye or client jaha se aaya waha wapas redirect ho jaye") */}
      {submittedSuccess && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto border-2 border-emerald-300">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">Payment Proof Submitted!</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Your payment confirmation has been submitted to the admin panel with status{' '}
                <strong className="text-slate-800">"Pending Confirmation"</strong>.
              </p>
            </div>

            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-800 flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 animate-spin text-blue-600" />
              <span>Redirecting you back in {redirectCountdown}s...</span>
            </div>

            <div className="pt-2">
              <Button className="w-full" onClick={triggerRedirect}>
                Return Immediately
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Support */}
      <div className="max-w-xl mx-auto w-full text-center mt-6 text-xs text-slate-400">
        Need assistance? Email{' '}
        <a
          href={`mailto:${settings.support_email}`}
          className="text-slate-600 font-medium hover:underline"
        >
          {settings.support_email}
        </a>{' '}
        or call{' '}
        <a
          href={`tel:${settings.support_phone}`}
          className="text-slate-600 font-medium hover:underline"
        >
          {settings.support_phone}
        </a>
      </div>
    </div>
  );
};
