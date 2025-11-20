import React from "react";
import { GeneratedScene } from "../types";

interface GalleryProps {
  scenes: GeneratedScene[];
}

export const Gallery: React.FC<GalleryProps> = ({ scenes }) => {
  // Ensure we display a grid even if empty.
  // Requirement: 2x5 Grid. That is 10 slots.
  const placeholders = Array.from({ length: 10 - scenes.length });

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 border-b border-atelier-accent pb-2">
        <h2 className="text-sm font-bold tracking-[0.2em] uppercase">
          Output Canvas
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-atelier-muted">
          {scenes.length} / 10 Generated
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pb-20">
        {scenes.map((scene) => (
          <div key={scene.id} className="flex flex-col space-y-3 group">
            <div className="relative aspect-video bg-white border border-atelier-accent overflow-hidden">
              {scene.loading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-atelier-bg/50">
                  <div className="w-12 h-12 border-2 border-atelier-accent border-t-atelier-ink rounded-full animate-spin"></div>
                </div>
              ) : scene.imageUrl ? (
                <>
                  <img
                    src={scene.imageUrl}
                    alt={scene.prompt}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <a 
                    href={scene.imageUrl} 
                    download={`scene_${scene.id}.png`}
                    className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 bg-white text-atelier-ink text-[10px] font-bold uppercase tracking-wider px-3 py-1 transition-opacity duration-300 hover:bg-atelier-ink hover:text-white"
                  >
                    Save
                  </a>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-atelier-muted text-xs">
                  {scene.error || "Failed to render"}
                </div>
              )}
            </div>
            <div className="flex items-start justify-between">
              <p className="text-[10px] text-atelier-ink uppercase tracking-wide font-medium truncate max-w-[70%]">
                {scene.prompt}
              </p>
              <div className="flex gap-1">
                 {scene.charactersIncluded.map(char => (
                   <span key={char} className="w-2 h-2 rounded-full bg-atelier-active" title={`Contains ${char}`}></span>
                 ))}
              </div>
            </div>
          </div>
        ))}

        {placeholders.map((_, i) => (
          <div
            key={`placeholder-${i}`}
            className="aspect-video border border-dashed border-atelier-accent flex items-center justify-center"
          >
            <span className="text-atelier-accent text-4xl font-light">+</span>
          </div>
        ))}
      </div>
    </div>
  );
};