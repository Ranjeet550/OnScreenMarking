import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { 
  FileText, Plus, Edit2, UserPlus, X, Search, CheckCircle2, Trash2, 
  ChevronRight, ChevronDown, Filter, Users, BookOpen, Layers, Folder, AlertCircle, Copy, Upload, Info, Settings, Loader, FileCheck, Eye
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useBreadcrumb } from "../context/BreadcrumbContext";
import { decryptId, encryptId } from "../utils/encryption";
import apiCall from "../services/api";
import ProjectConfigHeader from "../components/ProjectConfigHeader";
import subjectService from "../services/subjectService";
import projectService from "../services/projectService";
import paperService from "../services/paperService";
import sectionService from "../services/sectionService";
import message from '../services/messageService';
import { useTable } from "../services/tableService";
import TablePagination from "../components/TablePagination";
import ColumnFilter from "../components/ColumnFilter";

const SubjectMultiSelect = ({ subjects, selectedSubjects, toggleSubject }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedCount = selectedSubjects.length;

  return (
    <div className="relative" ref={wrapperRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-sm font-semibold border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-teal-500 cursor-pointer outline-none transition-colors"
      >
        <span className={selectedCount === 0 ? "text-gray-400" : "text-gray-900"}>
          {selectedCount === 0 ? "Select Subjects..." : `${selectedCount} subject(s) selected`}
        </span>
        <ChevronDown size={14} className="text-gray-500" />
      </div>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar py-1">
          {subjects.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-500 text-center font-semibold">No subjects available</div>
          ) : (
            subjects.map(s => (
              <label key={s.subjectId} className="flex items-center gap-3 cursor-pointer hover:bg-teal-50 px-4 py-2 transition-colors">
                <input 
                  type="checkbox" 
                  checked={selectedSubjects.includes(s.subjectId)} 
                  onChange={() => toggleSubject(s.subjectId)} 
                  className="w-3.5 h-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer" 
                />
                <span className="text-gray-700 text-xs font-semibold">{s.subjectName}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default function PapersManagement({ isTab = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const encryptedProjectId = searchParams.get("projectId");
  const projectId = encryptedProjectId ? decryptId(encryptedProjectId) : null;
  const subjectId = searchParams.get("subjectId");
  const universityId = searchParams.get("universityId");
  const statusFilterFromUrl = searchParams.get("statusFilter");
  const { userType, universityId: userUniversityId } = useAuth();
  const { setBreadcrumb } = useBreadcrumb();
  const activeUniversityId = userType === "coordinator" ? userUniversityId : universityId;
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTab) {
      const papersPath = userType === 'admin' ? '/admin/papers' : '/papers';
      setBreadcrumb([
        { label: 'Paper Management', path: papersPath, icon: 'FileText' }
      ]);
    }
  }, [userType, isTab, setBreadcrumb]);

  const [subjects, setSubjects] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [subjectFilter, setSubjectFilter] = useState("");
  
  // Table state & fetch fn
  const fetchFn = useCallback((params) => {
    if (projectId || activeUniversityId) {
      const searchVal = params.search || '';
      const pageVal = params.page || 1;
      const pageSizeVal = params.pageSize || 10;
      const sortFieldVal = params.sortField || '';
      const sortOrderVal = params.sortOrder || '';
      const statusFilterVal = params.statusFilter || '';
      // We will use the dashboard stats endpoint if projectId exists, otherwise we fallback to getAllPapers
      if (projectId) {
         let url = `/papers/dashboard-stats?projectId=${projectId}&page=${pageVal}&pageSize=${pageSizeVal}&search=${searchVal}&sortField=${sortFieldVal}&sortOrder=${sortOrderVal}&statusFilter=${statusFilterVal}`;
         const subjectFilterVal = params.subjectName || '';
      if (subjectFilterVal) url += `&subjectId=${subjectFilterVal}`;
         return apiCall(url);
      }
    }
    return Promise.resolve({ items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 1 });
  }, [projectId, activeUniversityId, subjectFilter]);

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
    initialParams: { 
      pageSize: 10,
      filters: { statusFilter: statusFilterFromUrl || '' }
    }
  });

  const [selectedPaperIds, setSelectedPaperIds] = useState([]);
  const [activeInnerTab, setActiveInnerTab] = useState('papers-sections'); // 'papers-sections' | 'import-papers' | 'bulk-import'

  // Import functionality state
  const [importProjects, setImportProjects] = useState([]);
  const [selectedSourceProject, setSelectedSourceProject] = useState('');
  const [importPapers, setImportPapers] = useState([]);
  const [selectedImportPaperIds, setSelectedImportPaperIds] = useState([]);
  const [loadingImportProjects, setLoadingImportProjects] = useState(false);
  const [loadingImportPapers, setLoadingImportPapers] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // Pagination state for import papers
  const [importPage, setImportPage] = useState(1);
  const [importPageSize, setImportPageSize] = useState(10);
  const [importSearchTerm, setImportSearchTerm] = useState('');

  // Bulk import state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');


  // Modals state
  const [showForm, setShowForm] = useState(false);
  const [showBulkConfigModal, setShowBulkConfigModal] = useState(false);
  const [showImportSectionsModal, setShowImportSectionsModal] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    paperCode: "", paperName: "", paperNumber: 1, maxMarks: 100, 
    totalQuestions: "", description: "", catchNo: "", projectId: projectId || "", 
    isActive: true, questionPaperPdfUrl: "",
  });
  const [uploading, setUploading] = useState(false);

  // Subject Dropdown State
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const [subjectSearchText, setSubjectSearchText] = useState("");
  const subjectDropdownRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(event.target)) {
        setIsSubjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Examiner Allocation State
  const [showExaminerModal, setShowExaminerModal] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [availableExaminers, setAvailableExaminers] = useState([]);
  const [assignedExaminers, setAssignedExaminers] = useState([]);
  const [examinerSearchQuery, setExaminerSearchQuery] = useState("");
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [pendingRemovals, setPendingRemovals] = useState([]);

  // Import Sections State
  const [sourcePaperId, setSourcePaperId] = useState("");
  const [importingSections, setImportingSections] = useState(false);
  const [sectionMasters, setSectionMasters] = useState([]);
  const [importSectionMode, setImportSectionMode] = useState('master'); // 'master' | 'paper'
  const [selectedMasterSectionIds, setSelectedMasterSectionIds] = useState([]);
  const [overwriteExistingSections, setOverwriteExistingSections] = useState(true);

  // Table Level Question Paper Upload State
  const [uploadingPaperId, setUploadingPaperId] = useState(null);
  const [activePaperForUpload, setActivePaperForUpload] = useState(null);
  const tableFileInputRef = React.useRef(null);

  useEffect(() => {
    fetchInitialData();
  }, [subjectId, projectId, activeUniversityId]);

  // Load import projects when switching to import tab
  useEffect(() => {
    const loadImportProjects = async () => {
      if (activeInnerTab !== 'import-papers') return;
      
      try {
        setLoadingImportProjects(true);
        const projs = await projectService.getAllProjects(activeUniversityId, { pageSize: 0 });
        const projectsData = projs?.items || projs || [];
        
        // Filter out current project and add master option
        const filteredProjects = projectsData.filter(p => String(p.projectId) !== String(projectId));
        const projectsWithMaster = [
          { projectId: 'master', projectName: 'Master Papers', isMaster: true },
          ...filteredProjects
        ];
        
        setImportProjects(projectsWithMaster);
      } catch (err) {
        console.error('Failed to load import projects:', err);
        setImportProjects([]);
      } finally {
        setLoadingImportProjects(false);
      }
    };

    if (activeInnerTab === 'import-papers') {
      loadImportProjects();
    }
  }, [activeInnerTab, activeUniversityId, projectId]);

  // Load papers from selected import project
  useEffect(() => {
    const loadImportPapers = async () => {
      if (!selectedSourceProject) {
        setImportPapers([]);
        return;
      }
      
      try {
        setLoadingImportPapers(true);
        let papersData = [];
        
        if (selectedSourceProject === 'master') {
          const res = await paperService.getPapers({ universityId: activeUniversityId, isMaster: true, pageSize: 0 });
          papersData = res.items || res;
        } else {
          const res = await paperService.getPapers({ projectId: selectedSourceProject, pageSize: 0 });
          papersData = res.items || res;
        }
        
        setImportPapers(papersData || []);
        setSelectedImportPaperIds([]);
      } catch (err) {
        console.error('Failed to load import papers:', err);
        setImportPapers([]);
      } finally {
        setLoadingImportPapers(false);
      }
    };
    
    loadImportPapers();
  }, [selectedSourceProject, activeUniversityId]);

  const fetchInitialData = async () => {
    try {
      const projs = await projectService.getAllProjects(activeUniversityId, { pageSize: 0 });
      setProjects(projs?.items || projs || []);

      if (activeUniversityId) {
        const subs = await subjectService.getSubjectByUniversity(activeUniversityId, { pageSize: 0 });
        const subjectsArray = Array.isArray(subs) ? subs : (subs?.items || []);
        const mappedSubs = subjectsArray.map(s => ({ ...s, subjectName: s.subName || s.subjectName || '' }));
        setSubjects(mappedSubs);
      }

      try {
        const masters = await sectionService.getSectionMasters();
        setSectionMasters(masters || []);
        if (masters && masters.length > 0) {
          setSelectedMasterSectionIds(masters.map(m => m.id));
        }
      } catch (masterErr) {
        console.error("Failed to load section masters", masterErr);
      }

      refreshTable();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (searchParams.get("add") === "true") setShowForm(true);
    if (subjectId) setSelectedSubjects([parseInt(subjectId, 10)]);
  }, [searchParams]);

  // Bulk Selection
  const toggleSelectAll = () => {
    if (selectedPaperIds.length === papers.length) {
      setSelectedPaperIds([]);
    } else {
      setSelectedPaperIds(papers.map(p => p.paperId));
    }
  };

  const toggleSelectPaper = (id) => {
    setSelectedPaperIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const toggleSubject = (id) => {
    setSelectedSubjects(prev =>
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
  };

  const handleProjectChange = (id) => {
    setFormData(prev => ({ ...prev, projectId: id }));
  };


  // -------------------------------------------------------------
  // Import Sections
  // -------------------------------------------------------------
  const handleImportSectionsSubmit = async (e) => {
    e.preventDefault();
    if (selectedPaperIds.length === 0) return message.error("Select target papers first");

    setImportingSections(true);
    try {
      if (importSectionMode === 'master') {
        if (selectedMasterSectionIds.length === 0) {
          message.error("Please select at least one Master Section to import");
          setImportingSections(false);
          return;
        }
        await sectionService.importMasterSections({
          targetPaperIds: selectedPaperIds,
          masterSectionIds: selectedMasterSectionIds,
          overwriteExisting: overwriteExistingSections
        });
        message.success("Master sections imported successfully");
      } else {
        if (!sourcePaperId) {
          message.error("Select a source paper");
          setImportingSections(false);
          return;
        }
        await sectionService.importSections({
          sourcePaperId: parseInt(sourcePaperId, 10),
          targetPaperIds: selectedPaperIds
        });
        message.success("Sections imported successfully");
      }
      setShowImportSectionsModal(false);
      setSelectedPaperIds([]);
      refreshTable();
    } catch (err) {
      message.error("Failed to import sections: " + (err.response?.data?.message || err.message));
    } finally {
      setImportingSections(false);
    }
  };

  // -------------------------------------------------------------
  // Table-Level Question Paper Upload Handlers
  // -------------------------------------------------------------
  const triggerTableUpload = (paper) => {
    setActivePaperForUpload(paper);
    if (tableFileInputRef.current) {
      tableFileInputRef.current.value = "";
      tableFileInputRef.current.click();
    }
  };

  const handleTableFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activePaperForUpload) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      message.error("Please select a valid PDF file.");
      return;
    }

    const currentPaperId = activePaperForUpload.paperId;
    const currentProjectId = activePaperForUpload.projectId || projectId;

    setUploadingPaperId(currentPaperId);
    try {
      await paperService.uploadQuestionPaper(
        currentPaperId,
        currentProjectId,
        file
      );
      message.success("Question paper PDF uploaded successfully!");
      refreshTable();
    } catch (err) {
      message.error("Failed to upload question paper: " + (err.response?.data?.message || err.message));
    } finally {
      setUploadingPaperId(null);
      setActivePaperForUpload(null);
    }
  };

  // -------------------------------------------------------------
  // Paper Creation/Editing
  // -------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedSubjects.length === 0) return message.error("Please select at least one subject");

    const targetProjectId = formData.projectId || projectId || (projects.length > 0 ? projects[0].projectId : null);
    if (!targetProjectId) return message.error("Please select a project");

    try {
      const payload = {
        ...formData,
        subjectIds: selectedSubjects.map(id => parseInt(id, 10)),
        projectId: parseInt(targetProjectId, 10),
        universityId: activeUniversityId ? parseInt(activeUniversityId, 10) : undefined,
        paperNumber: parseInt(formData.paperNumber, 10),
        maxMarks: parseFloat(formData.maxMarks),
        totalQuestions: formData.totalQuestions === "" ? 0 : parseInt(formData.totalQuestions, 10),
      };

      let savedPaperId = editingId;
      if (editingId) {
        await paperService.updatePaper(editingId, payload);
      } else {
        const res = await paperService.createPaper(payload);
        savedPaperId = res?.paperId || res?.id || res;
      }

      if (savedPaperId && selectedMasterSectionIds.length > 0) {
        try {
          await sectionService.savePaperMasterSections(savedPaperId, selectedMasterSectionIds);
          await sectionService.importMasterSections({
            targetPaperIds: [savedPaperId],
            masterSectionIds: selectedMasterSectionIds,
            overwriteExisting: false
          });
        } catch (secErr) {
          console.error("Failed to map/import master sections to paper", secErr);
        }
      }

      handleCancel();
      refreshTable();
      message.success("Paper and sections saved successfully");
    } catch (err) {
      message.error("Error saving paper");
    }
  };

  const handleEdit = async (paper) => {
    try {
        const fullPaper = await paperService.getPaperById(paper.paperId);
        setFormData({
            paperCode: fullPaper.paperCode, paperName: fullPaper.paperName, paperNumber: fullPaper.paperNumber,
            maxMarks: fullPaper.maxMarks, totalQuestions: fullPaper.totalQuestions, description: fullPaper.description || "",
            catchNo: fullPaper.catchNo || "", projectId: fullPaper.projectId ? String(fullPaper.projectId) : (projectId || ""), 
            isActive: fullPaper.isActive,
            questionPaperPdfUrl: fullPaper.questionPaperPdfUrl || "",
        });
        if (fullPaper.subjectPapers && fullPaper.subjectPapers.length > 0) {
            setSelectedSubjects(fullPaper.subjectPapers.map(sp => sp.subjectId));
        } else if (paper.subjectId) {
            setSelectedSubjects([paper.subjectId]);
        } else if (fullPaper.subjectId) {
            setSelectedSubjects([fullPaper.subjectId]);
        } else {
            try {
                const paperSubjects = await paperService.getPaperSubjects(paper.paperId);
                if (paperSubjects && paperSubjects.length > 0) {
                    setSelectedSubjects(paperSubjects.map(s => s.subjectId));
                }
            } catch (e) {
                console.error("Failed to fetch paper subjects", e);
            }
        }

        try {
          const mappedMasters = await sectionService.getPaperMasterSections(fullPaper.paperId);
          if (Array.isArray(mappedMasters) && mappedMasters.length > 0) {
            setSelectedMasterSectionIds(mappedMasters.map(m => m.id));
          }
        } catch (e) { console.error(e); }

        setEditingId(fullPaper.paperId);
        setShowForm(true);
    } catch (err) {
        message.error("Failed to fetch paper details");
    }
  };

  const handleCancel = () => {
    setFormData({
      paperCode: "", paperName: "", paperNumber: 1, maxMarks: 100, totalQuestions: "", description: "", 
      catchNo: "", projectId: projectId || (projects.length > 0 ? String(projects[0].projectId) : ""), 
      isActive: true, questionPaperPdfUrl: "",
    });
    setSelectedSubjects([]);
    if (sectionMasters.length > 0) {
      setSelectedMasterSectionIds(sectionMasters.map(m => m.id));
    }
    setEditingId(null);
    setIsSubjectDropdownOpen(false);
    setShowForm(false);
  };

  // -------------------------------------------------------------
  // Examiner Allocation
  // -------------------------------------------------------------
  const openAllocationModal = async (paper) => {
    setSelectedPaper(paper);
    setShowExaminerModal(true);
    setAllocationLoading(true);
    try {
      const project = projects.find(p => p.projectId === paper.projectId);
      const projUniversityId = project ? project.universityId : activeUniversityId;
      
      const fullPaper = await paperService.getPaperById(paper.paperId);
      const subIds = fullPaper.subjectPapers?.map(sp => sp.subjectId) || [];
      
      let allExaminers = [];
      if (subIds.length > 0) {
        const examinerSets = await Promise.all(
          subIds.map(sId => apiCall(`/users/examiners?subjectId=${sId}${projUniversityId ? `&universityId=${projUniversityId}` : ''}`))
        );
        const examinerMap = new Map();
        examinerSets.forEach(examList => {
          examList.forEach(ex => {
            if (!examinerMap.has(ex.id)) examinerMap.set(ex.id, ex);
          });
        });
        allExaminers = Array.from(examinerMap.values());
      } else {
        allExaminers = await apiCall(`/users/examiners${projUniversityId ? `?universityId=${projUniversityId}` : ''}`);
      }
      setAvailableExaminers(allExaminers);

      const assigned = await apiCall(`/PaperExaminers/paper/${paper.paperId}`);
      setAssignedExaminers(assigned);
      setPendingRemovals([]);
    } catch (err) {
      console.error(err);
    } finally {
      setAllocationLoading(false);
    }
  };

  const handleAssign = (examinerId) => {
    const examiner = availableExaminers.find(e => e.id === examinerId);
    if (examiner) {
      setAssignedExaminers(prev => [...prev, {
        id: `temp-${Date.now()}`,
        examinerId: examiner.id,
        examiner: examiner,
        isNew: true
      }]);
    }
  };

  const handleRemoveAssignment = (assignmentId, examinerId) => {
    if (assignmentId && !assignmentId.toString().startsWith('temp-')) {
      setPendingRemovals(prev => [...prev, assignmentId]);
    }
    setAssignedExaminers(prev => prev.filter(a => a.examinerId !== (examinerId || a.examiner?.id)));
  };

  const handleDone = async () => {
    setAllocationLoading(true);
    try {
      const newAssignments = assignedExaminers.filter(a => a.isNew);
      for (const a of newAssignments) {
        await apiCall('/PaperExaminers/assign', {
          method: 'POST', body: JSON.stringify({ paperId: selectedPaper.paperId, examinerId: a.examinerId })
        });
      }
      for (const id of pendingRemovals) {
        await apiCall(`/PaperExaminers/remove/${id}`, { method: 'DELETE' });
      }
      if (newAssignments.length > 0 || pendingRemovals.length > 0) {
        message.success("Assignments updated successfully");
      }
      setShowExaminerModal(false);
      refreshTable();
    } catch (err) {
      message.error("Failed to save some assignments");
    } finally {
      setAllocationLoading(false);
    }
  };

  const closeExaminerModal = () => {
    setShowExaminerModal(false);
    refreshTable();
  };

  // Import functionality handlers
  const handleImportSelectAll = () => {
    if (selectedImportPaperIds.length === importPapers.length && importPapers.length > 0) {
      setSelectedImportPaperIds([]);
    } else {
      setSelectedImportPaperIds(importPapers.map(p => p.paperId));
    }
  };

  const handleToggleImportPaper = (paperId) => {
    setSelectedImportPaperIds(prev => 
      prev.includes(paperId) 
        ? prev.filter(id => id !== paperId)
        : [...prev, paperId]
    );
  };

  // Filter and paginate import papers
  const getFilteredImportPapers = () => {
    let filtered = [...importPapers];
    
    if (importSearchTerm) {
      const query = importSearchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.paperName?.toLowerCase().includes(query) ||
        p.paperCode?.toLowerCase().includes(query) ||
        p.catchNo?.toLowerCase().includes(query)
      );
    }
    
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / importPageSize);
    const startIdx = (importPage - 1) * importPageSize;
    const paginatedPapers = filtered.slice(startIdx, startIdx + importPageSize);
    
    return { papers: paginatedPapers, totalCount, totalPages };
  };

  const handleImportPapers = async () => {
    if (selectedImportPaperIds.length === 0) return;

    setImporting(true);
    try {
      await paperService.importPapers({
        sourcePaperIds: selectedImportPaperIds,
        targetProjectId: projectId
      });
      message.success(`Successfully imported ${selectedImportPaperIds.length} papers`);
      
      // Switch back to papers-sections tab and refresh
      setActiveInnerTab('papers-sections');
      setSelectedImportPaperIds([]);
      refreshTable();
    } catch (err) {
      message.error("Failed to import papers: " + (err.response?.data?.message || err.message));
    } finally {
      setImporting(false);
    }
  };

  // Bulk import handlers
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
      // Refresh the main papers table in case some PDFs were matched
      refreshTable();
    } catch (err) {
      message.error(err.message || 'Failed to bulk upload question papers');
    } finally {
      setIsUploading(false);
    }
  };

  // Filter bulk upload results
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

  const SortHeader = ({ label, field, isCenter = false, hasFilter = false, customFilter, filterOptions }) => {
    const isSorted = sortField === field;
    return (
      <th onClick={() => handleSort(field)} className={`px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none ${isCenter ? 'text-center' : ''}`}>
        <div className={`flex items-center gap-1 ${isCenter ? 'justify-center' : ''}`}>
          <span>{label}</span>
          <span className="text-[9px] text-gray-400">{isSorted ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
          {hasFilter && !customFilter && (
            <ColumnFilter columnKey={field} currentFilter={filters[field]} setFilter={setFilter} placeholder={`Filter ${label.toLowerCase()}...`} options={filterOptions} />
          )}
          {customFilter && (
            <div onClick={(e) => e.stopPropagation()} className="ml-1">
              {customFilter}
            </div>
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12 w-full">
      {!isTab && (
        <div className="bg-white border-b border-gray-200 px-6 lg:px-10 pb-0 pt-6 shadow-sm sticky top-0 z-20">
          <ProjectConfigHeader />
        </div>
      )}

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
        {/* Heading is now handled by ProjectConfigHeader in ProjectDashboard */}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-100 relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 p-4 md:p-6">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-3.5 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center shadow-xs">
                    {editingId ? <Edit2 size={16} /> : <Plus size={16} />}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900 leading-tight">
                      {editingId ? "Edit Paper Configuration" : "Create New Paper"}
                    </h2>
                    <p className="text-xs text-gray-500 font-medium">Configure paper metadata and subject mappings</p>
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition-all"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Row 1: Code, Name, Catch No */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-600 mb-1">
                      Paper Code <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={formData.paperCode} 
                      onChange={(e) => setFormData({ ...formData, paperCode: e.target.value })} 
                      className="w-full bg-gray-50/70 border border-gray-200 text-gray-900 text-xs px-3 py-2 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none font-medium" 
                      placeholder="e.g. MATH-101"
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-600 mb-1">
                      Paper Name <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={formData.paperName} 
                      onChange={(e) => setFormData({ ...formData, paperName: e.target.value })} 
                      className="w-full bg-gray-50/70 border border-gray-200 text-gray-900 text-xs px-3 py-2 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none font-medium" 
                      placeholder="e.g. Mathematics-I"
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-600 mb-1">Catch Number</label>
                    <input 
                      type="text" 
                      value={formData.catchNo} 
                      onChange={(e) => setFormData({ ...formData, catchNo: e.target.value })} 
                      className="w-full bg-gray-50/70 border border-gray-200 text-gray-900 text-xs px-3 py-2 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none font-medium" 
                      placeholder="e.g. C-4501"
                    />
                  </div>
                </div>

                {/* Row 2: Subjects Multi-Select Dropdown & Project Select (if no project in URL context) */}
                <div className={`grid grid-cols-1 ${!projectId ? 'sm:grid-cols-2' : ''} gap-3.5`}>
                  {/* Multi-Select Subjects Dropdown */}
                  <div className="relative" ref={subjectDropdownRef}>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-600 mb-1">
                      Subjects ({selectedSubjects.length} selected) <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsSubjectDropdownOpen(!isSubjectDropdownOpen)}
                      className="w-full bg-gray-50/70 border border-gray-200 text-gray-900 text-xs px-3 py-2 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none font-medium flex items-center justify-between shadow-2xs"
                    >
                      <span className="truncate">
                        {selectedSubjects.length === 0 ? (
                          <span className="text-gray-400 font-normal">Select subjects...</span>
                        ) : (
                          <span className="text-teal-800 font-semibold">
                            {selectedSubjects.length === 1 
                              ? subjects.find(s => s.subjectId === selectedSubjects[0])?.subjectName || "1 Subject Selected"
                              : `${selectedSubjects.length} Subjects Selected`
                            }
                          </span>
                        )}
                      </span>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${isSubjectDropdownOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isSubjectDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-2.5 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                          <Search size={13} className="text-gray-400" />
                          <input 
                            type="text" 
                            placeholder="Search subjects..."
                            value={subjectSearchText}
                            onChange={(e) => setSubjectSearchText(e.target.value)}
                            className="w-full bg-transparent text-xs text-gray-800 outline-none placeholder-gray-400"
                          />
                          {subjectSearchText && (
                            <button type="button" onClick={() => setSubjectSearchText("")} className="text-gray-400 hover:text-gray-600">
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[11px] px-1 text-gray-500 font-medium">
                          <span>{selectedSubjects.length} selected</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedSubjects(subjects.map(s => s.subjectId))}
                              className="text-teal-700 hover:underline font-semibold"
                            >
                              Select All
                            </button>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => setSelectedSubjects([])}
                              className="text-gray-500 hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                          {subjects.filter(s => (s.subjectName || "").toLowerCase().includes(subjectSearchText.toLowerCase())).length === 0 ? (
                            <div className="text-xs text-gray-400 py-2 text-center">No subjects found</div>
                          ) : (
                            subjects
                              .filter(s => (s.subjectName || "").toLowerCase().includes(subjectSearchText.toLowerCase()))
                              .map(s => {
                                const isSelected = selectedSubjects.includes(s.subjectId);
                                return (
                                  <label 
                                    key={s.subjectId}
                                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-all ${
                                      isSelected ? "bg-teal-50 text-teal-900 font-medium" : "hover:bg-gray-50 text-gray-700"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSubject(s.subjectId)}
                                      className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 border-gray-300"
                                    />
                                    <span className="truncate">{s.subjectName}</span>
                                  </label>
                                );
                              })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Project Select (Only shown if page is not already scoped to a specific project) */}
                  {!projectId && (
                    <div>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-600 mb-1">
                        Project <span className="text-red-500">*</span>
                      </label>
                      <select 
                        value={formData.projectId} 
                        onChange={(e) => handleProjectChange(e.target.value)} 
                        className="w-full bg-gray-50/70 border border-gray-200 text-gray-900 text-xs px-3 py-2 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none font-medium" 
                        required
                      >
                        <option value="">Select Project</option>
                        {projects.map((p) => (
                          <option key={p.projectId} value={p.projectId}>{p.projectName}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Selected Subjects Badges Display (Quick View) */}
                {selectedSubjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedSubjects.map(subId => {
                      const sub = subjects.find(s => s.subjectId === subId);
                      if (!sub) return null;
                      return (
                        <span 
                          key={subId} 
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-semibold"
                        >
                          {sub.subjectName}
                          <button 
                            type="button" 
                            onClick={() => toggleSubject(subId)}
                            className="hover:text-teal-900 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Row 3: Paper Number, Max Marks, Total Questions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-600 mb-1">Paper Number</label>
                    <input 
                      type="number" 
                      value={formData.paperNumber} 
                      onChange={(e) => setFormData({ ...formData, paperNumber: e.target.value })} 
                      className="w-full bg-gray-50/70 border border-gray-200 text-gray-900 text-xs px-3 py-2 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none font-medium" 
                      placeholder="1"
                      min="1" 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-600 mb-1">Max Marks</label>
                    <input 
                      type="number" 
                      value={formData.maxMarks} 
                      onChange={(e) => setFormData({ ...formData, maxMarks: e.target.value })} 
                      className="w-full bg-gray-50/70 border border-gray-200 text-gray-900 text-xs px-3 py-2 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none font-medium" 
                      placeholder="100"
                      min="0" 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-600 mb-1">Total Questions</label>
                    <input 
                      type="number" 
                      value={formData.totalQuestions} 
                      onChange={(e) => setFormData({ ...formData, totalQuestions: e.target.value })} 
                      className="w-full bg-gray-50/70 border border-gray-200 text-gray-900 text-xs px-3 py-2 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none font-medium" 
                      placeholder="10"
                      min="0" 
                    />
                  </div>
                </div>

                {/* Row 4: Description */}
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-600 mb-1">Description</label>
                  <input 
                    type="text" 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                    className="w-full bg-gray-50/70 border border-gray-200 text-gray-900 text-xs px-3 py-2 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all outline-none font-medium" 
                    placeholder="Brief description or guidelines (optional)..." 
                  />
                </div>

                {/* Row 5: Master Section Mappings */}
                {sectionMasters.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-gray-600">
                        Master Sections ({selectedMasterSectionIds.length} selected)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedMasterSectionIds.length === sectionMasters.length) {
                            setSelectedMasterSectionIds([]);
                          } else {
                            setSelectedMasterSectionIds(sectionMasters.map(m => m.id));
                          }
                        }}
                        className="text-[10px] font-bold text-teal-700 hover:underline"
                      >
                        {selectedMasterSectionIds.length === sectionMasters.length ? "Deselect All" : "Select All"}
                      </button>
                    </div>
                    <div className="bg-gray-50/70 border border-gray-200 rounded-lg p-2 max-h-[85px] overflow-y-auto custom-scrollbar">
                      <div className="grid sm:grid-cols-3 gap-2 grid-cols-1 md:grid-cols-2">
                        {sectionMasters.map((m) => {
                          const isSelected = selectedMasterSectionIds.includes(m.id);
                          return (
                            <label
                              key={m.id}
                              className={`flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs cursor-pointer select-none transition-all ${
                                isSelected
                                  ? "bg-teal-50 border-teal-300 text-teal-900 font-semibold"
                                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100/50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedMasterSectionIds(prev =>
                                    prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                                  );
                                }}
                                className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 border-gray-300"
                              />
                              <span className="truncate text-[11px]">{m.name} ({m.totalMarks}M)</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={handleCancel} 
                    className="px-4 py-2 rounded-lg text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 shadow-sm transition-all flex items-center gap-1.5"
                  >
                    {editingId ? <Edit2 size={13} /> : <Plus size={13} />}
                    {editingId ? "Update Configuration" : "Save Paper"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Papers Main Table Area */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* ── TOOLBAR: Tabs left | Actions right ── */}
          <div className="flex items-center border-b border-gray-100 bg-white">
            {/* LEFT: Tab switcher (always visible) */}
            {projectId && (
              <div className="flex items-stretch h-full shrink-0">
                <button
                  onClick={() => setActiveInnerTab('papers-sections')}
                  className={`flex items-center gap-2 px-5 py-4 text-xs font-extrabold tracking-wide border-b-2 transition-all duration-150 whitespace-nowrap cursor-pointer ${
                    activeInnerTab === 'papers-sections'
                      ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <FileText size={13} className={activeInnerTab === 'papers-sections' ? 'text-teal-700' : 'text-gray-400'} />
                  Papers & Sections
                </button>
                <button
                  onClick={() => setActiveInnerTab('import-papers')}
                  className={`flex items-center gap-2 px-5 py-4 text-xs font-extrabold tracking-wide border-b-2 transition-all duration-150 whitespace-nowrap cursor-pointer ${
                    activeInnerTab === 'import-papers'
                      ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Folder size={13} className={activeInnerTab === 'import-papers' ? 'text-teal-700' : 'text-gray-400'} />
                  Import from Project
                </button>
                <button
                  onClick={() => setActiveInnerTab('bulk-import')}
                  className={`flex items-center gap-2 px-5 py-4 text-xs font-extrabold tracking-wide border-b-2 transition-all duration-150 whitespace-nowrap cursor-pointer ${
                    activeInnerTab === 'bulk-import'
                      ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Upload size={13} className={activeInnerTab === 'bulk-import' ? 'text-teal-700' : 'text-gray-400'} />
                  Bulk QP Import
                </button>
              </div>
            )}

            {/* DIVIDER */}
            <div className="flex-1" />

            {/* RIGHT: Conditional toolbar based on active tab */}
            <div className="flex items-center gap-2 px-4 py-3">
              {/* Papers & Sections Tab Actions */}
              {activeInnerTab === 'papers-sections' && (
                <>
                  {/* Bulk section allocation (shown only when papers selected) */}
                  {selectedPaperIds.length > 0 && (
                    <button
                      onClick={() => setShowImportSectionsModal(true)}
                      className="animate-in fade-in slide-in-from-right-2 duration-200 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] uppercase tracking-wider px-3 py-2 rounded-lg transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap"
                      title="Allocate Sections to Selected"
                    >
                      <Copy size={12} />
                      <span className="hidden sm:inline">Allocate Sections</span>
                      <span className="sm:hidden">{selectedPaperIds.length}</span>
                    </button>
                  )}

                  {/* Search */}
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

                  {/* Add Paper */}
                  <button
                    onClick={() => {
                      setFormData({
                        paperCode: "", paperName: "", paperNumber: 1, maxMarks: 100, totalQuestions: "", description: "",
                        catchNo: "", projectId: projectId || "", isActive: true, questionPaperPdfUrl: "",
                      });
                      setSelectedSubjects([]);
                      setEditingId(null);
                      setShowForm(true);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold bg-teal-700 hover:bg-teal-800 text-white shadow-sm transition-all whitespace-nowrap"
                  >
                    <Plus size={13} /> Add Paper
                  </button>
                </>
              )}

              {/* Import from Project Tab Actions */}
              {activeInnerTab === 'import-papers' && (
                <>
                  {/* Import button (show when papers selected) */}
                  {selectedImportPaperIds.length > 0 && (
                    <button
                      onClick={handleImportPapers}
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
                      {importing ? 'Importing...' : `Import ${selectedImportPaperIds.length} Papers`}
                    </button>
                  )}

                  {/* Project selector */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      {loadingImportProjects ? (
                        <div className="flex items-center gap-2 text-gray-500 text-sm p-2">
                          <Loader size={16} className="animate-spin text-teal-700" />
                          <span className="font-semibold">Loading...</span>
                        </div>
                      ) : importProjects.length === 0 ? (
                        <div className="text-sm text-amber-700 font-semibold">No projects found</div>
                      ) : (
                        <select
                          value={selectedSourceProject}
                          onChange={(e) => setSelectedSourceProject(e.target.value)}
                          className="bg-white border border-gray-200 hover:border-gray-300 focus:border-teal-500 rounded-lg text-xs font-bold text-gray-800 px-2 py-1.5 pr-6 min-w-[200px] outline-none appearance-none cursor-pointer"
                        >
                          <option value="" disabled>-- Select a project --</option>
                          {importProjects.map((proj) => (
                            <option key={proj.projectId} value={proj.projectId}>
                              {proj.projectName} {proj.projectId !== 'master' && `(PRJ-${proj.projectId})`}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search papers..."
                      value={importSearchTerm}
                      onChange={(e) => {
                        setImportSearchTerm(e.target.value);
                        setImportPage(1); // Reset to first page when searching
                      }}
                      className="pl-8 pr-3 py-2 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white w-44 transition-all shadow-none"
                    />
                  </div>
                </>
              )}

              {/* Bulk QP Import Tab Actions */}
              {activeInnerTab === 'bulk-import' && (
                <>
                  {selectedFiles.length > 0 && (
                    <>
                      <button
                        onClick={clearAllFiles}
                        className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Clear Queue
                      </button>
                      <button
                        onClick={handleBulkUpload}
                        disabled={isUploading}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold text-white bg-teal-700 hover:bg-teal-800 shadow-sm transition-all whitespace-nowrap disabled:opacity-50"
                      >
                        {isUploading ? (
                          <>
                            <Loader size={13} className="animate-spin" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={13} />
                            <span>Upload & Allocate ({selectedFiles.length})</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                  {uploadResult && (
                    <button
                      onClick={() => { setSelectedFiles([]); setUploadResult(null); }}
                      className="text-xs font-bold text-teal-700 hover:text-teal-800 hover:bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shadow-2xs"
                    >
                      New Upload
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* TAB CONTENT AREA - Conditional rendering based on active tab */}
          {activeInnerTab === 'papers-sections' && (
            <>
              {tableLoading && papers.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Loading Papers...</p>
                </div>
              ) : papers.length === 0 ? (
                <div className="p-16 text-center">
                  <FileText size={32} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">No Papers Found</p>
                </div>
              ) : (
            <div className="overflow-x-auto">
              <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left">
                <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5 w-12 text-center border-b border-gray-100">
                      <input 
                        type="checkbox" 
                        checked={selectedPaperIds.length === papers.length && papers.length > 0} 
                        onChange={toggleSelectAll} 
                        className="rounded border-gray-300 text-teal-700 focus:ring-teal-500 cursor-pointer w-4 h-4"
                      />
                    </th>
                    <SortHeader label="Code & Name" field="paperCode" hasFilter={true} />
                    <SortHeader label="Subject & Max" field="subjectName" hasFilter={true} />
                    <th className="px-5 py-3.5 text-center border-b border-gray-100">Question Paper</th>
                    <SortHeader 
                      label="Configuration Status" 
                      field="statusFilter" 
                      hasFilter={true} 
                      filterOptions={[
                        { value: '', label: 'All Papers' },
                        { value: 'sections_missing', label: 'Sections/Questions Not Defined' },
                        { value: 'pdf_missing', label: 'PDF Not Uploaded' },
                        { value: 'not_assigned', label: 'Not Assigned' },
                        { value: 'ready_for_allocation', label: 'Ready for Script Allocation' }
                      ]} 
                    />
                    <th className="px-5 py-3.5 text-right border-b border-gray-100">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-700">
                  {papers.map((paper) => {
                    const isSelected = selectedPaperIds.includes(paper.paperId);
                    // Determine warning state
                    const missingQp = paper.isSectionsConfigured && !paper.questionPaperPdfUrl;

                    return (
                      <tr key={paper.paperId} className={`hover:bg-gray-50/50 transition-colors ${isSelected ? 'bg-teal-50/30' : ''}`}>
                        <td className="px-5 py-2.5 text-center">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => toggleSelectPaper(paper.paperId)}
                            className="rounded border-gray-300 text-teal-700 focus:ring-teal-500 cursor-pointer w-4 h-4"
                          />
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-black shrink-0">
                              {paper.paperCode.substring(0, 2)}
                            </div>
                            <div>
                              <span className="text-gray-900 font-extrabold text-sm block">{paper.paperCode}</span>
                              <span className="text-sm text-gray-800 font-semibold block">{paper.paperName}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-2.5">
                          <span className="text-gray-700 block truncate max-w-[150px]">{paper.subjectName}</span>
                          <div className="text-[9px] text-gray-400 uppercase tracking-wider mt-0.5">
                            Max: {paper.maxMarks} | Qs: {paper.totalQuestions} | Catch: {paper.catchNo}
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          {paper.questionPaperPdfUrl ? (
                            <a
                              href={`${import.meta.env.VITE_API_URL.replace('/api', '')}/${paper.questionPaperPdfUrl.replace(/^\//, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/90 hover:border-blue-300 transition-all shadow-2xs group cursor-pointer"
                              title="View Question Paper PDF"
                            >
                              <Eye size={12} className="text-blue-600 group-hover:scale-110 transition-transform" />
                              <span>View PDF</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => triggerTableUpload(paper)}
                              disabled={uploadingPaperId === paper.paperId}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider text-blue-700 hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100 border border-dashed border-blue-300 hover:border-blue-400 transition-all shadow-2xs group cursor-pointer disabled:opacity-50"
                              title="Upload Question Paper PDF"
                            >
                              {uploadingPaperId === paper.paperId ? (
                                <span className="flex items-center gap-1 text-blue-600 animate-pulse">
                                  <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block"></span>
                                  <span>Uploading...</span>
                                </span>
                              ) : (
                                <>
                                  <Upload size={12} className="text-blue-600 group-hover:-translate-y-0.5 transition-transform" />
                                  <span>Upload PDF</span>
                                </>
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-center">
                          {(() => {
                            const missingReasons = [];
                            const statusDetails = [];

                            const hasSections = !!paper.isSectionsConfigured && (paper.sectionsCount || 0) > 0;
                            const marksMatch = hasSections && (paper.maxMarks > 0 ? paper.configuredMarks === paper.maxMarks : true);
                            const hasEvaluators = (paper.expertsCount || 0) > 0;
                            const hasQp = !!paper.questionPaperPdfUrl;

                            if (!hasSections) {
                              missingReasons.push("No sections configured for this paper");
                              statusDetails.push({ label: "Sections", ok: false, text: "0 sections created" });
                            } else if (!marksMatch) {
                              const diff = (paper.maxMarks || 0) - (paper.configuredMarks || 0);
                              const diffText = diff > 0 ? `${diff} marks pending` : `${Math.abs(diff)} marks exceeded`;
                              missingReasons.push(`Section marks (${paper.configuredMarks || 0}) don't equal Max Marks (${paper.maxMarks || 0}) - ${diffText}`);
                              statusDetails.push({ 
                                label: "Section Marks", 
                                ok: false, 
                                text: `${paper.sectionsCount} section(s), ${paper.configuredMarks || 0}/${paper.maxMarks} marks (${diffText})` 
                              });
                            } else {
                              statusDetails.push({ 
                                label: "Sections & Marks", 
                                ok: true, 
                                text: `${paper.sectionsCount} section(s), ${paper.configuredMarks}/${paper.maxMarks} marks matched` 
                              });
                            }

                            if (!hasEvaluators) {
                              missingReasons.push("No evaluators / examiners assigned");
                              statusDetails.push({ label: "Evaluators", ok: false, text: "0 evaluators assigned" });
                            } else {
                              statusDetails.push({ label: "Evaluators", ok: true, text: `${paper.expertsCount} evaluator(s) assigned` });
                            }

                            if (!hasQp) {
                              missingReasons.push("Question Paper PDF not uploaded");
                              statusDetails.push({ label: "Question Paper", ok: false, text: "PDF not uploaded" });
                            } else {
                              statusDetails.push({ label: "Question Paper", ok: true, text: "PDF uploaded" });
                            }

                            let sectionBadge = "Unconfigured";
                            let sectionBadgeColor = "bg-amber-50 text-amber-700 border-amber-200";

                            if (hasSections && marksMatch) {
                              sectionBadge = "Configured";
                              sectionBadgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                            } else if (hasSections && !marksMatch) {
                              sectionBadge = `Marks (${paper.configuredMarks || 0}/${paper.maxMarks})`;
                              sectionBadgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                            }

                            const tooltipTitle = missingReasons.length > 0 
                              ? `Configuration Status:\n• ` + missingReasons.join("\n• ")
                              : "Configuration complete: Sections, Marks, Evaluators and Question Paper are fully configured.";

                            const isFullyReady = missingReasons.length === 0;

                            return (
                              <div className="flex flex-col gap-1 items-start min-w-[170px]" title={tooltipTitle}>
                                {isFullyReady ? (
                                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                    <CheckCircle2 size={12} className="text-emerald-600" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">Ready for Allocation</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                                      <AlertCircle size={11} className="text-amber-600" />
                                      <span className="text-[9px] font-black uppercase tracking-wider">Action Required</span>
                                    </div>
                                    {!hasSections || !marksMatch ? (
                                      <Link 
                                        to={userType === 'admin' ? `/admin/section-config?projectId=${encryptedProjectId}&subjectId=${encryptId(paper.subjectId || 0)}&paperId=${encryptId(paper.paperId)}&from=papers` : `/section-config?projectId=${encryptedProjectId}&subjectId=${encryptId(paper.subjectId || 0)}&paperId=${encryptId(paper.paperId)}&from=papers`} 
                                        className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200 transition-colors uppercase tracking-wider"
                                      >
                                        Configure Sections <ChevronRight size={11} />
                                      </Link>
                                    ) : !hasEvaluators ? (
                                      <button 
                                        onClick={() => openAllocationModal(paper)} 
                                        className="inline-flex items-center gap-1 text-[10px] font-black text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 px-2 py-0.5 rounded-md border border-orange-200 transition-colors uppercase tracking-wider cursor-pointer"
                                      >
                                        Assign Examiner <ChevronRight size={11} />
                                      </button>
                                    ) : !hasQp ? (
                                      <button 
                                        onClick={() => triggerTableUpload(paper)} 
                                        className="inline-flex items-center gap-1 text-[10px] font-black text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200 transition-colors uppercase tracking-wider cursor-pointer"
                                      >
                                        Upload PDF <ChevronRight size={11} />
                                      </button>
                                    ) : null}
                                  </div>
                                )}

                                {/* Compact horizontal micro-status checklist */}
                                <div className="flex items-center gap-2.5 text-[11px] font-medium text-gray-600 mt-0.5">
                                  <span 
                                    className={`inline-flex items-center gap-1 ${hasSections && marksMatch ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-bold'}`} 
                                    title={hasSections && marksMatch ? `Sections & Marks: ${paper.sectionsCount || 0} sections, ${paper.configuredMarks}/${paper.maxMarks} marks` : (!hasSections ? 'Sections: 0 created' : `Marks mismatch: ${paper.configuredMarks}/${paper.maxMarks}`)}
                                  >
                                    {hasSections && marksMatch ? <CheckCircle2 size={12} className="text-emerald-600 shrink-0" /> : <X size={12} className="text-rose-500 shrink-0" />}
                                    Sections
                                  </span>
                                  <span className="text-gray-300">•</span>
                                  <span 
                                    className={`inline-flex items-center gap-1 ${hasEvaluators ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-bold'}`} 
                                    title={hasEvaluators ? `Evaluators: ${paper.expertsCount} assigned` : 'Evaluators: None assigned'}
                                  >
                                    {hasEvaluators ? <CheckCircle2 size={12} className="text-emerald-600 shrink-0" /> : <X size={12} className="text-rose-500 shrink-0" />}
                                    Evaluator
                                  </span>
                                  <span className="text-gray-300">•</span>
                                  <span 
                                    className={`inline-flex items-center gap-1 ${hasQp ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-bold'}`} 
                                    title={hasQp ? 'Question Paper: PDF uploaded' : 'Question Paper: PDF missing'}
                                  >
                                    {hasQp ? <CheckCircle2 size={12} className="text-emerald-600 shrink-0" /> : <X size={12} className="text-rose-500 shrink-0" />}
                                    QP PDF
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="relative group/tooltip inline-block">
                              <Link
                                to={userType === 'admin' 
                                  ? `/admin/section-config?projectId=${encryptedProjectId}&subjectId=${encryptId(paper.subjectId || 0)}&paperId=${encryptId(paper.paperId)}&from=papers`
                                  : `/section-config?projectId=${encryptedProjectId}&subjectId=${encryptId(paper.subjectId || 0)}&paperId=${encryptId(paper.paperId)}&from=papers`}
                                className="p-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg transition-all block shadow-2xs"
                              >
                                <Layers size={14} />
                              </Link>
                              <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] font-bold rounded shadow-sm opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all whitespace-nowrap z-50">
                                Manual Section Configuration
                                <div className="absolute top-full right-2 border-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </div>
                            
                            <div className="relative group/tooltip inline-block">
                              <button
                                onClick={() => openAllocationModal(paper)}
                                className="p-1.5 text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200/80 rounded-lg transition-all block shadow-2xs cursor-pointer"
                              >
                                <Users size={14} />
                              </button>
                              <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] font-bold rounded shadow-sm opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all whitespace-nowrap z-50">
                                Assign Evaluators
                                <div className="absolute top-full right-2 border-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </div>

                            <div className="relative group/tooltip inline-block">
                              <button
                                onClick={() => handleEdit(paper)}
                                className="p-1.5 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 rounded-lg transition-all block shadow-2xs cursor-pointer"
                              >
                                <Edit2 size={14} />
                              </button>
                              <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] font-bold rounded shadow-sm opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all whitespace-nowrap z-50">
                                Edit Paper Configuration
                                <div className="absolute top-full right-2 border-4 border-transparent border-t-gray-900"></div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {/* Pagination controls from useTable logic */}
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

          {/* ── IMPORT FROM PROJECT TAB CONTENT ──────────────────── */}
          {activeInnerTab === 'import-papers' && (
            <>
              {!selectedSourceProject ? (
                <div className="p-16 text-center">
                  <FileText size={32} className="mx-auto text-gray-200 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Select a source project to view papers</p>
                  <p className="text-xs font-medium text-gray-500 mt-2">Choose a project from the dropdown above to see available papers for import</p>
                </div>
              ) : loadingImportPapers ? (
                <div className="p-16 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Loading Papers...</p>
                </div>
              ) : importPapers.length === 0 ? (
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
                            checked={getFilteredImportPapers().papers.length > 0 && selectedImportPaperIds.length === getFilteredImportPapers().papers.length} 
                            onChange={handleImportSelectAll} 
                            className="rounded border-gray-300 text-teal-700 focus:ring-teal-500 cursor-pointer w-4 h-4"
                          />
                        </th>
                        <th className="px-5 py-3.5 border-b border-gray-100">Paper Details</th>
                        <th className="px-5 py-3.5 border-b border-gray-100">Paper Code</th>
                        <th className="px-5 py-3.5 border-b border-gray-100">Subjects</th>
                        <th className="px-5 py-3.5 text-center border-b border-gray-100">Max Marks</th>
                        <th className="px-5 py-3.5 text-center border-b border-gray-100">Sections</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-700">
                      {getFilteredImportPapers().papers.map(paper => {
                        const isSelected = selectedImportPaperIds.includes(paper.paperId);
                        return (
                          <tr key={paper.paperId} className={`hover:bg-gray-50/50 transition-colors ${isSelected ? 'bg-teal-50/30' : ''}`}>
                            <td className="px-5 py-2.5 text-center">
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => handleToggleImportPaper(paper.paperId)}
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
                      })}
                    </tbody>
                  </table>
                  
                  <TablePagination 
                    page={importPage}
                    totalPages={getFilteredImportPapers().totalPages}
                    totalCount={getFilteredImportPapers().totalCount}
                    pageSize={importPageSize}
                    setPage={setImportPage}
                    setPageSize={setImportPageSize}
                  />
                </div>
              )}
            </>
          )}

          {/* ── BULK QP IMPORT TAB CONTENT ──────────────────────────── */}
          {activeInnerTab === 'bulk-import' && (
            <div className="p-6 space-y-6">
              {/* Sleek Guideline & Match Instructions Banner */}
              <div className="p-4 sm:p-5 bg-teal-50/60 border border-teal-100 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <Info size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold text-gray-900">How Catch-wise Bulk Upload Works</h4>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100/80 text-teal-800 px-2.5 py-0.5 rounded-full border border-teal-200/50">
                        Automatic Matching
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      Name your PDF files using the corresponding paper's <strong className="text-gray-800">Catch Number</strong> or <strong className="text-gray-800">Paper Code</strong> (for example: <code className="bg-white border border-teal-200 text-teal-800 px-1.5 py-0.5 rounded text-[11px] font-mono">1001.pdf</code>, <code className="bg-white border border-teal-200 text-teal-800 px-1.5 py-0.5 rounded text-[11px] font-mono">CATCH_1001.pdf</code>, or <code className="bg-white border border-teal-200 text-teal-800 px-1.5 py-0.5 rounded text-[11px] font-mono">MATH101.pdf</code>). Select all files together or drop them below to automatically allocate them to papers.
                    </p>
                  </div>
                </div>
              </div>

              {/* Main Upload Dropzone Area */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-teal-200 hover:border-teal-500 bg-teal-50/20 hover:bg-teal-50/50 rounded-xl text-center transition-all cursor-pointer group p-8 md:p-12"
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
                  <div className="w-14 h-14 bg-teal-100 text-teal-700 rounded-2xl flex items-center justify-center mx-auto group-hover:scale-105 group-hover:bg-teal-700 group-hover:text-white transition-all shadow-xs">
                    <Upload size={26} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-gray-800">
                      Click to select Question Paper PDFs or drag & drop files here
                    </p>
                    <p className="text-xs text-gray-500 font-medium">
                      Supports multiple PDF files named by Catch No (e.g. <span className="font-mono text-gray-700 font-bold">1001.pdf</span>, <span className="font-mono text-gray-700 font-bold">1002.pdf</span>)
                    </p>
                  </div>
                  <div className="pt-2">
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-teal-700 bg-white border border-teal-200 hover:bg-teal-50 rounded-lg shadow-xs transition-colors">
                      <Folder size={13} />
                      Browse Files
                    </span>
                  </div>
                </label>
              </div>

              {/* Selected Files Queue */}
              {selectedFiles.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                      <FileCheck size={16} className="text-teal-700" />
                      <span className="text-xs font-extrabold text-gray-900 uppercase tracking-wider">
                        Selected Files Queue ({selectedFiles.length})
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={clearAllFiles}
                        className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Clear Queue
                      </button>
                      <button
                        onClick={handleBulkUpload}
                        disabled={isUploading}
                        className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider py-2 px-5 rounded-lg transition-all shadow-sm flex items-center gap-2"
                      >
                        {isUploading ? (
                          <>
                            <Loader size={13} className="animate-spin" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={14} />
                            <span>Upload & Auto-Allocate</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                    {selectedFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 hover:bg-teal-50/40 border border-gray-200 rounded-lg text-xs transition-colors">
                        <div className="flex items-center gap-2 truncate pr-2">
                          <FileText size={14} className="text-teal-700 shrink-0" />
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

              {/* Upload Results & Summary Report */}
              {uploadResult && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden space-y-0 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50">
                    <div>
                      <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-teal-700" />
                        Import Summary & Allocation Report
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">{uploadResult.message}</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="bg-teal-50 text-teal-800 border border-teal-200 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle2 size={13} className="text-teal-700" />
                        <span>{uploadResult.matchedCount} Allocated</span>
                      </div>
                      {uploadResult.unmatchedCount > 0 && (
                        <div className="bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5">
                          <AlertCircle size={13} className="text-amber-700" />
                          <span>{uploadResult.unmatchedCount} Unmatched</span>
                        </div>
                      )}
                      <button
                        onClick={() => { setSelectedFiles([]); setUploadResult(null); }}
                        className="px-3 py-1 text-xs font-bold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors shadow-2xs"
                      >
                        Upload More
                      </button>
                    </div>
                  </div>

                  {/* Results Search Filter */}
                  <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-4 bg-white">
                    <div className="relative w-full max-w-sm">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Filter results by filename, catch no, paper code..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white placeholder-gray-400 transition-all"
                      />
                      {searchFilter && (
                        <button onClick={() => setSearchFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 font-medium shrink-0">
                      Showing {filteredResults.length} file(s)
                    </span>
                  </div>

                  {/* Results Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                        <tr>
                          <th className="px-5 py-3.5 border-b border-gray-100">File Name</th>
                          <th className="px-5 py-3.5 text-center border-b border-gray-100">Status</th>
                          <th className="px-5 py-3.5 border-b border-gray-100">Matched Paper Code & Name</th>
                          <th className="px-5 py-3.5 text-center border-b border-gray-100">Catch No</th>
                          <th className="px-5 py-3.5 text-right border-b border-gray-100">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-700">
                        {filteredResults.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                              No results match your filter.
                            </td>
                          </tr>
                        ) : (
                          filteredResults.map((r, idx) => (
                            <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-3 font-extrabold text-gray-900">
                                <div className="flex items-center gap-2">
                                  <FileText size={14} className={r.status === 'Success' ? 'text-teal-700' : 'text-amber-500'} />
                                  <span>{r.fileName}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-center">
                                {r.status === 'Success' ? (
                                  <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
                                    Allocated
                                  </span>
                                ) : (
                                  <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
                                    Unmatched
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                {r.paperCode ? (
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded-md text-[11px] uppercase tracking-wider">
                                      {r.paperCode}
                                    </span>
                                    <span className="font-bold text-gray-900">{r.paperName}</span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">No matching paper</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-center font-mono font-bold text-gray-700">
                                {r.catchNo || '—'}
                              </td>
                              <td className="px-5 py-3 text-right">
                                {r.fileUrl ? (
                                  <a
                                    href={`${import.meta.env.VITE_API_URL.replace('/api', '')}${r.fileUrl}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors"
                                  >
                                    <FileText size={12} /> View PDF
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-gray-400 italic">No PDF Attached</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Import Sections Modal */}
        {/* ------------------------------------------------------------------ */}
        {showImportSectionsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
              <div className="py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 md:px-6 px-4">
                <div>
                  <h3 className="text-lg font-black text-gray-900">Import Sections</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">Applying to {selectedPaperIds.length} selected paper(s)</p>
                </div>
                <button onClick={() => setShowImportSectionsModal(false)} className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Tab Selector */}
              <div className="flex border-b border-gray-200 bg-gray-50/50 pt-3 gap-4 md:px-6 px-4">
                <button
                  type="button"
                  onClick={() => setImportSectionMode('master')}
                  className={`pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    importSectionMode === 'master'
                      ? 'border-teal-700 text-teal-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Layers size={14} /> Master Sections
                </button>
                <button
                  type="button"
                  onClick={() => setImportSectionMode('paper')}
                  className={`pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                    importSectionMode === 'paper'
                      ? 'border-teal-700 text-teal-700'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Copy size={14} /> From Configured Paper
                </button>
              </div>

              <form onSubmit={handleImportSectionsSubmit} className="space-y-4 p-4 md:p-6">
                {importSectionMode === 'master' ? (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-600">
                      Select predefined master section structures to automatically generate and assign sections to the chosen papers.
                    </p>

                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {sectionMasters.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">No master sections available.</p>
                      ) : (
                        sectionMasters.map(master => {
                          const isChecked = selectedMasterSectionIds.includes(master.id);
                          return (
                            <label
                              key={master.id}
                              className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                isChecked ? 'bg-teal-50/60 border-teal-300' : 'bg-white border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedMasterSectionIds(prev => [...prev, master.id]);
                                  } else {
                                    setSelectedMasterSectionIds(prev => prev.filter(id => id !== master.id));
                                  }
                                }}
                                className="mt-1 rounded border-gray-300 text-teal-700 focus:ring-teal-500"
                              />
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-gray-900 text-sm">{master.name}</span>
                                  <span className="text-[10px] font-extrabold px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md">
                                    {master.totalMarks} Marks
                                  </span>
                                </div>
                                <div className="text-[11px] text-gray-500 mt-0.5">
                                  Q{master.startQuestion} - Q{master.endQuestion} ({master.totalQuestions || (master.endQuestion - master.startQuestion + 1)} Questions) &bull; Attempt {master.maxQuestionsToAttempt}
                                </div>
                                {master.description && (
                                  <p className="text-[10px] text-gray-400 mt-1">{master.description}</p>
                                )}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMasterSectionIds(sectionMasters.map(m => m.id))}
                        className="text-[11px] text-teal-700 font-bold hover:underline"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMasterSectionIds([])}
                        className="text-[11px] text-gray-500 font-bold hover:underline"
                      >
                        Clear Selection
                      </button>
                    </div>

                    <label className="flex items-center gap-2 pt-2 border-t border-gray-100 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overwriteExistingSections}
                        onChange={(e) => setOverwriteExistingSections(e.target.checked)}
                        className="rounded border-gray-300 text-teal-700 focus:ring-teal-500"
                      />
                      <span className="text-xs font-semibold text-gray-700">Overwrite existing sections on target papers</span>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-3">
                      <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] font-bold text-amber-800">
                        Warning: This will overwrite any existing sections on the target papers with the structure from the source paper.
                      </p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Select Source Paper</label>
                      <select 
                        value={sourcePaperId} 
                        onChange={e => setSourcePaperId(e.target.value)} 
                        className="w-full text-sm font-semibold border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" 
                        required={importSectionMode === 'paper'}
                      >
                        <option value="">-- Select a configured paper --</option>
                        {papers.filter(p => p.isSectionsConfigured && !selectedPaperIds.includes(p.paperId)).map(p => (
                          <option key={p.paperId} value={p.paperId}>{p.paperCode} - {p.paperName}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                
                <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                  <button type="button" onClick={() => setShowImportSectionsModal(false)} className="px-5 py-2 text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">Cancel</button>
                  <button type="submit" disabled={importingSections} className="px-5 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-xl shadow-md transition-colors disabled:opacity-50 flex items-center gap-2">
                    {importingSections ? 'Importing...' : 'Confirm Import'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Examiner Allocation Modal */}
        {/* ------------------------------------------------------------------ */}
        {showExaminerModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="bg-gray-50/50 border-b border-gray-100 flex items-center justify-between p-4 md:p-6">
                <div>
                    <h3 className="text-xl font-black text-gray-900">Assign Examiners</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">Allocation for {selectedPaper?.paperCode}: {selectedPaper?.paperName}</p>
                </div>
                <button onClick={closeExaminerModal} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                    <X size={20} className="text-gray-400 hover:text-gray-600" />
                </button>
                </div>

                <div className="p-4 md:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Available Examiners */}
                    <div>
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Available Evaluators</h4>
                        <span className="bg-teal-50 text-teal-700 text-[9px] font-black px-2 py-0.5 rounded-md border border-teal-100">{availableExaminers.length} Found</span>
                    </div>
                    
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input type="text" placeholder="Search by name..." className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-9 pr-4 text-xs font-semibold focus:ring-2 focus:ring-teal-500 outline-none" value={examinerSearchQuery} onChange={(e) => setExaminerSearchQuery(e.target.value)} />
                    </div>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {allocationLoading ? (
                        <div className="text-center py-10 opacity-50 text-xs font-bold text-gray-500">Loading examiners...</div>
                        ) : availableExaminers.filter(ex => ex.name.toLowerCase().includes(examinerSearchQuery.toLowerCase()) && !assignedExaminers.some(a => a.examinerId === ex.id)).map(examiner => (
                        <div key={examiner.id} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl hover:bg-teal-50 border border-gray-100 group transition-all">
                            <div className="flex items-center gap-3">
                            <img src={examiner.profileImage || "https://ui-avatars.com/api/?name=" + examiner.name} alt="" className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white shadow-sm" />
                            <div><p className="text-xs font-bold text-gray-800">{examiner.name}</p></div>
                            </div>
                            <button onClick={() => handleAssign(examiner.id)} className="p-1.5 bg-white text-teal-700 rounded-lg shadow-sm border border-gray-100 opacity-0 group-hover:opacity-100 transition-all hover:scale-110">
                            <UserPlus size={14} />
                            </button>
                        </div>
                        ))}
                    </div>
                    </div>

                    {/* Assigned Examiners */}
                    <div>
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-4">Assigned to Paper</h4>
                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                        {assignedExaminers.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/30">
                            <Users size={24} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">No examiners assigned</p>
                        </div>
                        ) : (
                        assignedExaminers.map(assignment => (
                            <div key={assignment.id} className="flex items-center justify-between p-3 bg-teal-50 border border-teal-100 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                <img src={assignment.examiner?.profileImage || "https://ui-avatars.com/api/?name=" + assignment.examiner?.name} alt="" className="w-8 h-8 rounded-full border-2 border-white shadow-sm" />
                                <div className="absolute -top-1 -right-1 bg-emerald-500 border-2 border-white w-3 h-3 rounded-full"></div>
                                </div>
                                <div>
                                <p className="text-xs font-bold text-teal-900">{assignment.examiner?.name}</p>
                                <p className="text-[9px] font-bold text-teal-700/70">Assigned: {new Date(assignment.assignedAt || Date.now()).toLocaleDateString()}</p>
                                </div>
                            </div>
                            <button onClick={() => handleRemoveAssignment(assignment.id, assignment.examinerId || assignment.examiner?.id)} className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-white rounded-lg transition-all">
                                <Trash2 size={14} />
                            </button>
                            </div>
                        ))
                        )}
                    </div>
                    </div>
                </div>
                </div>
                <div className="bg-gray-50/50 border-t border-gray-100 flex justify-end gap-3 p-4 md:p-6">
                <button onClick={closeExaminerModal} className="py-2.5 text-gray-500 hover:bg-gray-200 rounded-xl text-xs font-bold transition-all md:px-6 px-4">
                    Cancel
                </button>
                <button onClick={handleDone} disabled={allocationLoading} className="bg-teal-700 text-white py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-teal-200 hover:bg-teal-800 transition-all disabled:opacity-50 px-4 md:px-8">
                    {allocationLoading ? 'Saving...' : 'Done'}
                </button>
                </div>
            </div>
            </div>
        )}
        <input
          type="file"
          ref={tableFileInputRef}
          accept="application/pdf"
          style={{ display: "none" }}
          onChange={handleTableFileChange}
        />
        </>
      )}
    </div>
  );
}
