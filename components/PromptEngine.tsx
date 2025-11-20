import React, { useState, useEffect } from "react";
import { CastMember, AspectRatio } from "../types";
import { useDebounce } from "../hooks/useDebounce";
import { generateCreativePrompts, estimateBatchCost, validatePromptSafety } from "../services/geminiService";

interface PromptEngineProps {
  cast: CastMember[];
  onGenerate: (prompts: string[], aspectRatio: AspectRatio) => void;
  isGenerating: boolean;
  initialPrompts?: string[];
  initialRatio?: AspectRatio;
  projectId: string;
}

const WIZARD_CHIPS = {
  MOOD: ["Cyberpunk", "Film Noir", "Studio Ghibli", "Hyper-realistic", "Minimalist", "Watercolor", "Vaporwave"],
  CAMERA: ["Close-up", "Wide Angle", "Dutch Angle", "Over-the-shoulder", "Drone View", "Low Angle", "Fisheye"],
  LIGHTING: ["Golden Hour", "Neon Lights", "Cinematic", "Dark & Gritty", "Rembrandt", "Soft Box", "Volumetric Fog"]
};

const RATIOS: AspectRatio[] = ['16:9', '21:9', '1:1', '9:16', '4:3'];

const WizardModal: React.FC<{ onAddChip: (text: string); onClose: () => void }> = ({ onAddChip, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<'MOOD' | 'CAMERA' | 'LIGHTING'>('MOOD');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b">
          <h3 className="text-xs font-bold uppercase tracking-widest">Add Style</h3>
        </div>
        <div className="p-4">
          <div className="flex gap-1 mb-3">
            {(['MOOD', 'CAMERA', 'LIGHTING'] as const).map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`flex-1 text-[9px] uppercase font-bold tracking-wider px-2 py-2 rounded transition-colors ${activeCategory === cat ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500 hover:text-stone-800'}`}>
                {cat}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {WIZARD_CHIPS[activeCategory].map(chip => (
              <button key={chip} onClick={() => onAddChip(chip)} className="whitespace-nowrap text-[10px] px-3 py-1.5 bg-white border border-stone-200 text-stone-600 hover:bg-stone-800 hover:text-white hover:border-stone-800 transition-all active:scale-95 rounded-sm">
                + {chip}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PromptEngine: React.FC<PromptEngineProps> = ({
  cast,
  onGenerate,
  isGenerating,
  initialPrompts,
  initialRatio,
  projectId
}) => {
  const storageKey = `cosmo_project_${projectId}_prompt_draft`;
  const [textValue, setTextValue] = useState<string>(() => localStorage.getItem(storageKey) || "");
  const debouncedTextValue = useDebounce(textValue, 500);

  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'MOOD' | 'CAMERA' | 'LIGHTING'>('MOOD');
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>('16:9');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);

  useEffect(() => {
    if (initialPrompts && initialPrompts.length > 0) setTextValue(initialPrompts.join("\n"));
  }, [initialPrompts]);

  useEffect(() => {
    if (initialRatio) setSelectedRatio(initialRatio);
  }, [initialRatio]);

  useEffect(() => {
    localStorage.setItem(storageKey, debouncedTextValue);
    const safety = validatePromptSafety(debouncedTextValue);
    setValidationError(!safety.safe ? `Use of "${safety.flaggedTerm}" is restricted.` : null);
  }, [debouncedTextValue, storageKey]);

  const currentPrompts = textValue.split("\n").map((p) => p.trim()).filter((p) => p.length > 0);
  const estimatedCost = estimateBatchCost(currentPrompts.length);

  const handleGenerate = () => {
    if (currentPrompts.length === 0 || validationError) return;
    onGenerate(currentPrompts, selectedRatio);
  };

  const handleBrainstorm = async () => {
    setIsBrainstorming(true);
    try {
      const result = await generateCreativePrompts(cast);
      const newPrompts = result.prompts.join("\n\n");
      setTextValue(prev => prev + (prev ? "\n\n" : "") + newPrompts);
    } catch (e) { console.error(e); } 
    finally { setIsBrainstorming(false); }
  };

  const addChip = (text: string) => {
    const separator = textValue.length > 0 && !textValue.endsWith('\n') && !textValue.endsWith(' ') ? ", " : "";
    setTextValue(prev => prev + separator + text);
    setIsStyleModalOpen(false); // Close modal on mobile after selection
  };

  return (
    <div className="flex flex-col h-full min-h-[350px] md:min-h-0">
      {isStyleModalOpen && <WizardModal onAddChip={addChip} onClose={() => setIsStyleModalOpen(false)} />}
      
      <div className="flex items-center justify-between pb-3 mb-1 border-b border-stone-100 flex-none">
        <div className="flex items-center gap-3">
          <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-stone-400">Director's Input</h2>
          <div className="flex bg-white border border-stone-200 rounded-sm overflow-hidden hidden md:flex">
            {RATIOS.map(r => <button key={r} onClick={() => setSelectedRatio(r)} className={`px-1.5 py-0.5 text-[9px] font-medium transition-colors ${selectedRatio === r ? 'bg-atelier-ink text-white' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'}`} title={`Aspect Ratio ${r}`}>{r}</button>)}
          </div>
          <select className="md:hidden text-[10px] bg-transparent font-bold uppercase" value={selectedRatio} onChange={e => setSelectedRatio(e.target.value as AspectRatio)}>
            {RATIOS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <span className="text-[9px] uppercase tracking-widest text-stone-400 whitespace-nowrap">{currentPrompts.length} SCENE{currentPrompts.length !== 1 ? 'S' : ''}</span>
      </div>

      <div className={`flex-1 flex flex-col bg-white border transition-colors relative shadow-sm mt-2 min-h-[200px] ${validationError ? 'border-red-300' : 'border-stone-200 hover:border-stone-300 focus-within:border-atelier-ink'}`}>
        <textarea
          className="flex-1 w-full p-4 text-base md:text-xs outline-none resize-none font-mono text-stone-700 placeholder-stone-300 bg-transparent leading-relaxed"
          placeholder={`Describe your scenes here...\n\nExample:\n1. Close up of The Hero looking stoic, cyberpunk neon lights.\n2. Char2 running through rain, wide angle.`}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          disabled={isGenerating}
        />
        {validationError && <div className="absolute bottom-full left-0 mb-1 bg-red-100 text-red-700 text-[10px] px-2 py-1 font-bold uppercase tracking-wide rounded border border-red-200 animate-in fade-in slide-in-from-bottom-1">⚠ {validationError}</div>}

        <div className="bg-stone-50 border-t border-stone-100 p-2 flex-none">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex gap-1 md:hidden">
                <button onClick={() => setIsStyleModalOpen(true)} className="text-[9px] uppercase font-bold tracking-wider px-3 py-2 rounded bg-stone-800 text-white">＋ Style</button>
            </div>
            <div className="hidden md:flex gap-1">
              {(['MOOD', 'CAMERA', 'LIGHTING'] as const).map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} className={`text-[9px] uppercase font-bold tracking-wider px-2 py-1 rounded transition-colors ${activeCategory === cat ? 'bg-stone-800 text-white' : 'text-stone-400 hover:text-stone-800'}`}>{cat}</button>
              ))}
            </div>
            <button onClick={handleBrainstorm} disabled={isBrainstorming || isGenerating} className="text-[9px] uppercase font-bold tracking-wider text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors whitespace-nowrap">
              {isBrainstorming ? (<span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse"></span>Thinking...</span>) : (<span>✦ Idea</span>)}
            </button>
          </div>

          <div className="hidden md:flex gap-2 overflow-x-auto pb-1 no-scrollbar mask-fade-right">
            {WIZARD_CHIPS[activeCategory].map(chip => (
              <button key={chip} onClick={() => addChip(chip)} className="whitespace-nowrap text-[10px] px-3 py-1.5 bg-white border border-stone-200 text-stone-600 hover:bg-stone-800 hover:text-white hover:border-stone-800 transition-all active:scale-95">{`+ ${chip}`}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex-none">
        <button onClick={handleGenerate} disabled={isGenerating || !textValue.trim() || !!validationError} className={`w-full py-4 md:py-3 text-xs font-bold uppercase tracking-[0.15em] transition-all duration-300 flex items-center justify-between px-6 border shadow-sm rounded-sm ${isGenerating || !textValue.trim() || validationError ? "bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed" : "bg-atelier-ink text-white border-atelier-ink hover:bg-stone-800 hover:shadow-md"}`}>
          {isGenerating ? (<span className="flex gap-1 mx-auto"><span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span><span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span><span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span></span>) : (<><span>GENERATE BATCH</span>{estimatedCost > 0 && (<span className="opacity-70 font-mono bg-white/10 px-2 py-0.5 rounded hidden md:inline">~${estimatedCost.toFixed(4)}</span>)}</>)}
        </button>
      </div>
    </div>
  );
};
