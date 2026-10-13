import React, { useState, useEffect, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Search, 
  Download, 
  Filter, 
  RefreshCw, 
  Calendar, 
  AlertCircle,
  Clock,
  UserCheck,
  UserX,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import attendanceService from '../services/attendanceService';
import userService from '../services/userService';
import message from '../services/messageService';
import ProjectConfigHeader from '../components/ProjectConfigHeader';

export default function Attendance({ isTab = false }) {
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  

  // File parsing states
  const [parsedData, setParsedData] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [onlyShowErrors, setOnlyShowErrors] = useState(false);
  const fileInputRef = useRef(null);

  // Filters and logs pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    present: 0,
    absent: 0,
    halfDay: 0
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    calculateStats();
  }, [attendanceLogs]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Fetch users (examiners) for client-side validation
      const usersData = await userService.getAllUsers();
      setUsers(usersData.data || []);
      
      // Fetch historical attendance records
      await fetchAttendanceLogs();
    } catch (err) {
      message.error(err.message || 'Failed to load initial data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceLogs = async (filters = {}) => {
    try {
      const data = await attendanceService.getAllAttendance(filters);
      setAttendanceLogs(data.data || []);
    } catch (err) {
      message.error(err.message || 'Failed to load attendance logs');
    }
  };

  const calculateStats = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayLogs = (attendanceLogs || []).filter(log => log?.date && (typeof log.date === 'string' ? log.date.split('T')[0] : '') === todayStr);

    setStats({
      total: (attendanceLogs || []).length,
      present: todayLogs.filter(log => (log?.status || '').toLowerCase() === 'present').length,
      absent: todayLogs.filter(log => (log?.status || '').toLowerCase() === 'absent').length,
      halfDay: todayLogs.filter(log => ['half-day', 'half day'].includes((log?.status || '').toLowerCase())).length
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = (file) => {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (fileExtension !== 'xlsx' && fileExtension !== 'xls' && fileExtension !== 'csv') {
      message.error('Please upload a valid Excel file (.xlsx, .xls) or CSV template.');
      return;
    }

    setLoading(true);
    message.error(null);
    message.success(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Convert to array of arrays
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        if (data.length === 0) {
          throw new Error("The uploaded Excel sheet is empty.");
        }

        const headers = data[0].map(h => h ? h.toString().trim() : '');
        const rows = data.slice(1);

        // Column Index Mapping
        const emailIdx = headers.findIndex(h => h.toLowerCase() === 'email');
        const dateIdx = headers.findIndex(h => h.toLowerCase() === 'date');
        const statusIdx = headers.findIndex(h => h.toLowerCase() === 'status');
        const remarksIdx = headers.findIndex(h => h.toLowerCase() === 'remarks');

        if (emailIdx === -1 || dateIdx === -1 || statusIdx === -1) {
          throw new Error("Missing required columns! Excel sheet must contain 'Email', 'Date', and 'Status' columns.");
        }

        const formattedRows = rows
          .map((row, index) => {
            const email = row[emailIdx] ? row[emailIdx].toString().trim() : '';
            let rawDate = row[dateIdx] ? row[dateIdx] : '';
            const status = row[statusIdx] ? row[statusIdx].toString().trim() : '';
            const remarks = remarksIdx !== -1 && row[remarksIdx] ? row[remarksIdx].toString().trim() : '';

            // Handle Excel Numeric Serial Dates
            let dateStr = '';
            if (typeof rawDate === 'number') {
              const utc_days = Math.floor(rawDate - 25569);
              const utc_value = utc_days * 86400;
              const date_info = new Date(utc_value * 1000);
              dateStr = date_info.toISOString().split('T')[0];
            } else if (rawDate) {
              const d = new Date(rawDate);
              if (!isNaN(d.getTime())) {
                dateStr = d.toISOString().split('T')[0];
              } else {
                dateStr = rawDate.toString();
              }
            }

            return {
              rowNum: index + 2,
              email,
              date: dateStr,
              status,
              remarks
            };
          })
          .filter(r => r.email || r.date || r.status); // Filter completely blank rows

        validateParsedRows(formattedRows);
      } catch (err) {
        message.error(err.message || 'Failed to parse Excel file. Ensure it matches the template.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const validateParsedRows = (rows) => {
    const validated = rows.map(row => {
      let isValid = true;
      let errorMsg = '';

      const matchedUser = users.find(u => u.email.toLowerCase() === row.email.toLowerCase());

      if (!row.email) {
        isValid = false;
        errorMsg = 'Email is missing';
      } else if (!matchedUser) {
        isValid = false;
        errorMsg = 'Examiner email not found in database';
      } else if (matchedUser.userType?.toLowerCase() !== 'examiner' && matchedUser.userType?.toLowerCase() !== 'admin') {
        isValid = false;
        errorMsg = `User is registered as a ${matchedUser.userType}, not an examiner`;
      } else if (!row.date) {
        isValid = false;
        errorMsg = 'Date is missing';
      } else if (isNaN(new Date(row.date).getTime())) {
        isValid = false;
        errorMsg = 'Invalid date format';
      } else if (!row.status) {
        isValid = false;
        errorMsg = 'Status is missing';
      } else if (!['present', 'absent', 'half-day', 'half day'].includes(row.status.toLowerCase())) {
        isValid = false;
        errorMsg = 'Invalid status (Must be Present, Absent, or Half-Day)';
      }

      return {
        ...row,
        isValid,
        errorMsg,
        name: matchedUser ? matchedUser.name : 'Unknown User'
      };
    });

    setParsedData(validated);
    setShowPreview(true);
  };

  const handleImport = async () => {
    const validRows = parsedData.filter(row => row.isValid);
    const invalidCount = parsedData.length - validRows.length;

    if (validRows.length === 0) {
      message.error("No valid rows found to import. Please correct the Excel sheet and try again.");
      return;
    }

    if (invalidCount > 0) {
      const confirmProceed = window.confirm(
        `There are ${invalidCount} invalid rows in your sheet. Only the ${validRows.length} valid rows will be imported. Do you want to proceed?`
      );
      if (!confirmProceed) return;
    }

    try {
      setImporting(true);
      message.error(null);
      message.success(null);

      // Send valid rows to server
      const payload = validRows.map(row => ({
        email: row.email,
        date: row.date,
        status: normalizeStatus(row.status),
        remarks: row.remarks
      }));

      const res = await attendanceService.bulkImportAttendance(payload);
      
      if (res.data?.success) {
        message.success(`Successfully imported ${res.data.totalImported} attendance records!`);
        setShowPreview(false);
        setParsedData([]);
        await fetchInitialData();
      } else {
        throw new Error(res.message || "Failed to complete bulk import.");
      }
    } catch (err) {
      message.error(err.message || "An error occurred during import.");
    } finally {
      setImporting(false);
    }
  };

  const normalizeStatus = (status) => {
    const lower = status.toLowerCase().trim();
    if (lower === 'present') return 'Present';
    if (lower === 'absent') return 'Absent';
    if (lower === 'half-day' || lower === 'half day') return 'Half-Day';
    return 'Present';
  };

  const handleDelete = async (attendanceId) => {
    if (!window.confirm("Are you sure you want to delete this attendance record?")) return;

    try {
      message.error(null);
      message.success(null);
      await attendanceService.deleteAttendance(attendanceId);
      message.success("Attendance record deleted successfully.");
      await fetchAttendanceLogs({ status: statusFilter, date: dateFilter });
    } catch (err) {
      message.error(err.message || "Failed to delete record.");
    }
  };

  const handleApplyFilter = async () => {
    setLoading(true);
    await fetchAttendanceLogs({
      status: statusFilter,
      date: dateFilter
    });
    setLoading(false);
  };

  const handleResetFilter = async () => {
    setStatusFilter('');
    setDateFilter('');
    setLoading(true);
    await fetchAttendanceLogs({});
    setLoading(false);
  };

  const downloadTemplate = () => {
    const headers = ['Email', 'Date', 'Status', 'Remarks'];
    const sampleRows = [
      ['examiner1@example.com', '2026-05-21', 'Present', 'Completed paper marking session'],
      ['examiner2@example.com', '2026-05-21', 'Absent', 'Sick leave request'],
      ['examiner3@example.com', '2026-05-21', 'Half-Day', 'Arrived late']
    ];

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...sampleRows.map(e => e.join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "attendance_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLogs = (attendanceLogs || []).filter(log =>
    (log?.examinerName || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (log?.examinerEmail || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const previewRowsToDisplay = onlyShowErrors 
    ? parsedData.filter(row => !row.isValid) 
    : parsedData;

  const content = (
    <div className="w-full space-y-4">
      
      {/* Header */}
        <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                Examiner Attendance
              </h1>
              <p className="text-xs text-gray-500 mt-1">Upload attendance sheets, perform schema mapping, and log active sessions</p>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 rounded-md font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm hover:shadow shrink-0 cursor-pointer"
            >
              <Download size={13} />
              <span>Download Template</span>
            </button>
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid lg:grid-cols-4 gap-4 grid-cols-1 md:grid-cols-2">
          <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-50 text-teal-700 rounded-xl flex items-center justify-center shrink-0">
              <Calendar size={20} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Total Logs</p>
              <h3 className="text-xl font-black text-gray-900">{stats.total}</h3>
            </div>
          </div>
          <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center shrink-0">
              <UserCheck size={20} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Present Today</p>
              <h3 className="text-xl font-black text-gray-900">{stats.present}</h3>
            </div>
          </div>
          <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-50 text-rose-700 rounded-xl flex items-center justify-center shrink-0">
              <UserX size={20} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Absent Today</p>
              <h3 className="text-xl font-black text-gray-900">{stats.absent}</h3>
            </div>
          </div>
          <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 text-amber-700 rounded-xl flex items-center justify-center shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Half-Day Today</p>
              <h3 className="text-xl font-black text-gray-900">{stats.halfDay}</h3>
            </div>
          </div>
        </div>

        {/* Upload Zone */}
        {!showPreview && (
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-teal-500 p-12 text-center transition-all shadow-sm cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".xlsx,.xls,.csv" 
              className="hidden" 
            />
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-teal-50 group-hover:bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center transition-all">
                <Upload size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  Upload Excel Attendance File
                </h3>
                <p className="text-sm text-gray-500">
                  Drag and drop your spreadsheet here, or browse local files
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-2 text-xs text-gray-500 border border-gray-100 font-medium">
                Required: <span className="font-bold text-gray-700">Email</span>, <span className="font-bold text-gray-700">Date</span>, <span className="font-bold text-gray-700">Status</span>
              </div>
            </div>
          </div>
        )}

        {/* Live Validation & Import Preview */}
        {showPreview && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fadeIn">
            
            {/* Preview Banner */}
            <div className="bg-gradient-to-r from-teal-50 to-indigo-50 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4 md:p-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FileSpreadsheet className="text-teal-700" />
                  Excel Import Preview
                </h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  We parsed {parsedData.length} records. Please review validations before importing.
                </p>
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto">
                <button
                  onClick={handleImport}
                  disabled={importing || parsedData.filter(row => row.isValid).length === 0}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm transition disabled:opacity-50"
                >
                  {importing ? (
                    <RefreshCw className="animate-spin" size={18} />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  Import Valid ({parsedData.filter(row => row.isValid).length})
                </button>
                <button
                  onClick={() => {
                    setShowPreview(false);
                    setParsedData([]);
                  }}
                  className="flex-1 md:flex-none border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 px-5 py-2.5 rounded-xl font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Parsing Statistics & Filters */}
            <div className="border-b border-gray-100 flex flex-col sm:flex-row justify-between gap-4 bg-gray-50/50 p-4 md:p-6">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-sm text-green-700 font-bold bg-green-50 px-3 py-1 rounded-full border border-green-100">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                  {parsedData.filter(row => row.isValid).length} Ready
                </div>
                {parsedData.filter(row => !row.isValid).length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-red-700 font-bold bg-red-50 px-3 py-1 rounded-full border border-red-100">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                    {parsedData.filter(row => !row.isValid).length} Error(s)
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer text-sm font-semibold text-gray-700 select-none">
                <input
                  type="checkbox"
                  checked={onlyShowErrors}
                  onChange={(e) => setOnlyShowErrors(e.target.checked)}
                  className="w-4.5 h-4.5 rounded text-teal-700 border-gray-300 focus:ring-teal-500"
                />
                Show errors only
              </label>
            </div>

            {/* Preview Table */}
            <div className="overflow-x-auto">
              <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-bold text-xs uppercase border-b border-gray-100">
                    <th className="py-4 text-center md:px-6 px-4">Row</th>
                    <th className="py-4 md:px-6 px-4">Email</th>
                    <th className="py-4 md:px-6 px-4">Examiner Name</th>
                    <th className="py-4 md:px-6 px-4">Date</th>
                    <th className="py-4 md:px-6 px-4">Status</th>
                    <th className="py-4 md:px-6 px-4">Remarks</th>
                    <th className="py-4 text-right md:px-6 px-4">Validation Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {previewRowsToDisplay.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-8 text-gray-500 font-medium">
                        No rows to display.
                      </td>
                    </tr>
                  ) : (
                    previewRowsToDisplay.map((row, index) => (
                      <tr 
                        key={index} 
                        className={`hover:bg-gray-50 transition-colors ${
                          !row.isValid ? 'bg-red-50/10' : ''
                        }`}
                      >
                        <td className="py-2.5 text-center text-gray-400 font-semibold md:px-6 px-4">
                          {row.rowNum}
                        </td>
                        <td className="py-2.5 font-semibold text-gray-900 md:px-6 px-4">
                          {row.email}
                        </td>
                        <td className="py-2.5 text-gray-600 md:px-6 px-4">
                          {row.name}
                        </td>
                        <td className="py-2.5 text-gray-600 md:px-6 px-4">
                          {row.date}
                        </td>
                        <td className="py-2.5 md:px-6 px-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                            row.status.toLowerCase() === 'present'
                              ? 'bg-green-100 text-green-700'
                              : row.status.toLowerCase() === 'absent'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-gray-500 max-w-xs truncate md:px-6 px-4">
                          {row.remarks || '-'}
                        </td>
                        <td className="py-2.5 text-right md:px-6 px-4">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100/50 border border-green-200 px-2.5 py-1 rounded-md">
                              <CheckCircle2 size={14} />
                              Ready to Import
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100/50 border border-red-200 px-2.5 py-1 rounded-md">
                              <AlertTriangle size={14} />
                              {row.errorMsg}
                            </span>
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

        {/* Filter Toolbar */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search */}
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500 transition-all flex-1 w-full">
              <Search size={13} className="text-gray-400 shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search examiner..."
                className="w-full bg-transparent text-gray-800 placeholder-gray-400 font-semibold text-[11px] focus:outline-none"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs text-gray-700 focus:outline-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Half-Day">Half-Day</option>
            </select>

            {/* Date Filter */}
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-800 focus:outline-none"
            />

            {/* Buttons */}
            <button
              onClick={handleApplyFilter}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs uppercase tracking-wider rounded-md transition shadow-sm cursor-pointer"
            >
              Apply
            </button>
            <button
              onClick={handleResetFilter}
              className="px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-bold text-xs uppercase tracking-wider rounded-md transition cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>

        {/* History Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="py-2.5 border-b border-gray-100 flex justify-between items-center md:px-6 px-4">
            <div>
              <h3 className="font-bold text-gray-900 text-base">Attendance Log Registry</h3>
              <p className="text-xs text-gray-500 mt-0.5">Showing compiled attendance records</p>
            </div>
            <button 
              onClick={fetchInitialData}
              className="p-2 text-gray-500 hover:text-teal-700 rounded-md hover:bg-teal-50 transition"
              title="Reload"
            >
              <RefreshCw size={18} className={loading && attendanceLogs.length > 0 ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="overflow-x-auto">
            {loading && attendanceLogs.length === 0 ? (
              <div className="py-20 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600 mx-auto mb-4" />
                <p className="text-gray-500 font-semibold">Loading attendance logs...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-20 text-center">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-bold">No attendance records found</p>
                <p className="text-sm text-gray-400 mt-1">Try broadening your search term or upload a new spreadsheet.</p>
              </div>
            ) : (
              <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/30 text-gray-500 font-bold text-xs uppercase border-b border-gray-100">
                    <th className="py-4 md:px-6 px-4">Date</th>
                    <th className="py-4 md:px-6 px-4">Examiner</th>
                    <th className="py-4 md:px-6 px-4">Email</th>
                    <th className="py-4 md:px-6 px-4">Status</th>
                    <th className="py-4 md:px-6 px-4">Remarks</th>
                    <th className="py-4 text-right md:px-6 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {filteredLogs.map((log) => (
                    <tr key={log.attendanceId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-2.5 font-semibold text-gray-900 md:px-6 px-4">
                        {log?.date ? new Date(log.date).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : '-'}
                      </td>
                      <td className="py-2.5 font-medium text-gray-800 md:px-6 px-4">
                        {log?.examinerName || 'Unknown'}
                      </td>
                      <td className="py-2.5 text-gray-600 md:px-6 px-4">
                        {log?.examinerEmail || '-'}
                      </td>
                      <td className="py-2.5 md:px-6 px-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                          (log?.status || '').toLowerCase() === 'present'
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : (log?.status || '').toLowerCase() === 'absent'
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : 'bg-amber-100 text-amber-700 border border-amber-200'
                        }`}>
                          {log?.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="py-2.5 text-gray-500 max-w-xs truncate md:px-6 px-4">
                        {log.remarks || '-'}
                      </td>
                      <td className="py-2.5 text-right md:px-6 px-4">
                        <button
                          onClick={() => handleDelete(log.attendanceId)}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                          title="Delete record"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
  );

  if (isTab) return content;
  return (
    <div className="min-h-screen bg-transparent w-full max-w-none px-4 py-3 lg:px-8 lg:py-4">
      {content}
    </div>
  );
}

