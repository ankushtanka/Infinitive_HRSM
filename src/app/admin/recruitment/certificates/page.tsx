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
  ArrowLeft,
  Building2,
  Sparkles,
  Users,
  FileText,
  Loader2,
  RefreshCw,
  Calendar,
  Edit3,
  Mail,
} from 'lucide-react';
import { InternshipCertificateRecord } from '@/types/certificate';
import { AddCertificateModal } from '@/components/recruitment/AddCertificateModal';
import { CertificatePreviewModal } from '@/components/recruitment/CertificatePreviewModal';
import { SendCertificateEmailModal } from '@/components/recruitment/SendCertificateEmailModal';

export default function InternshipCertificatesPage() {
  const [certificates, setCertificates] = useState<InternshipCertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search & Pagination
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isSendEmailModalOpen, setIsSendEmailModalOpen] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<InternshipCertificateRecord | Partial<InternshipCertificateRecord> | null>(null);
  const [selectedCertificate, setSelectedCertificate] = useState<InternshipCertificateRecord | Partial<InternshipCertificateRecord> | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchCertificates = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        search,
      });

      const res = await fetch(`/api/v1/certificates?${params.toString()}`);
      const json = await res.json();

      if (res.ok && json.success) {
        setCertificates(json.data.certificates || []);
        setTotalPages(json.data.pagination.totalPages || 1);
        setTotalCount(json.data.pagination.total || 0);
      } else {
        setErrorMsg(json.message || 'Failed to fetch internship certificates.');
      }
    } catch (err: any) {
      console.error('Error loading certificates:', err);
      setErrorMsg('Unable to load internship certificates.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const handleSaveCertificate = async (
    certData: Partial<InternshipCertificateRecord>
  ): Promise<{ success: boolean; message: string; certificateId?: string }> => {
    try {
      const certId = certData.id || certData._id;
      const isEdit = Boolean(certId);
      const url = isEdit ? `/api/v1/certificates/${certId}` : '/api/v1/certificates';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(certData),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        showToast(isEdit ? 'Internship certificate content updated successfully!' : 'Internship certificate record created successfully!');
        setSelectedCertificate(json.data);
        setEditingCertificate(null);
        setIsPreviewModalOpen(true);
        fetchCertificates();
        return { success: true, message: json.message, certificateId: json.data.id || json.data._id };
      } else {
        return { success: false, message: json.message || 'Failed to save certificate record.' };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error while saving certificate.' };
    }
  };

  const handleDeleteCertificate = async (cert: InternshipCertificateRecord) => {
    if (!confirm(`Are you sure you want to delete certificate ${cert.referenceNumber} for "${cert.internName}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(cert.id || cert._id || null);
    try {
      const certId = cert.id || cert._id;
      const res = await fetch(`/api/v1/certificates/${certId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(`Certificate ${cert.referenceNumber} deleted successfully.`);
        fetchCertificates();
      } else {
        alert(json.message || 'Failed to delete certificate.');
      }
    } catch (err: any) {
      alert('Error deleting certificate: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <AdminLayout
      pageTitle="Internship Certificate Management"
      breadcrumbs={[
        { label: 'Recruitment', href: '/admin/recruitment' },
        { label: 'Internship Certificates', href: '/admin/recruitment/certificates' },
      ]}
    >
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed right-6 top-20 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl border border-slate-700 animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Action Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin/recruitment"
              className="flex items-center gap-1 text-xs font-bold text-orange-500 hover:text-orange-800 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Recruitment</span>
            </Link>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Internship Certificate Directory</span>
            <span className="rounded-full bg-[#FFF7ED] px-2.5 py-0.5 text-[10px] font-bold text-orange-700 border border-[#FED7AA]">
              {totalCount} Total Issued
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium pt-0.5">
            Issue and manage formal A4 internship completion certificates stored in secure MongoDB GridFS.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setEditingCertificate(null);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add Internship Certificate</span>
          </button>
        </div>
      </div>

      {/* Toolbar & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search intern name, role, college..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchCertificates}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Directory Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <p className="text-xs font-bold">Loading certificate directory...</p>
          </div>
        ) : certificates.length > 0 ? (
          <div className="overflow-x-auto min-h-0 max-h-[580px] overflow-y-auto overscroll-contain pr-1" style={{ scrollbarWidth: 'thin' }}>
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
                <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500">
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Reference No.</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Intern Name & College</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Role / Domain</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Internship Period</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Issue Date</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {certificates.map((cert) => {
                  const certId = cert.id || cert._id;
                  return (
                    <tr key={certId} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-4 py-3.5 font-mono font-bold text-orange-700">
                        {cert.referenceNumber}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-slate-900">{cert.salutation} {cert.internName}</p>
                        {cert.internEmail && (
                          <p className="text-[10px] text-cyan-700 font-semibold truncate max-w-xs">{cert.internEmail}</p>
                        )}
                        <p className="text-[10px] text-slate-500 font-medium truncate max-w-xs">{cert.collegeName}</p>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-800">
                        {cert.internshipRole}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 font-medium">
                        {formatDate(cert.startDate)} &rarr; {formatDate(cert.completionDate)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 font-semibold">
                        {formatDate(cert.issueDate)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                            cert.status === 'ISSUED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {cert.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setSelectedCertificate(cert);
                              setIsPreviewModalOpen(true);
                            }}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                            title="Preview Certificate"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => {
                              setEditingCertificate(cert);
                              setIsAddModalOpen(true);
                            }}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                            title="Edit Certificate Content"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedCertificate(cert);
                              setIsSendEmailModalOpen(true);
                            }}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-cyan-50 hover:text-cyan-600 transition-colors"
                            title="Send Certificate via Email (Gmail SMTP)"
                          >
                            <Mail className="h-4 w-4" />
                          </button>

                          {cert.fileId ? (
                            <a
                              href={`/api/v1/certificates/${certId}/download`}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                              title="Download PDF from GridFS"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedCertificate(cert);
                                setIsPreviewModalOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 transition-colors"
                              title="Generate PDF"
                            >
                              <Sparkles className="h-4 w-4" />
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteCertificate(cert)}
                            disabled={deletingId === certId}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-50"
                            title="Delete Certificate"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 space-y-3">
            <Award className="h-12 w-12 text-slate-300 stroke-[1.5]" />
            <div>
              <p className="font-bold text-slate-800 text-sm">No Internship Certificates Issued Yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Click &quot;Add Internship Certificate&quot; to issue a formal A4 certificate with GridFS PDF storage.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingCertificate(null);
                setIsAddModalOpen(true);
              }}
              className="mt-2 flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              <span>Add Internship Certificate</span>
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Certificate Modal */}
      <AddCertificateModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingCertificate(null);
        }}
        initialData={editingCertificate}
        onSave={handleSaveCertificate}
        onOpenPreview={(certData) => {
          setSelectedCertificate(certData);
          setIsPreviewModalOpen(true);
        }}
      />

      {/* Certificate Preview Modal */}
      {selectedCertificate && (
        <CertificatePreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => {
            setIsPreviewModalOpen(false);
            setSelectedCertificate(null);
          }}
          certificate={selectedCertificate}
          onEdit={() => {
            if (selectedCertificate) {
              setEditingCertificate(selectedCertificate);
              setIsPreviewModalOpen(false);
              setIsAddModalOpen(true);
            }
          }}
          onOpenSendEmail={() => {
            setIsSendEmailModalOpen(true);
          }}
          onGenerateSuccess={() => {
            fetchCertificates();
          }}
        />
      )}

      {/* Send Certificate Email Modal */}
      {selectedCertificate && (
        <SendCertificateEmailModal
          isOpen={isSendEmailModalOpen}
          onClose={() => setIsSendEmailModalOpen(false)}
          certificate={selectedCertificate}
          onSuccess={(msg) => {
            showToast(msg);
            fetchCertificates();
          }}
        />
      )}
    </AdminLayout>
  );
}
