'use client';
import { Portal } from '@/components/modals/Portal';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';


import React, { useState } from 'react';
import { X, Send, Mail, CheckCircle2, AlertCircle, Loader2, Paperclip } from 'lucide-react';
import { OfferLetterRecord, formatCandidateFullName } from '@/types/offerLetter';

interface SendOfferEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: Partial<OfferLetterRecord> | null;
  onSuccess: (msg: string) => void;
}

export const SendOfferEmailModal: React.FC<SendOfferEmailModalProps> = ({
  isOpen,
  onClose,
  offer,
  onSuccess,
}) => {
  useBodyScrollLock(isOpen);

  const [subject, setSubject] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (offer) {
      const companyName = offer.company?.companyName || 'Infinitive Cloud';
      const position = offer.position || 'Position';
      const candidateTitle =
        offer.candidate?.candidateTitle ||
        (offer as any).candidateTitle ||
        offer.candidate?.salutation ||
        (offer as any).salutation ||
        'None';
      const candidateFullName = formatCandidateFullName(
        candidateTitle,
        offer.candidate?.candidateName || 'Candidate'
      );
      setSubject(`Offer Letter — ${companyName} — ${position}`);
      setCustomMessage(
        `Dear ${candidateFullName},\n\nWe are pleased to offer you the position of ${position} at ${companyName}. Please find your official offer letter attached.\n\nKindly review, sign, and return a copy as confirmation of your acceptance.\n\nBest regards,\n${companyName} HR Team`
      );
    }
  }, [offer]);

  const hasPdf = Boolean(offer?.fileId && offer?.status !== 'DRAFT');
  const candidateName = offer?.candidate?.candidateName || 'Candidate';
  const displayFileName = hasPdf
    ? offer?.fileName || `${candidateName.replace(/\s+/g, '_')}_Offer_Letter.pdf`
    : 'PDF Not Generated';

  if (!isOpen || !offer) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offer.id) return;
    if (!hasPdf) {
      setErrorMsg('Cannot send offer email: PDF letter has not been generated yet.');
      return;
    }

    setIsSending(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/v1/recruitment/offers/${offer.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customSubject: subject.trim(),
          customMessage: customMessage.trim(),
        }),
      });

      const json = await res.json();
      setIsSending(false);

      if (json.success) {
        onSuccess(json.message || `Offer letter sent successfully to ${offer.candidate?.email}`);
        onClose();
      } else {
        setErrorMsg(json.message || 'Failed to send offer letter email.');
      }
    } catch (err: any) {
      setIsSending(false);
      setErrorMsg(err.message || 'Error connecting to mail service.');
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl text-xs text-slate-800 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 font-bold text-sm text-emerald-600">
          <div className="flex items-center gap-2">
            <Mail className="h-4.5 w-4.5" />
            <span>Send Offer Letter via Email (Gmail SMTP)</span>
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

        {!hasPdf && !errorMsg && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Offer letter PDF has not been stored in GridFS yet. Please generate the PDF from Preview before sending.</span>
          </div>
        )}

        <form onSubmit={handleSend} className="mt-4 space-y-3">
          <div>
            <label className="font-bold text-slate-900">Recipient Email (Candidate) *</label>
            <input
              type="email"
              disabled
              value={offer.candidate?.email || ''}
              className="mt-1 w-full rounded-xl border p-2 bg-slate-100 font-semibold text-slate-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="font-bold text-slate-900">Email Subject *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="font-bold text-slate-900">Message Body *</label>
            <textarea
              rows={5}
              required
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2 bg-slate-50 focus:border-emerald-500 focus:bg-white text-xs leading-relaxed"
            />
          </div>

          {/* Attachment Badge */}
          <div
            className={`rounded-xl border p-2.5 flex items-center justify-between text-xs ${
              hasPdf
                ? 'border-[#FED7AA] bg-[#FFF7ED]/60 text-slate-900'
                : 'border-amber-200 bg-amber-50/60 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Paperclip className={`h-4 w-4 ${hasPdf ? 'text-orange-500' : 'text-amber-600'}`} />
              <span className="font-semibold">{displayFileName}</span>
            </div>
            {hasPdf ? (
              <span className="rounded-md bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-900 border border-emerald-300">
                PDF Attached
              </span>
            ) : (
              <span className="rounded-md bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                PDF Not Generated
              </span>
            )}
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
              disabled={isSending || !hasPdf}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white shadow-md hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>{isSending ? 'Sending Mail...' : 'Send Offer Email'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
};
