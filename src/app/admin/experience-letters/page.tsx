'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminLayout } from '@/components/layout/AdminLayout';
import {
  Award,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  Download,
  Trash2,
  Building2,
  Sparkles,
  Users,
  FileText,
  Loader2,
  RefreshCw,
  Calendar,
  Edit3,
  Send,
  Mail,
  Printer,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { ExperienceLetterRecord } from '@/types/experienceLetter';
import { GenerateExperienceLetterModal } from '@/components/experience/GenerateExperienceLetterModal';
import { ExperienceLetterPreviewModal } from '@/components/experience/ExperienceLetterPreviewModal';

export default function ExperienceLettersAdminPage() {
  const [letters, setLetters] = useState<ExperienceLetterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Search & Pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // KPIs
  const [kpis, setKpis] = useState({
    total: 0,
    issued: 0,
    draft: 0,
    revoked: 0,
  });

  // Modal State
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [editingLetter, setEditingLetter] = useState<ExperienceLetterRecord | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<ExperienceLetterRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDownloadingId, setIsDownloadingId] = useState<string | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchLetters = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        search,
        status: statusFilter,
      });

      const res = await fetch(`/api/v1/experience-letters?${params.toString()}`);
      const json = await res.json();

      if (res.ok && json.success) {
        setLetters(json.data.letters || []);
        setTotalPages(json.data.pagination.totalPages || 1);
        setTotalCount(json.data.pagination.total || 0);
        if (json.data.kpis) {
          setKpis(json.data.kpis);
        }
      } else {
        setErrorMsg(json.message || 'Failed to fetch experience letters.');
      }
    } catch (err: any) {
      console.error('Error loading experience letters:', err);
      setErrorMsg('Unable to connect to experience letter service.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchLetters();
  }, [fetchLetters]);

  // Handle Save (Draft or Update)
  const handleSaveLetter = async (
    data: Partial<ExperienceLetterRecord>,
    andPreview = false
  ): Promise<{ success: boolean; message: string; letterId?: string }> => {
    try {
      const letterId = data.id || data._id;
      const isEdit = Boolean(letterId);
      const url = isEdit ? `/api/v1/experience-letters/${letterId}` : '/api/v1/experience-letters';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        showToast(
          isEdit
            ? 'Experience letter updated successfully!'
            : 'Experience letter draft created successfully!'
        );
        fetchLetters();
        setIsGenerateModalOpen(false);

        if (andPreview) {
          setSelectedLetter(json.data);
          setIsPreviewModalOpen(true);
        }
        return { success: true, message: json.message, letterId: json.data.id || json.data._id };
      } else {
        return { success: false, message: json.message || 'Failed to save experience letter.' };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error while saving letter.' };
    }
  };

  // Handle Delete / Revoke
  const handleDeleteLetter = async (letter: ExperienceLetterRecord) => {
    if (
      !confirm(
        `Are you sure you want to delete Experience Letter ${letter.referenceNumber} for ${letter.employeeName}? This action cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(letter.id);
    try {
      const res = await fetch(`/api/v1/experience-letters/${letter.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Experience letter removed successfully.');
        fetchLetters();
      } else {
        showToast(json.message || 'Failed to delete experience letter.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Network error deleting letter.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Direct download PDF
  const handleDirectDownload = async (letter: ExperienceLetterRecord) => {
    if (!letter.fileId) {
      // Open preview so they can generate & download
      setSelectedLetter(letter);
      setIsPreviewModalOpen(true);
      return;
    }

    setIsDownloadingId(letter.id);
    try {
      const link = document.createElement('a');
      link.href = `/api/v1/experience-letters/${letter.id}/download`;
      link.download = letter.fileName || `Experience_Letter_${letter.referenceNumber.replace(/[\/\\]/g, '_')}.pdf`;
      link.click();
      showToast('Downloading official PDF document...');
    } catch (err: any) {
      showToast(err.message || 'Error triggering download.', 'error');
    } finally {
      setIsDownloadingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-10">
        {/* Header Breadcrumb & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
              <Link href="/admin/dashboard" className="hover:text-orange-600 transition-colors">
                Dashboard
              </Link>
              <span>/</span>
              <Link href="/admin/documents" className="hover:text-orange-600 transition-colors">
                Documents
              </Link>
              <span>/</span>
              <span className="text-slate-900 font-bold">Experience Cum Relieving Letters</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Experience Letters
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Generate, preview, issue, and archive official Experience Cum Relieving Letters on verified Infinitive Cloud letterhead
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fetchLetters()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh Records"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-orange-500' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={() => {
                setEditingLetter(null);
                setIsGenerateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Generate Experience Letter</span>
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMessage && (
          <div
            className={`rounded-2xl border p-4 text-xs flex items-center justify-between shadow-xs ${
              toastMessage.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span className="font-semibold">{toastMessage.text}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-[11px] font-bold underline">
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Top 4 Clean KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Generated */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Letters
              </span>
              <div className="rounded-xl bg-[#FFF7ED] p-2 text-orange-500 border border-[#FED7AA]/60">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-slate-900 tracking-tight">{kpis.total}</p>
              <p className="text-xs font-medium text-slate-500 mt-0.5">All created records</p>
            </div>
          </div>

          {/* Officially Issued */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Officially Issued
              </span>
              <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 border border-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-slate-900 tracking-tight">{kpis.issued}</p>
              <p className="text-xs font-medium text-emerald-600 mt-0.5">Stored & issued to employees</p>
            </div>
          </div>

          {/* Pending Drafts */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Drafts Pending
              </span>
              <div className="rounded-xl bg-amber-50 p-2 text-amber-600 border border-amber-100">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-slate-900 tracking-tight">{kpis.draft}</p>
              <p className="text-xs font-medium text-amber-600 mt-0.5">Awaiting PDF generation</p>
            </div>
          </div>

          {/* Revoked */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Revoked / Inactive
              </span>
              <div className="rounded-xl bg-slate-50 p-2 text-slate-600 border border-slate-200">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-slate-900 tracking-tight">{kpis.revoked}</p>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Decommissioned records</p>
            </div>
          </div>
        </div>

        {/* 2. Filter & Search Toolbar */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by employee name, ID, ref no, or designation..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white focus:outline-hidden focus:border-orange-500 focus:ring-1 focus:ring-orange-500 cursor-pointer min-w-[130px]"
            >
              <option value="All">All Statuses</option>
              <option value="ISSUED">Issued Only</option>
              <option value="DRAFT">Draft Only</option>
              <option value="REVOKED">Revoked Only</option>
            </select>

            {(search || statusFilter !== 'All') && (
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('All');
                  setPage(1);
                }}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* 3. Main Data Table */}
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-16 text-center space-y-3">
              <Loader2 className="h-7 w-7 animate-spin text-orange-500 mx-auto" />
              <p className="text-xs font-semibold text-slate-500">Loading experience letters...</p>
            </div>
          ) : errorMsg ? (
            <div className="p-12 text-center space-y-2">
              <AlertCircle className="h-6 w-6 text-rose-500 mx-auto" />
              <p className="text-xs font-bold text-rose-900">{errorMsg}</p>
              <button
                onClick={() => fetchLetters()}
                className="text-xs font-bold text-orange-500 underline hover:text-orange-800"
              >
                Retry loading
              </button>
            </div>
          ) : letters.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-[#FFF7ED] text-orange-500 mx-auto flex items-center justify-center border border-[#FED7AA]/60">
                <FileText className="h-6 w-6" />
              </div>
              <p className="text-sm font-extrabold text-slate-900">No experience letters found</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No experience certificates have been generated matching your query. Click &quot;Generate Experience Letter&quot; to issue an official certificate.
              </p>
              <button
                onClick={() => {
                  setEditingLetter(null);
                  setIsGenerateModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Generate First Experience Letter</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
                  <tr className="border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Role & Department</th>
                    <th className="py-3 px-4">Employment Period</th>
                    <th className="py-3 px-4">Ref Number</th>
                    <th className="py-3 px-4">Issue Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {letters.map((letter) => (
                    <tr key={letter.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Employee */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center text-xs shrink-0 uppercase border border-[#FED7AA]">
                            {letter.employeeName?.[0] || 'E'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">
                              {letter.salutation && letter.salutation !== 'None' ? `${letter.salutation} ` : ''}
                              {letter.employeeName}
                            </p>
                            <span className="font-mono text-[10px] text-slate-500">
                              {letter.employeeId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role & Dept */}
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-800">{letter.designation}</p>
                        <p className="text-[11px] text-slate-500">{letter.department}</p>
                      </td>

                      {/* Period */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <p className="font-mono text-slate-800 font-medium">
                            {letter.joiningDate} → {letter.relievingDate}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Verified Employment
                          </p>
                        </div>
                      </td>

                      {/* Ref Number */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          {letter.referenceNumber}
                        </span>
                      </td>

                      {/* Issue Date */}
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {letter.issueDate}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              letter.status === 'ISSUED'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : letter.status === 'REVOKED'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                letter.status === 'ISSUED'
                                  ? 'bg-emerald-500'
                                  : letter.status === 'REVOKED'
                                  ? 'bg-rose-500'
                                  : 'bg-amber-500'
                              }`}
                            />
                            <span>{letter.status || 'DRAFT'}</span>
                          </span>
                          {letter.emailSent && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-[#FFF7ED] border border-[#FED7AA]/60 rounded-md px-1.5 py-0.5"
                              title={`Emailed to ${letter.emailSentTo || letter.employeeEmail || ''} on ${
                                letter.emailSentAt ? new Date(letter.emailSentAt).toLocaleDateString() : ''
                              }`}
                            >
                              <Mail className="h-2.5 w-2.5" />
                              <span>Emailed</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Preview Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLetter(letter);
                              setIsPreviewModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-orange-600 hover:bg-orange-50 hover:border-orange-200 transition-colors cursor-pointer"
                            title="Preview Letter"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          {/* Download PDF Button */}
                          <button
                            type="button"
                            onClick={() => handleDirectDownload(letter)}
                            disabled={isDownloadingId === letter.id}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Download PDF"
                          >
                            {isDownloadingId === letter.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                          </button>

                          {/* Edit Button (Draft only) */}
                          {letter.status !== 'ISSUED' && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLetter(letter);
                                setIsGenerateModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-200 transition-colors cursor-pointer"
                              title="Edit Draft"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Delete / Revoke */}
                          <button
                            type="button"
                            onClick={() => handleDeleteLetter(letter)}
                            disabled={deletingId === letter.id}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Delete / Revoke"
                          >
                            {deletingId === letter.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-600" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {!loading && letters.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs">
              <span className="text-slate-500 font-medium">
                Showing {letters.length} of {totalCount} records (Page {page} of {totalPages})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 font-bold text-slate-700">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Generate / Edit Modal */}
        <GenerateExperienceLetterModal
          isOpen={isGenerateModalOpen}
          onClose={() => {
            setIsGenerateModalOpen(false);
            setEditingLetter(null);
          }}
          onSave={handleSaveLetter}
          initialData={editingLetter}
        />

        {/* Preview & Issuance Modal */}
        <ExperienceLetterPreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => {
            setIsPreviewModalOpen(false);
            setSelectedLetter(null);
          }}
          letter={selectedLetter}
          onEdit={() => {
            setIsPreviewModalOpen(false);
            setEditingLetter(selectedLetter);
            setIsGenerateModalOpen(true);
          }}
          onIssueSuccess={() => {
            fetchLetters();
          }}
        />
      </div>
    </AdminLayout>
  );
}

