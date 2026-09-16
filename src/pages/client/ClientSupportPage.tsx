import React, { useState } from 'react';
import {
  HelpCircle,
  Mail,
  Phone,
  MessageSquare,
  Clock,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { db } from '../../services/db';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../context/ToastContext';

export const ClientSupportPage: React.FC = () => {
  const { success } = useToast();
  const settings = db.getSettings();

  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsContactModalOpen(false);
      setSubject('');
      setMessage('');
      success('Support Ticket Opened', 'Our finance desk has received your inquiry and will respond promptly.');
    }, 600);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Customer Support & Help Desk</h2>
        <p className="text-xs text-slate-500 mt-1">
          Reach our dedicated settlement and payment verification team for any transfer inquiries.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Support Email Card */}
        <Card className="hover:border-blue-300 transition-all">
          <CardContent className="p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Official Support Email
              </span>
              <a
                href={`mailto:${settings.support_email}`}
                className="text-base font-bold text-slate-900 hover:text-blue-600 transition-colors mt-0.5 block"
              >
                {settings.support_email || 'support@paymentportal.com'}
              </a>
              <p className="text-xs text-slate-500 mt-1">
                For bank transfer receipts, UTR number submissions, and invoice clarifications.
              </p>
            </div>
            <a
              href={`mailto:${settings.support_email}?subject=Payment%20Verification%20Inquiry`}
              className="inline-block pt-1"
            >
              <Button variant="outline" size="sm" leftIcon={<Mail className="w-3.5 h-3.5" />}>
                Compose Email
              </Button>
            </a>
          </CardContent>
        </Card>

        {/* Support Phone Card */}
        <Card className="hover:border-blue-300 transition-all">
          <CardContent className="p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Direct Telephone Support
              </span>
              <a
                href={`tel:${settings.support_phone}`}
                className="text-base font-bold text-slate-900 hover:text-emerald-600 transition-colors mt-0.5 block"
              >
                {settings.support_phone || '+91 9999999999'}
              </a>
              <p className="text-xs text-slate-500 mt-1">
                Available Monday – Saturday, 9:00 AM – 7:00 PM IST for priority support.
              </p>
            </div>
            <a href={`tel:${settings.support_phone}`} className="inline-block pt-1">
              <Button variant="outline" size="sm" leftIcon={<Phone className="w-3.5 h-3.5" />}>
                Call Helpline
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>

      {/* Main Contact Support Action Card (Required by specification: "Button: Contact Support") */}
      <Card className="bg-slate-900 text-white border-0 shadow-lg">
        <CardContent className="p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Priority Response Desk</span>
            </div>
            <h3 className="text-xl font-bold tracking-tight">Need Immediate Assistance?</h3>
            <p className="text-xs text-slate-300 max-w-lg leading-relaxed">
              Have a question about an IMPS/RTGS bank transfer, daily UPI limits, or payment confirmation? Submit a support message directly to our finance operations desk.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => setIsContactModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white shrink-0"
            leftIcon={<MessageSquare className="w-4 h-4" />}
          >
            Contact Support
          </Button>
        </CardContent>
      </Card>

      {/* FAQ Guide Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-600" />
            <CardTitle>Frequently Asked Questions</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 divide-y divide-slate-100 text-xs">
          <div className="pt-2 first:pt-0">
            <h4 className="font-semibold text-slate-900">How quickly are UPI payments credited?</h4>
            <p className="text-slate-600 mt-1">
              UPI payments made to any of the verified QR handles or VPAs are processed instantly 24/7. Please retain your 12-digit UPI reference (UTR) number for your records.
            </p>
          </div>
          <div className="pt-3">
            <h4 className="font-semibold text-slate-900">Which transfer modes work for the bank accounts?</h4>
            <p className="text-slate-600 mt-1">
              All active bank accounts listed in your portal support IMPS (instant), NEFT, and RTGS corporate bank transfers from any Indian bank.
            </p>
          </div>
          <div className="pt-3">
            <h4 className="font-semibold text-slate-900">What if a bank account is marked inactive?</h4>
            <p className="text-slate-600 mt-1">
              The portal exclusively displays accounts currently authorized and ready to accept funds. Do not initiate payments to prior or unlisted account coordinates.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Contact Support Modal */}
      <Modal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        title="Contact Finance Support"
        description="Send an inquiry or payment confirmation details to our team."
        maxWidth="md"
      >
        <form onSubmit={handleSendMessage} className="space-y-4">
          <Input
            label="Inquiry Subject"
            placeholder="e.g. UTR Submission / NEFT Reference #582910"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Message / Payment Details <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-900"
              placeholder="Describe your query, transfer date, amount, or transaction reference..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsContactModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} leftIcon={<Send className="w-3.5 h-3.5" />}>
              Submit Inquiry
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
