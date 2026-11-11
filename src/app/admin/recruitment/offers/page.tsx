'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminLayout } from '@/components/layout/AdminLayout';
import {
  FileText,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  Send,
  Download,
  Edit3,
  Trash2,
  ArrowLeft,
  Building2,
  Sparkles,
  Users,
  Briefcase,
  History,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { OfferLetterRecord, OfferType, OfferStatus, formatCandidateFullName } from '@/types/offerLetter';
import { OfferLetterModal } from '@/components/recruitment/OfferLetterModal';
import { OfferLetterPreviewModal } from '@/components/recruitment/OfferLetterPreviewModal';
import { SendOfferEmailModal } from '@/components/recruitment/SendOfferEmailModal';

export default function OfferLettersPage() {
  const [offers, setOffers] = useState<OfferLetterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter & Pagination States
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isSendEmailModalOpen, setIsSendEmailModalOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<OfferLetterRecord | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '20');
      if (search.trim()) params.append('search', search.trim());
      if (selectedStatus !== 'All') params.append('status', selectedStatus);
      if (selectedType !== 'All') params.append('offerType', selectedType);

      const res = await fetch(`/api/v1/recruitment/offers?${params.toString()}`);
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        setOffers(json.data);
        if (json.pagination) {
          setTotalPages(json.pagination.totalPages || 1);
          setTotalCount(json.pagination.totalCount || 0);
        }
      } else {
        setErrorMsg(json.message || 'Failed to fetch offer letters.');
      }
    } catch (err: any) {
      console.error('Error fetching offer letters:', err);
      setErrorMsg('Error connecting to offer letters service.');
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedStatus, selectedType]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  const handleSaveDraft = async (offerData: Partial<OfferLetterRecord>) => {
    try {
      const method = offerData.id ? 'PATCH' : 'POST';
      const url = offerData.id ? `/api/v1/recruitment/offers/${offerData.id}` : '/api/v1/recruitment/offers';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(offerData),
      });

      const json = await res.json();
      if (json.success) {
        showToast(json.message || 'Offer letter saved successfully.');
        setIsCreateModalOpen(false);
        setSelectedOffer(null);
        fetchOffers();
      } else {
        alert(json.message || 'Failed to save offer letter.');
      }
    } catch (err: any) {
      alert(err.message || 'Error saving offer letter.');
    }
  };

  const handleDeleteOffer = async (offer: OfferLetterRecord) => {
    const candidateDisplayName = formatCandidateFullName(
      offer.candidate?.candidateTitle || (offer as any).candidateTitle || offer.candidate?.salutation || (offer as any).salutation,
      offer.candidate?.candidateName
    );
    if (!confirm(`Are you sure you want to delete the offer letter for ${candidateDisplayName}?`)) return;
    try {
      const res = await fetch(`/api/v1/recruitment/offers/${offer.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        showToast('Offer letter deleted successfully.');
        fetchOffers();
      } else {
        alert(json.message || 'Failed to delete offer letter.');
      }
    } catch (err) {
      alert('Error deleting offer letter.');
    }
  };

  const getStatusBadge = (status: OfferStatus) => {
    switch (status) {
      case 'DRAFT':
        return <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-[10px] font-bold border border-slate-200">DRAFT</span>;
      case 'GENERATED':
        return <span className="rounded-full bg-[#FFF7ED] text-orange-800 px-2.5 py-0.5 text-[10px] font-bold border border-[#FED7AA]">GENERATED</span>;
      case 'SENT':
        return <span className="rounded-full bg-[#FFF7ED] text-orange-800 px-2.5 py-0.5 text-[10px] font-bold border border-[#FED7AA]">SENT</span>;
      case 'ACCEPTED':
        return <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-[10px] font-bold border border-emerald-200">ACCEPTED</span>;
      case 'DECLINED':
        return <span className="rounded-full bg-rose-100 text-rose-800 px-2.5 py-0.5 text-[10px] font-bold border border-rose-200">DECLINED</span>;
      case 'EXPIRED':
        return <span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-[10px] font-bold border border-amber-200">EXPIRED</span>;
      default:
        return <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-[10px] font-bold">{status}</span>;
    }
  };

  const draftCount = offers.filter((o) => o.status === 'DRAFT').length;
  const sentCount = offers.filter((o) => o.status === 'SENT').length;
  const acceptedCount = offers.filter((o) => o.status === 'ACCEPTED').length;

  return (
    <AdminLayout>
      <div className="space-y-6 text-xs text-slate-800 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed right-6 top-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs text-white shadow-2xl animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/recruitment"
              className="flex items-center gap-1 text-slate-500 hover:text-slate-900 font-semibold text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Recruitment</span>
            </Link>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1 flex items-center gap-2">
            <FileText className="h-6 w-6 text-orange-500" />
            <span>Offer Letters & Document Generation</span>
          </h1>
          <p className="text-xs text-slate-500">
            Generate, preview, store, version, and dispatch official Infinitive Cloud offer letters to candidates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedOffer(null);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 font-bold text-white shadow-md hover:bg-orange-600 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>Generate Offer Letter</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-bold">Total Offers Issued</span>
            <FileText className="h-4 w-4 text-orange-500" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{totalCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-bold">Draft / Prepared</span>
            <Clock className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{draftCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-orange-700 font-bold">Sent to Candidate</span>
            <Send className="h-4 w-4 text-orange-500" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{sentCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-emerald-700 font-bold">Accepted Offers</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-900">{acceptedCount}</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500 focus-within:bg-white max-w-md">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search candidate name, email, reference, position..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-900 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-semibold text-slate-600 text-xs">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
            >
              <option value="All">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="GENERATED">Generated</option>
              <option value="SENT">Sent</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="DECLINED">Declined</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600 text-xs">Type:</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
            >
              <option value="All">All Offer Types</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="FULL_TIME">Full-Time</option>
              <option value="PART_TIME">Part-Time</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </div>

          <button
            onClick={() => fetchOffers()}
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
            <Loader2 className="h-7 w-7 animate-spin text-orange-500" />
            <span>Loading offer letters...</span>
          </div>
        ) : errorMsg ? (
          <div className="p-8 text-center text-rose-600 font-semibold">{errorMsg}</div>
        ) : offers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <FileText className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="font-bold text-sm text-slate-700">No Offer Letters Found</p>
            <p className="text-xs text-slate-500">Create your first offer letter for a candidate using the button above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b">
                <tr>
                  <th className="px-4 py-3">Reference No.</th>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Position & Dept</th>
                  <th className="px-4 py-3">Offer Type</th>
                  <th className="px-4 py-3">Joining Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Ver.</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offers.map((offer) => (
                  <tr key={offer.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-orange-950">
                      {offer.referenceNumber}
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">
                        {formatCandidateFullName(
                          offer.candidate?.candidateTitle || (offer as any).candidateTitle || offer.candidate?.salutation || (offer as any).salutation,
                          offer.candidate?.candidateName
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">{offer.candidate?.email}</p>
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{offer.position}</p>
                      <p className="text-[11px] text-slate-500">{offer.department}</p>
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border">
                        {offer.offerType}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {offer.joiningDate}
                    </td>

                    <td className="px-4 py-3">
                      {getStatusBadge(offer.status)}
                    </td>

                    <td className="px-4 py-3 font-mono text-slate-600">
                      v{offer.version || 1}
                    </td>

                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        onClick={() => {
                          setSelectedOffer(offer);
                          setIsPreviewModalOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-orange-500 hover:bg-orange-50"
                        title="Preview & Download Offer Letter"
                      >
                        <Eye className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => {
                          setSelectedOffer(offer);
                          setIsCreateModalOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                        title="Edit Offer Details"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => {
                          setSelectedOffer(offer);
                          setIsSendEmailModalOpen(true);
                        }}
                        className={`rounded-lg p-1.5 transition-colors ${
                          offer.status === 'DRAFT' || !offer.fileId
                            ? 'text-slate-400 hover:bg-slate-100'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={
                          offer.status === 'DRAFT' || !offer.fileId
                            ? 'Generate PDF before sending email'
                            : 'Send via Email to Candidate'
                        }
                      >
                        <Send className="h-4 w-4" />
                      </button>

                      {offer.status === 'DRAFT' && (
                        <button
                          onClick={() => handleDeleteOffer(offer)}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                          title="Delete Offer Letter Draft"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <OfferLetterModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSave={handleSaveDraft}
        initialData={selectedOffer}
      />

      <OfferLetterPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        offer={selectedOffer}
        onEdit={() => {
          setIsPreviewModalOpen(false);
          setIsCreateModalOpen(true);
        }}
        onGenerateSuccess={() => fetchOffers()}
        onOpenSendEmail={() => {
          setIsPreviewModalOpen(false);
          setIsSendEmailModalOpen(true);
        }}
      />

      <SendOfferEmailModal
        isOpen={isSendEmailModalOpen}
        onClose={() => setIsSendEmailModalOpen(false)}
        offer={selectedOffer}
        onSuccess={(msg) => {
          showToast(msg);
          fetchOffers();
        }}
      />
      </div>
    </AdminLayout>
  );
}
