'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useRef, useState } from 'react';
import { X, FileText, Download, Edit3, CheckCircle2, AlertCircle, Loader2, Sparkles, Send } from 'lucide-react';
import { InternshipCertificateRecord } from '@/types/certificate';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { CertificateDocument } from '@/components/recruitment/CertificateDocument';

interface CertificatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: Partial<InternshipCertificateRecord> | null;
  onEdit?: () => void;
  onGenerateSuccess?: () => void;
  onOpenSendEmail?: () => void;
}

export const CertificatePreviewModal: React.FC<CertificatePreviewModalProps> = ({
  isOpen,
  onClose,
  certificate,
  onEdit,
  onGenerateSuccess,
  onOpenSendEmail,
}) => {
  useBodyScrollLock(isOpen);

  const printRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen || !certificate) return null;

  const internName = certificate.internName || 'Intern';

  const generatePdfBlob = async (): Promise<string | null> => {
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
      console.error('HTML2Canvas Certificate PDF generation error:', err);
      return null;
    }
  };

  const handleDownloadClientPdf = async () => {
    setIsGeneratingPdf(true);
    setStatusMessage(null);
    try {
      const dataUri = await generatePdfBlob();
      if (dataUri) {
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = `Internship_Certificate_${(internName || 'Intern').replace(/\s+/g, '_')}.pdf`;
        link.click();
        setStatusMessage({ type: 'success', text: 'PDF downloaded successfully.' });
      } else {
        setStatusMessage({ type: 'error', text: 'Failed to generate PDF.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error generating PDF.' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleGenerateAndStorePdf = async () => {
    if (!certificate.id && !certificate._id) {
      setStatusMessage({ type: 'error', text: 'Save record before generating stored PDF.' });
      return;
    }
    setIsGeneratingPdf(true);
    setStatusMessage(null);
    try {
      const pdfBase64 = await generatePdfBlob();
      if (!pdfBase64) {
        throw new Error('Failed to render PDF canvas.');
      }

      const certId = certificate.id || certificate._id;
      const res = await fetch(`/api/v1/certificates/${certId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ type: 'success', text: 'Internship Certificate PDF stored in secure GridFS storage!' });
        if (onGenerateSuccess) onGenerateSuccess();
      } else {
        setStatusMessage({ type: 'error', text: json.message || 'Failed to store PDF.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error uploading PDF.' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 p-3 sm:p-5 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[95vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Top Control Toolbar */}
        <div className="flex items-center justify-between border-b bg-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-500 border border-orange-200">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>Internship Certificate Preview</span>
                <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-mono text-orange-300 border border-orange-400/30">
                  {certificate.referenceNumber || 'DRAFT-REF'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Official Company Letterhead • Standard A4 Format (210 × 297 mm)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Form</span>
              </button>
            )}

            <button
              onClick={handleDownloadClientPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 rounded-xl border border-orange-500/40 bg-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {isGeneratingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span>Download PDF</span>
            </button>

            {(certificate.id || certificate._id) && (
              <button
                onClick={handleGenerateAndStorePdf}
                disabled={isGeneratingPdf}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Store in GridFS</span>
              </button>
            )}

            {onOpenSendEmail && (
              <button
                onClick={onOpenSendEmail}
                className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-cyan-700 active:scale-95 transition-all"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send via Email</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            className={`px-5 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Scrollable Printable Container displaying standard A4 certificate document */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-200 p-4 sm:p-8 flex justify-center">
          <div className="shadow-2xl border border-slate-300">
            <CertificateDocument ref={printRef} certificate={certificate} />
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
};
