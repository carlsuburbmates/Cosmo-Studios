import React, { useRef } from "react";
import { CastMember } from "../types";

interface CastMemberInputProps {
  member: CastMember;
  onUpdate: (id: string, image: string | null, mimeType: string) => void;
}

export const CastMemberInput: React.FC<CastMemberInputProps> = ({
  member,
  onUpdate,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      onUpdate(member.id, result, file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onUpdate(member.id, null, "");
  };

  return (
    <div className="group w-full">
      <div className="flex flex-col mb-1">
        <label className="text-[10px] font-semibold tracking-widest uppercase text-atelier-ink truncate" title={member.label}>
          {member.label}
        </label>
        <span className="text-[9px] text-atelier-muted uppercase tracking-wide truncate" title={member.role}>
          {member.role}
        </span>
      </div>

      <div
        className={`relative w-full aspect-[3/4] border transition-colors duration-300 flex flex-col items-center justify-center overflow-hidden ${
          member.image
            ? "border-atelier-ink bg-white"
            : "border-atelier-accent bg-atelier-bg hover:border-atelier-muted cursor-pointer"
        }`}
        onClick={() => !member.image && fileInputRef.current?.click()}
      >
        {member.image ? (
          <>
            <img
              src={member.image}
              alt={member.label}
              className="w-full h-full object-cover grayscale transition-all duration-500 hover:grayscale-0"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRemove();
              }}
              className="absolute top-1 right-1 bg-white/90 text-atelier-ink rounded-full w-5 h-5 flex items-center justify-center hover:bg-atelier-ink hover:text-white transition-colors z-10"
            >
              <span className="text-sm leading-none pb-0.5">&times;</span>
            </button>
          </>
        ) : (
          <div className="text-center p-2">
            <span className="block text-xl mb-1 text-atelier-muted">+</span>
            <span className="hidden sm:block text-[8px] text-atelier-muted uppercase tracking-wider">
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
        />
      </div>
    </div>
  );
};