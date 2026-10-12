import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Folder,
  FileText,
  Loader,
  Plus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBreadcrumb } from '../context/BreadcrumbContext';
import { decryptId } from '../utils/encryption';
import projectService from '../services/projectService';
import paperService from '../services/paperService';
import message from '../services/messageService';
import ProjectConfigHeader from '../components/ProjectConfigHeader';
import { useTable } from "../services/tableService";
import TablePagination from "../components/TablePagination";
import ColumnFilter from "../components/ColumnFilter";

export default function ImportPapers({ isTab = false, onSuccess = null, universityIdProp = null, projectIdProp = null }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userType, universityId: userUniversityId } = useAuth();
  const { setBreadcrumb } = useBreadcrumb();

  const encryptedProjectId = searchParams.get("projectId");
  const projectId = projectIdProp || (encryptedProjectId ? decryptId(encryptedProjectId) : null);
  const universityId = universityIdProp || searchParams.get("universityId");
  const activeUniversityId = userType === "coordinator" ? userUniversityId : universityId;

  const [projects, setProjects] = useState([]);
  const [selectedSourceProject, setSelectedSourceProject] = useState('');
  const [activeInnerTab, setActiveInnerTab] = useState('papers-sections'); // Start with Papers & Sections

  // Separate states for each tab
  const [currentProjectPapers, setCurrentProjectPapers] = useState([]); // For Papers & Sections tab
  const [allProjectPapers, setAllProjectPapers] = useState([]); // For Import tab
  const [selectedPaperIds, setSelectedPaperIds] = useState([]);

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingCurrentPapers, setLoadingCurrentPapers] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isTab) {
      const papersPath = userType === 'admin' ? '/admin/papers' : '/papers';
      setBreadcrumb([
        { label: 'Import Papers', path: papersPath, icon: 'Folder' }
      ]);
    }
  }, [userType, isTab, setBreadcrumb]);

  // Load projects
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoadingProjects(true);
        setError(null);
        
        console.log('Loading projects for university ID:', activeUniversityId);
        
        const projs = await projectService.getAllProjects(activeUniversityId, { pageSize: 0 });
        const projectsData = projs?.items || projs || [];
        console.log('Projects loaded:', projectsData);
        
        // Filter out current project and add master option
        const filteredProjects = projectsData.filter(p => String(p.projectId) !== String(projectId));
        
        // Add master papers option at the beginning
        const projectsWithMaster = [
          { projectId: 'master', projectName: 'Master Papers', isMaster: true },
          ...filteredProjects
        ];
        
        console.log('Final projects list:', projectsWithMaster);
        setProjects(projectsWithMaster);
      } catch (err) {
        console.error('Failed to load projects:', err);
        setError("Failed to load projects");
        setProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    };
    
    if (activeUniversityId) {
      loadProjects();
    }
  }, [activeUniversityId, projectId]);

  // Load current project papers for Papers & Sections tab
  useEffect(() => {
    const loadCurrentProjectPapers = async () => {
      if (!projectId) return;
      
      try {
        setLoadingCurrentPapers(true);
        const res = await paperService.getPapers({ projectId, pageSize: 0 });
        const papersData = res.items || res;
        setCurrentProjectPapers(papersData || []);
      } catch (err) {
        console.error('Failed to load current project papers:', err);
        setCurrentProjectPapers([]);
      } finally {
        setLoadingCurrentPapers(false);
      }
    };

    // Only load when we're on Papers & Sections tab or on initial load
    if (projectId && (activeInnerTab === 'papers-sections' || currentProjectPapers.length === 0)) {
      loadCurrentProjectPapers();
    }
  }, [activeInnerTab, projectId, currentProjectPapers.length]);

  // Fetch papers for selected source project (Import tab)
  const fetchPapersForProject = async (projId) => {
    try {
      setError(null);
      let papersData = [];
      if (projId === 'master') {
        const res = await paperService.getPapers({ universityId: activeUniversityId, isMaster: true, pageSize: 0 });
        papersData = res.items || res;
      } else {
        const res = await paperService.getPapers({ projectId: projId, pageSize: 0 });
        papersData = res.items || res;
      }
      setAllProjectPapers(papersData || []);
      setSelectedPaperIds([]);
    } catch (err) {
      setError("Failed to load papers.");
      setAllProjectPapers([]);
    }
  };

  const fetchFn = useCallback(async (params) => {
    let sourceData = [];
    
    // Use different data sources based on active tab
    if (activeInnerTab === 'papers-sections') {
      // Papers & Sections tab - always use current project papers
      sourceData = currentProjectPapers;
    } else {
      // Import tab - only return data if we have a selected source project AND loaded data
      if (!selectedSourceProject || allProjectPapers.length === 0) {
        return { items: [], totalCount: 0, page: 1, pageSize: params.pageSize || 10, totalPages: 1 };
      }
      sourceData = allProjectPapers;
    }

    // If no source data, return empty
    if (!sourceData || sourceData.length === 0) {
      return { items: [], totalCount: 0, page: 1, pageSize: params.pageSize || 10, totalPages: 1 };
    }

    let filtered = [...sourceData];

    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(p =>
        p.paperName?.toLowerCase().includes(q) ||
        p.paperCode?.toLowerCase().includes(q) ||
        p.catchNo?.toLowerCase().includes(q)
      );
    }

    if (params.subjectNames && params.subjectNames.length > 0) {
      filtered = filtered.filter(p => {
        if (!p.subjectNames || p.subjectNames.length === 0) return false;
        return params.subjectNames.some(selectedSub =>
          p.subjectNames.some(paperSub => paperSub.toLowerCase().includes(selectedSub.toLowerCase()))
        );
      });
    }

    if (params.paperName) {
      const q = params.paperName.toLowerCase();
      filtered = filtered.filter(p => p.paperName?.toLowerCase().includes(q));
    }

    if (params.paperCode) {
      const q = params.paperCode.toLowerCase();
      filtered = filtered.filter(p => p.paperCode?.toLowerCase().includes(q));
    }

    // Sort
    if (params.sortField && params.sortOrder) {
      filtered.sort((a, b) => {
        const aVal = a[params.sortField] || '';
        const bVal = b[params.sortField] || '';
        if (params.sortOrder === 'asc') {
          return aVal.toString().localeCompare(bVal.toString());
        } else {
          return bVal.toString().localeCompare(aVal.toString());
        }
      });
    }

    // Pagination
    const page = params.page || 1;
    const pageSize = params.pageSize || 10;
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIdx = (page - 1) * pageSize;
    const items = filtered.slice(startIdx, startIdx + pageSize);

    return { items, totalCount, page, pageSize, totalPages };
  }, [activeInnerTab, currentProjectPapers, selectedSourceProject, allProjectPapers]);

  const {
    items: papers,
    totalCount,
    totalPages,
    page,
    setPage,
    pageSize,
    setPageSize,
    search: tableSearch,
    setSearch: setTableSearch,
    sortField,
    sortOrder,
    handleSort,
    filters,
    setFilter,
    loading: tableLoading,
    refresh: refreshTable
  } = useTable({
    fetchFn,
    initialParams: { pageSize: 10 }
  });

  useEffect(() => {
    // Refresh table when data changes for the active tab
    if (activeInnerTab === 'papers-sections' && currentProjectPapers.length > 0) {
      refreshTable();
    } else if (activeInnerTab === 'import-papers' && allProjectPapers.length > 0) {
      refreshTable();
    }
  }, [currentProjectPapers, allProjectPapers, activeInnerTab, refreshTable]);

  // Clear selected papers when switching tabs
  useEffect(() => {
    setSelectedPaperIds([]);
  }, [activeInnerTab]);

  // Refresh table when switching tabs
  useEffect(() => {
    // Small delay to ensure state has updated
    const timer = setTimeout(() => {
      refreshTable();
    }, 50);
    
    return () => clearTimeout(timer);
  }, [activeInnerTab, refreshTable]);

  useEffect(() => {
    if (selectedSourceProject) {
      fetchPapersForProject(selectedSourceProject);
    }
  }, [selectedSourceProject]);

  const handleSelectAll = () => {
    if (selectedPaperIds.length === papers.length && papers.length > 0) {
      setSelectedPaperIds([]);
    } else {
      setSelectedPaperIds(papers.map(p => p.paperId));
    }
  };

  const handleTogglePaper = (paperId) => {
    setSelectedPaperIds(prev => 
      prev.includes(paperId) 
        ? prev.filter(id => id !== paperId)
        : [...prev, paperId]
    );
  };

  const handleImport = async () => {
    if (selectedPaperIds.length === 0) return;

    setImporting(true);
    try {
      await paperService.importPapers({
        sourcePaperIds: selectedPaperIds,
        targetProjectId: projectId
      });
      message.success(`Successfully imported ${selectedPaperIds.length} papers`);
      
      if (onSuccess) {
        onSuccess();
      } else {
        navigate(-1);
      }
    } catch (err) {
      message.error("Failed to import papers: " + (err.response?.data?.message || err.message));
    } finally {
      setImporting(false);
    }
  };

  const SortHeader = ({ label, field, isCenter = false, hasFilter = false, filterOptions }) => {
    const isSorted = sortField === field;
    return (
      <th onClick={() => handleSort(field)} className={`px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none ${isCenter ? 'text-center' : ''}`}>
        <div className={`flex items-center gap-1 ${isCenter ? 'justify-center' : ''}`}>
          <span>{label}</span>
          <span className="text-[9px] text-gray-400">{isSorted ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
          {hasFilter && (
            <ColumnFilter columnKey={field} currentFilter={filters[field]} setFilter={setFilter} placeholder={`Filter ${label.toLowerCase()}...`} options={filterOptions} />
          )}
        </div>
      </th>
    );
  };

  return (
    <div className={isTab ? 'w-full' : 'min-h-screen bg-gray-50/50 pb-12 w-full'}>
      {!isTab && (
        <div className="bg-white border-b border-gray-200 px-6 lg:px-10 pb-0 pt-6 shadow-sm sticky top-0 z-20">
          <ProjectConfigHeader />
        </div>
      )}

      <div className={isTab ? 'p-6 lg:p-8' : 'px-6 lg:px-10 max-w-[1600px] mx-auto mt-6'}>
        {(!projectId && !isTab) ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
            <FileText size={48} className="mx-auto text-gray-200 mb-4" />
            <h3 className="text-xl font-black text-gray-900 mb-2">Select a Project</h3>
            <p className="text-sm font-semibold text-gray-500">
              Please select a project from the dropdown above to view its papers and sections.
            </p>
          </div>
        ) : (
          <>
            {/* Papers Main Table Area */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* ── TOOLBAR: Tab switcher left | Conditional content right based on active tab ── */}
              <div className="flex items-center border-b border-gray-100 bg-white">
                {/* LEFT: Tab switcher */}
                {projectId && (
                  <div className="flex border-b-0">
                    <button
                      onClick={() => setActiveInnerTab('papers-sections')}
                      className={`flex items-center gap-2 px-4 py-3 text-xs font-extrabold uppercase tracking-wider transition-all border-b-2 ${
                        activeInnerTab === 'papers-sections'
                          ? 'text-teal-700 border-teal-700'
                          : 'text-gray-500 border-transparent hover:text-gray-700'
                      }`}
                    >
                      <FileText size={14} />
                      Papers & Sections
                    </button>
                    <button
                      onClick={() => setActiveInnerTab('import-papers')}
                      className={`flex items-center gap-2 px-4 py-3 text-xs font-extrabold uppercase tracking-wider transition-all border-b-2 ${
                        activeInnerTab === 'import-papers'
                          ? 'text-teal-700 border-teal-700'
                          : 'text-gray-500 border-transparent hover:text-gray-700'
                      }`}
                    >
                      <Folder size={14} />
                      Import from Project
                    </button>
                  </div>
                )}

                {/* DIVIDER */}
                <div className="flex-1" />

                {/* RIGHT: Conditional content based on active tab */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {activeInnerTab === 'papers-sections' ? (
                    <>
                      {/* Papers & Sections Tab: Add Button + Search */}
                      <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold text-white bg-teal-700 hover:bg-teal-800 shadow-sm transition-all whitespace-nowrap">
                        <Plus size={13} />
                        Add Paper
                      </button>
                      
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search papers..."
                          value={tableSearch}
                          onChange={(e) => setTableSearch(e.target.value)}
                          className="pl-8 pr-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white w-44 transition-all shadow-none"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Import Papers Tab: Import Button + Project Dropdown + Search */}
                      {/* Import button (show when papers selected) - LEFT POSITION */}
                      {selectedPaperIds.length > 0 && (
                        <button
                          onClick={handleImport}
                          disabled={importing}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold text-white shadow-sm transition-all whitespace-nowrap ${
                            importing
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-teal-700 hover:bg-teal-800'
                          }`}
                        >
                          {importing ? (
                            <Loader size={13} className="animate-spin" />
                          ) : (
                            <Folder size={13} />
                          )}
                          {importing ? 'Importing...' : `Import ${selectedPaperIds.length} Papers`}
                        </button>
                      )}

                      {/* Project selector - MIDDLE POSITION */}
                      <div className="flex items-center gap-2">
                        
                        <div className="relative">
                          {loadingProjects ? (
                            <div className="flex items-center gap-2 text-gray-500 text-sm p-2">
                              <Loader size={16} className="animate-spin text-teal-700" />
                              <span className="font-semibold">Loading...</span>
                            </div>
                          ) : projects.length === 0 ? (
                            <div className="text-sm text-amber-700 font-semibold">No projects found</div>
                          ) : (
                            <select
                              value={selectedSourceProject}
                              onChange={(e) => setSelectedSourceProject(e.target.value)}
                              className="bg-white border border-gray-200 hover:border-gray-300 focus:border-teal-500 rounded-lg text-sm font-bold text-gray-800 px-3 py-2 pr-8 min-w-[200px] outline-none appearance-none cursor-pointer"
                            >
                              <option value="" disabled>-- Select a project --</option>
                              {projects.map((proj) => (
                                <option key={proj.projectId} value={proj.projectId}>
                                  {proj.projectName} {proj.projectId !== 'master' && `(PRJ-${proj.projectId})`}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>

                      {/* Search - RIGHT POSITION */}
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search papers..."
                          value={tableSearch}
                          onChange={(e) => setTableSearch(e.target.value)}
                          className="pl-8 pr-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white w-44 transition-all shadow-none"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Content based on active tab */}
              {activeInnerTab === 'papers-sections' ? (
                <>
                  {/* PAPERS & SECTIONS TAB - Show current project's papers */}
                  {loadingCurrentPapers ? (
                    <div className="p-16 text-center">
                      <div className="animate-spin w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Loading Current Project Papers...</p>
                    </div>
                  ) : currentProjectPapers.length === 0 ? (
                    <div className="p-16 text-center">
                      <FileText size={32} className="mx-auto text-gray-200 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">No Papers Found in Current Project</p>
                      <p className="text-xs font-medium text-gray-500 mt-2">Add papers to see them here</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                          <tr>
                            <th className="px-5 py-3.5 w-12 text-center border-b border-gray-100">
                              <input 
                                type="checkbox" 
                                checked={papers.length > 0 && selectedPaperIds.length === papers.length} 
                                onChange={handleSelectAll} 
                                className="rounded border-gray-300 text-teal-700 focus:ring-teal-500 cursor-pointer w-4 h-4"
                              />
                            </th>
                            <SortHeader label="Paper Details" field="paperName" hasFilter={true} />
                            <SortHeader label="Paper Code" field="paperCode" hasFilter={true} />
                            <SortHeader label="Subjects" field="subjectNames" hasFilter={true} />
                            <SortHeader label="Max Marks" field="maxMarks" />
                            <th className="px-5 py-3.5 text-center border-b border-gray-100">Sections</th>
                            <th className="px-5 py-3.5 text-center border-b border-gray-100">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-700">
                          {papers.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-5 py-16 text-center">
                                <FileText size={32} className="mx-auto text-gray-200 mb-2" />
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                  {tableSearch || Object.keys(filters).some(k => filters[k]) ? 'No papers match your search/filter criteria' : 'No papers found'}
                                </p>
                              </td>
                            </tr>
                          ) : (
                            papers.map(paper => {
                              const isSelected = selectedPaperIds.includes(paper.paperId);
                              return (
                                <tr key={paper.paperId} className={`hover:bg-gray-50/50 transition-colors ${isSelected ? 'bg-teal-50/30' : ''}`}>
                                  <td className="px-5 py-2.5 text-center">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected}
                                      onChange={() => handleTogglePaper(paper.paperId)}
                                      className="rounded border-gray-300 text-teal-700 focus:ring-teal-500 cursor-pointer w-4 h-4"
                                    />
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <div className="font-bold text-gray-900">
                                      {paper.paperName}
                                    </div>
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <span className="font-mono bg-gray-100 text-gray-600 font-bold px-2 py-1 rounded-md text-[11px] uppercase tracking-wider">
                                      {paper.paperCode}
                                    </span>
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <span className="text-gray-600 font-bold text-xs">
                                      {paper.subjectNames?.join(', ') || '—'}
                                    </span>
                                  </td>
                                  <td className="px-5 py-2.5 text-center font-bold text-gray-700">
                                    {paper.maxMarks}
                                  </td>
                                  <td className="px-5 py-2.5 text-center font-bold text-gray-700">
                                    {paper.sections?.length || 0}
                                  </td>
                                  <td className="px-5 py-2.5 text-center">
                                    <span className="text-xs text-gray-500">Edit | View</span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
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
                </>
              ) : (
                <>
                  {/* IMPORT FROM PROJECT TAB - Show papers from selected source project */}
                  {!selectedSourceProject ? (
                    <div className="p-16 text-center">
                      <FileText size={32} className="mx-auto text-gray-200 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Select a source project to view papers</p>
                      <p className="text-xs font-medium text-gray-500 mt-2">Choose a project from the dropdown above to see available papers for import</p>
                    </div>
                  ) : tableLoading && allProjectPapers.length === 0 ? (
                    <div className="p-16 text-center">
                      <div className="animate-spin w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Loading Papers...</p>
                    </div>
                  ) : allProjectPapers.length === 0 ? (
                    <div className="p-16 text-center">
                      <FileText size={32} className="mx-auto text-gray-200 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">No Papers Found in Selected Project</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                          <tr>
                            <th className="px-5 py-3.5 w-12 text-center border-b border-gray-100">
                              <input 
                                type="checkbox" 
                                checked={papers.length > 0 && selectedPaperIds.length === papers.length} 
                                onChange={handleSelectAll} 
                                className="rounded border-gray-300 text-teal-700 focus:ring-teal-500 cursor-pointer w-4 h-4"
                              />
                            </th>
                            <SortHeader label="Paper Details" field="paperName" hasFilter={true} />
                            <SortHeader label="Paper Code" field="paperCode" hasFilter={true} />
                            <SortHeader label="Subjects" field="subjectNames" hasFilter={true} />
                            <SortHeader label="Max Marks" field="maxMarks" />
                            <th className="px-5 py-3.5 text-center border-b border-gray-100">Sections</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-700">
                          {papers.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-5 py-16 text-center">
                                <FileText size={32} className="mx-auto text-gray-200 mb-2" />
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                  {tableSearch || Object.keys(filters).some(k => filters[k]) ? 'No papers match your search/filter criteria' : 'No papers found in selected project'}
                                </p>
                              </td>
                            </tr>
                          ) : (
                            papers.map(paper => {
                              const isSelected = selectedPaperIds.includes(paper.paperId);
                              return (
                                <tr key={paper.paperId} className={`hover:bg-gray-50/50 transition-colors ${isSelected ? 'bg-teal-50/30' : ''}`}>
                                  <td className="px-5 py-2.5 text-center">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected}
                                      onChange={() => handleTogglePaper(paper.paperId)}
                                      className="rounded border-gray-300 text-teal-700 focus:ring-teal-500 cursor-pointer w-4 h-4"
                                    />
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <div className="font-bold text-gray-900">
                                      {paper.paperName}
                                    </div>
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <span className="font-mono bg-gray-100 text-gray-600 font-bold px-2 py-1 rounded-md text-[11px] uppercase tracking-wider">
                                      {paper.paperCode}
                                    </span>
                                  </td>
                                  <td className="px-5 py-2.5">
                                    <span className="text-gray-600 font-bold text-xs">
                                      {paper.subjectNames?.join(', ') || '—'}
                                    </span>
                                  </td>
                                  <td className="px-5 py-2.5 text-center font-bold text-gray-700">
                                    {paper.maxMarks}
                                  </td>
                                  <td className="px-5 py-2.5 text-center font-bold text-gray-700">
                                    {paper.sections?.length || 0}
                                  </td>
                                </tr>
                              );
                            })
                          )}
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
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}