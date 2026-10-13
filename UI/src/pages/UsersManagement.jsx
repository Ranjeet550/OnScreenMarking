import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  X,
  CheckCircle,
  Mail,
  UserCheck,
  UserPlus,
  Users,
  Copy,
  Check,
  Building,
  Phone,
  Eye,
  Info,
  AlertCircle,
  Loader,
  Search,
  Sparkles,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Edit2
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import userService from "../services/userService";
import universityService from "../services/universityService";
import subjectService from "../services/subjectService";
import roleService from "../services/roleService";
import AssignRoleModal from "../components/RoleManagement/AssignRoleModal";
import departmentService from "../services/departmentService";
import AddUserModal from "../components/AddUserModal";
import InviteUserModal from "../components/InviteUserModal";
import ColumnFilter from "../components/ColumnFilter";
import { useTable } from "../services/tableService";
import TablePagination from "../components/TablePagination";
import message from '../services/messageService';

export default function UsersManagement() {
  const [searchParams] = useSearchParams();
  const { userType, universityId: userUniversityId, hasPermission } = useAuth();
  const universityIdFromUrl = searchParams.get("universityId");
  const activeUniversityId = userType === "coordinator" ? userUniversityId : universityIdFromUrl;

  const [activeTab, setActiveTab] = useState("all"); // "all", "pending"
  const [universities, setUniversities] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  
  const [subjects, setSubjects] = useState([]);
  const [roles, setRoles] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [savingUserId, setSavingUserId] = useState(null);
  const [showAssignRoleModal, setShowAssignRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const handleEditClick = (user) => {
    setEditingUserId(user.id);
    setEditFormData({
      name: user.name || "",
      email: user.email || "",
      userType: user.userType || "",
      universityId: user.universityId || "",
      isActive: user.isActive ? "true" : "false"
    });
  };

  const handleEditChange = (field, value) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditFormData({});
  };

  const handleSaveEdit = async (userId) => {
    try {
      setSavingUserId(userId);
      await userService.updateUser(userId, {
        name: editFormData.name,
        email: editFormData.email,
        userType: editFormData.userType,
        universityId: editFormData.universityId ? parseInt(editFormData.universityId) : null,
        isActive: editFormData.isActive === "true"
      });
      message.success("User updated successfully!");
      setEditingUserId(null);
      refreshUsers();
    } catch (err) {
      setError(err.message || "Failed to update user.");
    } finally {
      setSavingUserId(null);
    }
  };

  // Define fetch function for useTable to load users with search, role and tab filters
  const fetchFn = useCallback(async (params) => {
    return await userService.getAllUsers(activeUniversityId, { ...params, activeTab });
  }, [activeUniversityId, activeTab]);

  // Centralized hook for users table states
  const {
    items: users,
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
    sortField,
    sortOrder,
    handleSort,
    refresh: refreshUsers
  } = useTable({
    fetchFn,
    initialParams: { pageSize: 10, filters: { isActive: "true" } }
  });

  useEffect(() => {
    if (error) {
      message.error(error);
      setError('');
    }
  }, [error, setError]);

  // Calculate quick count of total pending approvals globally
  const [pendingCount, setPendingCount] = useState(0);
  
  const fetchGlobalCounts = useCallback(() => {
    userService.getUserCounts(activeUniversityId)
      .then(response => {
        setPendingCount(response.pendingUsers || 0);
      })
      .catch(console.error);
  }, [activeUniversityId]);

  useEffect(() => {
    fetchGlobalCounts();
  }, [fetchGlobalCounts]);

  useEffect(() => {
    fetchUniversities();
    fetchRoles();
    if (activeUniversityId) {
      fetchSubjects(activeUniversityId);
    }
  }, [activeUniversityId]);

  // Refresh table when tab changes
  useEffect(() => {
    setPage(1);
  }, [activeTab, setPage]);

  const fetchSubjects = async (universityId) => {
    try {
      const data = await subjectService.getSubjectByUniversity(universityId, { pageSize: 0 });
      setSubjects(data?.items || data || []);
    } catch (err) {
      console.error("Failed to fetch subjects:", err);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await roleService.getAllRoles();
      const loadedRoles = Array.isArray(res) ? res : (res.data || []);
      setRoles(loadedRoles);
      
      const activeRoles = loadedRoles.filter(r => r.isActive);
      const firstEligible = activeRoles.find(role => {
        if (role.roleName.toLowerCase() === 'admin' && userType !== 'admin') return false;
        return true;
      });
    } catch (err) {
      console.error("Failed to fetch roles:", err);
    }
  };

  useEffect(() => {
    const uniId = activeUniversityId;
    if (uniId) {
      departmentService.getDepartmentsByUniversity(uniId, { pageSize: 0 })
        .then(data => setDepartments(data?.items || data || []))
        .catch(console.error);
    } else {
      setDepartments([]);
    }
  }, [activeUniversityId]);

  const fetchUniversities = async () => {
    try {
      const data = await universityService.getAllUniversities();
      setUniversities(data || []);
    } catch (err) {
      setError("Failed to fetch universities");
      console.error(err);
    }
  };

  const handleApprove = async (userId) => {
    try {
      await userService.approveUser(userId);
      message.success("Examiner approved and activated successfully!");
      refreshUsers();
      fetchGlobalCounts();
    } catch (err) {
      setError(err.message || "Failed to approve examiner.");
    }
  };

  return (
    <div className="min-h-screen bg-transparent w-full max-w-none px-4 py-3 lg:px-8 lg:py-4">
      <div className="w-full space-y-4">

        <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                Personnel & Users
              </h1>
              <p className="text-xs text-gray-500 mt-1">Manage system users and permissions</p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {/* Search Bar - Only show on list tabs */}
              {activeTab !== "invite" && (
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500 transition-all w-52">
                  <Search size={13} className="text-gray-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-transparent text-gray-800 placeholder-gray-400 font-semibold text-[11px] focus:outline-none"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="text-gray-300 hover:text-gray-500 transition"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
              
              {hasPermission('CREATE_USER') && (
                <>
                  <button
                    onClick={() => setShowAddUserModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm hover:shadow shrink-0 cursor-pointer"
                  >
                    <UserPlus size={13} />
                    <span>Add User</span>
                  </button>
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm hover:shadow shrink-0 cursor-pointer"
                  >
                    <Mail size={13} />
                    <span>Invite User</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        {/* Main Table Area with Integrated Tab Bar */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
          {/* ── TOOLBAR: Tabs left | Actions right ── */}
          <div className="flex items-center border-b border-gray-100 bg-white">
            {/* LEFT: Tab switcher */}
            <div className="flex items-stretch h-full shrink-0 overflow-x-auto">
              <button
                onClick={() => setActiveTab("all")}
                className={`flex items-center gap-2 px-5 py-4 text-xs font-extrabold tracking-wide border-b-2 transition-all duration-150 whitespace-nowrap cursor-pointer ${
                  activeTab === "all"
                    ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <Users size={13} className={activeTab === "all" ? 'text-teal-700' : 'text-gray-400'} />
                <span>All Users</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                  activeTab === "all" ? "bg-teal-100 text-teal-800" : "bg-gray-100 text-gray-600"
                }`}>
                  {totalCount}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("pending")}
                className={`flex items-center gap-2 px-5 py-4 text-xs font-extrabold tracking-wide border-b-2 transition-all duration-150 whitespace-nowrap cursor-pointer ${
                  activeTab === "pending"
                    ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <UserCheck size={13} className={activeTab === "pending" ? 'text-teal-700' : 'text-gray-400'} />
                <span>Pending Approvals</span>
                {pendingCount > 0 && (
                  <span className="bg-red-500 text-white font-extrabold text-[9px] px-1.5 py-0.5 rounded leading-none animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </button>

            </div>

            {/* DIVIDER */}
            <div className="flex-1" />
          </div>
            {loading && users.length === 0 ? (
              <div className="p-12 text-center text-gray-400 font-bold text-xs flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                <span>Loading users...</span>
              </div>
            ) : users.length === 0 ? (
              <div className="p-16 text-center text-gray-500 font-medium leading-relaxed max-w-sm mx-auto space-y-3">
                <Users className="mx-auto text-gray-455" size={32} />
                <div>
                  <h3 className="font-extrabold text-gray-900 text-xs uppercase tracking-wider">No Records Found</h3>
                  <p className="text-[10px] text-gray-400 mt-1">There are no registered accounts matching your filters or search terms.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-450 uppercase tracking-widest select-none">
                      <th className="py-2.5 md:px-6 px-4">Photo</th>
                      <th className="py-2.5 cursor-pointer hover:text-gray-700 transition-colors group md:px-6 px-4" onClick={() => handleSort('name')}>
                        <div className="flex items-center gap-1">Name {sortField === 'name' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                          <ColumnFilter columnKey="name" currentFilter={filters.name} setFilter={setFilter} placeholder="Filter name..." />
                        </div>
                      </th>
                      <th className="py-2.5 cursor-pointer hover:text-gray-700 transition-colors group md:px-6 px-4" onClick={() => handleSort('email')}>
                        <div className="flex items-center gap-1">Email {sortField === 'email' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                          <ColumnFilter columnKey="email" currentFilter={filters.email} setFilter={setFilter} placeholder="Filter email..." />
                        </div>
                      </th>
                      <th className="py-2.5 cursor-pointer hover:text-gray-700 transition-colors group md:px-6 px-4" onClick={() => handleSort('userType')}>
                        <div className="flex items-center gap-1">
                          System Role {sortField === 'userType' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                          <ColumnFilter 
                            columnKey="userType" 
                            currentFilter={filters.userType} 
                            setFilter={setFilter}
                            options={[
                              { label: 'All Roles', value: '' },
                              { label: 'Examiner', value: 'examiner' },
                              { label: 'Coordinator', value: 'coordinator' },
                              ...(userType === 'admin' ? [{ label: 'Administrator', value: 'admin' }] : [])
                            ]}
                          />
                        </div>
                      </th>
                      <th className="py-2.5 cursor-pointer hover:text-gray-700 transition-colors group md:px-6 px-4" onClick={() => handleSort('universityName')}>
                        <div className="flex items-center gap-1">University {sortField === 'universityName' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                          <ColumnFilter columnKey="universityId" currentFilter={filters.universityId} setFilter={setFilter} placeholder="Filter university..." options={universities.map(u => ({ value: u.universityId, label: u.universityName }))} />
                        </div>
                      </th>
                      <th className="py-2.5 text-center cursor-pointer hover:text-gray-700 transition-colors md:px-6 px-4" onClick={() => handleSort('isActive')}>
                        <div className="flex items-center justify-center gap-1">
                          Status {sortField === 'isActive' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                          <ColumnFilter 
                            columnKey="isActive" 
                            currentFilter={filters.isActive} 
                            setFilter={setFilter}
                            options={[
                              { label: 'All Status', value: '' },
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
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-2.5 md:px-6 px-4">
                          <Link to={`/profile?userId=${user.id}`} title="View Detailed Profile">
                            {user.profileImage ? (
                              <div className="relative group w-8 h-8 rounded-xl overflow-hidden border border-gray-250/70 shadow-sm shrink-0">
                                <img src={user.profileImage} alt={user.name} className="w-full h-full object-cover transition group-hover:scale-105" />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                  <Eye className="text-white" size={12} />
                                </div>
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-200 hover:bg-gray-100 transition-colors shrink-0">
                                <Users size={14} className="text-gray-450" />
                              </div>
                            )}
                          </Link>
                        </td>
                        <td className="py-2.5 font-extrabold text-gray-900 md:px-6 px-4">
                          {editingUserId === user.id ? (
                            <input
                              type="text"
                              value={editFormData.name}
                              onChange={(e) => handleEditChange('name', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 font-semibold"
                            />
                          ) : (
                            user.name
                          )}
                        </td>
                        <td className="py-2.5 text-gray-600 font-medium md:px-6 px-4">
                          {editingUserId === user.id ? (
                            <input
                              type="email"
                              value={editFormData.email}
                              onChange={(e) => handleEditChange('email', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
                            />
                          ) : (
                            user.email
                          )}
                        </td>
                        <td className="py-2.5 md:px-6 px-4">
                          {editingUserId === user.id ? (
                            <select
                              value={editFormData.userType}
                              onChange={(e) => handleEditChange('userType', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 bg-white"
                            >
                              {(roles.length > 0 ? roles : [
                                { roleName: 'Examiner' },
                                { roleName: 'Coordinator' },
                                { roleName: 'Admin' }
                              ]).map(r => (
                                <option key={r.roleName} value={r.roleName.toLowerCase()}>
                                  {r.roleName}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`px-2 py-0.5 text-[9px] font-black rounded-lg capitalize border tracking-wider ${
                              user.userType === "admin"
                                ? "bg-teal-50 text-teal-700 border-teal-100"
                                : user.userType === "coordinator"
                                  ? "bg-amber-50 text-amber-700 border-amber-100"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-100"
                            }`}>
                              {user.userType}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-gray-600 text-sm font-semibold md:px-6 px-4">
                          {editingUserId === user.id ? (
                            <select
                              value={editFormData.universityId}
                              onChange={(e) => handleEditChange('universityId', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 bg-white max-w-[140px] truncate"
                            >
                              <option value="">None</option>
                              {universities.map(u => (
                                <option key={u.universityId} value={u.universityId}>
                                  {u.universityName}
                                </option>
                              ))}
                            </select>
                          ) : (
                            user.university?.universityName || "-"
                          )}
                        </td>
                        <td className="py-2.5 text-center md:px-6 px-4">
                          {editingUserId === user.id ? (
                            <select
                              value={editFormData.isActive}
                              onChange={(e) => handleEditChange('isActive', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500 bg-white"
                            >
                              <option value="true">Active</option>
                              <option value="false">Inactive</option>
                            </select>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-[9px] uppercase tracking-wider border ${
                              user.isActive
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : "bg-rose-50 text-rose-700 border-rose-100"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
                              {user.isActive ? "Active" : "Pending / Inactive"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap md:px-6 px-4">
                          {editingUserId === user.id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleSaveEdit(user.id)}
                                disabled={savingUserId === user.id}
                                className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider transition cursor-pointer shadow-sm disabled:opacity-50"
                              >
                                {savingUserId === user.id ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={savingUserId === user.id}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-bold text-[10px] uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : activeTab === "pending" ? (
                            hasPermission('UPDATE_USER') && (
                              <button
                                onClick={() => handleApprove(user.id)}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-[10px] uppercase tracking-wider transition cursor-pointer inline-flex items-center gap-1 shadow-sm"
                              >
                                <UserCheck size={12} />
                                <span>Approve</span>
                              </button>
                            )
                          ) : (
                            hasPermission('UPDATE_USER') && (
                              <button
                                onClick={() => handleEditClick(user)}
                                className="p-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit2 size={16} />
                              </button>
                            )
                          )}
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

      {/* Assign Role Modal */}
      {showAssignRoleModal && selectedUser && (
        <AssignRoleModal
          user={selectedUser}
          onClose={() => {
            setShowAssignRoleModal(false);
            setSelectedUser(null);
          }}
          onSubmit={async (roleId) => {
            const role = roles.find(r => r.roleId === roleId);
            const roleName = role ? role.roleName.toLowerCase() : 'examiner';
            try {
              await userService.updateUser(selectedUser.id, {
                userType: roleName,
                departmentId: selectedUser.departmentId,
                universityId: selectedUser.universityId
              });
              message.success("Role assigned successfully!");
              
              setShowAssignRoleModal(false);
              setSelectedUser(null);
              refreshUsers();
              
            } catch (err) {
              setError(err.message || "Failed to assign role.");
            }
          }}
        />
      )}

      {/* Add New User Modal */}
      <AddUserModal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        onSuccess={(msg) => {
          message.success(msg);
          
          refreshUsers();
          
        }}
        activeUniversityId={activeUniversityId}
      />
      
      {/* Invite User Modal */}
      <InviteUserModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSuccess={(msg) => {
          message.success(msg);
          refreshUsers();
        }}
        activeUniversityId={activeUniversityId}
        universities={universities}
        departments={departments}
        roles={roles}
      />
    </div>
  );
}

