import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { 
  Upload, FileText, CheckCircle2, AlertCircle, ArrowLeft, RefreshCw, X, Folder, HelpCircle, FileCheck, Search
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBreadcrumb } from '../context/BreadcrumbContext';
import { decryptId, encryptId } from '../utils/encryption';
import ProjectConfigHeader from '../components/ProjectConfigHeader';
import paperService from '../services/paperService';
import message from '../services/messageService';

export default function ImportQuestionPapers() {
  const [searchParams] = useSearchParams();
  const encryptedProjectId = searchParams.get('projectId');
  const savedProjectId = !encryptedProjectId ? sessionStorage.getItem('selectedProjectId') : null;
  const projectId = encryptedProjectId ? decryptId(encryptedProjectId) : (savedProjectId || null);
  const effectiveEncryptedProjectId = encryptedProjectId || (savedProjectId ? encryptId(savedProjectId) : '');
  const universityId = searchParams.get('universityId');
  const { userType } = useAuth();
  const { setBreadcrumb } = useBreadcrumb();
  const navigate = useNavigate();

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    const basePath = userType === 'admin' ? '/admin/papers' : '/papers';
    setBreadcrumb([
      { label: 'Paper Management', path: `${basePath}?projectId=${effectiveEncryptedProjectId || ''}&universityId=${universityId || ''}`, icon: 'FileText' },
      { label: 'Bulk Import Question Papers', path: `/import-question-papers`, icon: 'Upload' }
    ]);
  }, [userType, effectiveEncryptedProjectId, universityId, setBreadcrumb]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) {
      message.error('Please select valid PDF files');
      return;
    }
    setSelectedFiles(files);
    setUploadResult(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) {
      message.error('Please drop valid PDF files');
      return;
    }
    setSelectedFiles(files);
    setUploadResult(null);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    setUploadResult(null);
  };

  const handleBulkUpload = async () => {
    if (!projectId) {
      message.error('Please select a project before uploading');
      return;
    }
    if (selectedFiles.length === 0) {
      message.error('Please select at least one Question Paper PDF file');
      return;
    }
    setIsUploading(true);
    try {
      const res = await paperService.bulkUploadQuestionPapers(projectId, selectedFiles);
      setUploadResult(res);
      if (res.matchedCount > 0) {
        message.success(`Successfully matched and allocated ${res.matchedCount} Question Paper(s)!`);
      } else {
        message.warning(`Uploaded ${res.totalFiles} files, but no paper Catch Number matches were found.`);
      }
    } catch (err) {
      message.error(err.message || 'Failed to bulk upload question papers');
    } finally {
      setIsUploading(false);
    }
  };

  const filteredResults = uploadResult?.results?.filter(r => {
    if (!searchFilter) return true;
    const term = searchFilter.toLowerCase();
    return (
      r.fileName.toLowerCase().includes(term) ||
      (r.paperCode && r.paperCode.toLowerCase().includes(term)) ||
      (r.paperName && r.paperName.toLowerCase().includes(term)) ||
      (r.catchNo && r.catchNo.toLowerCase().includes(term)) ||
      r.status.toLowerCase().includes(term)
    );
  }) || [];

  const backPath = userType === 'admin' ? '/admin/papers' : '/papers';

  return (
    <div className="min-h-screen bg-gray-50/50 pb-16">
      {/* Top Header & Breadcrumbs */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-20">
        <div className="lg:px-10 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 md:px-6 px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`${backPath}?projectId=${effectiveEncryptedProjectId || ''}&universityId=${universityId || ''}`)}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              title="Back to Papers Management"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                <Upload className="text-emerald-600" size={22} />
                Bulk Import Question Papers (Catch-wise)
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Upload multiple question paper PDFs at once. Filenames will be automatically matched to paper Catch Numbers.
              </p>
            </div>
          </div>
          <Link
            to={`${backPath}?projectId=${effectiveEncryptedProjectId || ''}&universityId=${universityId || ''}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm"
          >
            <FileText size={14} className="text-teal-600" />
            View Papers Table
          </Link>
        </div>
      </div>

      <div className="lg:px-10 mt-6 space-y-6 md:px-6 px-4">
        <ProjectConfigHeader />

        {/* Guideline Card */}
        <div className="bg-gradient-to-r from-emerald-900 to-teal-800 text-white rounded-2xl shadow-md relative overflow-hidden p-4 md:p-6">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <HelpCircle size={12} /> Filename Matching Convention
              </span>
              <h2 className="text-lg font-bold text-white">How Catch-wise Bulk Upload Works</h2>
              <p className="text-xs text-emerald-100/90 leading-relaxed">
                Name your PDF files using the corresponding paper's <strong>Catch Number</strong> or <strong>Paper Code</strong> 
                (for example: <code className="bg-emerald-950/60 px-1.5 py-0.5 rounded text-emerald-200 font-mono">1001.pdf</code>, 
                <code className="bg-emerald-950/60 px-1.5 py-0.5 rounded text-emerald-200 font-mono">CATCH_1001.pdf</code>, or 
                <code className="bg-emerald-950/60 px-1.5 py-0.5 rounded text-emerald-200 font-mono">MATH101.pdf</code>). 
                Select all files together or drop them below to automatically allocate them to papers!
              </p>
            </div>
          </div>
        </div>

        {/* Main Upload Dropzone Area */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm space-y-6 p-4 md:p-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-emerald-200 hover:border-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40 rounded-2xl text-center transition-all cursor-pointer group p-4 md:p-8"
          >
            <input
              type="file"
              multiple
              accept=".pdf"
              id="bulkQpInput"
              onChange={handleFileSelect}
              className="hidden"
            />
            <label htmlFor="bulkQpInput" className="cursor-pointer space-y-3 block">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                <Upload size={28} />
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900">
                  Click to select Question Paper PDFs or drag & drop files here
                </p>
                <p className="text-xs text-gray-400 font-medium mt-1">
                  Supports multiple PDF files named by Catch No (e.g. 1001.pdf, 1002.pdf)
                </p>
              </div>
              <span className="inline-block px-4 py-2 text-xs font-bold text-emerald-700 bg-white border border-emerald-200 rounded-xl shadow-xs group-hover:bg-emerald-50 transition-colors">
                Browse Files
              </span>
            </label>
          </div>

          {/* Selected Files Queue */}
          {selectedFiles.length > 0 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                  <FileCheck size={16} className="text-emerald-600" />
                  <span className="text-sm font-extrabold text-gray-900 uppercase tracking-wider">
                    Selected Files ({selectedFiles.length})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={clearAllFiles}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-2 rounded-xl transition-colors"
                  >
                    Clear Queue
                  </button>
                  <button
                    onClick={handleBulkUpload}
                    disabled={isUploading}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider py-2.5 px-6 rounded-xl transition-all shadow-md flex items-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload size={15} />
                        Upload & Auto-Allocate
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {selectedFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200/80 rounded-xl text-xs">
                    <div className="flex items-center gap-2 truncate pr-2">
                      <FileText size={14} className="text-emerald-600 shrink-0" />
                      <span className="font-bold text-gray-800 truncate" title={f.name}>{f.name}</span>
                    </div>
                    <button
                      onClick={() => removeFile(i)}
                      className="text-gray-400 hover:text-rose-600 transition-colors p-1"
                      title="Remove file"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>

        {/* Upload Results & Summary Report */}
        {uploadResult && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  Import Summary & Allocation Report
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">{uploadResult.message}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={13} />
                  <span>{uploadResult.matchedCount} Allocated</span>
                </div>
                {uploadResult.unmatchedCount > 0 && (
                  <div className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
                    <AlertCircle size={13} />
                    <span>{uploadResult.unmatchedCount} Unmatched</span>
                  </div>
                )}
              </div>
            </div>

            {/* Results Search Filter */}
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 max-w-md">
              <Search size={14} className="text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Filter results by filename, catch no, paper code..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-transparent text-xs text-gray-800 font-semibold focus:outline-none placeholder-gray-400"
              />
              {searchFilter && (
                <button onClick={() => setSearchFilter('')} className="text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left text-xs whitespace-nowrap min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-gray-100">
                    <th className="px-5 py-3">File Name</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3">Matched Paper Code & Name</th>
                    <th className="px-5 py-3 text-center">Catch No</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredResults.map((r, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 font-extrabold text-gray-900">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className={r.status === 'Success' ? 'text-emerald-600' : 'text-amber-500'} />
                          <span>{r.fileName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {r.status === 'Success' ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Allocated
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                            Unmatched
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {r.paperCode ? (
                          <div>
                            <span className="font-extrabold text-gray-900 block">{r.paperCode}</span>
                            <span className="text-[10px] text-gray-500 block">{r.paperName}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">No matching paper</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center font-mono font-bold text-gray-700">
                        {r.catchNo || '-'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {r.fileUrl ? (
                          <a
                            href={`${import.meta.env.VITE_API_URL.replace('/api', '')}${r.fileUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                          >
                            <FileText size={12} /> View PDF
                          </a>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">No PDF Attached</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-gray-100">
              <button
                onClick={() => navigate(`${backPath}?projectId=${encryptedProjectId || ''}&universityId=${universityId || ''}`)}
                className="bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs uppercase tracking-wider py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2 md:px-6 px-4"
              >
                <ArrowLeft size={14} /> Return to Papers Management
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
