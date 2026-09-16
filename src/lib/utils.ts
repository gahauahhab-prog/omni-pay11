import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function buildPaymentLinkUrl(link: {
  id: string;
  amount?: number;
  upi_id?: string;
  client_name?: string;
  remarks?: string;
  upi_account_id?: string;
  redirect_url?: string;
}): string {
  const origin = window.location.origin;
  const cleanId = (link.id || '').trim().replace(/\/$/, '');
  const params = new URLSearchParams();
  if (link.amount) params.set('amt', link.amount.toString());
  if (link.upi_id) params.set('upi', link.upi_id);
  if (link.client_name) params.set('cli', link.client_name);
  if (link.remarks) params.set('rem', link.remarks);
  if (link.upi_account_id) params.set('acc', link.upi_account_id);
  if (link.redirect_url) params.set('red', link.redirect_url);

  const query = params.toString();
  return `${origin}/pay/${cleanId}${query ? `?${query}` : ''}`;
}

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return dateString;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for non-secure contexts or nested iframes
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      textArea.remove();
      return successful;
    }
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return false;
  }
}
