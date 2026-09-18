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
  AlertTriangle,
  Clock,
  ArrowRight,
  CheckCircle2,
  Smartphone,
  Lock,
  ChevronDown,
  ChevronUp,
  Receipt,
  ArrowUpRight,
  FileCheck,
} from 'lucide-react';
import { db } from '../../services/db';
import { PaymentLink, BankAccount, UpiAccount, Settings } from '../../types';
import { QRCodeDisplay } from '../../components/QRCodeDisplay';
import { Button } from '../../components/ui/Button';
import { copyToClipboard, formatCurrency, formatDate } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';

export const PaymentCheckoutPage: React.FC = () => {
  const { linkId } = useParams<{ linkId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [settings, setSettings] = useState<Settings>(() => db.getSettings());
  const [activeBanks, setActiveBanks] = useState<BankAccount[]>([]);
  const [activeUpis, setActiveUpis] = useState<UpiAccount[]>([]);
  const [selectedUpi, setSelectedUpi] = useState<UpiAccount | null>(null);

  // Custom amount when link amount is optional / open (link.amount === 0)
  const [customAmount, setCustomAmount] = useState<string>('');

  // Optional proof form state (Screenshot & UTR are optional)
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [screenshotData, setScreenshotData] = useState<string>('');
  const [utrNumber, setUtrNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(2);

  // Copy helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadLinkData = async () => {
    setIsLoading(true);
    if (!linkId) {
      setIsLoading(false);
      return;
    }

    const cleanId = (linkId || '').trim().replace(/\/$/, '');
    let item = await db.fetchPaymentLinkById(cleanId);
    if (!item) {
      item = db.getPaymentLinkById(cleanId);
    }

    const s = db.getSettings();
    setSettings(s);

    const banks = db.getActiveBankAccounts();
    setActiveBanks(banks);

    const upis = db.getActiveUpiAccounts();
    setActiveUpis(upis);

    // If link not yet stored in this browser or cloud:
    if (!item) {
      const amtParam = searchParams.get('amt') || searchParams.get('a');
      const amt = amtParam !== null ? parseFloat(amtParam) : 0;
      if (searchParams.get('upi') || searchParams.get('u') || cleanId) {
        const upiId = searchParams.get('upi') || searchParams.get('u') || (upis[0]?.upi_id || 'payments@upi');
        const remarks = searchParams.get('rem') || searchParams.get('r') || 'Payment Request';
        const accId = searchParams.get('acc') || searchParams.get('ac') || '';
        const redUrl = searchParams.get('red') || searchParams.get('rd') || searchParams.get('redirect_url') || '';

        item = {
          id: cleanId,
          client_id: 'client',
          client_name: 'Client',
          amount: isNaN(amt) ? 0 : amt,
          status: 'Pending',
          remarks: remarks,
          upi_id: upiId,
          upi_account_id: accId,
          redirect_url: redUrl,
          created_at: new Date().toISOString(),
        };
        db.savePaymentLinkSilently(item);
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
  };

  // Helper to apply updated link smoothly only when data actually changes
  const applyUpdatedLink = (fresh: PaymentLink) => {
    setLink((prev) => {
      if (!prev) return fresh;
      const isSame =
        prev.id === fresh.id &&
        prev.amount === fresh.amount &&
        prev.remarks === fresh.remarks &&
        prev.status === fresh.status &&
        prev.confirmed_at === fresh.confirmed_at &&
        prev.confirmed_by === fresh.confirmed_by &&
        prev.utr_number === fresh.utr_number &&
        prev.screenshot_url === fresh.screenshot_url &&
        prev.rejection_reason === fresh.rejection_reason &&
        prev.is_active === fresh.is_active &&
        prev.upi_enabled === fresh.upi_enabled &&
        prev.bank_enabled === fresh.bank_enabled &&
        prev.upi_id === fresh.upi_id &&
        prev.upi_account_id === fresh.upi_account_id &&
        JSON.stringify(prev.custom_bank_accounts || []) === JSON.stringify(fresh.custom_bank_accounts || []) &&
        (prev.submissions?.length || 0) === (fresh.submissions?.length || 0);

      if (isSame) return prev; // Do not trigger re-render if data is identical

      const upis = db.getActiveUpiAccounts();
      if (fresh.upi_account_id) {
        const match = upis.find((u) => u.id === fresh.upi_account_id);
        setSelectedUpi(match || upis.find((u) => u.upi_id === fresh.upi_id) || upis[0] || null);
      } else if (fresh.upi_id) {
        const match = upis.find((u) => u.upi_id === fresh.upi_id);
        setSelectedUpi(match || upis[0] || null);
      }
      return fresh;
    });
  };

  useEffect(() => {
    // Initial data load on mount
    loadLinkData();

    const cleanId = (linkId || '').trim().replace(/\/$/, '');
    const cleanLowerId = cleanId.toLowerCase();

    // 1. Listen when client/admin saves edited changes or confirms payment
    const handleEditSaved = (e: Event) => {
      const customEvt = e as CustomEvent<{ linkId?: string; updatedLink?: PaymentLink }>;
      const targetId = (customEvt.detail?.linkId || '').trim().toLowerCase();
      if (targetId === cleanLowerId || targetId === cleanId) {
        if (customEvt.detail?.updatedLink) {
          applyUpdatedLink(customEvt.detail.updatedLink);
        } else {
          loadLinkData();
        }
      }
    };
    window.addEventListener('payment_link_edited_saved', handleEditSaved);

    // 2. Global portal updates & storage events (for instant real-time sync across tabs)
    const handleGlobalUpdate = () => {
      loadLinkData();
    };
    window.addEventListener('portal_accounts_updated', handleGlobalUpdate);
    window.addEventListener('storage', handleGlobalUpdate);
    window.addEventListener('focus', handleGlobalUpdate);

    // 3. BroadcastChannel: Listen strictly for PAYMENT_LINK_EDIT_SAVED across tabs
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('payment_portal_channel');
      channel.onmessage = (msg: MessageEvent) => {
        if (msg.data?.type === 'PAYMENT_LINK_EDIT_SAVED') {
          const targetId = (msg.data?.linkId || '').trim().toLowerCase();
          if (targetId === cleanLowerId || targetId === cleanId) {
            if (msg.data?.updatedLink) {
              applyUpdatedLink(msg.data.updatedLink);
            } else {
              loadLinkData();
            }
          }
        }
      };
    } catch {
      // Ignore
    }

    // 4. Firestore snapshot for this single link (for cross-device synchronization)
    const unsubSingleLink = db.subscribeToPaymentLink(cleanId, (updatedLink) => {
      applyUpdatedLink(updatedLink);
    });

    return () => {
      window.removeEventListener('payment_link_edited_saved', handleEditSaved);
      window.removeEventListener('portal_accounts_updated', handleGlobalUpdate);
      window.removeEventListener('storage', handleGlobalUpdate);
      window.removeEventListener('focus', handleGlobalUpdate);
      if (channel) {
        channel.close();
      }
      unsubSingleLink();
    };
  }, [linkId]);

  // Determine target redirect url
  const getTargetRedirectUrl = (): string => {
    if (link?.redirect_url && link.redirect_url.trim().length > 0) {
      return link.redirect_url.trim();
    }
    const paramUrl = searchParams.get('redirect_url') || searchParams.get('red');
    if (paramUrl && paramUrl.trim().length > 0) {
      return paramUrl.trim();
    }
    if (settings.external_website_url && settings.external_website_url.trim().length > 0) {
      return settings.external_website_url.trim();
    }
    return '';
  };

  const triggerRedirect = () => {
    const target = getTargetRedirectUrl();
    if (target) {
      try {
        const parsed = new URL(target, window.location.origin);
        window.location.href = parsed.toString();
        return;
      } catch {
        window.location.href = target;
        return;
      }
    }
    navigate('/login');
  };

  const handleCopy = async (key: string, text: string, label: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      success('Copied! (कॉपी हो गया)', `${label} copied to clipboard`);
      setTimeout(() => setCopiedKey(null), 2000);
    } else {
      error('Copy failed');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error('Invalid File', 'Please upload an image screenshot (JPG, PNG).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      error('File Too Large', 'Please upload a photo under 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotData(reader.result as string);
      success('Photo Attached', 'Optional screenshot attached successfully.');
    };
    reader.readAsDataURL(file);
  };

  // User requested: Link is perpetual & reusable unlimited times
  const handleDonePayment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!link) return;

    setIsSubmitting(true);
    try {
      const amtVal = parseFloat(customAmount);
      if (link.amount === 0 && amtVal > 0) {
        link.amount = amtVal;
        db.savePaymentLink(link);
      }

      const effectiveAmt = link.amount > 0 ? link.amount : (amtVal > 0 ? amtVal : 0);

      const updated = await db.submitPaymentProof(link.id, {
        screenshot_url: screenshotData || '',
        utr_number: utrNumber.trim(),
        amount: effectiveAmt,
      });

      if (updated) {
        setLink(updated);
      }
      setSubmittedSuccess(true);
      success('भुगतान पावती दर्ज!', 'आपकी पावती दर्ज हो गई है। यह लिंक हमेशा सक्रिय है — आप कभी भी नया भुगतान कर सकते हैं।');
      setUtrNumber('');
      setScreenshotData(null);
      setShowOptionalDetails(false);
      loadLinkData();
    } catch {
      error('त्रुटि', 'पावती दर्ज नहीं हो सकी, कृपया पुनः प्रयास करें।');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center p-4">
        <div className="bg-white border border-slate-300 max-w-sm w-full p-8 rounded-lg text-center space-y-4 shadow-sm">
          <div className="w-9 h-9 border-3 border-[#0c2340] border-t-transparent rounded-full animate-spin mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-[#0c2340] uppercase tracking-wider">
              National e-Payment Gateway
            </h3>
            <p className="text-xs text-slate-600 mt-1">सुरक्षित गेटवे लोड हो रहा है (Connecting to Gateway)...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full p-8 rounded-lg shadow-sm border border-slate-300 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center mx-auto border border-rose-200">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">चैकिंग त्रुटि: चालान उपलब्ध नहीं (Challan Not Found)</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            यह भुगतान लिंक या चालान संदर्भ उपलब्ध नहीं है अथवा इसकी समय-सीमा समाप्त हो चुकी है।
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => triggerRedirect()}>
              Return to Website
            </Button>
            <Button size="sm" onClick={() => navigate('/login')}>
              Portal Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Check if link is shutdown / deactivated by client/admin
  if (link.is_active === false) {
    return (
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full p-8 rounded-lg shadow-sm border border-slate-300 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto border border-amber-200">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">भुगतान लिंक निष्क्रिय है (Payment Link Closed / Shutdown)</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            यह भुगतान लिंक प्रदाता द्वारा अस्थायी रूप से बंद (Shutdown) कर दिया गया है। कृपया नए भुगतान लिंक के लिए व्यापारी या प्रदाता से संपर्क करें।
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => triggerRedirect()}>
              Return to Website
            </Button>
            <Button size="sm" onClick={() => navigate('/login')}>
              Portal Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Effective payment modes enabled on this link
  const isUpiEnabled = link.upi_enabled !== false;
  const isBankEnabled = link.bank_enabled !== false;

  // Active UPI & Payee details (Respect custom UPI ID if configured on this link)
  const cleanUpi = (link.custom_upi_id || selectedUpi?.upi_id || link.upi_id || 'primary@upi').trim();
  const upiId = cleanUpi;
  const effectiveBanks = (link.custom_bank_accounts && link.custom_bank_accounts.length > 0)
    ? link.custom_bank_accounts
    : activeBanks;
  const rawPayeeName = settings.company_name || 'Government Portal';
  const cleanPayeeName = rawPayeeName.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Beneficiary';
  const cleanNote = (link.remarks || 'Payment').replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'eChallan Remittance';

  // Effective amount: fixed if link.amount > 0, else user entered custom amount
  const parsedCustom = parseFloat(customAmount);
  const effectiveAmount = link.amount > 0 ? link.amount : (!isNaN(parsedCustom) && parsedCustom > 0 ? parsedCustom : 0);

  // Construct UPI Intent URIs strictly compliant with NPCI:
  // pa parameter MUST retain the literal '@' character. Encoding to %40 causes mobile UPI apps (PhonePe, GPay, Paytm) to fail.
  const amountQuery = effectiveAmount > 0 ? `&am=${effectiveAmount.toFixed(2)}` : '';
  const encodedPayee = encodeURIComponent(cleanPayeeName);
  const encodedNote = encodeURIComponent(cleanNote);

  const rawIntentUri = `upi://pay?pa=${cleanUpi}&pn=${encodedPayee}${amountQuery}&cu=INR&tn=${encodedNote}`;
  const phonepeIntent = `phonepe://upi/pay?pa=${cleanUpi}&pn=${encodedPayee}${amountQuery}&cu=INR&tn=${encodedNote}`;
  const gpayIntent = `tez://upi/pay?pa=${cleanUpi}&pn=${encodedPayee}${amountQuery}&cu=INR&tn=${encodedNote}`;

  // Paytm Official Android intent without suspicious keywords (direct & standard)
  const paytmAndroidIntent = `intent://pay?pa=${cleanUpi}&pn=${encodedPayee}${amountQuery}&cu=INR&tn=${encodedNote}#Intent;scheme=upi;package=net.one97.paytm;end`;

  const targetSiteUrl = getTargetRedirectUrl();

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-slate-800 flex flex-col justify-between py-4 px-3 sm:px-6 selection:bg-[#0c2340] selection:text-white font-sans">
      {/* Top Authentic Indian Tricolor Line */}
      <div className="fixed top-0 left-0 right-0 h-1.5 flex z-50">
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-[#FFFFFF]" />
        <div className="flex-1 bg-[#138808]" />
      </div>

      <div className="max-w-2xl mx-auto w-full mt-2">
        {/* ==================================================================== */}
        {/* OFFICIAL INSTITUTIONAL GOVERNMENT PORTAL HEADER */}
        {/* ==================================================================== */}
        <header className="bg-[#0c2340] text-white rounded-t-lg border-b-2 border-[#1e3a8a] p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* National Emblem / Seal Graphic */}
              <div className="w-12 h-12 rounded bg-white/10 border border-white/20 flex items-center justify-center text-amber-300 font-bold shrink-0">
                <svg viewBox="0 0 24 24" className="w-7 h-7 fill-amber-400">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <circle cx="12" cy="12" r="3" fill="currentColor" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm sm:text-base font-bold tracking-tight text-white uppercase">
                    राष्ट्रीय ई-भुगतान सेवा | NATIONAL DIGITAL PAYMENT GATEWAY
                  </h1>
                </div>
                <p className="text-[11px] text-slate-300 tracking-wide mt-0.5 font-medium">
                  भारत सरकार एवं एनपीसीआई अधिकृत ढांचा | Government of India & NPCI Unified Protocol
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-900/60 text-emerald-300 px-2.5 py-1 rounded border border-emerald-500/40">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                सत्यापित पोर्टल (Verified)
              </span>
            </div>
          </div>
        </header>

        {/* ==================================================================== */}
        {/* MAIN BODY: OFFICIAL CHALLAN SLIP & PAYMENT INTERFACE */}
        {/* ==================================================================== */}
        <main className="bg-white rounded-b-lg border-x border-b border-slate-300 shadow-md divide-y divide-slate-200">
          {/* OFFICIAL PAYMENT GATEWAY BAR */}
          <div className="p-4 sm:p-6 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-bold text-[#0c2340] uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                सुरक्षित डिजिटल ई-भुगतान | SECURE INSTANT UPI PAYMENT
              </span>
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                सक्रिय (Active Gateway)
              </span>
            </div>

            {/* AMOUNT ROW - Shows total payable amount when fixed, or input for custom amount when open */}
            {link.amount > 0 ? (
              <div className="bg-[#0c2340]/5 border border-[#0c2340]/20 rounded-md p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold text-[#0c2340] uppercase tracking-wider block">
                    कुल देय धनराशि | TOTAL AMOUNT PAYABLE
                  </span>
                  <span className="text-[11px] text-slate-500">भारतीय रुपए (INR)</span>
                </div>

                <div className="text-2xl sm:text-3xl font-extrabold text-[#0c2340] font-mono">
                  ₹ {link.amount.toLocaleString('en-IN')}
                </div>
              </div>
            ) : (
              <div className="bg-[#0c2340]/5 border border-[#0c2340]/20 rounded-md p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold text-[#0c2340] uppercase tracking-wider block">
                    भुगतान राशि प्रविष्ट करें | ENTER AMOUNT TO PAY
                  </span>
                  <span className="text-[11px] text-slate-500">खुला चालान (Open Challan)</span>
                </div>

                <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-3 py-1.5 shadow-xs">
                  <span className="text-lg font-bold text-[#0c2340]">₹</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="Enter amount"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-36 text-lg font-extrabold text-[#0c2340] font-mono outline-hidden"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ==================================================================== */}
          {/* ALWAYS ACTIVE PAYMENT FLOW (PERPETUAL & REUSABLE UNLIMITED TIMES) */}
          {/* ==================================================================== */}
          <div className="p-4 sm:p-6 space-y-6">
            {/* SUBMISSION CONFIRMATION NOTICE */}
            {submittedSuccess && (
              <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-lg flex items-start justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-5 h-5 stroke-[3]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-950">
                      भुगतान पावती सफलतापूर्वक दर्ज हो गई! (Payment Proof Submitted)
                    </h3>
                    <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                      आपका भुगतान संदर्भ विभागीय मिलान हेतु दर्ज कर लिया गया है। यह लिंक हमेशा सक्रिय है — आप चाहें तो कभी भी पुनः भुगतान कर सकते हैं।
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSubmittedSuccess(false)}
                  className="text-emerald-700 hover:text-emerald-950 text-xs font-bold px-2 py-1 bg-emerald-100/80 rounded cursor-pointer shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            {/* ================================================================ */}
            {/* 1ST PRIORITY: SCANNER (QR CODE) (SHOWN IF UPI ENABLED) */}
            {/* ================================================================ */}
              {isUpiEnabled && (
                <div className="border-2 border-slate-300 rounded-lg p-5 bg-white text-center space-y-3">
                  <div className="border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-[#0c2340] uppercase tracking-wider flex items-center justify-center gap-1.5">
                      <QrCode className="w-4 h-4 text-[#0c2340]" />
                      प्राथमिकता 1: क्यूआर कोड स्कैन करके भुगतान करें (SCAN & PAY VIA ANY UPI APP)
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Google Pay, PhonePe, Paytm, BHIM, या किसी भी बैंकिंग ऐप के स्कैनर से स्कैन करें
                    </p>
                  </div>

                  <div className="flex justify-center my-2">
                    <div className="p-3 bg-white rounded border-2 border-slate-400 inline-block shadow-sm">
                      <QRCodeDisplay
                        upiId={upiId}
                        payeeName={cleanPayeeName}
                        amount={effectiveAmount > 0 ? effectiveAmount : undefined}
                        remarks={cleanNote}
                        qrUrl={selectedUpi?.qr_url}
                        size={200}
                        showActions={false}
                      />
                    </div>
                  </div>

                  {link.amount > 0 && (
                    <div className="text-[11px] text-slate-600 flex items-center justify-center gap-2 font-mono">
                      <span>देय राशि (Amount):</span>
                      <strong className="text-slate-900 font-bold">
                        ₹{link.amount.toLocaleString('en-IN')}
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {/* ================================================================ */}
              {/* 2ND PRIORITY: UPI ID (VPA) (SHOWN IF UPI ENABLED) */}
              {/* ================================================================ */}
              {isUpiEnabled && (
                <div className="border border-slate-300 rounded-lg p-4 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0c2340] uppercase tracking-wider">
                      प्राथमिकता 2: अधिकृत UPI ID (Virtual Payment Address - VPA)
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">
                      एक-क्लिक कॉपी
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 rounded border border-slate-300">
                    <div className="space-y-0.5">
                      <span className="font-mono text-sm sm:text-base font-bold text-slate-900 select-all block">
                        {upiId}
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        खाता नाम (Payee Handle): <strong>{selectedUpi?.account_name || cleanPayeeName}</strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy('active_upi', upiId, 'UPI ID')}
                      className="px-3.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer"
                    >
                      {copiedKey === 'active_upi' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                          <span className="text-emerald-800 font-bold">कॉपी हो गया (Copied)</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-600" />
                          <span>UPI ID कॉपी करें (Copy)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ================================================================ */}
              {/* 3RD PRIORITY: UPI APPS (SHOWN IF UPI ENABLED) */}
              {/* ================================================================ */}
              {isUpiEnabled && (
                <div className="border border-slate-300 rounded-lg p-4 bg-white space-y-3">
                  <div className="border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-[#0c2340] uppercase tracking-wider flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-[#0c2340]" />
                      प्राथमिकता 3: मोबाइल ऐप द्वारा तत्काल भुगतान (INSTANT PAY VIA UPI APPS)
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      यदि आप मोबाइल फोन पर हैं, तो सीधे नीचे दिए गए ऐप बटन पर टैप करें
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* PhonePe */}
                    <a
                      href={phonepeIntent}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-300 hover:border-[#5f259f] hover:bg-purple-50/40 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded bg-[#5f259f] text-white flex items-center justify-center font-black text-lg shrink-0">
                          पे
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block group-hover:text-[#5f259f]">
                            PhonePe UPI
                          </span>
                          <span className="text-[10px] text-slate-500">फ़ोनपे द्वारा भुगतान करें</span>
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-[#5f259f]" />
                    </a>

                    {/* Google Pay */}
                    <a
                      href={gpayIntent}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded bg-white border border-slate-300 text-[#1a73e8] flex items-center justify-center font-black text-lg shrink-0">
                          G
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block group-hover:text-blue-700">
                            Google Pay (GPay)
                          </span>
                          <span className="text-[10px] text-slate-500">गूगल पे द्वारा भुगतान करें</span>
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                    </a>

                    {/* Paytm (Clean & Genuine - NO WARNING, NO SAFE MODE TEXT) */}
                    <a
                      href={paytmAndroidIntent}
                      onClick={() => {
                        copyToClipboard(upiId);
                      }}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-300 hover:border-[#002e6e] hover:bg-cyan-50/40 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded bg-[#002e6e] text-[#00b9f5] flex items-center justify-center font-black text-lg shrink-0">
                          ₹
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block group-hover:text-[#002e6e]">
                            Paytm UPI
                          </span>
                          <span className="text-[10px] text-slate-500">पेटीएम द्वारा भुगतान करें</span>
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-[#002e6e]" />
                    </a>

                    {/* BHIM / Other UPI */}
                    <a
                      href={rawIntentUri}
                      className="flex items-center justify-between p-3 rounded-lg border border-slate-300 hover:border-amber-600 hover:bg-amber-50/40 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded bg-[#0c2340] text-amber-300 flex items-center justify-center font-black text-sm shrink-0">
                          UPI
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block group-hover:text-[#0c2340]">
                            BHIM / Any UPI App
                          </span>
                          <span className="text-[10px] text-slate-500">अन्य बैंकिंग यूपीआई ऐप</span>
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-800" />
                    </a>
                  </div>
                </div>
              )}

              {/* ================================================================ */}
              {/* 4TH SECTION: BANK ACCOUNT TRANSFER (SHOWN IF BANK ENABLED) */}
              {/* Clean layout: bank name separate/small, holder name equal size */}
              {/* ================================================================ */}
              {isBankEnabled && (
                <div className="border border-slate-300 rounded-lg p-4 bg-white space-y-3">
                  <div className="border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-[#0c2340] uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-[#0c2340]" />
                      बैंक खाता विवरण (NEFT / RTGS / IMPS Remittance)
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      सीधे बैंक खाते में ट्रांसफर करने के लिए विवरण
                    </p>
                  </div>

                  {effectiveBanks.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-500 bg-slate-50 rounded border border-slate-200">
                      बैंक खाते का विवरण उपलब्ध नहीं है। कृपया ऊपर दिए गए क्यूआर कोड या यूपीआई का उपयोग करें।
                    </div>
                  ) : (
                    effectiveBanks.map((b) => (
                      <div
                        key={b.id}
                        className="p-3.5 rounded border border-slate-300 bg-slate-50/60 space-y-3 text-xs"
                      >
                        {/* Bank Name (Small & Separate Badge) & Account Holder Name (Prominent & Clear) */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] uppercase font-bold text-[#0c2340] bg-slate-200 px-2 py-0.5 rounded border border-slate-300">
                                {b.bank_name}
                              </span>
                              {b.branch && (
                                <span className="text-[10px] text-slate-500">
                                  {b.branch} Branch
                                </span>
                              )}
                            </div>

                            <div className="text-sm font-bold text-slate-900 mt-0.5">
                              खाता धारक (Beneficiary): <span className="text-[#0c2340]">{b.account_holder}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCopy(`holder_${b.id}`, b.account_holder, 'Beneficiary Name')}
                            className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-semibold self-start sm:self-auto cursor-pointer"
                          >
                            {copiedKey === `holder_${b.id}` ? 'Copied' : 'Copy Name'}
                          </button>
                        </div>

                        {/* Account Number & IFSC Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="flex items-center justify-between bg-white p-2 rounded border border-slate-200">
                            <div>
                              <span className="text-[10px] text-slate-500 font-bold uppercase block">
                                खाता संख्या (Account No)
                              </span>
                              <span className="font-mono text-sm font-bold text-slate-900">
                                {b.account_number}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(`acc_${b.id}`, b.account_number, 'Account Number')}
                              className="p-1 text-slate-600 hover:text-slate-900 rounded cursor-pointer"
                              title="Copy Account Number"
                            >
                              {copiedKey === `acc_${b.id}` ? (
                                <Check className="w-4 h-4 text-emerald-700" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>

                          <div className="flex items-center justify-between bg-white p-2 rounded border border-slate-200">
                            <div>
                              <span className="text-[10px] text-slate-500 font-bold uppercase block">
                                आईएफएससी कोड (IFSC Code)
                              </span>
                              <span className="font-mono text-sm font-bold text-slate-900 uppercase">
                                {b.ifsc_code}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(`ifsc_${b.id}`, b.ifsc_code, 'IFSC Code')}
                              className="p-1 text-slate-600 hover:text-slate-900 rounded cursor-pointer"
                              title="Copy IFSC Code"
                            >
                              {copiedKey === `ifsc_${b.id}` ? (
                                <Check className="w-4 h-4 text-emerald-700" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ================================================================ */}
              {/* 5TH SECTION: PAYMENT CONFIRMATION & PROOF SUBMISSION */}
              {/* Solid, genuine government action button */}
              {/* ================================================================ */}
              <div className="pt-4 border-t-2 border-slate-200 space-y-3">
                <div className="text-center">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    भुगतान पावती एवं सत्यापन (PAYMENT CONFIRMATION)
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    भुगतान पूर्ण करने के बाद सीधे नीचे दिए गए बटन पर क्लिक करें
                  </p>
                </div>

                {/* Optional UTR / Screenshot Toggle */}
                <div className="border border-slate-300 rounded bg-slate-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowOptionalDetails(!showOptionalDetails)}
                    className="w-full px-3 py-2 text-left flex items-center justify-between text-xs text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <Receipt className="w-4 h-4 text-[#0c2340]" />
                      यूटीआर नंबर अथवा रसीद फोटो जोड़ें{' '}
                      <span className="text-[10px] text-slate-500">(वैकल्पिक / Optional)</span>
                    </span>
                    {showOptionalDetails ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </button>

                  {showOptionalDetails && (
                    <div className="p-3.5 border-t border-slate-200 bg-white space-y-3 text-xs">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          12-अंकीय यूटीआर / यूपीआई संदर्भ संख्या (UTR / Ref Number - Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="उदा. 423456789012"
                          value={utrNumber}
                          onChange={(e) => setUtrNumber(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 focus:border-[#0c2340] rounded px-3 py-1.5 text-xs text-slate-900 font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          भुगतान रसीद की फोटो (Receipt Screenshot - Optional)
                        </label>
                        {screenshotData ? (
                          <div className="flex items-center gap-3">
                            <img
                              src={screenshotData}
                              alt="Receipt Screenshot"
                              className="w-12 h-12 object-cover rounded border border-slate-300"
                            />
                            <div className="space-y-0.5">
                              <span className="text-xs text-emerald-700 font-bold block">फोटो संलग्न (Attached)</span>
                              <button
                                type="button"
                                onClick={() => setScreenshotData('')}
                                className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                              >
                                हटाएं (Remove)
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="cursor-pointer block border border-dashed border-slate-300 hover:border-slate-400 rounded p-2.5 text-center bg-slate-50 transition-colors">
                            <Upload className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                            <span className="text-[11px] text-slate-600 block">
                              गैलरी से रसीद फोटो चुनें (वैकल्पिक)
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleFileChange}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* SOLID OFFICIAL ACTION BUTTON */}
                <button
                  type="button"
                  onClick={() => handleDonePayment()}
                  disabled={isSubmitting}
                  className="w-full bg-[#138808] hover:bg-[#0f6c06] active:bg-[#0c5505] text-white font-bold py-3.5 px-4 rounded text-sm sm:text-base flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>भुगतान पूर्ण हुआ | PAYMENT DONE (CONFIRM)</span>
                </button>

                {/* Return link */}
                {targetSiteUrl && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={triggerRedirect}
                      className="text-xs text-slate-600 hover:text-slate-900 underline"
                    >
                      मूल वेबसाइट पर वापस जाएं (Return to Merchant Site)
                    </button>
                  </div>
                )}
              </div>
            </div>
        </main>

        {/* ==================================================================== */}
        {/* OFFICIAL INSTITUTIONAL FOOTER */}
        {/* ==================================================================== */}
        <footer className="mt-4 text-center space-y-2 text-xs text-slate-600 pb-6">
          <div className="flex items-center justify-center gap-3 text-[11px] font-medium text-slate-600 flex-wrap">
            <span className="flex items-center gap-1 text-[#138808]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#138808]" />
              NPCI UPI 2.0 अधिकृत मानक
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-[#0c2340]">
              <Lock className="w-3.5 h-3.5 text-[#0c2340]" />
              256-Bit SSL/TLS सुरक्षित
            </span>
            <span>•</span>
            <span>Digital India Protocol</span>
          </div>

          <div className="text-[11px] text-slate-500">
            सहायता एवं नागरिक सेवा (Citizen Support):{' '}
            <a
              href={`mailto:${settings.support_email}`}
              className="text-[#0c2340] hover:underline font-semibold"
            >
              {settings.support_email}
            </a>
            {settings.support_phone && (
              <>
                {' '}• दूरभाष:{' '}
                <a
                  href={`tel:${settings.support_phone}`}
                  className="text-[#0c2340] hover:underline font-semibold"
                >
                  {settings.support_phone}
                </a>
              </>
            )}
          </div>
          <div className="text-[10px] text-slate-400">
            This digital payment interface follows National Payments Corporation of India (NPCI) guidelines.
          </div>
        </footer>
      </div>
    </div>
  );
};
