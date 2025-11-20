import React, { useState } from "react";
import { GeneratedScene, VideoJob } from "../types";
import { generateVideo } from "../services/geminiService";

interface CinemaLabProps {
  scenes: GeneratedScene[]; // Inherit images from Module 1
  addNotification: (message: string, type: 'success' | 'error' | 'info', cost?: number) => void;
}

export const CinemaLab: React.FC<CinemaLabProps> = ({ scenes, addNotification }) => {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  
  // Only show successfully generated scenes
  const validScenes = scenes.filter(s => s.imageUrl);
  const selectedScene = validScenes.find(s => s.id === selectedSceneId);

  const handleCreateJob = async () => {
    if (!selectedScene || !selectedScene.imageUrl || !prompt) return;

    const newJob: VideoJob = {
      id: crypto.randomUUID(),
      sourceSceneId: selectedScene.id,
      sourceImageUrl: selectedScene.imageUrl,
      prompt: prompt,
      videoUrl: null,
      status: 'generating',
      error: null
    };

    setJobs(prev => [newJob, ...prev]);
    setPrompt(""); // Reset prompt
    addNotification("Video generation started. This will take ~1-2 minutes.", "info");

    try {
      const result = await generateVideo(selectedScene.imageUrl, newJob.prompt);
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: 'completed', videoUrl: result.videoUrl, cost: result.cost } : j));
      addNotification("Video generated successfully", "success", result.cost);
    } catch (error: any) {
      setJobs(prev => prev.map(j => j.id === newJob.id ? { ...j, status: 'failed', error: error.message } : j));
      addNotification(`Video failed: ${error.message}`, "error");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6 md:p-12 h-full overflow-y-auto">
      <div className="flex justify-between items-end mb-8 border-b border-atelier-accent pb-4">
         <div>
           <h2 className="text-2xl font-bold tracking-[0.2em] uppercase mb-2">Cinema Lab</h2>
           <p className="text-xs text-atelier-muted uppercase tracking-widest">Module 3: Veo Motion Engine</p>
         </div>
         <div className="text-right">
            <p className="text-[10px] text-atelier-muted">CREDITS: VEO-3.1-FAST</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-24">
        
        {/* LEFT: Source Selection & Controls */}
        <div className="lg:col-span-4 flex flex-col gap-6">
           <div className="bg-white border border-atelier-accent p-4">
              <h3 className="text-xs font-bold uppercase tracking-widest mb-4">1. Select Source Frame</h3>
              {validScenes.length === 0 ? (
                 <p className="text-xs text-atelier-muted">No scenes generated in Character Lab yet.</p>
              ) : (
                 <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-2">
                    {validScenes.map(scene => (
                       <div 
                          key={scene.id}
                          onClick={() => setSelectedSceneId(scene.id)}
                          className={`aspect-video cursor-pointer border-2 transition-all ${selectedSceneId === scene.id ? 'border-atelier-ink' : 'border-transparent opacity-60 hover:opacity-100'}`}
                       >
                          <img src={scene.imageUrl!} className="w-full h-full object-cover" alt="thumb" />
                       </div>
                    ))}
                 </div>
              )}
           </div>

           <div className="bg-white border border-atelier-accent p-4 flex-1">
               <h3 className="text-xs font-bold uppercase tracking-widest mb-4">2. Direct Action</h3>
               <textarea
                  disabled={!selectedSceneId}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full h-32 text-sm border border-atelier-accent p-3 focus:border-atelier-ink outline-none resize-none mb-4"
                  placeholder="Describe the camera movement or character action..."
               />
               <button
                  onClick={handleCreateJob}
                  disabled={!selectedSceneId || !prompt}
                  className="w-full py-3 bg-atelier-ink text-white text-xs font-bold uppercase tracking-widest hover:bg-atelier-active disabled:bg-atelier-accent disabled:text-atelier-muted transition-colors"
               >
                  Generate Video Clip
               </button>
               <p className="text-[10px] text-atelier-muted mt-2 leading-tight">
                  * This process uses Veo 3.1 and may take 30-60s per clip. Please remain on this tab.
               </p>
           </div>
        </div>

        {/* RIGHT: Render Queue / Gallery */}
        <div className="lg:col-span-8">
           <h3 className="text-xs font-bold uppercase tracking-widest mb-4">Render Queue</h3>
           <div className="space-y-6">
              {jobs.length === 0 && (
                 <div className="h-64 flex items-center justify-center border border-dashed border-atelier-accent text-atelier-muted text-xs uppercase tracking-widest">
                    Queue Empty
                 </div>
              )}
              {jobs.map(job => (
                 <div key={job.id} className="bg-white border border-atelier-accent p-0 flex flex-col md:flex-row overflow-hidden">
                    {/* Source Thumb */}
                    <div className="w-full md:w-48 aspect-video relative bg-atelier-bg border-b md:border-b-0 md:border-r border-atelier-accent">
                       <img src={job.sourceImageUrl} className="w-full h-full object-cover opacity-80" />
                       <div className="absolute bottom-0 left-0 bg-black/50 text-white text-[10px] px-2 py-1 uppercase">Source</div>
                    </div>

                    {/* Output / Status */}
                    <div className="flex-1 p-4 relative min-h-[180px] flex flex-col justify-center">
                       {job.status === 'generating' && (
                          <div className="flex flex-col items-center justify-center gap-3">
                             <div className="w-6 h-6 border-2 border-atelier-accent border-t-atelier-ink rounded-full animate-spin"></div>
                             <span className="text-xs uppercase tracking-widest animate-pulse">Rendering via Veo...</span>
                          </div>
                       )}
                       {job.status === 'failed' && (
                          <div className="text-red-500 text-xs text-center">
                             <span className="font-bold uppercase block mb-1">Render Failed</span>
                             {job.error}
                             <button onClick={() => setJobs(prev => prev.filter(j => j.id !== job.id))} className="mt-2 underline text-[10px]">Dismiss</button>
                          </div>
                       )}
                       {job.status === 'completed' && job.videoUrl && (
                          <div className="w-full h-full flex flex-col gap-2">
                             <video src={job.videoUrl} controls className="w-full h-full max-h-[300px] bg-black" />
                             <div className="flex justify-between items-center mt-2">
                                <div className="flex flex-col">
                                   <span className="text-[10px] uppercase text-atelier-muted font-mono">{job.prompt}</span>
                                   {job.cost && <span className="text-[9px] text-green-700 font-bold"> Est: ${job.cost.toFixed(3)}</span>}
                                </div>
                                <a href={job.videoUrl} download={`clip_${job.id}.mp4`} className="text-[10px] underline font-bold text-atelier-ink">Download MP4</a>
                             </div>
                          </div>
                       )}
                    </div>
                 </div>
              ))}
           </div>
        </div>

      </div>
    </div>
  );
};