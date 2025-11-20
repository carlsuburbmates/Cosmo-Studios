import React, { useState, useCallback, useEffect, useRef } from "react";
import { CastMember, GeneratedScene, Notification, AspectRatio, ProjectManifest, ProjectMetadata, User } from "./types";
import { CastMemberInput } from "./components/CastMemberInput";
import { PromptEngine } from "./components/PromptEngine";
import { Gallery } from "./components/Gallery";
import { Navigation } from "./components/Navigation";
import { VoiceLab } from "./components/VoiceLab";
import { CinemaLab } from "./components/CinemaLab";
import { CreativeBrief } from "./components/CreativeBrief";
import { ProjectHub } from "./components/ProjectHub";
import { HelpModal } from "./components/HelpModal";
import { AuthScreen } from "./components/AuthScreen";
import { AccountPopover } from "./components/AccountPopover";
import { AdminDashboard } from "./components/AdminDashboard";
import { LiveSession } from "./components/LiveSession";
import { useDebounce } from "./hooks/useDebounce";
import { generateSceneImage, generateImageEdit, generateSceneSuggestions, checkSceneConsistency } from "./services/geminiService";
import * as AssetStore from "./services/assetStore";
import * as ProjectService from "./services/projectService";
import * as AuthService from "./services/authService";


const INITIAL_CAST: CastMember[] = [
  { id: "1", label: "Char1", role: "The Hero", image: null, mimeType: "" },
  { id: "2", label: "Char2", role: "The Villain", image: null, mimeType: "" },
  { id: "3", label: "Char3", role: "Support A", image: null, mimeType: "" },
  { id: "4", label: "Char4", role: "Support B", image: null, mimeType: "" },
];

