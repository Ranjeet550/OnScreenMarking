import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, School, Building2, GraduationCap, BookOpen,
  Calendar, FileText, Layers, Users, Shield, Zap, Activity,
  PenTool, BarChart3, Settings
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { encryptId } from '../utils/encryption';

const TabBar = () => {
  const { userType, hasPermission } = useAuth();
  const location = useLocation();
  const currentParams = new URLSearchParams(location.search);
  const currentTab = currentParams.get('tab') || '';

  const selectedProjectId = sessionStorage.getItem('selectedProjectId');
  const encryptedProjId = selectedProjectId ? encryptId(selectedProjectId) : '';

  const papersPath =
    userType === 'admin'
      ? encryptedProjId ? `/admin/papers?projectId=${encryptedProjId}` : '/admin/papers'
      : encryptedProjId ? `/papers?projectId=${encryptedProjId}` : '/papers';

  const allocationPath =
    userType === 'admin'
      ? encryptedProjId ? `/admin/project-dashboard?projectId=${encryptedProjId}&tab=allocations` : '/admin/project-dashboard?tab=allocations'
      : encryptedProjId ? `/project-dashboard?projectId=${encryptedProjId}&tab=allocations` : '/project-dashboard?tab=allocations';

  const getLinks = () => {
    const links = [];

    if (userType === 'admin') {
      links.push({ label: 'Dashboard',          path: '/admin/dashboard',       icon: LayoutDashboard });
      links.push({ label: 'Universities',        path: '/admin/universities',    icon: School });
      links.push({ label: 'Colleges',            path: '/admin/colleges',        icon: Building2 });
      links.push({ label: 'Departments',         path: '/admin/departments',     icon: Building2 });
      links.push({ label: 'Courses',             path: '/admin/courses',         icon: GraduationCap });
      links.push({ label: 'Subjects',            path: '/admin/subjects',        icon: BookOpen });
      links.push({ label: 'Sessions',            path: '/admin/sessions',        icon: Calendar });
      links.push({ label: 'Papers',              path: papersPath,               icon: FileText });
      links.push({ label: 'Section Masters',     path: '/admin/section-masters', icon: Layers });
      links.push({ label: 'Question Types',      path: '/admin/question-types',  icon: Layers });
      if (hasPermission('READ_ALLOCATION')) {
        links.push({ label: 'Script Allocation', path: allocationPath,           icon: Zap });
      }
      if (hasPermission('READ_USER')) {
        links.push({ label: 'Users',             path: '/admin/users',           icon: Users });
      }
      if (hasPermission('READ_ROLE')) {
        links.push({ label: 'Roles',             path: '/admin/role-management', icon: Shield });
      }
      if (hasPermission('VIEW_LOGS')) {
        links.push({ label: 'Attendance',        path: '/admin/attendance',      icon: Activity });
      }
    } else if (userType === 'coordinator') {
      links.push({ label: 'Dashboard',          path: '/coordinator/dashboard', icon: LayoutDashboard });
      links.push({ label: 'Departments',         path: '/departments',           icon: Building2 });
      links.push({ label: 'Courses',             path: '/courses',               icon: GraduationCap });
      links.push({ label: 'Subjects',            path: '/subjects',              icon: BookOpen });
      links.push({ label: 'Sessions',            path: '/sessions',              icon: Calendar });
      links.push({ label: 'Papers',              path: papersPath,               icon: FileText });
      links.push({ label: 'Section Masters',     path: '/section-masters',       icon: Layers });
      links.push({ label: 'Question Types',      path: '/question-types',        icon: Layers });
      if (hasPermission('READ_ALLOCATION')) {
        links.push({ label: 'Script Allocation', path: allocationPath,           icon: Zap });
      }
      if (hasPermission('READ_USER')) {
        links.push({ label: 'Users',             path: '/admin/users',           icon: Users });
      }
      if (hasPermission('READ_ROLE')) {
        links.push({ label: 'Roles',             path: '/admin/role-management', icon: Shield });
      }
    } else if (userType === 'examiner') {
      links.push({ label: 'Dashboard',          path: '/',                      icon: LayoutDashboard });
      if (hasPermission('READ_SCRIPT')) {
        links.push({ label: 'Scripts',          path: '/scripts',               icon: FileText });
      }
      if (hasPermission('READ_MARKING')) {

      }
      if (hasPermission('VIEW_REPORTS')) {
        links.push({ label: 'Reports',          path: '/reports',               icon: BarChart3 });
      }
    }

    return links;
  };

  const links = getLinks();

  return (
    <div
      style={{ height: 'var(--tabbar-height)' }}
      className="sticky top-[var(--nav-height)] z-40 w-full bg-white border-b border-zinc-200 flex items-stretch overflow-x-auto shrink-0"
    >
      <nav className="flex items-stretch px-4 gap-0.5 min-w-0">
        {links.map((link) => {
          const Icon = link.icon;
          const itemUrl = new URL(link.path, window.location.origin);
          const itemTab = itemUrl.searchParams.get('tab') || '';
          const isCustomActive = itemUrl.pathname === location.pathname && (
            itemTab ? currentTab === itemTab : (!currentTab || currentTab === 'project-dashboard')
          );

          return (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.path === '/' || link.path === '/admin/dashboard' || link.path === '/coordinator/dashboard'}
              className={() =>
                `relative flex items-center gap-1.5 px-3 text-[12.5px] font-medium whitespace-nowrap transition-all select-none
                  ${isCustomActive
                    ? 'text-zinc-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-amber-500 after:rounded-t'
                    : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
                  }`
              }
            >
              <Icon size={13} strokeWidth={2} />
              {link.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

export default TabBar;
