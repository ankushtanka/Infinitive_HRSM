'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useRef, useState } from 'react';
import { X, FileText, Download, Send, Edit3, CheckCircle2, AlertCircle, Loader2, Sparkles, Building2, Printer } from 'lucide-react';
import { OfferLetterRecord, formatCandidateFullName } from '@/types/offerLetter';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface OfferLetterPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: Partial<OfferLetterRecord> | null;
  onEdit?: () => void;
  onGenerateSuccess?: () => void;
  onOpenSendEmail?: () => void;
}

export const OfferLetterPreviewModal: React.FC<OfferLetterPreviewModalProps> = ({
  isOpen,
  onClose,
  offer,
  onEdit,
  onGenerateSuccess,
  onOpenSendEmail,
}) => {
  useBodyScrollLock(isOpen);

  const printRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen || !offer) return null;

  const company = offer.company || {
    companyName: 'INFINITIVE CLOUD',
    registeredOffice: 'Kankroli,Rajasthan,313324',
    officeAddress: 'Udaipur Rajasthan,313001',
    phone: '+91 8690393087',
    email: 'cloudinfinitive@gmail.com',
    cin: 'U62020RJ2025PTC109151',
  };

  const candidate = offer.candidate || {
    candidateName: 'Candidate Name',
    email: 'candidate@email.com',
    phone: '',
    address: 'Udaipur (Raj)',
    collegeName: 'Techno India NJR Institute of Technology',
  };

  const candidateTitle =
    offer.candidate?.candidateTitle ||
    (offer as any).candidateTitle ||
    offer.candidate?.salutation ||
    (offer as any).salutation ||
    'None';
  const candidateFullNameWithTitle = formatCandidateFullName(candidateTitle, candidate.candidateName);

  const isInternship = offer.offerType === 'INTERNSHIP';
  const titleText = isInternship ? 'Internship offer Letter' : 'Employment Offer Letter';
  const durationMonths = offer.durationMonths || 3;
  const isNonStipendiary = offer.stipendType === 'NON_STIPENDIARY';
  const stipendAmount = offer.salaryStipend || 0;

  const generatePdfBlob = async (): Promise<string | null> => {
    if (!printRef.current) return null;
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      return pdf.output('datauristring');
    } catch (err) {
      console.error('HTML2Canvas PDF generation error:', err);
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
        link.download = `${(candidate.candidateName || 'Candidate').replace(/\s+/g, '_')}_Offer_Letter.pdf`;
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
    if (!offer.id) {
      setStatusMessage({ type: 'error', text: 'Save draft before generating stored PDF.' });
      return;
    }
    setIsGeneratingPdf(true);
    setStatusMessage(null);
    try {
      const pdfBase64 = await generatePdfBlob();
      if (!pdfBase64) {
        throw new Error('Failed to render PDF canvas.');
      }

      const res = await fetch(`/api/v1/recruitment/offers/${offer.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMessage({ type: 'success', text: 'Offer Letter PDF stored in secure GridFS storage!' });
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
        {/* Top Control Bar */}
        <div className="flex items-center justify-between border-b bg-slate-900 px-5 py-3.5 text-white">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-500 border border-orange-200">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <span>Offer Letter Document Preview</span>
                <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-mono text-orange-300 border border-orange-400/30">
                  {offer.referenceNumber || 'DRAFT-REF'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Official Company Letterhead • Standard A4 Format
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Offer</span>
              </button>
            )}

            <button
              onClick={handleDownloadClientPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download PDF</span>
            </button>

            {offer.id && (
              <button
                onClick={handleGenerateAndStorePdf}
                disabled={isGeneratingPdf}
                className="flex items-center gap-1 rounded-xl bg-orange-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-orange-600 active:bg-orange-700 active:scale-95 disabled:opacity-50"
              >
                {isGeneratingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>Generate & Store PDF</span>
              </button>
            )}

            {onOpenSendEmail && (
              <button
                onClick={onOpenSendEmail}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send to Candidate</span>
              </button>
            )}

            <button onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Status Notification Banner */}
        {statusMessage && (
          <div
            className={`px-5 py-2 text-xs font-semibold flex items-center justify-between ${
              statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-rose-50 text-rose-800 border-b border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-rose-600" />}
              <span>{statusMessage.text}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="font-bold text-slate-500 hover:text-slate-800">✕</button>
          </div>
        )}

        {/* Scrollable Printable A4 Letter Container */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-200 p-4 sm:p-8 flex justify-center">
          <div
            ref={printRef}
            className="w-[210mm] min-h-[297mm] bg-white p-[15mm] text-slate-900 shadow-xl border border-slate-300 font-sans flex flex-col justify-between"
            style={{ fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif' }}
          >
            <div>
              {/* COMPANY HEADER */}
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
                <div className="flex items-center gap-3">
                  <img
                    src={company.logoUrl || '/infinitive_cloud_logo.png'}
                    alt={company.companyName}
                    className="h-20 w-auto max-w-[85mm] object-contain shrink-0"
                  />
                  <div>
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">{company.companyName}</h1>
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Limitless Solution for Cloud and Web Hosting</p>
                  </div>
                </div>

                <div className="text-right text-[10px] leading-tight text-slate-800 space-y-0.5">
                  <p className="font-extrabold text-slate-900 text-xs">{company.companyName}</p>
                  <p><span className="font-bold">Registered Office:</span> {company.registeredOffice}</p>
                  <p><span className="font-bold">Office Address:</span> {company.officeAddress}</p>
                  <p><span className="font-bold">Phone No:</span> {company.phone}</p>
                  <p><span className="font-bold">Email:</span> {company.email}</p>
                  <p><span className="font-bold">CIN No:</span> {company.cin}</p>
                </div>
              </div>

              {/* REFERENCE / DATE BAR */}
              <div className="mt-5 flex items-center justify-between text-xs font-bold text-slate-900">
                <div>
                  <span>Ref:</span> <span className="font-mono">{offer.referenceNumber || 'INFINITIVE/01092026/10'}</span>
                </div>
                <div>
                  <span>Date:</span> <span>{offer.offerDate || '01st Sep. 2026'}</span>
                </div>
              </div>

              {/* CANDIDATE ADDRESS SECTION */}
              <div className="mt-6 text-xs text-slate-900 font-medium space-y-0.5 leading-relaxed">
                <p className="font-bold text-sm">{candidateFullNameWithTitle},</p>
                {candidate.collegeName && <p>{candidate.collegeName},</p>}
                <p>{candidate.address}</p>
              </div>

              {/* DOCUMENT TITLE */}
              <div className="mt-6 text-center">
                <h2 className="text-sm font-extrabold uppercase text-slate-900 underline underline-offset-4 tracking-wide">
                  {titleText}
                </h2>
              </div>

              {/* SALUTATION & GREETING */}
              <div className="mt-5 text-xs text-slate-900 leading-relaxed space-y-3">
                <p>Dear <strong className="font-bold">{candidateFullNameWithTitle}</strong>,</p>

                <p>Welcome to <strong className="font-bold">{company.companyName}</strong>.</p>

                <p>
                  With reference to your application and the subsequent interviews and discussions with you, we are pleased to offer you the position of{' '}
                  <strong className="font-bold">{offer.position || 'Full Stack Development(Intern)'}</strong> on the terms & conditions as agreed mutually.
                </p>

                <p>
                  You are required to start your training on <strong className="font-bold">{offer.joiningDate || '01st Sep. 2026'}</strong>, you shall soon receive further instructions in successive communications. You would need to furnish the documents listed below:
                </p>
              </div>

              {/* REQUIRED DOCUMENTS CHECKLIST */}
              <div className="mt-3 ml-4 text-xs text-slate-900 font-medium space-y-1">
                {(offer.requiredDocuments || [
                  'Education Qualification Certificates',
                  'e-Aadhar',
                  'PAN Card',
                  'Recent Professional Passport Size Photographs',
                ]).map((docItem, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="font-bold">{idx + 1}.</span>
                    <span>{docItem}</span>
                  </div>
                ))}
              </div>

              {/* TERMS & CONDITIONS PARAGRAPHS */}
              <div className="mt-4 text-xs text-slate-900 leading-relaxed space-y-3">
                {isInternship ? (
                  <>
                    <p>
                      The Internship duration shall be for <strong className="font-bold">{durationMonths} months</strong>; the internship period is subject to reduction / extension according to the performance evaluation.
                    </p>
                    <p>
                      Upon successful completion of the internship, and subject to fulfilling the required attendance criteria and performance standards, an Internship Completion Certificate will be issued. Absences will only be permitted under exceptional and valid circumstances with prior approval.
                    </p>
                    <p>
                      {isNonStipendiary ? (
                        'Please note that this is a non-stipendiary internship, and no monetary compensation will be provided during the training period.'
                      ) : (
                        <span>
                          Monthly stipend compensation of <strong className="font-bold">₹{stipendAmount.toLocaleString('en-IN')}</strong> will be provided during the training period based on performance evaluation.
                        </span>
                      )}
                    </p>
                    <p>
                      The company reserves the right to relieve at any point of time during training if any of the training instructions are not fulfilled, the same shall be briefed to you on the first day of your training.
                    </p>
                    <p>
                      This offer is a valid subject to reference check. Please sign a copy of this <strong className="font-bold">‘{titleText}’</strong> as a token of your acceptance. We wish you wonderful learning with organization and expect a long and fulfilling career with us after successful training.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      You will be on probation for a period of <strong className="font-bold">{offer.probationPeriod || '3 Months'}</strong> from your date of joining. Upon successful evaluation of performance, your employment will be confirmed in writing.
                    </p>
                    <p>
                      Your working hours will be <strong className="font-bold">{offer.workingHours || '9:30 AM - 6:30 PM (Mon-Sat)'}</strong>. Notice period required for separation is <strong className="font-bold">{offer.noticePeriod || '15 Days'}</strong>.
                    </p>
                    <p>
                      You will be governed by the standard rules, code of conduct, confidentiality agreements, and HR policy guidelines of {company.companyName}.
                    </p>
                    <p>
                      This offer is contingent upon successful reference check and background verification of your educational qualifications.
                    </p>
                  </>
                )}

                {offer.additionalTerms && (
                  <p className="mt-2 font-medium italic text-slate-800 border-l-2 border-slate-400 pl-3">
                    Additional Clause: {offer.additionalTerms}
                  </p>
                )}
              </div>
            </div>

            {/* AUTHORIZED SIGNATORY & CANDIDATE ACCEPTANCE SECTION */}
            <div className="mt-12 border-t pt-6 grid grid-cols-2 gap-8 text-xs text-slate-900">
              {/* Left Signatory Block */}
              <div>
                <p className="font-bold text-slate-900">For {company.companyName}</p>
                <div className="h-16" />
                <p className="font-bold text-slate-800 border-t border-slate-300 pt-1 inline-block pr-8">Authorized Signatory</p>
              </div>

              {/* Right Candidate Acceptance Block */}
              <div>
                <p className="font-bold text-slate-900">I have read, understood and accepted the above.</p>
                <div className="mt-8 grid grid-cols-3 gap-2 text-[11px] text-slate-700 pt-2 border-t border-slate-300">
                  <div>
                    <span className="font-semibold text-slate-900">Signed by:</span> ______
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Date:</span> ______
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Place:</span> ______
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
};
