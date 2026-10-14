import { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, Search, Check } from 'lucide-react';
import subjectService from '../services/subjectService';
import courseService from '../services/courseService';

export default function AddSubjectModal({
  isOpen,
  onClose,
  onSuccess,
  editingId,
  initialData,
  activeUniversityId,
  departments
}) {
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [status, setStatus] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Courses related states
  const [courses, setCourses] = useState([]);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [initialCourses, setInitialCourses] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');
  const dropdownRef = useRef(null);

  const filteredCourses = courses.filter(c => 
    (c.name || '').toLowerCase().includes(courseSearch.toLowerCase())
  );

  // Close dropdown when clicking outside
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
    const loadModalData = async () => {
      if (!isOpen) return;

      try {
        setLoading(true);
        // Fetch all courses for the university or overall courses
        const response = activeUniversityId
          ? await courseService.getAllCourses(null, activeUniversityId, { pageSize: 0 })
          : await courseService.getAllCourses(null, null, { pageSize: 0 });
        const list = Array.isArray(response) ? response : (response?.items || []);
        setCourses(list);

        if (editingId && initialData) {
          setSubName(initialData.subName || '');
          setSubCode(initialData.subCode || '');
          setStatus(initialData.status !== undefined ? initialData.status : true);
          
          const existingCourses = initialData.courseIds || (initialData.courseId ? [initialData.courseId] : []);
          setSelectedCourses(existingCourses);
          setInitialCourses(existingCourses);
        } else {
          setSubName('');
          setSubCode('');
          setSelectedCourses(initialData?.courseId ? [initialData.courseId] : (initialData?.courseIds || []));
          setInitialCourses([]);
          setStatus(true);
        }
      } catch (err) {
        console.error('Failed to load courses:', err);
      } finally {
        setLoading(false);
      }
    };
    loadModalData();
    setError('');
  }, [editingId, initialData, isOpen, activeUniversityId]);

  const toggleCourse = (id) => {
    setSelectedCourses(prev => 
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subName.trim()) {
      setError('Subject name is required');
      return;
    }

    // Determine the department ID to map this subject to based on the first selected course.
    const deptId = selectedCourses.length > 0 
      ? courses.find(c => c.id === selectedCourses[0])?.departmentId 
      : (initialData?.departmentId || (departments && departments[0]?.departmentId));
      
    if (!deptId) {
      setError('No active department found to satisfy backend mapping.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const payload = {
        subjectName: subName.trim(),
        subjectCode: subCode.trim(),
        isActive: status,
        departmentId: parseInt(deptId, 10)
      };

      let currentSubjectId = editingId;

      if (editingId) {
        await subjectService.updateSubject(editingId, payload);
      } else {
        const newSubject = await subjectService.createSubject(payload);
        currentSubjectId = newSubject.subjectId || newSubject.id;
      }

      if (currentSubjectId) {
        // Add new mappings
        for (const courseId of selectedCourses) {
          if (!initialCourses.includes(courseId)) {
            await courseService.addSubjectToCourse(courseId, currentSubjectId);
          }
        }
        // Remove old mappings if editing
        if (editingId) {
          for (const courseId of initialCourses) {
            if (!selectedCourses.includes(courseId)) {
              await courseService.removeSubjectFromCourse(courseId, currentSubjectId);
            }
          }
        }
      }

      onSuccess(editingId ? 'Subject updated successfully' : 'Subject created and mapped successfully');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save subject');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden border border-gray-100 shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">
              {editingId ? 'Edit Subject' : 'Add New Subject'}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 rounded-md transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form id="subject-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 min-h-[340px]">
          {error && (
            <div className="p-3 text-xs bg-red-50 text-red-600 rounded-xl border border-red-100 font-semibold">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Subject Name *</label>
              <input
                type="text"
                required
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="e.g. Data Structures"
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-4 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Subject Code</label>
              <input
                type="text"
                value={subCode}
                onChange={(e) => setSubCode(e.target.value)}
                placeholder="e.g. CS-201"
                className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-4 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
              />
            </div>
          </div>

          {/* Courses Multi-Select */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">
              Map to Courses ({selectedCourses.length} selected)
            </label>
            <div
              className="w-full bg-gray-50/50 border border-gray-200 rounded-xl text-xs font-medium flex flex-wrap gap-1 p-1.5 focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-600 transition min-h-[42px] cursor-text"
              onClick={() => setIsDropdownOpen(true)}
            >
              {selectedCourses.map(id => {
                const course = courses.find(c => c.id === id);
                return course ? (
                  <span key={id} className="flex items-center gap-1 bg-teal-100 text-teal-700 px-2 py-1 rounded-md text-xs font-bold border border-teal-200/50 shadow-sm animate-fade-in-up">
                    {course.name}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCourse(id);
                      }}
                      className="hover:bg-teal-200 p-0.5 rounded-full transition-colors cursor-pointer"
                    >
                      <X size={12} className="text-teal-600" />
                    </button>
                  </span>
                ) : null;
              })}
              <div className="flex-1 min-w-[120px] flex items-center">
                <input
                  type="text"
                  value={courseSearch}
                  onChange={(e) => {
                    setCourseSearch(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder={selectedCourses.length === 0 ? "Search and map courses..." : ""}
                  className="w-full bg-transparent border-none focus:outline-none text-gray-900 text-xs font-medium min-w-[120px]"
                />
                <ChevronDown size={14} className={`text-gray-400 mr-2 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {isDropdownOpen && (
              <div 
                className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto top-full py-1 overscroll-contain"
                onWheel={(e) => e.stopPropagation()}
              >
                {filteredCourses.length === 0 ? (
                  <div className="p-3 text-center text-xs font-semibold text-gray-400 flex flex-col items-center gap-1">
                    <Search size={16} className="opacity-50" />
                    No courses found
                  </div>
                ) : (
                  filteredCourses.map(course => {
                    const isSelected = selectedCourses.includes(course.id);
                    return (
                      <div
                        key={course.id}
                        onClick={() => {
                          toggleCourse(course.id);
                          setCourseSearch('');
                        }}
                        className={`flex items-center justify-between px-4 py-2.5 cursor-pointer text-xs font-semibold hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-teal-50/50 text-teal-700' : 'text-gray-700'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span>{course.name}</span>
                          {course.type && (
                            <span className="text-[10px] text-gray-400 font-normal">{course.type}</span>
                          )}
                        </div>
                        {isSelected && <Check size={14} className="text-teal-700 shrink-0" />}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
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
            form="subject-form"
            disabled={loading}
            className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-xs cursor-pointer shadow transition disabled:opacity-50"
          >
            {loading ? 'Saving...' : editingId ? 'Update Subject' : 'Create Subject'}
          </button>
        </div>
      </div>
    </div>
  );
}
