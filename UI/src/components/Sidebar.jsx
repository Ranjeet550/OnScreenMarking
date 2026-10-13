import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Home, FileText, BarChart3, Settings, Users, BookOpen, PenTool, Layers, School, Building2, Calendar, ClipboardList, Shield, UserCheck, GraduationCap, Zap } from 'lucide-react';
import { encryptId } from '../utils/encryption';

const Sidebar = () => {
  const { userType, hasPermission } = useAuth();
  const location = useLocation();
  const currentParams = new URLSearchParams(location.search);
  const currentTab = currentParams.get('tab') || '';
  
  const selectedProjectId = sessionStorage.getItem('selectedProjectId');
  const encryptedProjId = selectedProjectId ? encryptId(selectedProjectId) : '';

  const getMenuItems = () => {
    const items = [];

    const papersPath = userType === 'admin' 
      ? (encryptedProjId ? `/admin/papers?projectId=${encryptedProjId}` : '/admin/papers')
      : (encryptedProjId ? `/papers?projectId=${encryptedProjId}` : '/papers');

    const allocationPath = userType === 'admin'
      ? (encryptedProjId ? `/admin/project-dashboard?projectId=${encryptedProjId}&tab=allocations` : '/admin/project-dashboard?tab=allocations')
      : (encryptedProjId ? `/project-dashboard?projectId=${encryptedProjId}&tab=allocations` : '/project-dashboard?tab=allocations');

    if (userType === 'admin') {
      items.push({ icon: <Home size={20} />, label: 'Dashboard', path: '/admin/dashboard' });
      items.push({ icon: <School size={20} />, label: 'Universities', path: '/admin/universities' });
      items.push({ icon: <Building2 size={20} />, label: 'Colleges', path: '/admin/colleges' });
      items.push({ icon: <Building2 size={20} />, label: 'Departments', path: '/admin/departments' });
      items.push({ icon: <GraduationCap size={20} />, label: 'Courses', path: '/admin/courses' });
      items.push({ icon: <BookOpen size={20} />, label: 'Subjects', path: '/admin/subjects' });
      items.push({ icon: <Calendar size={20} />, label: 'Sessions & Projects', path: '/admin/sessions' });
      items.push({ icon: <FileText size={20} />, label: 'Papers', path: papersPath });
      items.push({ icon: <Layers size={20} />, label: 'Section Masters', path: '/admin/section-masters' });
      items.push({ icon: <Layers size={20} />, label: 'Question Types', path: '/admin/question-types' });
      
      if (hasPermission("READ_ALLOCATION")) {
        items.push({ icon: <Zap size={20} />, label: 'Script Allocation', path: allocationPath });
      }
      if (hasPermission("READ_USER")) {
        items.push({ icon: <Users size={20} />, label: 'Users', path: '/admin/users' });
      }
      if (hasPermission("READ_ROLE")) {
        items.push({ icon: <Shield size={20} />, label: 'Roles & Permissions', path: '/admin/role-management' });
      }
      if (hasPermission("VIEW_LOGS")) {
        items.push({ icon: <UserCheck size={20} />, label: 'Attendance Audit', path: '/admin/audit' });
      }
      items.push({ icon: <Settings size={20} />, label: 'Settings', path: '/settings' });
    } else if (userType === 'coordinator') {
      items.push({ icon: <Home size={20} />, label: 'Dashboard', path: '/coordinator/dashboard' });
      items.push({ icon: <Building2 size={20} />, label: 'Departments', path: '/departments' });
      items.push({ icon: <GraduationCap size={20} />, label: 'Courses', path: '/courses' });
      items.push({ icon: <BookOpen size={20} />, label: 'Subjects', path: '/subjects' });
      items.push({ icon: <Calendar size={20} />, label: 'Sessions & Projects', path: '/sessions' });
      items.push({ icon: <FileText size={20} />, label: 'Papers', path: papersPath });
      items.push({ icon: <Layers size={20} />, label: 'Section Masters', path: '/section-masters' });
      items.push({ icon: <Layers size={20} />, label: 'Question Types', path: '/question-types' });

      if (hasPermission("READ_ALLOCATION")) {
        items.push({ icon: <Zap size={20} />, label: 'Script Allocation', path: allocationPath });
      }
      if (hasPermission("READ_USER")) {
        items.push({ icon: <Users size={20} />, label: 'Users', path: '/admin/users' });
      }
      if (hasPermission("READ_ROLE")) {
        items.push({ icon: <Shield size={20} />, label: 'Roles & Permissions', path: '/admin/role-management' });
      }
      if (hasPermission("VIEW_LOGS")) {
        items.push({ icon: <UserCheck size={20} />, label: 'Attendance Audit', path: '/admin/audit' });
      }
      items.push({ icon: <Settings size={20} />, label: 'Settings', path: '/settings' });
    } else if (userType === 'examiner') {
      items.push({ icon: <Home size={20} />, label: 'Dashboard', path: '/' });
      
      if (hasPermission("READ_SCRIPT")) {
        items.push({ icon: <FileText size={20} />, label: 'Scripts', path: '/scripts' });
      }
      if (hasPermission("READ_MARKING")) {

      }
      
      if (hasPermission("VIEW_REPORTS")) {
        items.push({ icon: <BarChart3 size={20} />, label: 'Reports', path: '/reports' });
      }
      if (hasPermission("READ_USER")) {
        items.push({ icon: <Users size={20} />, label: 'Examiners', path: '/examiners' });
      }
      items.push({ icon: <BookOpen size={20} />, label: 'Subjects', path: '/subjects' });
      items.push({ icon: <Settings size={20} />, label: 'Settings', path: '/settings' });
    }

    return items;
  };

  const menuItems = getMenuItems();

  return (
    <aside className="w-64 h-[calc(100vh-4rem)] bg-white border-r border-gray-200 sticky top-16 overflow-y-auto">
      <div className="p-4 space-y-2">
        {menuItems.map((item) => {
          const itemUrl = new URL(item.path, window.location.origin);
          const itemTab = itemUrl.searchParams.get('tab') || '';
          const isCustomActive = itemUrl.pathname === location.pathname && (
            itemTab ? currentTab === itemTab : (!currentTab || currentTab === 'project-dashboard')
          );

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={() =>
                `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isCustomActive
                    ? 'bg-teal-50 text-teal-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
};

export default Sidebar;
