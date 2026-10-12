import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Folder,
  FileText,
  Loader,
  ChevronDown,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBreadcrumb } from '../context/BreadcrumbContext';
import { decryptId, encryptId } from '../utils/encryption';
import projectService from '../services/projectService';
import paperService from '../services/paperService';
import message from '../services/messageService';
import { useTable } from "../services/tableService";
import TablePagination from "../components/TablePagination";
import ColumnFilter from "../components/ColumnFilter";

export default function ImportPapers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userType, user } = useAuth();
  const userUniversityId = user?.universityId;
  const universityId = searchParams.get("universityId");
  const activeUniversityId = userType === "coordinator" ? userUniversityId : universityId;
  const { setBreadcrumb } = useBreadcrumb();

  const encryptedProjectId = searchParams.get("projectId");
  const initialTargetProjectId = encryptedProjectId ? (decryptId(encryptedProjectId) || '') : '';

  const [selectedTargetProjectId, setSelectedTargetProjectId] = useState(initialTargetProjectId);
  const [allProjects, setAllProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [selectedSourceProject, setSelectedSourceProject] = useState('');
  const [allProjectPapers, setAllProjectPapers] = useState([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState([]);
  const [loadingSourcePapers, setLoadingSourcePapers] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  // Set breadcrumb
  useEffect(() => {
    const papersPath = userType === 'admin' ? '/admin/papers' : '/papers';
    const currentPath = userType === 'admin' ? '/admin/import-papers-from-project' : '/import-papers-from-project';
    setBreadcrumb([
      { label: 'Paper Management', path: papersPath, icon: 'FileText' },
      { label: 'Import Papers from Project', path: currentPath, icon: 'Folder' }
    ]);
  }, [userType, setBreadcrumb]);

  // Load all projects for target project dropdown
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoadingProjects(true);
        const projs = await projectService.getAllProjects(activeUniversityId, { pageSize: 0 });
        const projectsData = projs?.items || projs || [];
        setAllProjects(projectsData);
      } catch (err) {
        console.error('Failed to load projects:', err);
        setAllProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    };

    if (activeUniversityId) {
      loadProjects();
    }
  }, [activeUniversityId]);

  // Synchronize URL search params when target project changes
  useEffect(() => {
    if (encryptedProjectId) {
      const decrypted = decryptId(encryptedProjectId);
      if (decrypted && decrypted !== selectedTargetProjectId) {
        setSelectedTargetProjectId(decrypted);
      }
    } else if (!selectedTargetProjectId) {
      setSelectedTargetProjectId('');
    }
  }, [encryptedProjectId]);

  const handleTargetProjectChange = (newProjId) => {
    if (!newProjId) {
      setSelectedTargetProjectId('');
      sessionStorage.removeItem('selectedProjectId');
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('projectId');
        return next;
      });
      setSelectedSourceProject('');
      setAllProjectPapers([]);
      setSelectedPaperIds([]);
      return;
    }

    setSelectedTargetProjectId(newProjId);
    sessionStorage.setItem('selectedProjectId', newProjId);
    const newEncrypted = encryptId(newProjId);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('projectId', newEncrypted);
      return next;
    });
    // Reset source project if it matches new target project
    if (String(selectedSourceProject) === String(newProjId)) {
      setSelectedSourceProject('');
      setAllProjectPapers([]);
      setSelectedPaperIds([]);
    }
  };

  // Filter available source projects (exclude the currently selected target project)
  const sourceProjects = [
    { projectId: 'master', projectName: 'Master Papers', isMaster: true },
    ...allProjects.filter(p => String(p.projectId) !== String(selectedTargetProjectId))
  ];

  // Fetch papers for selected source project
  const fetchPapersForProject = async (projId) => {
    if (!projId) {
      setAllProjectPapers([]);
      setSelectedPaperIds([]);
      return;
    }

    try {
      setLoadingSourcePapers(true);
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
    } finally {
      setLoadingSourcePapers(false);
    }
  };

  useEffect(() => {
    if (selectedSourceProject) {
      fetchPapersForProject(selectedSourceProject);
    } else {
      setAllProjectPapers([]);
      setSelectedPaperIds([]);
    }
  }, [selectedSourceProject]);

  const fetchFn = useCallback(async (params) => {
    if (!selectedSourceProject || allProjectPapers.length === 0) {
      return { items: [], totalCount: 0, page: 1, pageSize: params.pageSize || 10, totalPages: 1 };
    }

    let filtered = [...allProjectPapers];

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

    const page = params.page || 1;
    const pageSize = params.pageSize || 10;
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIdx = (page - 1) * pageSize;
    const items = filtered.slice(startIdx, startIdx + pageSize);

    return { items, totalCount, page, pageSize, totalPages };
  }, [selectedSourceProject, allProjectPapers]);

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
    refreshTable();
  }, [allProjectPapers, refreshTable]);

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
    if (!selectedTargetProjectId) {
      message.error("Please select a target project to import papers into");
      return;
    }
    if (selectedPaperIds.length === 0) {
      message.error("Please select at least one paper to import");
      return;
    }

    setImporting(true);
    try {
      await paperService.importPapers({
        sourcePaperIds: selectedPaperIds,
        targetProjectId: selectedTargetProjectId
      });
      message.success(`Successfully imported ${selectedPaperIds.length} paper(s) into project!`);
      setSelectedPaperIds([]);
      if (selectedSourceProject) {
        fetchPapersForProject(selectedSourceProject);
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
    <div className="min-h-screen bg-transparent w-full max-w-none px-4 py-3 lg:px-8 lg:py-4">
      <div className="w-full space-y-4">
        {/* Standard Page Header */}
        <div className="bg-white px-4 py-3 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Title */}
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                <Folder className="text-teal-700" size={22} />
                Import Papers from Project
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Select a target project to import question papers and section configurations from other projects or master papers.
              </p>
            </div>

            {/* Target Project Dropdown */}
            <div className="relative min-w-[200px] sm:min-w-[260px]">
              {loadingProjects ? (
                <div className="flex items-center gap-2 text-gray-500 text-xs py-2 px-3 bg-gray-50 rounded-xl border border-gray-200">
                  <Loader size={14} className="animate-spin text-teal-700" />
                  <span className="font-semibold">Loading projects...</span>
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedTargetProjectId || ''}
                    onChange={(e) => handleTargetProjectChange(e.target.value)}
                    className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-teal-500 rounded-xl text-xs font-bold text-gray-800 py-2.5 pl-3 pr-8 outline-none appearance-none cursor-pointer shadow-2xs transition-all"
                  >
                    <option value="">-- Select Target Project --</option>
                    {allProjects.map((proj) => (
                      <option key={proj.projectId} value={proj.projectId}>
                        {proj.projectName} (PRJ-{proj.projectId})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Down Below */}
        {!selectedTargetProjectId ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center mx-auto mb-3 shadow-2xs">
              <Folder size={32} />
            </div>
            <h3 className="text-base font-extrabold text-gray-900 mb-1">Select a Target Project</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto font-medium">
              Please select a project from the dropdown above to view and import papers from other projects or master papers into it.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden space-y-0">
            {/* Source Project Controls & Action Bar */}
            <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider shrink-0">
                  Import From:
                </span>
                <div className="relative min-w-[220px]">
                  <select
                    value={selectedSourceProject}
                    onChange={(e) => setSelectedSourceProject(e.target.value)}
                    className="w-full bg-gray-50 hover:bg-gray-100/80 border border-gray-200 focus:border-teal-500 focus:bg-white rounded-xl text-xs font-bold text-gray-800 py-2.5 pl-3 pr-8 outline-none appearance-none cursor-pointer shadow-2xs transition-all"
                  >
                    <option value="">-- Select Source Project / Master --</option>
                    {sourceProjects.map((proj) => (
                      <option key={proj.projectId} value={proj.projectId}>
                        {proj.projectName} {proj.projectId !== 'master' ? `(PRJ-${proj.projectId})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                {selectedPaperIds.length > 0 && (
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider py-2 px-4 rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    {importing ? (
                      <>
                        <Loader size={13} className="animate-spin" />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <>
                        <Folder size={13} />
                        <span>Import {selectedPaperIds.length} Papers</span>
                      </>
                    )}
                  </button>
                )}

                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search papers..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="pl-8 pr-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white w-48 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Papers Table */}
            {!selectedSourceProject ? (
              <div className="p-16 text-center">
                <Folder size={36} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Select a Source Project</p>
                <p className="text-xs font-medium text-gray-500 mt-1">Choose a project or Master Papers above to load available papers for import.</p>
              </div>
            ) : loadingSourcePapers ? (
              <div className="p-16 text-center">
                <Loader size={28} className="animate-spin text-teal-700 mx-auto mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Loading Papers...</p>
              </div>
            ) : allProjectPapers.length === 0 ? (
              <div className="p-16 text-center">
                <FileText size={36} className="mx-auto text-gray-300 mb-2" />
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
                              <div className="font-bold text-gray-900">{paper.paperName}</div>
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
          </div>
        )}
      </div>
    </div>
  );
}