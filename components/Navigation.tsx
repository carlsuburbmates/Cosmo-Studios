import React from 'react';

interface NavigationProps {
  activeTab: 'character' | 'voice' | 'motion';
  setActiveTab: (tab: 'character' | 'voice' | 'motion') => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'character', label: '1. Character Lab' },
    { id: 'voice', label: '2. Voice Lab' },
    { id: 'motion', label: '3. Motion Lab' },
  ] as const;

  return (
    <div className="flex border-b border-atelier-accent bg-white sticky top-0 z-40">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`
            flex-1 py-4 text-xs font-bold uppercase tracking-[0.2em] transition-colors
            ${activeTab === tab.id 
              ? 'bg-atelier-ink text-white' 
              : 'bg-white text-atelier-muted hover:text-atelier-ink hover:bg-gray-50'
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};