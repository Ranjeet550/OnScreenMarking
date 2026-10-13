import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Layers, 
  FileText, 
  Users, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  BookOpen,
  Zap,
  Search,
  Sliders,
  X
} from 'lucide-react';
import { useTable } from '../services/tableService';
import TablePagination from '../components/TablePagination';
import { useAuth } from '../context/AuthContext';
import { useBreadcrumb } from '../context/BreadcrumbContext';
import { decryptId, encryptId } from '../utils/encryption';
import apiCall from '../services/api';
import ProjectConfigHeader from '../components/ProjectConfigHeader';
import ColumnFilter from '../components/ColumnFilter';
import message from '../services/messageService';
import PapersManagement from './PapersManagement';
import ScriptAllocation from './ScriptAllocation';
import Attendance from './Attendance';

export default function ProjectDashboard() {
  const [searchParams] = useSearchParams();
  const encryptedProjectId = searchParams.get('projectId');
  const projectId = encryptedProjectId ? decryptId(encryptedProjectId) : null;
  
  const { userType, universityId: userUniversityId } = useAuth();
  const { setBreadcrumb } = useBreadcrumb();
  const activeUniversityId = userUniversityId;

  const [project, setProject] = useState(null);
  const [stats, setStats] = useState({
    papersCount: 0,
    totalScripts: 0,
    pendingScripts: 0,
    allocatedScripts: 0,
    completedScripts: 0,
    unconfiguredPapersCount: 0,
    completePercentage: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Define fetch function for useTable table service
  const fetchFn = useCallback((params) => {
    if (projectId) {
      const searchVal = params.search || '';
      const pageVal = params.page || 1;
      const pageSizeVal = params.pageSize || 10;
      const sortFieldVal = params.sortField || '';
      const sortOrderVal = params.sortOrder || '';
      const statusFilterVal = params.statusFilter || '';
      return apiCall(`/papers/dashboard-stats?projectId=${projectId}&page=${pageVal}&pageSize=${pageSizeVal}&search=${searchVal}&sortField=${sortFieldVal}&sortOrder=${sortOrderVal}&statusFilter=${statusFilterVal}`);
    }
    return Promise.resolve({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 1 });
  }, [projectId]);

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
    filters,
    setFilter,
    sortField,
    sortOrder,
    handleSort,
    loading: tableLoading,
    refresh: refreshTable
  } = useTable({
    fetchFn,
    initialParams: { pageSize: 10 }
  });




  // Bulk Actions State
  const [selectedPaperIds, setSelectedPaperIds] = useState([]);
  const [isBulkAutoAllocating, setIsBulkAutoAllocating] = useState(false);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedPaperIds(papers.map(p => p.paperId));
    } else {
      setSelectedPaperIds([]);
    }
  };

  const handleSelectPaper = (paperId) => {
    setSelectedPaperIds(prev => 
      prev.includes(paperId) 
        ? prev.filter(id => id !== paperId)
        : [...prev, paperId]
    );
  };

  const handleAutoAllocateProject = async () => {
    setIsBulkAutoAllocating(true);
    try {
      const res = await apiCall(`/allocation/project/${projectId}/auto-allocate`, { method: 'POST' });
      message.success(res.message || "Project auto-allocated successfully");
      refreshTable();
    } catch (err) {
      message.error("Error: " + (err.message || "Failed to auto-allocate project"));
    } finally {
      setIsBulkAutoAllocating(false);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedExaminerIds.length === 0) {
      alert("Please select at least one examiner.");
      return;
    }
    setIsSubmittingBulkAssign(true);
    try {
      const res = await apiCall('/paperexaminers/bulk-assign', {
        method: 'POST',
        body: {
          paperIds: selectedPaperIds,
          examinerIds: selectedExaminerIds
        }
      });
      alert(res.message);
      setIsBulkAssignModalOpen(false);
      setSelectedExaminerIds([]);
      setSelectedPaperIds([]);
      refreshTable();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmittingBulkAssign(false);
    }
  };

  const SortHeader = ({ label, field, isCenter = false, hasFilter = false, className = '' }) => {
    const isSorted = sortField === field;
    return (
      <th 
        onClick={() => handleSort(field)}
        className={`px-3 py-3 cursor-pointer hover:bg-gray-100/80 transition-colors select-none group/header ${isCenter ? 'text-center' : ''} ${className}`}
      >
        <div className={`flex items-center gap-1 ${isCenter ? 'justify-center' : ''}`}>
          <span className="whitespace-nowrap">{label}</span>
          <span className="text-[9px] text-gray-400 group-hover/header:text-gray-600 transition-colors">
            {isSorted ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
          </span>
          {hasFilter && (
            <ColumnFilter columnKey={field} currentFilter={filters[field]} setFilter={setFilter} placeholder={`Filter ${label.toLowerCase()}...`} />
          )}
        </div>
      </th>
    );
  };

  const activeTab = searchParams.get('tab') || 'project-dashboard';

  useEffect(() => {
    let tabLabel = 'Project Stats Dashboard';
    let tabIcon = 'Layers';
    if (activeTab === 'papers') { tabLabel = 'Papers & Sections'; tabIcon = 'FileText'; }
    else if (activeTab === 'allocations') { tabLabel = 'Script Allocations'; tabIcon = 'Zap'; }
    else if (activeTab === 'attendance') { tabLabel = 'Attendance & Logs'; tabIcon = 'Zap'; }

    const crumbs = [
      { label: 'Coordinator Dashboard', path: '/coordinator/dashboard', icon: 'LayoutDashboard' },
      { label: 'Project Dashboard', path: `/project-dashboard?projectId=${encryptedProjectId}`, icon: 'Layers' }
    ];
    if (activeTab !== 'project-dashboard') {
      crumbs.push({ label: tabLabel, path: `/project-dashboard?projectId=${encryptedProjectId}&tab=${activeTab}`, icon: tabIcon });
    }
    setBreadcrumb(crumbs);
  }, [encryptedProjectId, activeTab, setBreadcrumb]);

  useEffect(() => {
    if (projectId) {
      fetchProjectStats();
    } else {
      setError(null);
      setLoading(false);
    }
  }, [projectId]);

  const fetchProjectStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const projStats = await apiCall(`/stats/project-counts/${projectId}`);
      
      setProject({
        projectId: projStats.projectId,
        projectName: projStats.projectName,
        description: projStats.description
      });

      setStats({
        papersCount: projStats.papersCount,
        totalScripts: projStats.totalScripts,
        pendingScripts: projStats.pendingScripts,
        allocatedScripts: projStats.allocatedScripts,
        completedScripts: projStats.completedScripts,
        unconfiguredPapersCount: projStats.unconfiguredPapersCount || 0,
        completePercentage: projStats.totalScripts > 0 ? Math.round((projStats.completedScripts / projStats.totalScripts) * 100) : 0
      });
    } catch (err) {
      console.error("Failed to load project dashboard stats:", err);
      setError(err.message || "Failed to load project details");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-teal-600 border-t-transparent"></div>
        <p className="text-gray-500 font-bold text-xs uppercase tracking-wider animate-pulse">Aggregating Project Analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-4 md:px-6 px-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-red-150 text-center p-4 md:p-8">
          <AlertCircle size={40} className="mx-auto text-red-500 mb-4 animate-bounce" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Error Loading Dashboard</h2>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <Link 
            to="/coordinator/dashboard"
            className="inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs uppercase tracking-wider py-3 rounded-xl transition md:px-6 px-4"
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }



  const handleCardClick = (filterVal) => {
    if (filters.statusFilter === filterVal) {
      setFilter('statusFilter', ''); // toggle off
    } else {
      setFilter('statusFilter', filterVal);
    }
  };

  return (
    <div className="min-h-screen bg-transparent w-full max-w-none px-4 py-3 lg:px-8 lg:py-4">
      <div className="w-full space-y-4">
        
        {/* Unified Card Header */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <ProjectConfigHeader 
            completePercentage={stats?.completePercentage || 0}
            initialProjectName={project?.projectName}
            titleBadge={activeTab === 'allocations' ? 'Allocation' : null}
            title={
              activeTab === 'papers' ? "Papers & Sections Management" :
              activeTab === 'allocations' ? "Script Allocation" :
              activeTab === 'attendance' ? "Attendance & Logs" :
              "Project Stats Dashboard"
            }
            subtitle={activeTab === 'allocations' ? 'Allocate answer scripts to examiners' : null}
            titleIcon={
              activeTab === 'papers' ? <FileText size={18} /> :
              (activeTab === 'allocations' || activeTab === 'attendance') ? <Zap size={18} /> :
              <Layers size={18} />
            }
          />
        </div>

        {!projectId ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
            <Layers size={48} className="mx-auto text-gray-200 mb-4" />
            <h3 className="text-xl font-black text-gray-900 mb-2">Select a Project</h3>
            <p className="text-sm font-semibold text-gray-500">
              Please select a project from the dropdown above to view its dashboard.
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'project-dashboard' && (
              <>
                {/* Stats Banner */}
                <div className="grid lg:grid-cols-6 gap-3 w-full grid-cols-1 md:grid-cols-2">
            
            {/* Total Papers */}
            <div 
              onClick={() => handleCardClick('')}
              className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 transition-all duration-200 cursor-pointer hover:bg-gray-50 flex flex-col justify-between gap-2 ${
                !filters.statusFilter ? 'bg-teal-50/50 shadow-[inset_0_-2px_0_0_#3b82f6]' : ''
              }`}
            >
          <div className="flex items-start justify-between w-full">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-0.5"> Papers</span>
              <h3 className="text-xl font-black text-gray-900">{stats.papersCount}</h3>
            </div>
            <div className="p-1.5 bg-teal-50 rounded-xl text-teal-700"><FileText size={14} /></div>
          </div>
          
          {(stats.papersCount === 0 || stats.unconfiguredPapersCount > 0) && (
            <Link 
              to={userType === 'admin' 
                ? `/admin/papers?projectId=${encryptedProjectId}` 
                : `/papers?projectId=${encryptedProjectId}`}
              onClick={(e) => e.stopPropagation()}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1 mt-1 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
            >
              <Layers size={12} />
              Configure Sections & Papers
            </Link>
          )}
        </div>

        {/* Total Scripts */}
        <div 
          onClick={() => handleCardClick('')}
          className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 transition-all duration-200 cursor-pointer hover:bg-gray-50 flex items-center justify-between gap-2 ${
            !filters.statusFilter ? 'bg-teal-50/50 shadow-[inset_0_-2px_0_0_#3b82f6]' : ''
          }`}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-0.5">Total Scripts</span>
            <h3 className="text-xl font-black text-gray-900">{stats.totalScripts}</h3>
          </div>
          <div className="p-1.5 bg-gray-100 rounded-xl text-gray-600"><BookOpen size={14} /></div>
        </div>

        {/* Pending Allocation */}
        <div 
          onClick={() => handleCardClick('pending')}
          className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 transition-all duration-200 cursor-pointer hover:bg-amber-50/30 flex flex-col justify-between gap-2 ${
            filters.statusFilter === 'pending' ? 'bg-amber-50 shadow-[inset_0_-2px_0_0_#f59e0b]' : ''
          }`}
        >
          <div className="flex items-start justify-between w-full">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-0.5">Pending Assign</span>
              <h3 className="text-xl font-black text-amber-600">{stats.pendingScripts}</h3>
            </div>
            <div className="p-1.5 bg-amber-50 rounded-xl text-amber-600"><AlertCircle size={14} /></div>
          </div>
          
          {stats.pendingScripts > 0 && (
            <Link 
              to={userType === 'admin' 
                ? `/admin/allocate-scripts?projectId=${encryptedProjectId}` 
                : `/allocate-scripts?projectId=${encryptedProjectId}`}
              onClick={(e) => e.stopPropagation()}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1 mt-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
            >
              <Zap size={12} />
              Allocate Scripts
            </Link>
          )}
        </div>

        {/* In Progress */}
        <div 
          onClick={() => handleCardClick('marking')}
          className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 transition-all duration-200 cursor-pointer hover:bg-teal-50/30 flex flex-col justify-between gap-2 ${
            filters.statusFilter === 'marking' ? 'bg-teal-50 shadow-[inset_0_-2px_0_0_#3b82f6]' : ''
          }`}
        >
          <div className="flex items-start justify-between w-full">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-0.5">In Marking</span>
              <h3 className="text-xl font-black text-teal-700">{stats.allocatedScripts}</h3>
            </div>
            <div className="p-1.5 bg-teal-50 rounded-xl text-teal-700"><Clock size={14} /></div>
          </div>

          <Link 
            to={userType === 'admin' 
              ? `/admin/deallocate-scripts?projectId=${encryptedProjectId}` 
              : `/deallocate-scripts?projectId=${encryptedProjectId}`}
            onClick={(e) => e.stopPropagation()}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1 mt-1 bg-teal-100 hover:bg-teal-200 text-teal-800 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
          >
            <Sliders size={12} />
            Deallocate & Overwrite
          </Link>
        </div>

        {/* Completed */}
        <div 
          onClick={() => handleCardClick('completed')}
          className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 transition-all duration-200 cursor-pointer hover:bg-emerald-50/30 flex items-center justify-between gap-2 ${
            filters.statusFilter === 'completed' ? 'bg-emerald-50 shadow-[inset_0_-2px_0_0_#10b981]' : ''
          }`}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-0.5">Fully </span>
            <h3 className="text-xl font-black text-emerald-600">{stats.completedScripts}</h3>
          </div>
          <div className="p-1.5 bg-emerald-50 rounded-xl text-emerald-600"><CheckCircle size={14} /></div>
        </div>

        {/* Unconfigured Sections */}
        <div 
          onClick={() => handleCardClick('unconfigured')}
          className={`bg-white rounded-xl border border-gray-100 shadow-sm p-3 transition-all duration-200 cursor-pointer hover:bg-rose-50/30 flex items-center justify-between gap-2 ${
            filters.statusFilter === 'unconfigured' ? 'bg-rose-50 shadow-[inset_0_-2px_0_0_#f43f5e]' : ''
          }`}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-0.5">Unconfigured</span>
            <h3 className="text-xl font-black text-rose-600">{stats.unconfiguredPapersCount}</h3>
          </div>
          <div className="p-1.5 bg-rose-50 rounded-xl text-rose-600"><Layers size={14} /></div>
        </div>

      </div>



      {/* Analytics Tabs and Mappings */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* LEFT COMPONENT - Papers & Mapped Details */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-gray-50/40">
              <div>
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-1.5">
                  <FileText size={15} className="text-teal-700" />
                  <span> Sections & Papers</span>
                  {filters.statusFilter && (
                    <span className="ml-2 bg-teal-50 px-2.5 py-0.5 rounded-md text-[9px] font-black text-teal-700 uppercase tracking-wide border border-teal-200">
                      Filtered: {filters.statusFilter}
                    </span>
                  )}
                </h3>
                <p className="text-[10px] text-gray-500">Section configurations, paper code, max marks, and map progress</p>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                {selectedPaperIds.length > 0 && (
                  <button 
                    onClick={() => setIsBulkAssignModalOpen(true)}
                    className="px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white text-[10px] font-bold uppercase tracking-wider rounded-md shadow-sm transition-all whitespace-nowrap"
                  >
                    Bulk Assign ({selectedPaperIds.length})
                  </button>
                )}
                
                {stats.pendingScripts > 0 && (
                  <button
                    onClick={handleAutoAllocateProject}
                    disabled={isBulkAutoAllocating}
                    className="px-3 py-2 bg-teal-700 hover:bg-teal-800 text-white text-[10px] font-bold uppercase tracking-wider rounded-md shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Zap size={12} className={isBulkAutoAllocating ? "animate-pulse" : ""} />
                    {isBulkAutoAllocating ? "Allocating..." : "Auto-Allocate All"}
                  </button>
                )}

                {/* Search input */}
                <div className="relative flex items-center bg-white px-3 py-2 rounded-xl border border-gray-200 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100 shadow-sm w-full sm:w-64 min-w-[200px] transition-all">
                  <Search size={14} className="text-gray-400 shrink-0 mr-2" />
                  <input
                    type="text"
                    placeholder="Search papers by name/code..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-transparent text-gray-800 placeholder-gray-400 font-medium text-xs focus:outline-none"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600 ml-1">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {tableLoading && papers.length === 0 ? (
              <div className="p-12 text-center text-gray-400 font-bold text-xs flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                <span>Fetching papers list...</span>
              </div>
            ) : papers.length === 0 ? (
              <div className="p-16 text-center text-gray-405">
                <FileText size={36} className="mx-auto text-gray-200 mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider">No Papers </p>
                <p className="text-[10px] mt-0.5">Please add and configure papers for this project.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left">
                    <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                      <tr>
                        <th className="px-3 py-3 w-8 text-center">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 text-teal-700 focus:ring-teal-500 cursor-pointer"
                            checked={papers.length > 0 && selectedPaperIds.length === papers.length}
                            onChange={handleSelectAll}
                          />
                        </th>
                        <SortHeader label="Code & Name" field="paperCode" hasFilter={true} className="min-w-[130px]" />
                        <SortHeader label="Subject" field="subjectName" hasFilter={true} className="min-w-[90px]" />
                        <SortHeader label="Catch No" field="catchNo" isCenter={true} className="min-w-[70px]" />
                        <SortHeader label="Total" field="totalScripts" isCenter={true} className="min-w-[50px]" />
                        <SortHeader label="Pending" field="pendingScripts" isCenter={true} className="min-w-[50px]" />
                        <SortHeader label="Allocated" field="allocatedScripts" isCenter={true} className="min-w-[55px]" />
                        <SortHeader label="Completed" field="completedScripts" isCenter={true} className="min-w-[55px]" />
                        <th className="px-2.5 py-3 text-center min-w-[90px]">Stage</th>
                        <th className="sticky right-0 z-20 bg-gray-50 px-3 py-3 text-center w-28 min-w-[110px] shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-l border-gray-200/80">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-700">
                      {papers.map((paper) => {
                        // Determine current pipeline stage
                        let currentStage = 1;
                        let stageText = "1. Config Sections";
                        let stageColor = "bg-rose-50 text-rose-700 border-rose-200";

                        const isConfigured = paper.isSectionsConfigured && paper.configuredMarks === paper.maxMarks;
                        const hasExaminers = (paper.expertsCount || 0) > 0;

                        if (isConfigured) {
                          if (!hasExaminers) {
                            currentStage = 2;
                            stageText = "2. Assign Examiners";
                            stageColor = "bg-amber-50 text-amber-700 border-amber-200";
                          } else if (paper.pendingScripts > 0) {
                            currentStage = 3;
                            stageText = "3. Allocate Scripts";
                            stageColor = "bg-teal-50 text-teal-700 border-teal-200";
                          } else if (paper.totalScripts > 0) {
                            if (paper.completedScripts === paper.totalScripts) {
                              currentStage = 5;
                              stageText = "5. Done";
                            } else {
                              currentStage = 4;
                              stageText = "4. In Progress";
                            }
                            stageColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                          } else {
                            currentStage = 3;
                            stageText = "Awaiting Scripts";
                            stageColor = "bg-gray-50 text-gray-600 border-gray-200";
                          }
                        }

                        let stageTooltip = stageText;
                        if (currentStage === 1) {
                          if (!paper.isSectionsConfigured) {
                            stageTooltip = "Sections not created yet. Click 'Sections' to configure.";
                          } else if (paper.configuredMarks !== paper.maxMarks) {
                            stageTooltip = `Section marks (${paper.configuredMarks || 0}) do not match Paper Max Marks (${paper.maxMarks}). Click 'Sections' to balance marks.`;
                          }
                        } else if (currentStage === 2) {
                          stageTooltip = "Sections complete. Next: Assign Examiners to this paper.";
                        } else if (currentStage === 3) {
                          stageTooltip = "Examiners assigned. Ready to allocate pending scripts.";
                        }

                        const isAllocateDisabled = currentStage < 3 || paper.pendingScripts <= 0;
                        const isAssignDisabled = currentStage < 2;

                        return (
                          <tr key={paper.paperId} className={`group transition ${selectedPaperIds.includes(paper.paperId) ? 'bg-teal-50/40' : 'hover:bg-gray-50/60'}`}>
                            <td className="px-3 py-2.5 text-center">
                              <input 
                                type="checkbox" 
                                className="rounded border-gray-300 text-teal-700 focus:ring-teal-500 cursor-pointer"
                                checked={selectedPaperIds.includes(paper.paperId)}
                                onChange={() => handleSelectPaper(paper.paperId)}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-gray-900 font-extrabold">{paper.paperCode}</span>
                              <span className="text-sm text-gray-800 block font-semibold mt-0.5 line-clamp-1">{paper.paperName}</span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 font-medium">
                              <span className="line-clamp-1">{paper.subjectName}</span>
                            </td>
                            <td className="px-2 py-2.5 text-center text-gray-600 font-mono text-[11px]">{paper.catchNo || 'N/A'}</td>
                            <td className="px-2 py-2.5 text-center text-gray-900">{paper.totalScripts}</td>
                            <td className="px-2 py-2.5 text-center text-amber-600">{paper.pendingScripts}</td>
                            <td className="px-2 py-2.5 text-center text-teal-700">{paper.allocatedScripts}</td>
                            <td className="px-2 py-2.5 text-center text-emerald-600">{paper.completedScripts}</td>
                            <td className="px-2 py-2.5 text-center">
                              <span 
                                className={`inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-bold border whitespace-nowrap cursor-help ${stageColor}`}
                                title={stageTooltip}
                              >
                                {stageText}
                              </span>
                            </td>
                            <td className={`sticky right-0 z-10 px-3 py-2.5 text-center whitespace-nowrap w-28 min-w-[110px] shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] border-l border-gray-100 ${selectedPaperIds.includes(paper.paperId) ? 'bg-[#f4f8fc]' : 'bg-white group-hover:bg-gray-50'}`}>
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Allocate Scripts Button */}
                                <div className="relative group/tooltip inline-block">
                                  {!isAllocateDisabled ? (
                                    <Link 
                                      to={userType === 'admin'
                                        ? `/admin/allocate-scripts?projectId=${encryptedProjectId}&paperId=${paper.paperId}`
                                        : `/allocate-scripts?projectId=${encryptedProjectId}&paperId=${paper.paperId}`}
                                      title="Allocate Scripts: Allocate pending scripts to examiners"
                                      className="p-1.5 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-lg transition-all block shadow-2xs"
                                    >
                                      <Zap size={14} />
                                    </Link>
                                  ) : (
                                    <button
                                      disabled
                                      className="p-1.5 text-gray-300 bg-gray-50 border border-gray-200/60 rounded-lg cursor-not-allowed block shadow-2xs"
                                      title={currentStage < 3 ? "Allocate Scripts: Requires sections & assigned examiners" : "Allocate Scripts: No pending scripts"}
                                    >
                                      <Zap size={14} />
                                    </button>
                                  )}
                                  <div className="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-[10px] rounded-lg shadow-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all whitespace-nowrap z-50 pointer-events-none text-left">
                                    <div className="font-bold text-gray-100 flex items-center gap-1">
                                      <Zap size={10} className="text-teal-400" /> Allocate Scripts
                                    </div>
                                    <div className="text-[9px] text-gray-300 font-normal mt-0.5">
                                      {!isAllocateDisabled
                                        ? (paper.pendingScripts > 0 ? `Allocate ${paper.pendingScripts} pending script${paper.pendingScripts > 1 ? 's' : ''}` : "Allocate scripts to examiners")
                                        : (currentStage < 3 ? "Complete previous stages first" : "No pending scripts to allocate")}
                                    </div>
                                    <div className="absolute top-full right-3 border-4 border-transparent border-t-gray-900"></div>
                                  </div>
                                </div>

                                {/* Configure Sections Button */}
                                <div className="relative group/tooltip inline-block">
                                  <Link 
                                    to={userType === 'admin'
                                      ? `/admin/section-config?projectId=${encryptedProjectId}&subjectId=${encryptId(paper.subjectId || 0)}&paperId=${encryptId(paper.paperId)}&from=papers`
                                      : `/section-config?projectId=${encryptedProjectId}&subjectId=${encryptId(paper.subjectId || 0)}&paperId=${encryptId(paper.paperId)}&from=papers`}
                                    title={!isConfigured ? 'Configure Sections: Create question sections & set marks' : 'Edit Sections: View/modify section configuration'}
                                    className="p-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg transition-all block shadow-2xs"
                                  >
                                    <Layers size={14} />
                                  </Link>
                                  <div className="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-[10px] rounded-lg shadow-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all whitespace-nowrap z-50 pointer-events-none text-left">
                                    <div className="font-bold text-gray-100 flex items-center gap-1">
                                      <Layers size={10} className="text-indigo-400" /> {!isConfigured ? "Configure Sections" : "Edit Sections"}
                                    </div>
                                    <div className="text-[9px] text-gray-300 font-normal mt-0.5">
                                      {!isConfigured
                                        ? (!paper.isSectionsConfigured ? "Create sections & set max marks" : `Balance marks: ${paper.configuredMarks}/${paper.maxMarks}`)
                                        : `Sections configured (${paper.configuredMarks} marks)`}
                                    </div>
                                    <div className="absolute top-full right-3 border-4 border-transparent border-t-gray-900"></div>
                                  </div>
                                </div>
                                
                                {/* Assign Examiners Button */}
                                <div className="relative group/tooltip inline-block">
                                  {!isAssignDisabled ? (
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        window.location.href = userType === 'admin' 
                                          ? `/admin/papers?projectId=${encryptedProjectId}&action=assign&paperId=${paper.paperId}`
                                          : `/papers?projectId=${encryptedProjectId}&action=assign&paperId=${paper.paperId}`;
                                      }}
                                      title="Assign Examiners: Assign examiners to evaluate scripts"
                                      className="p-1.5 text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200/80 rounded-lg transition-all block shadow-2xs cursor-pointer"
                                    >
                                      <Users size={14} />
                                    </button>
                                  ) : (
                                    <button
                                      disabled
                                      className="p-1.5 text-gray-300 bg-gray-50 border border-gray-200/60 rounded-lg cursor-not-allowed block shadow-2xs"
                                      title="Assign Examiners: Configure sections first"
                                    >
                                      <Users size={14} />
                                    </button>
                                  )}
                                  <div className="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-[10px] rounded-lg shadow-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all whitespace-nowrap z-50 pointer-events-none text-left">
                                    <div className="font-bold text-gray-100 flex items-center gap-1">
                                      <Users size={10} className="text-orange-400" /> Assign Examiners
                                    </div>
                                    <div className="text-[9px] text-gray-300 font-normal mt-0.5">
                                      {!isAssignDisabled
                                        ? ((paper.expertsCount || 0) > 0 ? `${paper.expertsCount} examiner${paper.expertsCount > 1 ? 's' : ''} assigned` : "Assign examiners to paper")
                                        : "Configure sections first"}
                                    </div>
                                    <div className="absolute top-full right-3 border-4 border-transparent border-t-gray-900"></div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Standard Centralized Table Pagination (outside overflow-x-auto) */}
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  totalCount={totalCount}
                  pageSize={pageSize}
                  setPage={setPage}
                  setPageSize={setPageSize}
                />
              </>
            )}
          </div>
        </div>
      </div>
              </>
            )}

            {activeTab === 'papers' && <PapersManagement isTab={true} />}
            {activeTab === 'allocations' && <ScriptAllocation isTab={true} />}
            {activeTab === 'attendance' && <Attendance isTab={true} />}
          </>
        )}
      </div>
    </div>
  );
}
