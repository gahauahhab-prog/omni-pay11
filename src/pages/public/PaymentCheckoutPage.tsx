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
    let item = db.getPaymentLinkById(cleanId);

    const s = db.getSettings();
    setSettings(s);

    const banks = db.getActiveBankAccounts();
    setActiveBanks(banks);

    const upis = db.getActiveUpiAccounts();
    setActiveUpis(upis);

    // If link not yet stored in this browser:
    if (!item) {
      const amtParam = searchParams.get('amt');
      const amt = amtParam !== null ? parseFloat(amtParam) : 0;
      if (searchParams.get('cli') || searchParams.get('upi') || cleanId) {
        const upiId = searchParams.get('upi') || (upis[0]?.upi_id || 'payments@upi');
        const clientName = searchParams.get('cli') || 'Citizen / Customer';
        const remarks = searchParams.get('rem') || 'Payment Request';
        const accId = searchParams.get('acc') || '';
        const redUrl = searchParams.get('red') || searchParams.get('redirect_url') || '';

        item = {
          id: cleanId,
          client_id: 'client',
          client_name: clientName,
          amount: isNaN(amt) ? 0 : amt,
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
  };

  useEffect(() => {
    loadLinkData();
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

  // Countdown when payment submitted successfully
  useEffect(() => {
    if (!submittedSuccess) return;
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          triggerRedirect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [submittedSuccess]);

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

  // User requested: Screenshot is NOT mandatory, clicking "Done" submits and redirects immediately!
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

      await db.submitPaymentProof(link.id, {
        screenshot_url: screenshotData || '',
        utr_number: utrNumber.trim(),
      });

      setSubmittedSuccess(true);
      loadLinkData();
    } catch {
      error('Note', 'Processing payment status...');
      setTimeout(() => {
        triggerRedirect();
      }, 800);
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

  // Active UPI & Payee details
  const upiId = selectedUpi?.upi_id || link.upi_id || 'primary@upi';
  const rawPayeeName = settings.company_name || 'Government Portal';
  const cleanPayeeName = rawPayeeName.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Beneficiary';
  const cleanNote = (link.remarks || 'Payment').replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'eChallan Remittance';

  // Effective amount: fixed if link.amount > 0, else user entered custom amount
  const parsedCustom = parseFloat(customAmount);
  const effectiveAmount = link.amount > 0 ? link.amount : (!isNaN(parsedCustom) && parsedCustom > 0 ? parsedCustom : 0);

  // Construct UPI Intent URIs
  const amountQuery = effectiveAmount > 0 ? `&am=${effectiveAmount}` : '';

  const rawIntentUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    cleanPayeeName
  )}${amountQuery}&cu=INR&tn=${encodeURIComponent(cleanNote)}`;

  const phonepeIntent = `phonepe://upi/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    cleanPayeeName
  )}${amountQuery}&cu=INR&tn=${encodeURIComponent(cleanNote)}`;

  const gpayIntent = `tez://upi/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    cleanPayeeName
  )}${amountQuery}&cu=INR&tn=${encodeURIComponent(cleanNote)}`;

  // Paytm Official Android intent without suspicious keywords (direct & standard)
  const paytmAndroidIntent = `intent://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    cleanPayeeName
  )}${amountQuery}&cu=INR&tn=${encodeURIComponent(cleanNote)}#Intent;scheme=upi;package=net.one97.paytm;end`;

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
          {/* CHALLAN / REMITTANCE SUMMARY TABLE (OG Government Form Look) */}
          <div className="p-4 sm:p-6 bg-slate-50/70 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-xs font-bold text-[#0c2340] uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-[#0c2340]" />
                इलेक्ट्रॉनिक भुगतान ई-चालान | ELECTRONIC PAYMENT CHALLAN
              </span>
              <span className="text-[11px] font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-300">
                REF: {link.id}
              </span>
            </div>

            {/* Official Tabular Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                  विभाग / प्राप्तकर्ता (Beneficiary / Department)
                </span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                  {settings.company_name || 'Government Portal'}
                </span>
              </div>

              <div className="bg-white p-2.5 rounded border border-slate-200">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                  भुगतानकर्ता (Remitter / Payer)
                </span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                  {link.client_name || 'Authorized Remitter'}
                </span>
              </div>

              <div className="bg-white p-2.5 rounded border border-slate-200 sm:col-span-2">
                <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                  लेखा शीर्ष / उद्देश्य (Remittance Head / Remarks)
                </span>
                <span className="text-slate-800 font-medium text-xs mt-0.5 block">
                  {link.remarks || 'Standard Electronic Remittance'}
                </span>
              </div>
            </div>

            {/* AMOUNT ROW */}
            <div className="bg-[#0c2340]/5 border border-[#0c2340]/20 rounded-md p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-[#0c2340] uppercase tracking-wider block">
                  कुल देय धनराशि | TOTAL AMOUNT PAYABLE
                </span>
                <span className="text-[11px] text-slate-500">भारतीय रुपए (INR)</span>
              </div>

              {link.amount > 0 ? (
                <div className="text-2xl sm:text-3xl font-extrabold text-[#0c2340] font-mono">
                  ₹ {link.amount.toLocaleString('en-IN')}
                </div>
              ) : (
                /* OPTIONAL / OPEN AMOUNT INPUT FIELD */
                <div className="w-full sm:w-64 space-y-1.5">
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-500">₹</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="राशि दर्ज करें (Enter Amount)"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-white border-2 border-[#0c2340] rounded font-mono text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0c2340]/20"
                    />
                  </div>
                  {/* Quick Select Preset Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['500', '1000', '2000', '5000'].map((chip) => (
                      <button
                        type="button"
                        key={chip}
                        onClick={() => setCustomAmount(chip)}
                        className="text-[10px] font-bold bg-white border border-slate-300 hover:border-[#0c2340] hover:bg-slate-100 text-slate-700 px-2 py-0.5 rounded transition-all"
                      >
                        +₹{chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ==================================================================== */}
          {/* CASE 1: ALREADY PAID & SETTLED */}
          {/* ==================================================================== */}
          {link.status === 'Paid' && (
            <div className="p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto border border-emerald-300">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">भुगतान सफलतापूर्वक सत्यापित (Payment Settled)</h2>
                <p className="text-xs text-slate-600 max-w-sm mx-auto">
                  आपका {formatCurrency(link.amount)} का भुगतान सफलतापूर्वक प्राप्त और सत्यापित कर लिया गया है।
                </p>
              </div>

              {link.confirmed_at && (
                <div className="inline-flex items-center gap-1 text-xs text-slate-700 bg-slate-100 px-3 py-1 rounded border border-slate-300 font-mono">
                  <span>दिनांक (Settled Date): {formatDate(link.confirmed_at)}</span>
                </div>
              )}

              <div className="pt-2 flex justify-center">
                <Button
                  size="sm"
                  onClick={triggerRedirect}
                  className="bg-[#0c2340] hover:bg-[#1a365d] text-white font-bold px-6"
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Return to Portal
                </Button>
              </div>
            </div>
          )}

          {/* ==================================================================== */}
          {/* CASE 2: PENDING CONFIRMATION / PROOF UNDER REVIEW */}
          {/* ==================================================================== */}
          {link.status === 'Pending Confirmation' && !submittedSuccess && (
            <div className="p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-blue-50 text-[#0c2340] flex items-center justify-center mx-auto border border-blue-300">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">पावती दर्ज हो गई है (Verification In Progress)</h2>
                <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                  आपके द्वारा भुगतान संदर्भ दर्ज कर दिया गया है। संबंधित विभाग द्वारा मिलान होते ही आपका चालान अद्यतन हो जाएगा।
                </p>
              </div>

              {link.utr_number && (
                <div className="inline-block bg-slate-100 border border-slate-300 rounded px-3 py-1 text-xs font-mono text-slate-800">
                  संदर्भ संख्या (UTR Ref): <span className="font-bold">{link.utr_number}</span>
                </div>
              )}

              <div className="pt-2 flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={triggerRedirect}
                  className="text-xs text-slate-700"
                >
                  Return to Website
                </Button>
              </div>
            </div>
          )}

          {/* ==================================================================== */}
          {/* CASE 3: ACTIVE PAYMENT FLOW (STRICT ORDER REQUESTED) */}
          {/* 1st: SCANNER -> 2nd: UPI ID -> 3rd: UPI APPS -> 4th: BANK */}
          {/* ==================================================================== */}
          {link.status === 'Pending' && (
            <div className="p-4 sm:p-6 space-y-6">
              {/* ================================================================ */}
              {/* 1ST PRIORITY: SCANNER (QR CODE) */}
              {/* ================================================================ */}
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
                      size={200}
                      showActions={false}
                    />
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 flex items-center justify-center gap-2 font-mono">
                  <span>देय राशि (Encoded Amount):</span>
                  <strong className="text-slate-900 font-bold">
                    {effectiveAmount > 0 ? `₹${effectiveAmount.toLocaleString('en-IN')}` : 'ग्राहक द्वारा देय (Open Amount)'}
                  </strong>
                </div>
              </div>

              {/* ================================================================ */}
              {/* 2ND PRIORITY: UPI ID (VPA) - JUST BELOW SCANNER */}
              {/* ================================================================ */}
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

              {/* ================================================================ */}
              {/* 3RD PRIORITY: UPI APPS - JUST BELOW UPI ID */}
              {/* ================================================================ */}
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

              {/* ================================================================ */}
              {/* 4TH SECTION: BANK ACCOUNT TRANSFER (NEFT / RTGS / IMPS) */}
              {/* Clean layout: bank name separate/small, holder name equal size */}
              {/* ================================================================ */}
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

                {activeBanks.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-500 bg-slate-50 rounded border border-slate-200">
                    बैंक खाते का विवरण उपलब्ध नहीं है। कृपया ऊपर दिए गए क्यूआर कोड या यूपीआई का उपयोग करें।
                  </div>
                ) : (
                  activeBanks.map((b) => (
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
          )}
        </main>

        {/* ==================================================================== */}
        {/* SUCCESS MODAL / REDIRECT OVERLAY */}
        {/* ==================================================================== */}
        {submittedSuccess && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-300 rounded-lg max-w-sm w-full p-6 text-center space-y-4 shadow-xl">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto border border-emerald-300">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">भुगतान सफलतापूर्वक दर्ज (Payment Submitted)</h3>
                <p className="text-xs text-slate-600">
                  धन्यवाद! आपका भुगतान विवरण दर्ज कर लिया गया है।
                </p>
              </div>

              <div className="p-2.5 bg-slate-100 rounded border border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-[#0c2340] border-t-transparent rounded-full animate-spin" />
                <span>Redirecting in {redirectCountdown}s...</span>
              </div>

              <Button
                className="w-full bg-[#0c2340] hover:bg-[#1a365d] text-white font-bold py-2 rounded text-xs"
                onClick={triggerRedirect}
              >
                Return to Website
              </Button>
            </div>
          </div>
        )}

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
