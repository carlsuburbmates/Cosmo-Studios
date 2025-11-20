import React, { useState, useEffect, useRef } from "react";
import { GeneratedScene, VideoJob } from "../types";
import { generateVideo } from "../services/geminiService";
import * as AssetStore from "../services/assetStore";
import { loadProjectData, saveProjectData } from "../services/projectService";

interface CinemaLabProps {
  scenes: GeneratedScene[];
  addNotification: (message: string, type: 'success' | 'error' | 'info' | 'warning', cost?: number) => void;
  projectId: string; 
  userId: string;
}

export const CinemaLab: React.FC<CinemaLabProps> = ({ scenes, addNotification, projectId, userId }) => {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const isHydratedRef = useRef(false);
  const lastSavedVideo = useRef<Set<string>>(new Set());

  useEffect(() => {
      const hydrate = async () => {
          try {
             const parsedJobs = loadProjectData<VideoJob[]>(userId, projectId, "motion", []);
             const restoredJobs = await Promise.all(parsedJobs.map(async (job) => {
                if (job.status === 'completed' && !job.videoUrl) {
                    const base64Url = await AssetStore.getAsset(`video_${job.id}`);
                    if (base64Url) lastSavedVideo.current.add(`video_${job.id}_${base64Url.length}`);
                    return base64Url ? { ...job, videoUrl: base64Url } : job;
                }
                return job;
             }));
             setJobs(restoredJobs);
          } catch (e) { console.warn(e); } finally { isHydratedRef.current = true; }
      };
      hydrate();
  }, [projectId, userId]);

  useEffect(() => {
      if (!isHydratedRef.current) return;
      const saveTimeout = setTimeout(async () => {
         try {
             const metaJobs = jobs.map(j => ({ ...j, videoUrl: null }));
             saveProjectData(userId, projectId, "motion", metaJobs);
             await Promise.all(jobs.map(async (job) => {
                 const signature = `video_${job.id}_${job.videoUrl?.length}`;
                 if (job.videoUrl && job.status === 'completed' && !lastSavedVideo.current.has(signature)) {
                    await AssetStore.saveAsset(`video_${job.id}`, job.videoUrl);
                    lastSavedVideo.current.add(signature);
                 }
             }));
         } catch (e) { console.warn(e); }
      }, 2000);
      return () => clearTimeout(saveTimeout);
  }, [jobs, projectId, userId]);
  
  const approvedScenes = scenes.filter(s => s.imageUrl && s.approvalStatus === 'approved');

  const handleCreateJob = async () => {
    const selectedScene = approvedScenes.find(s => s.id === selectedSceneId);
    if (!selectedScene || !selectedScene.imageUrl || !prompt) return;

    const newJob: VideoJob = {
      id: crypto.randomUUID(), sourceSceneId: selectedScene.id, sourceImageUrl: selectedScene.imageUrl,
      prompt: prompt, videoUrl: null, status: 'generating', error: null
    };

    setJobs(prev => [newJob, ...prev]);
    setPrompt(""); 

    try {
      const result = await generateVideo(selectedScene.imageUrl, newJob.prompt, selectedScene.aspectRatio);
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: 'completed', videoUrl: result.videoUrl, cost: result.cost } : j));
      addNotification("Video clip generated successfully.", "success", result.cost);
    } catch (error: any) {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: 'failed', error: error.message } : j));
      addNotification(`Video generation failed: ${error.message}`, "error");
    }
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-auto md:h-full">
        {/* Left: Input */}
        <div className="w-full md:w-[320px] lg:w-[380px] flex-none flex flex-col border-b md:border-b-0 md:border-r border-stone-200 bg-white h-auto md:h-full z-10 shadow-sm">
            <div className="p-4 border-b border-stone-100"><h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Action Director</h2></div>
            <div className="flex-1 p-5 md:overflow-y-auto">
                <h3 className="text-[9px] font-bold uppercase text-stone-400 mb-2">Select Approved Scene</h3>
                <div className="grid grid-cols-2 gap-2 mb-6">
                    {approvedScenes.map(scene => (
                        <div key={scene.id} onClick={() => setSelectedSceneId(scene.id)} className={`aspect-video border-2 rounded-sm overflow-hidden cursor-pointer ${selectedSceneId === scene.id ? 'border-atelier-ink' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                            <img src={scene.imageUrl!} className="w-full h-full object-cover" alt="scene" />
                        </div>
                    ))}
                    {approvedScenes.length === 0 && (
                        <div className="col-span-2 text-center py-4 text-xs text-stone-400 border border-dashed rounded-lg">
                            Go to the <strong>Character Lab</strong> and click '✓' on a generated scene to use it here.
                        </div>
                    )}
                </div>
                <h3 className="text-[9px] font-bold uppercase text-stone-400 mb-2">Movement Prompt</h3>
                <textarea 
                   value={prompt} 
                   onChange={e => setPrompt(e.target.value)} 
                   className="w-full h-24 p-3 text-base md:text-xs border border-stone-200 mb-3 bg-white text-slate-900 placeholder-slate-400 focus:border-atelier-ink outline-none resize-none rounded-sm" 
                   placeholder="e.g. Pan Right, Character Blinks" 
                />
                <button onClick={handleCreateJob} disabled={!selectedSceneId || !prompt} className="w-full py-4 md:py-3 bg-atelier-ink text-white text-xs font-bold uppercase disabled:bg-stone-200 transition-colors rounded-sm">Generate Clip</button>
            </div>
        </div>

        {/* Right: Queue */}
        <div className="flex-1 bg-stone-50 p-4 md:p-8 h-auto md:h-full md:overflow-y-auto min-h-[400px]">
            <div className="max-w-3xl mx-auto space-y-6">
                {jobs.map(job => (
                    <div key={job.id} className="bg-white border border-stone-200 flex flex-col md:flex-row rounded-sm overflow-hidden shadow-sm">
                        <div className="w-full md:w-64 aspect-video bg-black relative">
                            {job.status === 'completed' && job.videoUrl ? <video src={job.videoUrl} controls className="w-full h-full object-cover" /> : <img src={job.sourceImageUrl} className="w-full h-full object-cover opacity-50" alt="preview" />}
                            {job.status === 'generating' && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-[10px] uppercase tracking-widest animate-pulse">
                                    <span>Rendering...</span>
                                    <span className="text-[8px] opacity-70 mt-1">(This may take several minutes)</span>
                                </div>
                            )}
                            {job.status === 'failed' && <div className="absolute inset-0 flex items-center justify-center text-red-500 text-[10px] uppercase font-bold">Failed</div>}
                        </div>
                        <div className="flex-1 p-4">
                             <div className="flex justify-between items-start"><span className="text-[9px] font-bold uppercase bg-stone-100 px-1 rounded">{job.status}</span></div>
                             <p className="text-sm md:text-xs mt-2 font-medium text-stone-800">"{job.prompt}"</p>
                        </div>
                    </div>
                ))}
                {jobs.length === 0 && (
                    <div className="text-center text-stone-400 text-xs uppercase py-20 border-2 border-dashed rounded-lg">
                        <span className="text-3xl mb-2 block">🎬</span>
                        <h3 className="font-bold text-stone-600 mb-1">The cutting room is empty.</h3>
                        <p>Approve scenes, write a motion prompt, and generate a clip to see it here.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};