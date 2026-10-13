import React, { useState, useEffect, useCallback } from 'react';
import { Edit2, Trash2, X, Search, ArrowUp, ArrowDown, ArrowUpDown, Plus } from 'lucide-react';
import { useTable } from '../services/tableService';
import TablePagination from '../components/TablePagination';
import ColumnFilter from '../components/ColumnFilter';
import roleService from '../services/roleService';
import PermissionSelector from '../components/RoleManagement/PermissionSelector';
import { useAuth } from '../context/AuthContext';
import message from '../services/messageService';

export default function RoleManagement() {
  const { hasPermission } = useAuth();
  const fetchRolesFn = useCallback(async (params) => {
    return await roleService.getAllRoles(params);
  }, []);

  const {
    items: tableRoles,
    totalCount,
    totalPages,
    page,
    setPage,
    pageSize,
    setPageSize,
    search,
    setSearch,
    loading: tableLoading,
    filters,
    setFilter,
    sortField,
    sortOrder,
    handleSort
  } = useTable({
    fetchFn: fetchRolesFn,
    initialParams: { pageSize: 10 }
  });

  const [permissions, setPermissions] = useState([]);
  const [error, setError] = useState(null);

  // Modal / Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formValues, setFormValues] = useState({
    roleName: '',
    description: '',
    hierarchyLevel: 1,
    isActive: true,
    permissions: []
  });

  const [localSearch, setLocalSearch] = useState('');

  // Sync external search clears (if any)
  useEffect(() => {
    if (search === '') setLocalSearch('');
  }, [search]);

  // Debounce the input to useTable's search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== search) {
        setSearch(localSearch);
      }
    }, 400); // 400ms UI debounce
    return () => clearTimeout(handler);
  }, [localSearch, setSearch, search]);

  // Fetch permissions separately
  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    try {
      const permissionsData = await roleService.getAllPermissions();
      setPermissions(permissionsData.data || []);
      setError(null);
    } catch (err) {
      const errMsg = err.message || 'Failed to fetch permissions';
      setError(errMsg);
      message.error(errMsg);
      console.error('Error fetching permissions:', err);
    }
  };

  const handleOpenNewModal = () => {
    setEditingRole(null);
    setFormValues({
      roleName: '',
      description: '',
      hierarchyLevel: tableRoles.length + 1,
      isActive: true,
      permissions: []
    });
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (role) => {
    setEditingRole(role);
    setFormValues({
      roleName: role.roleName,
      description: role.description || '',
      hierarchyLevel: role.hierarchyLevel || 1,
      isActive: role.isActive ?? true,
      permissions: role.permissionsList || []
    });
    setError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRole(null);
    setFormValues({
      roleName: '',
      description: '',
      hierarchyLevel: 1,
      isActive: true,
      permissions: []
    });
    setError(null);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();

    if (!formValues.roleName.trim()) {
      const msg = 'Role name is required';
      setError(msg);
      message.error(msg);
      return;
    }

    if (formValues.permissions.length === 0) {
      const msg = 'At least one permission must be selected';
      setError(msg);
      message.error(msg);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        roleName: formValues.roleName.trim(),
        description: formValues.description?.trim() || '',
        hierarchyLevel: formValues.hierarchyLevel || 1,
        isActive: formValues.isActive,
        permissions: formValues.permissions
      };

      if (editingRole) {
        await roleService.updateRole(editingRole.roleId, payload);
        message.success(`Role "${formValues.roleName}" updated successfully`);
      } else {
        await roleService.createRole(payload);
        message.success(`Role "${formValues.roleName}" created successfully`);
      }

      await fetchPermissions(); // Reload permissions to ensure they're up to date
      setPage(1); // Refresh the table
      handleCloseModal();
    } catch (err) {
      const errMsg = err.message || 'Failed to save role';
      setError(errMsg);
      message.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRole = async (roleId, roleName) => {
    if (window.confirm(`Are you sure you want to delete role "${roleName}"?`)) {
      try {
        setError(null);
        await roleService.deleteRole(roleId);
        message.success(`Role "${roleName}" deleted successfully`);
        setPage(1); // Refresh via useTable
      } catch (err) {
        const errMsg = err.message || 'Failed to delete role';
        setError(errMsg);
        message.error(errMsg);
      }
    }
  };

  return (
    <div className="min-h-screen bg-transparent w-full max-w-none px-4 py-3 lg:px-8 lg:py-4">
      <div className="w-full space-y-4">

        {/* Notifications */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-red-700 shadow-sm">
            <p className="text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Main Header Card */}
        <div className="bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">
                Role Management
              </h1>
              <p className="text-xs text-gray-500 mt-1">Manage system roles and permissions</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search roles..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 w-full bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
                />
                <Search className="absolute left-3 top-2.5 text-gray-400" size={14} />
              </div>
              
              {hasPermission('CREATE_ROLE') && (
                <button
                  type="button"
                  onClick={handleOpenNewModal}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm hover:shadow shrink-0 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>New Role</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className=" block w-full overflow-x-auto whitespace-nowrap md:table md:whitespace-normal w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black text-gray-450 uppercase tracking-widest select-none">
                  <th className="py-2.5 cursor-pointer hover:text-gray-700 md:px-6 px-4" onClick={() => handleSort('hierarchyLevel')}>
                    <div className="flex items-center gap-1">
                      ID
                      {sortField === 'hierarchyLevel' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                    </div>
                  </th>
                  <th className="py-2.5 cursor-pointer hover:text-gray-700 md:px-6 px-4" onClick={() => handleSort('roleName')}>
                    <div className="flex items-center gap-1">
                      Name
                      {sortField === 'roleName' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                    </div>
                  </th>
                  <th className="py-2.5 text-center cursor-pointer hover:text-gray-700 md:px-6 px-4" onClick={() => handleSort('isActive')}>
                    <div className="flex items-center justify-center gap-1">
                      Status
                      {sortField === 'isActive' ? (sortOrder === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-gray-300"/>}
                      <ColumnFilter 
                        columnKey="isActive" 
                        currentFilter={filters.isActive} 
                        setFilter={setFilter}
                        options={[
                          { label: 'Active', value: 'true' },
                          { label: 'Disabled', value: 'false' }
                        ]}
                      />
                    </div>
                  </th>
                  <th className="py-2.5 text-right md:px-6 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {tableLoading && tableRoles.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-12 text-center text-gray-400">
                      <div className="inline-block animate-spin rounded-full h-7 w-7 border-2 border-teal-600 border-t-transparent mb-2"></div>
                      <p>Loading roles...</p>
                    </td>
                  </tr>
                ) : tableRoles.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-16 text-center text-gray-500 font-medium leading-relaxed max-w-sm mx-auto space-y-3">
                      <div>
                        <h3 className="font-extrabold text-gray-900 text-xs uppercase tracking-wider">No Roles Found</h3>
                        <p className="text-[10px] text-gray-400 mt-1">There are no roles matching your criteria.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  tableRoles.map((role) => (
                    <tr key={role.roleId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-2.5 text-gray-500 font-medium md:px-6 px-4">
                        #{role.roleId}
                      </td>
                      <td className="py-2.5 font-extrabold text-gray-900 md:px-6 px-4">
                        {role.roleName}
                      </td>
                      <td className="py-2.5 text-center md:px-6 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-[9px] uppercase tracking-wider border ${
                          role.isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-rose-50 text-rose-700 border-rose-100"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${role.isActive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
                          {role.isActive ? "Enable" : "Disable"}
                        </span>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap md:px-6 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {hasPermission('UPDATE_ROLE') && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(role)}
                              title="Edit Role"
                              className="p-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 size={16} />
                            </button>
                          )}
                          {hasPermission('DELETE_ROLE') && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRole(role.roleId, role.roleName)}
                              title="Delete Role"
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <TablePagination 
            page={page} 
            totalPages={totalPages} 
            totalCount={totalCount} 
            pageSize={pageSize} 
            setPage={setPage} 
            setPageSize={setPageSize} 
          />
        </div>

      </div>

      {/* Role Creation / Edit Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-gray-100 shadow-2xl flex flex-col animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">
                  {editingRole ? 'Edit Role' : 'Add New Role'}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 rounded-md transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto space-y-5 p-4 md:p-6">
              
              {/* Name Row */}
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Role Name *</label>
                <input
                  type="text"
                  required
                  value={formValues.roleName}
                  onChange={(e) => setFormValues({ ...formValues, roleName: e.target.value })}
                  placeholder="e.g. Administrator"
                  className="w-full bg-gray-50/50 border border-gray-200 text-gray-900 px-4 py-2 rounded-xl text-xs focus:outline-none focus:border-teal-600 font-medium transition"
                />
              </div>

              {/* Status Row */}
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Status *</label>
                <div className="flex items-center gap-6 text-xs text-gray-700 bg-gray-50/50 border border-gray-200 px-4 py-2 rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="roleStatus"
                      checked={formValues.isActive === true}
                      onChange={() => setFormValues({ ...formValues, isActive: true })}
                      className="w-3.5 h-3.5 text-teal-700 focus:ring-teal-500 accent-teal-600"
                    />
                    <span className="font-semibold">Enable</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="roleStatus"
                      checked={formValues.isActive === false}
                      onChange={() => setFormValues({ ...formValues, isActive: false })}
                      className="w-3.5 h-3.5 text-teal-700 focus:ring-teal-500 accent-teal-600"
                    />
                    <span className="font-semibold">Disable</span>
                  </label>
                </div>
              </div>

              {/* Permission Row */}
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Permissions</label>
                <div className="bg-gray-50/50 border border-gray-200 rounded-xl p-4">
                  <PermissionSelector
                    permissions={permissions}
                    selectedPermissions={formValues.permissions}
                    onChange={(selectedPerms) => setFormValues({ ...formValues, permissions: selectedPerms })}
                  />
                </div>
              </div>
            </form>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={submitting}
                className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-md font-bold text-xs cursor-pointer transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitForm}
                disabled={submitting}
                className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-md font-bold text-xs cursor-pointer shadow transition disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