const App: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<ProjectMetadata[]>([]);
  const [isHydrating, setIsHydrating] = useState(false);
  const isHydratedRef = useRef(false);
  
  const [activeTab, setActiveTab] = useState<'character' | 'voice' | 'motion'>('character');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLiveSession, setShowLiveSession] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);

  const [cast, setCast] = useState<CastMember[]>(INITIAL_CAST);
  const [scenes, setScenes] = useState<GeneratedScene[]>([]);
  const [initialPrompts, setInitialPrompts] = useState<string[]>([]);
  const [initialRatio, setInitialRatio] = useState<AspectRatio>('16:9');
  
  const debouncedCast = useDebounce(cast, 1500);
  const debouncedScenes = useDebounce(scenes, 1500);
  const lastSavedSignature = useRef<Set<string>>(new Set());

  const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning', cost?: number) => {
    const id = crypto.randomUUID();
    setNotifications(prev => [...prev, { id, message, type, cost }]);
    if (cost) setTotalCost(prev => prev + cost);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  }, []);

  const checkApiKey = useCallback(async () => {
    if (window.aistudio?.hasSelectedApiKey) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (hasKey) { setHasApiKey(true); setCheckingKey(false); return; }
    }
    if (process.env.API_KEY) setHasApiKey(true);
    setCheckingKey(false);
  }, []);

  const fetchProjects = useCallback((user: User, adminFetchAll: boolean) => {
      const projects = ProjectService.getAllProjects(user, adminFetchAll);
      setProjectList(projects);
  }, []);

  useEffect(() => {
    checkApiKey();
    const user = AuthService.getCurrentUser();
    if (user) {
      setCurrentUser(user);
      // Default to personal project view, even for admins
      fetchProjects(user, false);
    }
  }, [checkApiKey, fetchProjects]);
  
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    // On login, always show personal projects first
    setIsAdminView(false);
    fetchProjects(user, false);
  };

  const handleLogout = () => {
    AuthService.logout();
    setCurrentUser(null);
    setCurrentProjectId(null);
    setProjectList([]);
    setTotalCost(0);
    setIsAdminView(false);
  };

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true); 
    }
  };

  const handleLoadProject = useCallback(async (id: string) => {
    if (!currentUser) return;
    const projectMeta = projectList.find(p => p.id === id);
    // When loading from admin view, the ownerId will be on the metadata.
    // Otherwise, it's the current user.
    const ownerId = projectMeta?.ownerId || currentUser.id;

    setIsHydrating(true);
    isHydratedRef.current = false;
    lastSavedSignature.current.clear();
    setTotalCost(0);
    setCurrentProjectId(id);
    setActiveTab('character');
    try {
      const loadedCast = ProjectService.loadProjectData(ownerId, id, "cast", INITIAL_CAST);
      const loadedScenes = ProjectService.loadProjectData(ownerId, id, "scenes", []);
      const hydratedCast = await Promise.all(loadedCast.map(async (member: CastMember) => {
        if (!member.image) {
          const img = await AssetStore.getAsset(`cast_${member.id}`);
          if (img) lastSavedSignature.current.add(`cast_${member.id}_${img.length}`);
          return img ? { ...member, image: img } : member;
        }
        return member;
      }));
      const hydratedScenes = await Promise.all(loadedScenes.map(async (scene: GeneratedScene) => {
        if (scene.cost) setTotalCost(prev => prev + (scene.cost || 0));
        if (!scene.imageUrl && !scene.loading) {
          const img = await AssetStore.getAsset(`scene_${scene.id}`);
          if (img) lastSavedSignature.current.add(`scene_${scene.id}_${img.length}`);
          return img ? { ...scene, imageUrl: img } : scene;
        }
        return scene;
      }));
      setCast(hydratedCast);
      setScenes(hydratedScenes);
    } catch (e) {
      addNotification("Failed to load project data.", 'error');
    } finally {
      setIsHydrating(false);
      setTimeout(() => { isHydratedRef.current = true; }, 500);
    }
  }, [addNotification, currentUser, projectList]);

  const handleDeleteProject = useCallback(async (id: string) => {
    if (!currentUser) return;
    if (window.confirm("Permanently delete this project?")) {
      const projectMeta = projectList.find(p => p.id === id);
      const ownerId = projectMeta?.ownerId || currentUser.id;
      await ProjectService.deleteProject(ownerId, id);
      const updatedList = ProjectService.getAllProjects(currentUser, currentUser.role === 'admin' && isAdminView);
      setProjectList(updatedList);
      if (currentProjectId === id) setCurrentProjectId(null);
    }
  }, [currentProjectId, currentUser, projectList, isAdminView]);

  const handleLaunchStudio = useCallback(async (manifest: ProjectManifest) => {
    if (!currentUser) return;
    setShowOnboarding(false);
    setIsHydrating(true);
    isHydratedRef.current = false;
    const newProject = ProjectService.createProject(currentUser.id, manifest);
    setCurrentProjectId(newProject.id);
    const newCast = [...INITIAL_CAST];
    manifest.cast.forEach((char, idx) => {
      if (newCast[idx]) { newCast[idx].label = char.name; newCast[idx].role = char.role; }
    });
    setCast(newCast);
    setScenes([]);
    setTotalCost(0);
    setInitialPrompts(manifest.scenes);
    setInitialRatio(manifest.suggestedRatio);
    fetchProjects(currentUser, currentUser.role === 'admin' && isAdminView);
    setIsHydrating(false);
    setTimeout(() => { isHydratedRef.current = true; }, 500);
  }, [currentUser, fetchProjects, isAdminView]);
  
  const handleSwitchToAdminView = () => {
      if (!currentUser || currentUser.role !== 'admin') return;
      setIsAdminView(true);
      fetchProjects(currentUser, true);
  };
  
  const handleSwitchToPersonalView = () => {
      if (!currentUser) return;
      setIsAdminView(false);
      // Fetch only personal projects
      fetchProjects(currentUser, false);
  };


  useEffect(() => {
    if (!currentProjectId || !isHydratedRef.current || !currentUser) return;
    const projectMeta = projectList.find(p => p.id === currentProjectId);
    const ownerId = projectMeta?.ownerId || currentUser.id;

    const saveProject = async () => {
      try {
        const castMeta = debouncedCast.map(c => ({ ...c, image: null }));
        ProjectService.saveProjectData(ownerId, currentProjectId, "cast", castMeta);
        await Promise.all(debouncedCast.map(async c => {
          if (c.image && !lastSavedSignature.current.has(`cast_${c.id}_${c.image.length}`)) {
            await AssetStore.saveAsset(`cast_${c.id}`, c.image);
            lastSavedSignature.current.add(`cast_${c.id}_${c.image.length}`);
          }
        }));
        const scenesMeta = debouncedScenes.map(s => ({ ...s, imageUrl: null }));
        ProjectService.saveProjectData(ownerId, currentProjectId, "scenes", scenesMeta);
        await Promise.all(debouncedScenes.map(async s => {
          if (s.imageUrl && !lastSavedSignature.current.has(`scene_${s.id}_${s.imageUrl.length}`)) {
            await AssetStore.saveAsset(`scene_${s.id}`, s.imageUrl);
            lastSavedSignature.current.add(`scene_${s.id}_${s.imageUrl.length}`);
          }
        }));
        const preview = debouncedScenes.find(s => s.imageUrl)?.imageUrl || debouncedCast.find(c => c.image)?.image || null;
        ProjectService.updateProjectMeta(ownerId, currentProjectId, { sceneCount: debouncedScenes.length, previewImage: preview });
      } catch (e) { console.error("Auto-save failed:", e); }
    };
    saveProject();
  }, [debouncedCast, debouncedScenes, currentProjectId, currentUser, projectList]);

  const handleCastUpdate = useCallback((id: string, updates: Partial<CastMember>) => {
    setCast(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, []);

  const handleGenerateScenes = useCallback(async (prompts: string[], aspectRatio: AspectRatio) => {
    setIsGenerating(true);
    const newScenes = prompts.map(p => ({
      id: crypto.randomUUID(), prompt: p, imageUrl: null, loading: true, error: null, timestamp: Date.now(),
      charactersIncluded: [], aspectRatio, history: [], redoStack: [], suggestions: [], approvalStatus: 'draft', tags: []
    } as GeneratedScene));
    setScenes(prev => [...prev, ...newScenes]);

    for (const scene of newScenes) {
      try {
        const result = await generateSceneImage(scene.prompt, cast, aspectRatio);
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, imageUrl: result.imageUrl, charactersIncluded: result.charactersIncluded, loading: false, cost: result.cost } : s));
        setTotalCost(prev => prev + result.cost);
      } catch (error: any) {
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, loading: false, error: error.message } : s));
      }
    }
    setIsGenerating(false);
  }, [cast]);

  const handleEditScene = useCallback(async (id: string, prompt: string) => {
    const originalScene = scenes.find(s => s.id === id);
    if (!originalScene?.imageUrl) return;

    setScenes(prev => prev.map(s => s.id === id ? { ...s, loading: true } : s));
    try {
      const result = await generateImageEdit(originalScene.imageUrl, prompt);
      setScenes(prev => prev.map(s => s.id === id ? {
        ...s, loading: false, imageUrl: result.imageUrl, history: [...s.history, s.imageUrl!], cost: (s.cost || 0) + result.cost
      } : s));
      setTotalCost(prev => prev + result.cost);
    } catch (e) {
      addNotification("Edit failed.", 'error');
      setScenes(prev => prev.map(s => s.id === id ? { ...s, loading: false } : s));
    }
  }, [scenes, addNotification]);

  const handleToggleEdit = useCallback(async (id: string) => {
    const scene = scenes.find(s => s.id === id);
    if (!scene) return;

    const isOpening = !scene.isEditing;
    setScenes(prev => prev.map(s => s.id === id ? { ...s, isEditing: isOpening, isSuggesting: isOpening } : s));
    
    if (isOpening && scene.imageUrl) {
        try {
            const result = await generateSceneSuggestions(scene.imageUrl);
            setScenes(prev => prev.map(s => s.id === id ? { ...s, suggestions: result.suggestions, isSuggesting: false } : s));
            setTotalCost(prev => prev + result.cost);
        } catch (e) {
            setScenes(prev => prev.map(s => s.id === id ? { ...s, isSuggesting: false } : s));
        }
    }
  }, [scenes]);

  const handleAction = useCallback((id: string, action: 'approve' | 'reject' | 'undo' | 'redo') => {
    setScenes(prev => prev.map(s => {
      if (s.id !== id) return s;
      switch (action) {
        case 'approve': return { ...s, approvalStatus: s.approvalStatus === 'approved' ? 'draft' : 'approved' };
        case 'reject': return { ...s, approvalStatus: 'rejected' };
        case 'undo': return s.history.length ? { ...s, imageUrl: s.history[s.history.length - 1], history: s.history.slice(0, -1), redoStack: [s.imageUrl!, ...s.redoStack] } : s;
        case 'redo': return s.redoStack.length ? { ...s, imageUrl: s.redoStack[0], history: [...s.history, s.imageUrl!], redoStack: s.redoStack.slice(1) } : s;
        default: return s;
      }
    }));
  }, []);

  const handleVerify = useCallback(async (id: string) => {
    const scene = scenes.find(s => s.id === id);
    const mainChar = cast.find(c => c.label === scene?.charactersIncluded[0]);
    if (!scene?.imageUrl || !mainChar?.image) {
      addNotification("Reference character image or scene image missing for verification.", 'warning');
      return;
    }
    setScenes(prev => prev.map(s => s.id === id ? { ...s, isVerifying: true } : s));
    try {
      const res = await checkSceneConsistency(mainChar.image, scene.imageUrl, mainChar.label);
      setScenes(prev => prev.map(s => s.id === id ? { ...s, isVerifying: false, consistencyScore: res.score, consistencyFeedback: res.feedback } : s));
      setTotalCost(prev => prev + res.cost);
    } catch (e) {
      setScenes(prev => prev.map(s => s.id === id ? { ...s, isVerifying: false } : s));
    }
  }, [scenes, cast, addNotification]);

  const handleUpdateTags = useCallback((id: string, tags: string[]) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, tags } : s));
  }, []);

  const handleNewProject = () => {
    if (currentUser) {
        setShowOnboarding(true);
    } else {
        addNotification("Please log in to create a new project.", "info");
    }
  }
  
  const handleGenerateStoryboard = useCallback(async (script: string) => {
    const lines = script.split('\n').map(l => l.trim()).filter(l => l && !l.includes(':'));
    if (lines.length === 0) {
        addNotification("No scene descriptions found in script to generate a storyboard.", "warning");
        return;
    }
    setActiveTab('character');
    await handleGenerateScenes(lines, initialRatio);
    addNotification(`Storyboard generation started for ${lines.length} scenes.`, "info");
  }, [handleGenerateScenes, initialRatio, addNotification]);

  if (checkingKey) return null;
  if (!hasApiKey) return <div className="h-screen flex items-center justify-center bg-stone-50"><button onClick={handleSelectKey} className="px-6 py-3 bg-atelier-ink text-white uppercase font-bold tracking-widest hover:bg-stone-800 transition-colors">Enter Studio</button></div>;
  if (!currentUser) return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  if (showOnboarding) return <CreativeBrief onComplete={handleLaunchStudio} onSkip={() => handleLaunchStudio({ projectTitle: "Untitled Project", cast: [], scenes: [], suggestedRatio: '16:9' })} />;
  if (showLiveSession) return <LiveSession onClose={() => setShowLiveSession(false)} />;
  if (isHydrating) return <div className="h-screen flex items-center justify-center text-xs uppercase tracking-widest animate-pulse bg-stone-50 text-stone-500">Loading Assets...</div>;

  return (
    <div className="flex flex-col font-sans bg-stone-100 text-atelier-ink relative min-h-screen md:h-screen md:overflow-hidden">
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      
      <div className="fixed top-4 right-4 z-[80] flex flex-col gap-2 pointer-events-none max-w-[90vw]">
        {notifications.map(n => <div key={n.id} className={`pointer-events-auto p-3 rounded shadow-lg text-xs font-bold border-l-4 bg-white ${n.type === 'error' ? 'border-red-500' : 'border-green-500'}`}>{n.message}</div>)}
      </div>

      <header className="bg-white px-3 md:px-6 py-3 flex items-center justify-between border-b border-stone-200 flex-none shadow-sm z-50 h-16 sticky top-0 md:relative">
        <div className="flex items-center gap-3 cursor-pointer overflow-hidden flex-1" onClick={() => { setCurrentProjectId(null); }}>
          <div className="w-8 h-8 bg-atelier-ink rounded flex items-center justify-center text-white font-bold flex-shrink-0">C</div>
          <div className="flex flex-col min-w-0 overflow-hidden">
            <h1 className="text-xs md:text-sm font-bold tracking-wide md:tracking-[0.2em] uppercase whitespace-nowrap truncate text-atelier-ink">Cosmo Studios</h1>
            {currentProjectId && 
                <span className="text-[10px] text-stone-500 truncate block">
                    {projectList.find(p => p.id === currentProjectId)?.title}
                    {currentUser.role === 'admin' && projectList.find(p => p.id === currentProjectId)?.ownerEmail &&
                        <span className="font-bold text-indigo-500 ml-2">({projectList.find(p => p.id === currentProjectId)?.ownerEmail})</span>
                    }
                </span>
            }
          </div>
        </div>
        <div className="flex items-center gap-2">
            {currentProjectId && (
                <button onClick={() => setShowLiveSession(true)} className="flex-shrink-0 h-8 px-3 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-colors shadow-sm" aria-label="Live Brainstorm">
                  <span>✦ Live Brainstorm</span>
                </button>
            )}
            <AccountPopover user={currentUser} onLogout={handleLogout} totalCost={totalCost}/>
            <button onClick={() => setShowHelp(true)} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white border border-stone-300 text-stone-600 hover:bg-atelier-ink hover:text-white hover:border-atelier-ink transition-colors shadow-sm" aria-label="Help Manual"><span className="font-bold text-sm">?</span></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative h-auto md:h-[calc(100vh-64px)] overflow-x-hidden">
        {!currentProjectId ? (
          currentUser.role === 'admin' && isAdminView ?
            <AdminDashboard currentUser={currentUser} onLoadProject={handleLoadProject} onSwitchView={handleSwitchToPersonalView} /> :
            <ProjectHub 
              projects={projectList} 
              onCreateNew={handleNewProject} 
              onLoadProject={handleLoadProject} 
              onDeleteProject={handleDeleteProject} 
              onProjectImported={() => {
                  addNotification("Project imported successfully.", "success");
                  currentUser && fetchProjects(currentUser, currentUser.role === 'admin' && isAdminView)
              }} 
              userId={currentUser.id} 
              currentUser={currentUser}
              onSwitchToAdminView={currentUser.role === 'admin' ? handleSwitchToAdminView : undefined}
            />
        ) : (
          <>
            <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
            <div className="flex-1 bg-stone-50 relative h-auto md:h-full flex flex-col md:flex-row md:overflow-hidden">
              {activeTab === 'character' && (
                <div className="w-full h-full flex flex-col md:flex-row">
                  <div className="w-full md:w-[320px] lg:w-[380px] flex-none flex flex-col border-b md:border-b-0 md:border-r border-stone-200 bg-white z-10 h-auto md:h-full shadow-sm">
                    <div className="p-4 border-b border-stone-100 overflow-x-auto no-scrollbar bg-stone-50/50">
                      <div className="flex items-center gap-3 min-w-max">
                        <span className="text-[9px] font-bold uppercase text-stone-400 tracking-widest mr-1 whitespace-nowrap">Cast</span>
                        {cast.map(m => <CastMemberInput key={m.id} member={m} onUpdate={handleCastUpdate} disabled={isGenerating} />)}
                      </div>
                    </div>
                    <div className="flex-1 p-5 bg-white h-auto md:overflow-y-auto">
                      <PromptEngine key={currentProjectId} cast={cast} projectId={currentProjectId} onGenerate={handleGenerateScenes} isGenerating={isGenerating} initialPrompts={initialPrompts} initialRatio={initialRatio} />
                    </div>
                  </div>
                  <div className="flex-1 bg-stone-50 p-4 md:p-8 h-auto md:h-full md:overflow-y-auto min-h-[400px]">
                    <Gallery scenes={scenes} onEdit={handleEditScene} onUndo={(id) => handleAction(id, 'undo')} onRedo={(id) => handleAction(id, 'redo')} onToggleEdit={handleToggleEdit} onApprove={(id) => handleAction(id, 'approve')} onReject={(id) => handleAction(id, 'reject')} onVerify={handleVerify} onUpdateTags={handleUpdateTags} />
                  </div>
                </div>
              )}
              {activeTab === 'voice' && <VoiceLab key={currentProjectId} castMembers={cast} addNotification={addNotification} projectId={currentProjectId} userId={currentUser.id} onGenerateStoryboard={handleGenerateStoryboard} isGenerating={isGenerating} />}
              {activeTab === 'motion' && <CinemaLab key={currentProjectId} scenes={scenes} addNotification={addNotification} projectId={currentProjectId} userId={currentUser.id} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;