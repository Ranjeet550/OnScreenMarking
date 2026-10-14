import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfigHeader } from '../context/ConfigHeaderContext';
import subjectService from '../services/subjectService';
import departmentService from '../services/departmentService';
import { useTable } from '../services/tableService';
import TablePagination from '../components/TablePagination';
import AddSubjectModal from '../components/AddSubjectModal';
import ColumnFilter from '../components/ColumnFilter';
import { 
  BookOpen, 
  Plus, 
  Edit2, 
  XCircle, 
  CheckCircle2, 
  Building2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import message from '../services/messageService';

export default function SubjectManagement() {
  const [searchParams] = useSearchParams();
  const departmentId = searchParams.get('departmentId');
  const universityId = searchParams.get('universityId');
  const { userType, universityId: userUniversityId } = useAuth();
  const activeUniversityId = userType === 'coordinator' ? userUniversityId : universityId;

  const [departments, setDepartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    subName: '',
    subCode: '',
    status: true
  });

  

  // Define fetch function for paginated subjects
  const fetchFn = useCallback((params) => {
    const selectedDeptId = params.departmentId || departmentId;
    if (selectedDeptId) {
      return subjectService.getSubjectsByDepartment(selectedDeptId, params);
    }
    if (activeUniversityId) {
      return subjectService.getSubjectByUniversity(activeUniversityId, params);
    }
    return subjectService.getAllSubjects(params);
  }, [departmentId, activeUniversityId]);

  // Centralized hook for table states
  const {
    items: subjects,
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
  } = useTable({
    fetchFn,
    initialParams: { pageSize: 10 }
  });

  useEffect(() => {
    if (error) {
      message.error(error);
      setError('');
    }
  }, [error, setError]);

  const handleSort = (field) => {
    if (filters.sortField === field) {
      if (filters.sortOrder === 'asc') {
        setFilter('sortOrder', 'desc');
      } else if (filters.sortOrder === 'desc') {
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

  // Load static departments for dropdown selects (pageSize: 0 retrieves all)
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const data = activeUniversityId
          ? await departmentService.getDepartmentsByUniversity(activeUniversityId, { pageSize: 0 })
          : await departmentService.getAllDepartments({ pageSize: 0 });
        setDepartments(data?.items || data || []);
      } catch (err) {
        console.error('Failed to fetch departments:', err);
      }
    };
    fetchDepartments();
  }, [activeUniversityId]);

  const fetchSubjectDepartments = async (subjectId) => {
    try {
      const data = await subjectService.getSubjectDepartments(subjectId, activeUniversityId);
      return data;
    } catch (err) {
      console.error('Failed to fetch subject departments:', err);
      return [];
    }
  };

  const handleEdit = async (subject) => {
    const depts = await fetchSubjectDepartments(subject.subjectId);

    // If the subject has departments, ensure we sync the selected departments list
    const subjectUniId = depts[0]?.universityId;
    if (subjectUniId) {
      try {
        const uniDepts = await departmentService.getDepartmentsByUniversity(subjectUniId, { pageSize: 0 });
        setDepartments(uniDepts?.items || uniDepts || []);
      } catch (err) {
        console.error('Failed to fetch university departments on edit:', err);
      }
    }

    const mappedCourseIds = subject.courseSubjects?.map(cs => cs.courseId || cs.course?.id).filter(Boolean) || [];

    setFormData({
      subName: subject.subName,
      subCode: subject.subCode || '',
      status: subject.status,
      departmentId: depts[0]?.departmentId || '',
      courseIds: mappedCourseIds
    });
    setEditingId(subject.subjectId);
    setShowForm(true);
  };

  const handleCancel = () => {
    setFormData({ subName: '', subCode: '', status: true });
    setEditingId(null);
    setShowForm(false);
    
  };

  const handleSuccess = (msg) => {
    message.success(msg);
    refresh();
    
  };

  // Register into the unified header bar
  const { setConfigHeader } = useConfigHeader();
  useEffect(() => {
    setConfigHeader({
      title: 'Subjects Management',
      search,
      setSearch,
      searchPlaceholder: 'Search subjects…',
      actionLabel: 'Add Subject',
      onAction: () => setShowForm(true),
    });
    return () => setConfigHeader(null);
  }, [search, setSearch, setConfigHeader]);

  return (
    <div className="w-full space-y-3">

        {/* Form Modal */}
        <AddSubjectModal
          isOpen={showForm}
          onClose={handleCancel}
          onSuccess={handleSuccess}
          editingId={editingId}
          initialData={formData}
          activeUniversityId={activeUniversityId}
          departments={departments}
        />

        {/* Subjects List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading && subjects.length === 0 ? (
            <div className="p-12 text-center text-gray-400 font-bold text-xs flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <span>Fetching subjects...</span>
            </div>
          ) : subjects.length === 0 ? (
            <div className="p-16 text-center text-gray-500 max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 mx-auto">
                <BookOpen size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-sm text-gray-900 uppercase tracking-wide">No Subjects Found</h3>
                <p className="text-xs text-gray-400">There are no syllabus subjects configured. Add your first subject to populate the curriculum database.</p>
              </div>
              {search ? (
                <button
                  onClick={() => setSearch('')}
                  className="px-4 py-2 text-[10px] font-black uppercase tracking-wider text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-xl transition cursor-pointer"
                >
                  Clear Filters
                </button>
              ) : (
                <button
                  onClick={() => setShowForm(true)}
                  className="px-4 py-2 text-[10px] font-black uppercase tracking-wider text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-xl transition cursor-pointer"
                >
                  Create First Subject
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-450 uppercase tracking-widest select-none">
                    <th 
                      className="py-2.5 cursor-pointer hover:bg-gray-100 transition-colors group md:px-6 px-4"
                      onClick={() => handleSort('subName')}
                    >
                      <div className="flex items-center gap-1.5">
                        Subject Info {getSortIcon('subName')}
                        <ColumnFilter columnKey="subName" currentFilter={filters.subName} setFilter={setFilter} placeholder="Filter subject name..." />
                      </div>
                    </th>
                    <th 
                      className="py-2.5 cursor-pointer hover:bg-gray-100 transition-colors group md:px-6 px-4"
                      onClick={() => handleSort('subCode')}
                    >
                      <div className="flex items-center gap-1.5">
                        Subject Code {getSortIcon('subCode')}
                        <ColumnFilter columnKey="subCode" currentFilter={filters.subCode} setFilter={setFilter} placeholder="Filter subject code..." />
                      </div>
                    </th>
                    <th className="py-2.5 md:px-6 px-4">
                      <div className="flex items-center gap-1.5">
                        Departments
                        {!departmentId && (
                          <ColumnFilter 
                            columnKey="departmentId" 
                            currentFilter={filters.departmentId} 
                            setFilter={setFilter}
                            options={[
                              { label: 'All Departments', value: '' },
                              ...departments.map(dept => ({
                                label: dept.name,
                                value: String(dept.departmentId)
                              }))
                            ]}
                          />
                        )}
                      </div>
                    </th>
                    <th className="py-2.5 md:px-6 px-4">Courses</th>
                    <th 
                      className="py-2.5 text-center cursor-pointer hover:bg-gray-100 transition-colors group md:px-6 px-4"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        Status {getSortIcon('status')}
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
                <tbody className="divide-y divide-gray-100 text-xs">
                  {subjects.map((subject) => (
                    <tr key={subject.subjectId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-2.5 md:px-6 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center text-gray-600 font-extrabold shadow-sm">
                            <BookOpen size={18} />
                          </div>
                          <div>
                            <span className="font-extrabold text-gray-900 tracking-tight block">{subject.subName}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 md:px-6 px-4">
                        <span className="px-2.5 py-1 bg-gray-100 border border-gray-200 text-gray-700 rounded-md font-bold text-[10px] tracking-wide">
                          {subject.subCode || 'N/A'}
                        </span>
                      </td>
                      <td className="py-2.5 max-w-xs md:px-6 px-4">
                        {subject.departmentSubjects && subject.departmentSubjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {subject.departmentSubjects.map((ds) => ds.department?.name).filter(Boolean).map((name, idx) => (
                              <span 
                                key={idx}
                                className="px-2 py-1 bg-teal-50 border border-teal-100 text-teal-700 rounded-md font-bold text-[9px] uppercase tracking-wider"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 font-medium text-[10px]">No departments assigned</span>
                        )}
                      </td>
                      <td className="py-2.5 max-w-xs md:px-6 px-4">
                        {subject.courseSubjects && subject.courseSubjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {subject.courseSubjects.map((cs) => cs.course?.name).filter(Boolean).map((name, idx) => (
                              <span 
                                key={idx}
                                className="px-2 py-1 bg-amber-55 border border-amber-100 text-amber-700 rounded-md font-bold text-[9px] uppercase tracking-wider animate-fade-in"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 font-medium text-[10px]">No courses mapped</span>
                        )}
                      </td>
                      <td className="py-2.5 text-center md:px-6 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-[9px] uppercase tracking-wider border ${
                          subject.status 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : 'bg-rose-50 text-rose-700 border-rose-100'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${subject.status ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                          {subject.status ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap md:px-6 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(subject)}
                            className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl border border-gray-200 transition cursor-pointer"
                            title="Edit Subject"
                          >
                            <Edit2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Standard Centralized Table Pagination */}
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

