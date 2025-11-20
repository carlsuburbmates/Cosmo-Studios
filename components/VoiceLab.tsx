import React, { useState, useEffect, useRef } from "react";
import { ScriptLine, VoiceMap, CastMember } from "../types";
import { generateSpeech, estimateTTSCost } from "../services/geminiService";
import * as AssetStore from "../services/assetStore";
import { loadProjectData, saveProjectData } from "../services/projectService";

const AVAILABLE_VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];

interface VoiceLabProps {
  castMembers: CastMember[];
  addNotification: (message: string, type: 'success' | 'error' | 'info' | 'warning', cost?: number) => void;
  projectId: string;
  userId: string;
  onGenerateStoryboard: (script: string) => void;
  isGenerating: boolean;
}

export const VoiceLab: React.FC<VoiceLabProps> = ({ castMembers, addNotification, projectId, userId, onGenerateStoryboard, isGenerating }) => {
  const [scriptText, setScriptText] = useState("");
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const [voiceMap, setVoiceMap] = useState<VoiceMap>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const isHydratedRef = useRef(false);
  const lastSavedAudio = useRef<Set<string>>(new Set());

  useEffect(() => {
    const hydrate = async () => {
        try {
            const data: any = loadProjectData(userId, projectId, "voice", {});
            if (data.scriptText) {
                setScriptText(data.scriptText);
                setVoiceMap(data.voiceMap || {});
                if (data.lines) {
                    const restoredLines = await Promise.all(data.lines.map(async (l: ScriptLine) => {
                        if (!l.audioUrl && l.id) { 
                             const audio = await AssetStore.getAsset(`voice_${l.id}`);
                             if (audio) lastSavedAudio.current.add(`voice_${l.id}_${audio.length}`);
                             return audio ? { ...l, audioUrl: audio } : l;
                        }
                        return l;
                    }));
                    setLines(restoredLines);
                }
            }
        } catch (e) { console.warn(e); } finally { isHydratedRef.current = true; }
    };
    hydrate();
  }, [projectId, userId]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    const saveTimeout = setTimeout(async () => {
        try {
             const metaLines = lines.map(l => ({ ...l, audioUrl: null }));
             saveProjectData(userId, projectId, "voice", { scriptText, voiceMap, lines: metaLines });
             await Promise.all(lines.map(async l => {
                 if (l.audioUrl && !lastSavedAudio.current.has(`voice_${l.id}_${l.audioUrl.length}`)) {
                     await AssetStore.saveAsset(`voice_${l.id}`, l.audioUrl);
                     lastSavedAudio.current.add(`voice_${l.id}_${l.audioUrl.length}`);
                 }
             }));
        } catch (e) { console.warn(e); }
    }, 1000);
    return () => clearTimeout(saveTimeout);
  }, [scriptText, lines, voiceMap, projectId, userId]);

  const parseScript = () => {
    const rawLines = scriptText.split("\n").filter((l) => l.trim() !== "");
    const newLines: ScriptLine[] = [];
    const newVoiceMap = { ...voiceMap };
    let voiceIndex = Object.keys(voiceMap).length;
    const newlyAddedSpeakers = new Set<string>();

    rawLines.forEach((raw) => {
      const parts = raw.split(":");
      let speaker = parts.length > 1 ? parts[0].trim() : "Narrator";
      let text = parts.length > 1 ? parts.slice(1).join(":").trim() : raw;

      // Ignore lines that are not dialogue (for storyboarding)
      if (parts.length === 1) {
          return;
      }
      
      if (!newVoiceMap[speaker]) { 
          newVoiceMap[speaker] = AVAILABLE_VOICES[voiceIndex++ % AVAILABLE_VOICES.length]; 
          newlyAddedSpeakers.add(speaker);
      }
      
      const existing = lines.find(l => l.speaker === speaker && l.text === text);
      newLines.push(existing || {
        id: crypto.randomUUID(), speaker, text, audioUrl: null, isLoading: false, voiceName: newVoiceMap[speaker],
        matchedCastId: castMembers.find(c => c.label.toLowerCase() === speaker.toLowerCase())?.id
      });
    });

    setVoiceMap(newVoiceMap);
    setLines(newLines);
    
    let message = `Script updated with ${newLines.length} dialogue lines.`;
    if (newlyAddedSpeakers.size > 0) {
        const speakerList = Array.from(newlyAddedSpeakers).join(', ');
        message += ` Assigned voices for: ${speakerList}.`;
    }
    addNotification(message, 'info');
  };

  const generateAudioForLine = async (idx: number) => {
    const line = lines[idx];
    if (!line.text) return;
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, isLoading: true } : l));
    try {
      const result = await generateSpeech(line.text, line.voiceName);
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, audioUrl: result.audioUrl, isLoading: false } : l));
      addNotification(`Audio for "${line.speaker}" generated.`, 'success', result.cost);
    } catch (e: any) {
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, isLoading: false } : l));
      addNotification(`Error: ${e.message}`, "error");
    }
  };

  const handleExportScript = () => {
    const blob = new Blob([scriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "script.txt";
    a.click();
    URL.revokeObjectURL(url);
    addNotification("Script exported.", "success");
  };

  return (
    <div className="flex flex-col md:flex-row w-full h-auto md:h-full">
        {/* Left: Script Editor */}
        <div className="w-full md:w-[320px] lg:w-[380px] flex-none flex flex-col border-b md:border-b-0 md:border-r border-stone-200 bg-white h-auto md:h-full z-10 shadow-sm">
            <div className="p-4 border-b border-stone-100 flex justify-between items-center">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Script Editor</h2>
                <button onClick={handleExportScript} className="text-[9px] font-bold uppercase hover:underline" disabled={!scriptText}>Export .TXT</button>
            </div>
            <div className="flex-1 p-5 flex flex-col gap-4 h-auto md:overflow-y-auto">
                <textarea
                    className="flex-1 w-full p-3 text-base md:text-xs bg-white text-stone-900 border border-stone-200 focus:border-atelier-ink outline-none resize-none font-mono leading-relaxed min-h-[200px] rounded-sm"
                    placeholder={`Write scene descriptions and dialogue.
Lines without "Speaker:" create storyboard images.

Example:
A shot of Char1 on a neon-lit street.
Char1: (sadly) I can't go back.`}
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={parseScript} className="py-4 md:py-3 bg-atelier-ink text-white text-xs font-bold uppercase tracking-widest hover:bg-stone-800 transition-colors rounded-sm">Update Timeline</button>
                    <button onClick={() => onGenerateStoryboard(scriptText)} disabled={isGenerating} className="py-4 md:py-3 bg-indigo-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-indigo-700 transition-colors rounded-sm disabled:bg-indigo-300">✦ Generate Storyboard</button>
                </div>
            </div>
        </div>

        {/* Right: Timeline */}
        <div className="flex-1 bg-stone-50 p-4 md:p-8 h-auto md:h-full md:overflow-y-auto min-h-[400px]">
            <div className="max-w-3xl mx-auto space-y-4">
                {lines.map((line, idx) => (
                    <div key={line.id} className="bg-white border border-stone-200 p-4 rounded-sm flex items-start gap-4 shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-500 uppercase flex-shrink-0">{line.speaker[0]}</div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between mb-1"><span className="text-[10px] font-bold uppercase truncate">{line.speaker}</span><span className="text-[9px] text-stone-400">{line.voiceName}</span></div>
                            <p className="text-sm text-stone-800 font-serif mb-2">{line.text}</p>
                            {line.isLoading ? <div className="h-1 bg-stone-200 w-20 animate-pulse rounded"></div> : line.audioUrl ? <audio controls src={line.audioUrl} className="w-full h-8" /> : <button onClick={() => generateAudioForLine(idx)} className="text-[9px] font-bold text-indigo-600 uppercase">Synthesize</button>}
                        </div>
                    </div>
                ))}
                {lines.length === 0 && (
                    <div className="text-center text-stone-400 text-xs uppercase py-20 border-2 border-dashed rounded-lg">
                        <span className="text-3xl mb-2 block">🎙️</span>
                        <h3 className="font-bold text-stone-600 mb-1">The timeline is silent.</h3>
                        <p>Write a script in the editor and click "Update Timeline" to begin.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};