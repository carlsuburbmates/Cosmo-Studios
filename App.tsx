import React, { useState, useCallback, useEffect, useRef } from "react";
import { CastMember, GeneratedScene, Notification } from "./types";
import { CastMemberInput } from "./components/CastMemberInput";
import { PromptEngine } from "./components/PromptEngine";
import { Gallery } from "./components/Gallery";
import { Navigation } from "./components/Navigation";
import { VoiceLab } from "./components/VoiceLab";
import { CinemaLab } from "./components/CinemaLab";
import { generateSceneImage } from "./services/geminiService";
import * as AssetStore from "./services/assetStore";

// Initial state for 4 Cast Members
const INITIAL_CAST: CastMember[] = [
  { id: "1", label: "Char1", role: "The Hero", image: null, mimeType: "" },
  { id: "2", label: "Char2", role: "The Villain", image: null, mimeType: "" },
  { id: "3", label: "Char3", role: "Support A", image: null, mimeType: "" },
  { id: "4", label: "Char4", role: "Support B", image: null, mimeType: "" },
];

// --- HYBRID STORAGE CONTROLLER ---
function safeLoadSync<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn(`LS Read Error ${key}, using fallback.`);
    return fallback;
  }
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'character' | 'voice' | 'motion'>('character');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [checkingKey, setCheckingKey] = useState(true);
  const [manualKey, setManualKey] = useState(""); // For Open Web Deployment
  
  // GLOBAL STATE
  const [totalCost, setTotalCost] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  // MODULE 1 STATE - Init from LocalStorage (Metadata Only)
  const [cast, setCast] = useState<CastMember[]>(() => safeLoadSync("cosmo_cast_meta", INITIAL_CAST));
  const [scenes, setScenes] = useState<GeneratedScene[]>(() => safeLoadSync("cosmo_scenes_meta", []));

  const [isGenerating, setIsGenerating] = useState(false);

  // Ref to prevent save loops during hydration
  const isHydratedRef = useRef(false);

  // --- API KEY GATEKEEPER ---
  const checkApiKey = useCallback(async () => {
    // 1. Check Project IDX / AI Studio (Window Injector)
    if (window.aistudio?.hasSelectedApiKey) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (hasKey) {
        setHasApiKey(true);
        setCheckingKey(false);
        return;
      }
    }
    
    // 2. Check Session Storage (Previously entered manual key)
    const sessionKey = sessionStorage.getItem("cosmo_api_key");
    if (sessionKey) {
      setHasApiKey(true);
      setCheckingKey(false);
      return;
    }

    // 3. Check Env (Dev fallback)
    if (process.env.API_KEY) {
      setHasApiKey(true);
    }
    
    setCheckingKey(false);
  }, []);

  useEffect(() => {
    checkApiKey();
  }, [checkApiKey]);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success after modal interaction, or re-check
      setHasApiKey(true); 
    }
  };

  const handleManualKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualKey.trim().length > 20) { // Basic length validation
      sessionStorage.setItem("cosmo_api_key", manualKey.trim());
      setHasApiKey(true);
      // Clear input from state for security
      setManualKey("");
    } else {
      alert("Please enter a valid Gemini API Key.");
    }
  };

  // --- NOTIFICATION SYSTEM ---
  const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info', cost?: number) => {
    const id = crypto.randomUUID();
    setNotifications(prev => [...prev, { id, message, type, cost }]);
    if (cost) setTotalCost(prev => prev + cost);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  // --- ASYNC HYDRATION (Restore Heavy Assets) ---
  useEffect(() => {
    if (!hasApiKey) return; // Delay hydration until we have access

    const hydrate = async () => {
      try {
        // 1. Re-attach images to Cast
        const hydratedCast = await Promise.all(cast.map(async (member) => {
            if (!member.image) {
                const img = await AssetStore.getAsset(`cast_${member.id}`);
                return img ? { ...member, image: img } : member;
            }
            return member;
        }));
        setCast(hydratedCast);

        // 2. Re-attach images to Scenes
        const hydratedScenes = await Promise.all(scenes.map(async (scene) => {
            if (!scene.imageUrl && !scene.loading && !scene.error) {
                const img = await AssetStore.getAsset(`scene_${scene.id}`);
                return img ? { ...scene, imageUrl: img } : scene;
            }
            return scene;
        }));
        setScenes(hydratedScenes);
      } catch (e) {
        console.error("Hydration failed:", e);
        addNotification("Failed to load saved images.", 'error');
      } finally {
        setIsHydrating(false);
        isHydratedRef.current = true;
      }
    };

    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasApiKey]); 

  // --- HYBRID SAVING (Split Metadata & Assets) ---
  useEffect(() => {
    if (!isHydratedRef.current) return; // Don't save partial state during load

    const saveTimeout = setTimeout(async () => {
      try {
        // 1. CAST: Separate Metadata & Blobs
        const castMeta = cast.map(c => ({ ...c, image: null })); // Strip Image
        localStorage.setItem("cosmo_cast_meta", JSON.stringify(castMeta));
        
        // Async Save Images to IDB
        await Promise.all(cast.map(c => 
            c.image ? AssetStore.saveAsset(`cast_${c.id}`, c.image) : Promise.resolve()
        ));

        // 2. SCENES: Separate Metadata & Blobs
        const scenesMeta = scenes.map(s => ({ ...s, imageUrl: null })); // Strip Image
        localStorage.setItem("cosmo_scenes_meta", JSON.stringify(scenesMeta));

        // Async Save Images to IDB
        await Promise.all(scenes.map(s => 
            s.imageUrl ? AssetStore.saveAsset(`scene_${s.id}`, s.imageUrl) : Promise.resolve()
        ));

      } catch (e) {
        console.error("Auto-save failed", e);
        addNotification("Auto-save failed", 'error');
      }
    }, 1000); // Debounce 1s

    return () => clearTimeout(saveTimeout);
  }, [cast, scenes, addNotification]);

  const handleCastUpdate = useCallback(
    (id: string, image: string | null, mimeType: string) => {
      setCast((prev) =>
        prev.map((member) =>
          member.id === id ? { ...member, image, mimeType } : member
        )
      );
    },
    []
  );

  const handleGenerateScenes = async (prompts: string[]) => {
    setIsGenerating(true);
    
    const newSceneIds = prompts.map(() => crypto.randomUUID());
    const placeholderScenes: GeneratedScene[] = prompts.map((prompt, index) => ({
      id: newSceneIds[index],
      prompt,
      imageUrl: null,
      loading: true,
      error: null,
      timestamp: Date.now(),
      charactersIncluded: [],
    }));

    setScenes((prev) => [...prev, ...placeholderScenes]);

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      const sceneId = newSceneIds[i];

      try {
        const result = await generateSceneImage(prompt, cast);
        setScenes((prev) =>
          prev.map((s) =>
            s.id === sceneId
              ? { 
                  ...s, 
                  imageUrl: result.imageUrl, 
                  charactersIncluded: result.charactersIncluded, 
                  loading: false,
                  cost: result.cost
                }
              : s
          )
        );
        addNotification(`Scene Generated`, 'success', result.cost);
      } catch (error: any) {
        setScenes((prev) =>
          prev.map((s) =>
            s.id === sceneId ? { ...s, loading: false, error: error.message || "Failed" } : s
          )
        );
        addNotification(`Scene Failed: ${error.message}`, 'error');
      }
    }
    setIsGenerating(false);
  };

  const downloadSceneMap = () => {
    const sceneMap: Record<string, string[]> = {};
    scenes.forEach((scene, idx) => {
        if (scene.imageUrl) {
            sceneMap[`image_${idx + 1}_${scene.id.slice(0,4)}.png`] = scene.charactersIncluded;
        }
    });
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sceneMap, null, 2));
    const anchor = document.createElement('a');
    anchor.setAttribute("href", dataStr);
    anchor.setAttribute("download", "scene_map.json");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };
  
  const handleClearStorage = async () => {
      if(window.confirm("FACTORY RESET: This will delete all local Cast, Scenes, and Videos. Continue?")) {
          localStorage.clear();
          sessionStorage.clear(); // Clear API Key too
          await AssetStore.clearAssets();
          window.location.reload();
      }
  }

  // --- RENDER: LOADING / GATEKEEPER ---
  
  if (checkingKey) {
    return null;
  }

  if (!hasApiKey) {
    const isAIStudio = typeof window !== 'undefined' && window.aistudio;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-atelier-bg text-atelier-ink font-sans p-6">
         <div className="text-center max-w-md w-full bg-white p-12 border border-atelier-accent shadow-lg">
            <h1 className="text-3xl font-bold tracking-[0.25em] uppercase mb-2">Cosmo</h1>
            <h2 className="text-xl font-light tracking-[0.25em] uppercase mb-8">Studios</h2>
            <p className="text-xs text-atelier-muted uppercase tracking-widest mb-8 leading-relaxed">
               Swiss-Digital Atelier v2.2<br/>
               High-Fidelity Character, Voice & Motion
            </p>
            
            {isAIStudio ? (
              <button 
                onClick={handleSelectKey}
                className="w-full py-4 bg-atelier-ink text-white text-xs font-bold uppercase tracking-[0.2em] hover:bg-atelier-active transition-all"
              >
                Select API Key to Enter
              </button>
            ) : (
              <form onSubmit={handleManualKeySubmit} className="flex flex-col gap-3">
                <input 
                  type="password"
                  placeholder="Enter Gemini API Key"
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  className="w-full p-3 text-center text-sm border border-atelier-accent outline-none focus:border-atelier-ink placeholder:text-atelier-muted/50"
                  autoFocus
                />
                <button 
                  type="submit"
                  disabled={!manualKey}
                  className="w-full py-4 bg-atelier-ink text-white text-xs font-bold uppercase tracking-[0.2em] hover:bg-atelier-active transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                   Enter Studio
                </button>
              </form>
            )}
            
            <div className="mt-6 text-[10px] text-atelier-muted text-center">
               <span className="block mb-1">Your key is stored locally in this session only.</span>
               <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline hover:text-atelier-ink">
                  Get a Gemini API Key
               </a>
            </div>
         </div>
      </div>
    );
  }

  if (isHydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-atelier-bg text-atelier-ink font-sans">
         <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-atelier-accent border-t-atelier-ink rounded-full animate-spin"></div>
            <span className="text-xs uppercase tracking-widest">Restoring Studio Assets...</span>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans bg-atelier-bg text-atelier-ink overflow-hidden">
      
      {/* TOAST NOTIFICATIONS */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className={`pointer-events-auto min-w-[200px] p-4 rounded shadow-lg flex items-center justify-between text-xs font-medium animate-in slide-in-from-right fade-in duration-300 ${
            n.type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-white text-atelier-ink border border-atelier-accent'
          }`}>
            <span>{n.message}</span>
            {n.cost && <span className="ml-4 bg-green-100 text-green-800 px-2 py-1 rounded-full text-[10px]">+${n.cost.toFixed(4)}</span>}
          </div>
        ))}
      </div>

      {/* TOP NAVIGATION */}
      <div className="bg-atelier-bg p-4 md:p-6 flex items-center justify-between border-b border-atelier-accent shrink-0">
         <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-bold tracking-[0.25em] uppercase">Cosmo</h1>
            <h2 className="text-xl font-light tracking-[0.25em] uppercase">Studios</h2>
         </div>
         <div className="flex items-center gap-6">
             <button onClick={handleClearStorage} className="text-[9px] text-red-500 underline hover:text-red-700 uppercase tracking-widest">
                Reset App
             </button>
             <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] text-atelier-muted uppercase tracking-widest">Session Cost</span>
                <span className="text-sm font-bold font-mono">${totalCost.toFixed(4)}</span>
             </div>
             <div className="text-[10px] text-atelier-muted tracking-widest hidden md:block">
               SWISS-DIGITAL ATELIER v2.2
             </div>
         </div>
      </div>

      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* WORKSPACE CONTENT */}
      <div className="flex-1 overflow-hidden relative">
        
        {/* --- MODULE 1: CHARACTER LAB --- */}
        <div className={`absolute inset-0 flex flex-col md:flex-row ${activeTab === 'character' ? 'z-10 visible' : 'z-0 invisible'}`}>
             
             {/* LEFT COLUMN: CAST + INPUTS */}
             <div className="w-full md:w-[35%] flex flex-col border-r border-atelier-accent bg-atelier-bg z-20 h-full shadow-xl md:shadow-none">
               
               {/* 1. CAST STRIP (Fixed Height, Horizontal Scroll) */}
               <div className="flex-none p-4 border-b border-atelier-accent bg-white/50 backdrop-blur-sm">
                  <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3 text-atelier-muted">Cast Reference</h3>
                  <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar snap-x">
                      {cast.map((member) => (
                         <div key={member.id} className="w-24 shrink-0 snap-start">
                            <CastMemberInput member={member} onUpdate={handleCastUpdate} />
                         </div>
                      ))}
                  </div>
               </div>

               {/* 2. DIRECTOR'S INPUT (Flexible Height) */}
               <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
                  <PromptEngine 
                    cast={cast}
                    onGenerate={handleGenerateScenes} 
                    isGenerating={isGenerating} 
                  />
                  {scenes.length > 0 && (
                    <button onClick={downloadSceneMap} className="mt-4 text-[9px] uppercase tracking-widest text-atelier-muted hover:text-atelier-ink text-center w-full border border-dashed border-atelier-accent py-2 hover:border-atelier-ink transition-colors shrink-0">
                        Download Scene Metadata
                    </button>
                  )}
               </div>
             </div>

             {/* RIGHT COLUMN: GALLERY */}
             <section className="flex-1 p-6 md:p-12 overflow-y-auto bg-white">
               <Gallery scenes={scenes} />
             </section>
        </div>

        {/* --- MODULE 2: VOICE LAB --- */}
        <div className={`absolute inset-0 bg-atelier-bg overflow-y-auto ${activeTab === 'voice' ? 'z-10 visible' : 'z-0 invisible'}`}>
          <VoiceLab castMembers={cast} addNotification={addNotification} />
        </div>

        {/* --- MODULE 3: MOTION LAB --- */}
        <div className={`absolute inset-0 bg-atelier-bg overflow-y-auto ${activeTab === 'motion' ? 'z-10 visible' : 'z-0 invisible'}`}>
          <CinemaLab scenes={scenes} addNotification={addNotification} />
        </div>

      </div>
    </div>
  );
};

export default App;