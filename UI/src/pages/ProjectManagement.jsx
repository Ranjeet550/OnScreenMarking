import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import projectService from '../services/projectService';
import sessionService from '../services/sessionService';
import { useTable } from '../services/tableService';
import TablePagination from '../components/TablePagination';
import AddProjectModal from '../components/AddProjectModal';
import ColumnFilter from '../components/ColumnFilter';
import { encryptId } from '../utils/encryption';
import {
  ClipboardList,
  Plus,
  Search,
  Edit2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import message from '../services/messageService';
import { useBreadcrumb } from '../context/BreadcrumbContext';

export default function ProjectManagement() {
  const [searchParams] = useSearchParams();
  const { userType, universityId: userUniversityId } = useAuth();
  const universityIdFromUrl = searchParams.get('universityId');
  const activeUniversityId = userType === 'coordinator' ? userUniversityId : universityIdFromUrl;
  const { setBreadcrumb } = useBreadcrumb();

  useEffect(() => {
    const projectPath = userType === 'admin' ? '/admin/projects' : '/projects';
    setBreadcrumb([
      { label: 'Project Management', path: projectPath, icon: 'ClipboardList' }
    ]);
  }, [userType, setBreadcrumb]);

  // Fetch active sessions for the modal
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await sessionService.getAllSessions({ pageSize: 0 }); // Fetch all
        setSessions(res.items || []);
      } catch (err) {
        console.error("Failed to load sessions", err);
      }
    };
    fetchSessions();
  }, []);

  // Define fetch function for useTable hook
  const fetchFn = useCallback((params) => {
    return projectService.getAllProjects(activeUniversityId, params);
  }, [activeUniversityId]);

  // Centralized hook for table states
  const {
    items: projects,
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

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    projectName: '',
    sessionId: '',
    isActive: true
  });

  const handleEdit = (project) => {
    setFormData({
      projectName: project.projectName,
      sessionId: project.sessionId,
      isActive: project.isActive
    });
    setEditingId(project.projectId);
    setShowForm(true);
  };

  const handleCancel = () => {
    setFormData({ projectName: '', sessionId: '', isActive: true });
    setEditingId(null);
    setShowForm(false);
  };

  const handleProjectSubmit = async (data) => {
    try {
      if (editingId) {
        await projectService.updateProject(editingId, data);
      } else {
        await projectService.createProject({ ...data, universityId: activeUniversityId ? parseInt(activeUniversityId, 10) : 1 });
      }
      message.success(editingId ? 'Project updated successfully!' : 'Project created successfully!');
      refresh();
      handleCancel();
    } catch (err) {
      message.error(err.message || 'Error saving project');
    }
  };

  return (
    <div className="min-h-screen bg-transparent w-full max-w-none px-4 py-3 lg:px-8 lg:py-4">
      <div className="w-full space-y-4">
        <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                Project Management
              </h1>
              <p className="text-xs text-gray-500 mt-1">Manage all evaluation projects in the system</p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500 transition-all w-64">
                <Search size={13} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-gray-800 placeholder-gray-400 font-semibold text-[11px] focus:outline-none"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="text-[10px] font-black uppercase text-gray-400 hover:text-gray-600 transition cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              
              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm hover:shadow shrink-0 cursor-pointer"
              >
                <Plus size={13} />
                <span>{showForm ? 'Cancel' : 'Add Project'}</span>
              </button>
            </div>
          </div>
        </div>

        <AddProjectModal
          isOpen={showForm}
          onClose={handleCancel}
          onSubmit={handleProjectSubmit}
          editingId={editingId}
          initialData={formData}
          sessions={sessions}
        />

        {/* Main List Grid */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading && projects.length === 0 ? (
            <div className="p-12 text-center text-gray-450 font-bold text-xs flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <span>Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="p-16 text-center text-gray-555 leading-relaxed max-w-sm mx-auto space-y-3">
              <ClipboardList className="mx-auto text-gray-400" size={32} />
              <div>
                <h3 className="font-extrabold text-gray-900 text-xs uppercase tracking-wider">No Projects Configured</h3>
                <p className="text-[10px] text-gray-400 mt-1">Create an evaluation project to map papers.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-450 uppercase tracking-widest select-none">
                    <th
                      className="py-2.5 cursor-pointer hover:bg-gray-100 transition-colors group md:px-6 px-4"
                      onClick={() => handleSort('projectName')}
                    >
                      <div className="flex items-center gap-1.5">
                        Project Name {getSortIcon('projectName')}
                        <ColumnFilter columnKey="projectName" currentFilter={filters.projectName} setFilter={setFilter} placeholder="Filter project name..." />
                      </div>
                    </th>
                    <th
                      className="py-2.5 cursor-pointer hover:bg-gray-100 transition-colors group md:px-6 px-4"
                      onClick={() => handleSort('sessionName')}
                    >
                      <div className="flex items-center gap-1.5">
                        Session {getSortIcon('sessionName')}
                        <ColumnFilter columnKey="sessionName" currentFilter={filters.sessionName} setFilter={setFilter} placeholder="Filter session name..." />
                      </div>
                    </th>
                    <th
                      className="py-2.5 text-center cursor-pointer hover:bg-gray-100 transition-colors group md:px-6 px-4"
                      onClick={() => handleSort('isActive')}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        Status {getSortIcon('isActive')}
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
                  {projects.map((project) => (
                    <tr key={project.projectId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-2.5 md:px-6 px-4">
                        <span className="font-extrabold text-gray-900 tracking-tight block text-sm">{project.projectName}</span>
                      </td>
                      <td className="py-2.5 md:px-6 px-4">
                        <span className="font-extrabold text-gray-900 tracking-tight block text-sm">
                          Session: {project.session?.sessionName || 'Unknown Session'}
                        </span>
                      </td>
                      <td className="py-2.5 text-center md:px-6 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-[9px] uppercase tracking-wider border ${project.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${project.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}></span>
                          {project.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap md:px-6 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(project)}
                            className="p-2 bg-gray-50 hover:bg-teal-50 hover:text-teal-700 text-gray-600 rounded-xl border border-gray-200 hover:border-teal-200 transition-all cursor-pointer shadow-sm group"
                            title="Edit Project"
                          >
                            <Edit2 size={14} className="group-hover:scale-110 transition-transform" />
                          </button>
                          <Link
                            to={userType === 'admin'
                              ? `/admin/project-dashboard?projectId=${encryptId(project.projectId)}&tab=papers&statusFilter=sections_missing`
                              : `/project-dashboard?projectId=${encryptId(project.projectId)}&tab=papers&statusFilter=sections_missing`}
                            className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-xl font-bold text-[10px] uppercase tracking-wider border border-teal-100 transition cursor-pointer"
                          >
                            Configure Paper
                          </Link>
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
    </div>
  );
}

