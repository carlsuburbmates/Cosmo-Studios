import React, { useState, KeyboardEvent } from 'react';
import { GeneratedScene } from '../types';

interface SceneCardProps {
  scene: GeneratedScene;
  onEdit: (id: string, prompt: string) => void;
  onUndo: (id: string) => void;
  onRedo: (id: string) => void;
  onToggleEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onVerify: (id: string) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
}

const getRatioStyle = (ratio?: string) => {
  if (!ratio) return { aspectRatio: '16/9' };
  const [w, h] = ratio.split(':');
  return { aspectRatio: `${w}/${h}` };
};

export const SceneCard: React.FC<SceneCardProps> = React.memo(({
  scene, onEdit, onUndo, onRedo, onToggleEdit, onApprove, onReject, onVerify, onUpdateTags
}) => {
  const [editInput, setEditInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  const handleEditSubmit = () => {
    if (editInput.trim()) {
      onEdit(scene.id, editInput);
      setEditInput("");
    }
  };

  const handleTagInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTags = [...(scene.tags || []), tagInput.trim()];
      onUpdateTags(scene.id, newTags);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = (scene.tags || []).filter(t => t !== tagToRemove);
    onUpdateTags(scene.id, newTags);
  };

  return (
    <div className="flex flex-col space-y-3 group w-full">
      <div
        className={`relative bg-white border w-full transition-all duration-500 hover:shadow-lg ${
          scene.approvalStatus === 'approved' ? 'border-green-500 ring-1 ring-green-500' :
          scene.approvalStatus === 'rejected' ? 'border-red-300 opacity-50' :
          'border-atelier-accent'
        }`}
      >
        {scene.approvalStatus === 'approved' && (
          <div className="absolute top-2 left-2 z-20 bg-green-500 text-white text-[9px] font-bold uppercase px-2 py-1 shadow-sm tracking-wider">
            Approved Asset
          </div>
        )}

        <div className="relative overflow-hidden w-full" style={getRatioStyle(scene.aspectRatio)}>
          {scene.loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-atelier-bg/50">
              <div className="w-12 h-12 border-2 border-atelier-accent border-t-atelier-ink rounded-full animate-spin"></div>
            </div>
          ) : scene.imageUrl ? (
            <img src={scene.imageUrl} alt={scene.prompt} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.01]" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-atelier-muted text-xs">
              {scene.error || "Failed to render"}
            </div>
          )}

          {!scene.loading && scene.imageUrl && (
            <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-atelier-accent p-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="flex items-center gap-2">
                <button onClick={() => onApprove(scene.id)} className={`w-6 h-6 flex items-center justify-center rounded-full border ${scene.approvalStatus === 'approved' ? 'bg-green-500 border-green-500 text-white' : 'border-green-200 text-green-600 hover:bg-green-50'}`} title="Approve for Video" aria-label="Approve Scene">✓</button>
                <button onClick={() => onReject(scene.id)} className={`w-6 h-6 flex items-center justify-center rounded-full border ${scene.approvalStatus === 'rejected' ? 'bg-red-500 border-red-500 text-white' : 'border-red-200 text-red-600 hover:bg-red-50'}`} title="Reject/Hide" aria-label="Reject Scene">✕</button>
                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                <button onClick={() => onToggleEdit(scene.id)} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 border rounded transition-colors ${scene.isEditing ? 'bg-atelier-ink text-white border-atelier-ink' : 'bg-white text-atelier-ink border-atelier-accent hover:border-atelier-ink'}`}>{scene.isEditing ? 'Close' : 'Edit'}</button>
                <button onClick={() => onUndo(scene.id)} disabled={!scene.history || scene.history.length === 0} className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 text-xs" title="Undo" aria-label="Undo Edit">↺</button>
              </div>
              <a href={scene.imageUrl} download={`scene_${scene.id}.png`} className="text-[10px] uppercase font-bold hover:underline" aria-label="Download Image">↓</a>
            </div>
          )}
        </div>
      </div>

      {scene.imageUrl && !scene.loading && (
        <div className="flex justify-between items-start px-1">
          <div className="flex items-center gap-2">
            {scene.consistencyScore !== undefined ? (
              <div className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${scene.consistencyScore > 75 ? 'bg-green-50 text-green-700 border-green-100' : 'bg-yellow-50 text-yellow-700 border-yellow-100'}`}>
                Score: {scene.consistencyScore}%
              </div>
            ) : (
              <button onClick={() => onVerify(scene.id)} className="text-[9px] text-indigo-600 hover:underline uppercase font-bold" disabled={scene.isVerifying}>
                {scene.isVerifying ? "Analyzing..." : "Verify Consistency"}
              </button>
            )}
          </div>
          {scene.consistencyFeedback && (
            <span className="text-[9px] text-atelier-muted italic truncate max-w-[150px]" title={scene.consistencyFeedback}>
              "{scene.consistencyFeedback}"
            </span>
          )}
        </div>
      )}

      {scene.isEditing && (
        <div className="bg-atelier-bg border border-atelier-accent p-3 animate-in slide-in-from-top-2 fade-in duration-300 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold uppercase text-atelier-muted">Smart Suggestions</span>
              {scene.isSuggesting && <span className="text-[9px] text-indigo-600 animate-pulse">Thinking...</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {scene.suggestions?.map((sug, idx) => (
                <button key={idx} onClick={() => onEdit(scene.id, sug)} className="text-[9px] bg-white border border-indigo-100 text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors truncate max-w-full">
                  ✨ {sug}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <input type="text" value={editInput} onChange={(e) => setEditInput(e.target.value)} placeholder="Describe modification..." className="flex-1 text-xs border border-atelier-accent p-2 focus:border-atelier-ink outline-none bg-white" onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()} />
            <button onClick={handleEditSubmit} className="bg-atelier-ink text-white text-[10px] uppercase font-bold px-3 hover:bg-atelier-active">Go</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 px-1">
        <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1 max-w-[70%]">
                <p className="text-[10px] text-atelier-ink uppercase tracking-wide font-medium truncate" title={scene.prompt}>{scene.prompt}</p>
                <span className="text-[9px] text-atelier-muted uppercase">{scene.aspectRatio || '16:9'}</span>
            </div>
            <div className="flex gap-1">
                {scene.charactersIncluded.map(char => (<span key={char} className="w-2 h-2 rounded-full bg-atelier-active" title={`Contains ${char}`}></span>))}
            </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
            {(scene.tags || []).map(tag => (
                <div key={tag} className="flex items-center gap-1 bg-stone-200 text-stone-600 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm">
                    <span>{tag}</span>
                    <button onClick={() => handleRemoveTag(tag)} className="text-stone-400 hover:text-stone-800">&times;</button>
                </div>
            ))}
            <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                placeholder="+ Tag"
                className="text-[9px] bg-transparent outline-none border-b border-dashed border-transparent focus:border-stone-400 w-12"
            />
        </div>
      </div>
    </div>
  );
});