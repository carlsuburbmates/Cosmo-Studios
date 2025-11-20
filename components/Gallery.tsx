import React from "react";
import { GeneratedScene } from "../types";
import { SceneCard } from "./SceneCard";

interface GalleryProps {
  scenes: GeneratedScene[];
  onEdit: (id: string, prompt: string) => void;
  onUndo: (id: string) => void;
  onRedo: (id: string) => void;
  onToggleEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onVerify: (id: string) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
}

export const Gallery: React.FC<GalleryProps> = ({
  scenes, onEdit, onUndo, onRedo, onToggleEdit, onApprove, onReject, onVerify, onUpdateTags
}) => {

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 border-b border-atelier-accent pb-2">
        <h2 className="text-sm font-bold tracking-[0.2em] uppercase">
          Output Canvas
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-atelier-muted">
          {scenes.length} Generated
        </span>
      </div>

      {scenes.length > 0 ? (
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pb-20 items-start">
         {scenes.map((scene) => (
           <SceneCard
             key={scene.id}
             scene={scene}
             onEdit={onEdit}
             onUndo={onUndo}
             onRedo={onRedo}
             onToggleEdit={onToggleEdit}
             onApprove={onApprove}
             onReject={onReject}
             onVerify={onVerify}
             onUpdateTags={onUpdateTags}
           />
         ))}
       </div>
      ) : (
        <div className="w-full aspect-video border-2 border-dashed border-atelier-accent flex flex-col items-center justify-center text-center p-4">
            <span className="text-atelier-accent text-4xl font-light mb-4">🖼️</span>
            <h3 className="text-sm font-bold text-atelier-ink">Your canvas is ready.</h3>
            <p className="text-xs text-atelier-muted">Generated scenes will appear here. Start by writing a prompt in the <br/><strong>Director's Input</strong> panel to your left.</p>
        </div>
      )}
    </div>
  );
};