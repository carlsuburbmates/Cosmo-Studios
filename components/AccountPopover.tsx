import React, { useState, useRef, useEffect } from "react";
import { User } from "../types";

interface AccountPopoverProps {
  user: User;
  onLogout: () => void;
  totalCost: number;
}

export const AccountPopover: React.FC<AccountPopoverProps> = ({ user, onLogout, totalCost }) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 rounded-full bg-stone-100 border border-stone-300 flex items-center justify-center font-bold text-atelier-ink hover:ring-2 hover:ring-atelier-ink transition-all"
        aria-label="Account options"
      >
        {getInitials(user.email)}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-atelier-accent shadow-2xl rounded-sm animate-in fade-in slide-in-from-top-2 z-[100]">
            <div className="p-4 border-b border-atelier-accent">
                <p className="text-[10px] uppercase text-atelier-muted tracking-widest">Signed in as</p>
                <p className="text-sm font-bold text-atelier-ink truncate mt-1">{user.email}</p>
            </div>
            <div className="p-4 border-b border-atelier-accent">
                <p className="text-[10px] uppercase text-atelier-muted tracking-widest">Project Cost Estimate</p>
                <p className="text-lg font-mono font-bold text-atelier-ink mt-1">${totalCost.toFixed(4)}</p>
            </div>
            <div className="p-2">
                <button 
                    onClick={() => { onLogout(); setIsOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-red-600 font-bold hover:bg-red-50 rounded-sm"
                >
                    Sign Out
                </button>
            </div>
        </div>
      )}
    </div>
  );
};