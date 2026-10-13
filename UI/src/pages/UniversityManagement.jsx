import React, { useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search, ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import universityService from '../services/universityService';
import message from '../services/messageService';
import { useTable } from '../services/tableService';
import TablePagination from '../components/TablePagination';
import ColumnFilter from '../components/ColumnFilter';

export default function UniversityManagement() {
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    universityName: '',
    isActive: true
  });
  const [saving, setSaving] = useState(false);
  const [universityToDelete, setUniversityToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Define fetch function for useTable to load universities with pagination
  const fetchFn = useCallback(async (params) => {
    return await universityService.getAllUniversities(params);
  }, []);

  const {
    items: universities,
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
    refresh: refreshUniversities
  } = useTable({
    fetchFn,
    initialParams: { pageSize: 10 }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editingId) {
        await universityService.updateUniversity(editingId, formData);
        message.success('University updated successfully');
      } else {
        await universityService.createUniversity(formData);
        message.success('University created successfully');
      }
      setFormData({ universityName: '', isActive: true });
      setEditingId(null);
      setShowFormModal(false);
      refreshUniversities();
    } catch (err) {
      message.error(err.message || 'Error saving university');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (university) => {
    setFormData({
      universityName: university.universityName,
      isActive: university.isActive
    });
    setEditingId(university.universityId);
    setShowFormModal(true);
  };

  const handleDeleteClick = (university) => {
    setUniversityToDelete(university);
  };

  const confirmDelete = async () => {
    if (!universityToDelete) return;
    setIsDeleting(true);
    try {
      await universityService.updateUniversity(universityToDelete.universityId, {
        universityName: universityToDelete.universityName,
        isActive: false
      });
      message.success('University marked as inactive');
      setUniversityToDelete(null);
      refreshUniversities();
    } catch (err) {
      message.error('Failed to update university status');
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    setFormData({ universityName: '', isActive: true });
    setEditingId(null);
    setShowFormModal(false);
  };

  return (
    <div className="min-h-screen bg-transparent w-full max-w-none px-4 py-3 lg:px-8 lg:py-4">
      <div className="w-full space-y-4">
        
        {/* Header & Controls */}
        <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                Universities
              </h1>
              <p className="text-xs text-gray-500 mt-1">Manage all universities in the system</p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {/* Search Input */}
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500 transition-all w-52">
                <Search size={13} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search universities..."
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
                onClick={() => setShowFormModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm hover:shadow shrink-0 cursor-pointer"
              >
                <Plus size={13} />
                <span>Add University</span>
              </button>
            </div>
          </div>
        </div>

        {/* Universities Data Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
          {loading && universities.length === 0 ? (
            <div className="p-12 text-center text-gray-400 font-bold text-xs flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <span>Loading universities...</span>
            </div>
          ) : universities.length === 0 ? (
            <div className="p-16 text-center text-gray-500 font-medium leading-relaxed max-w-sm mx-auto space-y-3">
              <div>
                <h3 className="font-extrabold text-gray-900 text-xs uppercase tracking-wider">No Records Found</h3>
                <p className="text-[10px] text-gray-400 mt-1">There are no universities matching your filters or search terms.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-450 uppercase tracking-widest select-none">
                    <th className="py-2.5 cursor-pointer hover:text-gray-700 transition-colors group md:px-6 px-4" onClick={() => handleSort('universityName')}>
                      <div className="flex items-center gap-1">
                        University Name 
                        {sortField === 'universityName' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
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
                  {universities.map((university) => (
                    <tr key={university.universityId} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="py-2.5 font-extrabold text-gray-900 md:px-6 px-4">
                        {university.universityName}
                      </td>
                      <td className="py-2.5 text-gray-500 font-medium text-xs md:px-6 px-4">
                        {new Date(university.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 text-center md:px-6 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-[9px] uppercase tracking-wider border ${
                          university.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-rose-50 text-rose-700 border-rose-100"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${university.isActive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
                          {university.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap md:px-6 px-4">
                        <div className="flex items-center justify-end gap-2 transition-opacity">
                          <button
                            onClick={() => handleEdit(university)}
                            className="p-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(university)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
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

      {/* Add/Edit University Modal */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden border border-gray-100 shadow-2xl flex flex-col animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">
                  {editingId ? 'Edit University' : 'Add New University'}
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
                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">University Name *</label>
                <input
                  type="text"
                  required
                  value={formData.universityName}
                  onChange={(e) => setFormData({ ...formData, universityName: e.target.value })}
                  placeholder="e.g. Apex National University"
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

      {/* Delete / Inactive Confirmation Modal */}
      {universityToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden border border-gray-100 shadow-2xl flex flex-col animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 size={16} />
                </div>
                <h3 className="text-base font-black text-gray-900 tracking-tight leading-none">
                  Mark University Inactive
                </h3>
              </div>
              <button 
                onClick={() => setUniversityToDelete(null)}
                disabled={isDeleting}
                className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 rounded-md transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <p className="text-xs text-gray-600 leading-relaxed">
                Are you sure you want to mark <span className="font-extrabold text-gray-900">{universityToDelete.universityName}</span> as inactive? Users and associated records belonging to this university will be affected.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2.5 bg-gray-50">
              <button
                type="button"
                onClick={() => setUniversityToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-md font-bold text-xs cursor-pointer transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-bold text-xs cursor-pointer shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Confirm Inactive</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

