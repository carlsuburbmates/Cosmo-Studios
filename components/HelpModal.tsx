

import React, { useState } from "react";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECTIONS = [
  { id: 'guide', label: 'Quick Start', icon: '✦' },
  { id: 'character', label: '1. Character Lab', icon: '☺' },
  { id: 'voice', label: '2. Voice Lab', icon: '∿' },
  { id: 'motion', label: '3. Motion Lab', icon: '▶' },
  { id: 'troubleshoot', label: 'Troubleshooting', icon: '⚠' },
] as const;

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<typeof SECTIONS[number]['id']>('guide');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-atelier-ink/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl h-[85vh] max-h-[700px] flex flex-col shadow-2xl border border-atelier-ink relative rounded-sm overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-atelier-accent bg-stone-50">
           <div>
              <h2 className="text-xl font-bold tracking-[0.2em] uppercase text-atelier-ink">Studio Manual</h2>
              <p className="text-xs text-atelier-muted uppercase tracking-widest mt-1">Workflow & Documentation v2.5</p>
           </div>
           <button 
             onClick={onClose}
             className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-atelier-accent hover:border-atelier-ink hover:bg-atelier-ink hover:text-white transition-all"
           >
             &times;
           </button>
        </div>

        {/* Layout */}
        <div className="flex flex-1 overflow-hidden">
           {/* Sidebar */}
           <div className="w-16 md:w-56 bg-stone-50 border-r border-atelier-accent flex flex-col py-4">
              {SECTIONS.map(section => (
                 <button
                   key={section.id}
                   onClick={() => setActiveTab(section.id)}
                   className={`
                     group flex items-center gap-3 px-4 md:px-6 py-3 text-left transition-all
                     ${activeTab === section.id ? 'bg-white border-y border-atelier-accent md:border-r-4 md:border-r-atelier-ink' : 'hover:bg-stone-100'}
                   `}
                 >
                    <span className={`text-lg w-6 text-center ${activeTab === section.id ? 'text-atelier-ink' : 'text-atelier-muted'}`}>
                      {section.icon}
                    </span>
                    <span className={`hidden md:block text-[10px] font-bold uppercase tracking-widest ${activeTab === section.id ? 'text-atelier-ink' : 'text-stone-400 group-hover:text-stone-600'}`}>
                      {section.label}
                    </span>
                 </button>
              ))}
           </div>

           {/* Content */}
           <div className="flex-1 overflow-y-auto p-8 md:p-12 font-sans text-atelier-ink bg-white">
              
              {activeTab === 'guide' && (
                  <div className="space-y-8 max-w-2xl">
                      <div>
                        <h3 className="text-2xl font-bold mb-4 tracking-tight">The Workflow</h3>
                        <p className="text-sm leading-relaxed text-gray-600">
                            CosmoStudio is a linear production pipeline designed to generate consistent multi-character assets. 
                            The process moves strictly from left to right: <strong>Design → Voice → Animate</strong>.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                          <div className="flex gap-4 items-start p-4 border border-stone-100 rounded bg-stone-50">
                              <div className="w-8 h-8 flex items-center justify-center bg-white border border-stone-200 rounded font-bold text-xs">01</div>
                              <div>
                                <h4 className="font-bold text-xs uppercase mb-1">Character Lab</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">Define your cast. Generate scenes. <span className="text-atelier-ink font-bold">Approve (✓)</span> the best images to unlock them for animation.</p>
                              </div>
                          </div>
                          <div className="flex gap-4 items-start p-4 border border-stone-100 rounded bg-stone-50">
                              <div className="w-8 h-8 flex items-center justify-center bg-white border border-stone-200 rounded font-bold text-xs">02</div>
                              <div>
                                <h4 className="font-bold text-xs uppercase mb-1">Voice Lab</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">Write a script using standard format (<code>Name: Line</code>). The system automatically assigns unique voices to each character.</p>
                              </div>
                          </div>
                          <div className="flex gap-4 items-start p-4 border border-stone-100 rounded bg-stone-50">
                              <div className="w-8 h-8 flex items-center justify-center bg-white border border-stone-200 rounded font-bold text-xs">03</div>
                              <div>
                                <h4 className="font-bold text-xs uppercase mb-1">Motion Lab</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">Select an Approved Scene. Direct the camera movement. Generate a high-fidelity video clip.</p>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {activeTab === 'character' && (
                  <div className="space-y-8 max-w-2xl">
                      <div>
                          <h3 className="text-xl font-bold mb-2">The Prompt Engine</h3>
                          <p className="text-sm text-gray-600 mb-4">
                              You do not need to describe your characters every time. The engine automatically detects names like "Char1" or "The Hero" and injects their visual reference.
                          </p>
                          <div className="bg-stone-900 text-stone-100 p-4 rounded font-mono text-xs">
                              <span className="text-stone-500">// Good Prompt:</span><br/>
                              Close up of <span className="text-yellow-400">Char1</span> looking stoic in the rain. Cyberpunk lighting.<br/><br/>
                              <span className="text-stone-500">// Bad Prompt:</span><br/>
                              A man with a beard and a scar looking stoic...
                          </div>
                      </div>

                      <hr className="border-stone-100"/>

                      <div>
                          <h3 className="text-xl font-bold mb-2">Tools & QA</h3>
                          <ul className="space-y-3 text-xs text-gray-600">
                              <li className="flex gap-2">
                                <span className="font-bold text-atelier-ink">Consistency Check:</span>
                                Use this to verify if the generated face matches your reference image. A score above 85% is recommended for video.
                              </li>
                              <li className="flex gap-2">
                                <span className="font-bold text-atelier-ink">Smart Edit:</span>
                                Click "Edit" on any image to modify details (e.g., "Add sunglasses") without changing the composition.
                              </li>
                          </ul>
                      </div>
                  </div>
              )}

              {activeTab === 'voice' && (
                  <div className="space-y-8 max-w-2xl">
                      <div>
                          <h3 className="text-xl font-bold mb-2">Script Syntax</h3>
                          <p className="text-sm text-gray-600 mb-4">
                              The Voice Lab parses your text to identify speakers.
                          </p>
                          <div className="bg-stone-50 border border-stone-200 p-4 rounded font-mono text-xs space-y-1">
                              <p>Narrator: The year is 2050.</p>
                              <p>Hero: We have to keep moving.</p>
                              <p>Villain: You cannot escape.</p>
                          </div>
                          <div className="bg-indigo-50 border border-indigo-100 p-4 rounded mt-4">
                            <h4 className="text-xs font-bold text-indigo-900 uppercase mb-1">Pro Tip</h4>
                            <p className="text-[10px] text-indigo-800">
                                Ensure the speaker names match your Cast Member names exactly to see their avatar in the timeline.
                            </p>
                          </div>
                      </div>
                      <hr className="border-stone-100"/>
                      <div>
                        <h3 className="text-xl font-bold mb-2">Expressive Performance</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Add parenthetical tags to your lines to direct the AI's vocal performance and emotional delivery.
                        </p>
                        <div className="bg-stone-50 border border-stone-200 p-4 rounded font-mono text-xs space-y-1">
                            <p>Hero: <span className="text-yellow-500">(shouting)</span> We have to keep moving!</p>
                            <p>Villain: <span className="text-yellow-500">(whispering)</span> You cannot escape.</p>
                            <p>Sidekick: <span className="text-yellow-500">(sadly)</span> I'm not strong enough.</p>
                        </div>
                      </div>
                       <hr className="border-stone-100 mt-8"/>
                       <div>
                        <h3 className="text-xl font-bold mb-2 mt-8">Automated Storyboarding</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Any line in your script that does not have a <code>Speaker:</code> prefix is treated as a scene description. Use the "Generate Storyboard" button to automatically create images for all scene descriptions.
                        </p>
                        <div className="bg-stone-50 border border-stone-200 p-4 rounded font-mono text-xs space-y-1">
                            <p><span className="text-green-600">INT. SPACESHIP - NIGHT</span></p>
                            <p>Hero: We have to keep moving.</p>
                            <p><span className="text-green-600">A shot of the ship moving through an asteroid field.</span></p>
                        </div>
                      </div>
                  </div>
              )}

              {activeTab === 'motion' && (
                  <div className="space-y-8 max-w-2xl">
                      <div>
                          <h3 className="text-xl font-bold mb-2">Video Generation (Veo)</h3>
                          <p className="text-sm text-gray-600 mb-4">
                              Motion generation is the most expensive and time-consuming process. Follow these rules for best results:
                          </p>
                          <ul className="list-decimal list-inside space-y-2 text-xs text-gray-600 font-medium">
                              <li>Only use <span className="text-green-600">Approved</span> images.</li>
                              <li>Keep prompts simple and focused on motion (e.g., "Slow pan right", "Character blinks", "Wind blowing hair").</li>
                              <li>Avoid complex character interactions (e.g., "They start fighting").</li>
                          </ul>
                      </div>
                  </div>
              )}

              {activeTab === 'troubleshoot' && (
                  <div className="space-y-8 max-w-2xl">
                      <div className="grid gap-6">
                          <div>
                             <h3 className="font-bold text-xs uppercase mb-1 text-red-600">Safety Block</h3>
                             <p className="text-sm text-gray-600">
                                 The AI blocks prompts containing violence, hate speech, or copyrighted characters (e.g., "Spider-Man"). 
                                 <br/><strong>Fix:</strong> Use generic terms like "A red superhero" instead.
                             </p>
                          </div>
                          <div>
                             <h3 className="font-bold text-xs uppercase mb-1 text-orange-600">Quota Exceeded (429)</h3>
                             <p className="text-sm text-gray-600">
                                 You are making too many requests too fast. 
                                 <br/><strong>Fix:</strong> Wait 60 seconds and try again.
                             </p>
                          </div>
                          <div>
                             <h3 className="font-bold text-xs uppercase mb-1 text-atelier-ink">Data Persistence</h3>
                             <p className="text-sm text-gray-600">
                                 Projects are stored in your browser. If you clear cache, data is lost.
                                 <br/><strong>Fix:</strong> Regularly use the <span className="font-mono">Export Project</span> button to save a backup <code>.cosmo</code> file.
                             </p>
                          </div>
                      </div>
                  </div>
              )}

           </div>
        </div>
      </div>
    </div>
  );
};