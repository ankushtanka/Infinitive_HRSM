'use client';
import { Portal } from './Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState, useEffect } from 'react';
import { X, Send, Mail, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { PayslipData } from '@/types/payslip';

interface SendPayslipEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  payslipData: PayslipData | null;
  onSuccess: (msg: string) => void;
  pdfBase64Provider?: () => Promise<string | null>;
}

export const SendPayslipEmailModal: React.FC<SendPayslipEmailModalProps> = ({
  isOpen,
  onClose,
  payslipData,
  onSuccess,
  pdfBase64Provider,
}) => {
  useBodyScrollLock(isOpen);

  const [recipientEmail, setRecipientEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (payslipData) {
      const companyName = payslipData.company?.name || 'INFINITIVE CLOUD PRIVATE LIMITED';
      const employeeName = payslipData.employee?.name || 'Employee';
      const payPeriod = payslipData.payPeriod || 'Current Period';
      const netPay = payslipData.salary?.netPay ? `₹${payslipData.salary.netPay.toLocaleString('en-IN')}` : '₹0';
      const defaultEmail = payslipData.employee?.email || '';

      setRecipientEmail(defaultEmail);
      setSubject(`Salary Slip for ${payPeriod} — ${companyName}`);
      setCustomMessage(
        `Dear ${employeeName},\n\nPlease find attached your official salary payslip for ${payPeriod}.\n\nNet Disbursed Amount: ${netPay}\n\nKindly review your earnings, statutory deductions, and tax withholdings. If you have any inquiries regarding your payroll, please reply to this email or reach out to the HR Operations team.\n\nWarm regards,\n${companyName} Finance & HR Operations`
      );
    }
  }, [payslipData]);

  if (!isOpen || !payslipData) return null;

  const employeeName = payslipData.employee?.name || 'Employee';
  const payPeriod = payslipData.payPeriod || 'Period';
  const cleanEmpName = employeeName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanPeriod = payPeriod.replace(/[^a-zA-Z0-9_-]/g, '_');
  const displayFileName = `Salary_Slip_${cleanPeriod}_${cleanEmpName}.pdf`;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      setErrorMsg('Please enter a valid recipient email address.');
      return;
    }

    setIsSending(true);
    setErrorMsg(null);

    try {
      let pdfBase64: string | null = null;
      if (pdfBase64Provider) {
        try {
          pdfBase64 = await pdfBase64Provider();
        } catch (pdfErr) {
          console.warn('PDF generation provider failed:', pdfErr);
        }
      }

      const recId = payslipData.id || payslipData.payslipNumber || payslipData.employee.employeeNo;
      const res = await fetch(`/api/v1/payroll/${encodeURIComponent(recId)}/payslip/email`, {
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
        onSuccess(json.message || `Salary slip sent successfully to ${recipientEmail}`);
        onClose();
      } else {
        setErrorMsg(json.message || 'Failed to send payslip email.');
      }
    } catch (err: any) {
      setIsSending(false);
      setErrorMsg(err.message || 'Error communicating with email dispatch service.');
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl text-xs text-slate-800 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 font-bold text-sm text-slate-900">
          <div className="flex items-center gap-2">
            <Mail className="h-4.5 w-4.5 text-orange-500" />
            <span>Send Payslip via Email (Gmail SMTP)</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSend} className="mt-4 space-y-3.5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                Verified Recipient Email
              </label>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Official Record
              </span>
            </div>
            <input
              type="email"
              readOnly
              required
              value={recipientEmail}
              className="w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2 text-xs font-mono font-medium text-slate-700 cursor-not-allowed select-all outline-none"
              title="Recipient email is locked to the employee's official registered address for confidential salary protection."
            />
            <p className="text-[10px] text-slate-400 mt-1">
              🔒 Salary slips can only be delivered to the employee&apos;s verified official address.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
              Email Subject
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
              Custom Email Message (Optional)
            </label>
            <textarea
              rows={5}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900 focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none font-sans"
            />
          </div>

          {/* Attachment Preview Box */}
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 p-2.5">
            <div className="rounded-lg bg-[#FFF7ED] p-1.5 text-orange-500 border border-[#FED7AA]/60">
              <Mail className="h-4 w-4" />
            </div>
            <div className="flex-1 truncate">
              <div className="font-semibold text-slate-800 text-[11px]">PDF Attachment</div>
              <div className="font-mono text-[10px] text-slate-500 truncate">{displayFileName}</div>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
              A4 Ready
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Dispatching Email...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Send Payslip</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
      </Portal>
);
};
