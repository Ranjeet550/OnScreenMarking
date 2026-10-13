import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  FileText, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Zap, 
  TrendingUp, 
  Award,
  ChevronRight,
  ChevronDown,
  Search,
  Sparkles,
  Calendar,
  X,
  RefreshCw,
  Eye,
  Briefcase,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import apiCall from '../services/api';
import { useTable } from '../services/tableService';
import TablePagination from '../components/TablePagination';
import ColumnFilter from '../components/ColumnFilter';
import RequestScriptsModal from '../components/RequestScriptsModal';

const Home = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalScripts: 0,
    evaluated: 0,
    pending: 0,
    inProgress: 0,
    averageScore: 0,
  });
  const [subjectWorkloads, setSubjectWorkloads] = useState([]);
  const [assignedPapers, setAssignedPapers] = useState([]);
  const [requestModalPaper, setRequestModalPaper] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const tableRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return { text: "Good Morning", icon: "??" };
    if (hour < 17) return { text: "Good Afternoon", icon: "??" };
    return { text: "Good Evening", icon: "??" };
  };

  const handleStartMarking = (script) => {
    const queryParams = new URLSearchParams({
      scriptId: script.id,
      paperId: script.paperId || '',
      barCode: script.generatedBarcode || '',
      allocationId: script.allocationId || '',
      examinerId: user?.id || '',
      cleanPdfUrl: script.cleanPdfUrl || script.answerSheetPdfUrl || '',
      questionPaperPdfUrl: script.questionPaperPdfUrl || ''
    }).toString();

    navigate(`/marking?${queryParams}`, {
      state: {
        scriptId: script.id,
        paperId: script.paperId,
        barCode: script.generatedBarcode,
        allocationId: script.allocationId,
        cleanPdfUrl: script.cleanPdfUrl || script.answerSheetPdfUrl || '',
        questionPaperPdfUrl: script.questionPaperPdfUrl || ''
      }
    });
  };

  const fetchFn = useCallback(async (params) => {
    if (!user?.id) {
      return { items: [], totalCount: 0, page: 1, pageSize: 10, totalPages: 1 };
    }
    const searchVal = params.search || '';
    const pageVal = params.page || 1;
    const pageSizeVal = params.pageSize || 10;
    const statusFilterVal = params.statusFilter || 'all';
    const subjectFilterVal = params.subjectFilter || '';
    const sortFieldVal = params.sortField || '';
    const sortOrderVal = params.sortOrder || '';

    // Fetch paginated data for the table
    const queryParams = new URLSearchParams();
    queryParams.append('page', pageVal);
    queryParams.append('pageSize', pageSizeVal);
    if (searchVal) queryParams.append('search', searchVal);
    if (sortFieldVal) queryParams.append('sortField', sortFieldVal);
    if (sortOrderVal) queryParams.append('sortOrder', sortOrderVal);
    if (statusFilterVal && statusFilterVal !== 'all') queryParams.append('statusFilter', statusFilterVal);
    if (subjectFilterVal) queryParams.append('subjectFilter', subjectFilterVal);

    const response = await apiCall(`/scripts/examiner/${user.id}?${queryParams.toString()}`);
    
    return {
      items: response.items || [],
      totalCount: response.totalCount || 0,
      page: response.page || 1,
      pageSize: response.pageSize || 10,
      totalPages: response.totalPages || 1
    };
  }, [user]);

  // Separate effect to load all scripts for dashboard stats
  useEffect(() => {
    const loadStats = async () => {
      if (!user?.id) return;
      try {
        const papers = await apiCall(`/PaperExaminers/examiner/${user.id}`);
        if (Array.isArray(papers)) setAssignedPapers(papers);
      } catch(e) { console.error("Failed to load papers:", e); }
      
      try {
        // Fetch all scripts for stats
        const allScriptsResponse = await apiCall(`/scripts/examiner/${user.id}?pageSize=1000`);
        const allScripts = allScriptsResponse.items || (Array.isArray(allScriptsResponse) ? allScriptsResponse : []);

        const total = allScripts.length;
        const evaluatedCount = allScripts.filter(s => s.status === 'completed').length;
        const markingCount = allScripts.filter(s => s.status === 'marking').length;
        const pendingCount = allScripts.filter(s => s.status === 'allocated' || s.status === 'pending').length;
        const completedScripts = allScripts.filter(s => s.status === 'completed' && s.totalMarks !== null);
        const sumMarks = completedScripts.reduce((sum, s) => sum + parseFloat(s.totalMarks), 0);
        const avgScore = completedScripts.length > 0 ? (sumMarks / completedScripts.length) : 0;

        setStats({
          totalScripts: total,
          evaluated: evaluatedCount,
          inProgress: markingCount,
          pending: pendingCount,
          averageScore: parseFloat(avgScore.toFixed(1)),
        });

        const expertiseIds = [user?.subjectId1, user?.subjectId2, user?.subjectId3].filter(id => id && id > 0);
        let subjectsData = [];
        if (expertiseIds.length > 0) {
          subjectsData = await Promise.all(
            expertiseIds.map(id => apiCall(`/subject/${id}`, { hideErrorToast: true }).catch(() => null))
          );
        }

        // Calculate subject workloads based on user's expertise subjects and group papers under them
        const validSubjects = subjectsData.filter(sub => sub !== null && sub.subjectId);
        const workloads = validSubjects.map(sub => {
          const subjectScripts = allScripts.filter(s => s.subjectId === sub.subjectId);
          
          const papersMap = {};
          subjectScripts.forEach(s => {
            const pKey = s.paperId;
            if (!papersMap[pKey]) {
              papersMap[pKey] = {
                paperId: s.paperId,
                paperName: s.paperName,
                paperCode: s.paperCode || '',
                count: 0
              };
            }
            papersMap[pKey].count += 1;
          });

          return {
            subjectId: sub.subjectId,
            subjectName: sub.subjectName || sub.subName,
            totalCount: subjectScripts.length,
            papers: Object.values(papersMap)
          };
        });
        setSubjectWorkloads(workloads);
      } catch (err) {
        console.error("Failed to load stats:", err);
      }
    };
    loadStats();
  }, [user]);

  const {
    items: scripts,
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
    initialParams: { pageSize: 10, statusFilter: 'all', subjectFilter: '' }
  });

  const handleCardClick = (filterVal) => {
    setFilter('statusFilter', filterVal);
    // Smooth scroll and focus table registry
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubjectClick = (subjectId) => {
    const stringId = subjectId ? subjectId.toString() : '';
    if (filters.subjectFilter === stringId) {
      setFilter('subjectFilter', '');
    } else {
      setFilter('subjectFilter', stringId);
    }
    // Smooth scroll and focus table registry
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const SortHeader = ({ label, field, isCenter = false, hasFilter = false }) => {
    const isSorted = sortField === field;
    return (
      <th 
        onClick={() => handleSort(field)}
        className={`px-5 py-3 cursor-pointer hover:bg-gray-100/80 transition-colors select-none group/header ${isCenter ? 'text-center' : ''}`}
      >
        <div className={`flex items-center gap-1.5 ${isCenter ? 'justify-center' : ''}`}>
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
          <span className="text-gray-400 group-hover/header:text-gray-655 transition-colors flex items-center">
            {isSorted ? (
              sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} className="opacity-40 group-hover/header:opacity-100" />
            )}
          </span>
          {hasFilter && (
            <ColumnFilter columnKey={field} currentFilter={filters[field]} setFilter={setFilter} placeholder={`Filter ${label.toLowerCase()}...`} />
          )}
        </div>
      </th>
    );
  };

  const greeting = getGreeting();

  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="h-[calc(100vh-64px)] bg-gray-50/50 pb-6 w-full flex flex-col lg:px-10 pt-6 space-y-6 overflow-hidden md:px-6 px-4">
      
      <div className="bg-white py-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 md:px-6 px-4">
        <div>
          <div className="flex items-center gap-2 text-teal-700 font-semibold mb-1">
            <Sparkles size={16} />
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Welcome, {user?.name || "Examiner"}
            </h1>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">
            Examiner Console - Monitor and Evaluate Allocated Scripts
          </p>
        </div>

        <div className="flex flex-row items-center gap-3 bg-gray-50 border border-gray-100 px-4 py-2 rounded-xl self-start md:self-center">
          <div className="p-1.5 bg-white rounded-lg text-center shadow-sm">
            <Calendar size={16} className="mx-auto text-teal-600 mb-0.5" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold tracking-wide text-gray-400 uppercase leading-none mb-1">{formattedDate}</p>
            <p className="text-sm font-black tracking-tight text-gray-800 font-mono leading-none">{formattedTime}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 items-start flex-1 w-full overflow-hidden">
        
        {/* LEFT COLUMN - STATS & REGISTRY (8 Columns) */}
        <div className="col-span-12 xl:col-span-8 flex flex-col gap-6 h-full overflow-hidden">
          
          {/* Main Single Row Grid of Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Assigned"
            value={stats.totalScripts}
            icon={<FileText className="text-teal-600" />}
            bgColor="bg-teal-50/80 group-hover:bg-teal-100"
            borderClass="border-l-[3px] border-l-teal-500"
            subtitle="allocated sheets"
            onClick={() => handleCardClick('all')}
            isSelected={filters.statusFilter === 'all'}
            activeRingClass="border-teal-500 ring-1 ring-teal-500 shadow-md"
          />
          <StatCard
            title="Pending"
            value={stats.pending}
            icon={<AlertCircle className="text-rose-600" />}
            bgColor="bg-rose-50/80 group-hover:bg-rose-100"
            borderClass="border-l-[3px] border-l-rose-500"
            subtitle="awaiting evaluation"
            onClick={() => handleCardClick('pending')}
            isSelected={filters.statusFilter === 'pending'}
            activeRingClass="border-rose-500 ring-1 ring-rose-500 shadow-md"
          />
          <StatCard
            title="In Progress"
            value={stats.inProgress}
            icon={<Clock className="text-amber-600" />}
            bgColor="bg-amber-50/80 group-hover:bg-amber-100"
            borderClass="border-l-[3px] border-l-amber-500"
            subtitle="currently editing"
            onClick={() => handleCardClick('marking')}
            isSelected={filters.statusFilter === 'marking'}
            activeRingClass="border-amber-500 ring-1 ring-amber-500 shadow-md"
          />
          <StatCard
            title="Completed"
            value={stats.evaluated}
            icon={<CheckCircle className="text-emerald-600" />}
            bgColor="bg-emerald-50/80 group-hover:bg-emerald-100"
            borderClass="border-l-[3px] border-l-emerald-500"
            subtitle="successfully marked"
            onClick={() => handleCardClick('completed')}
            isSelected={filters.statusFilter === 'completed'}
            activeRingClass="border-emerald-500 ring-1 ring-emerald-500 shadow-md"
          />
      </div>



      {/* Interactive Script Control Cockpit */}
      <div ref={tableRef} className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col gap-3 shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-gray-800">Allocated Scripts Registry</h2>
              <p className="text-[10px] text-gray-500 mt-0.5">Filter, search, and jump directly into evaluating your papers</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0">
              {/* Search Input */}
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500 transition-all w-64">
                <Search size={13} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search by Barcode, Paper..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-gray-800 placeholder-gray-400 font-semibold text-[11px] focus:outline-none"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-gray-300 hover:text-gray-500 transition"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              
              {/* Status Dropdown */}
              <div className="relative">
                <select
                  value={filters.statusFilter || 'all'}
                  onChange={(e) => setFilter('statusFilter', e.target.value)}
                  className="appearance-none flex items-center justify-center gap-1.5 px-4 py-2 pr-8 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="marking">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
                  <ChevronDown size={14} />
                </div>
              </div>
            </div>
          </div>

          {/* Active Filter Badges */}
          {( (filters.statusFilter && filters.statusFilter !== 'all') || filters.subjectFilter ) && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              {filters.statusFilter && filters.statusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-[9px] font-black px-2.5 py-1 rounded-md border border-teal-100">
                  Status: {filters.statusFilter}
                  <X size={10} className="cursor-pointer" onClick={() => setFilter('statusFilter', 'all')} />
                </span>
              )}
              {filters.subjectFilter && (
                <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-[9px] font-black px-2.5 py-1 rounded-md border border-teal-100">
                  Subject: {subjectWorkloads.find(sw => sw.subjectId.toString() === filters.subjectFilter)?.subjectName || 'Selected Subject'}
                  <X size={10} className="cursor-pointer" onClick={() => setFilter('subjectFilter', '')} />
                </span>
              )}
            </div>
          )}
        </div>
        
        {tableLoading && scripts.length === 0 ? (
          <div className="p-12 text-center text-gray-400 font-bold text-xs flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 animate-pulse"></div>
            <span>Fetching allocated scripts...</span>
          </div>
        ) : scripts.length === 0 ? (
          <div className="py-12 text-center text-gray-450 space-y-2">
            <FileText size={38} className="mx-auto text-gray-305 opacity-80" />
            <p className="text-xs font-bold uppercase tracking-wider">No matching scripts found</p>
            <p className="text-[10px] text-gray-400">Try adjusting your search query or status filter above</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto min-h-0">
              <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left min-w-[900px] relative">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                <tr>
                  <SortHeader label="Barcode / Script ID" field="barcode" hasFilter={true} />
                  <SortHeader label="Subject" field="subjectName" hasFilter={true} />
                  <SortHeader label="Paper Name" field="paperName" hasFilter={true} />
                  <SortHeader label="Status" field="status" />
                  <SortHeader label="Marks Obtained" field="totalMarks" />
                  <SortHeader label="Last Activity" field="submittedAt" />
                  <th className="px-5 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Interactive Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/70">
                {scripts.map((script) => (
                  <tr key={script.id} className="hover:bg-gray-50/60 transition-colors group">
                    <td className="px-5 py-2.5 font-bold text-xs text-gray-950">
                      {script.generatedBarcode || `SCR-${script.id}`}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-gray-650 font-medium">
                      {script.subjectName || 'General Subject'}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-gray-700 font-semibold">
                      {script.paperName}
                    </td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          script.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : script.status === 'marking'
                            ? 'bg-amber-50 text-amber-705 border-amber-100 animate-pulse'
                            : 'bg-rose-50 text-rose-700 border-rose-100'
                        }`}
                      >
                        <span className={`w-1 h-1 rounded-full ${
                          script.status === 'completed' ? 'bg-emerald-500' : script.status === 'marking' ? 'bg-amber-500' : 'bg-rose-500'
                        }`}></span>
                        {script.status === 'completed' ? 'Completed' : script.status === 'marking' ? 'In Progress' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 font-black text-xs text-gray-900">
                      {script.totalMarks !== null ? (
                        <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-md border border-teal-100">
                          {script.totalMarks} marks
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Not evaluated</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-[10px] text-gray-505 font-medium">
                      {new Date(script.submittedAt || script.createdAt).toLocaleDateString()} at {new Date(script.submittedAt || script.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="flex justify-end">
                        <div className="relative group/tooltip">
                          {script.status === 'completed' ? (
                            <button
                              onClick={() => handleStartMarking(script)}
                              className="p-1.5 bg-blue-50/50 hover:bg-blue-100/70 text-blue-600 rounded-lg transition-all cursor-pointer border border-blue-200/50 hover:border-blue-300"
                            >
                              <Eye size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartMarking(script)}
                              className="p-1.5 bg-teal-50/50 hover:bg-teal-100/70 text-teal-600 rounded-lg transition-all border border-teal-200/50 hover:border-teal-300 cursor-pointer"
                            >
                              <Zap size={14} />
                            </button>
                          )}
                          <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
                            {script.status === 'completed' ? 'Review Marks' : 'Evaluate Script'}
                            <div className="absolute top-full right-4 transform -mt-1">
                              <div className="border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Standard centralized pagination service */}
          <div className="border-t border-gray-100 bg-white mt-auto rounded-b-xl z-10 relative">
            <TablePagination
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={pageSize}
              setPage={setPage}
              setPageSize={setPageSize}
            />
          </div>
        </>
        )}
      </div>
      </div>
      
      {/* RIGHT COLUMN - SIDEBAR WIDGETS (4 Columns) */}
      <div className="col-span-12 xl:col-span-4 flex flex-col gap-6 h-full overflow-y-auto pr-1">
        
        {/* Progress Visualizer */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                <Award size={14} className="text-teal-700 animate-bounce" />
                Marking Velocity
              </h2>
              <p className="text-[10px] text-gray-500 mt-0.5">Average Score: <span className="text-teal-700 font-extrabold">{stats.averageScore}</span></p>
            </div>
            <span className="text-[11px] font-black text-teal-700 bg-teal-50 border border-teal-100 px-2.5 py-1 rounded-md">
              {stats.totalScripts > 0 ? Math.round((stats.evaluated / stats.totalScripts) * 100) : 0}%
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-100 flex p-0.5">
              <div
                className="bg-gradient-to-r from-teal-600 to-teal-600 h-full rounded-full transition-all duration-700"
                style={{ width: `${stats.totalScripts > 0 ? (stats.evaluated / stats.totalScripts) * 100 : 0}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[9px] font-bold text-gray-400">
              <span>0%</span>
              <span>{stats.evaluated} of {stats.totalScripts} Evaluated</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Assigned Papers for Requesting Scripts */}
        {assignedPapers.length > 0 && (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-xs font-black text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <FileText size={14} className="text-teal-600" />
              <span>Request New Scripts</span>
            </h2>
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {assignedPapers.map((paper, idx) => (
                <div key={idx} className="bg-gray-50/50 border border-gray-200/60 rounded-lg hover:border-teal-300 hover:bg-teal-50/30 transition-all group">
                  <div className="p-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{paper.subjectName || paper.paperCode}</div>
                      <div className="text-xs font-bold text-gray-800 leading-tight truncate">{paper.paperName}</div>
                    </div>
                    <button 
                      onClick={() => setRequestModalPaper(paper)}
                      className="shrink-0 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-[10px] uppercase font-bold tracking-wider rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Zap size={12} /> Request
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subject Expertise & Workload Section */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex-1">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-800 mb-4 flex items-center gap-1.5">
            <Briefcase size={14} className="text-teal-600" />
            <span>Subject Expertise Profile</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
            {subjectWorkloads.map((sw) => (
              <div 
                key={sw.subjectId} 
                onClick={() => handleSubjectClick(sw.subjectId)}
                className={`bg-gray-50 border p-3.5 rounded-xl flex flex-col justify-between hover:border-teal-400 transition-all duration-300 shadow-sm cursor-pointer ${
                  filters.subjectFilter === sw.subjectId.toString() ? 'ring-2 ring-teal-500 border-teal-500' : 'border-gray-200/50'
                }`}
              >
                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Subject Domain</span>
                    <h4 className="font-extrabold text-sm text-gray-900 mt-0.5 leading-tight">{sw.subjectName}</h4>
                  </div>
                  
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Allocated Papers</span>
                    {sw.papers.length > 0 ? (
                      <div className="space-y-1.5">
                        {sw.papers.map(p => (
                          <div key={p.paperId} className="flex justify-between items-center bg-white px-2.5 py-1.5 rounded-lg border border-gray-150 shadow-sm">
                            <div className="max-w-[70%]">
                              <span className="text-[10px] font-bold text-gray-800 block truncate leading-tight">{p.paperName}</span>
                            </div>
                            <span className="bg-teal-50 border border-teal-100 text-teal-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase shrink-0">
                              {p.count} scr
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-400 italic block">No scripts allocated</span>
                    )}
                  </div>
                </div>
                
                <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                  <span className="text-[9px] text-gray-500 font-bold uppercase">Total Workload</span>
                  <span className="bg-teal-700 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-sm">
                    {sw.totalCount} scripts
                  </span>
                </div>
              </div>
            ))}
            {subjectWorkloads.length === 0 && (
              <div className="text-center py-6 text-gray-400 text-[10px] font-bold uppercase tracking-wider border border-dashed border-gray-200 rounded-xl">
                No Expertise Subjects configured
              </div>
            )}
          </div>
        </div>

      </div>
      </div>

      <RequestScriptsModal 
        isOpen={!!requestModalPaper}
        onClose={() => setRequestModalPaper(null)}
        paper={requestModalPaper}
        examinerId={user?.id}
        onRequested={() => {
          refreshTable();
          // reload stats to update pending count
          const timer = setTimeout(() => window.location.reload(), 1500);
        }}
      />
    </div>
  );
};

const StatCard = ({ title, value, icon, bgColor, borderClass, subtitle, onClick, isSelected, activeRingClass }) => {
  return (
    <div 
      onClick={onClick}
      className={`bg-white p-4 rounded-xl border ${isSelected ? activeRingClass : 'border-gray-100'} ${borderClass} flex items-center justify-between shadow-sm hover:shadow-md transition-all group h-full cursor-pointer hover:-translate-y-0.5`}
    >
      <div className="flex flex-col">
        <span className="text-xs uppercase font-bold text-slate-400 tracking-wider group-hover:text-teal-600 transition-colors">{title}</span>
        <span className="text-3xl font-black text-slate-800 mt-1.5">{value}</span>
        {subtitle && <span className="text-xs font-medium text-slate-400 mt-1">{subtitle}</span>}
      </div>
      <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center group-hover:scale-110 transition-all shadow-sm`}>
        {icon ? <span className="[&>svg]:w-5 [&>svg]:h-5">{icon}</span> : null}
      </div>
    </div>
  );
};

export default Home;

