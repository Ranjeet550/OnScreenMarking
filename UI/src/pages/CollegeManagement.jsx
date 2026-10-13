import React, { useState, useCallback, useRef } from 'react';
import { Plus, Edit2, Trash2, Search, ArrowUp, ArrowDown, ArrowUpDown, X, Upload, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import collegeService from '../services/collegeService';
import message from '../services/messageService';
import { useTable } from '../services/tableService';
import TablePagination from '../components/TablePagination';
import ColumnFilter from '../components/ColumnFilter';

export default function CollegeManagement() {
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    collegeName: '',
    collegeCode: '',
    isActive: true
  });
  const [saving, setSaving] = useState(false);
  
  // CSV Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const fileInputRef = useRef(null);

  // Define fetch function for useTable to load colleges with pagination
  const fetchFn = useCallback(async (params) => {
    return await collegeService.getAllColleges(params);
  }, []);

  const {
    items: colleges,
    totalCount,
    totalPages,
    page,
    setPage,
    pageSize,
    setPageSize,
    search,
    setSearch,
    loading,
    filters,
    setFilter,
    sortField,
    sortOrder,
    handleSort,
    refresh: refreshColleges
  } = useTable({
    fetchFn,
    initialParams: { pageSize: 10 }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editingId) {
        await collegeService.updateCollege(editingId, formData);
        message.success('College updated successfully');
      } else {
        await collegeService.createCollege(formData);
        message.success('College created successfully');
      }
      setFormData({ collegeName: '', collegeCode: '', isActive: true });
      setEditingId(null);
      setShowFormModal(false);
      refreshColleges();
    } catch (err) {
      message.error(err.message || 'Error saving college');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (college) => {
    setFormData({
      collegeName: college.collegeName,
      collegeCode: college.collegeCode,
      isActive: college.isActive
    });
    setEditingId(college.id);
    setShowFormModal(true);
  };

  const handleDelete = async (college) => {
    if (window.confirm('Are you sure you want to mark this college as inactive?')) {
      try {
        await collegeService.updateCollege(college.id, {
          collegeName: college.collegeName,
          collegeCode: college.collegeCode,
          isActive: false
        });
        message.success('College marked as inactive');
        refreshColleges();
      } catch (err) {
        message.error('Failed to update college status');
        console.error(err);
      }
    }
  };

  const handleCancel = () => {
    setFormData({ collegeName: '', collegeCode: '', isActive: true });
    setEditingId(null);
    setShowFormModal(false);
  };

  // CSV Import handlers
  const handleDownloadTemplate = () => {
    const url = collegeService.getTemplateUrl();
    window.open(url, '_blank');
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
      setImportResults(null);
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importFile) {
      message.error('Please select a CSV file to upload.');
      return;
    }

    try {
      setImportLoading(true);
      setImportResults(null);
      
      const result = await collegeService.importColleges(importFile);
      setImportResults(result);
      if (result.success) {
        message.success(`Successfully imported ${result.importedCount} colleges!`);
        refreshColleges();
        setImportFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error(err);
      message.error(err.message || 'Failed to import colleges.');
    } finally {
      setImportLoading(false);
    }
  };

  const handleCloseImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setImportResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-transparent w-full max-w-none px-4 py-3 lg:px-8 lg:py-4">
      <div className="w-full space-y-4">
        
        {/* Header & Controls */}
        <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                Colleges
              </h1>
              <p className="text-xs text-gray-500 mt-1">Manage all colleges in the system</p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {/* Search Input */}
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500 transition-all w-52">
                <Search size={13} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search colleges..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-gray-800 placeholder-gray-400 font-semibold text-[11px] focus:outline-none"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="text-gray-300 hover:text-gray-500 transition"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 rounded-md font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm hover:shadow shrink-0 cursor-pointer"
              >
                <Upload size={13} />
                <span>Upload CSV</span>
              </button>

              <button
                onClick={() => setShowFormModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm hover:shadow shrink-0 cursor-pointer"
              >
                <Plus size={13} />
                <span>Add College</span>
              </button>
            </div>
          </div>
        </div>

        {/* Colleges Data Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
          {loading && colleges.length === 0 ? (
            <div className="p-12 text-center text-gray-400 font-bold text-xs flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <span>Loading colleges...</span>
            </div>
          ) : colleges.length === 0 ? (
            <div className="p-16 text-center text-gray-500 font-medium leading-relaxed max-w-sm mx-auto space-y-3">
              <div>
                <h3 className="font-extrabold text-gray-900 text-xs uppercase tracking-wider">No Records Found</h3>
                <p className="text-[10px] text-gray-400 mt-1">There are no colleges matching your filters or search terms.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-450 uppercase tracking-widest select-none">
                    <th className="py-2.5 cursor-pointer hover:text-gray-700 transition-colors group md:px-6 px-4" onClick={() => handleSort('collegeName')}>
                      <div className="flex items-center gap-1">
                        College Name 
                        {sortField === 'collegeName' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                      </div>
                    </th>
                    <th className="py-2.5 cursor-pointer hover:text-gray-700 transition-colors group md:px-6 px-4" onClick={() => handleSort('collegeCode')}>
                      <div className="flex items-center gap-1">
                        College Code 
                        {sortField === 'collegeCode' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                      </div>
                    </th>
                    <th className="py-2.5 cursor-pointer hover:text-gray-700 transition-colors group md:px-6 px-4" onClick={() => handleSort('createdAt')}>
                      <div className="flex items-center gap-1">
                        Created On 
                        {sortField === 'createdAt' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                      </div>
                    </th>
                    <th className="py-2.5 text-center cursor-pointer hover:text-gray-700 transition-colors md:px-6 px-4" onClick={() => handleSort('isActive')}>
                      <div className="flex items-center justify-center gap-1">
                        Status 
                        {sortField === 'isActive' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                        <ColumnFilter 
                          columnKey="isActive" 
                          currentFilter={filters.isActive} 
                          setFilter={setFilter}
                          options={[
                            { label: 'Active', value: 'true' },
                            { label: 'Inactive', value: 'false' }
                          ]}
                        />
                      </div>
                    </th>
                    <th className="py-2.5 text-right md:px-6 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {colleges.map((college) => (
                    <tr key={college.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="py-2.5 font-extrabold text-gray-900 md:px-6 px-4">
                        {college.collegeName}
                      </td>
                      <td className="py-2.5 text-gray-600 font-medium text-xs md:px-6 px-4">
                        {college.collegeCode}
                      </td>
                      <td className="py-2.5 text-gray-500 font-medium text-xs md:px-6 px-4">
                        {college.createdAt ? new Date(college.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-2.5 text-center md:px-6 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-[9px] uppercase tracking-wider border ${
                          college.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-rose-50 text-rose-700 border-rose-100"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${college.isActive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
                          {college.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap md:px-6 px-4">
                        <div className="flex items-center justify-end gap-2 transition-opacity">
                          <button
                            onClick={() => handleEdit(college)}
                            className="p-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(college)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors"
                            title="Mark Inactive"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <TablePagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                setPage={setPage}
                setPageSize={setPageSize}
              />
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit College Modal */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden border border-gray-100 shadow-2xl flex flex-col animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">
                  {editingId ? 'Edit College' : 'Add New College'}
                </h3>
              </div>
              <button 
                onClick={handleCancel}
                className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 rounded-md transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-5 p-4 md:p-6">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">College Name *</label>
                <input
                  type="text"
                  required
                  value={formData.collegeName}
                  onChange={(e) => setFormData({ ...formData, collegeName: e.target.value })}
                  placeholder="e.g. Science Faculty"
                  className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-4 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">College Code *</label>
                <input
                  type="text"
                  required
                  value={formData.collegeCode}
                  onChange={(e) => setFormData({ ...formData, collegeCode: e.target.value })}
                  placeholder="e.g. SCI-01"
                  className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-4 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Status *</label>
                <div className="flex items-center gap-6 text-xs text-gray-700 bg-gray-50/50 border border-gray-200 px-4 py-2 rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      checked={formData.isActive === true}
                      onChange={() => setFormData({ ...formData, isActive: true })}
                      className="w-3.5 h-3.5 text-teal-700 focus:ring-teal-500 accent-teal-600"
                    />
                    <span className="font-semibold">Active</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      checked={formData.isActive === false}
                      onChange={() => setFormData({ ...formData, isActive: false })}
                      className="w-3.5 h-3.5 text-teal-700 focus:ring-teal-500 accent-teal-600"
                    />
                    <span className="font-semibold">Inactive</span>
                  </label>
                </div>
              </div>
            </form>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-md font-bold text-xs cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-xs cursor-pointer shadow transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-gray-100 shadow-2xl flex flex-col animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">
                  Bulk College Import
                </h3>
              </div>
              <button 
                onClick={handleCloseImportModal}
                className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 rounded-md transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto space-y-6 p-4 md:p-6">
              {/* Download Template Section */}
              <div className="flex items-center justify-between p-4 bg-teal-50 border border-teal-100 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                    <Download size={18} className="text-teal-700" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-gray-900">Download CSV Template</p>
                    <p className="text-xs text-gray-500">Use this template to format your data</p>
                  </div>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-xs uppercase tracking-wider transition shadow-sm cursor-pointer"
                >
                  Download
                </button>
              </div>

              {/* Upload Form */}
              <form id="import-form" onSubmit={handleImportSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">
                    Select CSV File
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".csv"
                      onChange={handleFileChange}
                      className="w-full px-4 py-3 bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-xl text-sm font-semibold text-gray-800 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 file:cursor-pointer cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                    />
                  </div>
                  {importFile && (
                    <p className="mt-2 text-xs text-gray-600 font-semibold flex items-center gap-2">
                      <span className="w-2 h-2 bg-teal-500 rounded-full"></span>
                      Selected: {importFile.name}
                    </p>
                  )}
                </div>

                {/* Import Results */}
                {importResults && (
                  <div className="p-4 rounded-xl bg-gray-50/50 border border-gray-200 space-y-3">
                    <h4 className="font-extrabold text-[10px] text-gray-500 uppercase tracking-wide">Import Results</h4>
                    <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                      <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-center">
                         <div className="text-2xl font-black">{importResults.importedCount}</div>
                         <div className="text-[10px] font-bold uppercase tracking-wider">Imported</div>
                      </div>
                      <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-center">
                         <div className="text-2xl font-black">{importResults.failedCount}</div>
                         <div className="text-[10px] font-bold uppercase tracking-wider">Failed</div>
                      </div>
                    </div>
                    
                    {importResults.errors && importResults.errors.length > 0 && (
                      <div className="space-y-2 mt-4">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Error Details:</p>
                        <div className="max-h-32 overflow-y-auto border border-rose-200 rounded-xl bg-rose-50/50 p-3 space-y-1">
                          {importResults.errors.map((err, i) => (
                            <div key={i} className="text-[11px] text-rose-700 font-medium">• {err}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </form>

              {/* Instructions */}
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-[10px] font-bold text-blue-900 mb-2 uppercase tracking-wide">Import Instructions:</p>
                <ul className="space-y-1 text-xs text-blue-800 font-medium list-disc list-inside">
                  <li>Download the CSV template first</li>
                  <li>Fill in the college details (Name and Code are required)</li>
                  <li>Ensure College Codes are unique</li>
                  <li>Save as CSV format and upload</li>
                </ul>
              </div>
            </div>
            
            {/* Footer Buttons */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50">
              <button
                type="button"
                onClick={handleCloseImportModal}
                className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-md font-bold text-xs cursor-pointer transition"
              >
                Close
              </button>
              <button
                type="submit"
                form="import-form"
                disabled={importLoading || !importFile}
                className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-xs cursor-pointer shadow transition disabled:opacity-50"
              >
                {importLoading ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

