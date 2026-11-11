'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { SalarySlipDocument } from '@/components/payroll/SalarySlipDocument';
import { SendPayslipEmailModal } from '@/components/modals/SendPayslipEmailModal';
import { PayslipData } from '@/types/payslip';
import {
  Printer,
  Download,
  Mail,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Building2,
  FileText,
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function PayslipDetailPage() {
  const params = useParams();
  const router = useRouter();
  const payslipId = params.id as string;

  const [payslipData, setPayslipData] = useState<PayslipData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  const documentRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    if (!payslipId) return;

    const fetchPayslip = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/v1/payroll/${encodeURIComponent(payslipId)}/payslip`);
        const json = await res.json();
        if (json.success && json.data) {
          setPayslipData(json.data);
        } else {
          setErrorMsg(json.message || 'Unable to retrieve salary slip.');
        }
      } catch (err: any) {
        console.error('Error fetching payslip details:', err);
        setErrorMsg('Network error connecting to payslip server.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPayslip();
  }, [payslipId]);

  const handlePrint = () => {
    window.print();
  };

  const waitForImagesToLoad = async (container: HTMLElement) => {
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      images.map((img) => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve(true);
        return new Promise((res) => {
          img.onload = () => res(true);
          img.onerror = () => res(true);
          setTimeout(() => res(true), 2000);
        });
      })
    );
  };

  const generatePdfBase64 = async (): Promise<string | null> => {
    if (!documentRef.current) return null;
    try {
      await waitForImagesToLoad(documentRef.current);
      const canvas = await html2canvas(documentRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      return pdf.output('datauristring');
    } catch (e) {
      console.error('Error generating PDF base64:', e);
      return null;
    }
  };

  const handleDownloadPDF = async () => {
    if (!documentRef.current) return;
    setIsDownloading(true);
    try {
      await waitForImagesToLoad(documentRef.current);
      const canvas = await html2canvas(documentRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);

      const empName = (payslipData?.employee?.name || 'Employee').replace(/\s+/g, '_');
      const period = (payslipData?.payPeriod || 'Period').replace(/[\s/]+/g, '_');
      const filename = `Salary_Slip_${period}_${empName}.pdf`;

      pdf.save(filename);
      showToast('Payslip PDF downloaded successfully!');
    } catch (err) {
      console.error('Error generating PDF:', err);
      showToast('Error generating PDF. Using print dialog.');
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <AuthGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE', 'MANAGER']}>
      <AdminLayout>
        <div className="space-y-4 print:space-y-0 print:p-0">
          
          {/* Top Navigation & Action Bar (Hidden in print) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <div>
                <h1 className="text-base font-bold text-slate-900">
                  {payslipData ? payslipData.payPeriodTitle : 'Salary Slip Viewer'}
                </h1>
                <p className="text-xs text-slate-500 font-mono">
                  {payslipData?.payslipNumber || payslipId}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEmailModalOpen(true)}
                disabled={isLoading || !payslipData}
                className="flex items-center gap-1.5 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-3.5 py-2 text-xs font-semibold text-orange-700 hover:bg-[#FFEDD5] transition-colors disabled:opacity-50"
              >
                <Mail className="h-4 w-4 text-orange-500" />
                <span>Email Slip</span>
              </button>

              <button
                onClick={handlePrint}
                disabled={isLoading || !payslipData}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <Printer className="h-4 w-4 text-slate-500" />
                <span>Print</span>
              </button>

              <button
                onClick={handleDownloadPDF}
                disabled={isLoading || isDownloading || !payslipData}
                className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>Download PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Toast Notification */}
          {toastMessage && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2 print:hidden">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Error Alert */}
          {errorMsg && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-800 flex items-center gap-2 print:hidden">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Document Canvas Container */}
          <div className="bg-slate-200/50 p-4 sm:p-8 rounded-2xl border border-slate-200 flex justify-center overflow-x-auto print:bg-white print:border-none print:p-0 print:m-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-16 text-slate-500 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                <span className="text-sm font-semibold">Generating authentic Infinitive Cloud salary slip...</span>
              </div>
            ) : payslipData ? (
              <SalarySlipDocument
                ref={documentRef}
                data={payslipData}
                className="shadow-xl print:shadow-none"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-16 text-slate-400">
                <FileText className="h-10 w-10 text-slate-300 mb-2" />
                <span>Salary slip record not found or inaccessible.</span>
              </div>
            )}
          </div>
        </div>

        {/* Send Email Modal */}
        {isEmailModalOpen && payslipData && (
          <SendPayslipEmailModal
            isOpen={isEmailModalOpen}
            onClose={() => setIsEmailModalOpen(false)}
            payslipData={payslipData}
            pdfBase64Provider={generatePdfBase64}
            onSuccess={(msg) => {
              showToast(msg);
            }}
          />
        )}
      </AdminLayout>
    </AuthGuard>
  );
}
