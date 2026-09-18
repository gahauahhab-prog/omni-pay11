import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Check, Copy } from 'lucide-react';
import { Button } from './ui/Button';
import { copyToClipboard } from '../lib/utils';
import { useToast } from '../context/ToastContext';

interface QRCodeDisplayProps {
  upiId: string;
  upiApp?: string;
  payeeName?: string;
  accountHolder?: string;
  amount?: number;
  qrUrl?: string; // custom image url if uploaded
  customImageUrl?: string; // alias
  remarks?: string;
  size?: number;
  showActions?: boolean;
  className?: string;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  upiId,
  upiApp = 'UPI',
  payeeName,
  accountHolder,
  amount,
  qrUrl,
  customImageUrl,
  remarks,
  size = 180,
  showActions = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { success, error } = useToast();

  const effectiveQrImage = (!imageError && (qrUrl || customImageUrl)) ? (qrUrl || customImageUrl) : undefined;
  const cleanUpiId = (upiId || '').trim();

  // Generate standard UPI payment URI strictly conforming to NPCI specification:
  // Note: pa (VPA) must retain the literal '@' character. Encoding to '%40' breaks scanner parsing in UPI apps.
  const upiUri = React.useMemo(() => {
    if (!cleanUpiId) return '';

    const effectivePayee = (payeeName || accountHolder || 'Payment Portal')
      .replace(/[^a-zA-Z0-9 ]/g, ' ')
      .trim()
      .slice(0, 30) || 'Beneficiary';

    let uri = `upi://pay?pa=${cleanUpiId}&pn=${encodeURIComponent(effectivePayee)}&cu=INR`;

    if (amount && amount > 0) {
      uri += `&am=${Number(amount).toFixed(2)}`;
    }

    if (remarks) {
      const cleanRemarks = remarks.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().slice(0, 35);
      if (cleanRemarks) {
        uri += `&tn=${encodeURIComponent(cleanRemarks)}`;
      }
    }

    return uri;
  }, [cleanUpiId, payeeName, accountHolder, amount, remarks]);

  useEffect(() => {
    setImageError(false);
  }, [qrUrl, customImageUrl]);

  useEffect(() => {
    if (effectiveQrImage) {
      // If user provided a working custom image URL, canvas is skipped
      return;
    }
    if (canvasRef.current && upiUri) {
      QRCode.toCanvas(
        canvasRef.current,
        upiUri,
        {
          width: size,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        },
        (err) => {
          if (err) console.error('QR code generation failed:', err);
        }
      );
    }
  }, [upiUri, effectiveQrImage, size]);

  const handleDownload = () => {
    try {
      if (effectiveQrImage) {
        const link = document.createElement('a');
        link.href = effectiveQrImage;
        link.download = `UPI-QR-${cleanUpiId.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        success('QR Code Downloaded', 'The QR image has been saved to your downloads.');
      } else if (canvasRef.current) {
        const image = canvasRef.current.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = image;
        link.download = `UPI-QR-${cleanUpiId.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        success('QR Code Downloaded', 'The QR image has been saved to your downloads.');
      }
    } catch {
      error('Download Failed', 'Could not download QR image directly.');
    }
  };

  const handleCopyUPI = async () => {
    if (!cleanUpiId) return;
    const ok = await copyToClipboard(cleanUpiId);
    if (ok) {
      setCopied(true);
      success('UPI ID Copied', `${cleanUpiId} copied to clipboard.`);
      setTimeout(() => setCopied(false), 2000);
    } else {
      error('Failed to copy', 'Please manually copy the UPI ID.');
    }
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs inline-block">
        {effectiveQrImage ? (
          <img
            src={effectiveQrImage}
            alt={`UPI QR for ${cleanUpiId}`}
            onError={() => setImageError(true)}
            className="rounded-lg object-contain"
            style={{ width: size, height: size }}
          />
        ) : (
          <canvas ref={canvasRef} className="rounded-lg block" />
        )}
      </div>

      <div className="mt-2.5 text-center max-w-full px-2">
        <span className="text-xs font-semibold text-slate-800 tracking-wide font-mono block break-all select-all">
          {cleanUpiId || 'No UPI Configured'}
        </span>
        <span className="text-[11px] text-slate-500 font-medium">{upiApp}</span>
      </div>

      {showActions && (
        <div className="flex items-center gap-2 mt-3 w-full justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyUPI}
            leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          >
            {copied ? 'Copied' : 'Copy UPI'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Download QR
          </Button>
        </div>
      )}
    </div>
  );
};
