import React, { useRef } from "react";
import { ProjectMetadata, User } from "../types";
import { exportProject, importProject } from "../services/projectService";

interface ProjectHubProps {
  projects: ProjectMetadata[];
  onCreateNew: () => void;
  onLoadProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onProjectImported: () => void;
  userId: string;
  currentUser: User;
  onSwitchToAdminView?: () => void;
}

export const ProjectHub: React.FC<ProjectHubProps> = ({ 
  projects, 
  onCreateNew, 
  onLoadProject, 
  onDeleteProject,
  onProjectImported,
  userId,
  currentUser,
  onSwitchToAdminView
}) => {
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatDate = (ts: number) => {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  };

  const handleExport = async (id: string, title: string) => {
      try {
          const blob = await exportProject(userId, id);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${title.replace(/\s+/g, '_')}.cosmo`;
          a.click();
          URL.revokeObjectURL(url);
      } catch (e) {
          alert("Export failed: " + e);
      }
  };

  const handleShare = async (id: string) => {
    try {
        const blob = await exportProject(userId, id);
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          navigator.clipboard.writeText(base64data);
          alert("Project data copied to clipboard as a shareable link!");
        }
    } catch(e) {
        alert("Failed to create share link.");
    }
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (ev) => {
          try {
              const content = ev.target?.result as string;
              await importProject(userId, content);
              onProjectImported();
          } catch (err) {
              alert("Import failed: Invalid file format.");
          } finally {
              if (fileInputRef.current) fileInputRef.current.value = "";
          }
      };
      reader.readAsText(file);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-12 p-6 bg-atelier-bg font-sans overflow-y-auto">
      <div className="max-w-4xl w-full">
        
        <div className="flex items-end justify-between mb-8 border-b border-atelier-ink pb-4">
           <div>
             <h1 className="text-3xl font-bold tracking-[0.2em] uppercase mb-1">
                Project Archive
             </h1>
             <p className="text-xs text-atelier-muted uppercase tracking-widest">
                {currentUser.role === 'admin' ? 'My Personal Projects' : 'Local Browser Storage'}
             </p>
           </div>
           <div className="flex gap-3">
               {currentUser.role === 'admin' && onSwitchToAdminView && (
                 <button 
                    onClick={onSwitchToAdminView}
                    className="bg-white border border-indigo-600 text-indigo-600 px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-indigo-50 transition-all"
                  >
                    ← Admin View
                  </button>
               )}
               <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".cosmo,.json" className="hidden" />
               <button 
                 onClick={handleImportClick}
                 className="bg-white border border-atelier-ink text-atelier-ink px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-gray-50 transition-all"
               >
                 Import
               </button>
               <button 
                 onClick={onCreateNew}
                 className="bg-atelier-ink text-white px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-atelier-active shadow-lg transition-all"
               >
                 + New Project
               </button>
           </div>
        </div>

        {projects.length === 0 ? (
           <div className="border border-dashed border-atelier-muted p-12 text-center">
              <p className="text-sm text-atelier-muted mb-4">No projects found.</p>
              {currentUser.role !== 'admin' && <button onClick={onCreateNew} className="text-indigo-600 underline text-xs font-bold uppercase">Start your first masterpiece</button>}
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map(project => (
                <div key={project.id} className="group relative bg-white border border-atelier-accent hover:border-atelier-ink transition-all duration-300 hover:shadow-xl flex flex-col h-64">
                    
                    <div 
                      onClick={() => onLoadProject(project.id)}
                      className="flex-1 bg-atelier-bg relative overflow-hidden cursor-pointer"
                    >
                       {project.previewImage ? (
                         <img src={project.previewImage} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" alt="cover" />
                       ) : (
                         <div className="absolute inset-0 flex items-center justify-center text-atelier-muted text-4xl font-thin opacity-20">
                            {project.title.charAt(0)}
                         </div>
                       )}
                       
                       <div className="absolute bottom-0 left-0 right-0 bg-white/90 p-3 border-t border-atelier-accent">
                          {currentUser.role === 'admin' && project.ownerEmail && (
                            <span className="text-[8px] font-bold uppercase tracking-widest bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded absolute -top-5 left-2 shadow-sm">
                                {project.ownerEmail}
                            </span>
                          )}
                          <h3 className="text-sm font-bold uppercase tracking-wide truncate">{project.title}</h3>
                          <div className="flex justify-between items-center mt-1">
                             <span className="text-[9px] text-atelier-muted">{formatDate(project.lastModified)}</span>
                             <span className="text-[9px] font-bold">{project.sceneCount} Scenes</span>
                          </div>
                       </div>
                    </div>

                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                        <button 
                           onClick={(e) => { e.stopPropagation(); handleShare(project.id); }}
                           className="w-6 h-6 flex items-center justify-center bg-white border border-atelier-accent text-atelier-ink hover:bg-atelier-ink hover:text-white rounded-full shadow-sm"
                           title="Share Project"
                        >
                           🔗
                        </button>
                        <button 
                           onClick={(e) => { e.stopPropagation(); handleExport(project.id, project.title); }}
                           className="w-6 h-6 flex items-center justify-center bg-white border border-atelier-accent text-atelier-ink hover:bg-atelier-ink hover:text-white rounded-full shadow-sm"
                           title="Export Project File"
                        >
                           ↓
                        </button>
                        <button 
                           onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }}
                           className="w-6 h-6 flex items-center justify-center bg-white border border-atelier-accent text-atelier-muted hover:text-red-600 hover:border-red-600 rounded-full shadow-sm"
                           title="Delete Project"
                        >
                           &times;
                        </button>
                    </div>
                </div>
              ))}
           </div>
        )}
        
        <div className="mt-12 text-center">
            <p className="text-[10px] text-atelier-muted max-w-md mx-auto leading-relaxed">
              <strong>Storage Info:</strong> Projects are stored in your browser's <code>IndexedDB</code>, namespaced to your account. 
              Use "Export" to backup your work to a <code>.cosmo</code> file.
            </p>
        </div>
      </div>
    </div>
  );
};