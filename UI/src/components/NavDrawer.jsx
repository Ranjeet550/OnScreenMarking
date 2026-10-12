import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  X, LayoutDashboard, School, Building2, GraduationCap, BookOpen,
  Calendar, FileText, Layers, Zap, Users, Shield, Activity, PenTool,
  BarChart3, BookMarked, Settings2, Briefcase, Upload, Folder
} from 'lucide-react';
import { encryptId } from '../utils/encryption';

/**
 * Nav groups for admin / coordinator / examiner
 * Groups: Overview, Academic Setup, Examination, Operations
 */
function useNavGroups(userType, hasPermission) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const urlEncryptedProjId = searchParams.get('projectId');
  const urlUniversityId = searchParams.get('universityId');

  const selectedProjectId = sessionStorage.getItem('selectedProjectId');
  const encryptedProjId = urlEncryptedProjId || (selectedProjectId ? encryptId(selectedProjectId) : '');
  const univParam = urlUniversityId ? `&universityId=${urlUniversityId}` : '';

  const papersPath =
    userType === 'admin'
      ? encryptedProjId ? `/admin/papers?projectId=${encryptedProjId}${univParam}` : '/admin/papers'
      : encryptedProjId ? `/papers?projectId=${encryptedProjId}${univParam}` : '/papers';

  const allocationPath =
    userType === 'admin'
      ? encryptedProjId ? `/admin/allocate-scripts?projectId=${encryptedProjId}${univParam}` : '/admin/allocate-scripts'
      : encryptedProjId ? `/allocate-scripts?projectId=${encryptedProjId}${univParam}` : '/allocate-scripts';

  const importQpPath =
    userType === 'admin'
      ? encryptedProjId ? `/admin/import-question-papers?projectId=${encryptedProjId}${univParam}` : '/admin/import-question-papers'
      : encryptedProjId ? `/import-question-papers?projectId=${encryptedProjId}${univParam}` : '/import-question-papers';

  const importPapersPath =
    userType === 'admin'
      ? encryptedProjId ? `/admin/import-papers-from-project?projectId=${encryptedProjId}${univParam}` : '/admin/import-papers-from-project'
      : encryptedProjId ? `/import-papers-from-project?projectId=${encryptedProjId}${univParam}` : '/import-papers-from-project';

  if (userType === 'admin') {
    const groups = [
      {
        label: 'Overview',
        items: [
          { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard, exact: true },
        ],
      },
      {
        label: 'Academic Setup',
        items: [
          { label: 'Universities',      path: '/admin/universities',                  icon: School },
          { label: 'University Config',  path: '/admin/departments',                  icon: Settings2 },
          { label: 'Project Config',    path: '/admin/project-dashboard',             icon: Briefcase },
          { label: 'Colleges',          path: '/admin/colleges',                      icon: Building2 },
          ...(hasPermission('VIEW_LOGS') ? [{ label: 'Attendance Audit', path: '/admin/attendance', icon: Activity }] : []),
        ],
      },
      {
        label: 'Examination',
        items: [
          { label: 'Import Papers from Project', path: importPapersPath, icon: Folder },
          { label: 'Bulk Import Q.P.',    path: importQpPath,             icon: Upload },
          { label: 'Section Masters',     path: '/admin/section-masters', icon: Layers },
          { label: 'Question Types',      path: '/admin/question-types',  icon: Layers },
        ],
      },
    ];

    const ops = { label: 'Operations', items: [] };
    if (hasPermission('READ_ALLOCATION')) {
      ops.items.push({ label: 'Script Allocation', path: allocationPath, icon: Zap });
    }
    if (hasPermission('READ_USER')) {
      ops.items.push({ label: 'Users', path: '/admin/users', icon: Users });
    }
    if (hasPermission('READ_ROLE')) {
      ops.items.push({ label: 'Roles & Permissions', path: '/admin/role-management', icon: Shield });
    }
    if (ops.items.length > 0) groups.push(ops);

    return groups;
  }

  if (userType === 'coordinator') {
    const groups = [
      {
        label: 'Overview',
        items: [{ label: 'Dashboard', path: '/coordinator/dashboard', icon: LayoutDashboard, exact: true }],
      },
      {
        label: 'Academic Setup',
        items: [
          { label: 'University Config', path: '/departments', icon: Settings2 },
          { label: 'Project Config',    path: '/project-dashboard', icon: Briefcase },
        ],
      },
      {
        label: 'Examination',
        items: [
          { label: 'Projects',            path: '/projects',              icon: BookMarked },
          { label: 'Import Papers from Project', path: importPapersPath, icon: Folder },
          { label: 'Bulk Import Q.P.',    path: importQpPath,             icon: Upload },
          { label: 'Section Masters',     path: '/section-masters',       icon: Layers },
          { label: 'Question Types',      path: '/question-types',        icon: Layers },
        ],
      },
    ];
    const ops = { label: 'Operations', items: [] };
    if (hasPermission('READ_ALLOCATION')) {
      ops.items.push({ label: 'Script Allocation', path: allocationPath, icon: Zap });
    }
    if (hasPermission('READ_USER')) {
      ops.items.push({ label: 'Users', path: '/admin/users', icon: Users });
    }
    if (hasPermission('READ_ROLE')) {
      ops.items.push({ label: 'Roles & Permissions', path: '/admin/role-management', icon: Shield });
    }
    if (ops.items.length > 0) groups.push(ops);
    return groups;
  }

  if (userType === 'examiner') {
    const groups = [
      {
        label: 'Overview',
        items: [{ label: 'Dashboard', path: '/', icon: LayoutDashboard, exact: true }],
      },
    ];
    const work = { label: 'My Work', items: [] };
    if (hasPermission('READ_SCRIPT')) {
      work.items.push({ label: 'Scripts', path: '/scripts', icon: FileText });
    }
    if (hasPermission('READ_MARKING')) {

    }
    if (hasPermission('VIEW_REPORTS')) {
      work.items.push({ label: 'Reports', path: '/reports', icon: BarChart3 });
    }
    if (work.items.length > 0) groups.push(work);
    return groups;
  }

  return [];
}

export default function NavDrawer({ isOpen, onClose }) {
  const { userType, hasPermission } = useAuth();
  const groups = useNavGroups(userType, hasPermission);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label="Navigation menu">
        {/* Drawer Header */}
        <div
          className="flex items-center justify-between px-4 border-b border-gray-100 shrink-0"
          style={{ height: 'var(--nav-height)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-700 flex items-center justify-center">
              <BookMarked size={15} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="leading-none">
              <p className="text-[13px] font-bold text-gray-900 tracking-tight">OSM Portal</p>
              <p className="text-[10px] text-gray-400 mt-[1px]">Navigation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {groups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
              <p className="text-[9.5px] font-bold uppercase tracking-widest text-gray-400 px-2 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.exact}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all group
                        ${isActive
                          ? 'bg-teal-50 text-teal-700 border-l-[3px] border-teal-600 pl-[9px]'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-[3px] border-transparent pl-[9px]'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            size={15}
                            strokeWidth={2}
                            className={isActive ? 'text-teal-700' : 'text-gray-400 group-hover:text-gray-600'}
                          />
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Drawer Footer */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <p className="text-[10px] text-gray-400 text-center">OSM Portal v1.0</p>
        </div>
      </aside>
    </>
  );
}
