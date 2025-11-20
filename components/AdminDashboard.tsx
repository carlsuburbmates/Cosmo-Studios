import React, { useState, useEffect, useCallback } from 'react';
import { User, ProjectMetadata } from '../types';
import * as AuthService from '../services/authService';
import * as ProjectService from '../services/projectService';

interface AdminDashboardProps {
  currentUser: User;
  onLoadProject: (id: string) => void;
  onSwitchView: () => void;
}

type AdminTab = 'dashboard' | 'users' | 'projects';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onLoadProject, onSwitchView }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [stats, setStats] = useState({ userCount: 0, projectCount: 0, sceneCount: 0 });

  const fetchData = useCallback(() => {
    const allUsers = AuthService.getAllUsers();
    const allProjects = ProjectService.getAllProjects({ role: 'admin' } as User, true);
    setUsers(allUsers);
    setProjects(allProjects);

    const totalScenes = allProjects.reduce((sum, p) => sum + p.sceneCount, 0);
    setStats({
      userCount: allUsers.length,
      projectCount: allProjects.length,
      sceneCount: totalScenes,
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm("PERMANENTLY delete this user and all their projects? This cannot be undone.")) {
      try {
        await AuthService.deleteUser(userId);
        fetchData(); // Refresh data
      } catch (e: any) {
        alert(`Error: ${e.message}`);
      }
    }
  };

  const handleDeleteProject = async (projectId: string, ownerId: string | undefined) => {
    if (!ownerId) {
        alert("Error: Project owner is unknown.");
        return;
    }
    if (window.confirm("Delete this project permanently?")) {
      try {
        await ProjectService.deleteProject(ownerId, projectId);
        fetchData(); // Refresh data
      } catch (e: any) {
        alert(`Error: ${e.message}`);
      }
    }
  };

  const formatDate = (ts: number) => {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts));
  };

  const TABS: { id: AdminTab, label: string }[] = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'users', label: 'User Management' },
      { id: 'projects', label: 'Project Management' },
  ];

  return (
    <div className="flex flex-col md:flex-row w-full h-auto md:h-full font-sans bg-stone-100">
      {/* Sidebar */}
      <div className="w-full md:w-56 bg-white border-b md:border-b-0 md:border-r border-stone-200 flex-none p-2 md:p-4">
        <h2 className="hidden md:block text-xs font-bold uppercase tracking-widest text-stone-400 p-2 mb-2">Admin Panel</h2>
        <div className="flex md:flex-col gap-1">
            {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full text-left text-sm px-3 py-2 rounded transition-colors ${activeTab === tab.id ? 'bg-atelier-ink text-white font-bold' : 'hover:bg-stone-100'}`}>
                    {tab.label}
                </button>
            ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 md:p-10 overflow-y-auto">
        {activeTab === 'dashboard' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold">System Overview</h1>
              <button onClick={onSwitchView} className="bg-white border border-atelier-ink text-atelier-ink px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-gray-50 transition-all">
                My Projects →
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 border border-stone-200 shadow-sm rounded-sm">
                <p className="text-sm font-bold uppercase text-stone-500 tracking-wider">Total Users</p>
                <p className="text-4xl font-bold mt-2">{stats.userCount}</p>
              </div>
              <div className="bg-white p-6 border border-stone-200 shadow-sm rounded-sm">
                <p className="text-sm font-bold uppercase text-stone-500 tracking-wider">Total Projects</p>
                <p className="text-4xl font-bold mt-2">{stats.projectCount}</p>
              </div>
              <div className="bg-white p-6 border border-stone-200 shadow-sm rounded-sm">
                <p className="text-sm font-bold uppercase text-stone-500 tracking-wider">Total Scenes</p>
                <p className="text-4xl font-bold mt-2">{stats.sceneCount}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <h1 className="text-2xl font-bold mb-6">User Management</h1>
            <div className="bg-white border border-stone-200 shadow-sm rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="text-left p-3 font-bold uppercase tracking-wider text-xs">Email</th>
                    <th className="text-left p-3 font-bold uppercase tracking-wider text-xs">Role</th>
                    <th className="text-left p-3 font-bold uppercase tracking-wider text-xs">User ID</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b border-stone-100 last:border-b-0">
                      <td className="p-3 font-mono text-xs">{user.email}</td>
                      <td className="p-3"><span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${user.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-stone-100 text-stone-600'}`}>{user.role}</span></td>
                      <td className="p-3 font-mono text-xs opacity-50">{user.id}</td>
                      <td className="p-3 text-right">
                        {currentUser.id !== user.id && (
                             <button onClick={() => handleDeleteUser(user.id)} className="text-red-500 hover:underline font-bold text-xs">Delete</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div>
            <h1 className="text-2xl font-bold mb-6">Project Management</h1>
            <div className="bg-white border border-stone-200 shadow-sm rounded-sm overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="text-left p-3 font-bold uppercase tracking-wider text-xs">Title</th>
                    <th className="text-left p-3 font-bold uppercase tracking-wider text-xs">Owner</th>
                    <th className="text-left p-3 font-bold uppercase tracking-wider text-xs">Scenes</th>
                    <th className="text-left p-3 font-bold uppercase tracking-wider text-xs">Last Modified</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(p => (
                    <tr key={p.id} className="border-b border-stone-100 last:border-b-0">
                      <td className="p-3 font-bold">{p.title}</td>
                      <td className="p-3 font-mono text-xs">{p.ownerEmail}</td>
                      <td className="p-3">{p.sceneCount}</td>
                      <td className="p-3 text-xs">{formatDate(p.lastModified)}</td>
                      <td className="p-3 text-right flex gap-2 justify-end">
                        <button onClick={() => onLoadProject(p.id)} className="text-indigo-600 hover:underline font-bold text-xs">Load</button>
                        <button onClick={() => handleDeleteProject(p.id, p.ownerId)} className="text-red-500 hover:underline font-bold text-xs">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};