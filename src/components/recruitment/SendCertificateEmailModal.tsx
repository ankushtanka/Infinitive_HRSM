'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Mail, AlertCircle, Loader2, Paperclip } from 'lucide-react';
import { InternshipCertificateRecord } from '@/types/certificate';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { CertificateDocument } from '@/components/recruitment/CertificateDocument';

interface SendCertificateEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: Partial<InternshipCertificateRecord> | null;
  onSuccess: (msg: string) => void;
  pdfBase64Provider?: () => Promise<string | null>;
}

export const SendCertificateEmailModal: React.FC<SendCertificateEmailModalProps> = ({
  isOpen,
  onClose,
  certificate,
  onSuccess,
  pdfBase64Provider,
}) => {
  useBodyScrollLock(isOpen);

  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (certificate) {
      const companyName = certificate.companyName || 'Infinitive Cloud';
      const internName = certificate.internName || 'Intern';
      const role = certificate.internshipRole || 'Software Engineering Intern';
      const defaultEmail = certificate.internEmail || certificate.email || '';

      setRecipientEmail(defaultEmail);
      setSubject(`Internship Completion Certificate — ${companyName} — ${internName}`);
      setCustomMessage(
        `Dear ${internName},\n\nWe are pleased to issue your official Internship Completion Certificate for completing your internship as ${role} at ${companyName}.\n\nPlease find your official certificate attached.\n\nWe wish you continued success in your future endeavors!\n\nBest regards,\n${companyName} HR Team`
      );
    }
  }, [certificate]);

  const certId = certificate?.id || certificate?._id;
  const hasGridFsPdf = Boolean(certificate?.fileId);
  const internName = certificate?.internName || 'Intern';
  const displayFileName = `Internship_Certificate_${internName.replace(/\s+/g, '_')}.pdf`;

  if (!isOpen || !certificate) return null;

  const formatCertificateDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const monthIdx = parseInt(parts[1], 10) - 1;
        const day = parts[2].padStart(2, '0');
        const months = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        if (monthIdx >= 0 && monthIdx < 12) {
          return `${day} ${months[monthIdx]} ${year}`;
        }
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const generateLivePdfBase64 = async (): Promise<string | null> => {
    if (pdfBase64Provider) {
      try {
        const res = await pdfBase64Provider();
        if (res) return res;
      } catch (e) {
        console.warn('pdfBase64Provider failed, falling back to offscreen renderer:', e);
      }
    }
    if (!printRef.current) return null;
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      return pdf.output('datauristring');
    } catch (err) {
      console.error('Error generating live certificate PDF inside SendCertificateEmailModal:', err);
      return null;
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certId) {
      setErrorMsg('Please save the certificate record before sending email.');
      return;
    }

    if (!recipientEmail.trim()) {
      setErrorMsg('Please enter a valid recipient email address.');
      return;
    }

    setIsSending(true);
    setErrorMsg(null);

    try {
      let pdfBase64: string | null = null;
      if (!hasGridFsPdf) {
        pdfBase64 = await generateLivePdfBase64();
      }

      const res = await fetch(`/api/v1/certificates/${certId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
          customSubject: subject.trim(),
          customMessage: customMessage.trim(),
          pdfBase64,
        }),
      });

      const json = await res.json();
      setIsSending(false);

      if (json.success) {
        onSuccess(json.message || `Certificate sent successfully to ${recipientEmail}`);
        onClose();
      } else {
        setErrorMsg(json.message || 'Failed to send certificate email.');
      }
    } catch (err: any) {
      setIsSending(false);
      setErrorMsg(err.message || 'Error connecting to mail service.');
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      {/* Off-screen Printable Certificate Container for Live PDF Generation */}
      <div className="fixed -left-[9999px] -top-[9999px] pointer-events-none opacity-0">
        <CertificateDocument ref={printRef} certificate={certificate} />
      </div>

      {/* Main Modal Dialog */}
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl text-xs text-slate-800 animate-fade-in">
        <div className="flex items-center justify-between border-b pb-3 font-bold text-sm text-orange-600">
          <div className="flex items-center gap-2">
            <Mail className="h-4.5 w-4.5" />
            <span>Send Internship Certificate via Gmail</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSend} className="mt-4 space-y-3">
          <div>
            <label className="font-bold text-slate-900">Recipient Email (Intern Email) *</label>
            <input
              type="email"
              required
              placeholder="e.g. intern@gmail.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white text-xs font-semibold text-slate-800"
            />
          </div>

          <div>
            <label className="font-bold text-slate-900">Email Subject *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white text-xs font-semibold text-slate-800"
            />
          </div>

          <div>
            <label className="font-bold text-slate-900">Message Body *</label>
            <textarea
              rows={5}
              required
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white text-xs leading-relaxed text-slate-800"
            />
          </div>

          {/* Attachment Badge */}
          <div className="rounded-xl border p-2.5 flex items-center justify-between text-xs border-emerald-200 bg-emerald-50/60 text-emerald-900">
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold">{displayFileName}</span>
            </div>
            <span className="rounded-md bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-900 border border-emerald-300">
              PDF Attachment Ready
            </span>
          </div>

          <div className="flex justify-end gap-2 border-t pt-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border px-3.5 py-2 font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white shadow-md hover:bg-orange-600 active:bg-orange-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>{isSending ? 'Sending Mail...' : 'Send Certificate'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
};
