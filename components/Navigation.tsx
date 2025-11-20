import React from 'react';

interface NavigationProps {
  activeTab: 'character' | 'voice' | 'motion';
  setActiveTab: (tab: 'character' | 'voice' | 'motion') => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'character', label: 'Character Lab', num: '01' },
    { id: 'voice', label: 'Voice Lab', num: '02' },
    { id: 'motion', label: 'Motion Lab', num: '03' },
  ] as const;

  return (
    <div className="flex items-center justify-center bg-white border-b border-stone-200 flex-none h-14 sticky top-0 z-40 px-2 md:px-4 shadow-sm overflow-hidden">
      <div className="flex bg-stone-100 p-1 rounded-full w-full max-w-xl border border-stone-200 shrink-0 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 py-1.5 px-2 md:px-1 text-[10px] md:text-xs font-bold uppercase tracking-[0.1em] transition-all rounded-full whitespace-nowrap
              ${activeTab === tab.id 
                ? 'bg-white text-atelier-ink shadow-sm border border-stone-100' 
                : 'text-stone-400 hover:text-stone-600'
              }
            `}
          >
            <span className="md:inline hidden mr-1">{tab.num}.</span>
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};