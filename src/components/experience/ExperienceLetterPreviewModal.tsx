'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  X,
  FileText,
  Download,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Printer,
  Send,
  Mail,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { ExperienceLetterRecord } from '@/types/experienceLetter';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ExperienceLetterDocument } from '@/components/experience/ExperienceLetterDocument';
import { downloadExperienceLetterDocx } from '@/lib/experienceLetterDocx';

interface ExperienceLetterPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  letter: Partial<ExperienceLetterRecord> | null;
  onEdit?: () => void;
  onIssueSuccess?: () => void;
}

export const ExperienceLetterPreviewModal: React.FC<ExperienceLetterPreviewModalProps> = ({
  isOpen,
  onClose,
  letter,
  onEdit,
  onIssueSuccess,
}) => {
  useBodyScrollLock(isOpen);

  const printRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Zoom / View Scaling
  const [viewMode, setViewMode] = useState<'fit' | 'actual'>('fit');
  const [fitScale, setFitScale] = useState<number>(0.65);
  const [customZoom, setCustomZoom] = useState<number>(1.0);

  // Dynamic Fit-to-Page scale computation
  const calculateFitScale = useCallback(() => {
    if (!containerRef.current) return;
    const paddingX = 40;
    const paddingY = 40;
    const availableWidth = containerRef.current.clientWidth - paddingX;
    const availableHeight = containerRef.current.clientHeight - paddingY;

    if (availableWidth > 0 && availableHeight > 0) {
      // Standard A4 pixel geometry: 794px width x 1123px height
      const scaleX = availableWidth / 794;
      const scaleY = availableHeight / 1123;
      const fit = Math.min(scaleX, scaleY, 1.0);
      setFitScale(Math.max(0.35, Math.min(1.0, Number(fit.toFixed(3)))));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(calculateFitScale, 60);
    window.addEventListener('resize', calculateFitScale);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        calculateFitScale();
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateFitScale);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [isOpen, calculateFitScale]);

  if (!isOpen || !letter) return null;

  const currentScale = viewMode === 'fit' ? fitScale : customZoom;
  const employeeName = letter.employeeName || 'Employee';
  const referenceNumber = letter.referenceNumber || 'EXP-DOC';

  // Helper to convert HTML DOM into high-resolution single-page PDF Data URI
  const generatePdfDataUri = async (): Promise<string | null> => {
    if (!printRef.current) return null;
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 3, // Ultra-high 300+ DPI capture for razor-sharp, dark text and logo rendering
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123,
        windowWidth: 1200,
        windowHeight: 1600,
        onclone: (clonedDoc, clonedElement) => {
          // Reset transform in cloned DOM so snapshot is captured at true 1:1 geometry
          clonedElement.style.transform = 'none';
          let parent = clonedElement.parentElement;
          while (parent && parent !== clonedDoc.body) {
            parent.style.transform = 'none';
            parent.style.width = '794px';
            parent.style.height = '1123px';
            parent.style.overflow = 'visible';
            parent = parent.parentElement;
          }
        },
      });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });
      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      return pdf.output('datauristring');
    } catch (err) {
      console.error('Experience Letter PDF generation error:', err);
      return null;
    }
  };

  // Client-side direct PDF download
  const handleDownloadClientPdf = async () => {
    setIsGeneratingPdf(true);
    setStatusMessage(null);
    try {
      const dataUri = await generatePdfDataUri();
      if (dataUri) {
        const cleanEmpName = (employeeName || 'Employee').replace(/[^a-zA-Z0-9_-]/g, '_');
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = `Experience_Cum_Relieving_Letter_${letter.employeeId || 'EMP'}_${cleanEmpName}.pdf`;
        link.click();
        setStatusMessage({ type: 'success', text: 'Experience Cum Relieving Letter PDF downloaded successfully.' });
      } else {
        setStatusMessage({ type: 'error', text: 'Failed to generate PDF document.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error generating PDF.' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Officially Issue and save to MongoDB GridFS & Documents collection
  const handleIssueAndStore = async () => {
    const letterId = letter.id || letter._id;
    if (!letterId) {
      setStatusMessage({ type: 'error', text: 'Please save record first before official issuance.' });
      return;
    }

    setIsIssuing(true);
    setStatusMessage(null);
    try {
      const pdfBase64 = await generatePdfDataUri();
      if (!pdfBase64) {
        throw new Error('Failed to render PDF canvas for official storage.');
      }

      const res = await fetch(`/api/v1/experience-letters/${letterId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setStatusMessage({
          type: 'success',
          text: 'Official Experience Letter successfully issued and stored in employee documents!',
        });
        if (onIssueSuccess) {
          onIssueSuccess();
        }
      } else {
        setStatusMessage({ type: 'error', text: json.message || 'Failed to issue experience letter.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Network error while issuing letter.' });
    } finally {
      setIsIssuing(false);
    }
  };

  // Native Print
  const handlePrint = () => {
    window.print();
  };

  // Download Word .docx format
  const handleDownloadDocx = async () => {
    if (!letter) return;
    setIsGeneratingDocx(true);
    try {
      await downloadExperienceLetterDocx(
        {
          letter,
          employeeName: letter.employeeName,
          designation: letter.designation,
          joiningDate: letter.joiningDate,
          relievingDate: letter.relievingDate,
          issueDate: letter.issueDate,
        },
        `${(letter.employeeName || 'Experience_Cum_Relieving_Letter').replace(/\s+/g, '_')}_Experience_Letter.docx`
      );
    } catch (err: any) {
      console.warn('Direct docx export fallback:', err);
      window.open('/api/v1/experience-letters/download-docx', '_blank');
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  // Handle direct email sending with generated PDF attachment
  const handleDirectSendEmail = async () => {
    const letterId = letter.id || letter._id;
    if (!letterId) {
      setStatusMessage({ type: 'error', text: 'Please save the letter record before sending email.' });
      return;
    }

    setIsSendingEmail(true);
    setStatusMessage(null);
    try {
      // 1. Render crisp PDF base64 for email attachment matching current preview
      const pdfBase64 = await generatePdfDataUri();
      if (!pdfBase64) {
        throw new Error('Failed to render PDF canvas for email attachment.');
      }

      const res = await fetch(`/api/v1/experience-letters/${letterId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        const sentTo = json.emailSentTo || letter.employeeEmail || 'the registered email address';
        setStatusMessage({
          type: 'success',
          text: json.message || `Experience letter sent successfully to ${sentTo}`,
        });
        if (letter) {
          letter.emailSent = true;
          letter.emailSentAt = json.emailSentAt;
          letter.emailSentTo = sentTo;
        }
        if (onIssueSuccess) {
          onIssueSuccess();
        }
      } else {
        setStatusMessage({
          type: 'error',
          text: json.message || 'Failed to dispatch email. Please check SMTP configuration.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Network error while dispatching email.',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs overflow-y-auto overscroll-contain">
      <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Print Stylesheet for 1-Page Exact Output */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 0;
            }
            body * {
              visibility: hidden !important;
            }
            #experience-letter-print-sheet,
            #experience-letter-print-sheet * {
              visibility: visible !important;
            }
            #experience-letter-print-sheet {
              position: fixed !important;
              left: 0 !important;
              top: 0 !important;
              width: 210mm !important;
              height: 297mm !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              transform: none !important;
            }
          }
        `,
          }}
        />

        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-slate-200 bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#FFF7ED] p-2 text-orange-500 border border-[#FED7AA]/60">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">
                  Experience Letter Preview
                </h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    letter.status === 'ISSUED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : letter.status === 'REVOKED'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {letter.status || 'DRAFT'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {referenceNumber} • {employeeName} ({letter.employeeId})
              </p>
            </div>
          </div>

          {/* Center: View Mode / Zoom Controls */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('fit');
                calculateFitScale();
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                viewMode === 'fit'
                  ? 'bg-[#FFF7ED] text-orange-700 border border-[#FED7AA] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title="Fit entire letter on screen without scrolling"
            >
              <Maximize2 className="h-3.5 w-3.5 text-orange-500" />
              <span>Fit to Page</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('actual');
                setCustomZoom(1.0);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                viewMode === 'actual' && customZoom === 1.0
                  ? 'bg-[#FFF7ED] text-orange-700 border border-[#FED7AA] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              title="View at 100% actual size"
            >
              <ZoomIn className="h-3.5 w-3.5" />
              <span>100%</span>
            </button>

            <div className="h-4 w-[1px] bg-slate-200 mx-1" />

            <button
              type="button"
              onClick={() => {
                setViewMode('actual');
                setCustomZoom((prev) => Math.max(0.4, Number((prev - 0.1).toFixed(2))));
              }}
              disabled={currentScale <= 0.4}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>

            <span className="text-[11px] font-mono font-bold text-slate-700 min-w-[38px] text-center">
              {Math.round(currentScale * 100)}%
            </span>

            <button
              type="button"
              onClick={() => {
                setViewMode('actual');
                setCustomZoom((prev) => Math.min(1.5, Number((prev + 0.1).toFixed(2))));
              }}
              disabled={currentScale >= 1.5}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onEdit && letter.status !== 'ISSUED' && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                <span>Edit Fields</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            className={`px-6 py-3 text-xs flex items-center justify-between shrink-0 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-b border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-[11px] font-bold underline hover:opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Modal Scrollable Body: Live A4 Preview with Fit-to-Page View */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto overscroll-contain p-4 sm:p-6 bg-slate-200/70 flex items-center justify-center min-h-[460px]"
        >
          <div
            style={{
              width: `${Math.round(794 * currentScale)}px`,
              height: `${Math.round(1123 * currentScale)}px`,
              position: 'relative',
              flexShrink: 0,
              transition: 'width 0.15s ease-out, height 0.15s ease-out',
            }}
            className="shadow-2xl rounded-xs bg-white print:shadow-none"
          >
            <div
              style={{
                width: '794px',
                height: '1123px',
                transform: `scale(${currentScale})`,
                transformOrigin: 'top left',
                transition: 'transform 0.15s ease-out',
              }}
            >
              <ExperienceLetterDocument ref={printRef} letter={letter} />
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-200 bg-white shrink-0">
          {/* Print */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={isGeneratingPdf || isIssuing || isSendingEmail}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Printer className="h-4 w-4 text-slate-500" />
            <span>Print</span>
          </button>

          {/* Download PDF */}
          <button
            type="button"
            onClick={handleDownloadClientPdf}
            disabled={isGeneratingPdf || isGeneratingDocx || isIssuing || isSendingEmail}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                <span>Rendering PDF...</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4 text-slate-600" />
                <span>Download PDF</span>
              </>
            )}
          </button>

          {/* Download Word DOCX */}
          <button
            type="button"
            onClick={handleDownloadDocx}
            disabled={isGeneratingPdf || isGeneratingDocx || isIssuing || isSendingEmail}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-2 text-xs font-semibold text-orange-700 shadow-2xs hover:bg-[#FFEDD5] transition-colors disabled:opacity-50 cursor-pointer"
            title="Download editable single-page Word document (.docx)"
          >
            {isGeneratingDocx ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                <span>Exporting Word...</span>
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 text-orange-500" />
                <span>Download Word (.docx)</span>
              </>
            )}
          </button>

          {/* Send Email - Direct Send */}
          <button
            type="button"
            onClick={handleDirectSendEmail}
            disabled={isGeneratingPdf || isIssuing || isSendingEmail}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-4 py-2 text-xs font-semibold text-orange-700 shadow-2xs hover:bg-[#FFEDD5] transition-colors disabled:opacity-50 cursor-pointer"
            title="Send Experience Letter PDF directly to employee's registered email"
          >
            {isSendingEmail ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                <span>Sending Email...</span>
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 text-orange-500" />
                <span>Send Email</span>
              </>
            )}
          </button>

          {/* Issue Letter or Officially Issued Status */}
          {letter.status !== 'ISSUED' ? (
            <button
              type="button"
              onClick={handleIssueAndStore}
              disabled={isGeneratingPdf || isIssuing || isSendingEmail}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 px-5 py-2 text-xs font-bold text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isIssuing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Issuing & Storing...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Issue Letter</span>
                </>
              )}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3.5 py-2 rounded-xl border border-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Officially Issued</span>
            </span>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
};

