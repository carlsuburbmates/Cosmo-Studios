import React, { useRef } from "react";
import { CastMember } from "../types";

interface CastMemberInputProps {
  member: CastMember;
  onUpdate: (id: string, updates: Partial<CastMember>) => void;
  disabled?: boolean;
}

export const CastMemberInput: React.FC<CastMemberInputProps> = React.memo(({
  member,
  onUpdate,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      onUpdate(member.id, { image: result, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    if (disabled) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onUpdate(member.id, { image: null, mimeType: "" });
  };

  return (
    <div className={`flex-shrink-0 w-28 md:w-32 group relative ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div className="flex flex-col mb-1.5 gap-0.5">
        <input 
          type="text"
          value={member.label}
          onChange={(e) => onUpdate(member.id, { label: e.target.value })}
          className="text-[10px] font-bold tracking-widest uppercase text-atelier-ink bg-transparent border-b border-transparent hover:border-atelier-accent focus:border-atelier-ink outline-none w-full transition-colors disabled:hover:border-transparent"
          placeholder="NAME"
          disabled={disabled}
        />
        <input 
          type="text"
          value={member.role}
          onChange={(e) => onUpdate(member.id, { role: e.target.value })}
          className="text-[9px] text-atelier-muted uppercase tracking-wide bg-transparent border-b border-transparent hover:border-atelier-accent focus:border-atelier-ink outline-none w-full transition-colors disabled:hover:border-transparent"
          placeholder="ROLE"
          disabled={disabled}
        />
      </div>

      <div
        className={`relative w-full aspect-[3/4] border transition-all duration-300 flex flex-col items-center justify-center overflow-hidden rounded-sm ${
          member.image
            ? "border-atelier-ink bg-white shadow-sm"
            : `border-atelier-accent bg-white border-dashed ${!disabled ? 'hover:border-atelier-muted cursor-pointer' : ''}`
        }`}
        onClick={() => !member.image && !disabled && fileInputRef.current?.click()}
        title={member.image ? "Click 'X' to remove" : "Click to upload"}
      >
        {member.image ? (
          <>
            <img
              src={member.image}
              alt={member.label}
              className="w-full h-full object-cover grayscale-[20%] hover:grayscale-0 transition-all duration-500"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemove();
              }}
              disabled={disabled}
              className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-black transition-colors text-[10px] disabled:bg-gray-500"
            >
              &times;
            </button>
          </>
        ) : (
          <div className="text-center p-2 pointer-events-none">
            <span className="block text-xl mb-1 text-atelier-muted font-light">+</span>
            <span className="text-[9px] text-atelier-muted uppercase tracking-wider font-medium">
              Ref
            </span>
          </div>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
});