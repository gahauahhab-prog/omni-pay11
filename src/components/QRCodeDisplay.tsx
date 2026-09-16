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
  amount?: number;
  qrUrl?: string; // custom image url if uploaded
  size?: number;
  showActions?: boolean;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  upiId,
  upiApp = 'UPI',
  payeeName = 'Payment Portal',
  amount,
  qrUrl,
  size = 180,
  showActions = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const { success, error } = useToast();

  // Generate standard UPI payment URI: upi://pay?pa=...&pn=...
  const upiUri = React.useMemo(() => {
    let uri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&cu=INR`;
    if (amount && amount > 0) {
      uri += `&am=${amount}`;
    }
    return uri;
  }, [upiId, payeeName, amount]);

  useEffect(() => {
    if (qrUrl) {
      // If user provided a custom image URL, we don't need to generate canvas
      return;
    }
    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        upiUri,
        {
          width: size,
          margin: 1.5,
          color: {
            dark: '#0f172a', // Slate-900
            light: '#ffffff',
          },
        },
        (err) => {
          if (err) console.error('QR code generation failed:', err);
        }
      );
    }
  }, [upiUri, qrUrl, size]);

  const handleDownload = () => {
    try {
      if (qrUrl) {
        // Download custom image
        const link = document.createElement('a');
        link.href = qrUrl;
        link.download = `UPI-QR-${upiId.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        success('QR Code Downloaded', 'The QR image has been saved to your downloads.');
      } else if (canvasRef.current) {
        // Export canvas as PNG
        const image = canvasRef.current.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = image;
        link.download = `UPI-QR-${upiId.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
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
    const ok = await copyToClipboard(upiId);
    if (ok) {
      setCopied(true);
      success('UPI ID Copied', `${upiId} copied to clipboard.`);
      setTimeout(() => setCopied(false), 2000);
    } else {
      error('Failed to copy', 'Please manually copy the UPI ID.');
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs inline-block">
        {qrUrl ? (
          <img
            src={qrUrl}
            alt={`UPI QR for ${upiId}`}
            className="rounded-lg object-contain"
            style={{ width: size, height: size }}
          />
        ) : (
          <canvas ref={canvasRef} className="rounded-lg block" />
        )}
      </div>

      <div className="mt-2.5 text-center">
        <span className="text-xs font-semibold text-slate-800 tracking-wide block">{upiId}</span>
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
