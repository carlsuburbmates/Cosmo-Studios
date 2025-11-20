import React, { useState } from "react";
import { ScriptLine, VoiceMap, CastMember } from "../types";
import { generateSpeech } from "../services/geminiService";

const AVAILABLE_VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];

interface VoiceLabProps {
  castMembers: CastMember[];
  addNotification: (message: string, type: 'success' | 'error' | 'info', cost?: number) => void;
}

export const VoiceLab: React.FC<VoiceLabProps> = ({ castMembers, addNotification }) => {
  const [scriptText, setScriptText] = useState("");
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const [voiceMap, setVoiceMap] = useState<VoiceMap>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Helper: Fuzzy match script name to Cast Member (ID or Role)
  const findCastMember = (name: string) => {
    const search = name.toLowerCase().trim();
    if (!search) return undefined;
    
    return castMembers.find(c => 
      c.label.toLowerCase() === search || 
      c.role.toLowerCase().includes(search) || // e.g. "Hero" matches "The Hero"
      search === c.role.toLowerCase()
    );
  };

  // Parse script into lines and assign voices
  const parseScript = () => {
    const rawLines = scriptText.split("\n").filter((l) => l.trim() !== "");
    const newLines: ScriptLine[] = [];
    const newVoiceMap = { ...voiceMap };
    let voiceIndex = 0;

    rawLines.forEach((raw) => {
      // Simple parser: "Speaker: Text"
      const parts = raw.split(":");
      let speaker = "Narrator";
      let text = raw;

      if (parts.length > 1) {
        speaker = parts[0].trim();
        text = parts.slice(1).join(":").trim();
      }

      // Attempt to auto-match speaker name to cast member
      const matchedCast = findCastMember(speaker);

      // Auto-assign voice if not exists
      if (!newVoiceMap[speaker]) {
        newVoiceMap[speaker] = AVAILABLE_VOICES[voiceIndex % AVAILABLE_VOICES.length];
        voiceIndex++;
      }

      newLines.push({
        id: crypto.randomUUID(),
        speaker,
        text,
        audioUrl: null,
        isLoading: false,
        voiceName: newVoiceMap[speaker],
        matchedCastId: matchedCast?.id // Store the link for UI avatars
      });
    });

    setVoiceMap(newVoiceMap);
    setLines(newLines);
    addNotification(`Script parsed: ${newLines.length} lines ready.`, 'info');
  };

  const generateAudioForLine = async (lineIndex: number) => {
    const line = lines[lineIndex];
    if (!line.text) return;

    setLines((prev) =>
      prev.map((l, i) => (i === lineIndex ? { ...l, isLoading: true } : l))
    );

    try {
      const result = await generateSpeech(line.text, line.voiceName);
      setLines((prev) =>
        prev.map((l, i) => (i === lineIndex ? { ...l, audioUrl: result.audioUrl, cost: result.cost, isLoading: false } : l))
      );
      addNotification("Audio generated", "success", result.cost);
    } catch (e: any) {
      console.error(e);
      setLines((prev) =>
        prev.map((l, i) => (i === lineIndex ? { ...l, isLoading: false } : l))
      );
      addNotification(`Generation failed for ${line.speaker}: ${e.message}`, "error");
    }
  };

  const handleGenerateAll = async () => {
    setIsProcessing(true);
    // Generate sequentially to prevent rate limits
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].audioUrl) {
        await generateAudioForLine(i);
      }
    }
    setIsProcessing(false);
  };

  const getCastImage = (id?: string) => {
    const member = castMembers.find(c => c.id === id);
    return member?.image;
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-6 md:p-12 h-full overflow-y-auto">
      <div className="flex justify-between items-end mb-8 border-b border-atelier-accent pb-4">
        <div>
           <h2 className="text-2xl font-bold tracking-[0.2em] uppercase mb-2">Voice Lab</h2>
           <p className="text-xs text-atelier-muted uppercase tracking-widest">Module 2: Text-to-Speech Synthesis</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-24">
        {/* Left: Script Input */}
        <div className="md:col-span-1 flex flex-col gap-4">
          <div className="bg-yellow-50 border border-yellow-200 p-3 text-[10px] text-yellow-800 leading-relaxed">
             <strong>Pro Tip:</strong> Use Character IDs (Char1) OR Roles (Hero) to auto-link images. 
             Mismatched names will appear <span className="text-red-500 font-bold">Red</span>.
          </div>
          <textarea
            className="w-full h-64 p-4 text-sm bg-white border border-atelier-accent focus:border-atelier-ink outline-none resize-none font-mono"
            placeholder={`Hero: We need to go now!\nVillain: It's too late for that.\nNarrator: The sky turned red.`}
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
          />
          <button
            onClick={parseScript}
            className="w-full py-3 bg-white border border-atelier-ink text-atelier-ink hover:bg-atelier-ink hover:text-white text-xs font-bold uppercase tracking-widest transition-colors"
          >
            Parse Script
          </button>

          {/* Voice Map Config */}
          {Object.keys(voiceMap).length > 0 && (
            <div className="bg-white border border-atelier-accent p-4 mt-4">
              <h4 className="text-[10px] font-bold uppercase mb-3 text-atelier-muted">Cast Voice Assignment</h4>
              {Object.entries(voiceMap).map(([speaker, assignedVoice]) => {
                  const matched = findCastMember(speaker);
                  const isNarrator = speaker.toLowerCase() === 'narrator';
                  const isError = !matched && !isNarrator;

                  return (
                    <div key={speaker} className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        {matched?.image && (
                            <img src={matched.image} className="w-6 h-6 rounded-full object-cover border border-gray-200" alt="icon" />
                        )}
                        <span 
                           className={`text-xs font-bold truncate max-w-[100px] ${isError ? 'text-red-600 decoration-dotted underline' : 'text-atelier-ink'}`} 
                           title={isError ? "Name mismatch. Use 'CharX' or Role Name." : "Matched"}
                        >
                            {speaker}
                        </span>
                      </div>
                      <select
                        value={assignedVoice}
                        onChange={(e) => setVoiceMap({ ...voiceMap, [speaker]: e.target.value })}
                        className="text-xs border border-atelier-accent p-1 outline-none bg-transparent focus:border-atelier-ink"
                      >
                        {AVAILABLE_VOICES.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  );
              })}
            </div>
          )}
        </div>

        {/* Right: Audio Timeline */}
        <div className="md:col-span-2">
          {lines.length === 0 ? (
            <div className="h-full flex items-center justify-center border border-dashed border-atelier-accent text-atelier-muted text-xs uppercase tracking-widest">
              Waiting for script...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                 <span className="text-xs font-bold uppercase tracking-widest">Timeline ({lines.length} Lines)</span>
                 <button
                    onClick={handleGenerateAll}
                    disabled={isProcessing}
                    className="px-6 py-2 bg-atelier-ink text-white text-xs font-bold uppercase tracking-widest hover:bg-atelier-active disabled:opacity-50 transition-all"
                 >
                    {isProcessing ? "Synthesizing..." : "Generate All"}
                 </button>
              </div>

              {lines.map((line, idx) => (
                <div key={line.id} className="bg-white border border-atelier-accent p-4 flex items-start gap-4 hover:shadow-sm transition-shadow">
                   {/* Avatar Column */}
                   <div className="w-12 pt-1 flex flex-col items-center gap-1">
                      {getCastImage(line.matchedCastId) ? (
                          <img src={getCastImage(line.matchedCastId)!} className="w-10 h-10 rounded-full object-cover border border-atelier-accent" alt="avatar" />
                      ) : (
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-bold ${line.speaker.toLowerCase() === 'narrator' ? 'bg-gray-100 text-gray-400' : 'bg-red-50 text-red-400 border border-red-100'}`}>
                              {line.speaker.substring(0,2).toUpperCase()}
                          </div>
                      )}
                   </div>

                   <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-1">
                         <span className={`text-[10px] uppercase font-bold ${!line.matchedCastId && line.speaker.toLowerCase() !== 'narrator' ? 'text-red-600' : 'text-atelier-ink'}`}>
                            {line.speaker}
                         </span>
                         <div className="flex items-center gap-2">
                             {line.cost && <span className="text-[9px] bg-green-50 text-green-700 px-1 rounded border border-green-100">${line.cost.toFixed(5)}</span>}
                             <span className="text-[10px] text-atelier-muted bg-atelier-bg px-1 border border-atelier-accent rounded">{line.voiceName}</span>
                         </div>
                      </div>
                      <p className="text-sm text-atelier-ink mb-3 font-serif leading-relaxed">{line.text}</p>
                      
                      {line.isLoading ? (
                         <div className="h-1 w-full bg-atelier-accent overflow-hidden rounded-full">
                            <div className="h-full bg-atelier-ink animate-pulse"></div>
                         </div>
                      ) : line.audioUrl ? (
                         <audio controls src={line.audioUrl} className="w-full h-8" />
                      ) : (
                        <button onClick={() => generateAudioForLine(idx)} className="text-[10px] border border-atelier-accent px-3 py-1 hover:bg-atelier-ink hover:text-white transition-colors uppercase tracking-wide">
                           Synthesize
                        </button>
                      )}
                   </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};