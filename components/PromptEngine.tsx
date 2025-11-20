import React, { useState } from "react";
import { CastMember } from "../types";
import { generateCreativePrompts } from "../services/geminiService";

interface PromptEngineProps {
  cast: CastMember[];
  onGenerate: (prompts: string[]) => void;
  isGenerating: boolean;
}

// Wizard Chips configuration
const WIZARD_CHIPS = {
  MOOD: ["Cyberpunk", "Film Noir", "Studio Ghibli", "Hyper-realistic", "Minimalist", "Watercolor", "Vaporwave"],
  CAMERA: ["Close-up", "Wide Angle", "Dutch Angle", "Over-the-shoulder", "Drone View", "Low Angle", "Fisheye"],
  LIGHTING: ["Golden Hour", "Neon Lights", "Cinematic", "Dark & Gritty", "Rembrandt", "Soft Box", "Volumetric Fog"]
};

export const PromptEngine: React.FC<PromptEngineProps> = ({
  cast,
  onGenerate,
  isGenerating,
}) => {
  const [textValue, setTextValue] = useState("");
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'MOOD' | 'CAMERA' | 'LIGHTING'>('MOOD');

  // Calculate current prompts based on new lines
  const currentPrompts = textValue
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const handleGenerate = () => {
    if (currentPrompts.length === 0) return;
    onGenerate(currentPrompts);
  };

  const handleBrainstorm = async () => {
    setIsBrainstorming(true);
    try {
       const result = await generateCreativePrompts(cast);
       const newPrompts = result.prompts.join("\n\n");
       setTextValue(prev => prev + (prev ? "\n\n" : "") + newPrompts);
    } catch (e) {
       console.error(e);
    } finally {
       setIsBrainstorming(false);
    }
  };

  const addChip = (text: string) => {
    // Smart append: if line ends with text, add comma.
    const separator = textValue.length > 0 && !textValue.endsWith('\n') ? ", " : "";
    setTextValue(prev => prev + separator + text);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-2">
         <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-atelier-ink">
           Director's Input
         </h2>
         <span className="text-[10px] uppercase tracking-widest text-atelier-muted">
            {currentPrompts.length} SCENE{currentPrompts.length !== 1 ? 'S' : ''} DETECTED
         </span>
      </div>

      {/* MAIN EDITOR CONTAINER - The "Smart Editor" Look */}
      <div className="flex-1 flex flex-col bg-white border border-atelier-accent hover:border-atelier-ink focus-within:border-atelier-ink transition-colors relative shadow-sm">
        
        {/* 1. THE CANVAS (Text Area) - Maximized Space, Content First */}
        <textarea
          className="flex-1 w-full p-4 text-sm outline-none resize-none font-mono text-atelier-ink placeholder-atelier-muted/40 bg-transparent leading-relaxed"
          placeholder={`Describe your scenes here... (One scene per line)\n\nExample:\n1. Close up of The Hero looking stoic, cyberpunk neon lights.\n2. Char2 running through rain, wide angle.`}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          disabled={isGenerating}
        />

        {/* 2. THE TOOLBAR (Compact Bottom Bar) */}
        <div className="bg-atelier-bg border-t border-atelier-accent p-2">
            
            {/* Toolbar Header: Categories + Magic Button */}
            <div className="flex items-center justify-between mb-2 px-1">
               <div className="flex gap-1">
                   {(['MOOD', 'CAMERA', 'LIGHTING'] as const).map(cat => (
                       <button
                         key={cat}
                         onClick={() => setActiveCategory(cat)}
                         className={`text-[9px] uppercase font-bold tracking-wider px-2 py-1 rounded transition-colors ${activeCategory === cat ? 'bg-atelier-ink text-white' : 'text-atelier-muted hover:text-atelier-ink'}`}
                       >
                          {cat}
                       </button>
                   ))}
               </div>
               
               <button 
                 onClick={handleBrainstorm}
                 disabled={isBrainstorming || isGenerating}
                 className="text-[9px] uppercase font-bold tracking-wider text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
               >
                 {isBrainstorming ? (
                    <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-pulse"></span>
                        Thinking...
                    </span>
                 ) : (
                    <span>✦ Brainstorm</span>
                 )}
               </button>
            </div>

            {/* Horizontal Scrollable Chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar mask-fade-right">
               {WIZARD_CHIPS[activeCategory].map(chip => (
                   <button 
                     key={chip} 
                     onClick={() => addChip(chip)}
                     className="whitespace-nowrap text-[10px] px-3 py-1.5 bg-white border border-atelier-accent text-atelier-ink hover:bg-atelier-ink hover:text-white hover:border-atelier-ink transition-all active:scale-95"
                   >
                     + {chip}
                   </button>
               ))}
            </div>
        </div>
      </div>

      {/* GENERATE BUTTON */}
      <div className="mt-4">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !textValue.trim()}
          className={`w-full py-4 text-xs font-bold uppercase tracking-[0.15em] transition-all duration-300 flex items-center justify-center gap-2 border
            ${
              isGenerating || !textValue.trim()
                ? "bg-atelier-bg text-atelier-muted border-atelier-accent cursor-not-allowed"
                : "bg-atelier-ink text-atelier-bg border-atelier-ink hover:bg-atelier-active shadow-lg"
            }`}
        >
          {isGenerating ? (
            <>
              <span className="w-1.5 h-1.5 bg-atelier-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 bg-atelier-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 bg-atelier-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </>
          ) : (
            `GENERATE ${currentPrompts.length > 0 ? `(${currentPrompts.length})` : ''}`
          )}
        </button>
      </div>
    </div>
  );
};