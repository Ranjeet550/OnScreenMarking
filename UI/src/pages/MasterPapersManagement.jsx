import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfigHeader } from '../context/ConfigHeaderContext';
import paperService from '../services/paperService';
import subjectService from '../services/subjectService';
import sectionService from '../services/sectionService';
import { useTable } from '../services/tableService';
import TablePagination from '../components/TablePagination';
import {
  FileText,
  Edit2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Check,
  ChevronDown,
  Layers,
  Plus,
  ExternalLink
} from 'lucide-react';
import message from '../services/messageService';
import { useBreadcrumb } from '../context/BreadcrumbContext';

// Modal for managing paper master sections directly
function ManagePaperSectionsModal({ isOpen, onClose, paper, masterSections = [], onSaved }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (paper && isOpen) {
      fetchPaperSections();
    }
  }, [paper, isOpen]);

  const fetchPaperSections = async () => {
    try {
      setLoading(true);
      const mapped = await sectionService.getPaperMasterSections(paper.paperId);
      if (mapped && Array.isArray(mapped)) {
        setSelectedIds(mapped.map(m => m.id));
      } else {
        setSelectedIds([]);
      }
    } catch (err) {
      console.error("Failed to load paper master sections", err);
      setSelectedIds([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !paper) return null;

  const selectedSectionsList = masterSections.filter(m => selectedIds.includes(m.id));
  const totalQuestions = selectedSectionsList.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
  const totalMarks = Math.round(selectedSectionsList.reduce((sum, s) => sum + (parseFloat(s.totalMarks) || 0), 0) * 100) / 100;

  const maxQuestions = paper?.totalQuestions ? parseInt(paper.totalQuestions, 10) : 0;
  const maxMarks = paper?.maxMarks ? parseFloat(paper.maxMarks) : 0;

  const handleToggle = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(x => x !== id));
      return;
    }

    const sec = masterSections.find(m => m.id === id);
    if (!sec) return;

    const newQuestions = totalQuestions + (sec.totalQuestions || 0);
    const newMarks = Math.round((totalMarks + (parseFloat(sec.totalMarks) || 0)) * 100) / 100;

    if (maxQuestions > 0 && newQuestions > maxQuestions) {
      message.error(`Cannot add "${sec.name}": Total questions (${newQuestions}) would exceed paper question limit (${maxQuestions}).`);
      return;
    }

    if (maxMarks > 0 && newMarks > maxMarks) {
      message.error(`Cannot add "${sec.name}": Total marks (${newMarks}) would exceed paper max marks limit (${maxMarks}).`);
      return;
    }

    setSelectedIds(prev => [...prev, id]);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === masterSections.length) {
      setSelectedIds([]);
      return;
    }

    const sumQuestions = masterSections.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
    const sumMarks = Math.round(masterSections.reduce((sum, s) => sum + (parseFloat(s.totalMarks) || 0), 0) * 100) / 100;

    if (maxQuestions > 0 && sumQuestions > maxQuestions) {
      message.error(`Cannot select all sections: Total questions (${sumQuestions}) exceeds paper limit (${maxQuestions}).`);
      return;
    }

    if (maxMarks > 0 && sumMarks > maxMarks) {
      message.error(`Cannot select all sections: Total marks (${sumMarks}) exceeds paper max marks limit (${maxMarks}).`);
      return;
    }

    setSelectedIds(masterSections.map(m => m.id));
  };

  const handleSave = async () => {
    if (maxQuestions > 0 && totalQuestions > maxQuestions) {
      message.error(`Total selected questions (${totalQuestions}) exceeds paper question limit (${maxQuestions}).`);
      return;
    }

    if (maxMarks > 0 && totalMarks > maxMarks) {
      message.error(`Total selected marks (${totalMarks}) exceeds paper max marks limit (${maxMarks}).`);
      return;
    }

    try {
      setSubmitting(true);
      await sectionService.savePaperMasterSections(paper.paperId, selectedIds);
      message.success("Master sections mapped successfully!");
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      message.error("Failed to save section mapping");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-hidden border border-gray-100 shadow-2xl flex flex-col animate-scale-up">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center font-bold">
              <Layers size={20} />
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 rounded-md transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats summary bar */}
        <div className="grid gap-3 p-4 bg-teal-50/50 border-b border-teal-100/60 text-xs sm:grid-cols-2 grid-cols-1 lg:grid-cols-3">
          <div className="bg-white p-2.5 rounded-xl border border-teal-100 shadow-2xs">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sections Mapped</div>
            <div className="text-base font-black text-teal-900 mt-0.5">{selectedIds.length}</div>
          </div>
          <div className={`bg-white p-2.5 rounded-xl border shadow-2xs ${maxQuestions > 0 && totalQuestions > maxQuestions ? 'border-red-300 bg-red-50/30' : maxQuestions > 0 && totalQuestions === maxQuestions ? 'border-amber-300 bg-amber-50/30' : 'border-teal-100'}`}>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Questions</div>
            <div className={`text-base font-black mt-0.5 ${maxQuestions > 0 && totalQuestions > maxQuestions ? 'text-red-700' : 'text-teal-900'}`}>
              {totalQuestions} {maxQuestions > 0 ? <span className="text-xs font-semibold text-gray-500">/ {maxQuestions}</span> : ''}
            </div>
          </div>
          <div className={`bg-white p-2.5 rounded-xl border shadow-2xs ${maxMarks > 0 && totalMarks > maxMarks ? 'border-red-300 bg-red-50/30' : maxMarks > 0 && totalMarks === maxMarks ? 'border-amber-300 bg-amber-50/30' : 'border-teal-100'}`}>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Marks</div>
            <div className={`text-base font-black mt-0.5 ${maxMarks > 0 && totalMarks > maxMarks ? 'text-red-700' : 'text-teal-900'}`}>
              {totalMarks} {maxMarks > 0 ? <span className="text-xs font-semibold text-gray-500">/ {maxMarks}</span> : ''}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 p-4 md:p-6">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase text-gray-500 tracking-wider">Available Section Masters</label>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs font-bold text-teal-700 hover:underline"
            >
              {selectedIds.length === masterSections.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          {loading ? (
            <div className="text-center text-xs font-semibold text-gray-400 p-4 md:p-8">Loading master sections...</div>
          ) : masterSections.length === 0 ? (
            <div className="text-center text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-4 md:p-8">
              No Section Masters created yet. Create section templates under <strong>Section Masters Management</strong> first.
            </div>
          ) : (
            <div className="space-y-2">
              {masterSections.map(sec => {
                const isChecked = selectedIds.includes(sec.id);
                return (
                  <label
                    key={sec.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-teal-50/60 border-teal-300 text-teal-900 font-semibold shadow-2xs'
                        : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggle(sec.id)}
                        className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-gray-300 accent-teal-600 cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-extrabold text-gray-900">{sec.name}</div>
                        <div className="text-[11px] text-gray-500 font-medium">
                          Q{sec.startQuestion}-Q{sec.endQuestion} ({sec.totalQuestions} Qs) • {sec.totalMarks} Marks
                        </div>
                      </div>
                    </div>
                    {isChecked && <Check size={16} className="text-teal-700" />}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
          <span className="text-[11px] text-gray-500 font-medium">
            Changes auto-apply to newly imported project papers.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-md font-bold text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-xs transition cursor-pointer shadow disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Mapping'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Modal for adding a master paper
function MasterPaperModal({ isOpen, onClose, onSubmit, initialData = null, subjects = [], masterSections = [] }) {
  const [formData, setFormData] = useState({
    paperCode: '',
    paperName: '',
    catchNo: '',
    paperNumber: 1,
    maxMarks: 100,
    totalQuestions: 10,
    subjectIds: [],
    masterSectionIds: [],
    isActive: true
  });

  const [modalSubjects, setModalSubjects] = useState(subjects);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Sync or fetch subjects when modal is open
  useEffect(() => {
    if (subjects && subjects.length > 0) {
      setModalSubjects(subjects);
    } else if (isOpen) {
      subjectService.getAllSubjects({ pageSize: 0 })
        .then(res => {
          const list = Array.isArray(res) ? res : (res?.items || []);
          setModalSubjects(list);
        })
        .catch(err => console.error('Failed to load fallback subjects:', err));
    }
  }, [subjects, isOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        catchNo: initialData.catchNo || '',
        subjectIds: initialData.subjectIds?.map(Number) || [],
        masterSectionIds: initialData.masterSectionIds || []
      });
      if (initialData.paperId && (!initialData.masterSectionIds || initialData.masterSectionIds.length === 0)) {
        sectionService.getPaperMasterSections(initialData.paperId).then(mapped => {
          if (mapped && Array.isArray(mapped)) {
            setFormData(prev => ({ ...prev, masterSectionIds: mapped.map(m => m.id) }));
          }
        }).catch(err => console.error(err));
      }
    } else {
      setFormData({
        paperCode: '',
        paperName: '',
        catchNo: '',
        paperNumber: 1,
        maxMarks: 100,
        totalQuestions: 10,
        subjectIds: [],
        masterSectionIds: [],
        isActive: true
      });
    }
    setSubjectSearch('');
    setIsDropdownOpen(false);
  }, [initialData, isOpen]);

  const selectedSectionsList = masterSections.filter(m => formData.masterSectionIds.includes(m.id));
  const currentTotalQuestions = selectedSectionsList.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
  const currentTotalMarks = selectedSectionsList.reduce((sum, s) => sum + (s.totalMarks || 0), 0);

  const paperLimitQuestions = parseInt(formData.totalQuestions || 0, 10);
  const paperLimitMarks = parseFloat(formData.maxMarks || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.subjectIds.length === 0) {
      message.error("Please select at least one subject");
      return;
    }

    if (paperLimitQuestions > 0 && currentTotalQuestions > paperLimitQuestions) {
      message.error(`Total selected section questions (${currentTotalQuestions}) exceeds paper total questions (${paperLimitQuestions}).`);
      return;
    }

    if (paperLimitMarks > 0 && currentTotalMarks > paperLimitMarks) {
      message.error(`Total selected section marks (${currentTotalMarks}) exceeds paper max marks (${paperLimitMarks}).`);
      return;
    }

    onSubmit(formData);
  };

  const toggleSubject = (subId) => {
    const numId = Number(subId);
    setFormData(prev => ({
      ...prev,
      subjectIds: prev.subjectIds.some(id => Number(id) === numId)
        ? prev.subjectIds.filter(id => Number(id) !== numId)
        : [...prev.subjectIds, numId]
    }));
  };

  const toggleMasterSection = (mId) => {
    if (formData.masterSectionIds.includes(mId)) {
      setFormData(prev => ({
        ...prev,
        masterSectionIds: prev.masterSectionIds.filter(id => id !== mId)
      }));
      return;
    }

    const sec = masterSections.find(m => m.id === mId);
    if (!sec) return;

    const newQuestions = currentTotalQuestions + (sec.totalQuestions || 0);
    const newMarks = currentTotalMarks + (sec.totalMarks || 0);

    if (paperLimitQuestions > 0 && newQuestions > paperLimitQuestions) {
      message.error(`Cannot add "${sec.name}": Total questions (${newQuestions}) would exceed paper question limit (${paperLimitQuestions}).`);
      return;
    }

    if (paperLimitMarks > 0 && newMarks > paperLimitMarks) {
      message.error(`Cannot add "${sec.name}": Total marks (${newMarks}) would exceed paper max marks limit (${paperLimitMarks}).`);
      return;
    }

    setFormData(prev => ({
      ...prev,
      masterSectionIds: [...prev.masterSectionIds, mId]
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden border border-gray-100 shadow-2xl flex flex-col animate-scale-up">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">
              {initialData ? 'Edit Academic Paper' : 'Add New Academic Paper'}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 rounded-md transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Form */}
        <form id="master-paper-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-5 p-4 md:p-6">
          <div className="grid gap-3 sm:grid-cols-2 grid-cols-1 lg:grid-cols-3">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Paper Code *</label>
              <input
                type="text"
                required
                value={formData.paperCode}
                onChange={e => setFormData({ ...formData, paperCode: e.target.value })}
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
                placeholder="e.g. MATH-101"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Catch No.</label>
              <input
                type="text"
                value={formData.catchNo}
                onChange={e => setFormData({ ...formData, catchNo: e.target.value })}
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
                placeholder="e.g. C-101"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Paper Name *</label>
              <input
                type="text"
                required
                value={formData.paperName}
                onChange={e => setFormData({ ...formData, paperName: e.target.value })}
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
                placeholder="e.g. Calculus I"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 grid-cols-1 lg:grid-cols-3">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Paper No.</label>
              <input
                type="number"
                min="1"
                required
                value={formData.paperNumber}
                onChange={e => setFormData({ ...formData, paperNumber: parseInt(e.target.value) })}
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-4 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Max Marks</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={formData.maxMarks}
                onChange={e => setFormData({ ...formData, maxMarks: parseFloat(e.target.value) || e.target.value })}
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-4 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Total Qs</label>
              <input
                type="number"
                min="1"
                required
                value={formData.totalQuestions}
                onChange={e => setFormData({ ...formData, totalQuestions: parseInt(e.target.value) })}
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-4 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
              />
            </div>
          </div>

          <div className="relative" ref={dropdownRef}>
            <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">
              Associated Subjects * ({formData.subjectIds.length} selected)
            </label>
            <div
              className="w-full bg-gray-50/50 border border-gray-200 rounded-xl text-xs font-medium flex flex-wrap gap-1 p-1.5 focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-600 transition min-h-[42px] cursor-text"
              onClick={() => setIsDropdownOpen(true)}
            >
              {formData.subjectIds.map(subId => {
                const sub = (modalSubjects || []).find(s => Number(s.subjectId) === Number(subId));
                if (!sub) return null;
                return (
                  <span key={subId} className="bg-teal-100 text-teal-700 px-2 py-1 rounded-md text-xs flex items-center gap-1 font-bold border border-teal-200/50">
                    <span>{sub.subCode ? `${sub.subCode} - ` : ''}{sub.subName}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSubject(subId); }}
                      className="hover:text-teal-900 transition ml-0.5 bg-teal-200/50 rounded-full p-0.5 cursor-pointer"
                    >
                      <X size={10} />
                    </button>
                  </span>
                );
              })}
              <div className="flex-1 min-w-[120px] flex items-center">
                <input
                  type="text"
                  value={subjectSearch}
                  onChange={e => { setSubjectSearch(e.target.value); setIsDropdownOpen(true); }}
                  onFocus={() => setIsDropdownOpen(true)}
                  className="w-full bg-transparent border-none outline-none text-gray-900 text-xs font-medium min-w-[100px]"
                  placeholder={formData.subjectIds.length === 0 ? "Search subjects..." : ""}
                />
                <ChevronDown size={14} className={`text-gray-400 mr-2 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {isDropdownOpen && (
              <div 
                className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto top-full py-1 overscroll-contain"
                onWheel={(e) => e.stopPropagation()}
              >
                {(modalSubjects || [])
                  .filter(s => {
                    const name = (s.subName || '').toLowerCase();
                    const code = (s.subCode || '').toLowerCase();
                    const search = (subjectSearch || '').toLowerCase();
                    return name.includes(search) || code.includes(search);
                  })
                  .map(sub => {
                    const isSelected = formData.subjectIds.some(id => Number(id) === Number(sub.subjectId));
                    return (
                      <div
                        key={sub.subjectId}
                        onMouseDown={(e) => {
                          e.preventDefault();
                        }}
                        onClick={() => toggleSubject(sub.subjectId)}
                        className={`px-4 py-2.5 cursor-pointer text-xs font-semibold hover:bg-gray-50 transition flex items-center justify-between ${
                          isSelected ? 'bg-teal-50/50 text-teal-700' : 'text-gray-700'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{sub.subName}</span>
                          {sub.subCode && <span className="text-[10px] text-gray-400 font-medium">{sub.subCode}</span>}
                        </div>
                        {isSelected && <Check size={14} className="text-teal-700 shrink-0" />}
                      </div>
                    );
                  })}
                {(modalSubjects || []).filter(s => {
                  const name = (s.subName || '').toLowerCase();
                  const code = (s.subCode || '').toLowerCase();
                  const search = (subjectSearch || '').toLowerCase();
                  return name.includes(search) || code.includes(search);
                }).length === 0 && (
                  <div className="px-4 py-3 text-xs text-gray-500 font-medium text-center">No subjects found</div>
                )}
              </div>
            )}
          </div>

          {masterSections.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider">Default Master Sections</label>
                  <div className="text-[10px] font-semibold text-gray-400 mt-0.5">
                    Qs: <span className={paperLimitQuestions > 0 && currentTotalQuestions > paperLimitQuestions ? "text-red-600 font-bold" : "text-teal-700 font-bold"}>{currentTotalQuestions}</span>/{paperLimitQuestions || '∞'} | 
                    Marks: <span className={paperLimitMarks > 0 && currentTotalMarks > paperLimitMarks ? "text-red-600 font-bold" : "text-teal-700 font-bold"}>{currentTotalMarks}</span>/{paperLimitMarks || '∞'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (formData.masterSectionIds.length === masterSections.length) {
                      setFormData({ ...formData, masterSectionIds: [] });
                    } else {
                      const sumQuestions = masterSections.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
                      const sumMarks = masterSections.reduce((sum, s) => sum + (s.totalMarks || 0), 0);
                      if (paperLimitQuestions > 0 && sumQuestions > paperLimitQuestions) {
                        message.error(`Cannot select all: Total questions (${sumQuestions}) exceeds paper question limit (${paperLimitQuestions}).`);
                        return;
                      }
                      if (paperLimitMarks > 0 && sumMarks > paperLimitMarks) {
                        message.error(`Cannot select all: Total marks (${sumMarks}) exceeds paper max marks limit (${paperLimitMarks}).`);
                        return;
                      }
                      setFormData({ ...formData, masterSectionIds: masterSections.map(m => m.id) });
                    }
                  }}
                  className="text-[10px] font-bold text-teal-700 hover:underline cursor-pointer"
                >
                  {formData.masterSectionIds.length === masterSections.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="bg-gray-50/50 border border-gray-200 rounded-xl p-2 max-h-36 overflow-y-auto space-y-1 custom-scrollbar">
                {masterSections.map(m => {
                  const isChecked = formData.masterSectionIds.includes(m.id);
                  return (
                    <label key={m.id} className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${isChecked ? "bg-teal-50 text-teal-900 font-semibold" : "hover:bg-gray-100 text-gray-700"}`}>
                      <span className="truncate pr-2">{m.name} ({m.totalQuestions} Qs, {m.totalMarks} Marks)</span>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleMasterSection(m.id)}
                        className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 border-gray-300 accent-teal-600"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

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
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-md font-bold text-xs cursor-pointer transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="master-paper-form"
            className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-xs cursor-pointer shadow transition"
          >
            {initialData ? 'Update Paper' : 'Create Paper'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MasterPapersManagement() {
  const [searchParams] = useSearchParams();
  const { userType, universityId: userUniversityId } = useAuth();
  const universityIdFromUrl = searchParams.get('universityId');
  const activeUniversityId = userType === 'coordinator' ? userUniversityId : universityIdFromUrl;
  const { setBreadcrumb } = useBreadcrumb();
  const { setConfigHeader } = useConfigHeader();
  const ColumnFilter = React.lazy(() => import('../components/ColumnFilter'));

  useEffect(() => {
    const routePath = userType === 'admin' ? '/admin/master-papers' : '/master-papers';
    setBreadcrumb([
      { label: 'Academic Papers', path: routePath, icon: 'FileText' }
    ]);
  }, [userType, setBreadcrumb]);

  const [subjects, setSubjects] = useState([]);
  const [masterSections, setMasterSections] = useState([]);
  const [sectionsPaperModal, setSectionsPaperModal] = useState(null);

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const res = activeUniversityId
          ? await subjectService.getSubjectByUniversity(activeUniversityId, { pageSize: 0 })
          : await subjectService.getAllSubjects({ pageSize: 0 });
        const list = Array.isArray(res) ? res : (res?.items || []);
        setSubjects(list);
      } catch (err) {
        console.error("Failed to fetch subjects:", err);
      }
    };
    fetchSubjects();
  }, [activeUniversityId]);

  useEffect(() => {
    const fetchMasterSections = async () => {
      try {
        const data = await sectionService.getSectionMasters();
        setMasterSections(data || []);
      } catch (err) {
        console.error("Failed to fetch section masters", err);
      }
    };
    fetchMasterSections();
  }, []);

  const fetchFn = useCallback((params) => {
    // Inject isMaster=true flag
    return paperService.getPapers({ ...params, universityId: activeUniversityId, isMaster: true });
  }, [activeUniversityId]);

  const {
    items: papers,
    totalCount,
    totalPages,
    page,
    setPage,
    pageSize,
    setPageSize,
    search,
    setSearch,
    loading,
    error,
    setError,
    filters,
    setFilter,
    refresh
  } = useTable({ fetchFn, initialParams: { pageSize: 10 } });

  useEffect(() => {
    if (error) {
      message.error(error);
      setError('');
    }
  }, [error, setError]);

  const handleSort = (field) => {
    if (filters.sortField === field) {
      if (filters.sortOrder === 'asc') setFilter('sortOrder', 'desc');
      else if (filters.sortOrder === 'desc') {
        setFilter('sortField', '');
        setFilter('sortOrder', '');
      }
    } else {
      setFilter('sortField', field);
      setFilter('sortOrder', 'asc');
    }
  };

  const getSortIcon = (field) => {
    if (filters.sortField !== field) return <ArrowUpDown size={12} className="text-gray-300" />;
    return filters.sortOrder === 'asc' ? <ArrowUp size={12} className="text-teal-600" /> : <ArrowDown size={12} className="text-teal-600" />;
  };

  const [showForm, setShowForm] = useState(false);
  const [editingData, setEditingData] = useState(null);

  // Register header extras into the unified UniversityConfigHeader bar
  useEffect(() => {
    setConfigHeader({
      title: 'Academic Papers Management',
      search,
      setSearch,
      searchPlaceholder: 'Search papers by code or name…',
      actionLabel: 'Add Academic Paper',
      onAction: () => setShowForm(true),
    });
    return () => setConfigHeader(null);
  }, [search, setSearch, setConfigHeader]);

  const handleEdit = (paper) => {
    setEditingData({
      paperId: paper.paperId,
      paperCode: paper.paperCode,
      paperName: paper.paperName,
      catchNo: paper.catchNo || '',
      paperNumber: paper.paperNumber,
      maxMarks: paper.maxMarks,
      totalQuestions: paper.totalQuestions,
      subjectIds: paper.subjectIds || [],
      masterSectionIds: paper.masterSectionIds || [],
      isActive: paper.isActive
    });
    setShowForm(true);
  };

  const handleSubmit = async (data) => {
    try {
      let uniId = activeUniversityId ? parseInt(activeUniversityId, 10) : null;
      if (!uniId && data.subjectIds && data.subjectIds.length > 0) {
        const selectedSub = subjects.find(s => Number(s.subjectId) === Number(data.subjectIds[0]));
        if (selectedSub?.universityId) {
          uniId = selectedSub.universityId;
        }
      }

      let savedPaperId = editingData?.paperId;
      if (editingData) {
        await paperService.updatePaper(editingData.paperId, {
          ...data,
          universityId: uniId
        });
      } else {
        const created = await paperService.createPaper({
          ...data,
          universityId: uniId,
          projectId: null // Ensure it's an academic paper
        });
        savedPaperId = created?.paperId || created?.id;
      }

      if (savedPaperId && data.masterSectionIds) {
        await sectionService.savePaperMasterSections(savedPaperId, data.masterSectionIds);
      }

      message.success(editingData ? "Paper updated successfully!" : "Academic paper created successfully!");

      refresh();
      setShowForm(false);
      setEditingData(null);
    } catch (err) {
      message.error(err.message || 'Error saving paper');
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Modal for adding/editing master paper */}
      <MasterPaperModal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingData(null); }}
        onSubmit={handleSubmit}
        initialData={editingData}
        subjects={subjects}
        masterSections={masterSections}
      />

      {/* Modal for configuring paper sections */}
      <ManagePaperSectionsModal
        isOpen={!!sectionsPaperModal}
        onClose={() => setSectionsPaperModal(null)}
        paper={sectionsPaperModal}
        masterSections={masterSections}
        onSaved={refresh}
      />

      {/* Papers List Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading && papers.length === 0 ? (
            <div className="p-12 text-center text-gray-450 font-bold text-xs flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <span>Loading papers...</span>
            </div>
          ) : papers.length === 0 ? (
            <div className="p-16 text-center text-gray-555 leading-relaxed max-w-sm mx-auto space-y-3">
              <FileText className="mx-auto text-gray-400" size={32} />
              <div>
                <h3 className="font-extrabold text-gray-900 text-xs uppercase tracking-wider">No Academic Papers</h3>
                <p className="text-[10px] text-gray-400 mt-1">Create academic papers to be imported into evaluation projects.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-450 uppercase tracking-widest select-none">
                    <th
                      className="py-2.5 cursor-pointer hover:bg-gray-100 transition-colors group md:px-6 px-4"
                      onClick={() => handleSort('paperCode')}
                    >
                      <div className="flex items-center gap-1.5">Paper Code {getSortIcon('paperCode')}
                        <React.Suspense fallback={null}><ColumnFilter columnKey="paperCode" currentFilter={filters.paperCode} setFilter={setFilter} placeholder="Filter code..." /></React.Suspense>
                      </div>
                    </th>
                    <th className="py-2.5 md:px-6 px-4">
                      <div className="flex items-center gap-1.5">Catch No.
                        <React.Suspense fallback={null}><ColumnFilter columnKey="catchNo" currentFilter={filters.catchNo} setFilter={setFilter} placeholder="Filter catch..." /></React.Suspense>
                      </div>
                    </th>
                    <th
                      className="py-2.5 cursor-pointer hover:bg-gray-100 transition-colors group md:px-6 px-4"
                      onClick={() => handleSort('paperName')}
                    >
                      <div className="flex items-center gap-1.5">Paper Name {getSortIcon('paperName')}
                        <React.Suspense fallback={null}><ColumnFilter columnKey="paperName" currentFilter={filters.paperName} setFilter={setFilter} placeholder="Filter name..." /></React.Suspense>
                      </div>
                    </th>
                    <th
                      className="py-2.5 cursor-pointer hover:bg-gray-100 transition-colors group md:px-6 px-4"
                      onClick={() => handleSort('paperNumber')}
                    >
                      <div className="flex items-center gap-1.5">Paper Number {getSortIcon('paperNumber')}</div>
                    </th>
                    <th className="py-2.5 md:px-6 px-4">Linked Subjects</th>
                    <th className="py-2.5 md:px-6 px-4">Master Sections</th>
                   
                    <th className="py-2.5 text-right md:px-6 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {papers.map(paper => (
                    <tr key={paper.paperId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-2.5 md:px-6 px-4">
                        <span className="font-extrabold text-gray-900">{paper.paperCode}</span>
                      </td>
                      <td className="py-2.5 md:px-6 px-4">
                        {paper.catchNo ? (
                          <span className="font-mono bg-gray-100 text-gray-700 font-bold px-2 py-0.5 rounded text-[11px] uppercase tracking-wider">
                            {paper.catchNo}
                          </span>
                        ) : (
                          <span className="text-gray-400 font-medium">-</span>
                        )}
                      </td>
                      <td className="py-2.5 font-bold text-gray-700 md:px-6 px-4">{paper.paperName}</td>
                      <td className="py-2.5 text-gray-500 font-medium md:px-6 px-4">
                        {paper.paperNumber}
                      </td>
                      <td className="py-2.5 text-gray-500 font-medium md:px-6 px-4">
                        {paper.subjectNames?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {paper.subjectNames.map((name, i) => (
                              <span key={i} className="bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold text-gray-600">
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="py-2.5 md:px-6 px-4">
                        <button
                          onClick={() => setSectionsPaperModal(paper)}
                          className="bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200/80 px-2.5 py-1 rounded-lg font-bold text-[10px] flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Configure Master Sections"
                        >
                          <Layers size={12} className="text-teal-600 shrink-0" />
                          {paper.masterSectionNames.length > 0 && (
                            <span className="truncate max-w-[140px]">{paper.masterSectionNames.join(', ')}</span>
                          )}
                        </button>
                      </td>
                     
                      <td className="py-2.5 text-right md:px-6 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(paper)}
                            className="p-2 bg-gray-50 hover:bg-teal-50 hover:text-teal-700 text-gray-600 rounded-xl border border-gray-200 hover:border-teal-200 transition-all cursor-pointer shadow-sm group"
                            title="Edit Paper"
                          >
                            <Edit2 size={14} className="group-hover:scale-110 transition-transform" />
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
  );
}

